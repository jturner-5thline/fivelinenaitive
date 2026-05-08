import { useState, useMemo } from 'react';
import { isPostSubmissionDealStage } from '@/utils/dealStageUtils';
import { Bell, AlertCircle, Activity, ChevronRight, CheckCheck, Settings, Zap, HelpCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useDealsContext } from '@/contexts/DealsContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useAllActivities } from '@/hooks/useAllActivities';
import { useNotificationReads } from '@/hooks/useNotificationReads';
import { useNotificationPreferences } from '@/hooks/useNotificationPreferences';
import { useFlexNotifications } from '@/hooks/useFlexNotifications';
import { useFlexInfoRequestsForOwner } from '@/hooks/useFlexInfoRequestsForOwner';
import { NotificationsFullDialog } from './NotificationsFullDialog';
import { Deal } from '@/types/deal';
import { differenceInDays, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { isLenderEligibleForAttention } from '@/utils/lenderAttentionEligibility';

interface StaleDeal {
  dealId: string;
  companyName: string;
  lenderCount: number;
  maxDaysSinceUpdate: number;
}

function getStaleDealAlerts(deals: Deal[], yellowThreshold: number): StaleDeal[] {
  const now = new Date();
  const staleDeals: StaleDeal[] = [];

  deals.filter(d => isPostSubmissionDealStage(d.stage)).forEach(deal => {
    let maxDays = 0;
    let staleLenderCount = 0;

    deal.lenders?.forEach(lender => {
      // Shared eligibility filter — excludes On Deck/On Hold/Passed/etc.
      // and lenders inside On Hold or Archived deals.
      if (!isLenderEligibleForAttention(lender as any, deal as any)) return;
      if (lender.trackingStatus === 'active' && lender.updatedAt) {
        const daysSinceUpdate = differenceInDays(now, new Date(lender.updatedAt));
        if (daysSinceUpdate >= yellowThreshold) {
          staleLenderCount++;
          maxDays = Math.max(maxDays, daysSinceUpdate);
        }
      }
    });

    if (staleLenderCount > 0) {
      staleDeals.push({
        dealId: deal.id,
        companyName: deal.company,
        lenderCount: staleLenderCount,
        maxDaysSinceUpdate: maxDays,
      });
    }
  });

  return staleDeals;
}

function getActivityIcon(activityType: string) {
  switch (activityType) {
    case 'lender_added':
      return '🏦';
    case 'lender_updated':
    case 'lender_stage_changed':
      return '📝';
    case 'stage_changed':
      return '📊';
    case 'status_changed':
      return '🔄';
    case 'milestone_added':
      return '🎯';
    case 'milestone_completed':
      return '✅';
    case 'milestone_missed':
      return '⚠️';
    default:
      return '📌';
  }
}

export function NotificationsDropdown() {
  const [open, setOpen] = useState(false);
  const [fullDialogOpen, setFullDialogOpen] = useState(false);
  const { deals } = useDealsContext();
  const { preferences: appPreferences } = usePreferences();
  const { activities, isLoading: activitiesLoading } = useAllActivities(15);
  const { isRead, markAsRead, markAllAsRead, isLoading: readsLoading } = useNotificationReads();
  const { shouldShowStaleAlerts, shouldShowActivity, isLoading: prefsLoading, preferences: notifPrefs } = useNotificationPreferences();
  const { 
    notifications: flexNotifications, 
    isLoading: flexLoading, 
    unreadCount: flexUnreadCount,
    markAsRead: markFlexAsRead,
    markAllAsRead: markAllFlexAsRead
  } = useFlexNotifications(10);
  const { 
    notifications: infoRequestNotifications, 
    isLoading: infoRequestsLoading, 
    pendingCount: infoRequestPendingCount 
  } = useFlexInfoRequestsForOwner();
  const [isMarkingRead, setIsMarkingRead] = useState(false);
  
  // Get all stale alerts
  const allStaleAlerts = useMemo(() => 
    getStaleDealAlerts(deals, appPreferences.lenderUpdateYellowDays),
    [deals, appPreferences.lenderUpdateYellowDays]
  );
  
  // Filter based on preferences
  const staleAlerts = useMemo(() => 
    shouldShowStaleAlerts ? allStaleAlerts : [],
    [shouldShowStaleAlerts, allStaleAlerts]
  );
  
  const filteredActivities = useMemo(() => 
    activities.filter(a => shouldShowActivity(a.activity_type)),
    [activities, shouldShowActivity]
  );

  // Filter FLEx notifications based on preference
  const filteredFlexNotifications = useMemo(() => 
    (notifPrefs as any).notify_flex_alerts ? flexNotifications : [],
    [(notifPrefs as any).notify_flex_alerts, flexNotifications]
  );
  
  // Count unread notifications.
  // `clearableUnreadCount` covers everything the "Mark all read" action can
  // actually clear (stale alerts, activity log, FLEx). Pending info requests
  // are action items — they only disappear when the action is taken — so we
  // surface them in the bell badge but exclude them from the button state,
  // otherwise clicking "Mark all read" appears to do nothing.
  const unreadAlerts = staleAlerts.filter(a => !isRead('stale_alert', a.dealId));
  const unreadActivities = filteredActivities.filter(a => !isRead('activity', a.id));
  const unreadFlexCount = filteredFlexNotifications.filter(n => !n.read_at).length;
  const clearableUnreadCount = unreadAlerts.length + unreadActivities.length + unreadFlexCount;
  const unreadCount = clearableUnreadCount + infoRequestPendingCount;
  const totalNotifications = staleAlerts.length + filteredActivities.length + filteredFlexNotifications.length + infoRequestNotifications.length;
  const hasAlerts = unreadAlerts.length > 0 || unreadFlexCount > 0 || infoRequestPendingCount > 0;
  
  const handleMarkAllAsRead = async () => {
    setIsMarkingRead(true);
    
    const allNotifications = [
      ...staleAlerts.map(a => ({ notification_type: 'stale_alert', notification_id: a.dealId })),
      ...filteredActivities.map(a => ({ notification_type: 'activity', notification_id: a.id })),
    ];
    
    await markAllAsRead(allNotifications);
    await markAllFlexAsRead();
    toast.success('All notifications marked as read');
    setIsMarkingRead(false);
  };
  
  const isLoading = activitiesLoading || readsLoading || prefsLoading || flexLoading || infoRequestsLoading;
  
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative h-9 w-9">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge 
              variant={hasAlerts ? "destructive" : "secondary"}
              className={cn(
                "absolute -top-1 -right-1 h-5 min-w-[20px] px-1 text-xs",
                hasAlerts && "animate-pulse"
              )}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold">Notifications</h3>
          <div className="flex items-center gap-1">
            {clearableUnreadCount > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 text-xs gap-1"
                onClick={handleMarkAllAsRead}
                disabled={isMarkingRead}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </Button>
            )}
            {totalNotifications > 0 && (
              <Badge variant="outline" className="text-xs">
                {unreadCount} unread
              </Badge>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7"
                    asChild
                    onClick={() => setOpen(false)}
                  >
                    <Link to="/settings?tab=notifications">
                      <Settings className="h-4 w-4" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Notification settings</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        
        <ScrollArea className="h-[400px]">
          {/* Stale Lender Alerts Section */}
          {staleAlerts.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-destructive/5 border-b">
                <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  Lenders Need Update ({staleAlerts.length})
                </div>
              </div>
              <div className="divide-y">
                {staleAlerts.map((alert) => {
                  const read = isRead('stale_alert', alert.dealId);
                  return (
                    <Link
                      key={alert.dealId}
                      to={`/deal/${alert.dealId}?tab=lenders&highlight=stale`}
                      onClick={() => {
                        if (!read) {
                          markAsRead([{ notification_type: 'stale_alert', notification_id: alert.dealId }]);
                        }
                        setOpen(false);
                      }}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors",
                        read && "opacity-60"
                      )}
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/10">
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "text-sm truncate",
                          !read && "font-medium"
                        )}>
                          {alert.companyName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {alert.lenderCount} lender{alert.lenderCount !== 1 ? 's' : ''} • {alert.maxDaysSinceUpdate}d since update
                        </p>
                      </div>
                      {!read && (
                        <div className="h-2 w-2 rounded-full bg-destructive" />
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* Info Request Alerts Section */}
          {infoRequestNotifications.length > 0 && (
            <div>
              {staleAlerts.length > 0 && <Separator />}
              <div className="px-4 py-2 bg-primary/5 border-b">
                <div className="flex items-center gap-2 text-sm font-medium text-primary">
                  <HelpCircle className="h-4 w-4" />
                  Lender Access Requests ({infoRequestNotifications.length})
                </div>
              </div>
              <div className="divide-y">
                {infoRequestNotifications.map((notification) => {
                  const isPending = notification.status === 'pending' || notification.status === 'read';
                  return (
                    <Link
                      key={notification.id}
                      to={`/deal/${notification.deal_id}?tab=deal-management#flex-info-section`}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors",
                        !isPending && "opacity-60"
                      )}
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-lg">
                        🔔
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "text-sm truncate",
                          isPending && "font-medium"
                        )}>
                          {notification.lender_name || notification.user_email || 'A lender'} requested access
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {notification.company_name && <span className="font-medium">{notification.company_name}</span>}
                          {notification.company_name && ' • '}
                          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      {isPending && (
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* FLEx Alerts Section */}
          {filteredFlexNotifications.length > 0 && (
            <div>
              {(staleAlerts.length > 0 || infoRequestNotifications.length > 0) && <Separator />}
              <div className="px-4 py-2 bg-amber-500/10 border-b">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                  <Zap className="h-4 w-4" />
                  FLEx Engagement ({filteredFlexNotifications.length})
                </div>
              </div>
              <div className="divide-y">
                {filteredFlexNotifications.map((notification) => {
                  const read = !!notification.read_at;
                  return (
                    <Link
                      key={notification.id}
                      to={`/deal/${notification.deal_id}?tab=deal-management#flex-engagement-section`}
                      onClick={() => {
                        if (!read) {
                          markFlexAsRead([notification.id]);
                        }
                        setOpen(false);
                      }}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors",
                        read && "opacity-60"
                      )}
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/10 text-lg">
                        {notification.alert_type === 'hot_engagement' ? '🔥' : 
                         notification.alert_type === 'term_sheet_request' ? '📋' :
                         notification.alert_type === 'nda_request' ? '📝' : 'ℹ️'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "text-sm truncate",
                          !read && "font-medium"
                        )}>
                          {notification.title}
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {notification.deal_name && <span className="font-medium">{notification.deal_name}</span>}
                          {notification.deal_name && ' • '}
                          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      {!read && (
                        <div className="h-2 w-2 rounded-full bg-amber-500" />
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Activity Feed Section */}
          {filteredActivities.length > 0 && (
            <div>
              {(staleAlerts.length > 0 || filteredFlexNotifications.length > 0 || infoRequestNotifications.length > 0) && <Separator />}
              <div className="px-4 py-2 bg-muted/30 border-b">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Activity className="h-4 w-4" />
                  Recent Activity
                </div>
              </div>
              <div className="divide-y">
                {filteredActivities.map((activity) => {
                  const read = isRead('activity', activity.id);
                  return (
                    <Link
                      key={activity.id}
                      to={`/deal/${activity.deal_id}`}
                      onClick={() => {
                        if (!read) {
                          markAsRead([{ notification_type: 'activity', notification_id: activity.id }]);
                        }
                        setOpen(false);
                      }}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors",
                        read && "opacity-60"
                      )}
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-lg">
                        {getActivityIcon(activity.activity_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "text-sm truncate",
                          !read && "font-medium"
                        )}>
                          {activity.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {activity.deal_name && <span className="font-medium">{activity.deal_name}</span>}
                          {activity.deal_name && ' • '}
                          {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      {!read && (
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* Empty State */}
          {totalNotifications === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bell className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm font-medium">All caught up!</p>
              <p className="text-xs text-muted-foreground">
                No notifications at the moment
              </p>
            </div>
          )}
          
          {/* Loading State */}
          {isLoading && filteredActivities.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
        </ScrollArea>
        
        {/* View All Link */}
        <div className="border-t px-4 py-3">
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full justify-center text-muted-foreground hover:text-foreground"
            onClick={() => {
              setOpen(false);
              setFullDialogOpen(true);
            }}
          >
            View all notifications
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </PopoverContent>
      
      <NotificationsFullDialog 
        open={fullDialogOpen} 
        onOpenChange={setFullDialogOpen} 
      />
    </Popover>
  );
}
