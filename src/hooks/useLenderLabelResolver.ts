import { useCallback, useMemo } from 'react';
import { useLenderStages } from '@/contexts/LenderStagesContext';
import {
  extractChangePayload,
  resolveStageLabel,
  resolveSubstageLabel,
} from '@/lib/lenderStageFormat';

/**
 * Single source of truth for rendering historical lender stage / milestone
 * values in the UI. Resolves IDs, slugs, and legacy labels against the
 * current LenderStagesContext config so the activity feed can never drift
 * out of sync with the lender row dropdowns.
 */
export function useLenderLabelResolver() {
  const { stages, substages } = useLenderStages();

  const stageOptions = useMemo(
    () => stages.map((s) => ({ id: s.id, label: s.label })),
    [stages],
  );
  const substageOptions = useMemo(
    () => substages.map((s) => ({ id: s.id, label: s.label })),
    [substages],
  );

  const resolveStage = useCallback(
    (value: string | null | undefined) => resolveStageLabel(value, stageOptions),
    [stageOptions],
  );

  const resolveSubstage = useCallback(
    (value: string | null | undefined) =>
      resolveSubstageLabel(value, substageOptions),
    [substageOptions],
  );

  /**
   * Rebuild a "<lender> stage changed from X to Y" / "<lender> milestone
   * changed from X to Y" sentence with fully resolved, humanized labels.
   * Falls back to the original description if we cannot extract a payload.
   */
  const formatLenderActivity = useCallback(
    (params: {
      activityType: string;
      description: string;
      metadata: unknown;
    }): string => {
      const { activityType, description, metadata } = params;

      if (activityType === 'lender_stage_change') {
        const { entityName, from, to } = extractChangePayload(
          metadata,
          description,
          'stage',
        );
        const fromLabel = resolveStage(from);
        const toLabel = resolveStage(to);
        const subject = entityName?.trim() || 'Lender';
        return `${subject} stage changed from ${fromLabel} to ${toLabel}`;
      }

      if (activityType === 'lender_substage_change') {
        const { entityName, from, to } = extractChangePayload(
          metadata,
          description,
          'milestone',
        );
        const fromLabel = resolveSubstage(from);
        const toLabel = resolveSubstage(to);
        const subject = entityName?.trim() || 'Lender';
        return `${subject} milestone changed from ${fromLabel} to ${toLabel}`;
      }

      return description;
    },
    [resolveStage, resolveSubstage],
  );

  return {
    resolveStage,
    resolveSubstage,
    formatLenderActivity,
    stageOptions,
    substageOptions,
  };
}
