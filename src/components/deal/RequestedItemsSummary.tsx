import { ListChecks, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { OutstandingItem } from '@/hooks/useOutstandingItems';

interface RequestedItemsSummaryProps {
  items: OutstandingItem[];
  lenderName: string;
  onViewAll: () => void;
}

export function RequestedItemsSummary({ items, lenderName, onViewAll }: RequestedItemsSummaryProps) {
  if (items.length === 0) return null;

  const pending = items.filter(i => !i.received && !i.approved && !i.deliveredToLenders.includes(lenderName));
  const delivered = items.filter(i => i.deliveredToLenders.includes(lenderName));
  const completed = items.filter(i => (i.approved || i.received) && !i.deliveredToLenders.includes(lenderName));
  const pendingCount = pending.length;
  const completedCount = completed.length + delivered.length;

  const allDone = pendingCount === 0;

  return (
    <div className="ml-2 mt-2">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onViewAll();
        }}
        className="flex items-center gap-2 w-full text-left group/items hover:bg-muted/50 rounded-md px-2 py-1.5 -mx-2 transition-colors"
      >
        <ListChecks className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground truncate flex-1">
          {allDone
            ? `All items completed (${items.length})`
            : `${pendingCount} pending, ${completedCount} completed`
          }
        </span>
        {pendingCount > 0 && (
          <Badge variant="amber" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
            {pendingCount} pending
          </Badge>
        )}
        {allDone && (
          <Badge variant="green" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
            ✓ Done
          </Badge>
        )}
        <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover/items:opacity-100 transition-opacity shrink-0" />
      </button>
    </div>
  );
}
