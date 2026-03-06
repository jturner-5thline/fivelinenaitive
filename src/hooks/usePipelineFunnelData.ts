import { useMemo } from 'react';
import { Deal } from '@/types/deal';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { usePipelineStageConfig } from '@/hooks/usePipelineStageConfig';

export interface StageDistribution {
  stageId: string;
  label: string;
  color: string;
  /** CSS-ready color value */
  cssColor: string;
  count: number;
  volume: number;
  percent: number;
}

const COLOR_MAP: Record<string, string> = {
  'bg-slate-500': 'hsl(215, 16%, 47%)',
  'bg-blue-500': 'hsl(217, 91%, 60%)',
  'bg-indigo-500': 'hsl(239, 84%, 67%)',
  'bg-violet-500': 'hsl(258, 90%, 66%)',
  'bg-purple-500': 'hsl(271, 91%, 65%)',
  'bg-fuchsia-500': 'hsl(292, 84%, 61%)',
  'bg-amber-500': 'hsl(38, 92%, 50%)',
  'bg-cyan-500': 'hsl(188, 86%, 53%)',
  'bg-success': 'hsl(142, 71%, 45%)',
  'bg-destructive': 'hsl(0, 84%, 60%)',
  'bg-muted': 'hsl(215, 16%, 47%)',
  'bg-green-500': 'hsl(142, 71%, 45%)',
  'bg-yellow-500': 'hsl(48, 96%, 53%)',
  'bg-red-500': 'hsl(0, 84%, 60%)',
  'bg-orange-500': 'hsl(25, 95%, 53%)',
  'bg-pink-500': 'hsl(330, 81%, 60%)',
  'bg-teal-500': 'hsl(168, 76%, 42%)',
};

export function getStageBarColor(colorClass: string): string {
  return COLOR_MAP[colorClass] || 'hsl(var(--primary))';
}

/**
 * Shared hook that computes stage distribution for the given (pipeline-scoped) deals.
 * Returns stages in pipeline order (earliest → latest), not sorted by volume.
 */
export function usePipelineFunnelData(deals: Deal[]) {
  const { activePipeline } = usePipelineContext();
  const { getStageConfigForDeal } = usePipelineStageConfig();

  const activeDeals = useMemo(() => deals.filter(d => d.status !== 'archived'), [deals]);
  const totalVolume = useMemo(() => activeDeals.reduce((sum, d) => sum + d.value, 0), [activeDeals]);
  const totalCount = activeDeals.length;

  // Build ordered stage list from pipeline config
  const pipelineStageOrder = useMemo(() => {
    if (activePipeline?.stages?.length) {
      return activePipeline.stages.map(s => s.id);
    }
    return null; // fallback: use encountered order
  }, [activePipeline]);

  const stages: StageDistribution[] = useMemo(() => {
    const groups: Record<string, { volume: number; count: number }> = {};

    activeDeals.forEach(deal => {
      const stage = deal.stage || 'unknown';
      if (!groups[stage]) groups[stage] = { volume: 0, count: 0 };
      groups[stage].volume += deal.value || 0;
      groups[stage].count += 1;
    });

    const entries = Object.entries(groups).map(([stageId, data]) => {
      const config = getStageConfigForDeal(stageId, activePipeline?.id);
      return {
        stageId,
        label: config.label,
        color: config.color,
        cssColor: getStageBarColor(config.color),
        count: data.count,
        volume: data.volume,
        percent: totalVolume > 0 ? (data.volume / totalVolume) * 100 : 0,
      };
    });

    // Sort by pipeline stage order if available
    if (pipelineStageOrder) {
      const orderMap = new Map(pipelineStageOrder.map((id, i) => [id, i]));
      entries.sort((a, b) => {
        const aIdx = orderMap.get(a.stageId) ?? 999;
        const bIdx = orderMap.get(b.stageId) ?? 999;
        return aIdx - bIdx;
      });
    }

    return entries;
  }, [activeDeals, totalVolume, getStageConfigForDeal, activePipeline, pipelineStageOrder]);

  // Also provide a volume-descending version for the popup
  const stagesByVolume = useMemo(() => {
    return [...stages].sort((a, b) => b.volume - a.volume);
  }, [stages]);

  return {
    stages,
    stagesByVolume,
    activeDeals,
    totalVolume,
    totalCount,
    pipelineName: activePipeline?.name || 'All Deals',
  };
}
