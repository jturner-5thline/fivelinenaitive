import type { Deal } from '@/types/deal';
import { PipelineMemoCard } from '@/components/pipeline/memo/PipelineMemoCard';
import { usePipelineDigests } from '@/hooks/usePipelineDigests';
import { usePipelineDealTasks } from '@/hooks/usePipelineDealTasks';
import { usePipelineDealMilestones } from '@/hooks/usePipelineDealMilestones';

interface DealInlineSummaryProps {
  deal: Deal;
  onOpenDeal?: (dealId: string) => void;
  onClose?: () => void;
}

/**
 * Inline single-deal summary for the Deals page right pane.
 * Renders only the canonical Deal Rundown detail card (PipelineMemoCard)
 * without the master list / filter chips that PipelineMemoView ships with.
 */
export function DealInlineSummary({ deal, onOpenDeal, onClose }: DealInlineSummaryProps) {
  const deals = [deal];
  const { digestMap, rawByDeal, isLoading } = usePipelineDigests(deals, true);
  const { data: tasksByDeal } = usePipelineDealTasks([deal.id], true);
  const { data: milestonesByDeal } = usePipelineDealMilestones([deal.id], true);

  return (
    <div className="deal-inline-panel flex flex-col h-full min-h-0 min-w-0 overflow-auto [&>*]:flex-1 [&>*]:min-h-0 [&>*]:h-full [&>*]:!bg-transparent [&>*]:!border-0 [&>*]:!rounded-none [&>*]:!shadow-none">
      <PipelineMemoCard
        deal={deal}
        digest={digestMap.get(deal.id)}
        rawDigest={rawByDeal.get(deal.id)}
        tasks={tasksByDeal?.get(deal.id) || []}
        milestones={milestonesByDeal?.get(deal.id)}
        isDigestLoading={isLoading}
        showLiveDot
        onOpenDeal={onOpenDeal}
        onClose={onClose}
      />
    </div>
  );
}