import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mail, Phone, Calendar, MessageSquare, Plus, Building2, Users,
  Globe, Trash2, X, CheckSquare, Pencil, Upload, MoreHorizontal,
  TrendingUp, AlertTriangle, FileText, Clock,
  Activity as ActivityIcon, Paperclip, Target, ShieldAlert, Link as LinkIcon,
} from 'lucide-react';
import { DynamicFieldRenderer } from '@/components/crm/DynamicFieldRenderer';
import { EditableField } from '@/components/crm/EditableField';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useCrmCompany, useUpdateCrmCompany, useCrmCompanyActivities,
  useCreateCrmCompanyActivity, useCrmCompanyContacts, useCrmSubsidiaries,
  useDeleteCrmCompany, CRM_COMPANY_LIFECYCLES, CRM_COMPANY_STATUSES, CRM_COMPANY_TYPES,
  useUpdateCrmCompanyActivity, useDeleteCrmCompanyActivity,
  useCrmCompanyContactActivities,
} from '@/hooks/useCrmCompanies';
import {
  useCrmCompanyDeals, useLinkContactToCompany, useUnlinkContactFromCompany,
  useLinkDealToCompany, useUnlinkDealFromCompany, useAllDeals,
} from '@/hooks/useCrmLinks';
import { useContacts } from '@/hooks/useContacts';
import { EntitySearchModal, EntityOption } from '@/components/crm/EntitySearchModal';
import { formatSlug } from '@/utils/dealTypeLabels';
import { DeleteConfirmDialog } from '@/components/crm/DeleteConfirmDialog';
import { CreateContactModal } from '@/components/contacts/CreateContactModal';
import { CrmCompanyTasksCard } from '@/components/crm/CrmCompanyTasksCard';
import { InlineQuickAddContact } from '@/components/crm/InlineQuickAddContact';
import { ClaapCallsSection } from '@/components/claap/ClaapCallsSection';
import { CompanyAttachmentsTable } from '@/components/crm/CompanyAttachmentsTable';
import { useCrmCompanyAttachments } from '@/hooks/useCrmCompanyAttachments';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useCompanyFundingSource } from '@/hooks/useCompanyFundingSource';
import { useCompanyAffiliatedDeals } from '@/hooks/useCompanyAffiliatedDeals';
import { formatUSD } from '@/lib/formatters/currency';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface CompanyDetailContentProps {
  companyId: string;
  headerExtra?: React.ReactNode;
  hideBackButton?: boolean;
  onDeleted?: () => void;
}

export function CompanyDetailContent({ companyId, headerExtra, hideBackButton, onDeleted }: CompanyDetailContentProps) {
  const navigate = useNavigate();
  const { data: company, isLoading } = useCrmCompany(companyId);
  const update = useUpdateCrmCompany();
  const { data: activities = [] } = useCrmCompanyActivities(companyId);
  const createActivity = useCreateCrmCompanyActivity();
  const updateActivity = useUpdateCrmCompanyActivity();
  const deleteActivity = useDeleteCrmCompanyActivity();
  const { data: contacts = [] } = useCrmCompanyContacts(companyId);
  const contactIds = contacts.map((c: any) => c.id);
  const { data: contactActivities = [] } = useCrmCompanyContactActivities(contactIds);
  const { data: subsidiaries = [] } = useCrmSubsidiaries(companyId);
  const { data: companyDeals = [] } = useCrmCompanyDeals(companyId);
  const { data: affiliatedDeals = [] } = useCompanyAffiliatedDeals(companyId, contactIds);
  const deleteCompany = useDeleteCrmCompany();
  const teamMembers = useTeamMembers();
  const { data: allContactsResult } = useContacts({ pageSize: 1000 });
  const allContacts = allContactsResult?.data ?? [];
  const { data: allDeals = [] } = useAllDeals();
  const linkContact = useLinkContactToCompany();
  const unlinkContact = useUnlinkContactFromCompany();
  const linkDeal = useLinkDealToCompany();
  const unlinkDeal = useUnlinkDealFromCompany();
  const { attachments } = useCrmCompanyAttachments(companyId);
  const { data: fundingSource } = useCompanyFundingSource(companyId, company?.name, (company as any)?.domain);

  const [newNote, setNewNote] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteBody, setEditingNoteBody] = useState('');
  const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [activityFilter, setActivityFilter] = useState('all');
  const [showLinkContact, setShowLinkContact] = useState(false);
  const [showCreateContact, setShowCreateContact] = useState(false);
  const [showLinkDeal, setShowLinkDeal] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const autoNameAttemptedRef = useRef<string | null>(null);

  // Auto-resolve the real company name from the website when the current name
  // looks like a placeholder derived from the domain (e.g. "Cchgd" for cchgd.com).
  useEffect(() => {
    if (!company?.id || !company.domain || !company.name) return;
    if (autoNameAttemptedRef.current === company.id) return;

    const cleanDomain = company.domain
      .toLowerCase()
      .replace(/^(https?:\/\/)?(www\.)?/, '')
      .replace(/\/.*$/, '')
      .trim();
    if (!cleanDomain) return;
    const domainStem = cleanDomain.split('.')[0];
    const nameLower = company.name.trim().toLowerCase();
    const looksLikePlaceholder =
      nameLower === domainStem ||
      nameLower === cleanDomain ||
      nameLower.replace(/[^a-z0-9]/g, '') === domainStem.replace(/[^a-z0-9]/g, '');
    if (!looksLikePlaceholder) return;

    autoNameAttemptedRef.current = company.id;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('scrape-company-info', {
          body: { url: cleanDomain },
        });
        if (error) return;
        const resolved = (data as any)?.data?.companyName;
        if (!resolved || typeof resolved !== 'string') return;
        const trimmed = resolved.trim();
        if (!trimmed || trimmed.toLowerCase() === nameLower) return;
        update.mutate(
          { id: company.id, name: trimmed } as any,
          {
            onSuccess: () => toast.success(`Company name updated to "${trimmed}"`),
          }
        );
      } catch {
        // Silent — leave the placeholder name in place.
      }
    })();
  }, [company?.id, company?.domain, company?.name, update]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!company) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-muted-foreground">Company not found</p>
        {!hideBackButton && (
          <Button variant="outline" onClick={() => navigate('/crm-companies')}>Back</Button>
        )}
      </div>
    );
  }

  const handleQuickUpdate = (field: string, value: any) =>
    update.mutate({ id: company.id, [field]: value } as any);

  const handleLogActivity = (type: string) => {
    createActivity.mutate({
      crm_company_id: company.id,
      activity_type: type,
      subject: `${type.charAt(0).toUpperCase() + type.slice(1)} logged`,
    });
    toast.success(`${type} logged`);
  };

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    createActivity.mutate({
      crm_company_id: company.id,
      activity_type: 'note',
      subject: 'Note',
      body: newNote,
    });
    setNewNote('');
    toast.success('Note added');
  };

  // Merge company-level activities with call/meeting touchpoints logged on
  // linked contacts (from the Contacts page). Prefix the subject with the
  // contact name so the source is obvious in the timeline.
  const contactNameById = new Map<string, string>(
    contacts.map((c: any) => [
      c.id,
      c.full_name || `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || c.email || 'Contact',
    ]),
  );
  const contactSourced = (contactActivities as any[]).map((a) => ({
    ...a,
    _source: 'contact' as const,
    subject: `${contactNameById.get(a.contact_id) ?? 'Contact'} · ${a.subject || (a.activity_type === 'call' ? 'Call logged' : 'Meeting logged')}`,
  }));
  const mergedActivities = [...(activities as any[]), ...contactSourced].sort((a, b) => {
    const ta = new Date(a.occurred_at).getTime();
    const tb = new Date(b.occurred_at).getTime();
    return tb - ta;
  });
  const filteredActivities = activityFilter === 'all'
    ? mergedActivities
    : mergedActivities.filter((a: any) => a.activity_type === activityFilter);

  const formatCurrency = (v: number | null | undefined) =>
    v != null ? `$${Number(v).toLocaleString()}` : '—';

  const lifecycleColors: Record<string, string> = {
    target: 'bg-muted text-muted-foreground',
    engaged: 'bg-blue-500/10 text-blue-600',
    opportunity: 'bg-amber-500/10 text-amber-600',
    customer: 'bg-emerald-500/10 text-emerald-600',
    expansion: 'bg-purple-500/10 text-purple-600',
    churn_risk: 'bg-red-500/10 text-red-600',
  };

  const linkedContactIds = new Set(contacts.map((c: any) => c.id));
  const contactOptions: EntityOption[] = allContacts
    .filter(c => !linkedContactIds.has(c.id))
    .map(c => ({
      id: c.id,
      label: c.full_name || `${c.first_name} ${c.last_name}`,
      sublabel: c.email || c.job_title || undefined,
    }));

  const linkedDealIds = new Set(companyDeals.map((d: any) => d.id));
  const dealOptions: EntityOption[] = allDeals
    .filter(d => !linkedDealIds.has(d.id))
    .map(d => ({
      id: d.id,
      label: d.company,
      sublabel: `${d.stage} · $${Number(d.value || 0).toLocaleString()}`,
    }));

  const owner = teamMembers.find(m => m.id === company.owner_user_id);
  const lastActivity = mergedActivities[0];
  const lifecycleLabel = CRM_COMPANY_LIFECYCLES.find(l => l.value === company.lifecycle_stage)?.label;
  const statusLabel = CRM_COMPANY_STATUSES.find(s => s.value === company.status)?.label;
  const typeLabel = CRM_COMPANY_TYPES.find(t => t.value === company.company_type)?.label;
  const health: { label: string; cls: string } =
    company.lifecycle_stage === 'churn_risk'
      ? { label: 'At risk', cls: 'bg-red-500/10 text-red-600 border-red-500/30' }
      : company.lifecycle_stage === 'customer' || company.lifecycle_stage === 'expansion'
        ? { label: 'Healthy', cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' }
        : { label: 'Monitoring', cls: 'bg-amber-500/10 text-amber-600 border-amber-500/30' };

  const noteActivities = activities.filter((a: any) => a.activity_type === 'note');

  const missingChecks = [
    { key: 'industry', label: 'Industry' },
    { key: 'annual_revenue', label: 'Annual revenue' },
    { key: 'employee_count', label: 'Employee count' },
    { key: 'hq_country', label: 'HQ country' },
    { key: 'domain', label: 'Domain' },
    { key: 'owner_user_id', label: 'Owner' },
  ];
  const missingFields = missingChecks.filter(c => !(company as any)[c.key]);

  const subtitleBits = [
    company.industry,
    typeLabel,
    [company.hq_city, company.hq_country].filter(Boolean).join(', ') || null,
  ].filter(Boolean) as string[];

  const ANCHORS = [
    { id: 'overview', label: 'Overview' },
    { id: 'contacts', label: 'Contacts' },
    { id: 'financials', label: 'Financials' },
    { id: 'attachments', label: 'Attachments' },
    { id: 'notes', label: 'Notes' },
    { id: 'activity', label: 'Activity' },
  ];

  const goAnchor = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleUploadClick = () => {
    goAnchor('attachments');
    setTimeout(() => {
      const section = document.getElementById('attachments');
      const input = section?.querySelector<HTMLInputElement>('input[type="file"]');
      input?.click();
    }, 250);
  };

  return (
    <>
      <div className="space-y-4">
        {/* Compact Header */}
        <div className="rounded-lg border bg-card px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              {company.logo_url ? (
                <img src={company.logo_url} alt="" className="h-11 w-11 rounded-md object-contain border bg-background" />
              ) : (
                <div className="h-11 w-11 rounded-md bg-muted flex items-center justify-center text-foreground text-sm font-semibold border">
                  {company.name?.[0] ?? '?'}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg font-semibold truncate">{company.name}</h1>
                  {fundingSource && (
                    <Badge
                      variant="outline"
                      className="text-[10px] font-normal border-emerald-500/40 bg-emerald-500/10 text-emerald-300 cursor-pointer"
                      onClick={() => navigate(`/lenders?lender=${fundingSource.id}`)}
                    >
                      Funding Source
                    </Badge>
                  )}
                  {company.migrated_from_hubspot && (
                    <Badge variant="outline" className="text-[10px] font-normal">HubSpot</Badge>
                  )}
                </div>
                {subtitleBits.length > 0 && (
                  <p className="text-xs text-muted-foreground truncate">{subtitleBits.join(' · ')}</p>
                )}
                <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                  {lifecycleLabel && (
                    <Badge className={cn('text-[10px] font-normal border-transparent', lifecycleColors[company.lifecycle_stage] || 'bg-muted text-foreground')}>
                      {lifecycleLabel}
                    </Badge>
                  )}
                  <Badge variant="outline" className={cn('text-[10px] font-normal', health.cls)}>{health.label}</Badge>
                  {statusLabel && <Badge variant="outline" className="text-[10px] font-normal">{statusLabel}</Badge>}
                  {company.customer_tier && (
                    <Badge variant="secondary" className="text-[10px] font-normal">Tier {company.customer_tier}</Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setEditOpen(v => !v)}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit Company
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => goAnchor('notes')}>
                <MessageSquare className="h-3.5 w-3.5 mr-1" /> Add Note
              </Button>
              <Button size="sm" className="h-8 text-xs" onClick={handleUploadClick}>
                <Upload className="h-3.5 w-3.5 mr-1" /> Upload Attachment
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="outline" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => setShowDelete(true)} className="text-destructive focus:text-destructive">
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete company
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" /> Owner: <span className="text-foreground">{owner?.display_name ?? 'Unassigned'}</span>
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> Updated <span className="text-foreground">{company.updated_at ? format(new Date(company.updated_at), 'MMM d, yyyy') : '—'}</span>
            </span>
            <span className="flex items-center gap-1">
              <ActivityIcon className="h-3 w-3" /> Last touchpoint <span className="text-foreground">{lastActivity ? format(new Date(lastActivity.occurred_at), 'MMM d, yyyy') : '—'}</span>
            </span>
            {company.domain && (
              <span className="flex items-center gap-1"><Globe className="h-3 w-3" /> {company.domain}</span>
            )}
          </div>
        </div>

        {headerExtra}

        {editOpen && (
          <Card className="border-border/70">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Edit Company</CardTitle>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditOpen(false)}>Done</Button>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
              <EditableField label="Name" type="text" value={company.name} onSave={(v) => handleQuickUpdate('name', v)} />
              <EditableField label="Type" type="select" value={company.company_type} options={CRM_COMPANY_TYPES.map(t => ({ value: t.value, label: t.label }))} onSave={(v) => handleQuickUpdate('company_type', v)} />
              <EditableField label="Industry" type="text" value={company.industry} onSave={(v) => handleQuickUpdate('industry', v)} />
              <EditableField label="Sub-Industry" type="text" value={company.sub_industry} onSave={(v) => handleQuickUpdate('sub_industry', v)} />
              <EditableField label="Employee Range" type="text" value={company.employee_range} onSave={(v) => handleQuickUpdate('employee_range', v)} />
              <EditableField label="Employee Count" type="number" value={company.employee_count} onSave={(v) => handleQuickUpdate('employee_count', v)} />
              <EditableField label="Annual Revenue" type="number" value={company.annual_revenue} onSave={(v) => handleQuickUpdate('annual_revenue', v)} />
              <EditableField label="Phone" type="tel" value={company.phone} onSave={(v) => handleQuickUpdate('phone', v)} />
              <EditableField label="Email" type="email" asLink value={company.main_contact_email} onSave={(v) => handleQuickUpdate('main_contact_email', v)} />
              <EditableField label="Domain" type="text" value={(company as any).domain} onSave={(v) => handleQuickUpdate('domain', v)} />
              <EditableField label="LinkedIn" type="url" asLink value={company.linkedin_url} onSave={(v) => handleQuickUpdate('linkedin_url', v)} />
              <EditableField label="HQ City" type="text" value={(company as any).hq_city} onSave={(v) => handleQuickUpdate('hq_city', v)} />
              <EditableField label="HQ Country" type="text" value={(company as any).hq_country} onSave={(v) => handleQuickUpdate('hq_country', v)} />
              <EditableField label="HQ Address" type="textarea" value={company.hq_address} onSave={(v) => handleQuickUpdate('hq_address', v)} />
              <EditableField label="Segment" type="text" value={company.segment} onSave={(v) => handleQuickUpdate('segment', v)} />
              <EditableField label="Tier" type="text" value={company.customer_tier} onSave={(v) => handleQuickUpdate('customer_tier', v)} />
              <EditableField label="Source" type="text" value={company.source_system} onSave={(v) => handleQuickUpdate('source_system', v)} />
              <EditableField label="Description" type="textarea" value={company.description} placeholder="Add a company description…" onSave={(v) => handleQuickUpdate('description', v)} />
              <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase mb-1">Lifecycle Stage</p>
                  <Select value={company.lifecycle_stage} onValueChange={v => handleQuickUpdate('lifecycle_stage', v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{CRM_COMPANY_LIFECYCLES.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase mb-1">Status</p>
                  <Select value={company.status} onValueChange={v => handleQuickUpdate('status', v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{CRM_COMPANY_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase mb-1">Owner</p>
                  <Select
                    value={company.owner_user_id || 'unassigned'}
                    onValueChange={v => handleQuickUpdate('owner_user_id', v === 'unassigned' ? null : v)}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {teamMembers.map(m => <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="md:col-span-3">
                <DynamicFieldRenderer
                  objectType="company"
                  record={company}
                  onFieldUpdate={(field, value) => handleQuickUpdate(field, value)}
                />
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-12 gap-4">
          {/* Main */}
          <div className="col-span-12 lg:col-span-8 space-y-4 min-w-0">
            {/* 1. Snapshot */}
            <Card id="overview" className="border-border/70 scroll-mt-24">
              <CardHeader className="pb-2 border-b">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-muted-foreground" /> Company Snapshot
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-3 space-y-3">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {company.description || 'No internal summary yet — use Edit Company to add a short brief about positioning, traction, and current status.'}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 pt-2 border-t">
                  <KV label="Industry" value={company.industry} />
                  <KV label="Sub-industry" value={company.sub_industry} />
                  <KV label="Type" value={typeLabel} />
                  <KV label="Segment" value={company.segment} />
                  <KV label="Employees" value={company.employee_count?.toLocaleString() || company.employee_range} />
                  <KV label="HQ" value={[company.hq_city, company.hq_country].filter(Boolean).join(', ')} />
                  <KV label="Domain" value={company.domain} link />
                  <KV label="Phone" value={company.phone} />
                  <KV label="Primary email" value={company.main_contact_email} />
                </div>
              </CardContent>
            </Card>

            {/* Recent Notes */}
            <Card id="notes" className="border-border/70 scroll-mt-24">
              <CardHeader className="pb-2 border-b flex flex-row items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" /> Recent Notes
                </CardTitle>
                <Button size="sm" variant="link" className="h-7 text-xs" onClick={() => goAnchor('activity')}>View all</Button>
              </CardHeader>
              <CardContent className="pt-3 space-y-3">
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Add a note…"
                    value={newNote}
                    onChange={e => setNewNote(e.target.value)}
                    className="text-sm min-h-[60px]"
                  />
                  <Button size="sm" onClick={handleAddNote} disabled={!newNote.trim()}><Plus className="h-4 w-4" /></Button>
                </div>
                {noteActivities.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">No notes yet.</p>
                ) : (
                  <ul className="divide-y divide-border/40">
                    {noteActivities.slice(0, 3).map((a: any) => (
                      <li key={a.id} className="py-2">
                        {editingNoteId === a.id ? (
                          <div className="space-y-2">
                            <Textarea
                              value={editingNoteBody}
                              onChange={e => setEditingNoteBody(e.target.value)}
                              className="text-sm min-h-[60px]"
                            />
                            <div className="flex gap-2 justify-end">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => { setEditingNoteId(null); setEditingNoteBody(''); }}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                className="h-7 text-xs"
                                disabled={!editingNoteBody.trim() || updateActivity.isPending}
                                onClick={() => {
                                  updateActivity.mutate(
                                    { id: a.id, crm_company_id: company.id, body: editingNoteBody },
                                    {
                                      onSuccess: () => {
                                        setEditingNoteId(null);
                                        setEditingNoteBody('');
                                        toast.success('Note updated');
                                      },
                                      onError: (err: any) => toast.error(err?.message || 'Failed to update note'),
                                    }
                                  );
                                }}
                              >
                                Save
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="group flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm whitespace-pre-wrap break-words">{a.body || a.subject}</p>
                              <p className="text-[10px] text-muted-foreground mt-1">
                                {format(new Date(a.occurred_at), 'MMM d, yyyy · h:mm a')}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => {
                                  setEditingNoteId(a.id);
                                  setEditingNoteBody(a.body || a.subject || '');
                                }}
                                aria-label="Edit note"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-destructive hover:text-destructive"
                                onClick={() => {
                                  setDeleteNoteId(a.id);
                                }}
                                aria-label="Delete note"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* 8. Activity Timeline */}
            <Card id="activity" className="border-border/70 scroll-mt-24">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <ActivityIcon className="h-4 w-4 text-muted-foreground" /> Activity Timeline
                  </CardTitle>
                  <Select value={activityFilter} onValueChange={setActivityFilter}>
                    <SelectTrigger className="h-7 text-[10px] w-[100px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="call">Call</SelectItem>
                      <SelectItem value="meeting">Meeting</SelectItem>
                      <SelectItem value="note">Note</SelectItem>
                      <SelectItem value="task">Task</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[600px]">
                  {filteredActivities.length === 0 ? (
                    <p className="text-center text-muted-foreground text-sm py-8">No activities yet</p>
                  ) : (
                    <div className="space-y-3">
                      {filteredActivities.map((activity: any) => {
                        const icons: Record<string, any> = {
                          email: Mail, call: Phone, meeting: Calendar, note: MessageSquare,
                        };
                        const Icon = icons[activity.activity_type] || MessageSquare;
                        return (
                          <div key={activity.id} className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground mt-1 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{activity.subject || activity.activity_type}</p>
                              {activity.body && <p className="text-xs text-muted-foreground mt-0.5">{activity.body}</p>}
                              <p className="text-[10px] text-muted-foreground mt-1">
                                {format(new Date(activity.occurred_at), 'MMM d, yyyy · h:mm a')}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            <ClaapCallsSection
              entityType="company"
              entityId={company.id}
              entityName={company.name}
              entityDomain={(company as any)?.domain}
              contactIds={contacts.map((c: any) => c.id)}
            />
          </div>

          {/* Right sticky sidebar */}
          <aside className="col-span-12 lg:col-span-4 space-y-4">
            <div className="lg:sticky lg:top-12 space-y-4">
              {/* Tasks */}
              <CrmCompanyTasksCard
                companyId={company.id}
                companyName={company.name}
                externalShowCreate={showCreateTask}
                onExternalShowCreateChange={setShowCreateTask}
              />

              {/* Contacts */}
              <Card id="contacts" className="border-border/70 scroll-mt-24">
                <CardHeader className="pb-2 border-b flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-muted-foreground" /> Contacts
                    <Badge variant="secondary" className="text-[10px] font-normal ml-1">{contacts.length}</Badge>
                  </CardTitle>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setShowCreateContact(true)}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </CardHeader>
                <CardContent className="pt-3">
                  {contacts.length === 0 ? (
                    <div className="py-4 text-center text-xs text-muted-foreground">
                      No contacts yet.
                      <div className="mt-2">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowLinkContact(true)}>
                          <LinkIcon className="h-3 w-3 mr-1" /> Link existing
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <ul className="space-y-1.5">
                      {contacts.slice(0, 6).map((c: any) => (
                        <li key={c.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 hover:bg-muted/30">
                          <button className="text-left min-w-0 flex-1" onClick={() => navigate(`/contacts/${c.id}`)}>
                            <p className="text-xs font-medium text-primary hover:underline truncate">{c.full_name || '—'}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{c.job_title || c.email || '—'}</p>
                          </button>
                          <div className="flex items-center gap-0.5 shrink-0">
                            {c.email && (
                              <a href={`mailto:${c.email}`} className="text-muted-foreground hover:text-foreground p-1"><Mail className="h-3 w-3" /></a>
                            )}
                            <Button
                              variant="ghost" size="icon" className="h-5 w-5"
                              onClick={() => unlinkContact.mutate({ contactId: c.id, companyId: company.id })}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              {/* Attachments — dedicated module (sidebar width) */}
              <CompanyAttachmentsTable crmCompanyId={company.id} companyName={company.name} />

            </div>
          </aside>
        </div>
      </div>

      {/* Modals */}
      <EntitySearchModal
        open={showLinkContact}
        onClose={() => setShowLinkContact(false)}
        title="Link Contact to Company"
        placeholder="Search contacts..."
        options={contactOptions}
        multiSelect
        onConfirm={(ids) => {
          Promise.all(ids.map(contactId => linkContact.mutateAsync({ contactId, companyId: company.id })))
            .then(() => setShowLinkContact(false));
        }}
        confirming={linkContact.isPending}
      />

      <CreateContactModal
        open={showCreateContact}
        onClose={() => setShowCreateContact(false)}
        defaultCompanyId={company.id}
      />

      <EntitySearchModal
        open={showLinkDeal}
        onClose={() => setShowLinkDeal(false)}
        title="Link Deal to Company"
        placeholder="Search deals..."
        options={dealOptions}
        multiSelect
        onConfirm={(ids) => {
          Promise.all(ids.map(dealId => linkDeal.mutateAsync({ dealId, companyId: company.id })))
            .then(() => setShowLinkDeal(false));
        }}
        confirming={linkDeal.isPending}
      />

      <DeleteConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        title="Delete Company"
        description={`Are you sure you want to delete "${company.name}"? Contacts and deals will be unlinked but not deleted.`}
        isDeleting={deleteCompany.isPending}
        onConfirm={() => {
          deleteCompany.mutate(company.id, {
            onSuccess: () => {
              if (onDeleted) onDeleted();
              else navigate('/crm-companies');
            },
          });
        }}
      />

      <AlertDialog open={!!deleteNoteId} onOpenChange={(o) => !o && setDeleteNoteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete note?</AlertDialogTitle>
            <AlertDialogDescription>
              This note will be permanently removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteActivity.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteActivity.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (!deleteNoteId) return;
                deleteActivity.mutate(
                  { id: deleteNoteId, crm_company_id: company.id },
                  {
                    onSuccess: () => { setDeleteNoteId(null); toast.success('Note deleted'); },
                    onError: (err: any) => toast.error(err?.message || 'Failed to delete note'),
                  }
                );
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function KV({ label, value, link }: { label: string; value: string | null | undefined; link?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      {link && value ? (
        <a
          href={value.startsWith('http') ? value : `https://${value}`}
          target="_blank" rel="noreferrer"
          className="text-sm text-primary hover:underline truncate block"
        >
          {value}
        </a>
      ) : (
        <p className="text-sm truncate">{value || '—'}</p>
      )}
    </div>
  );
}

function Kpi({
  label, value, hint, valueClassName,
}: { label: string; value: string; hint?: string; valueClassName?: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('text-base font-semibold mt-0.5 truncate', valueClassName)}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

function Workflow({
  label, value, tone,
}: { label: string; value: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn(
        'text-sm font-medium mt-0.5 truncate',
        tone === 'warn' ? 'text-amber-600' : tone === 'ok' ? 'text-emerald-600' : '',
      )}>{value}</p>
    </div>
  );
}