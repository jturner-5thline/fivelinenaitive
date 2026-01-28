import { useState, useMemo } from 'react';
import { Bell, AlertCircle, Activity, ChevronRight, CheckCheck, Settings, Zap, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDealsContext } from '@/contexts/DealsContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useAllActivities } from '@/hooks/useAllActivities';
import { useNotificationReads } from '@/hooks/useNotificationReads';
import { useNotificationPreferences } from '@/hooks/useNotificationPreferences';
import { useFlexNotifications } from '@/hooks/useFlexNotifications';
import { Deal } from '@/types/deal';
import { differenceInDays, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface StaleDeal {
  dealId: string;
  companyName: string;
  lenderCount: number;
  maxDaysSinceUpdate: number;
}

interface NotificationsFullDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getStaleDealAlerts(deals: Deal[], yellowThreshold: number): StaleDeal[] {
  const now = new Date();
  const staleDeals: StaleDeal[] = [];
  
  deals.forEach(deal => {
    let maxDays = 0;
    let staleLenderCount = 0;
    
    deal.lenders?.forEach(lender => {
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

export function NotificationsFullDialog({ open, onOpenChange }: NotificationsFullDialogProps) {
  const { deals } = useDealsContext();
  const { preferences: appPreferences } = usePreferences();
  const { activities, isLoading: activitiesLoading } = useAllActivities(50);
  const { isRead, markAsRead, markAllAsRead, isLoading: readsLoading } = useNotificationReads();
  const { shouldShowStaleAlerts, shouldShowActivity, isLoading: prefsLoading, preferences: notifPrefs } = useNotificationPreferences();
  const { 
    notifications: flexNotifications, 
    isLoading: flexLoading, 
    markAsRead: markFlexAsRead,
    markAllAsRead: markAllFlexAsRead
  } = useFlexNotifications(50);
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
  
  // Count unread notifications
  const unreadAlerts = staleAlerts.filter(a => !isRead('stale_alert', a.dealId));
  const unreadActivities = filteredActivities.filter(a => !isRead('activity', a.id));
  const unreadFlexCount = filteredFlexNotifications.filter(n => !n.read_at).length;
  const unreadCount = unreadAlerts.length + unreadActivities.length + unreadFlexCount;
  const totalNotifications = staleAlerts.length + filteredActivities.length + filteredFlexNotifications.length;
  
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
  
  const isLoading = activitiesLoading || readsLoading || prefsLoading || flexLoading;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5" />
              <DialogTitle className="text-xl">All Notifications</DialogTitle>
              {totalNotifications > 0 && (
                <Badge variant="outline">
                  {unreadCount} unread of {totalNotifications}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleMarkAllAsRead}
                  disabled={isMarkingRead}
                >
                  <CheckCheck className="h-4 w-4 mr-2" />
                  Mark all as read
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="sm"
                asChild
                onClick={() => onOpenChange(false)}
              >
                <Link to="/settings?tab=notifications">
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Link>
              </Button>
            </div>
          </div>
        </DialogHeader>
        
        <ScrollArea className="flex-1">
          <div className="divide-y">
            {/* Stale Lender Alerts Section */}
            {staleAlerts.length > 0 && (
              <div>
                <div className="px-6 py-3 bg-destructive/5 sticky top-0 z-10">
                  <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
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
                        to={`/deal/${alert.dealId}?highlight=stale`}
                        onClick={() => {
                          if (!read) {
                            markAsRead([{ notification_type: 'stale_alert', notification_id: alert.dealId }]);
                          }
                          onOpenChange(false);
                        }}
                        className={cn(
                          "flex items-center gap-4 px-6 py-4 hover:bg-muted/50 transition-colors",
                          read && "opacity-60"
                        )}
                      >
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 flex-shrink-0">
                          <AlertCircle className="h-5 w-5 text-destructive" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-sm",
                            !read && "font-medium"
                          )}>
                            {alert.companyName}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {alert.lenderCount} lender{alert.lenderCount !== 1 ? 's' : ''} need an update • Last updated {alert.maxDaysSinceUpdate} days ago
                          </p>
                        </div>
                        {!read && (
                          <div className="h-2.5 w-2.5 rounded-full bg-destructive flex-shrink-0" />
                        )}
                        <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* FLEx Alerts Section */}
            {filteredFlexNotifications.length > 0 && (
              <div>
                <div className="px-6 py-3 bg-amber-500/10 sticky top-0 z-10">
                  <div className="flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
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
                          onOpenChange(false);
                        }}
                        className={cn(
                          "flex items-center gap-4 px-6 py-4 hover:bg-muted/50 transition-colors",
                          read && "opacity-60"
                        )}
                      >
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-500/10 text-xl flex-shrink-0">
                          {notification.alert_type === 'hot_engagement' ? '🔥' : 
                           notification.alert_type === 'term_sheet_request' ? '📋' :
                           notification.alert_type === 'nda_request' ? '📝' : 'ℹ️'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-sm",
                            !read && "font-medium"
                          )}>
                            {notification.title}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {notification.message}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {notification.deal_name && <span className="font-medium">{notification.deal_name}</span>}
                            {notification.deal_name && ' • '}
                            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                          </p>
                        </div>
                        {!read && (
                          <div className="h-2.5 w-2.5 rounded-full bg-amber-500 flex-shrink-0" />
                        )}
                        <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Activity Feed Section */}
            {filteredActivities.length > 0 && (
              <div>
                <div className="px-6 py-3 bg-muted/30 sticky top-0 z-10">
                  <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                    <Activity className="h-4 w-4" />
                    Recent Activity ({filteredActivities.length})
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
                          onOpenChange(false);
                        }}
                        className={cn(
                          "flex items-center gap-4 px-6 py-4 hover:bg-muted/50 transition-colors",
                          read && "opacity-60"
                        )}
                      >
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-xl flex-shrink-0">
                          {getActivityIcon(activity.activity_type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-sm",
                            !read && "font-medium"
                          )}>
                            {activity.description}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {activity.deal_name && <span className="font-medium">{activity.deal_name}</span>}
                            {activity.deal_name && ' • '}
                            {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                          </p>
                        </div>
                        {!read && (
                          <div className="h-2.5 w-2.5 rounded-full bg-primary flex-shrink-0" />
                        )}
                        <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* Empty State */}
            {totalNotifications === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <Bell className="h-16 w-16 text-muted-foreground/30 mb-4" />
                <p className="text-lg font-medium">All caught up!</p>
                <p className="text-sm text-muted-foreground">
                  No notifications at the moment
                </p>
              </div>
            )}
            
            {/* Loading State */}
            {isLoading && filteredActivities.length === 0 && (
              <div className="flex items-center justify-center py-24">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
