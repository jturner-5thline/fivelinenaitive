import { useState, useMemo } from 'react';
import { Bell, AlertCircle, Activity, ChevronRight, CheckCheck, Settings, Zap, AlertTriangle, Building2, Users } from 'lucide-react';
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

interface StaleLenderAlert {
  dealId: string;
  companyName: string;
  lenderCount: number;
  maxDaysSinceUpdate: number;
}

interface AlertItem {
  id: string;
  type: 'stale-deal' | 'stale-lender';
  dealId: string;
  company: string;
  description: string;
  daysSinceUpdate: number;
  severity: 'warning' | 'destructive';
  lenderCount?: number;
}

interface NotificationsFullDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getStaleLenderAlerts(deals: Deal[], yellowThreshold: number): StaleLenderAlert[] {
  const now = new Date();
  const staleDeals: StaleLenderAlert[] = [];
  
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

function getAlerts(deals: Deal[], staleDealDays: number, staleLenderDays: number): AlertItem[] {
  const now = new Date();
  const alertItems: AlertItem[] = [];

  deals.forEach((deal) => {
    if (deal.status === 'archived') return;

    // Check for stale deal
    const dealUpdatedAt = new Date(deal.updatedAt);
    const dealDaysSinceUpdate = differenceInDays(now, dealUpdatedAt);
    
    if (dealDaysSinceUpdate >= staleDealDays) {
      alertItems.push({
        id: `deal-${deal.id}`,
        type: 'stale-deal',
        dealId: deal.id,
        company: deal.company,
        description: `Deal not updated in ${dealDaysSinceUpdate} days`,
        daysSinceUpdate: dealDaysSinceUpdate,
        severity: dealDaysSinceUpdate >= 30 ? 'destructive' : 'warning',
      });
    }

    // Check for stale lenders
    let maxLenderDays = 0;
    let staleLenderCount = 0;
    
    deal.lenders?.forEach(lender => {
      if (lender.trackingStatus === 'active' && lender.updatedAt) {
        const lenderDaysSinceUpdate = differenceInDays(now, new Date(lender.updatedAt));
        if (lenderDaysSinceUpdate >= staleLenderDays) {
          staleLenderCount++;
          maxLenderDays = Math.max(maxLenderDays, lenderDaysSinceUpdate);
        }
      }
    });

    if (staleLenderCount > 0) {
      alertItems.push({
        id: `lender-${deal.id}`,
        type: 'stale-lender',
        dealId: deal.id,
        company: deal.company,
        description: `${staleLenderCount} lender${staleLenderCount !== 1 ? 's' : ''} need update`,
        daysSinceUpdate: maxLenderDays,
        severity: maxLenderDays >= 30 ? 'destructive' : 'warning',
        lenderCount: staleLenderCount,
      });
    }
  });

  // Sort by days since update (most stale first)
  return alertItems.sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);
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
  
  // Get all alerts (stale deals + stale lenders)
  const allAlerts = useMemo(() => 
    getAlerts(deals, appPreferences.staleDealsDays, appPreferences.lenderUpdateYellowDays),
    [deals, appPreferences.staleDealsDays, appPreferences.lenderUpdateYellowDays]
  );
  
  // Filter based on preferences
  const alerts = useMemo(() => 
    shouldShowStaleAlerts ? allAlerts : [],
    [shouldShowStaleAlerts, allAlerts]
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
  const unreadAlerts = alerts.filter(a => !isRead('stale_alert', a.dealId));
  const unreadActivities = filteredActivities.filter(a => !isRead('activity', a.id));
  const unreadFlexCount = filteredFlexNotifications.filter(n => !n.read_at).length;
  const unreadCount = unreadAlerts.length + unreadActivities.length + unreadFlexCount;
  const totalNotifications = alerts.length + filteredActivities.length + filteredFlexNotifications.length;
  
  const handleMarkAllAsRead = async () => {
    setIsMarkingRead(true);
    
    const allNotifications = [
      ...alerts.map(a => ({ notification_type: 'stale_alert', notification_id: a.dealId })),
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
            {/* Alerts Section (Stale Deals + Stale Lenders) */}
            {alerts.length > 0 && (
              <div>
                <div className="px-6 py-3 bg-warning/10 sticky top-0 z-10">
                  <div className="flex items-center gap-2 text-sm font-semibold text-warning">
                    <AlertTriangle className="h-4 w-4" />
                    Alerts ({alerts.length})
                  </div>
                </div>
                <div className="divide-y">
                  {alerts.map((alert) => {
                    const read = isRead('stale_alert', alert.dealId);
                    return (
                      <Link
                        key={alert.id}
                        to={`/deal/${alert.dealId}${alert.type === 'stale-lender' ? '?highlight=stale' : ''}`}
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
                        <div className={cn(
                          "flex h-11 w-11 items-center justify-center rounded-full flex-shrink-0",
                          alert.severity === 'destructive' ? 'bg-destructive/10' : 'bg-warning/10'
                        )}>
                          {alert.type === 'stale-deal' ? (
                            <Building2 className={cn("h-5 w-5", alert.severity === 'destructive' ? 'text-destructive' : 'text-warning')} />
                          ) : (
                            <Users className={cn("h-5 w-5", alert.severity === 'destructive' ? 'text-destructive' : 'text-warning')} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-sm",
                            !read && "font-medium"
                          )}>
                            {alert.company}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {alert.description} • {alert.daysSinceUpdate} days ago
                          </p>
                        </div>
                        {!read && (
                          <div className={cn(
                            "h-2.5 w-2.5 rounded-full flex-shrink-0",
                            alert.severity === 'destructive' ? 'bg-destructive' : 'bg-warning'
                          )} />
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
