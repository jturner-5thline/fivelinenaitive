import { useMemo, useState } from 'react';
import { Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAiActionQueue, useAiActionQueueCount } from '@/hooks/useAiActionQueue';
import { useDealAccessRequests } from '@/hooks/useDealAccessRequests';
import { useApprovalQueueAccess } from '@/hooks/useApprovalQueueAccess';
import { ActionQueuePanel } from './ActionQueuePanel';

/**
 * Header / sidebar badge that surfaces the count of pending AI Queue items
 * and opens the inline review panel.
 */
export function ActionQueueBadge() {
  const { enabled: queueEnabled } = useApprovalQueueAccess();
  const aiCount = useAiActionQueueCount();
  const { data = [], refetch } = useAiActionQueue();
  const { data: accessRequests = [] } = useDealAccessRequests();
  const count = aiCount + accessRequests.length;
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
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative h-8 gap-1.5"
          aria-label={label}
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
      </PopoverTrigger>
      <PopoverContent
        className="w-[420px] p-0 max-h-[80vh] overflow-hidden flex flex-col"
        align="end"
      >
        <ActionQueuePanel items={data} onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}