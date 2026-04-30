import { useState } from 'react';
import { Inbox as InboxIcon, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAiActionQueue, useAiActionQueueCount } from '@/hooks/useAiActionQueue';
import { ActionQueuePanel } from '@/components/ai-queue/ActionQueuePanel';

/**
 * Compact dashboard widget that surfaces the AI Action Queue above the
 * assistant input. Clicking opens a modal with the full queue panel —
 * no separate page or sidebar destination.
 */
export function ActionQueueWidget() {
  const [open, setOpen] = useState(false);
  const count = useAiActionQueueCount();
  const { data: items = [] } = useAiActionQueue();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'group mb-3 w-full rounded-xl border border-border/40 bg-card/60 backdrop-blur',
          'supports-[backdrop-filter]:bg-card/40 px-3 py-2.5 flex items-center justify-between gap-3',
          'transition-colors hover:bg-card/80 hover:border-border/60 text-left',
        )}
        aria-label={`Open Action Queue${count > 0 ? `, ${count} pending` : ''}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-7 w-7 rounded-md bg-muted/60 flex items-center justify-center shrink-0">
            <InboxIcon className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground leading-tight truncate">
              Action Queue
            </p>
            <p className="text-[11px] text-muted-foreground leading-tight truncate">
              {count > 0
                ? `${count} AI suggestion${count === 1 ? '' : 's'} awaiting review`
                : 'No pending AI actions'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {count > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {count}
            </Badge>
          )}
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[640px] p-0 overflow-hidden flex flex-col max-h-[80vh]">
          <DialogHeader className="sr-only">
            <DialogTitle>Action Queue</DialogTitle>
          </DialogHeader>
          <ActionQueuePanel items={items} onClose={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}