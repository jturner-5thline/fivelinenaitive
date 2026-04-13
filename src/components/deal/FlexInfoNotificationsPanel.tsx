import { useState, useMemo } from 'react';
import { Bell, Check, Mail, Building2, User, X, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useFlexInfoNotifications, FlexInfoNotification } from '@/hooks/useFlexInfoNotifications';
import { DenyInfoRequestModal } from './DenyInfoRequestModal';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface FlexInfoNotificationsPanelProps {
  dealId: string | undefined;
}

const INFO_REQUESTS_COLLAPSED_KEY = 'info-requests-panel-collapsed';

export function FlexInfoNotificationsPanel({ dealId }: FlexInfoNotificationsPanelProps) {
  const [isOpen, setIsOpen] = useState(() => {
    const stored = localStorage.getItem(INFO_REQUESTS_COLLAPSED_KEY);
    return stored === null ? true : stored !== 'true';
  });

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    localStorage.setItem(INFO_REQUESTS_COLLAPSED_KEY, (!open).toString());
  };
  const { notifications, isLoading, pendingCount, approveAccess, denyAccess } = useFlexInfoNotifications(dealId);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending'>('all');
  const [denyModalOpen, setDenyModalOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<FlexInfoNotification | null>(null);

  const filteredNotifications = useMemo(() => {
    if (statusFilter === 'pending') return notifications.filter(n => n.status === 'pending');
    return notifications;
  }, [notifications, statusFilter]);

  const handleApprove = async (notificationId: string) => {
    const success = await approveAccess(notificationId);
    toast(success
      ? { title: 'Access Approved', description: 'The lender has been granted access.' }
      : { title: 'Error', description: 'Failed to approve access.', variant: 'destructive' });
  };

  const handleDenyClick = (notification: FlexInfoNotification) => {
    setSelectedNotification(notification);
    setDenyModalOpen(true);
  };

  const handleConfirmDeny = async (notificationId: string, message: string) => {
    const success = await denyAccess(notificationId, message);
    if (success) {
      toast({ title: 'Denial message sent', description: 'The lender has been notified.' });
    }
    return success;
  };

  const getStatusStyles = (status: string) => {
    switch (status) {
      case 'pending': return { container: 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 ring-2 ring-amber-300 dark:ring-amber-700', dot: 'bg-amber-500' };
      case 'approved': return { container: 'bg-green-50/50 dark:bg-green-950/10 border-green-200 dark:border-green-800/50', dot: 'bg-green-500' };
      case 'denied': return { container: 'bg-destructive/5 dark:bg-destructive/10 border-destructive/20 dark:border-destructive/30', dot: 'bg-destructive' };
      default: return { container: 'bg-muted/30 border-border', dot: 'bg-muted-foreground/50' };
    }
  };

  return (
    <>
      <Card className="h-full w-full flex flex-col">
        {/* ── Header ── fixed height, matches Tasks & Engagement */}
        <CardHeader
          className="flex flex-row items-center justify-between min-h-[44px] h-[44px] py-0 px-4 space-y-0 shrink-0 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => handleOpenChange(!isOpen)}
        >
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Bell className="h-3.5 w-3.5 text-muted-foreground" />
            Info Requests
            {pendingCount > 0 && <Badge variant="destructive" className="text-[10px] h-5 px-1.5">{pendingCount} new</Badge>}
            {notifications.length > 0 && <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-normal">{notifications.length}</Badge>}
          </CardTitle>
          {isOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </CardHeader>

        {/* ── Body ── */}
        {isOpen ? (
          <CardContent className="flex-1 flex flex-col px-4 pb-4 pt-0 min-h-0">
            {isLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-xs text-muted-foreground">Loading…</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center mb-2">
                  <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">No info requests yet</p>
              </div>
            ) : (
              <>
                <div className="shrink-0 mb-3">
                  <ToggleGroup type="single" value={statusFilter} onValueChange={(v) => v && setStatusFilter(v as 'all' | 'pending')} className="justify-start">
                    <ToggleGroupItem value="all" className="text-[10px] h-6 px-2">All</ToggleGroupItem>
                    <ToggleGroupItem value="pending" className="text-[10px] h-6 px-2">Pending</ToggleGroupItem>
                  </ToggleGroup>
                </div>
                {filteredNotifications.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-xs text-muted-foreground">No {statusFilter === 'pending' ? 'pending ' : ''}info requests</p>
                  </div>
                ) : (
                  <ScrollArea className="flex-1 min-h-0 pr-1">
                    <div className="space-y-2.5">
                      {filteredNotifications.map((notification) => {
                        const styles = getStatusStyles(notification.status);
                        return (
                          <div key={notification.id} className={cn('p-2.5 rounded-lg border transition-all relative', styles.container)}>
                            {notification.status === 'pending' && (
                              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
                              </span>
                            )}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={cn('w-2 h-2 rounded-full shrink-0', styles.dot)} />
                                  <p className={cn('text-sm font-medium text-foreground', notification.status === 'read' && 'text-muted-foreground')}>{notification.message}</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground ml-4">
                                  {notification.company_name && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{notification.company_name}</span>}
                                  {notification.user_email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{notification.user_email}</span>}
                                  {notification.lender_name && <span className="flex items-center gap-1"><User className="h-3 w-3" />{notification.lender_name}</span>}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1 ml-4">{formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}</p>
                              </div>
                              <div className="shrink-0 flex items-center gap-1.5">
                                {notification.status === 'approved' ? (
                                  <>
                                    <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px]"><Check className="h-2.5 w-2.5 mr-0.5" />Approved</Badge>
                                    <Button size="sm" variant="ghost" onClick={() => handleDenyClick(notification)} className="h-6 text-[10px] text-muted-foreground hover:text-destructive px-1.5"><RotateCcw className="h-2.5 w-2.5 mr-0.5" />Deny</Button>
                                  </>
                                ) : notification.status === 'denied' ? (
                                  <>
                                    <Badge variant="secondary" className="bg-destructive/10 text-destructive text-[10px]"><X className="h-2.5 w-2.5 mr-0.5" />Denied</Badge>
                                    <Button size="sm" variant="ghost" onClick={() => handleApprove(notification.id)} className="h-6 text-[10px] text-muted-foreground hover:text-foreground px-1.5"><RotateCcw className="h-2.5 w-2.5 mr-0.5" />Approve</Button>
                                  </>
                                ) : (
                                  <>
                                    <Button size="sm" variant="outline" onClick={() => handleDenyClick(notification)} className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 px-2"><X className="h-3 w-3 mr-0.5" />Deny</Button>
                                    <Button size="sm" onClick={() => handleApprove(notification.id)} className="h-7 text-xs px-2"><Check className="h-3 w-3 mr-0.5" />Approve</Button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </>
            )}
          </CardContent>
        ) : (
          /* Collapsed spacer — keeps card at full grid height */
          <div className="flex-1" />
        )}
      </Card>

      <DenyInfoRequestModal
        open={denyModalOpen}
        onOpenChange={setDenyModalOpen}
        notification={selectedNotification}
        onConfirmDeny={handleConfirmDeny}
      />
    </>
  );
}
