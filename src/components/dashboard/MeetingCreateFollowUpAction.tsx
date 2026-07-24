import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { CalendarPlus, ListPlus, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMeetingClaapContext } from '@/hooks/useMeetingClaapContext';
import { useCompany } from '@/hooks/useCompany';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { parseRelativeDate } from '@/lib/parseRelativeDate';
import {
  AddToDealCalendarForm,
  type AddToDealCalendarPrefill,
} from '@/components/calendar/AddToDealCalendarForm';
import { EventFollowUpTasksPanel } from '@/components/dashboard/EventFollowUpTasksPanel';

interface Props {
  eventId: string;
  eventTitle: string;
  eventStartISO?: string | null;
  /** Linked deal for this meeting, when present. Null = plain-task mode. */
  linkedDealId: string | null;
}

/**
 * Combined "Create follow-up" inline action that replaces the separate
 * Create-task + Add-to-deal-calendar buttons. Opens a condensed Popover
 * anchored under the button containing the unified follow-up form (task,
 * event, or task + calendar entry).
 */
export function MeetingCreateFollowUpAction({
  eventId,
  eventTitle,
  eventStartISO,
  linkedDealId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [initialTitleSeed, setInitialTitleSeed] = useState<string | null>(null);
  const ctx = useMeetingClaapContext(eventId);
  const { company } = useCompany();
  const suggestions = ctx.actionItems.filter(Boolean);

  const resolveLinkedDealId = async () => {
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
  };
  const { data: resolvedLinkedDealId } = useQuery<string | null>({
    queryKey: ['meeting-create-follow-up-deal-link', eventId, company?.id, linkedDealId],
    enabled: !!eventId && !!company?.id && !linkedDealId,
    staleTime: 0,
    queryFn: resolveLinkedDealId,
  });
  const effectiveLinkedDealId = linkedDealId ?? resolvedLinkedDealId ?? null;

  const prefill = useMemo<AddToDealCalendarPrefill | null>(() => {
    if (!open) return null;
    const seedTitle = (initialTitleSeed?.trim() || `Follow-up: ${eventTitle}`).trim();
    const sourceText = initialTitleSeed?.trim() || `Follow-up to meeting "${eventTitle}"`;
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
  }, [open, initialTitleSeed, eventTitle, eventStartISO, eventId, effectiveLinkedDealId]);

  const openWith = async (initialTitle?: string) => {
    setInitialTitleSeed(initialTitle ?? null);
    // Pre-resolve the linked deal so the form opens with the right ctx.
    await resolveLinkedDealId();
    setOpen(true);
  };

  const dialogContent = prefill && (
    <DialogContent
      overlayClassName="z-[2000]"
      className="max-w-lg w-[calc(100vw-2rem)] p-0 overflow-hidden border-transparent glass-border-soft shadow-2xl shadow-black/40 bg-[linear-gradient(160deg,hsl(var(--card))_0%,hsl(var(--popover))_55%,hsl(var(--muted))_100%)] z-[2010]"
    >
      <DialogHeader className="px-4 pt-4 pb-2">
        <DialogTitle className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-primary" />
          Create follow-up
        </DialogTitle>
        <DialogDescription className="text-xs">
          Create a task and/or add an event to the deal calendar.
        </DialogDescription>
      </DialogHeader>
      <div className="px-4 pb-4 max-h-[70vh] overflow-y-auto">
        <div className="mb-3">
          <EventFollowUpTasksPanel eventId={eventId} />
        </div>
        <AddToDealCalendarForm
          prefill={prefill}
          onClose={() => setOpen(false)}
          compact
          resetKey={`${eventId}:${initialTitleSeed ?? ''}:${open ? 'open' : 'closed'}`}
        />
      </div>
    </DialogContent>
  );

  // Default button — opens centered dialog.
  if (suggestions.length === 0) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <Button
            size="sm"
            variant="outline"
            className="h-8 w-full min-w-0 justify-start gap-1.5 px-2 text-xs"
            onClick={() => { void openWith(); }}
            disabled={ctx.isLoading && ctx.source === 'none'}
          >
            {effectiveLinkedDealId ? (
              <CalendarPlus className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ListPlus className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="truncate">Create follow-up</span>
          </Button>
        {dialogContent}
      </Dialog>
    );
  }

  // AI-suggested variant — Review chip pops the same form with the first suggestion.
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          'rounded-md border px-2.5 py-1.5 flex items-center gap-2',
          'border-emerald-500/30 bg-emerald-500/[0.05]',
        )}
      >
        <div
          className="flex items-center gap-1.5 min-w-0 flex-1 text-xs text-white"
          title={suggestions.join(' • ')}
        >
          <ListPlus className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="truncate">
            ▶ {suggestions.length} task{suggestions.length === 1 ? '' : 's'} suggested
          </span>
        </div>
        <Badge
          variant="outline"
          className="h-5 px-1.5 text-[10px] border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
        >
          <Sparkles className="h-2.5 w-2.5 mr-0.5" /> AI suggested
        </Badge>
        <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px] gap-1 text-emerald-200 hover:text-emerald-100 hover:bg-emerald-500/10 shrink-0"
            onClick={() => { void openWith(suggestions[0]); }}
          >
            Review
          </Button>
      </div>
      {dialogContent}
    </Dialog>
  );
}
