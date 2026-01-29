import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, differenceInDays } from 'date-fns';
import { Bell, AlertCircle, Calendar, FileText, Users, ChevronLeft, ChevronRight, Clock, Expand, Activity, Zap, Sparkles, Bot, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useDealsContext } from '@/contexts/DealsContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useAllActivities } from '@/hooks/useAllActivities';
import { useNotificationReads } from '@/hooks/useNotificationReads';
import { useNotificationPreferences } from '@/hooks/useNotificationPreferences';
import { useFlexNotifications } from '@/hooks/useFlexNotifications';
import { useWorkflowSuggestions, useDismissSuggestion } from '@/hooks/useBehaviorInsights';
import { useAgentSuggestions, useDismissAgentSuggestion } from '@/hooks/useAgentSuggestions';
import { Deal } from '@/types/deal';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  type: 'stale_alert' | 'flex' | 'activity';
  title: string;
  description: string;
  dealId?: string;
  dealName?: string;
  timestamp: Date;
  priority?: 'low' | 'medium' | 'high';
  isRead: boolean;
  metadata?: Record<string, any>;
}

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

const getNotificationIcon = (type: Notification['type']) => {
  switch (type) {
    case 'stale_alert':
      return AlertCircle;
    case 'flex':
      return Zap;
    case 'activity':
      return Activity;
    default:
      return Bell;
  }
};

const getNotificationColor = (type: Notification['type']) => {
  switch (type) {
    case 'stale_alert':
      return 'bg-destructive/10 text-destructive';
    case 'flex':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
    case 'activity':
      return 'bg-primary/10 text-primary';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

const getPriorityBadge = (priority?: Notification['priority']) => {
  switch (priority) {
    case 'high':
      return <Badge variant="destructive" className="text-xs">High Priority</Badge>;
    case 'medium':
      return <Badge variant="secondary" className="text-xs">Medium</Badge>;
    case 'low':
      return <Badge variant="outline" className="text-xs">Low</Badge>;
    default:
      return null;
  }
};

interface CarouselContentProps {
  notifications: Notification[];
  onNavigate: (dealId: string, type: string) => void;
  onClose?: () => void;
  initialIndex?: number;
  onMarkAsRead?: (notification: Notification) => void;
}

function CarouselInner({ notifications, onNavigate, onClose, initialIndex = 0, onMarkAsRead }: CarouselContentProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const scrollToIndex = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const cards = container.querySelectorAll('[data-card-index]');
    const target = cards[index] as HTMLElement | undefined;
    if (!target) return;

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    const containerCenter = containerRect.left + containerRect.width / 2;
    const targetCenter = targetRect.left + targetRect.width / 2;
    const delta = targetCenter - containerCenter;

    container.scrollTo({ left: container.scrollLeft + delta, behavior });
  }, []);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const containerCenter = container.scrollLeft + container.offsetWidth / 2;
    const cards = container.querySelectorAll('[data-card-index]');
    
    let closestIndex = 0;
    let closestDistance = Infinity;
    
    cards.forEach((card, index) => {
      const cardElement = card as HTMLElement;
      const cardCenter = cardElement.offsetLeft + cardElement.offsetWidth / 2;
      const distance = Math.abs(containerCenter - cardCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    
    setActiveIndex(closestIndex);
  }, []);

  const goToPrevious = useCallback(() => {
    const newIndex = Math.max(0, activeIndex - 1);
    setActiveIndex(newIndex);
    scrollToIndex(newIndex);
  }, [activeIndex, scrollToIndex]);

  const goToNext = useCallback(() => {
    const newIndex = Math.min(notifications.length - 1, activeIndex + 1);
    setActiveIndex(newIndex);
    scrollToIndex(newIndex);
  }, [activeIndex, notifications.length, scrollToIndex]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      goToPrevious();
    } else if (e.key === 'ArrowRight') {
      goToNext();
    }
  }, [goToPrevious, goToNext]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStart - touchEnd;
    
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        goToNext();
      } else {
        goToPrevious();
      }
    }
    setTouchStart(null);
  };

  useEffect(() => {
    const container = scrollRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    setActiveIndex(initialIndex);

    let raf1 = 0;
    let raf2 = 0;

    raf1 = requestAnimationFrame(() => {
      scrollToIndex(initialIndex, 'auto');
      raf2 = requestAnimationFrame(() => scrollToIndex(initialIndex, 'auto'));
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [scrollToIndex, initialIndex]);

  return (
    <div className="relative py-4 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 px-4">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-medium text-foreground">Notifications</h3>
          <Badge variant="secondary" className="ml-1">{notifications.length}</Badge>
        </div>
        
        {/* Navigation Arrows */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={goToPrevious}
            disabled={activeIndex === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={goToNext}
            disabled={activeIndex === notifications.length - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Carousel Container */}
      <div
        ref={scrollRef}
        className="flex-1 flex overflow-x-auto snap-x snap-mandatory scrollbar-hide items-center"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Left Spacer */}
        <div className="flex-shrink-0 w-[calc(50%-190px)] md:w-[calc(50%-240px)]" />

        {/* Cards */}
        {notifications.map((notification, index) => {
          const distance = Math.abs(index - activeIndex);
          const isActive = index === activeIndex;
          const IconComponent = getNotificationIcon(notification.type);
          const colorClass = getNotificationColor(notification.type);
          const opacity = isActive ? 1 : Math.max(0.4, 1 - distance * 0.25);

          return (
            <div
              key={notification.id}
              data-card-index={index}
              className="flex-shrink-0 snap-center px-3"
              style={{
                opacity,
                transform: isActive ? 'scale(1)' : `scale(${Math.max(0.85, 1 - distance * 0.05)})`,
                transition: 'opacity 0.6s cubic-bezier(0.25, 0.1, 0.25, 1), transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
            >
              <Card
                className={`cursor-pointer transition-all duration-500 ease-out ${
                  isActive
                    ? 'w-[380px] md:w-[480px] min-h-[420px] md:min-h-[480px] shadow-2xl z-10'
                    : 'w-[280px] md:w-[320px] min-h-[320px] md:min-h-[360px] shadow-md'
                }`}
                onClick={() => {
                  if (!isActive) {
                    setActiveIndex(index);
                    scrollToIndex(index);
                  } else if (notification.dealId) {
                    onMarkAsRead?.(notification);
                    onClose?.();
                    onNavigate(notification.dealId, notification.type);
                  }
                }}
              >
                <CardContent className="p-6 h-full flex flex-col">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className={`p-3 rounded-xl ${colorClass}`}>
                      <IconComponent className={isActive ? 'h-6 w-6' : 'h-5 w-5'} />
                    </div>
                    <div className="flex items-center gap-2">
                      {!notification.isRead && (
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      )}
                      {getPriorityBadge(notification.priority)}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 space-y-3">
                    <h4 className={`font-semibold text-foreground ${isActive ? 'text-xl' : 'text-base'}`}>
                      {notification.title}
                    </h4>
                    <p className={`text-muted-foreground leading-relaxed ${isActive ? 'text-base' : 'text-sm line-clamp-3'}`}>
                      {notification.description}
                    </p>
                  </div>

                  {/* Footer */}
                  <div className="mt-auto pt-4 border-t border-border">
                    <div className="flex items-center justify-between">
                      {notification.dealName && (
                        <span className="text-sm text-primary font-medium truncate max-w-[180px]">
                          {notification.dealName}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(notification.timestamp, { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })}

        {/* Right Spacer */}
        <div className="flex-shrink-0 w-[calc(50%-190px)] md:w-[calc(50%-240px)]" />
      </div>

      {/* Dot Indicators */}
      <div className="flex items-center justify-center gap-2 mt-6">
        {notifications.map((_, index) => (
          <button
            key={index}
            onClick={() => {
              setActiveIndex(index);
              scrollToIndex(index);
            }}
            className={`rounded-full transition-all duration-300 ${
              index === activeIndex
                ? 'w-8 h-2 bg-primary'
                : 'w-2 h-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-500/10 text-red-600',
  medium: 'bg-amber-500/10 text-amber-600',
  low: 'bg-blue-500/10 text-blue-600',
};

function SuggestionsEmptyState() {
  const navigate = useNavigate();
  const { data: workflowSuggestions = [], isLoading: workflowLoading } = useWorkflowSuggestions();
  const { data: agentSuggestions = [], isLoading: agentLoading } = useAgentSuggestions();
  const dismissWorkflow = useDismissSuggestion();
  const dismissAgent = useDismissAgentSuggestion();

  const topWorkflows = workflowSuggestions
    .filter((s) => s.priority === 'high' || s.priority === 'medium')
    .slice(0, 3);

  const topAgents = agentSuggestions
    .filter((s) => s.priority === 'high' || s.priority === 'medium')
    .slice(0, 3);

  const isLoading = workflowLoading || agentLoading;
  const hasSuggestions = topWorkflows.length > 0 || topAgents.length > 0;

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </Card>
    );
  }

  if (!hasSuggestions) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center justify-center text-center space-y-2">
          <Bell className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No notifications at this time</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Workflow Suggestions */}
      {topWorkflows.length > 0 && (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Suggested Automations
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs gap-1"
                onClick={() => navigate('/workflows')}
              >
                View all
                <ChevronRight className="h-3 w-3" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topWorkflows.map((suggestion) => (
              <div
                key={suggestion.id}
                className="flex items-center justify-between p-2 rounded-lg bg-background/50 border group"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Zap className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{suggestion.name}</p>
                    <Badge variant="outline" className={`text-xs mt-0.5 ${PRIORITY_COLORS[suggestion.priority]}`}>
                      {suggestion.priority} priority
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => dismissWorkflow.mutate(suggestion.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7"
                    onClick={() => navigate('/workflows')}
                  >
                    Set up
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Agent Suggestions */}
      {topAgents.length > 0 && (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Recommended Agents
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs gap-1"
                onClick={() => navigate('/agents')}
              >
                View all
                <ChevronRight className="h-3 w-3" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topAgents.map((suggestion) => (
              <div
                key={suggestion.id}
                className="flex items-center justify-between p-2 rounded-lg bg-background/50 border group"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Bot className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{suggestion.name}</p>
                    <Badge variant="outline" className={`text-xs mt-0.5 ${PRIORITY_COLORS[suggestion.priority]}`}>
                      {suggestion.priority} priority
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => dismissAgent.mutate(suggestion)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7"
                    onClick={() => navigate('/agents')}
                  >
                    Create
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function NotificationCarousel() {
  const navigate = useNavigate();
  const [isCarouselOpen, setIsCarouselOpen] = useState(false);
  const [initialCarouselIndex, setInitialCarouselIndex] = useState(0);

  // Data hooks
  const { deals } = useDealsContext();
  const { preferences: appPreferences } = usePreferences();
  const { activities, isLoading: activitiesLoading } = useAllActivities(15);
  const { isRead, markAsRead } = useNotificationReads();
  const { shouldShowStaleAlerts, shouldShowActivity, preferences: notifPrefs } = useNotificationPreferences();
  const { notifications: flexNotifications, isLoading: flexLoading, markAsRead: markFlexAsRead } = useFlexNotifications(10);

  // Calculate stale alerts
  const allStaleAlerts = useMemo(() => 
    getStaleDealAlerts(deals, appPreferences.lenderUpdateYellowDays),
    [deals, appPreferences.lenderUpdateYellowDays]
  );

  const staleAlerts = useMemo(() => 
    shouldShowStaleAlerts ? allStaleAlerts : [],
    [shouldShowStaleAlerts, allStaleAlerts]
  );

  const filteredActivities = useMemo(() => 
    activities.filter(a => shouldShowActivity(a.activity_type)),
    [activities, shouldShowActivity]
  );

  const filteredFlexNotifications = useMemo(() => 
    (notifPrefs as any).notify_flex_alerts ? flexNotifications : [],
    [(notifPrefs as any).notify_flex_alerts, flexNotifications]
  );

  // Convert to unified notification format
  const notifications: Notification[] = useMemo(() => {
    const items: Notification[] = [];

    // Stale alerts
    staleAlerts.forEach(alert => {
      items.push({
        id: `stale-${alert.dealId}`,
        type: 'stale_alert',
        title: `${alert.lenderCount} lender${alert.lenderCount > 1 ? 's' : ''} need update`,
        description: `${alert.companyName} has lenders that haven't been updated in ${alert.maxDaysSinceUpdate} days.`,
        dealId: alert.dealId,
        dealName: alert.companyName,
        timestamp: new Date(),
        priority: alert.maxDaysSinceUpdate > 14 ? 'high' : 'medium',
        isRead: isRead('stale_alert', alert.dealId),
      });
    });

    // FLEx notifications
    filteredFlexNotifications.forEach(notification => {
      items.push({
        id: `flex-${notification.id}`,
        type: 'flex',
        title: notification.title,
        description: notification.message,
        dealId: notification.deal_id,
        dealName: notification.deal_name,
        timestamp: new Date(notification.created_at),
        priority: 'medium',
        isRead: !!notification.read_at,
        metadata: { flexId: notification.id },
      });
    });

    // Activity notifications
    filteredActivities.forEach(activity => {
      items.push({
        id: `activity-${activity.id}`,
        type: 'activity',
        title: getActivityTitle(activity.activity_type),
        description: activity.description,
        dealId: activity.deal_id,
        dealName: activity.deal_name,
        timestamp: new Date(activity.created_at),
        priority: 'low',
        isRead: isRead('activity', activity.id),
      });
    });

    // Sort by timestamp (newest first)
    return items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [staleAlerts, filteredFlexNotifications, filteredActivities, isRead]);

  const isLoading = activitiesLoading || flexLoading;

  const handleNavigate = (dealId: string, type: string) => {
    if (type === 'stale_alert') {
      navigate(`/deal/${dealId}?highlight=stale`);
    } else if (type === 'flex') {
      navigate(`/deal/${dealId}?tab=deal-management#flex-engagement-section`);
    } else {
      navigate(`/deal/${dealId}`);
    }
  };

  const handleMarkAsRead = (notification: Notification) => {
    if (notification.isRead) return;
    
    if (notification.type === 'stale_alert') {
      markAsRead([{ notification_type: 'stale_alert', notification_id: notification.dealId! }]);
    } else if (notification.type === 'flex' && notification.metadata?.flexId) {
      markFlexAsRead([notification.metadata.flexId]);
    } else if (notification.type === 'activity') {
      markAsRead([{ notification_type: 'activity', notification_id: notification.id.replace('activity-', '') }]);
    }
  };

  const openCarouselAtIndex = (index: number) => {
    setInitialCarouselIndex(index);
    setIsCarouselOpen(true);
  };

  // Show suggestions if no notifications
  if (!isLoading && notifications.length === 0) {
    return <SuggestionsEmptyState />;
  }

  // Loading state
  if (isLoading && notifications.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </Card>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-medium text-foreground">Notifications</h3>
          <Badge variant="secondary" className="ml-1">{notifications.length}</Badge>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setIsCarouselOpen(true)}
        >
          <Expand className="h-4 w-4" />
        </Button>
      </div>

      {/* Notification Tiles - Horizontal Scroll */}
      <div className="relative group">
        {/* Left fade indicator */}
        <div className="absolute left-0 top-0 bottom-2 w-8 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
        
        {/* Right fade indicator */}
        <div className="absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
        
        {/* Scroll hint arrow */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 z-20 pointer-events-none">
          <div className="flex items-center gap-1 text-muted-foreground animate-pulse">
            <ChevronRight className="h-5 w-5" />
          </div>
        </div>

        <div 
          className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide pr-8"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {notifications.map((notification, index) => {
            const IconComponent = getNotificationIcon(notification.type);
            const colorClass = getNotificationColor(notification.type);

            return (
              <Card
                key={notification.id}
                className="flex-shrink-0 w-[200px] p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => openCarouselAtIndex(index)}
              >
                <div className="flex flex-col h-full space-y-3">
                  {/* Icon and Priority */}
                  <div className="flex items-start justify-between">
                    <div className={`p-2 rounded-lg ${colorClass}`}>
                      <IconComponent className="h-4 w-4" />
                    </div>
                    {!notification.isRead && (
                      <span className="h-2 w-2 rounded-full bg-primary" />
                    )}
                  </div>

                  {/* Title */}
                  <h4 className="text-sm font-medium text-foreground line-clamp-2">
                    {notification.title}
                  </h4>

                  {/* Deal Name & Time */}
                  <div className="mt-auto pt-2">
                    {notification.dealName && (
                      <p className="text-xs text-primary font-medium truncate mb-1">
                        {notification.dealName}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(notification.timestamp, { addSuffix: true })}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Fullscreen Carousel Dialog */}
      <Dialog open={isCarouselOpen} onOpenChange={setIsCarouselOpen}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] p-0 overflow-hidden">
          <CarouselInner 
            notifications={notifications} 
            onNavigate={handleNavigate}
            onClose={() => setIsCarouselOpen(false)}
            initialIndex={initialCarouselIndex}
            onMarkAsRead={handleMarkAsRead}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function getActivityTitle(activityType: string): string {
  switch (activityType) {
    case 'lender_added':
      return 'New lender added';
    case 'lender_updated':
    case 'lender_stage_changed':
      return 'Lender updated';
    case 'stage_changed':
      return 'Deal stage changed';
    case 'status_changed':
      return 'Deal status changed';
    case 'milestone_added':
      return 'Milestone added';
    case 'milestone_completed':
      return 'Milestone completed';
    case 'milestone_missed':
      return 'Milestone missed';
    default:
      return 'Activity';
  }
}
