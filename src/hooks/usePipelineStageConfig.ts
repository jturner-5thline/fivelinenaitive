import { useMemo } from 'react';
import { useDealStages } from '@/contexts/DealStagesContext';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { STAGE_CONFIG } from '@/types/deal';

/**
 * Returns a function that resolves a stage config (label + color)
 * by checking the deal's pipeline stages first, then global stages, then STAGE_CONFIG fallback.
 */
export function usePipelineStageConfig() {
  const { getStageConfig } = useDealStages();
  const { pipelines } = usePipelineContext();
  const globalConfig = getStageConfig();

  // Build a map of pipelineId -> stage config
  const pipelineStageConfigs = useMemo(() => {
    const map = new Map<string, Record<string, { label: string; color: string }>>();
    for (const pipeline of pipelines) {
      const config: Record<string, { label: string; color: string }> = {};
      for (const stage of pipeline.stages) {
        config[stage.id] = { label: stage.label, color: stage.color };
      }
      map.set(pipeline.id, config);
    }
    return map;
  }, [pipelines]);

  /**
   * Resolve stage config for a deal, checking its pipeline first.
   */
  const getStageConfigForDeal = (stageId: string, pipelineId?: string | null) => {
    // 1. Check the deal's specific pipeline
    if (pipelineId) {
      const pipelineConfig = pipelineStageConfigs.get(pipelineId);
      if (pipelineConfig?.[stageId]) {
        return pipelineConfig[stageId];
      }
    }

    // 2. Check global/company stages
    if (globalConfig[stageId]) {
      return globalConfig[stageId];
    }

    // 3. Fallback to hardcoded STAGE_CONFIG
    if (STAGE_CONFIG[stageId]) {
      return STAGE_CONFIG[stageId];
    }

    // 4. Final fallback
    return { label: stageId, color: 'bg-muted' };
  };

  return { getStageConfigForDeal };
}
