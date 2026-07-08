import { useMemo, useState } from 'react';
import { Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { useAiActionQueue } from '@/hooks/useAiActionQueue';
import { useDealAccessRequests } from '@/hooks/useDealAccessRequests';
import { useAllFlexInfoNotifications } from '@/hooks/useAllFlexInfoNotifications';
import { useApprovalQueueAccess } from '@/hooks/useApprovalQueueAccess';
import { ActionQueuePanel } from './ActionQueuePanel';
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
  // Mirror the consolidation performed in ActionQueuePanel so the badge
  // reflects the number of *visible* approval queue items (bundles count as 1).
  const consolidatedAiCount = useMemo(() => consolidatedAiQueueCount(data), [data]);
  const count = consolidatedAiCount + accessRequests.length + flexRequests.length;
  const [open, setOpen] = useState(false);

  const label = useMemo(
    () => (count === 0 ? 'Approval Queue' : `Approval Queue · ${count}`),
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
        <span className="text-xs hidden sm:inline">Queue</span>
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
          <DialogTitle>Approval Queue</DialogTitle>
        </VisuallyHidden>
        <ActionQueuePanel items={data} onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}