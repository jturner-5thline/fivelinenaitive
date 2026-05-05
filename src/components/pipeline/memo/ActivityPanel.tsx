import type { Deal } from '@/types/deal';
import type { PipelineDigestRaw } from '@/hooks/usePipelineDigests';

interface ActivityPanelProps {
  deal: Deal;
  rawDigest: PipelineDigestRaw | undefined;
  isLoading: boolean;
}

type Tone = 'reviewing' | 'onhold' | 'passed' | 'neutral';

const TONE_BAR: Record<Tone, string> = {
  reviewing: 'bg-emerald-500',
  onhold: 'bg-amber-500',
  passed: 'bg-muted-foreground/60',
  neutral: 'bg-primary/60',
};

function toneFromStage(stage?: string): Tone {
  const s = (stage || '').toLowerCase();
  if (/pass|declin|reject/.test(s)) return 'passed';
  if (/hold/.test(s)) return 'onhold';
  if (/review|diligence|terms|ioi|interest/.test(s)) return 'reviewing';
  return 'neutral';
}

/**
 * "Activity · Last 24h" column — renders compact stage-transition lines
 * (e.g. "PFG → in review (from on-deck)") sourced from the per-deal
 * activity_logs already loaded by usePipelineDigests().
 */
export function ActivityPanel({ deal, rawDigest, isLoading }: ActivityPanelProps) {
  if (isLoading) {
    return (
      <div className="p-5 space-y-2">
        <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
        <div className="h-3 w-full rounded bg-muted animate-pulse" />
        <div className="h-3 w-5/6 rounded bg-muted animate-pulse" />
      </div>
    );
  }

  const activities = rawDigest?.activities || [];
  const stageEvents = activities.filter((a) =>
    ['lender_stage_change', 'stage_change'].includes(a.activity_type),
  );

  return (
    <div className="p-5 flex flex-col h-full min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">
        Activity · Last 24h
      </div>

      {stageEvents.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No activity. Deal at <span className="font-semibold text-foreground">{deal.stage || '—'}</span>.
        </p>
      ) : (
        <div className="space-y-2">
          {stageEvents.slice(0, 6).map((a) => {
            const meta = (a.metadata as any) || {};
            const lender: string | undefined = meta.lender_name;
            const from: string | undefined = meta.from;
            const to: string | undefined = meta.to;
            const tone = toneFromStage(to);
            return (
              <div key={a.id} className="flex gap-2 items-start">
                <span className={`mt-1 h-3 w-0.5 rounded-sm ${TONE_BAR[tone]} shrink-0`} />
                <div className="text-xs leading-snug text-foreground">
                  {lender && <span className="font-semibold">{lender} </span>}
                  <span className="text-muted-foreground">→ </span>
                  <span>{to || 'updated'}</span>
                  {from && (
                    <span className="text-muted-foreground"> (from {from})</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}