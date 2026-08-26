import { ListChecks } from 'lucide-react';
import { ActionQueuePanel } from '@/components/ai-queue/ActionQueuePanel';
import { EndOfDayTab } from '@/components/dashboard/EndOfDayTab';
import { useAiActionQueue } from '@/hooks/useAiActionQueue';
import { useDealAccessRequests } from '@/hooks/useDealAccessRequests';
import { useApprovalQueueAccess } from '@/hooks/useApprovalQueueAccess';
import { useEndOfDayOutstandingCount } from '@/hooks/useEndOfDayOutstandingCount';
import { consolidatedAiQueueCount } from '@/lib/consolidatedAiQueueCount';

/**
 * Today — the unified "what needs me right now?" surface.
 *
 * The approval queue (agent proposals) and end-of-day wrap-up items render
 * together in a single stacked tab; there are no sub-tabs.
 */

export type TodaySection = 'decisions' | 'wrapups' | 'tasks';

interface TodayTabProps {
  enabled?: boolean;
  onClose?: () => void;
  onNavigate?: (path: string) => void;
  targetAssigneeName?: string;
  targetUserId?: string;
  briefingType?: string;
  initialSection?: TodaySection;
}

export function TodayTab({
  enabled = true,
  onClose,
  onNavigate,
  targetAssigneeName,
  targetUserId,
  briefingType,
}: TodayTabProps) {
  const { enabled: queueEnabled } = useApprovalQueueAccess();
  const { data: queueItems = [] } = useAiActionQueue();
  const { data: accessRequests = [] } = useDealAccessRequests();
  const eodCount = useEndOfDayOutstandingCount();

  const decisionCount = queueEnabled
    ? consolidatedAiQueueCount(queueItems) + (accessRequests?.length || 0)
    : 0;

  const totalOutstanding = decisionCount + eodCount;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex shrink-0 items-center justify-end pb-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ListChecks className="h-3.5 w-3.5" />
          {totalOutstanding === 0
            ? 'All clear'
            : `${totalOutstanding} item${totalOutstanding === 1 ? '' : 's'} need you`}
        </span>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="flex min-w-0 flex-col gap-3">
          {queueEnabled && decisionCount > 0 && (
            <div className="min-w-0 h-[clamp(360px,46vh,520px)] overflow-hidden rounded-xl">
              <ActionQueuePanel items={queueItems} onClose={() => onClose?.()} />
            </div>
          )}

          <div className="min-w-0">
            <EndOfDayTab
              enabled={enabled}
              onNavigate={onNavigate}
              targetAssigneeName={targetAssigneeName}
              targetUserId={targetUserId}
              briefingType={briefingType}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default TodayTab;
