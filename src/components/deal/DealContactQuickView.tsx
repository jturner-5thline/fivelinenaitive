import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCreateContactActivity } from '@/hooks/useContacts';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Building2, Briefcase, PhoneCall, CalendarDays, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

interface Props {
  contactId: string;
  contactName: string;
  dealId: string;
  children: React.ReactNode;
}

type LogType = 'call' | 'meeting' | null;

export function DealContactQuickView({ contactId, contactName, dealId, children }: Props) {
  const [open, setOpen] = useState(false);
  const [logType, setLogType] = useState<LogType>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const qc = useQueryClient();
  const createActivity = useCreateContactActivity();

  const { data: contact, isLoading } = useQuery({
    queryKey: ['deal-contact-quickview', contactId],
    enabled: open && !!contactId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select(
          'id, first_name, last_name, full_name, email, additional_emails, phone_mobile, phone_work, phone_other, job_title, linkedin_url, city, contact_type, lifecycle_stage, last_contact_at, crm_company_id, company_id, primary_company_id',
        )
        .eq('id', contactId)
        .maybeSingle();
      if (error) throw error;
      const row = data as any;
      let companyName: string | null = null;
      const companyId = row?.crm_company_id || row?.primary_company_id || row?.company_id;
      if (companyId) {
        const { data: co } = await supabase
          .from('crm_companies')
          .select('id, name, domain')
          .eq('id', companyId)
          .maybeSingle();
        companyName = (co as any)?.name || (co as any)?.domain || null;
      }
      return { ...row, companyName, companyId } as any;
    },
  });

  const resetForm = () => {
    setLogType(null);
    setSubject('');
    setBody('');
  };

  const logToDealTimeline = async (kind: 'call' | 'meeting', subj: string, note: string) => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      let displayName: string | null = auth?.user?.email ?? null;
      if (userId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', userId)
          .maybeSingle();
        displayName = (profile as any)?.display_name || displayName;
      }
      await supabase.from('activity_logs').insert({
        deal_id: dealId,
        user_id: userId ?? null,
        user_display_name: displayName,
        activity_type: kind === 'call' ? 'call_logged' : 'meeting_logged',
        description: subj,
        body: note || null,
        subject: subj,
        metadata: {
          call_type: kind === 'call' ? 'Call' : 'Meeting',
          contact_id: contactId,
          contact_name: contactName,
          logged_from: 'deal_contact_quick_view',
        },
      } as any);
    } catch (e) {
      console.error('Failed to log activity to deal timeline', e);
    }
  };

  const handleLog = () => {
    if (!logType) return;
    const subj = subject.trim() || (logType === 'call' ? 'Call' : 'Meeting');
    const note = body.trim();
    createActivity.mutate(
      {
        contact_id: contactId,
        activity_type: logType,
        subject: subj,
        body: note || undefined,
        deal_id: dealId,
        occurred_at: new Date().toISOString(),
      },
      {
        onSuccess: async () => {
          await logToDealTimeline(logType, subj, note);
          toast.success(`${logType === 'call' ? 'Call' : 'Meeting'} logged with ${contactName}`);
          qc.invalidateQueries({ queryKey: ['contact-activities', contactId] });
          qc.invalidateQueries({ queryKey: ['deal-linked-claap-calls', dealId] });
          qc.invalidateQueries({ queryKey: ['deal-activity-details', dealId] });
          qc.invalidateQueries({ queryKey: ['deal-activity-stats-local', dealId] });
          qc.invalidateQueries({ queryKey: ['deal-activity-chart', dealId] });
          qc.invalidateQueries({ queryKey: ['deal-audit-log', dealId] });
          qc.invalidateQueries({ queryKey: ['deal-client-contacts', dealId] });
          resetForm();
          setOpen(false);
        },
        onError: (err: any) => toast.error(err?.message || 'Failed to log activity'),
      },
    );
  };

  const secondaryEmail = Array.isArray(contact?.additional_emails) ? contact.additional_emails[0] : null;

  const rows: { label: string; value: React.ReactNode }[] = [];
  if (contact?.companyName) rows.push({ label: 'Company', value: contact.companyName });
  if (contact?.job_title) rows.push({ label: 'Title', value: contact.job_title });
  if (contact?.email)
    rows.push({
      label: 'Email',
      value: (
        <a href={`mailto:${contact.email}`} className="text-primary hover:underline break-all">
          {contact.email}
        </a>
      ),
    });
  if (secondaryEmail)
    rows.push({
      label: 'Alt email',
      value: (
        <a href={`mailto:${secondaryEmail}`} className="text-primary hover:underline break-all">
          {secondaryEmail}
        </a>
      ),
    });
  if (contact?.phone_mobile)
    rows.push({ label: 'Mobile', value: <a href={`tel:${contact.phone_mobile}`} className="hover:underline">{contact.phone_mobile}</a> });
  if (contact?.phone_work)
    rows.push({ label: 'Work', value: <a href={`tel:${contact.phone_work}`} className="hover:underline">{contact.phone_work}</a> });
  if (contact?.phone_other)
    rows.push({ label: 'Other', value: <a href={`tel:${contact.phone_other}`} className="hover:underline">{contact.phone_other}</a> });
  if (contact?.linkedin_url)
    rows.push({
      label: 'LinkedIn',
      value: (
        <a href={contact.linkedin_url} target="_blank" rel="noreferrer" className="text-primary hover:underline break-all">
          Profile
        </a>
      ),
    });
  if (contact?.city) rows.push({ label: 'Location', value: contact.city });
  if (contact?.contact_type) rows.push({ label: 'Type', value: contact.contact_type });
  rows.push({
    label: 'Last contact',
    value: contact?.last_contact_at
      ? new Date(contact.last_contact_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      : 'No activity yet',
  });

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80 p-3 bg-popover" align="start" onClick={(e) => e.stopPropagation()}>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="space-y-0.5">
                <p className="text-sm font-medium leading-tight">{contact?.full_name || contactName}</p>
                {(contact?.job_title || contact?.companyName) && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    {contact?.companyName ? <Building2 className="h-3 w-3 shrink-0" /> : <Briefcase className="h-3 w-3 shrink-0" />}
                    <span className="truncate">{[contact?.job_title, contact?.companyName].filter(Boolean).join(' · ')}</span>
                  </p>
                )}
              </div>
              <dl className="grid grid-cols-[76px_minmax(0,1fr)] gap-x-2 gap-y-1 border-t pt-2">
                {rows.map((r) => (
                  <div key={r.label} className="contents">
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground pt-0.5">{r.label}</dt>
                    <dd className="text-xs text-foreground min-w-0">{r.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {!logType ? (
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setLogType('call')}>
                  <PhoneCall className="h-3.5 w-3.5" /> Log call
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setLogType('meeting')}>
                  <CalendarDays className="h-3.5 w-3.5" /> Log meeting
                </Button>
                <Button asChild size="sm" variant="ghost" className="h-7 text-xs gap-1">
                  <Link to={`/contacts/${contactId}`}>
                    <ExternalLink className="h-3.5 w-3.5" /> Open
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-2 border-t pt-2">
                <Label className="text-xs">{logType === 'call' ? 'Log a call' : 'Log a meeting'}</Label>
                <Input
                  autoFocus
                  className="h-8 text-xs"
                  placeholder="Subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
                <Textarea
                  className="text-xs min-h-[70px]"
                  placeholder="Notes (optional)"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
                <div className="flex justify-end gap-1.5">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={resetForm}>
                    Cancel
                  </Button>
                  <Button size="sm" className="h-7 text-xs" onClick={handleLog} disabled={createActivity.isPending}>
                    {createActivity.isPending ? 'Saving…' : 'Log'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
