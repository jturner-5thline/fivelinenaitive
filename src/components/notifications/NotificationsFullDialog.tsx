import { useState, useMemo } from 'react';
import { Bell, AlertCircle, Activity, ChevronRight, CheckCheck, Settings, Zap, AlertTriangle, Building2, Users, Target, Clock, Lightbulb, CalendarClock, CheckCircle2, Sparkles, TrendingUp, LayoutGrid, List, GalleryHorizontalEnd, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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
import { useScheduledActions } from '@/hooks/useScheduledActions';
import { useAllDealsSuggestions, DealSuggestion } from '@/hooks/useAllDealsSuggestions';
import { useAllMilestones } from '@/hooks/useAllMilestones';
import { useNotificationSectionOrder } from '@/hooks/useNotificationSectionOrder';
import { Deal } from '@/types/deal';
import { differenceInDays, formatDistanceToNow, format, isBefore, addDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { NotificationGridCards } from './NotificationGridCards';
import { NotificationCarouselView } from './NotificationCarouselView';
import { NotificationListView } from './NotificationListView';
import { NotificationSectionReorderDialog } from './NotificationSectionReorderDialog';

type ViewMode = 'list' | 'grid' | 'carousel';

const suggestionTypeConfig = {
  warning: { icon: Zap, label: 'Follow Up', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' },
  action: { icon: TrendingUp, label: 'Take Action', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
  opportunity: { icon: Sparkles, label: 'Opportunity', color: 'text-primary', bg: 'bg-primary/10' },
  reminder: { icon: Clock, label: 'Due Soon', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10' },
};

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
  const { deals, refreshDeals } = useDealsContext();
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
  const { scheduledActions, isLoading: tasksLoading, pendingCount } = useScheduledActions();
  const { milestones, milestonesMap, isLoading: milestonesLoading } = useAllMilestones();
  const { suggestions: dealSuggestions, counts: suggestionCounts } = useAllDealsSuggestions(deals, milestonesMap);
  const [isMarkingRead, setIsMarkingRead] = useState(false);
  const [reorderDialogOpen, setReorderDialogOpen] = useState(false);
  const { sectionOrder, setSectionOrderDirect, resetToDefault } = useNotificationSectionOrder();
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('notifications-view-mode');
    return (saved as ViewMode) || 'list';
  });
  
  const handleViewModeChange = (value: string) => {
    if (value) {
      setViewMode(value as ViewMode);
      localStorage.setItem('notifications-view-mode', value);
    }
  };
  
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
  
  // Get pending scheduled actions (tasks & reminders)
  const pendingTasks = useMemo(() => 
    scheduledActions.filter(a => a.status === 'pending').slice(0, 10),
    [scheduledActions]
  );
  
  // Get milestones (overdue + upcoming)
  const { overdueMilestones, upcomingMilestones } = useMemo(() => {
    const now = new Date();
    const weekFromNow = addDays(now, 7);
    
    const overdue = milestones.filter(m => 
      !m.completed && m.due_date && isBefore(new Date(m.due_date), now)
    ).slice(0, 5);
    
    const upcoming = milestones.filter(m => 
      !m.completed && m.due_date && 
      !isBefore(new Date(m.due_date), now) && 
      isBefore(new Date(m.due_date), weekFromNow)
    ).slice(0, 5);
    
    return { overdueMilestones: overdue, upcomingMilestones: upcoming };
  }, [milestones]);
  
  // Get top recommended actions (limit to 10)
  const topSuggestions = useMemo(() => 
    dealSuggestions.slice(0, 10),
    [dealSuggestions]
  );
  
  // Count unread notifications
  const unreadAlerts = alerts.filter(a => !isRead('stale_alert', a.dealId));
  const unreadActivities = filteredActivities.filter(a => !isRead('activity', a.id));
  const unreadFlexCount = filteredFlexNotifications.filter(n => !n.read_at).length;
  const unreadCount = unreadAlerts.length + unreadActivities.length + unreadFlexCount;
  const totalNotifications = alerts.length + filteredActivities.length + filteredFlexNotifications.length + 
    pendingTasks.length + topSuggestions.length + overdueMilestones.length + upcomingMilestones.length;
  
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
  
  const isLoading = activitiesLoading || readsLoading || prefsLoading || flexLoading || tasksLoading || milestonesLoading;
  
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
              <ToggleGroup type="single" value={viewMode} onValueChange={handleViewModeChange} size="sm">
                <ToggleGroupItem value="list" aria-label="List view">
                  <List className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="grid" aria-label="Grid view">
                  <LayoutGrid className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="carousel" aria-label="Carousel view">
                  <GalleryHorizontalEnd className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setReorderDialogOpen(true)}
              >
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
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

        <NotificationSectionReorderDialog
          open={reorderDialogOpen}
          onOpenChange={setReorderDialogOpen}
          sectionOrder={sectionOrder}
          onSave={setSectionOrderDirect}
          onReset={resetToDefault}
        />
        
        {viewMode === 'carousel' ? (
          <NotificationCarouselView
            alerts={alerts}
            flexNotifications={filteredFlexNotifications}
            activities={filteredActivities}
            tasks={pendingTasks}
            suggestions={topSuggestions}
            overdueMilestones={overdueMilestones}
            upcomingMilestones={upcomingMilestones}
            isRead={isRead}
            markAsRead={markAsRead}
            markFlexAsRead={markFlexAsRead}
            onClose={() => onOpenChange(false)}
            onSuggestionsRefresh={refreshDeals}
            sectionOrder={sectionOrder}
          />
        ) : (
          <ScrollArea className="flex-1">
            {viewMode === 'grid' ? (
              <NotificationGridCards
                alerts={alerts}
                flexNotifications={filteredFlexNotifications}
                activities={filteredActivities}
                tasks={pendingTasks}
                suggestions={topSuggestions}
                overdueMilestones={overdueMilestones}
                upcomingMilestones={upcomingMilestones}
                isRead={isRead}
                markAsRead={markAsRead}
                markFlexAsRead={markFlexAsRead}
                onClose={() => onOpenChange(false)}
                onSuggestionsRefresh={refreshDeals}
                sectionOrder={sectionOrder}
              />
            ) : (
              <NotificationListView
                alerts={alerts}
                flexNotifications={filteredFlexNotifications}
                activities={filteredActivities}
                tasks={pendingTasks}
                suggestions={topSuggestions}
                overdueMilestones={overdueMilestones}
                upcomingMilestones={upcomingMilestones}
                isRead={isRead}
                markAsRead={markAsRead}
                markFlexAsRead={markFlexAsRead}
                onClose={() => onOpenChange(false)}
                totalNotifications={totalNotifications}
                isLoading={isLoading}
                onSuggestionsRefresh={refreshDeals}
                sectionOrder={sectionOrder}
              />
            )}
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
