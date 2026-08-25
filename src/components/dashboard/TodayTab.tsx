import { useMemo, useState } from 'react';
import { CheckSquare, Inbox, ListChecks, Sunset } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ActionQueuePanel } from '@/components/ai-queue/ActionQueuePanel';
import { EndOfDayTab } from '@/components/dashboard/EndOfDayTab';
import { TodayTasksPanel } from '@/components/dashboard/TodayTasksPanel';
import { useAiActionQueue } from '@/hooks/useAiActionQueue';
import { useDealAccessRequests } from '@/hooks/useDealAccessRequests';
import { useApprovalQueueAccess } from '@/hooks/useApprovalQueueAccess';
import { useEndOfDayOutstandingCount } from '@/hooks/useEndOfDayOutstandingCount';
import { useTodayTasks } from '@/hooks/useTodayTasks';
import { consolidatedAiQueueCount } from '@/lib/consolidatedAiQueueCount';

/**
 * Today — the unified "what needs me right now?" surface.
 *
 * Consolidates what used to be three disparate destinations (Approval Queue,
 * End of Day, My Tasks) into one tab with three card shapes:
 *
 *   1. Decisions  — agent proposals awaiting approve/reject (ai_action_queue)
 *   2. Wrap-ups   — meetings/events that haven't been closed out (End of Day)
 *   3. Tasks      — the today slice only (overdue, due today, queue-blocking)
 *
 * Both original card renderers are preserved verbatim; only the entry points,
 * counts, and scoping are merged. My Tasks survives as the full browsable list.
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
  initialSection,
}: TodayTabProps) {
  const { enabled: queueEnabled } = useApprovalQueueAccess();
  const { data: queueItems = [] } = useAiActionQueue();
  const { data: accessRequests = [] } = useDealAccessRequests();
  const eodCount = useEndOfDayOutstandingCount();
  const { counts: taskCounts } = useTodayTasks(enabled);

  const decisionCount = queueEnabled
    ? consolidatedAiQueueCount(queueItems) + (accessRequests?.length || 0)
    : 0;

  const [section, setSection] = useState<TodaySection>(
    initialSection ?? (queueEnabled && decisionCount > 0 ? 'decisions' : 'wrapups'),
  );

  const segments = useMemo(
    () =>
      [
        queueEnabled
          ? { key: 'decisions' as const, label: 'Decisions', icon: Inbox, count: decisionCount }
          : null,
        { key: 'wrapups' as const, label: 'Wrap-ups', icon: Sunset, count: eodCount },

      ].filter(Boolean) as Array<{
        key: TodaySection;
        label: string;
        icon: typeof Inbox;
        count: number;
      }>,
    [queueEnabled, decisionCount, eodCount, taskCounts.total],
  );

  const activeSection = segments.some(s => s.key === section) ? section : segments[0]?.key ?? 'wrapups';
  const totalOutstanding = decisionCount + eodCount + taskCounts.total;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {/* Segmented control — one surface, three card shapes. */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 pb-2">
        <div className="inline-flex items-center gap-1 rounded-lg border border-border/40 bg-white/[0.03] p-1">
          {segments.map(s => {
            const Icon = s.icon;
            const active = s.key === activeSection;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSection(s.key)}
                aria-pressed={active}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                  active
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-white/[0.06] hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {s.label}
                {s.count > 0 && (
                  <span
                    className={cn(
                      'ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums',
                      active ? 'bg-primary/25 text-primary' : 'bg-white/10 text-foreground/80',
                    )}
                  >
                    {s.count > 99 ? '99+' : s.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ListChecks className="h-3.5 w-3.5" />
          {totalOutstanding === 0
            ? 'All clear'
            : `${totalOutstanding} item${totalOutstanding === 1 ? '' : 's'} need you`}
        </span>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {queueEnabled && (
          <div className={cn('h-full min-h-0 flex-col', activeSection === 'decisions' ? 'flex' : 'hidden')}>
            <ActionQueuePanel items={queueItems} onClose={() => onClose?.()} />
          </div>
        )}
        <div className={cn('h-full min-h-0 flex-col', activeSection === 'wrapups' ? 'flex' : 'hidden')}>
          <EndOfDayTab
            enabled={enabled && activeSection === 'wrapups'}
            onNavigate={onNavigate}
            targetAssigneeName={targetAssigneeName}
            targetUserId={targetUserId}
            briefingType={briefingType}
          />
        </div>
      </div>
    </div>
  );
}

export default TodayTab;