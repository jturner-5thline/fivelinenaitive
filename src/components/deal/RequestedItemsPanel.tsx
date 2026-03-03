import { format } from 'date-fns';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ListChecks } from 'lucide-react';
import { OutstandingItem } from '@/hooks/useOutstandingItems';

type ItemStatus = 'pending' | 'received' | 'approved' | 'delivered';

function getItemStatus(item: OutstandingItem, lenderName: string): ItemStatus {
  if (item.deliveredToLenders.includes(lenderName)) return 'delivered';
  if (item.approved) return 'approved';
  if (item.received) return 'received';
  return 'pending';
}

const STATUS_CONFIG: Record<ItemStatus, { label: string; variant: 'amber' | 'blue' | 'green' | 'cyan' }> = {
  pending: { label: 'Pending', variant: 'amber' },
  received: { label: 'Received', variant: 'blue' },
  approved: { label: 'Approved', variant: 'green' },
  delivered: { label: 'Delivered', variant: 'cyan' },
};

interface RequestedItemsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: OutstandingItem[];
  lenderName: string;
  onUpdateItem?: (id: string, updates: Partial<OutstandingItem>) => void;
}

export function RequestedItemsPanel({
  open,
  onOpenChange,
  items,
  lenderName,
  onUpdateItem,
}: RequestedItemsPanelProps) {
  const pendingCount = items.filter(i => getItemStatus(i, lenderName) === 'pending').length;
  
  const handleStatusChange = (item: OutstandingItem, newStatus: string) => {
    if (!onUpdateItem) return;
    
    switch (newStatus) {
      case 'received':
        onUpdateItem(item.id, { received: true, approved: false });
        break;
      case 'approved':
        onUpdateItem(item.id, { received: true, approved: true });
        break;
      case 'delivered':
        onUpdateItem(item.id, {
          deliveredToLenders: [...item.deliveredToLenders, lenderName],
        });
        break;
      case 'pending':
        onUpdateItem(item.id, { received: false, approved: false });
        break;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] sm:w-[480px] p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4 text-primary" />
            Requested Items — {lenderName}
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            {items.length} item{items.length !== 1 ? 's' : ''}
            {pendingCount > 0 && ` · ${pendingCount} pending`}
          </p>
        </SheetHeader>

        <ScrollArea className="flex-1 h-[calc(100vh-120px)]">
          <div className="px-6 py-4 space-y-3">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-8 text-center">
                No items requested by this lender
              </p>
            ) : (
              items.map((item) => {
                const status = getItemStatus(item, lenderName);
                const config = STATUS_CONFIG[status];
                const requesters = Array.isArray(item.requestedBy)
                  ? item.requestedBy
                  : item.requestedBy
                  ? [item.requestedBy]
                  : [];

                return (
                  <div
                    key={item.id}
                    className="rounded-lg border border-border bg-card p-3 space-y-2"
                  >
                    {/* Item text */}
                    <p className={`text-sm ${status === 'delivered' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                      {item.text}
                    </p>

                    {/* Status + metadata row */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={config.variant} className="text-[10px]">
                          {config.label}
                        </Badge>
                        {item.createdAt && (
                          <span className="text-[10px] text-muted-foreground">
                            Created {format(new Date(item.createdAt), 'MMM d, yyyy')}
                          </span>
                        )}
                      </div>

                      {/* Status update dropdown */}
                      {onUpdateItem && status !== 'delivered' && (
                        <Select
                          value={status}
                          onValueChange={(val) => handleStatusChange(item, val)}
                        >
                          <SelectTrigger className="h-6 w-[110px] text-[10px] px-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="received">Received</SelectItem>
                            <SelectItem value="approved">Approved</SelectItem>
                            <SelectItem value="delivered">Delivered</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    {/* Requested by */}
                    {requesters.length > 0 && requesters[0] && (
                      <>
                        <Separator />
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-[10px] text-muted-foreground">Requested by:</span>
                          {requesters.map((r, i) => (
                            <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">
                              {r}
                            </Badge>
                          ))}
                        </div>
                      </>
                    )}

                    {/* ETA if set */}
                    {item.eta && (
                      <div className="text-[10px] text-muted-foreground">
                        ETA: {format(new Date(item.eta), 'MMM d, yyyy')}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
