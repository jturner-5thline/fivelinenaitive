import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mail, Phone, Calendar, MessageSquare, Plus, Pencil, User, Building2,
  Briefcase, Trash2, X, CheckSquare, MoreHorizontal, ChevronRight, ChevronDown,
  MapPin, Globe, Linkedin, Paperclip, Activity as ActivityIcon, Users, Link2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useContact, useUpdateContact, useContactActivities, useCreateContactActivity,
  useContactDeals, useDeleteContact, useUpdateContactActivity, useDeleteContactActivity,
  useContactAuditLog, LIFECYCLE_STAGES, CONTACT_STATUSES, BUYING_ROLES,
} from '@/hooks/useContacts';
import { ContactTypeSelect } from '@/components/contacts/ContactTypeSelect';
import { ContactTypeMultiSelect } from '@/components/contacts/ContactTypeMultiSelect';
import { LastContactChip } from '@/components/contacts/LastContactChip';
import { EditableField } from '@/components/crm/EditableField';
import { COUNTRY_OPTIONS } from '@/lib/countries';
import { supabase } from '@/integrations/supabase/client';
import {
  useContactCrmCompany, useLinkContactToCompany, useUnlinkContactFromCompany,
  useLinkContactToDeal, useUnlinkContactFromDeal, useAllDeals,
} from '@/hooks/useCrmLinks';
import { useCrmCompanies } from '@/hooks/useCrmCompanies';
import { EntitySearchModal, EntityOption } from '@/components/crm/EntitySearchModal';
import { DeleteConfirmDialog } from '@/components/crm/DeleteConfirmDialog';
import { ContactFieldSuggestions } from '@/components/contacts/ContactFieldSuggestions';
import { DynamicFieldRenderer } from '@/components/crm/DynamicFieldRenderer';
import { ContactTasksCard } from '@/components/contacts/ContactTasksCard';
import { ContactAttachmentsTable } from '@/components/crm/ContactAttachmentsTable';
import { ReferralSourceDocsSection } from '@/components/contacts/ReferralSourceDocsSection';
import { ManageContactFieldsDialog } from '@/components/contacts/ManageContactFieldsDialog';
import { CustomContactFieldsSection } from '@/components/contacts/CustomContactFieldsSection';
import { useContactFieldConfig } from '@/hooks/useContactFieldConfig';
import { useRealtimeInvalidate } from '@/hooks/useRealtimeInvalidate';
import { ClaapCallsSection } from '@/components/claap/ClaapCallsSection';
import { CompanyDomainMatchPrompt } from '@/components/contacts/CompanyDomainMatchPrompt';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { extractEmailDomain, normalizeDomain } from '@/lib/extractEmailDomain';
import { cn } from '@/lib/utils';
import { format, isToday, isThisWeek } from 'date-fns';
import { Loader2, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

interface ContactDetailContentProps {
  contactId: string;
  /** Extra content rendered below the header, e.g. channel context */
  headerExtra?: React.ReactNode;
  /** If true, hides the back button (for modal usage) */
  hideBackButton?: boolean;
  /** Called after successful delete, defaults to navigate('/contacts') */
  onDeleted?: () => void;
}

export function ContactDetailContent({ contactId, headerExtra, hideBackButton, onDeleted }: ContactDetailContentProps) {
  const navigate = useNavigate();
  const { data: contact, isLoading } = useContact(contactId);
  const updateContact = useUpdateContact();
  const { data: activities = [] } = useContactActivities(contactId);
  const createActivity = useCreateContactActivity({ updateCache: true, returnInserted: true });
  const { data: contactDeals = [] } = useContactDeals(contactId);
  const deleteContact = useDeleteContact();
  const teamMembers = useTeamMembers();
  const { data: auditLog = [] } = useContactAuditLog(contactId);
  const [newNote, setNewNote] = useState('');
  const [domainCopied, setDomainCopied] = useState(false);
  const [activityFilter, setActivityFilter] = useState('all');
  const [logDialog, setLogDialog] = useState<{ type: 'call' | 'meeting' } | null>(null);

  const [showLinkCompany, setShowLinkCompany] = useState(false);
  const [showLinkDeal, setShowLinkDeal] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showMoreContactInfo, setShowMoreContactInfo] = useState(false);
  const [showManageFields, setShowManageFields] = useState(false);
  const { config: fieldConfig, isDisabled: isFieldDisabled, isAdmin: isFieldAdmin } = useContactFieldConfig();

  // Keep this contact row live across users/tabs.
  useRealtimeInvalidate({
    table: 'contacts',
    filter: contactId ? `id=eq.${contactId}` : undefined,
    queryKeys: [['contact', contactId], ['contacts']],
    enabled: !!contactId,
  });

  const crmCompanyId = (contact as any)?.crm_company_id;
  const { data: crmCompany } = useContactCrmCompany(crmCompanyId);
  // Defer loading of large lists until the user actually needs them
  // (opens a link modal, or edits the domain field which triggers a match).
  const [needCompanies, setNeedCompanies] = useState(false);
  const [needDeals, setNeedDeals] = useState(false);
  const { data: companiesResult } = useCrmCompanies({ pageSize: 1000, enabled: needCompanies });
  const companies = companiesResult?.data ?? [];
  const { data: deals = [] } = useAllDeals(needDeals);
  const linkToCompany = useLinkContactToCompany();
  const unlinkFromCompany = useUnlinkContactFromCompany();
  const linkToDeal = useLinkContactToDeal();
  const unlinkFromDeal = useUnlinkContactFromDeal();

  // Auto-fill website_url from email domain when missing
  useEffect(() => {
    if (!contact) return;
    if (contact.website_url) return;
    const domain = extractEmailDomain(contact.email);
    if (!domain) return;
    updateContact.mutate({ id: contact.id, website_url: `https://${domain}` } as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.id, contact?.email, contact?.website_url]);

  // Hoist memoized derived values ABOVE the early returns so hook order
  // stays stable across renders (otherwise React throws
  // "Should have a queue" when the contact resolves).
  const latestNote = useMemo(
    () => activities.find((a: any) => a.activity_type === 'note'),
    [activities],
  );
  const filteredActivities = useMemo(
    () => (activityFilter === 'all'
      ? activities
      : activities.filter((a: any) => a.activity_type === activityFilter)),
    [activities, activityFilter],
  );
  const grouped = useMemo(() => {
    const today: any[] = [];
    const thisWeek: any[] = [];
    const earlier: any[] = [];
    for (const a of filteredActivities as any[]) {
      const d = new Date(a.occurred_at);
      if (isToday(d)) today.push(a);
      else if (isThisWeek(d, { weekStartsOn: 1 })) thisWeek.push(a);
      else earlier.push(a);
    }
    return { today, thisWeek, earlier };
  }, [filteredActivities]);

  const companyOptions: EntityOption[] = useMemo(
    () => companies.map(c => ({ id: c.id, label: c.name, sublabel: c.domain || c.industry || undefined })),
    [companies],
  );
  const dealOptions: EntityOption[] = useMemo(
    () => deals.map(d => ({ id: d.id, label: d.company, sublabel: `${d.stage} · $${Number(d.value || 0).toLocaleString()}` })),
    [deals],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-muted-foreground">Contact not found</p>
        {!hideBackButton && <Button variant="outline" onClick={() => navigate('/contacts')}>Back to Contacts</Button>}
      </div>
    );
  }

  const handleQuickUpdate = (field: string, value: any) => {
    updateContact.mutate({ id: contact.id, [field]: value } as any);
  };

  const openLogDialog = (type: 'call' | 'meeting') => {
    setLogDialog({ type });
  };

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    createActivity.mutate({ contact_id: contact.id, activity_type: 'note', subject: 'Note', body: newNote });
    setNewNote('');
    toast.success('Note added');
  };

  const lifecycleColors: Record<string, string> = {
    subscriber: 'bg-muted text-muted-foreground', lead: 'bg-blue-500/10 text-blue-500',
    mql: 'bg-purple-500/10 text-purple-500', sql: 'bg-indigo-500/10 text-indigo-500',
    opportunity: 'bg-amber-500/10 text-amber-500', customer: 'bg-green-500/10 text-green-500',
    evangelist: 'bg-pink-500/10 text-pink-500',
  };

  const owner = teamMembers.find(m => m.id === contact.owner_user_id);
  const ownerName = owner?.display_name || 'Unassigned';
  const initials = `${(contact.first_name?.[0] || '').toUpperCase()}${(contact.last_name?.[0] || '').toUpperCase()}` || 'C';
  const location = [(contact as any).city, (contact as any).state, (contact as any).country].filter(Boolean).join(', ');
  const phonePrimary = contact.phone_mobile || contact.phone_work;
  const latestActivity = activities[0];
  const activeDeal = contactDeals[0];

  return (
    <>
      <div className="flex flex-col">
        {/* Sticky header */}
        <header className="sticky top-0 z-20 -mx-1 px-1 bg-background/95 backdrop-blur border-b">
          <div className="py-3 flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-semibold tracking-tight">{contact.full_name || 'Unnamed Contact'}</h1>
                <Badge className={cn('text-[10px]', lifecycleColors[contact.lifecycle_stage] || 'bg-muted text-muted-foreground')}>
                  {LIFECYCLE_STAGES.find(s => s.value === contact.lifecycle_stage)?.label}
                </Badge>
                {contact.buying_role && (
                  <Badge variant="outline" className="text-[10px]">
                    {BUYING_ROLES.find(r => r.value === contact.buying_role)?.label}
                  </Badge>
                )}
                {contact.contact_score > 0 && <Badge variant="secondary" className="text-[10px]">Score {contact.contact_score}</Badge>}
                {contact.migrated_from_hubspot && <Badge variant="outline" className="text-[10px]">HubSpot</Badge>}
                {!contact.email_opt_in && <Badge variant="destructive" className="text-[10px]">Opted Out</Badge>}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5 truncate">
                {[contact.job_title, crmCompany?.name].filter(Boolean).join(' · ') || 'No title'}
              </p>
              <div className="mt-1">
                <LastContactChip value={(contact as any).last_contact_at} />
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-muted-foreground hidden md:inline">Owner · {ownerName}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-3.5 w-3.5 mr-1" /> Log Activity
                    <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={8} className="w-44">
                  <DropdownMenuItem onClick={() => openLogDialog('call')}>
                    <Phone className="h-3.5 w-3.5 mr-2" /> Log call
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openLogDialog('meeting')}>
                    <Calendar className="h-3.5 w-3.5 mr-2" /> Log meeting
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Link to company or deal">
                    <Link2 className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={8} className="w-44">
                  <DropdownMenuItem onClick={() => { setNeedCompanies(true); setShowLinkCompany(true); }}>
                    <Building2 className="h-3.5 w-3.5 mr-2" /> Link company
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setNeedDeals(true); setShowLinkDeal(true); }}>
                    <Briefcase className="h-3.5 w-3.5 mr-2" /> Link deal
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={8} className="w-44">
                  <DropdownMenuItem onClick={() => {
                    document.getElementById('history')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}>
                    <ActivityIcon className="h-3.5 w-3.5 mr-2" /> View audit trail
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setShowDelete(true)} className="text-destructive focus:text-destructive">
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete contact
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {headerExtra && <div className="pt-3">{headerExtra}</div>}

        {/* Two-column layout: compact left rail + flexible right column */}
        <div
          className="grid gap-5 pt-5 grid-cols-1 lg:[grid-template-columns:minmax(320px,420px)_minmax(0,1fr)] items-start"
        >
          {/* LEFT RAIL — contact profile, core fields, related records, additional details */}
          <aside className="space-y-3 min-w-0 lg:sticky lg:top-32">
            {/* Profile card with all core editable fields */}
            <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3 min-w-0">
              {contact.tags && contact.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {contact.tags.map(tag => <Badge key={tag} variant="outline" className="text-[10px] font-normal">{tag}</Badge>)}
                </div>
              )}
              {/* Core editable fields — single column for tight rail */}
              <div className="space-y-2 text-sm min-w-0">
                <EditableField label="First Name" type="text" value={contact.first_name} onSave={(v) => handleQuickUpdate('first_name', v)} />
                <EditableField label="Last Name" type="text" value={contact.last_name} onSave={(v) => handleQuickUpdate('last_name', v)} />
                {!isFieldDisabled('job_title') && (
                  <EditableField label="Job Title" type="text" value={contact.job_title} onSave={(v) => handleQuickUpdate('job_title', v)} />
                )}

                {/* Company link (read-only display; managed via Related Records) */}
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase mb-1">Company</p>
                  {crmCompany ? (
                    <button
                      onClick={() => navigate(`/crm-companies/${crmCompany.id}`)}
                      className="text-sm text-primary hover:underline truncate text-left w-full"
                    >
                      {crmCompany.name}
                    </button>
                  ) : (
                    <button onClick={() => { setNeedCompanies(true); setShowLinkCompany(true); }} className="text-xs text-muted-foreground hover:text-primary">
                      Link a company
                    </button>
                  )}
                </div>

                <div>
                  <p className="text-[10px] text-muted-foreground uppercase mb-1">Owner</p>
                  <Select
                    value={contact.owner_user_id || 'unassigned'}
                    onValueChange={v => handleQuickUpdate('owner_user_id', v === 'unassigned' ? null : v)}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {teamMembers.map(m => <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {!isFieldDisabled('linkedin_url') && (
                  <EditableField label="LinkedIn" type="url" asLink value={contact.linkedin_url} onSave={(v) => handleQuickUpdate('linkedin_url', v)} placeholder="https://linkedin.com/in/…" />
                )}
                <EditableField label="Work Email" type="email" asLink value={contact.email} onSave={(v) => handleQuickUpdate('email', v)} />
                {!isFieldDisabled('phone_mobile') && (
                  <EditableField label="Mobile" type="tel" value={contact.phone_mobile} onSave={(v) => handleQuickUpdate('phone_mobile', v)} />
                )}
                {!isFieldDisabled('phone_work') && (
                  <EditableField label="Office Phone" type="tel" value={contact.phone_work} onSave={(v) => handleQuickUpdate('phone_work', v)} />
                )}

                {(!isFieldDisabled('city') || !isFieldDisabled('state') || !isFieldDisabled('country')) && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase mb-1">Location</p>
                    {(!isFieldDisabled('city') || !isFieldDisabled('state')) && (
                      <div className="grid grid-cols-2 gap-2">
                        {!isFieldDisabled('city') && (
                          <EditableField label="City" type="text" value={(contact as any).city} onSave={(v) => handleQuickUpdate('city', v)} />
                        )}
                        {!isFieldDisabled('state') && (
                          <EditableField label="State" type="text" value={(contact as any).state} onSave={(v) => handleQuickUpdate('state', v)} />
                        )}
                      </div>
                    )}
                    {!isFieldDisabled('country') && (
                      <div className="mt-2">
                        <EditableField
                          label="Country"
                          type="select"
                          value={(contact as any).country}
                          onSave={(v) => handleQuickUpdate('country', v)}
                          options={COUNTRY_OPTIONS}
                        />
                      </div>
                    )}
                  </div>
                )}

                {!isFieldDisabled('website_url') && (
                <div className="relative group/domain">
                <EditableField
                  label="Domain"
                  type="url"
                  asLink
                  value={normalizeDomain(contact.website_url) ? `https://${normalizeDomain(contact.website_url)}` : ''}
                  onSave={(v) => {
                    const normalized = normalizeDomain(v == null ? '' : String(v)) || null;
                    updateContact.mutate(
                      { id: contact.id, website_url: normalized } as any,
                      {
                        onSuccess: async () => {
                          if (!normalized || crmCompanyId) return;
                          // Targeted lookup — avoid loading the entire companies list.
                          const { data: matches } = await supabase
                            .from('crm_companies')
                            .select('id, domain, additional_domains')
                            .or(`domain.eq.${normalized},additional_domains.cs.{${normalized}}`)
                            .limit(1);
                          const match = matches?.[0];
                          if (match) {
                            linkToCompany.mutate({ contactId: contact.id, companyId: match.id });
                          }
                        },
                      },
                    );
                  }}
                />
                {normalizeDomain(contact.website_url) && (
                  <button
                    type="button"
                    aria-label="Copy domain"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const d = normalizeDomain(contact.website_url);
                      if (!d) return;
                      try {
                        await navigator.clipboard.writeText(d);
                        setDomainCopied(true);
                        toast.success('Domain copied');
                        setTimeout(() => setDomainCopied(false), 1500);
                      } catch {
                        toast.error('Failed to copy');
                      }
                    }}
                    className="absolute top-0 right-0 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover/domain:opacity-100 transition-opacity"
                  >
                    {domainCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                )}
                </div>
                )}

                <div>
                  <p className="text-[10px] text-muted-foreground uppercase mb-1">Contact Type</p>
                  <ContactTypeMultiSelect
                    value={(contact as any).contact_type}
                    onChange={(v) => handleQuickUpdate('contact_type', v)}
                  />
                  {(() => {
                    const STATUS_OPTIONS: Array<{ value: string; label: string; dot: string }> = [
                      { value: 'active', label: 'Active', dot: 'bg-green-500' },
                      { value: 'inactive', label: 'Inactive', dot: 'bg-blue-500' },
                      { value: 'went_dark', label: 'Went Dark', dot: 'bg-yellow-500' },
                      { value: 'do_not_contact', label: 'Do Not Contact', dot: 'bg-red-500' },
                    ];
                    const current = String((contact as any).status || '').toLowerCase();
                    return (
                      <div className="mt-2">
                        <p className="text-[10px] text-muted-foreground uppercase mb-1">Status</p>
                        <Select
                          value={current || 'unset'}
                          onValueChange={(v) => handleQuickUpdate('status', v === 'unset' ? null : v)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Set status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unset">
                              <span className="inline-flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                                No status
                              </span>
                            </SelectItem>
                            {STATUS_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                <span className="inline-flex items-center gap-2">
                                  <span className={cn('h-2 w-2 rounded-full', opt.dot)} />
                                  {opt.label}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })()}
                  {(() => {
                    const types = String((contact as any).contact_type || '')
                      .split(/\s*;\s*/)
                      .map((s) => s.trim().toLowerCase())
                      .filter(Boolean);
                    if (!types.includes('referral source')) return null;
                    return <ReferralSourceDocsSection contact={contact} onUpdate={handleQuickUpdate} />;
                  })()}
                </div>
              </div>
            </div>

            {/* Related Records — compact card */}
            <div className="rounded-lg border border-border/60 bg-card p-3 space-y-3 min-w-0">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Users className="h-3 w-3" /> Related Records
                </p>
              </div>

              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Company</p>
                  <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px]" onClick={() => { setNeedCompanies(true); setShowLinkCompany(true); }}>
                    <Plus className="h-3 w-3 mr-0.5" /> {crmCompany ? 'Change' : 'Link'}
                  </Button>
                </div>
                {crmCompany ? (
                  <button
                    onClick={() => navigate(`/crm-companies/${crmCompany.id}`)}
                    className="w-full flex items-center justify-between p-2 rounded-md border border-border/60 hover:bg-muted/30 text-left transition-colors min-w-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-primary truncate">{crmCompany.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{crmCompany.industry || crmCompany.domain || ''}</p>
                    </div>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); unlinkFromCompany.mutate({ contactId: contact.id, companyId: crmCompany.id }); }}
                      className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted flex-shrink-0"
                    >
                      <X className="h-3 w-3" />
                    </span>
                  </button>
                ) : (
                  <p className="text-[11px] text-muted-foreground">No company linked</p>
                )}
              </div>

              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Deals ({contactDeals.length})</p>
                  <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px]" onClick={() => { setNeedDeals(true); setShowLinkDeal(true); }}>
                    <Plus className="h-3 w-3 mr-0.5" /> Link
                  </Button>
                </div>
                {contactDeals.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">No associated deals</p>
                ) : (
                  <ul className="divide-y divide-border/60 border border-border/60 rounded-md overflow-hidden">
                    {contactDeals.map((cd: any) => (
                      <li key={cd.id} className="flex items-center justify-between gap-2 p-2 hover:bg-muted/30 transition-colors min-w-0">
                        <button onClick={() => navigate(`/deal/${cd.deal?.id}`)} className="flex-1 min-w-0 text-left">
                          <p className="text-xs font-medium text-primary truncate">{cd.deal?.company || 'Deal'}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {cd.deal?.stage || '—'}{cd.deal?.value ? ` · $${Number(cd.deal.value).toLocaleString()}` : ''}
                          </p>
                        </button>
                        <Button variant="ghost" size="icon" className="h-5 w-5 flex-shrink-0" onClick={() => unlinkFromDeal.mutate({ contactId: contact.id, dealId: cd.deal?.id })}>
                          <X className="h-3 w-3" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Additional Details — accordion */}
            <div className="rounded-lg border border-border/60 bg-card px-3 py-1 min-w-0">
              <DetailGroup title="Additional Details">
                <div className="space-y-3 text-sm min-w-0">
                  {isFieldAdmin && (
                    <Button variant="outline" size="sm" className="w-full" onClick={() => setShowManageFields(true)}>
                      <Pencil className="h-3 w-3 mr-1.5" /> Manage fields
                    </Button>
                  )}
                  {!isFieldDisabled('department') && (
                    <EditableField label="Department" type="text" value={contact.department} onSave={(v) => handleQuickUpdate('department', v)} />
                  )}
                  {!isFieldDisabled('timezone') && (
                    <EditableField label="Timezone" type="text" value={contact.timezone} onSave={(v) => handleQuickUpdate('timezone', v)} />
                  )}
                  {!isFieldDisabled('lead_source') && (
                    <EditableField label="Lead Source" type="text" value={contact.lead_source} onSave={(v) => handleQuickUpdate('lead_source', v)} />
                  )}
                  {!isFieldDisabled('source_system') && (
                    <EditableField label="Source System" type="text" value={contact.source_system} onSave={(v) => handleQuickUpdate('source_system', v)} />
                  )}
                  <CustomContactFieldsSection
                    fields={fieldConfig.custom}
                    values={(contact as any).custom_fields || {}}
                    onChange={(_key, nextObj) => handleQuickUpdate('custom_fields', nextObj)}
                  />
                  <div className="pt-1 border-t border-border/40">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Internal Metadata</p>
                    <DynamicFieldRenderer
                      objectType="contact"
                      record={contact}
                      onFieldUpdate={(field, value) => handleQuickUpdate(field, value)}
                    />
                  </div>
                </div>
              </DetailGroup>
            </div>
          </aside>

          {/* RIGHT COLUMN — activity, tasks, notes, attachments, AI */}
          <section className="space-y-4 min-w-0">
            <ContactTasksCard
              contactId={contact.id}
              contactName={contact.full_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Contact'}
              crmCompanyId={(contact as any)?.crm_company_id}
              externalShowCreate={showCreateTask}
              onExternalShowCreateChange={setShowCreateTask}
            />

            {/* Notes */}
            <Section id="notes" title="Notes" icon={MessageSquare}>
              <div className="flex gap-2">
                <Textarea
                  placeholder="Add a note…"
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  className="text-sm min-h-[64px]"
                />
                <Button size="sm" onClick={handleAddNote} disabled={!newNote.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-4 space-y-3">
                {contact.description && (
                  <EditableField
                    label="Pinned"
                    type="textarea"
                    value={contact.description}
                    placeholder="Add notes about this contact…"
                    onSave={(v) => handleQuickUpdate('description', v)}
                  />
                )}
                {activities.filter((a: any) => a.activity_type === 'note').length === 0 && !contact.description ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No notes yet</p>
                ) : (
                  <NotesList notes={activities.filter((a: any) => a.activity_type === 'note')} ownerName={ownerName} />
                )}
              </div>
            </Section>

            {/* Activity Timeline */}
            <Section
              id="activity-timeline"
              title="Activity Timeline"
              icon={ActivityIcon}
              right={
                <Select value={activityFilter} onValueChange={setActivityFilter}>
                  <SelectTrigger className="h-7 text-xs w-[110px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="call">Call</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                    <SelectItem value="note">Note</SelectItem>
                    <SelectItem value="task">Task</SelectItem>
                  </SelectContent>
                </Select>
              }
            >
              {filteredActivities.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No activities yet</p>
              ) : (
                <div className="space-y-6">
                  <ActivityGroup label="Today" items={grouped.today} ownerName={ownerName} />
                  <ActivityGroup label="This Week" items={grouped.thisWeek} ownerName={ownerName} />
                  <ActivityGroup label="Earlier" items={grouped.earlier} ownerName={ownerName} />
                </div>
              )}
              <ClaapCallsSection entityType="contact" entityId={contact.id} entityEmail={contact.email} />
            </Section>

            <ContactFieldSuggestions contactId={contact.id} companyId={(contact as any)?.org_company_id} />

            {/* Attachments */}
            <Section id="attachments" title="Attachments" icon={Paperclip}>
              <ContactAttachmentsTable contactId={contact.id} contactName={contact.full_name || undefined} />
            </Section>

            {/* History / Audit trail */}
            <Section id="history" title="History" icon={ActivityIcon}>
              <ContactAuditTrail entries={auditLog} teamMembers={teamMembers} />
            </Section>
          </section>
        </div>
      </div>

      {/* Modals */}
      <EntitySearchModal
        open={showLinkCompany}
        onClose={() => setShowLinkCompany(false)}
        title="Link to Company"
        placeholder="Search companies..."
        options={companyOptions}
        onConfirm={(ids) => {
          if (ids[0]) {
            linkToCompany.mutate({ contactId: contact.id, companyId: ids[0] }, {
              onSuccess: () => setShowLinkCompany(false),
            });
          }
        }}
        confirming={linkToCompany.isPending}
      />

      <EntitySearchModal
        open={showLinkDeal}
        onClose={() => setShowLinkDeal(false)}
        title="Link to Deal"
        placeholder="Search deals..."
        options={dealOptions}
        multiSelect
        onConfirm={(ids) => {
          Promise.all(ids.map(dealId => linkToDeal.mutateAsync({ contactId: contact.id, dealId })))
            .then(() => setShowLinkDeal(false));
        }}
        confirming={linkToDeal.isPending}
      />

      <DeleteConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        title="Delete Contact"
        description={`Are you sure you want to delete "${contact.full_name || 'this contact'}"? All linked relationships will be removed.`}
        isDeleting={deleteContact.isPending}
        onConfirm={() => {
          deleteContact.mutate(contact.id, {
            onSuccess: () => {
              if (onDeleted) onDeleted();
              else navigate('/contacts');
            },
          });
        }}
      />

      <CompanyDomainMatchPrompt
        contactId={contact.id}
        contactName={contact.full_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'this contact'}
        email={contact.email}
        currentCrmCompanyId={crmCompanyId}
        onLinkRequested={() => { setNeedCompanies(true); setShowLinkCompany(true); }}
      />

      <LogActivityDialog
        type={logDialog?.type ?? null}
        contactId={contact.id}
        contactName={contact.full_name || 'this contact'}
        onOpenChange={(open) => !open && setLogDialog(null)}
      />
      <ManageContactFieldsDialog open={showManageFields} onOpenChange={setShowManageFields} />
    </>
  );
}

function toLocalDateTimeInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function LogActivityDialog({
  type,
  contactId,
  contactName,
  onOpenChange,
}: {
  type: 'call' | 'meeting' | null;
  contactId: string;
  contactName: string;
  onOpenChange: (open: boolean) => void;
}) {
  const createActivity = useCreateContactActivity();
  const [lastType, setLastType] = useState<'call' | 'meeting'>('call');
  const [logSubject, setLogSubject] = useState('');
  const [logBody, setLogBody] = useState('');
  const [logWhen, setLogWhen] = useState<string>('');
  const activeType = type ?? lastType;

  useEffect(() => {
    if (!type) return;
    setLastType(type);
    setLogWhen(toLocalDateTimeInputValue(new Date()));
    setLogSubject(type === 'call' ? 'Call' : 'Meeting');
    setLogBody('');
  }, [type]);

  // Safety-net for a known Radix Dialog + Menu/Select interaction where
  // scroll-lock leaks `pointer-events: none` onto <body>, freezing the page
  // after the log dialog closes. Restore it once the dialog is closed.
  useEffect(() => {
    if (type) return;
    const clear = () => {
      if (document.body.style.pointerEvents === 'none') {
        document.body.style.pointerEvents = '';
      }
    };
    // Poll for ~1.5s to cover Radix's close animation, which can re-apply
    // the scroll lock mid-teardown when a mutation re-renders the parent.
    const iv = window.setInterval(clear, 100);
    const stop = window.setTimeout(() => window.clearInterval(iv), 1500);
    return () => {
      window.clearInterval(iv);
      window.clearTimeout(stop);
      clear();
    };
  }, [type]);

  const submitLogActivity = () => {
    if (!type) return;
    const occurredAt = logWhen ? new Date(logWhen) : new Date();
    const payload = {
      contact_id: contactId,
      activity_type: type,
      subject: logSubject.trim() || (type === 'call' ? 'Call' : 'Meeting'),
      body: logBody.trim() || undefined,
      occurred_at: isNaN(occurredAt.getTime()) ? new Date().toISOString() : occurredAt.toISOString(),
    };
    const label = type === 'call' ? 'Call' : 'Meeting';
    // Close the dialog synchronously so Radix's scroll-lock cleanup runs in
    // the same tick as the click, before the mutation's render churn. Then
    // fire the mutation.
    onOpenChange(false);
    createActivity.mutate(payload, {
      onSuccess: () => toast.success(`${label} logged`),
      onError: (err: any) => toast.error(err?.message || 'Failed to log activity'),
    });
  };

  return (
    <Dialog open={!!type} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Log {activeType === 'call' ? 'call' : 'meeting'}</DialogTitle>
          <DialogDescription>
            Record a {activeType === 'call' ? 'call' : 'meeting'} with {contactName}. Adjust the date/time and add notes as needed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="log-subject" className="text-xs">Subject</Label>
            <Input
              id="log-subject"
              value={logSubject}
              onChange={(e) => setLogSubject(e.target.value)}
              placeholder={activeType === 'call' ? 'e.g. Discovery call' : 'e.g. Kickoff meeting'}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="log-when" className="text-xs">When</Label>
            <Input
              id="log-when"
              type="datetime-local"
              value={logWhen}
              onChange={(e) => setLogWhen(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="log-notes" className="text-xs">Notes</Label>
            <Textarea
              id="log-notes"
              value={logBody}
              onChange={(e) => setLogBody(e.target.value)}
              placeholder="What was discussed, next steps, follow-ups…"
              rows={5}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={createActivity.isPending}>Cancel</Button>
          <Button onClick={submitLogActivity} disabled={createActivity.isPending}>
            {createActivity.isPending ? 'Logging…' : `Log ${activeType === 'call' ? 'call' : 'meeting'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function goAnchor(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function SummaryRow({
  label,
  value,
  href,
  icon: Icon,
}: {
  label: string;
  value?: string | null;
  href?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  if (!value) return null;
  const content = (
    <span className="flex items-center gap-1.5 min-w-0">
      {Icon && <Icon className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
      <span className="truncate">{value}</span>
    </span>
  );
  return (
    <div className="grid grid-cols-[80px_1fr] items-baseline gap-2 text-sm">
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="min-w-0">
        {href ? (
          <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="text-primary hover:underline">
            {content}
          </a>
        ) : content}
      </dd>
    </div>
  );
}

function OverviewBlock({
  title,
  children,
  empty,
  onClick,
}: {
  title: string;
  children?: React.ReactNode;
  empty?: string;
  onClick?: () => void;
}) {
  const isEmpty = !children || (Array.isArray(children) && children.every(c => !c));
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left p-3 rounded-md border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors min-h-[88px] flex flex-col"
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">{title}</p>
      <div className="flex-1 min-w-0">
        {isEmpty && empty ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : children}
      </div>
    </button>
  );
}

function Section({
  id,
  title,
  icon: Icon,
  right,
  children,
}: {
  id: string;
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-32">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-border/60">
        <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground flex items-center gap-2">
          {Icon && <Icon className="h-3.5 w-3.5" />}
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function DetailGroup({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full flex items-center justify-between py-2 text-sm font-medium hover:text-primary transition-colors">
        <span>{title}</span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 pb-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function LabeledSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase mb-1">{label}</p>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>{options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

function ActivityGroup({ label, items, ownerName }: { label: string; items: any[]; ownerName: string }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">{label}</p>
      <ul className="space-y-1">
        {items.map((a) => <ActivityRow key={a.id} activity={a} ownerName={ownerName} />)}
      </ul>
    </div>
  );
}

function ActivityRow({ activity, ownerName }: { activity: any; ownerName: string }) {
  const [open, setOpen] = useState(false);
  const typeIcons: Record<string, any> = { email: Mail, call: Phone, meeting: Calendar, note: MessageSquare };
  const Icon = typeIcons[activity.activity_type] || MessageSquare;
  const hasBody = !!activity.body;
  return (
    <li className="border-b border-border/40 last:border-0">
      <button
        type="button"
        onClick={() => hasBody && setOpen(o => !o)}
        className={cn('w-full flex items-start gap-3 py-2 text-left', hasBody && 'hover:bg-muted/20 transition-colors px-2 -mx-2 rounded')}
      >
        <Icon className="h-3.5 w-3.5 text-muted-foreground mt-1 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium truncate">{activity.subject || activity.activity_type}</p>
            <span className="text-[10px] text-muted-foreground flex-shrink-0">
              {format(new Date(activity.occurred_at), 'MMM d · h:mm a')}
            </span>
          </div>
          {hasBody && !open && <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{activity.body}</p>}
          {hasBody && open && <p className="text-sm text-foreground/80 mt-1 whitespace-pre-wrap">{activity.body}</p>}
          <p className="text-[10px] text-muted-foreground mt-1">{ownerName}</p>
        </div>
      </button>
    </li>
  );
}

function NotesList({ notes, ownerName }: { notes: any[]; ownerName: string }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? notes : notes.slice(0, 5);
  return (
    <>
      <ul className="space-y-1">
        {visible.map((n) => <NoteRow key={n.id} note={n} ownerName={ownerName} />)}
      </ul>
      {notes.length > 5 && (
        <button onClick={() => setShowAll(s => !s)} className="text-xs text-primary hover:underline mt-2">
          {showAll ? 'Show less' : `Show ${notes.length - 5} more notes`}
        </button>
      )}
    </>
  );
}

function NoteRow({ note, ownerName }: { note: any; ownerName: string }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(note.body || '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const updateActivity = useUpdateContactActivity();
  const deleteActivity = useDeleteContactActivity();
  const hasBody = !!note.body;

  const handleSave = () => {
    const next = draft.trim();
    if (!next) return;
    updateActivity.mutate(
      { id: note.id, contact_id: note.contact_id, body: next },
      { onSuccess: () => { setEditing(false); setOpen(true); } },
    );
  };

  const handleDelete = () => {
    deleteActivity.mutate(
      { id: note.id, contact_id: note.contact_id },
      { onSuccess: () => setConfirmDelete(false) },
    );
  };

  return (
    <li className="border-b border-border/40 last:border-0">
      <div className="w-full flex items-start gap-3 py-2 group">
        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground mt-1 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <button
              type="button"
              onClick={() => !editing && hasBody && setOpen(o => !o)}
              className="text-sm font-medium truncate text-left flex-1 min-w-0"
            >
              {note.subject || 'Note'}
            </button>
            <span className="text-[10px] text-muted-foreground flex-shrink-0">
              {format(new Date(note.occurred_at), 'MMM d · h:mm a')}
            </span>
            {!editing && (
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setDraft(note.body || ''); setEditing(true); setOpen(true); }} title="Edit">
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)} title="Delete" disabled={deleteActivity.isPending}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
          {editing ? (
            <div className="mt-1 space-y-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                className="text-sm"
                autoFocus
              />
              <div className="flex items-center gap-2">
                <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={updateActivity.isPending || !draft.trim()}>
                  Save
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setEditing(false); setDraft(note.body || ''); }}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              {hasBody && !open && <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{note.body}</p>}
              {hasBody && open && <p className="text-sm text-foreground/80 mt-1 whitespace-pre-wrap">{note.body}</p>}
            </>
          )}
          <p className="text-[10px] text-muted-foreground mt-1">{ownerName}</p>
        </div>
      </div>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this note?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the note from this contact. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteActivity.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleteActivity.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteActivity.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function formatFieldLabel(field: string | null): string {
  if (!field) return '';
  return field
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncate(value: string | null, max = 120): string {
  if (!value) return '—';
  return value.length > max ? value.slice(0, max) + '…' : value;
}

function ContactAuditTrail({
  entries,
  teamMembers,
}: {
  entries: Array<{ id: string; action: string; field: string | null; old_value: string | null; new_value: string | null; actor_user_id: string | null; created_at: string }>;
  teamMembers: Array<{ id: string; display_name: string }>;
}) {
  const [showAll, setShowAll] = useState(false);
  const nameFor = (uid: string | null) => (uid ? (teamMembers.find(m => m.id === uid)?.display_name || 'Unknown') : 'System');

  if (!entries.length) {
    return <p className="text-sm text-muted-foreground py-6 text-center">No history yet</p>;
  }

  const visible = showAll ? entries : entries.slice(0, 15);

  return (
    <div>
      <ul className="space-y-1">
        {visible.map((e) => {
          const actor = nameFor(e.actor_user_id);
          const when = format(new Date(e.created_at), 'MMM d, yyyy · h:mm a');
          const label = formatFieldLabel(e.field);
          return (
            <li key={e.id} className="border-b border-border/40 last:border-0 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {e.action === 'created' && (
                    <p className="text-sm"><span className="font-medium">{actor}</span> created this contact</p>
                  )}
                  {e.action === 'deleted' && (
                    <p className="text-sm"><span className="font-medium">{actor}</span> deleted this contact</p>
                  )}
                  {e.action === 'updated' && (
                    <>
                      <p className="text-sm">
                        <span className="font-medium">{actor}</span> changed <span className="font-medium">{label}</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <span className="line-through text-muted-foreground/70">{truncate(e.old_value)}</span>
                        <span className="mx-1.5">→</span>
                        <span className="text-foreground/80">{truncate(e.new_value)}</span>
                      </p>
                    </>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground flex-shrink-0 whitespace-nowrap">{when}</span>
              </div>
            </li>
          );
        })}
      </ul>
      {entries.length > 15 && (
        <button onClick={() => setShowAll(s => !s)} className="text-xs text-primary hover:underline mt-2">
          {showAll ? 'Show less' : `Show ${entries.length - 15} more entries`}
        </button>
      )}
    </div>
  );
}
