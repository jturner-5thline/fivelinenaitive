/**
 * StageMeetingTitleChip
 * ---------------------
 * Fix #3 — Action chip rendered in AiAssistSidebar when the deal's stage
 * changed within the last 7 days. Surfaces the stage-driven meeting title
 * that should now be used, with a click to copy or open the scheduler.
 *
 * Lightweight by design — does not query the calendar to see which
 * specific upcoming event needs renaming; the user wires that workflow.
 * The chip's job is purely to nudge: "stage shifted, here is the new
 * canonical title".
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { CalendarClock, Copy, X } from 'lucide-react';
import { toast } from 'sonner';
import { useRenderMeetingTitle } from '@/hooks/useRenderMeetingTitle';
import { useDealStages } from '@/contexts/DealStagesContext';

const DISMISS_KEY_PREFIX = 'naitive.stageMeetingTitleChip.dismissed.';
const WINDOW_DAYS = 7;

interface Props {
  dealId?: string | null;
  /** Optional callback to open the scheduler (so the user can confirm
   *  the renamed event end-to-end). */
  onOpenScheduler?: () => void;
}

export function StageMeetingTitleChip({ dealId, onOpenScheduler }: Props) {
  const { render } = useRenderMeetingTitle(dealId ?? null);
  const { stages } = useDealStages();
  const [recentChange, setRecentChange] = useState<{
    from: string | null;
    to: string;
    changedAt: string;
  } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!dealId) { setRecentChange(null); return; }
    try {
      if (localStorage.getItem(DISMISS_KEY_PREFIX + dealId) === '1') {
        setDismissed(true);
      } else {
        setDismissed(false);
      }
    } catch { /* ignore */ }
    (async () => {
      const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();
      const { data } = await supabase
        .from('deal_stage_history')
        .select('from_stage, to_stage, changed_at')
        .eq('deal_id', dealId)
        .gte('changed_at', since)
        .order('changed_at', { ascending: false })
        .limit(1);
      if (cancelled) return;
      const row = (data ?? [])[0];
      if (row && row.from_stage && row.from_stage !== row.to_stage) {
        setRecentChange({ from: row.from_stage, to: row.to_stage, changedAt: row.changed_at });
      } else {
        setRecentChange(null);
      }
    })();
    return () => { cancelled = true; };
  }, [dealId]);

  if (!dealId || !recentChange || dismissed) return null;

  const newStageLabel =
    stages.find((s) => s.id === recentChange.to || s.label.toLowerCase() === recentChange.to.toLowerCase())?.label
    ?? recentChange.to;
  const title = render();
  if (!title) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY_PREFIX + dealId, '1'); } catch { /* ignore */ }
    setDismissed(true);
  };

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 px-2.5 py-2 text-[11.5px] text-foreground/90 flex items-start gap-2">
      <CalendarClock className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-foreground/80">
          Stage changed to <span className="font-medium text-foreground">{newStageLabel}</span>. Update next meeting title?
        </div>
        <div className="mt-1 font-mono text-[10.5px] text-foreground truncate" title={title}>
          {title}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10.5px]"
            onClick={() => {
              navigator.clipboard?.writeText(title);
              toast.success('Meeting title copied.');
            }}
          >
            <Copy className="h-3 w-3 mr-1" /> Copy
          </Button>
          {onOpenScheduler && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10.5px]"
              onClick={onOpenScheduler}
            >
              Open scheduler
            </Button>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
