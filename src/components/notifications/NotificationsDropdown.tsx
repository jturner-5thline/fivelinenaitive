import { useState, useMemo } from 'react';
import { Bell, AlertCircle, Activity, ChevronRight, CheckCheck, Settings } from 'lucide-react';
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

export function NotificationsDropdown() {
  const [open, setOpen] = useState(false);
  const { deals } = useDealsContext();
  const { preferences: appPreferences } = usePreferences();
  const { activities, isLoading: activitiesLoading } = useAllActivities(15);
  const { isRead, markAsRead, markAllAsRead, isLoading: readsLoading } = useNotificationReads();
  const { shouldShowStaleAlerts, shouldShowActivity, isLoading: prefsLoading } = useNotificationPreferences();
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
  
  // Count unread notifications
  const unreadAlerts = staleAlerts.filter(a => !isRead('stale_alert', a.dealId));
  const unreadActivities = filteredActivities.filter(a => !isRead('activity', a.id));
  const unreadCount = unreadAlerts.length + unreadActivities.length;
  const totalNotifications = staleAlerts.length + filteredActivities.length;
  const hasAlerts = unreadAlerts.length > 0;
  
  const handleMarkAllAsRead = async () => {
    setIsMarkingRead(true);
    
    const allNotifications = [
      ...staleAlerts.map(a => ({ notification_type: 'stale_alert', notification_id: a.dealId })),
      ...filteredActivities.map(a => ({ notification_type: 'activity', notification_id: a.id })),
    ];
    
    await markAllAsRead(allNotifications);
    toast.success('All notifications marked as read');
    setIsMarkingRead(false);
  };
  
  const isLoading = activitiesLoading || readsLoading || prefsLoading;
  
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
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
            {unreadCount > 0 && (
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
                      to={`/deal/${alert.dealId}?highlight=stale`}
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
          
          {/* Activity Feed Section */}
          {filteredActivities.length > 0 && (
            <div>
              {staleAlerts.length > 0 && <Separator />}
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
            asChild
            onClick={() => setOpen(false)}
          >
            <Link to="/notifications">
              View all notifications
              <ChevronRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
