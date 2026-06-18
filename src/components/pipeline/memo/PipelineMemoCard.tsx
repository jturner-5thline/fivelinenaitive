import { memo } from 'react';
import type { Deal } from '@/types/deal';
import type { DealMilestone } from '@/types/deal';
import type { Deal24hDigest } from '@/hooks/useDeal24hDigest';
import type { PipelineDigestRaw } from '@/hooks/usePipelineDigests';
import type { DealTaskItem } from '@/hooks/usePipelineDealTasks';
import { Card } from '@/components/ui/card';
import { MemoHeader } from './MemoHeader';
import { ActivityPanel } from './ActivityPanel';
import { TasksMilestonesBand } from './TasksMilestonesBand';
import { NextBestActionRow } from './NextBestActionRow';
import { LendersPanel } from './LendersPanel';
import { CalendarPanel } from './CalendarPanel';

interface PipelineMemoCardProps {
  deal: Deal;
  /** Pre-computed 24h digest from the batched usePipelineDigests() hook. */
  digest?: Deal24hDigest;
  rawDigest?: PipelineDigestRaw;
  tasks?: DealTaskItem[];
  /**
   * Batched milestones from usePipelineDealMilestones(). Optional — when
   * absent the band falls back to `deal.milestones`, which is usually
   * empty for cards mounted from DealsContext (mapper does not hydrate
   * milestones for perf reasons).
   */
  milestones?: DealMilestone[];
  isDigestLoading?: boolean;
  /** Show the pulsing live-deal dot. Disabled for off-screen / bulk renders. */
  showLiveDot?: boolean;
  onOpenDeal?: (dealId: string) => void;
}

/**
 * 24h digest deal card used by the Pipeline & Clients memo view in
 * Daily Briefing and Niki's Daily Briefing.
 *
 * Layout:
 *   [ MemoHeader — name · badges · Live deal ]
 *   [ Tasks & milestones band ]
 *   ┌──────────┬──────────┬──────────┐
 *   │ Activity │  Emails  │ Lenders  │
 *   └──────────┴──────────┴──────────┘
 */
function PipelineMemoCardImpl({
  deal,
  digest,
  rawDigest,
  tasks,
  milestones,
  isDigestLoading,
  showLiveDot = true,
  onOpenDeal,
}: PipelineMemoCardProps) {
  const handleOpen = () => onOpenDeal?.(deal.id);

  return (
    <Card
      className="
        transition-all duration-200
        rounded-xl overflow-hidden
        min-h-[20rem] md:min-h-[22rem]
        flex flex-col
        border border-white/10
        bg-gradient-to-b from-white/[0.07] via-white/[0.04] to-white/[0.02]
        shadow-[0_10px_30px_-18px_rgba(0,0,0,0.7)]
      "
      // NOTE: do NOT set `content-visibility: auto` here. The card sits inside
      // a @tanstack/react-virtual absolute-positioned row whose offsets come
      // from each card's measured height. `content-visibility: auto` makes
      // off-screen cards report their `contain-intrinsic-size` (~320px) to
      // layout, so taller cards (long task lists, lender groups, expanded
      // follow-up form) end up overlapping their neighbours when they scroll
      // into view. `contain: layout paint` is safe and keeps repaints scoped.
      style={{ contain: 'paint' } as React.CSSProperties}
    >
      <MemoHeader deal={deal} showLiveDot={showLiveDot} onOpenDeal={handleOpen} />

      <NextBestActionRow deal={deal} tasks={tasks} rawDigest={rawDigest} />

      <div
        className="
          grid items-stretch flex-1 min-h-0
          [grid-template-columns:1fr]
          xl:[grid-template-columns:1fr_1fr]
          divide-y xl:divide-y-0 xl:divide-x divide-white/[0.08]
          bg-gradient-to-b from-transparent to-white/[0.015]
        "
      >
        <div className="min-w-0 flex flex-col min-h-0 overflow-y-auto">
          <TasksMilestonesBand
            deal={deal}
            tasks={tasks || []}
            milestones={milestones}
            rawDigest={rawDigest}
          />
          <ActivityPanel
            deal={deal}
            rawDigest={rawDigest}
            isLoading={!!isDigestLoading}
            emails={rawDigest?.emails || []}
          />
          <CalendarPanel deal={deal} tasks={tasks} onOpenDeal={handleOpen} />
        </div>
        <div className="min-w-0 min-h-0 overflow-y-auto">
          <LendersPanel deal={deal} />
        </div>
      </div>
    </Card>
  );
}

/**
 * Memoized to prevent re-render when sibling cards update. Re-renders only
 * when this deal's digest object identity changes.
 */
export const PipelineMemoCard = memo(PipelineMemoCardImpl, (prev, next) => {
  return (
    prev.deal === next.deal &&
    prev.digest === next.digest &&
    prev.rawDigest === next.rawDigest &&
    prev.tasks === next.tasks &&
    prev.milestones === next.milestones &&
    prev.isDigestLoading === next.isDigestLoading &&
    prev.showLiveDot === next.showLiveDot &&
    prev.onOpenDeal === next.onOpenDeal
  );
});