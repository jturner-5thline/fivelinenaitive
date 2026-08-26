/**
 * Unified queue surface — approval-queue items and end-of-day wrap-up items
 * intermingled in a single list, all rendered with the End of Day tile design.
 *
 * Approval items are passed into <EndOfDayTab> which merges them into its
 * outstanding list; selecting one opens the standard approval review pane.
 */
import { useAiActionQueue } from '@/hooks/useAiActionQueue';
import { useApprovalQueueAccess } from '@/hooks/useApprovalQueueAccess';
import { EndOfDayTab } from '@/components/dashboard/EndOfDayTab';

export function UnifiedQueueTab({
  enabled,
  onNavigate,
  targetUserId,
}: {
  enabled: boolean;
  onNavigate?: (path: string) => void;
  targetUserId?: string;
}) {
  const { enabled: queueEnabled } = useApprovalQueueAccess();
  const { data: queueItems = [] } = useAiActionQueue();

  return (
    <EndOfDayTab
      enabled={enabled}
      onNavigate={onNavigate}
      targetUserId={targetUserId}
      approvalItems={queueEnabled ? queueItems : []}
    />
  );
}
