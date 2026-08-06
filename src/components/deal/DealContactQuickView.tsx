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
import { Mail, Phone, Building2, Briefcase, PhoneCall, CalendarDays, ExternalLink } from 'lucide-react';
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
        .select('id, first_name, last_name, full_name, email, phone_mobile, phone_work, job_title, company_name, last_contact_at')
        .eq('id', contactId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const resetForm = () => {
    setLogType(null);
    setSubject('');
    setBody('');
  };

  const handleLog = () => {
    if (!logType) return;
    createActivity.mutate(
      {
        contact_id: contactId,
        activity_type: logType,
        subject: subject.trim() || (logType === 'call' ? 'Call' : 'Meeting'),
        body: body.trim() || undefined,
        deal_id: dealId,
        occurred_at: new Date().toISOString(),
      },
      {
        onSuccess: () => {
          toast.success(`${logType === 'call' ? 'Call' : 'Meeting'} logged with ${contactName}`);
          qc.invalidateQueries({ queryKey: ['contact-activities', contactId] });
          qc.invalidateQueries({ queryKey: ['deal-linked-claap-calls', dealId] });
          qc.invalidateQueries({ queryKey: ['deal-activity-details', dealId] });
          qc.invalidateQueries({ queryKey: ['deal-client-contacts', dealId] });
          resetForm();
          setOpen(false);
        },
        onError: (err: any) => toast.error(err?.message || 'Failed to log activity'),
      },
    );
  };

  const phone = contact?.phone_mobile || contact?.phone_work;

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
            <div className="space-y-1">
              <p className="text-sm font-medium leading-tight">{contactName}</p>
              {(contact?.job_title || contact?.company_name) && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Briefcase className="h-3 w-3" />
                  {[contact?.job_title, contact?.company_name].filter(Boolean).join(' · ')}
                </p>
              )}
              {contact?.email && (
                <a href={`mailto:${contact.email}`} className="text-xs text-primary hover:underline flex items-center gap-1 truncate">
                  <Mail className="h-3 w-3 shrink-0" /> {contact.email}
                </a>
              )}
              {phone && (
                <a href={`tel:${phone}`} className="text-xs text-muted-foreground hover:underline flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {phone}
                </a>
              )}
              {contact?.company_name && !contact?.job_title && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Building2 className="h-3 w-3" /> {contact.company_name}
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">
                Last contact:{' '}
                {contact?.last_contact_at
                  ? new Date(contact.last_contact_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : 'no activity yet'}
              </p>
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
