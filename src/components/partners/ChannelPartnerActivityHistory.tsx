import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { Button } from '@/components/ui/button';
import { CHANNEL_PARTNER_STAGES } from '@/lib/channelPartnerStages';

const stageLabel = (stage: string) => CHANNEL_PARTNER_STAGES.find(s => s.key === stage)?.label ?? stage;

export function ChannelPartnerActivityHistory({ partnerId }: { partnerId: string | null }) {
  const { company } = useCompany();
  const { data: events = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['channel_partner_history', company?.id, partnerId],
    enabled: !!partnerId && !!company?.id,
    queryFn: async () => {
      if (!partnerId || !company?.id) return [];
      const { data, error } = await supabase.from('channel_partner_history')
        .select('id, event_type, from_stage, to_stage, occurred_at')
        .eq('channel_partner_id', partnerId)
        .eq('company_id', company.id)
        .order('occurred_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <section className="space-y-2" aria-label="Activity history">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5" /> Activity history
      </h4>
      {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
      {isError && <div className="flex items-center justify-between gap-2">
        <p role="alert" className="text-xs text-destructive">Could not load activity history.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
      </div>}
      {!isLoading && !isError && events.length === 0 && <p className="text-xs text-muted-foreground">No activity recorded.</p>}
      <ol className="divide-y divide-border">
        {events.map(event => (
          <li key={event.id} className="py-2 space-y-1">
            <p className="text-sm text-foreground flex flex-wrap items-center gap-1.5">
              {event.event_type === 'added'
                ? `Added to pipeline${event.to_stage ? ` · ${stageLabel(event.to_stage)}` : ''}`
                : <><span>{event.from_stage ? stageLabel(event.from_stage) : 'Unknown stage'}</span><ArrowRight aria-label="moved to" className="h-3 w-3 text-primary" /><span>{event.to_stage ? stageLabel(event.to_stage) : 'Unknown stage'}</span></>}
            </p>
            <time dateTime={event.occurred_at} className="text-xs text-muted-foreground">
              {format(new Date(event.occurred_at), 'MMM d, yyyy · h:mm a')}
            </time>
          </li>
        ))}
      </ol>
      {events.some(event => event.event_type === 'added' && !event.to_stage) && <p className="text-xs text-muted-foreground">Stage moves before activity tracking began were not recorded.</p>}
    </section>
  );
}