import { useMemo, useState } from 'react';
import { Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { useAiActionQueue } from '@/hooks/useAiActionQueue';
import { useApprovalQueueScope, useMyManagedDealIds } from '@/hooks/useApprovalQueueScope';
import { useAdminRole } from '@/hooks/useAdminRole';
import { useDealAccessRequests } from '@/hooks/useDealAccessRequests';
import { useAllFlexInfoNotifications } from '@/hooks/useAllFlexInfoNotifications';
import { useApprovalQueueAccess } from '@/hooks/useApprovalQueueAccess';
import { TodayTab } from '@/components/dashboard/TodayTab';
import { useEndOfDayOutstandingCount } from '@/hooks/useEndOfDayOutstandingCount';
import { useTodayTasks } from '@/hooks/useTodayTasks';
import { consolidatedAiQueueCount } from '@/lib/consolidatedAiQueueCount';

/**
 * Header / sidebar badge that surfaces the count of pending AI Queue items
 * and opens the inline review panel.
 */
export function ActionQueueBadge() {
  const { enabled: queueEnabled } = useApprovalQueueAccess();
  const { data = [], refetch } = useAiActionQueue();
  const { data: accessRequests = [] } = useDealAccessRequests();
  const { data: flexRequests = [] } = useAllFlexInfoNotifications();
  const { isAdmin } = useAdminRole();
  const [scope] = useApprovalQueueScope();
  const scopeActive = isAdmin && scope === 'me';
  const { data: myDealIds } = useMyManagedDealIds(scopeActive);
  const eodCount = useEndOfDayOutstandingCount();
  const { counts: taskCounts } = useTodayTasks(true);

  // Mirror the consolidation + "Me" scope filtering performed in
  // ActionQueuePanel so the badge reflects the number of *visible* approval
  // queue items (bundles count as 1, and admins on the "Me" filter only see
  // their own deals).
  const { consolidatedAiCount, accessCount, flexCount } = useMemo(() => {
    if (!scopeActive) {
      return {
        consolidatedAiCount: consolidatedAiQueueCount(data),
        accessCount: accessRequests.length,
        flexCount: flexRequests.length,
      };
    }
    const ids = myDealIds ?? new Set<string>();
    const scopedItems = data.filter((it: any) => it.deal_id && ids.has(it.deal_id));
    return {
      consolidatedAiCount: consolidatedAiQueueCount(scopedItems),
      accessCount: accessRequests.filter((r: any) => r.deal_id && ids.has(r.deal_id)).length,
      flexCount: flexRequests.filter((r: any) => r.deal_id && ids.has(r.deal_id)).length,
    };
  }, [data, accessRequests, flexRequests, scopeActive, myDealIds]);
  const count = consolidatedAiCount + accessCount + flexCount + eodCount + taskCounts.total;
  const [open, setOpen] = useState(false);

  const label = useMemo(
    () => (count === 0 ? 'Today' : `Today · ${count}`),
    [count],
  );

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    // Refresh the queue every time the popover opens so the user always
    // sees the latest pending items.
    if (next) refetch();
  };

  // Master gate — Approval Queue is off or user is not on the 5th Line account.
  if (!queueEnabled) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        variant="ghost"
        size="sm"
        className="relative h-8 gap-1.5"
        aria-label={label}
        onClick={() => handleOpenChange(true)}
      >
        <Inbox className="h-4 w-4" />
        <span className="text-xs hidden sm:inline">Today</span>
        {count > 0 && (
          <Badge
            variant="destructive"
            className="h-4 min-w-4 px-1 text-[10px] absolute -top-1 -right-1"
          >
            {count}
          </Badge>
        )}
      </Button>
      <DialogContent
        className="popup-shell-surface dark p-0 gap-0 max-w-[95vw] w-[min(95vw,1600px)] h-[min(92dvh,1000px)] max-h-[92dvh] rounded-2xl overflow-hidden border-transparent glass-border-soft shadow-2xl shadow-black/20 flex flex-col"
      >
        <VisuallyHidden>
          <DialogTitle>Today</DialogTitle>
        </VisuallyHidden>
        <div className="flex-1 min-h-0 flex flex-col px-3 pb-3 pt-2">
          <TodayTab enabled={open} onClose={() => setOpen(false)} />
        </div>
      </DialogContent>
    </Dialog>
  );
}