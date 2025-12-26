import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Bell, AlertCircle, Activity, ChevronRight, CheckCheck, Settings, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { DealsHeader } from '@/components/deals/DealsHeader';
import { useDealsContext } from '@/contexts/DealsContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useAllActivities } from '@/hooks/useAllActivities';
import { useNotificationReads } from '@/hooks/useNotificationReads';
import { useNotificationPreferences } from '@/hooks/useNotificationPreferences';
import { Deal } from '@/types/deal';
import { differenceInDays, format, formatDistanceToNow } from 'date-fns';
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
    case 'deal_created':
      return '🆕';
    case 'lender_added':
      return '🏦';
    case 'lender_updated':
      return '📝';
    case 'stage_changed':
      return '📊';
    case 'status_changed':
      return '🔄';
    default:
      return '📌';
  }
}

function getActivityLabel(activityType: string) {
  switch (activityType) {
    case 'deal_created':
      return 'Deal Created';
    case 'lender_added':
      return 'Lender Added';
    case 'lender_updated':
      return 'Lender Updated';
    case 'stage_changed':
      return 'Stage Changed';
    case 'status_changed':
      return 'Status Changed';
    default:
      return 'Activity';
  }
}

export default function Notifications() {
  const { deals } = useDealsContext();
  const { preferences: appPreferences } = usePreferences();
  const { 
    activities, 
    isLoading: activitiesLoading, 
    isLoadingMore,
    hasMore,
    loadMore 
  } = useAllActivities({ limit: 20, enablePagination: true });
  const { isRead, markAsRead, markAllAsRead, isLoading: readsLoading } = useNotificationReads();
  const { shouldShowStaleAlerts, shouldShowActivity, isLoading: prefsLoading } = useNotificationPreferences();
  const [isMarkingRead, setIsMarkingRead] = useState(false);
  
  // Get all stale alerts
  const allStaleAlerts = getStaleDealAlerts(deals, appPreferences.lenderUpdateYellowDays);
  
  // Filter based on preferences
  const staleAlerts = shouldShowStaleAlerts ? allStaleAlerts : [];
  const filteredActivities = activities.filter(a => shouldShowActivity(a.activity_type));
  
  // Count unread notifications
  const unreadAlerts = staleAlerts.filter(a => !isRead('stale_alert', a.dealId));
  const unreadActivities = filteredActivities.filter(a => !isRead('activity', a.id));
  const unreadCount = unreadAlerts.length + unreadActivities.length;
  
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

  const handleNotificationClick = (type: string, id: string, read: boolean) => {
    if (!read) {
      markAsRead([{ notification_type: type, notification_id: id }]);
    }
  };
  
  const isLoading = activitiesLoading || readsLoading || prefsLoading;

  return (
    <>
      <Helmet>
        <title>Notifications | DealFlow</title>
        <meta name="description" content="View all your notifications and alerts" />
      </Helmet>
      
      <div className="min-h-screen bg-background">
        <DealsHeader />
        
        <main className="container max-w-4xl py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2 bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">
                <Bell className="h-6 w-6 text-foreground" />
                Notifications
              </h1>
              <p className="text-muted-foreground mt-1">
                View and manage all your notifications
              </p>
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleMarkAllAsRead}
                  disabled={isMarkingRead}
                  className="gap-2"
                >
                  <CheckCheck className="h-4 w-4" />
                  Mark all as read
                </Button>
              )}
              <Button variant="ghost" size="sm" asChild>
                <Link to="/settings?tab=notifications" className="gap-2">
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Stale Lender Alerts */}
              {staleAlerts.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2 text-destructive">
                      <AlertCircle className="h-5 w-5" />
                      Lenders Need Update
                    </CardTitle>
                    <CardDescription>
                      {staleAlerts.length} deal{staleAlerts.length !== 1 ? 's' : ''} with lenders requiring attention
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="divide-y rounded-lg border">
                      {staleAlerts.map((alert) => {
                        const read = isRead('stale_alert', alert.dealId);
                        return (
                          <Link
                            key={alert.dealId}
                            to={`/deal/${alert.dealId}?highlight=stale`}
                            onClick={() => handleNotificationClick('stale_alert', alert.dealId, read)}
                            className={cn(
                              "flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors",
                              read && "opacity-60"
                            )}
                          >
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
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
                                {alert.lenderCount} lender{alert.lenderCount !== 1 ? 's' : ''} haven't been updated in {alert.maxDaysSinceUpdate} days
                              </p>
                            </div>
                            {!read && (
                              <Badge variant="destructive" className="shrink-0">New</Badge>
                            )}
                            <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                          </Link>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Activity Feed */}
              {filteredActivities.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Recent Activity
                    </CardTitle>
                    <CardDescription>
                      Your recent deal and lender activity
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="divide-y rounded-lg border">
                      {filteredActivities.map((activity) => {
                        const read = isRead('activity', activity.id);
                        return (
                          <Link
                            key={activity.id}
                            to={`/deal/${activity.deal_id}`}
                            onClick={() => handleNotificationClick('activity', activity.id, read)}
                            className={cn(
                              "flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors",
                              read && "opacity-60"
                            )}
                          >
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-xl">
                              {getActivityIcon(activity.activity_type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className={cn(
                                  "text-sm",
                                  !read && "font-medium"
                                )}>
                                  {activity.description}
                                </p>
                                <Badge variant="outline" className="text-xs shrink-0">
                                  {getActivityLabel(activity.activity_type)}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {activity.deal_name && <span className="font-medium">{activity.deal_name}</span>}
                                {activity.deal_name && ' • '}
                                {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                                {' • '}
                                {format(new Date(activity.created_at), 'MMM d, yyyy h:mm a')}
                              </p>
                            </div>
                            {!read && (
                              <Badge className="shrink-0">New</Badge>
                            )}
                            <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                          </Link>
                        );
                      })}
                    </div>
                    
                    {/* Load More Button */}
                    {hasMore && (
                      <div className="p-4 border-t">
                        <Button 
                          variant="outline" 
                          className="w-full"
                          onClick={loadMore}
                          disabled={isLoadingMore}
                        >
                          {isLoadingMore ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Loading...
                            </>
                          ) : (
                            'Load more activities'
                          )}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Empty State */}
              {staleAlerts.length === 0 && filteredActivities.length === 0 && (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                    <Bell className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-medium">All caught up!</h3>
                    <p className="text-muted-foreground mt-1">
                      You have no notifications at the moment
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </main>
      </div>
    </>
  );
}
