import { useState, useMemo } from 'react';
import { Bell, AlertCircle, Activity, ChevronRight, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useDealsContext } from '@/contexts/DealsContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useAllActivities } from '@/hooks/useAllActivities';
import { Deal } from '@/types/deal';
import { differenceInDays, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

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

export function NotificationsDropdown() {
  const [open, setOpen] = useState(false);
  const { deals } = useDealsContext();
  const { preferences } = usePreferences();
  const { activities, isLoading } = useAllActivities(15);
  
  const staleAlerts = useMemo(() => 
    getStaleDealAlerts(deals, preferences.lenderUpdateYellowDays),
    [deals, preferences.lenderUpdateYellowDays]
  );
  
  const totalNotifications = staleAlerts.length + activities.length;
  const hasAlerts = staleAlerts.length > 0;
  
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {totalNotifications > 0 && (
            <Badge 
              variant={hasAlerts ? "destructive" : "secondary"}
              className={cn(
                "absolute -top-1 -right-1 h-5 min-w-[20px] px-1 text-xs",
                hasAlerts && "animate-pulse"
              )}
            >
              {totalNotifications > 99 ? '99+' : totalNotifications}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold">Notifications</h3>
          {totalNotifications > 0 && (
            <Badge variant="outline" className="text-xs">
              {totalNotifications} new
            </Badge>
          )}
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
                {staleAlerts.map((alert) => (
                  <Link
                    key={alert.dealId}
                    to={`/deal/${alert.dealId}?highlight=stale`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/10">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {alert.companyName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {alert.lenderCount} lender{alert.lenderCount !== 1 ? 's' : ''} • {alert.maxDaysSinceUpdate}d since update
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            </div>
          )}
          
          {/* Activity Feed Section */}
          {activities.length > 0 && (
            <div>
              {staleAlerts.length > 0 && <Separator />}
              <div className="px-4 py-2 bg-muted/30 border-b">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Activity className="h-4 w-4" />
                  Recent Activity
                </div>
              </div>
              <div className="divide-y">
                {activities.map((activity) => (
                  <Link
                    key={activity.id}
                    to={`/deal/${activity.deal_id}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-lg">
                      {getActivityIcon(activity.activity_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">
                        {activity.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {activity.deal_name && <span className="font-medium">{activity.deal_name}</span>}
                        {activity.deal_name && ' • '}
                        {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                ))}
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
          {isLoading && activities.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
