import { memo } from 'react';
import type { Deal } from '@/types/deal';
import type { Deal24hDigest } from '@/hooks/useDeal24hDigest';
import type { PipelineDigestRaw } from '@/hooks/usePipelineDigests';
import type { DealTaskItem } from '@/hooks/usePipelineDealTasks';
import { Card } from '@/components/ui/card';
import { MemoHeader } from './MemoHeader';
import { ActivityPanel } from './ActivityPanel';
import { TasksMilestonesBand } from './TasksMilestonesBand';
import { NextBestActionRow } from './NextBestActionRow';
import { EmailsPanel } from './EmailsPanel';
import { LendersPanel } from './LendersPanel';

interface PipelineMemoCardProps {
  deal: Deal;
  /** Pre-computed 24h digest from the batched usePipelineDigests() hook. */
  digest?: Deal24hDigest;
  rawDigest?: PipelineDigestRaw;
  tasks?: DealTaskItem[];
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
  isDigestLoading,
  showLiveDot = true,
  onOpenDeal,
}: PipelineMemoCardProps) {
  const handleOpen = () => onOpenDeal?.(deal.id);

  return (
    <Card
      onClick={handleOpen}
      onKeyDown={e => { if (e.key === 'Enter') handleOpen(); }}
      tabIndex={0}
      role="button"
      aria-label={`Open deal memo for ${deal.company || deal.name}`}
      className="cursor-pointer transition-colors duration-150 hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
      // NOTE: do NOT set `content-visibility: auto` here. The card sits inside
      // a @tanstack/react-virtual absolute-positioned row whose offsets come
      // from each card's measured height. `content-visibility: auto` makes
      // off-screen cards report their `contain-intrinsic-size` (~320px) to
      // layout, so taller cards (long task lists, lender groups, expanded
      // follow-up form) end up overlapping their neighbours when they scroll
      // into view. `contain: layout paint` is safe and keeps repaints scoped.
      style={{ contain: 'paint' } as React.CSSProperties}
    >
      <MemoHeader deal={deal} showLiveDot={showLiveDot} />

      <TasksMilestonesBand deal={deal} tasks={tasks || []} rawDigest={rawDigest} />

      <NextBestActionRow deal={deal} tasks={tasks} rawDigest={rawDigest} />

      <div
        className="
          grid
          items-start
          [grid-template-columns:1fr]
          md:[grid-template-columns:1fr_1fr]
          lg:[grid-template-columns:1fr_1fr_minmax(240px,280px)]
          divide-y md:divide-y-0 md:divide-x divide-border
        "
      >
        <ActivityPanel
          deal={deal}
          rawDigest={rawDigest}
          isLoading={!!isDigestLoading}
        />
        <EmailsPanel emails={rawDigest?.emails || []} isLoading={!!isDigestLoading} />
        <LendersPanel deal={deal} />
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
    prev.isDigestLoading === next.isDigestLoading &&
    prev.showLiveDot === next.showLiveDot &&
    prev.onOpenDeal === next.onOpenDeal
  );
});