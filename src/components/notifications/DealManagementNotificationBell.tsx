import { useState } from 'react';
import { Bell, Check, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { useMyDealNotifications } from '@/hooks/useMyDealNotifications';
import { useMyDealNotificationItems } from '@/hooks/useMyDealNotificationItems';
import { supabase } from '@/integrations/supabase/client';

export function DealManagementNotificationBell() {
  const navigate = useNavigate();
  const { count, refresh } = useMyDealNotifications();
  const { items, isLoading, refresh: refreshItems } = useMyDealNotificationItems();
  const [open, setOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  if (count === 0) return null;

  const dismissOne = async (id: string) => {
    setDismissingId(id);
    const { error } = await supabase
      .from('flex_info_notifications')
      .update({ status: 'dismissed' })
      .eq('id', id);
    setDismissingId(null);
    if (error) {
      toast.error('Could not dismiss notification');
      return;
    }
    await Promise.all([refresh(), refreshItems()]);
  };

  const clearAll = async () => {
    if (!items.length) return;
    setClearing(true);
    const ids = items.map((n) => n.id);
    const { error } = await supabase
      .from('flex_info_notifications')
      .update({ status: 'dismissed' })
      .in('id', ids);
    setClearing(false);
    if (error) {
      toast.error('Could not clear notifications');
      return;
    }
    toast.success(`Cleared ${ids.length} notification${ids.length === 1 ? '' : 's'}`);
    await Promise.all([refresh(), refreshItems()]);
    setOpen(false);
  };

  const openDeal = async (n: { id: string; deal_id: string }) => {
    setOpen(false);
    navigate(`/deal/${n.deal_id}?tab=deal-management`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative h-9 w-9">
          <Bell className="h-4 w-4" />
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 h-5 min-w-5 rounded-full text-xs px-1.5"
          >
            {count}
          </Badge>
          <span className="sr-only">{count} deal management notification{count !== 1 ? 's' : ''}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0 z-[80]">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div>
            <p className="font-medium text-sm">Deal management</p>
            <p className="text-xs text-muted-foreground">
              {count} item{count === 1 ? '' : 's'} need your attention
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs gap-1"
            onClick={clearAll}
            disabled={clearing || items.length === 0}
          >
            {clearing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Clear all
          </Button>
        </div>
        <ScrollArea className="max-h-[360px]">
          {isLoading && items.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">Loading…</div>
          ) : items.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">All caught up.</div>
          ) : (
            items.map((n) => (
              <div
                key={n.id}
                className="group flex items-start gap-2 px-3 py-2.5 border-b last:border-b-0 hover:bg-muted/40"
              >
                <button
                  className="flex-1 min-w-0 text-left"
                  onClick={() => openDeal(n)}
                >
                  <p className="text-sm font-medium truncate">
                    {n.lender_name || n.company_name || 'Deal notification'}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissOne(n.id);
                  }}
                  disabled={dismissingId === n.id}
                >
                  {dismissingId === n.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    'Dismiss'
                  )}
                </Button>
              </div>
            ))
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
