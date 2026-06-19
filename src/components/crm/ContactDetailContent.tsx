import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mail, Phone, Calendar, MessageSquare, Plus, Pencil, User, Building2,
  Briefcase, Trash2, X, CheckSquare, MoreHorizontal, ChevronRight, ChevronDown,
  MapPin, Globe, Linkedin, Paperclip, Activity as ActivityIcon, Users,
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
  useContact, useUpdateContact, useContactActivities, useCreateContactActivity,
  useContactDeals, useDeleteContact, LIFECYCLE_STAGES, CONTACT_STATUSES, BUYING_ROLES,
} from '@/hooks/useContacts';
import { ContactTypeSelect } from '@/components/contacts/ContactTypeSelect';
import { EditableField } from '@/components/crm/EditableField';
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
import { ClaapCallsSection } from '@/components/claap/ClaapCallsSection';
import { CompanyDomainMatchPrompt } from '@/components/contacts/CompanyDomainMatchPrompt';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { extractEmailDomain } from '@/lib/extractEmailDomain';
import { cn } from '@/lib/utils';
import { format, isToday, isThisWeek } from 'date-fns';
import { Loader2 } from 'lucide-react';
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
  const createActivity = useCreateContactActivity();
  const { data: contactDeals = [] } = useContactDeals(contactId);
  const deleteContact = useDeleteContact();
  const teamMembers = useTeamMembers();
  const [newNote, setNewNote] = useState('');
  const [activityFilter, setActivityFilter] = useState('all');

  const [showLinkCompany, setShowLinkCompany] = useState(false);
  const [showLinkDeal, setShowLinkDeal] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showMoreContactInfo, setShowMoreContactInfo] = useState(false);

  const crmCompanyId = (contact as any)?.crm_company_id;
  const { data: crmCompany } = useContactCrmCompany(crmCompanyId);
  const { data: companiesResult } = useCrmCompanies({ pageSize: 1000 });
  const companies = companiesResult?.data ?? [];
  const { data: deals = [] } = useAllDeals();
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

  const handleLogActivity = (type: string) => {
    const subjects: Record<string, string> = { call: 'Call logged', meeting: 'Meeting logged', email: 'Email sent' };
    createActivity.mutate({ contact_id: contact.id, activity_type: type, subject: subjects[type] || type });
    toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} logged`);
  };

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    createActivity.mutate({ contact_id: contact.id, activity_type: 'note', subject: 'Note', body: newNote });
    setNewNote('');
    toast.success('Note added');
  };

  const filteredActivities = activityFilter === 'all'
    ? activities
    : activities.filter((a: any) => a.activity_type === activityFilter);

  const lifecycleColors: Record<string, string> = {
    subscriber: 'bg-muted text-muted-foreground', lead: 'bg-blue-500/10 text-blue-500',
    mql: 'bg-purple-500/10 text-purple-500', sql: 'bg-indigo-500/10 text-indigo-500',
    opportunity: 'bg-amber-500/10 text-amber-500', customer: 'bg-green-500/10 text-green-500',
    evangelist: 'bg-pink-500/10 text-pink-500',
  };

  const companyOptions: EntityOption[] = companies.map(c => ({ id: c.id, label: c.name, sublabel: c.domain || c.industry || undefined }));
  const dealOptions: EntityOption[] = deals.map(d => ({ id: d.id, label: d.company, sublabel: `${d.stage} · $${Number(d.value || 0).toLocaleString()}` }));

  const owner = teamMembers.find(m => m.id === contact.owner_user_id);
  const ownerName = owner?.display_name || 'Unassigned';
  const initials = `${(contact.first_name?.[0] || '').toUpperCase()}${(contact.last_name?.[0] || '').toUpperCase()}` || 'C';
  const location = [(contact as any).city, (contact as any).state, (contact as any).country].filter(Boolean).join(', ');
  const phonePrimary = contact.phone_mobile || contact.phone_work;
  const latestActivity = activities[0];
  const latestNote = useMemo(
    () => activities.find((a: any) => a.activity_type === 'note'),
    [activities],
  );
  const activeDeal = contactDeals[0];

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

  return (
    <>
      <div className="flex flex-col">
        {/* Sticky header */}
        <header className="sticky top-0 z-20 -mx-1 px-1 bg-background/95 backdrop-blur border-b">
          <nav className="flex items-center gap-1.5 pt-2 text-xs text-muted-foreground">
            {!hideBackButton && (
              <>
                <button onClick={() => navigate('/contacts')} className="hover:text-foreground transition-colors">Contacts</button>
                <ChevronRight className="h-3 w-3" />
              </>
            )}
            <span className="text-foreground/80 truncate">{contact.full_name || 'Unnamed Contact'}</span>
          </nav>
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
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-muted-foreground hidden md:inline">Owner · {ownerName}</span>
              <Button variant="outline" size="sm" onClick={() => goAnchor('contact-info')}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
              <Button size="sm" onClick={() => handleLogActivity('email')}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Log Activity
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => handleLogActivity('call')}>
                    <Phone className="h-3.5 w-3.5 mr-2" /> Log call
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleLogActivity('meeting')}>
                    <Calendar className="h-3.5 w-3.5 mr-2" /> Log meeting
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowCreateTask(true)}>
                    <CheckSquare className="h-3.5 w-3.5 mr-2" /> Create task
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowLinkCompany(true)}>
                    <Building2 className="h-3.5 w-3.5 mr-2" /> Link company
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowLinkDeal(true)}>
                    <Briefcase className="h-3.5 w-3.5 mr-2" /> Link deal
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

        {/* First viewport: 30 / 70 split */}
        <div className="grid grid-cols-12 gap-6 pt-6">
          {/* Left summary — sticky */}
          <aside className="col-span-12 lg:col-span-4">
            <div className="lg:sticky lg:top-32 space-y-5">
              <div className="flex items-start gap-3">
                <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-primary text-lg font-semibold flex-shrink-0">
                  {initials || <User className="h-6 w-6" />}
                </div>
                <div className="min-w-0">
                  <p className="text-base font-semibold leading-tight truncate">{contact.full_name || 'Unnamed Contact'}</p>
                  {contact.job_title && <p className="text-sm text-muted-foreground truncate">{contact.job_title}</p>}
                  {crmCompany?.name && (
                    <button
                      onClick={() => navigate(`/crm-companies/${crmCompany.id}`)}
                      className="text-sm text-primary hover:underline truncate block"
                    >
                      {crmCompany.name}
                    </button>
                  )}
                </div>
              </div>

              <dl className="space-y-1.5">
                <SummaryRow label="Preferred" value={contact.preferred_channel} />
                <SummaryRow label="Email" value={contact.email} href={contact.email ? `mailto:${contact.email}` : undefined} />
                <SummaryRow label="Phone" value={phonePrimary} href={phonePrimary ? `tel:${phonePrimary}` : undefined} />
                <SummaryRow label="Location" value={location} icon={MapPin} />
                <SummaryRow label="Owner" value={ownerName} />
                {contact.linkedin_url && <SummaryRow label="LinkedIn" value="View profile" href={contact.linkedin_url} icon={Linkedin} />}
                {contact.website_url && <SummaryRow label="Website" value={contact.website_url.replace(/^https?:\/\//, '')} href={contact.website_url} icon={Globe} />}
              </dl>

              {contact.tags && contact.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {contact.tags.map(tag => <Badge key={tag} variant="outline" className="text-[10px] font-normal">{tag}</Badge>)}
                </div>
              )}

              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Linked</p>
                <ul className="space-y-1">
                  {crmCompany && (
                    <li>
                      <button
                        onClick={() => navigate(`/crm-companies/${crmCompany.id}`)}
                        className="flex items-center gap-2 w-full text-left py-1 text-sm hover:text-primary"
                      >
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="truncate">{crmCompany.name}</span>
                      </button>
                    </li>
                  )}
                  {contactDeals.slice(0, 4).map((cd: any) => (
                    <li key={cd.id}>
                      <button
                        onClick={() => navigate(`/deal/${cd.deal?.id}`)}
                        className="flex items-center justify-between w-full gap-2 text-left py-1 text-sm hover:text-primary"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <Briefcase className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="truncate">{cd.deal?.company || 'Deal'}</span>
                        </span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">{cd.deal?.stage || ''}</span>
                      </button>
                    </li>
                  ))}
                  {!crmCompany && contactDeals.length === 0 && (
                    <li className="text-xs text-muted-foreground">No linked records</li>
                  )}
                </ul>
              </div>
            </div>
          </aside>

          {/* Right overview: what matters now */}
          <section className="col-span-12 lg:col-span-8 space-y-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">What matters now</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <OverviewBlock
                title="Latest activity"
                empty="No activity logged yet"
                onClick={() => goAnchor('activity-timeline')}
              >
                {latestActivity && (
                  <>
                    <p className="text-sm font-medium truncate">{latestActivity.subject || latestActivity.activity_type}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(latestActivity.occurred_at), 'MMM d, yyyy · h:mm a')}
                    </p>
                  </>
                )}
              </OverviewBlock>

              <OverviewBlock
                title="Next step"
                empty="No upcoming follow-up"
                onClick={() => setShowCreateTask(true)}
              >
                <p className="text-sm text-muted-foreground">Open tasks below — add a follow-up to surface it here.</p>
              </OverviewBlock>

              <OverviewBlock
                title={activeDeal ? 'Active deal' : 'Linked company'}
                empty={crmCompany ? undefined : 'No company or deal linked'}
                onClick={() => {
                  if (activeDeal?.deal?.id) navigate(`/deal/${activeDeal.deal.id}`);
                  else if (crmCompany?.id) navigate(`/crm-companies/${crmCompany.id}`);
                }}
              >
                {activeDeal ? (
                  <>
                    <p className="text-sm font-medium truncate">{activeDeal.deal?.company}</p>
                    <p className="text-xs text-muted-foreground">
                      {activeDeal.deal?.stage}{activeDeal.deal?.value ? ` · $${Number(activeDeal.deal.value).toLocaleString()}` : ''}
                    </p>
                  </>
                ) : crmCompany ? (
                  <>
                    <p className="text-sm font-medium truncate">{crmCompany.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{crmCompany.industry || crmCompany.domain || ''}</p>
                  </>
                ) : null}
              </OverviewBlock>

              <OverviewBlock
                title="Recent note"
                empty="No notes yet"
                onClick={() => goAnchor('notes')}
              >
                {latestNote && (
                  <>
                    <p className="text-sm line-clamp-2">{latestNote.body || latestNote.subject}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {format(new Date(latestNote.occurred_at), 'MMM d, yyyy')}
                    </p>
                  </>
                )}
              </OverviewBlock>
            </div>

            <ContactTasksCard
              contactId={contact.id}
              contactName={contact.full_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Contact'}
              crmCompanyId={(contact as any)?.crm_company_id}
              externalShowCreate={showCreateTask}
              onExternalShowCreateChange={setShowCreateTask}
            />

            <ContactFieldSuggestions contactId={contact.id} companyId={(contact as any)?.org_company_id} />
          </section>
        </div>

        {/* Full-width anchored sections */}
        <div className="pt-10 space-y-10">
          {/* Contact Info */}
          <Section id="contact-info" title="Contact Info" icon={User}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <EditableField label="First Name" type="text" value={contact.first_name} onSave={(v) => handleQuickUpdate('first_name', v)} />
              <EditableField label="Last Name" type="text" value={contact.last_name} onSave={(v) => handleQuickUpdate('last_name', v)} />
              <EditableField label="Job Title" type="text" value={contact.job_title} onSave={(v) => handleQuickUpdate('job_title', v)} />
              <EditableField label="Department" type="text" value={contact.department} onSave={(v) => handleQuickUpdate('department', v)} />
              <EditableField label="Work Email" type="email" asLink value={contact.email} onSave={(v) => handleQuickUpdate('email', v)} />
              <EditableField label="Mobile" type="tel" value={contact.phone_mobile} onSave={(v) => handleQuickUpdate('phone_mobile', v)} />
              <EditableField label="Office Phone" type="tel" value={contact.phone_work} onSave={(v) => handleQuickUpdate('phone_work', v)} />
              <EditableField label="Preferred Channel" type="text" value={contact.preferred_channel} onSave={(v) => handleQuickUpdate('preferred_channel', v)} />
            </div>

            <Collapsible open={showMoreContactInfo} onOpenChange={setShowMoreContactInfo} className="mt-3">
              <CollapsibleTrigger className="text-xs text-primary hover:underline flex items-center gap-1">
                <ChevronDown className={cn('h-3 w-3 transition-transform', showMoreContactInfo && 'rotate-180')} />
                {showMoreContactInfo ? 'Show less' : 'Show more'}
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                  <EditableField label="Website / Domain" type="url" asLink value={contact.website_url} onSave={(v) => handleQuickUpdate('website_url', v)} />
                  <EditableField label="LinkedIn URL" type="url" asLink value={contact.linkedin_url} onSave={(v) => handleQuickUpdate('linkedin_url', v)} />
                  <EditableField label="Timezone" type="text" value={contact.timezone} onSave={(v) => handleQuickUpdate('timezone', v)} />
                  <EditableField label="City" type="text" value={(contact as any).city} onSave={(v) => handleQuickUpdate('city', v)} />
                  <EditableField label="State" type="text" value={(contact as any).state} onSave={(v) => handleQuickUpdate('state', v)} />
                  <EditableField label="Country" type="text" value={(contact as any).country} onSave={(v) => handleQuickUpdate('country', v)} />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Section>

          {/* Related Records */}
          <Section id="related-records" title="Related Records" icon={Users}>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Company {(contact as any)?.org_company_id === 'c4753066-0da9-4d87-8858-7eb1adecd173' && (
                      <span className="font-normal" title="Company auto-linked based on email domain.">(auto-linked)</span>
                    )}
                  </p>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowLinkCompany(true)}>
                    <Plus className="h-3 w-3 mr-1" /> {crmCompany ? 'Change' : 'Link'}
                  </Button>
                </div>
                {crmCompany ? (
                  <button
                    onClick={() => navigate(`/crm-companies/${crmCompany.id}`)}
                    className="w-full flex items-center justify-between p-2.5 rounded-md border border-border/60 hover:bg-muted/30 text-left transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-primary truncate">{crmCompany.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{crmCompany.industry || crmCompany.domain || ''}</p>
                    </div>
                    <Button asChild variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={(e) => { e.stopPropagation(); unlinkFromCompany.mutate({ contactId: contact.id, companyId: crmCompany.id }); }}>
                      <span><X className="h-3 w-3" /></span>
                    </Button>
                  </button>
                ) : (
                  <p className="text-xs text-muted-foreground py-2">No company linked</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-muted-foreground">Deals ({contactDeals.length})</p>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowLinkDeal(true)}>
                    <Plus className="h-3 w-3 mr-1" /> Link
                  </Button>
                </div>
                {contactDeals.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">No associated deals</p>
                ) : (
                  <ul className="divide-y divide-border/60 border border-border/60 rounded-md overflow-hidden">
                    {contactDeals.map((cd: any) => (
                      <li key={cd.id} className="flex items-center justify-between gap-3 p-2.5 hover:bg-muted/30 transition-colors">
                        <button onClick={() => navigate(`/deal/${cd.deal?.id}`)} className="flex-1 min-w-0 text-left">
                          <p className="text-sm font-medium text-primary truncate">{cd.deal?.company || 'Deal'}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {cd.deal?.stage || '—'}{cd.deal?.value ? ` · $${Number(cd.deal.value).toLocaleString()}` : ''}
                          </p>
                        </button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => unlinkFromDeal.mutate({ contactId: contact.id, dealId: cd.deal?.id })}>
                          <X className="h-3 w-3" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
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

          {/* Attachments */}
          <Section id="attachments" title="Attachments" icon={Paperclip}>
            <p className="text-sm text-muted-foreground py-6 text-center">
              No attachments linked to this contact.
            </p>
          </Section>

          {/* Additional Details */}
          <Section id="additional-details" title="Additional Details">
            <div className="space-y-2">
              <DetailGroup title="Lifecycle & Ownership" defaultOpen>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                  <LabeledSelect label="Lifecycle Stage" value={contact.lifecycle_stage} onChange={v => handleQuickUpdate('lifecycle_stage', v)} options={LIFECYCLE_STAGES} />
                  <LabeledSelect label="Status" value={contact.status} onChange={v => handleQuickUpdate('status', v)} options={CONTACT_STATUSES} />
                  <LabeledSelect label="Buying Role" value={contact.buying_role || ''} onChange={v => handleQuickUpdate('buying_role', v)} options={BUYING_ROLES} placeholder="Select role" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase mb-1">Contact Type</p>
                    <ContactTypeSelect value={(contact as any).contact_type} onChange={(v) => handleQuickUpdate('contact_type', v)} triggerClassName="h-8 text-xs" />
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
                </div>
              </DetailGroup>

              <DetailGroup title="Source">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                  <EditableField label="Lead Source" type="text" value={contact.lead_source} onSave={(v) => handleQuickUpdate('lead_source', v)} />
                  <EditableField label="Source System" type="text" value={contact.source_system} onSave={(v) => handleQuickUpdate('source_system', v)} />
                </div>
              </DetailGroup>

              {contact.custom_fields && Object.keys(contact.custom_fields).length > 0 && (
                <DetailGroup title="Custom Fields">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                    {Object.entries(contact.custom_fields).map(([key, value]) => (
                      <EditableField
                        key={key}
                        label={key}
                        type="text"
                        value={value == null ? '' : String(value)}
                        onSave={(v) => handleQuickUpdate('custom_fields', { ...(contact.custom_fields || {}), [key]: v })}
                      />
                    ))}
                  </div>
                </DetailGroup>
              )}

              <DetailGroup title="Internal Metadata">
                <DynamicFieldRenderer
                  objectType="contact"
                  record={contact}
                  onFieldUpdate={(field, value) => handleQuickUpdate(field, value)}
                />
              </DetailGroup>
            </div>
          </Section>
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
        onLinkRequested={() => setShowLinkCompany(true)}
      />
    </>
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
        {visible.map((n) => <ActivityRow key={n.id} activity={n} ownerName={ownerName} />)}
      </ul>
      {notes.length > 5 && (
        <button onClick={() => setShowAll(s => !s)} className="text-xs text-primary hover:underline mt-2">
          {showAll ? 'Show less' : `Show ${notes.length - 5} more notes`}
        </button>
      )}
    </>
  );
}
