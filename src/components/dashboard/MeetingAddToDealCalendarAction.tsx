import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarPlus } from 'lucide-react';
import { useCompany } from '@/hooks/useCompany';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { parseRelativeDate } from '@/lib/parseRelativeDate';
import {
  AddToDealCalendarForm,
  type AddToDealCalendarPrefill,
} from '@/components/calendar/AddToDealCalendarForm';

interface Props {
  eventId: string;
  eventTitle: string;
  eventStartISO?: string | null;
  /** Linked deal for this meeting, when present. */
  linkedDealId: string | null;
}

/**
 * Inline action that anchors a popover seeded to add an *event* to the
 * linked deal's calendar directly from a Daily Rundown tile. Distinct
 * from "Create follow-up" (which defaults to a task) so users can reach
 * the deal-calendar path in one click.
 */
export function MeetingAddToDealCalendarAction({
  eventId,
  eventTitle,
  eventStartISO,
  linkedDealId,
}: Props) {
  const [open, setOpen] = useState(false);
  const { company } = useCompany();

  const { data: resolvedLinkedDealId } = useQuery<string | null>({
    queryKey: ['meeting-add-to-deal-calendar-link', eventId, company?.id, linkedDealId],
    enabled: !!eventId && !!company?.id && !linkedDealId,
    staleTime: 0,
    queryFn: async () => {
      if (linkedDealId || !eventId || !company?.id) return linkedDealId ?? null;
      try {
        const { data } = await (supabase.from('meeting_deal_links') as any)
          .select('deal_id')
          .eq('org_company_id', company.id)
          .eq('meeting_external_id', eventId)
          .is('deleted_at', null)
          .order('linked_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        return (data?.deal_id as string | undefined) ?? null;
      } catch {
        return null;
      }
    },
  });
  const effectiveLinkedDealId = linkedDealId ?? resolvedLinkedDealId ?? null;

  const prefill = useMemo<AddToDealCalendarPrefill | null>(() => {
    if (!open) return null;
    const seedTitle = `Follow-up: ${eventTitle}`;
    const sourceText = `Follow-up to meeting "${eventTitle}"`;
    const timestamp = eventStartISO || new Date().toISOString();
    return {
      title: seedTitle,
      sourceText,
      parsed: parseRelativeDate(sourceText, timestamp),
      ctx: {
        module: 'rundown_item',
        recordId: eventId,
        sourceTimestamp: timestamp,
        dealId: effectiveLinkedDealId,
        label: eventTitle,
      },
    };
  }, [open, eventTitle, eventStartISO, eventId, effectiveLinkedDealId]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-8 w-full min-w-0 justify-start gap-1.5 px-2 text-xs"
          onClick={() => setOpen(true)}
        >
          <CalendarPlus className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Add to deal calendar</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        collisionPadding={{ top: 12, bottom: 24, left: 12, right: 12 }}
        avoidCollisions
        className="w-[500px] max-w-[calc(100vw-2rem)] p-2.5 z-[80] rounded-lg border-transparent glass-border-soft bg-card text-popover-foreground shadow-2xl shadow-black/40 flex flex-col max-h-[min(var(--radix-popover-content-available-height),26rem)] overflow-hidden"
      >
        {prefill && (
          <AddToDealCalendarForm
            prefill={prefill}
            onClose={() => setOpen(false)}
            compact
            initialKind="event"
            resetKey={`${eventId}:${open ? 'open' : 'closed'}`}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}