import { useState } from 'react';
import { Inbox as InboxIcon, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useAiActionQueue, useAiActionQueueCount } from '@/hooks/useAiActionQueue';
import { useDealAccessRequests } from '@/hooks/useDealAccessRequests';
import { ActionQueuePanel } from '@/components/ai-queue/ActionQueuePanel';

/**
 * Compact dashboard widget that surfaces the AI Action Queue above the
 * assistant input. Clicking opens a modal with the full queue panel —
 * no separate page or sidebar destination.
 */
export function ActionQueueWidget() {
  const [open, setOpen] = useState(false);
  const aiCount = useAiActionQueueCount();
  const { data: items = [], refetch } = useAiActionQueue();
  const { data: accessRequests = [] } = useDealAccessRequests();
  const count = aiCount + accessRequests.length;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    // Auto-refresh queue contents whenever the modal opens so the user
    // always sees the latest pending AI actions, even if the cache is warm.
    if (next) refetch();
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => handleOpenChange(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleOpenChange(true);
          }
        }}
        className={cn(
          'group mb-3 w-full rounded-xl border border-border/40 bg-card/60 backdrop-blur cursor-pointer',
          'supports-[backdrop-filter]:bg-card/40 px-3 py-2.5 flex items-center justify-between gap-3',
          'transition-colors hover:bg-card/80 hover:border-border/60 text-left',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
        aria-label={`Open Action Queue${count > 0 ? `, ${count} pending` : ''}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-7 w-7 rounded-md bg-muted/60 flex items-center justify-center shrink-0">
            <InboxIcon className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground leading-tight truncate flex items-center gap-1.5">
              <span>Action Queue</span>
              {count > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    // Stop bubbling so the surrounding tile-button doesn't
                    // also fire (which would double-toggle the dialog).
                    e.stopPropagation();
                    handleOpenChange(true);
                  }}
                  aria-label={`${count} pending — open Action Queue`}
                  title={`${count} pending — open Action Queue`}
                  className="inline-flex items-center justify-center rounded-full h-4 min-w-[16px] px-1 text-[10px] font-semibold bg-[hsl(var(--outlook-blue))] text-white leading-none cursor-pointer hover:bg-[hsl(var(--outlook-blue)/0.85)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--outlook-blue))] focus-visible:ring-offset-1 transition-colors"
                >
                  {count > 99 ? '99+' : count}
                </button>
              )}
            </p>
            <p className="text-[11px] text-muted-foreground leading-tight truncate">
              {count > 0
                ? `${count} item${count === 1 ? '' : 's'} awaiting review`
                : 'No pending AI actions'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
        </div>
      </div>

      <Dialog open={open} onOpenChange={handleOpenChange}>
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