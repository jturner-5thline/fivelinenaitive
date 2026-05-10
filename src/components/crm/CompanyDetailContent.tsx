import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Phone, Calendar, MessageSquare, Plus, ExternalLink, Building2, Users, Briefcase, Globe, MapPin, Trash2, X, CheckSquare } from 'lucide-react';
import { DynamicFieldRenderer } from '@/components/crm/DynamicFieldRenderer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { useCrmCompany, useUpdateCrmCompany, useCrmCompanyActivities, useCreateCrmCompanyActivity, useCrmCompanyContacts, useCrmSubsidiaries, useDeleteCrmCompany, CRM_COMPANY_LIFECYCLES, CRM_COMPANY_STATUSES, CRM_COMPANY_TYPES } from '@/hooks/useCrmCompanies';
import { useCrmCompanyDeals, useLinkContactToCompany, useUnlinkContactFromCompany, useLinkDealToCompany, useUnlinkDealFromCompany, useAllDeals } from '@/hooks/useCrmLinks';
import { useContacts } from '@/hooks/useContacts';
import { EntitySearchModal, EntityOption } from '@/components/crm/EntitySearchModal';
import { formatSlug } from '@/utils/dealTypeLabels';
import { DeleteConfirmDialog } from '@/components/crm/DeleteConfirmDialog';
import { CreateContactModal } from '@/components/contacts/CreateContactModal';
import { CrmCompanyTasksCard } from '@/components/crm/CrmCompanyTasksCard';
import { InlineQuickAddContact } from '@/components/crm/InlineQuickAddContact';
import { ClaapCallsSection } from '@/components/claap/ClaapCallsSection';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface CompanyDetailContentProps {
  companyId: string;
  /** Extra content rendered below the header */
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
  const { data: contacts = [] } = useCrmCompanyContacts(companyId);
  const { data: subsidiaries = [] } = useCrmSubsidiaries(companyId);
  const { data: companyDeals = [] } = useCrmCompanyDeals(companyId);
  const deleteCompany = useDeleteCrmCompany();
  const { data: allContactsResult } = useContacts({ pageSize: 1000 });
  const allContacts = allContactsResult?.data ?? [];
  const { data: allDeals = [] } = useAllDeals();
  const linkContact = useLinkContactToCompany();
  const unlinkContact = useUnlinkContactFromCompany();
  const linkDeal = useLinkDealToCompany();
  const unlinkDeal = useUnlinkDealFromCompany();

  const [newNote, setNewNote] = useState('');
  const [activityFilter, setActivityFilter] = useState('all');
  const [showLinkContact, setShowLinkContact] = useState(false);
  const [showCreateContact, setShowCreateContact] = useState(false);
  const [showLinkDeal, setShowLinkDeal] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);

  if (isLoading) return <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!company) return <div className="flex flex-col items-center justify-center py-24 gap-4"><p className="text-muted-foreground">Company not found</p>{!hideBackButton && <Button variant="outline" onClick={() => navigate('/crm-companies')}>Back</Button>}</div>;

  const handleQuickUpdate = (field: string, value: any) => update.mutate({ id: company.id, [field]: value } as any);
  const handleLogActivity = (type: string) => {
    createActivity.mutate({ crm_company_id: company.id, activity_type: type, subject: `${type.charAt(0).toUpperCase() + type.slice(1)} logged` });
    toast.success(`${type} logged`);
  };
  const handleAddNote = () => {
    if (!newNote.trim()) return;
    createActivity.mutate({ crm_company_id: company.id, activity_type: 'note', subject: 'Note', body: newNote });
    setNewNote('');
    toast.success('Note added');
  };

  const filteredActivities = activityFilter === 'all' ? activities : activities.filter((a: any) => a.activity_type === activityFilter);
  const formatCurrency = (v: number | null) => v != null ? `$${v.toLocaleString()}` : '—';

  const lifecycleColors: Record<string, string> = {
    target: 'bg-muted text-muted-foreground', engaged: 'bg-blue-500/10 text-blue-500',
    opportunity: 'bg-amber-500/10 text-amber-500', customer: 'bg-green-500/10 text-green-500',
    expansion: 'bg-purple-500/10 text-purple-500', churn_risk: 'bg-red-500/10 text-red-500',
  };

  const linkedContactIds = new Set(contacts.map((c: any) => c.id));
  const contactOptions: EntityOption[] = allContacts
    .filter(c => !linkedContactIds.has(c.id))
    .map(c => ({ id: c.id, label: c.full_name || `${c.first_name} ${c.last_name}`, sublabel: c.email || c.job_title || undefined }));

  const linkedDealIds = new Set(companyDeals.map((d: any) => d.id));
  const dealOptions: EntityOption[] = allDeals
    .filter(d => !linkedDealIds.has(d.id))
    .map(d => ({ id: d.id, label: d.company, sublabel: `${d.stage} · $${Number(d.value || 0).toLocaleString()}` }));

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            {company.logo_url ? (
              <img src={company.logo_url} alt="" className="h-14 w-14 rounded-lg object-contain border" />
            ) : (
              <div className="h-14 w-14 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-xl font-bold">{company.name[0]}</div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{company.name}</h1>
                {company.migrated_from_hubspot && <Badge variant="outline" className="text-[10px]">HubSpot</Badge>}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {company.domain && <span className="flex items-center gap-1"><Globe className="h-3 w-3" /> {company.domain}</span>}
                {(company.hq_city || company.hq_country) && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {[company.hq_city, company.hq_country].filter(Boolean).join(', ')}</span>}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Badge className={cn('text-[10px]', lifecycleColors[company.lifecycle_stage] || '')}>{CRM_COMPANY_LIFECYCLES.find(l => l.value === company.lifecycle_stage)?.label}</Badge>
                {company.segment && <Badge variant="outline" className="text-[10px]">{company.segment}</Badge>}
                {company.customer_tier && <Badge variant="secondary" className="text-[10px]">Tier {company.customer_tier}</Badge>}
                {company.arr != null && <Badge variant="secondary" className="text-[10px]">ARR: {formatCurrency(company.arr)}</Badge>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Button variant="outline" size="sm" onClick={() => handleLogActivity('call')}><Phone className="h-4 w-4 mr-1" /> Call</Button>
            <Button variant="outline" size="sm" onClick={() => handleLogActivity('meeting')}><Calendar className="h-4 w-4 mr-1" /> Meeting</Button>
            <Button variant="outline" size="sm" onClick={() => handleLogActivity('email')}><Mail className="h-4 w-4 mr-1" /> Email</Button>
            <Button variant="outline" size="sm" onClick={() => setShowCreateTask(true)}><CheckSquare className="h-4 w-4 mr-1" /> Task</Button>
            <Button variant="destructive" size="sm" onClick={() => setShowDelete(true)}><Trash2 className="h-4 w-4 mr-1" /> Delete</Button>
          </div>
        </div>

        {headerExtra}

        <Separator />

        <div className="grid grid-cols-12 gap-6">
          {/* Left: Profile */}
          <div className="col-span-3 space-y-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Building2 className="h-4 w-4" /> Company Profile</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <InfoRow label="Type" value={CRM_COMPANY_TYPES.find(t => t.value === company.company_type)?.label} />
                <InfoRow label="Industry" value={company.industry} />
                {company.sub_industry && <InfoRow label="Sub-Industry" value={company.sub_industry} />}
                <InfoRow label="Employees" value={company.employee_range || (company.employee_count ? String(company.employee_count) : null)} />
                <InfoRow label="Annual Revenue" value={formatCurrency(company.annual_revenue)} />
                <InfoRow label="Phone" value={company.phone} />
                <InfoRow label="Email" value={company.main_contact_email} />
                {company.website_url && <div><p className="text-[10px] text-muted-foreground uppercase">Website</p><a href={company.website_url} target="_blank" rel="noopener noreferrer" className="text-primary text-xs flex items-center gap-1 hover:underline">Visit <ExternalLink className="h-3 w-3" /></a></div>}
                {company.linkedin_url && <div><p className="text-[10px] text-muted-foreground uppercase">LinkedIn</p><a href={company.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary text-xs flex items-center gap-1 hover:underline">Profile <ExternalLink className="h-3 w-3" /></a></div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Lifecycle & Ownership</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div><p className="text-[10px] text-muted-foreground uppercase mb-1">Lifecycle Stage</p>
                  <Select value={company.lifecycle_stage} onValueChange={v => handleQuickUpdate('lifecycle_stage', v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{CRM_COMPANY_LIFECYCLES.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><p className="text-[10px] text-muted-foreground uppercase mb-1">Status</p>
                  <Select value={company.status} onValueChange={v => handleQuickUpdate('status', v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{CRM_COMPANY_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <InfoRow label="Segment" value={company.segment} />
                <InfoRow label="Tier" value={company.customer_tier} />
                <InfoRow label="Source" value={company.source_system} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Commercial</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground text-xs">ARR</span><span className="font-medium">{formatCurrency(company.arr)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground text-xs">MRR</span><span className="font-medium">{formatCurrency(company.mrr)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground text-xs">TCV</span><span className="font-medium">{formatCurrency(company.total_contract_value)}</span></div>
                {company.renewal_date && <div className="flex justify-between"><span className="text-muted-foreground text-xs">Renewal</span><span className="font-medium">{format(new Date(company.renewal_date), 'MMM d, yyyy')}</span></div>}
                {company.contract_end_date && <div className="flex justify-between"><span className="text-muted-foreground text-xs">Contract End</span><span className="font-medium">{format(new Date(company.contract_end_date), 'MMM d, yyyy')}</span></div>}
              </CardContent>
            </Card>

            {(company.tags ?? []).length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Tags</CardTitle></CardHeader>
                <CardContent className="flex flex-wrap gap-1">{(company.tags ?? []).map(t => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}</CardContent>
              </Card>
            )}

            <DynamicFieldRenderer
              objectType="company"
              record={company}
              onFieldUpdate={(field, value) => handleQuickUpdate(field, value)}
            />
          </div>

          {/* Center: Activity Timeline */}
          <div className="col-span-6 space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Activity Timeline</CardTitle>
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
                <div className="flex gap-2 mb-4">
                  <Textarea placeholder="Add a note..." value={newNote} onChange={e => setNewNote(e.target.value)} className="text-sm min-h-[60px]" />
                  <Button size="sm" onClick={handleAddNote} disabled={!newNote.trim()}><Plus className="h-4 w-4" /></Button>
                </div>
                <ScrollArea className="max-h-[600px]">
                  {filteredActivities.length === 0 ? (
                    <p className="text-center text-muted-foreground text-sm py-8">No activities yet</p>
                  ) : (
                    <div className="space-y-3">
                      {filteredActivities.map((activity: any) => {
                        const icons: Record<string, any> = { email: Mail, call: Phone, meeting: Calendar, note: MessageSquare };
                        const Icon = icons[activity.activity_type] || MessageSquare;
                        return (
                          <div key={activity.id} className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
                            <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5"><Icon className="h-3.5 w-3.5 text-muted-foreground" /></div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{activity.subject || activity.activity_type}</p>
                              {activity.body && <p className="text-xs text-muted-foreground mt-0.5">{activity.body}</p>}
                              <p className="text-[10px] text-muted-foreground mt-1">{format(new Date(activity.occurred_at), 'MMM d, yyyy · h:mm a')}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Right: Related Objects */}
          <div className="col-span-3 space-y-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Users className="h-4 w-4" /> Contacts ({contacts.length})</CardTitle></CardHeader>
              <CardContent>
                {contacts.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No contacts linked</p>
                ) : (
                  <div className="space-y-2">
                    {contacts.slice(0, 10).map((c: any) => (
                      <div key={c.id} className="p-2 rounded-md border border-border/50 hover:bg-muted/30 text-xs">
                        <div className="flex items-center justify-between">
                          <div className="cursor-pointer flex-1" onClick={() => navigate(`/contacts/${c.id}`)}>
                            <p className="font-medium text-primary hover:underline">{c.full_name || '—'}</p>
                            <p className="text-muted-foreground">{c.job_title || c.email || '—'}</p>
                          </div>
                          <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => unlinkContact.mutate({ contactId: c.id, companyId: company.id })}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-1 mt-2">
                  <Button variant="ghost" size="sm" className="flex-1 text-xs" onClick={() => setShowLinkContact(true)}>
                    <Plus className="h-3 w-3 mr-1" /> Link Existing
                  </Button>
                </div>
                <div className="mt-1">
                  <InlineQuickAddContact companyId={company.id} companyName={company.name} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Briefcase className="h-4 w-4" /> Deals ({companyDeals.length})</CardTitle></CardHeader>
              <CardContent>
                {companyDeals.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No deals linked</p>
                ) : (
                  <div className="space-y-2">
                    {companyDeals.map((deal: any) => (
                      <div key={deal.id} className="p-2 rounded-md border border-border/50 hover:bg-muted/30 text-xs">
                        <div className="flex items-center justify-between">
                          <div className="cursor-pointer flex-1" onClick={() => navigate(`/deal/${deal.id}`)}>
                            <p className="font-medium text-primary hover:underline">{deal.company}</p>
                            <div className="flex items-center justify-between mt-1 text-muted-foreground">
                              <span>{formatSlug(deal.stage)}</span>
                              <span>${Number(deal.value || 0).toLocaleString()}</span>
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => unlinkDeal.mutate({ dealId: deal.id })}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <Button variant="ghost" size="sm" className="w-full mt-2 text-xs" onClick={() => setShowLinkDeal(true)}>
                  <Plus className="h-3 w-3 mr-1" /> Link Deal
                </Button>
              </CardContent>
            </Card>

            <CrmCompanyTasksCard companyId={company.id} companyName={company.name} externalShowCreate={showCreateTask} onExternalShowCreateChange={setShowCreateTask} />

            <ClaapCallsSection entityType="company" entityId={company.id} entityName={company.name} entityDomain={(company as any)?.domain} contactIds={contacts.map((c: any) => c.id)} />

            {subsidiaries.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Building2 className="h-4 w-4" /> Subsidiaries ({subsidiaries.length})</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {subsidiaries.map((sub: any) => (
                      <div key={sub.id} className="p-2 rounded-md border border-border/50 hover:bg-muted/30 cursor-pointer text-xs" onClick={() => navigate(`/crm-companies/${sub.id}`)}>
                        <p className="font-medium">{sub.name}</p>
                        {sub.domain && <p className="text-muted-foreground">{sub.domain}</p>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {company.description && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">About</CardTitle></CardHeader>
                <CardContent><p className="text-xs text-muted-foreground whitespace-pre-wrap">{company.description}</p></CardContent>
              </Card>
            )}

            {company.custom_fields && Object.keys(company.custom_fields).length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Custom Fields</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {Object.entries(company.custom_fields).map(([k, v]) => <InfoRow key={k} label={k} value={String(v)} />)}
                </CardContent>
              </Card>
            )}
          </div>
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
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return <div><p className="text-[10px] text-muted-foreground uppercase">{label}</p><p className="text-xs">{value || '—'}</p></div>;
}
