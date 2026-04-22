import type { Deal } from '@/types/deal';
import { useDeal24hDigest } from '@/hooks/useDeal24hDigest';
import { MemoHeader } from './MemoHeader';
import { ActivityPanel } from './ActivityPanel';
import { MilestonesPanel } from './MilestonesPanel';
import { LendersPanel } from './LendersPanel';
import { MemoFooter } from './MemoFooter';

interface PipelineMemoCardProps {
  deal: Deal;
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
export function PipelineMemoCard({ deal, onOpenDeal }: PipelineMemoCardProps) {
  const { data: digest, isLoading } = useDeal24hDigest(deal);

  const handleOpen = () => onOpenDeal?.(deal.id);

  return (
    <article
      className="pipeline-memo-glass overflow-hidden cursor-pointer transition-transform duration-150 hover:-translate-y-0.5"
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
        <ActivityPanel digest={digest} isLoading={isLoading} />
        <MilestonesPanel deal={deal} />
        <LendersPanel deal={deal} />
      </div>

      <MemoFooter />
    </article>
  );
}