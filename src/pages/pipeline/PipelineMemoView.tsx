import { useMemo } from 'react';
import type { Deal } from '@/types/deal';
import { PipelineMemoCard } from '@/components/pipeline/memo/PipelineMemoCard';

interface PipelineMemoViewProps {
  deals: Deal[];
  /** Empty-state message when no deals match the filter. */
  emptyMessage?: string;
  onOpenDeal?: (dealId: string) => void;
}

/**
 * Stack of glass-morphism PipelineMemoCard components — one per deal.
 * Rendered inside the Daily Briefing modal's "Pipeline & Clients" tab
 * when the user has the Memo view selected.
 */
export function PipelineMemoView({ deals, emptyMessage = 'No deals to summarize.', onOpenDeal }: PipelineMemoViewProps) {
  // Surface most-recently-updated first (matches digest cadence).
  const sorted = useMemo(() => {
    return [...deals].sort((a, b) => {
      const at = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bt = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bt - at;
    });
  }, [deals]);

  if (sorted.length === 0) {
    return (
      <div className="pipeline-memo-page rounded-xl py-12 px-4 text-center">
        <p className="text-[#4a6070] text-sm font-light italic">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="pipeline-memo-page -mx-1 px-3 py-5 rounded-xl">
      <div className="space-y-5 max-w-[1100px] mx-auto">
        {sorted.map(deal => (
          <PipelineMemoCard key={deal.id} deal={deal} onOpenDeal={onOpenDeal} />
        ))}
      </div>
    </div>
  );
}