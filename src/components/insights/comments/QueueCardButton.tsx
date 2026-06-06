import { useMemo } from 'react';
import { PromoteToQueueButton } from './PromoteToQueueButton';
import type { ReportQueueSourceType } from '@/hooks/useReportAgendaQueue';

/**
 * Drop-in "Add to Queue" pill for KPI cards, chart tiles, and table rows
 * on Insights tabs. Stages the card on the shared Agenda Queue without
 * requiring a typed comment.
 *
 * Example:
 *   <QueueCardButton
 *     reportTab="Insights Dashboard"
 *     sourceType="kpi"
 *     sourceId="revenue-ytd"
 *     sourceLabel="Revenue YTD"
 *     getSnapshotText={() => `Revenue YTD: ${formatted}`}
 *   />
 *
 * The whole-card variant is also wired automatically through
 * `data-comment-source*` attributes on cards (right-click → composer).
 */
export function QueueCardButton({
  reportTab,
  sourceType,
  sourceId,
  sourceLabel,
  getSnapshotText,
  size = 'xs',
  variant = 'ghost',
}: {
  reportTab: string;
  sourceType: ReportQueueSourceType;
  sourceId: string;
  sourceLabel: string;
  getSnapshotText?: () => string;
  size?: 'sm' | 'xs';
  variant?: 'ghost' | 'solid';
}) {
  const inputFactory = useMemo(
    () => () => ({
      reportTab,
      sourceType,
      sourceId,
      sourceAnchor: `${sourceType}:${sourceId}`,
      sourceSnapshotText: (getSnapshotText?.() || sourceLabel).slice(0, 4000),
      sourceLabel,
      commentSource: 'qir' as const,
      commentId: null,
      commentTextSnapshot: `${sourceLabel}: ${(getSnapshotText?.() || '').slice(0, 280)}`.trim(),
    }),
    [reportTab, sourceType, sourceId, sourceLabel, getSnapshotText],
  );
  return <PromoteToQueueButton input={inputFactory} size={size} variant={variant} />;
}