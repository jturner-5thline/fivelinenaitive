import { useCallback, useMemo } from 'react';
import { useLenderStages } from '@/contexts/LenderStagesContext';
import {
  extractChangePayload,
  resolveLenderActivityLabel,
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
    () => stages.map((s) => ({ id: s.id, key: s.id, label: s.label })),
    [stages],
  );
  const substageOptions = useMemo(
    () => substages.map((s) => ({ id: s.id, key: s.id, label: s.label })),
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

  const resolveLenderActivity = useCallback(
    (
      value: string | null | undefined,
      type: 'stage' | 'milestone',
      lenderId?: string | null,
    ) =>
      resolveLenderActivityLabel(
        value,
        type,
        lenderId ?? undefined,
        type === 'stage' ? stageOptions : substageOptions,
      ),
    [stageOptions, substageOptions],
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
      lenderId?: string | null;
    }): string => {
      const { activityType, description, metadata, lenderId } = params;
      const metadataRecord =
        metadata && typeof metadata === 'object' && !Array.isArray(metadata)
          ? (metadata as Record<string, unknown>)
          : null;
      const resolvedLenderId =
        lenderId ??
        (typeof metadataRecord?.lender_id === 'string' ? metadataRecord.lender_id : null) ??
        (typeof metadataRecord?.lenderId === 'string' ? metadataRecord.lenderId : null);

      if (activityType === 'lender_stage_change') {
        const { entityName, from, to } = extractChangePayload(
          metadata,
          description,
          'stage',
        );
        const fromLabel = resolveLenderActivity(from, 'stage', resolvedLenderId);
        const toLabel = resolveLenderActivity(to, 'stage', resolvedLenderId);
        const subject = entityName?.trim() || 'Funding Source';
        return `${subject} stage changed from ${fromLabel} to ${toLabel}`;
      }

      if (activityType === 'lender_substage_change') {
        const { entityName, from, to } = extractChangePayload(
          metadata,
          description,
          'milestone',
        );
        const fromLabel = resolveLenderActivity(to === from ? from : from, 'milestone', resolvedLenderId);
        const toLabel = resolveLenderActivity(to, 'milestone', resolvedLenderId);
        const subject = entityName?.trim() || 'Funding Source';
        return `${subject} milestone changed from ${fromLabel} to ${toLabel}`;
      }

      return description;
    },
    [resolveLenderActivity],
  );

  return {
    resolveStage,
    resolveSubstage,
    resolveLenderActivityLabel: resolveLenderActivity,
    formatLenderActivity,
    stageOptions,
    substageOptions,
  };
}
