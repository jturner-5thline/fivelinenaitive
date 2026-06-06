import React, { useRef } from 'react';
import { QirContextualComments } from '@/components/metrics/dashboards/qir/QirContextualComments';

/**
 * Shared Insights selection-to-queue surface.
 *
 * Wraps any Insights tab (Agenda, Dashboard, Forecasts, Key Metrics,
 * JT/JM/SW…) in a ref'd container and mounts the contextual comments
 * + queue system on it. Users can:
 *   - Right-click anywhere → composer pops up → comment auto-stages on
 *     the shared Agenda Queue with source snippet for traceability.
 *   - Highlight text first → composer captures the selection as the
 *     snippet.
 *   - Click an explicit per-item Queue button (see `QueueCardButton`)
 *     in card headers to queue a whole KPI / chart tile.
 *
 * All entry points feed the same `report_agenda_queue` table, scoped by
 * the current Insights reporting period and the per-tab `reportKey`.
 *
 * Cards/sections opt into rich source attribution by setting:
 *   data-comment-source="kpi|chart|narrative|goal|initiative|risk|section"
 *   data-comment-source-id="<stable id>"
 *   data-comment-source-label="<human label>"
 * Without those attrs the right-click still resolves to the nearest
 * configured section anchor and falls back to a tab-level label.
 */
export function InsightsContextualSurface({
  reportKey,
  reportLabel,
  sectionIdPrefix,
  sectionLabels,
  fallbackSourceLabel,
  children,
  className,
  style,
}: {
  reportKey: string;
  reportLabel: string;
  sectionIdPrefix?: string;
  sectionLabels?: Record<string, string>;
  fallbackSourceLabel?: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className={className} style={style}>
      {children}
      <QirContextualComments
        reportKey={reportKey}
        reportLabel={reportLabel}
        rootRef={ref}
        sectionIdPrefix={sectionIdPrefix}
        sectionLabels={sectionLabels}
        fallbackSourceLabel={fallbackSourceLabel}
      />
    </div>
  );
}