import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Phone, Calendar, MessageSquare, Plus, ExternalLink, Building2, Users, Briefcase, Globe, MapPin, Trash2, X, CheckSquare } from 'lucide-react';
import { DynamicFieldRenderer } from '@/components/crm/DynamicFieldRenderer';
import { EditableField } from '@/components/crm/EditableField';
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
import { CompanyAttachmentsCard } from '@/components/crm/CompanyAttachmentsCard';
import { useTeamMembers } from '@/hooks/useTeamMembers';
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
  const teamMembers = useTeamMembers();
  const { data: allContactsResult } = useContacts({ pageSize: 1000 });
  const allContacts = allContactsResult?.data ?? [];
  const { data: allDeals = [] } = useAllDeals();
  const linkContact = useLinkContactToCompany();
  const unlinkContact = useUnlinkContactFromCompany();
  const linkDeal = useLinkDealToCompany();
  const unlinkDeal = useUnlinkDealFromCompany();

  const [newNote, setNewNote] = useState('');
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
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
              <div className="h-14 w-14 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-xl font-bold">{company.name?.[0] ?? '?'}</div>
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
                <EditableField label="Address" type="textarea" value={company.address} onSave={(v) => handleQuickUpdate('address', v)} />
                <EditableField label="HQ Address" type="textarea" value={company.hq_address} onSave={(v) => handleQuickUpdate('hq_address', v)} />
                <EditableField label="HQ City" type="text" value={(company as any).hq_city} onSave={(v) => handleQuickUpdate('hq_city', v)} />
                <EditableField label="HQ Country" type="text" value={(company as any).hq_country} onSave={(v) => handleQuickUpdate('hq_country', v)} />
                <EditableField label="Website" type="url" asLink value={company.website_url} onSave={(v) => handleQuickUpdate('website_url', v)} />
                <EditableField label="LinkedIn" type="url" asLink value={company.linkedin_url} onSave={(v) => handleQuickUpdate('linkedin_url', v)} />
                <EditableField label="Logo URL" type="url" value={company.logo_url} onSave={(v) => handleQuickUpdate('logo_url', v)} />
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
                <div><p className="text-[10px] text-muted-foreground uppercase mb-1">Owner</p>
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
                <EditableField label="Segment" type="text" value={company.segment} onSave={(v) => handleQuickUpdate('segment', v)} />
                <EditableField label="Tier" type="text" value={company.customer_tier} onSave={(v) => handleQuickUpdate('customer_tier', v)} />
                <EditableField label="Source" type="text" value={company.source_system} onSave={(v) => handleQuickUpdate('source_system', v)} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
              <CardContent>
                <Textarea
                  value={notesDraft ?? company.notes ?? ''}
                  onChange={e => setNotesDraft(e.target.value)}
                  placeholder="Add notes about this company..."
                  rows={4}
                  className="text-xs"
                />
                {notesDraft !== null && notesDraft !== (company.notes ?? '') && (
                  <div className="flex justify-end gap-2 mt-2">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setNotesDraft(null)}>Cancel</Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        const v = notesDraft.trim() === '' ? null : notesDraft;
                        update.mutate({ id: company.id, notes: v } as any, {
                          onSuccess: () => setNotesDraft(null),
                        });
                      }}
                    >Save</Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Commercial</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <EditableField label="ARR" type="number" value={company.arr} onSave={(v) => handleQuickUpdate('arr', v)} />
                <EditableField label="MRR" type="number" value={company.mrr} onSave={(v) => handleQuickUpdate('mrr', v)} />
                <EditableField label="TCV" type="number" value={company.total_contract_value} onSave={(v) => handleQuickUpdate('total_contract_value', v)} />
                <EditableField label="Renewal Date" type="text" placeholder="YYYY-MM-DD" value={company.renewal_date} onSave={(v) => handleQuickUpdate('renewal_date', v)} />
                <EditableField label="Contract End" type="text" placeholder="YYYY-MM-DD" value={company.contract_end_date} onSave={(v) => handleQuickUpdate('contract_end_date', v)} />
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

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">About</CardTitle></CardHeader>
              <CardContent>
                <EditableField
                  label="Description"
                  type="textarea"
                  value={company.description}
                  placeholder="Add a company description…"
                  onSave={(v) => handleQuickUpdate('description', v)}
                />
              </CardContent>
            </Card>

            <CompanyAttachmentsCard crmCompanyId={company.id} />

            {company.custom_fields && Object.keys(company.custom_fields).length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Custom Fields</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {Object.entries(company.custom_fields).map(([k, v]) => (
                    <EditableField
                      key={k}
                      label={k}
                      type="text"
                      value={v == null ? '' : String(v)}
                      onSave={(nv) => handleQuickUpdate('custom_fields', { ...(company.custom_fields || {}), [k]: nv })}
                    />
                  ))}
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
