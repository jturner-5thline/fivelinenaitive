import { memo } from 'react';
import type { Deal } from '@/types/deal';
import type { Deal24hDigest } from '@/hooks/useDeal24hDigest';
import { MemoHeader } from './MemoHeader';
import { ActivityPanel } from './ActivityPanel';
import { MilestonesPanel } from './MilestonesPanel';
import { LendersPanel } from './LendersPanel';
import { MemoFooter } from './MemoFooter';

interface PipelineMemoCardProps {
  deal: Deal;
  /** Pre-computed 24h digest from the batched usePipelineDigests() hook. */
  digest?: Deal24hDigest;
  isDigestLoading?: boolean;
  /** Show the pulsing live-deal dot. Disabled for off-screen / bulk renders. */
  showLiveDot?: boolean;
  onOpenDeal?: (dealId: string) => void;
}

/**
 * One glass-morphism deal memo card.
 *
 * Layout:
 *   [ MemoHeader ]
 *   ┌─────────────┬─────────────┬───────────┐
 *   │  Activity   │ Milestones  │  Lenders  │   ← grid-cols [1fr 1fr 280px]
 *   └─────────────┴─────────────┴───────────┘
 *   [ MemoFooter ]
 */
function PipelineMemoCardImpl({ deal, digest, isDigestLoading, showLiveDot = true, onOpenDeal }: PipelineMemoCardProps) {
  const handleOpen = () => onOpenDeal?.(deal.id);

  return (
    <article
      className="pipeline-memo-card overflow-hidden cursor-pointer transition-transform duration-150 hover:-translate-y-0.5"
      style={{ contain: 'layout paint', willChange: 'transform' }}
      onClick={handleOpen}
      onKeyDown={e => { if (e.key === 'Enter') handleOpen(); }}
      tabIndex={0}
      role="button"
      aria-label={`Open deal memo for ${deal.company || deal.name}`}
    >
      <MemoHeader deal={deal} />

      <div
        className="
          grid
          [grid-template-columns:1fr]
          md:[grid-template-columns:1fr_1fr]
          lg:[grid-template-columns:1fr_1fr_280px]
          divide-y md:divide-y-0 md:divide-x divide-white/45
        "
      >
        <ActivityPanel digest={digest} isLoading={!!isDigestLoading} />
        <MilestonesPanel deal={deal} />
        <LendersPanel deal={deal} />
      </div>

      <MemoFooter showLiveDot={showLiveDot} />
    </article>
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
    prev.isDigestLoading === next.isDigestLoading &&
    prev.showLiveDot === next.showLiveDot &&
    prev.onOpenDeal === next.onOpenDeal
  );
});