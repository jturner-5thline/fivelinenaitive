import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Mail, Phone, Calendar, MessageSquare, Plus, ExternalLink, Pencil, Sparkles, User, Building2, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { useContact, useUpdateContact, useContactActivities, useCreateContactActivity, useContactDeals, LIFECYCLE_STAGES, CONTACT_STATUSES, BUYING_ROLES } from '@/hooks/useContacts';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: contact, isLoading } = useContact(id);
  const updateContact = useUpdateContact();
  const { data: activities = [] } = useContactActivities(id);
  const createActivity = useCreateContactActivity();
  const { data: contactDeals = [] } = useContactDeals(id);
  const [newNote, setNewNote] = useState('');
  const [activityFilter, setActivityFilter] = useState('all');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4">
        <p className="text-muted-foreground">Contact not found</p>
        <Button variant="outline" onClick={() => navigate('/contacts')}>Back to Contacts</Button>
      </div>
    );
  }

  const handleQuickUpdate = (field: string, value: any) => {
    updateContact.mutate({ id: contact.id, [field]: value } as any);
  };

  const handleLogActivity = (type: string) => {
    const subjects: Record<string, string> = {
      call: 'Call logged',
      meeting: 'Meeting logged',
      email: 'Email sent',
    };
    createActivity.mutate({
      contact_id: contact.id,
      activity_type: type,
      subject: subjects[type] || type,
    });
    toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} logged`);
  };

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    createActivity.mutate({
      contact_id: contact.id,
      activity_type: 'note',
      subject: 'Note',
      body: newNote,
    });
    setNewNote('');
    toast.success('Note added');
  };

  const filteredActivities = activityFilter === 'all'
    ? activities
    : activities.filter((a: any) => a.activity_type === activityFilter);

  const lifecycleColors: Record<string, string> = {
    subscriber: 'bg-muted text-muted-foreground',
    lead: 'bg-blue-500/10 text-blue-500',
    mql: 'bg-purple-500/10 text-purple-500',
    sql: 'bg-indigo-500/10 text-indigo-500',
    opportunity: 'bg-amber-500/10 text-amber-500',
    customer: 'bg-green-500/10 text-green-500',
    evangelist: 'bg-pink-500/10 text-pink-500',
  };

  return (
    <>
      <Helmet>
        <title>{contact.full_name || 'Contact'} | nAItive</title>
      </Helmet>

      <div className="bg-background min-h-screen">
        <div className="container mx-auto py-6 px-4 space-y-6">
          {/* Back nav */}
          <Button variant="ghost" size="sm" onClick={() => navigate('/contacts')} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Contacts
          </Button>

          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xl font-bold">
                {(contact.first_name?.[0] || '').toUpperCase()}{(contact.last_name?.[0] || '').toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold">{contact.full_name || 'Unnamed Contact'}</h1>
                  {contact.migrated_from_hubspot && (
                    <Badge variant="outline" className="text-[10px]">HubSpot</Badge>
                  )}
                  {!contact.email_opt_in && (
                    <Badge variant="destructive" className="text-[10px]">Opted Out</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {contact.job_title}{contact.job_title && contact.department ? ' · ' : ''}{contact.department}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className={cn('text-[10px]', lifecycleColors[contact.lifecycle_stage] || 'bg-muted text-muted-foreground')}>
                    {LIFECYCLE_STAGES.find(s => s.value === contact.lifecycle_stage)?.label}
                  </Badge>
                  {contact.buying_role && (
                    <Badge variant="outline" className="text-[10px]">
                      {BUYING_ROLES.find(r => r.value === contact.buying_role)?.label}
                    </Badge>
                  )}
                  {contact.contact_score > 0 && (
                    <Badge variant="secondary" className="text-[10px]">Score: {contact.contact_score}</Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Primary CTAs */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => handleLogActivity('email')}>
                <Mail className="h-4 w-4 mr-1" /> Email
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleLogActivity('call')}>
                <Phone className="h-4 w-4 mr-1" /> Call
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleLogActivity('meeting')}>
                <Calendar className="h-4 w-4 mr-1" /> Meeting
              </Button>
            </div>
          </div>

          <Separator />

          {/* Three-column layout */}
          <div className="grid grid-cols-12 gap-6">
            {/* Left: Fields */}
            <div className="col-span-3 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-1.5"><User className="h-4 w-4" /> Contact Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <InfoRow label="Email" value={contact.email} />
                  <InfoRow label="Work Phone" value={contact.phone_work} />
                  <InfoRow label="Mobile" value={contact.phone_mobile} />
                  {contact.linkedin_url && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">LinkedIn</p>
                      <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary text-xs flex items-center gap-1 hover:underline">
                        Profile <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                  <InfoRow label="Timezone" value={contact.timezone} />
                  <InfoRow label="Preferred Channel" value={contact.preferred_channel} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-1.5"><Briefcase className="h-4 w-4" /> Lifecycle & Ownership</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase mb-1">Lifecycle Stage</p>
                    <Select value={contact.lifecycle_stage} onValueChange={v => handleQuickUpdate('lifecycle_stage', v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LIFECYCLE_STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase mb-1">Status</p>
                    <Select value={contact.status} onValueChange={v => handleQuickUpdate('status', v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CONTACT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase mb-1">Buying Role</p>
                    <Select value={contact.buying_role || ''} onValueChange={v => handleQuickUpdate('buying_role', v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select role" /></SelectTrigger>
                      <SelectContent>
                        {BUYING_ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <InfoRow label="Lead Source" value={contact.lead_source} />
                  <InfoRow label="Source System" value={contact.source_system} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Scores</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">Contact Score</span>
                    <span className="font-medium">{contact.contact_score || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">Behavioral</span>
                    <span className="font-medium">{contact.behavioral_score || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">Fit</span>
                    <span className="font-medium">{contact.fit_score || 0}</span>
                  </div>
                </CardContent>
              </Card>

              {contact.tags && contact.tags.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Tags</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-1">
                    {contact.tags.map(tag => (
                      <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Center: Activity Timeline */}
            <div className="col-span-6 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Activity Timeline</CardTitle>
                    <div className="flex items-center gap-2">
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
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Quick note input */}
                  <div className="flex gap-2 mb-4">
                    <Textarea
                      placeholder="Add a note..."
                      value={newNote}
                      onChange={e => setNewNote(e.target.value)}
                      className="text-sm min-h-[60px]"
                    />
                    <Button size="sm" onClick={handleAddNote} disabled={!newNote.trim()}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  <ScrollArea className="max-h-[600px]">
                    {filteredActivities.length === 0 ? (
                      <p className="text-center text-muted-foreground text-sm py-8">No activities yet</p>
                    ) : (
                      <div className="space-y-3">
                        {filteredActivities.map((activity: any) => {
                          const typeIcons: Record<string, any> = {
                            email: Mail,
                            call: Phone,
                            meeting: Calendar,
                            note: MessageSquare,
                          };
                          const Icon = typeIcons[activity.activity_type] || MessageSquare;
                          return (
                            <div key={activity.id} className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
                              <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                              </div>
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
            </div>

            {/* Right: Related objects */}
            <div className="col-span-3 space-y-4">
              {/* Deals */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-1.5"><Briefcase className="h-4 w-4" /> Deals</CardTitle>
                </CardHeader>
                <CardContent>
                  {contactDeals.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No associated deals</p>
                  ) : (
                    <div className="space-y-2">
                      {contactDeals.map((cd: any) => (
                        <div
                          key={cd.id}
                          className="p-2 rounded-md border border-border/50 hover:bg-muted/30 cursor-pointer text-xs"
                          onClick={() => navigate(`/deal/${cd.deal?.id}`)}
                        >
                          <p className="font-medium">{cd.deal?.company || 'Deal'}</p>
                          <div className="flex items-center justify-between mt-1 text-muted-foreground">
                            <span>{cd.deal?.stage || '—'}</span>
                            {cd.deal?.value && <span>${Number(cd.deal.value).toLocaleString()}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button variant="ghost" size="sm" className="w-full mt-2 text-xs">
                    <Plus className="h-3 w-3 mr-1" /> Link Deal
                  </Button>
                </CardContent>
              </Card>

              {/* Custom Fields */}
              {contact.custom_fields && Object.keys(contact.custom_fields).length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Custom Fields</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {Object.entries(contact.custom_fields).map(([key, value]) => (
                      <InfoRow key={key} label={key} value={String(value)} />
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Description */}
              {contact.description && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">{contact.description}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
      <p className="text-xs">{value || '—'}</p>
    </div>
  );
}
