import { useState, useMemo, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Building2, Users, Zap, Activity, CalendarClock, Target, Clock, Sparkles, TrendingUp, ChevronLeft, ChevronRight, Edit3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format, differenceInDays } from 'date-fns';
import { DealSuggestion } from '@/hooks/useAllDealsSuggestions';
import { SuggestionActionDialog } from '@/components/deals/SuggestionActionDialog';

interface AlertItem {
  id: string;
  type: 'stale-deal' | 'stale-lender';
  dealId: string;
  company: string;
  description: string;
  severity: 'warning' | 'destructive';
  daysSinceUpdate: number;
}

interface FlexNotification {
  id: string;
  deal_id: string;
  title: string;
  message: string;
  alert_type: string;
  created_at: string;
  read_at: string | null;
  deal_name?: string;
}

interface ActivityItem {
  id: string;
  deal_id: string;
  description: string;
  activity_type: string;
  created_at: string;
  deal_name?: string;
}

interface Task {
  id: string;
  action_type: string;
  scheduled_for: string;
  workflow_id?: string;
}

interface Milestone {
  id: string;
  title: string;
  deal_id: string;
  due_date: string | null;
  deal_company?: string;
}

interface SectionConfig {
  id: string;
  title: string;
  icon: React.ElementType;
  iconColor: string;
  bgColor: string;
  count: number;
}

const suggestionTypeConfig = {
  warning: { icon: Zap, label: 'Follow Up', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' },
  action: { icon: TrendingUp, label: 'Take Action', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
  opportunity: { icon: Sparkles, label: 'Opportunity', color: 'text-primary', bg: 'bg-primary/10' },
  reminder: { icon: Clock, label: 'Due Soon', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10' },
};

const getActivityIcon = (type: string) => {
  const icons: Record<string, string> = {
    deal_created: '🆕',
    stage_changed: '📊',
    lender_added: '🏦',
    lender_updated: '✏️',
    note_added: '📝',
    document_uploaded: '📄',
    milestone_completed: '✅',
    milestone_added: '🎯',
    email_linked: '📧',
    quote_received: '💰',
    status_changed: '🔄',
  };
  return icons[type] || '📌';
};

interface NotificationCarouselViewProps {
  alerts: AlertItem[];
  flexNotifications: FlexNotification[];
  activities: ActivityItem[];
  tasks: Task[];
  suggestions: DealSuggestion[];
  overdueMilestones: Milestone[];
  upcomingMilestones: Milestone[];
  isRead: (type: string, id: string) => boolean;
  markAsRead: (items: { notification_type: string; notification_id: string }[]) => void;
  markFlexAsRead: (ids: string[]) => void;
  onClose: () => void;
  onSuggestionsRefresh?: () => void;
}

export function NotificationCarouselView({
  alerts,
  flexNotifications,
  activities,
  tasks,
  suggestions,
  overdueMilestones,
  upcomingMilestones,
  isRead,
  markAsRead,
  markFlexAsRead,
  onClose,
  onSuggestionsRefresh,
}: NotificationCarouselViewProps) {
  const [selectedSuggestion, setSelectedSuggestion] = useState<DealSuggestion | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);

  const handleEditSuggestion = (e: React.MouseEvent, suggestion: DealSuggestion) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedSuggestion(suggestion);
    setActionDialogOpen(true);
  };

  const handleActionComplete = () => {
    onSuggestionsRefresh?.();
  };
  // Build sections array dynamically based on available data
  const sections = useMemo(() => {
    const sectionList: SectionConfig[] = [];
    
    if (alerts.length > 0) {
      sectionList.push({
        id: 'alerts',
        title: 'Alerts',
        icon: AlertTriangle,
        iconColor: 'text-warning',
        bgColor: 'bg-warning/10',
        count: alerts.length,
      });
    }
    
    if (flexNotifications.length > 0) {
      sectionList.push({
        id: 'flex',
        title: 'FLEx Engagement',
        icon: Zap,
        iconColor: 'text-amber-600 dark:text-amber-400',
        bgColor: 'bg-amber-500/10',
        count: flexNotifications.length,
      });
    }
    
    if (tasks.length > 0) {
      sectionList.push({
        id: 'tasks',
        title: 'Tasks & Reminders',
        icon: CalendarClock,
        iconColor: 'text-primary',
        bgColor: 'bg-primary/10',
        count: tasks.length,
      });
    }
    
    if (suggestions.length > 0) {
      sectionList.push({
        id: 'suggestions',
        title: 'Recommended Actions',
        icon: Sparkles,
        iconColor: 'text-primary',
        bgColor: 'bg-primary/10',
        count: suggestions.length,
      });
    }
    
    const milestonesCount = overdueMilestones.length + upcomingMilestones.length;
    if (milestonesCount > 0) {
      sectionList.push({
        id: 'milestones',
        title: 'Milestones',
        icon: Target,
        iconColor: 'text-purple-600 dark:text-purple-400',
        bgColor: 'bg-purple-500/10',
        count: milestonesCount,
      });
    }
    
    if (activities.length > 0) {
      sectionList.push({
        id: 'activity',
        title: 'Recent Activity',
        icon: Activity,
        iconColor: 'text-muted-foreground',
        bgColor: 'bg-muted/30',
        count: activities.length,
      });
    }
    
    return sectionList;
  }, [alerts, flexNotifications, tasks, suggestions, overdueMilestones, upcomingMilestones, activities]);

  const [currentIndex, setCurrentIndex] = useState(0);

  // Reset index if sections change
  useEffect(() => {
    if (currentIndex >= sections.length) {
      setCurrentIndex(0);
    }
  }, [sections.length, currentIndex]);

  const goToPrevious = useCallback(() => {
    setCurrentIndex(prev => (prev - 1 + sections.length) % sections.length);
  }, [sections.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex(prev => (prev + 1) % sections.length);
  }, [sections.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goToPrevious();
      if (e.key === 'ArrowRight') goToNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrevious, goToNext]);

  if (sections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Activity className="h-16 w-16 text-muted-foreground/30 mb-4" />
        <p className="text-lg font-medium">All caught up!</p>
        <p className="text-sm text-muted-foreground">No notifications at the moment</p>
      </div>
    );
  }

  const currentSection = sections[currentIndex];

  const renderSectionContent = () => {
    switch (currentSection.id) {
      case 'alerts':
        return (
          <div className="divide-y">
            {alerts.map((alert) => {
              const read = isRead('stale_alert', alert.dealId);
              return (
                <Link
                  key={alert.id}
                  to={`/deal/${alert.dealId}${alert.type === 'stale-lender' ? '?highlight=stale' : ''}`}
                  onClick={() => {
                    if (!read) markAsRead([{ notification_type: 'stale_alert', notification_id: alert.dealId }]);
                    onClose();
                  }}
                  className={cn(
                    "flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors rounded-lg",
                    read && "opacity-60"
                  )}
                >
                  <div className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full flex-shrink-0",
                    alert.severity === 'destructive' ? 'bg-destructive/10' : 'bg-warning/10'
                  )}>
                    {alert.type === 'stale-deal' ? (
                      <Building2 className={cn("h-5 w-5", alert.severity === 'destructive' ? 'text-destructive' : 'text-warning')} />
                    ) : (
                      <Users className={cn("h-5 w-5", alert.severity === 'destructive' ? 'text-destructive' : 'text-warning')} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm", !read && "font-medium")}>{alert.company}</p>
                    <p className="text-sm text-muted-foreground">{alert.description} • {alert.daysSinceUpdate} days ago</p>
                  </div>
                  {!read && <div className={cn("h-2.5 w-2.5 rounded-full", alert.severity === 'destructive' ? 'bg-destructive' : 'bg-warning')} />}
                </Link>
              );
            })}
          </div>
        );

      case 'flex':
        return (
          <div className="divide-y">
            {flexNotifications.map((notification) => {
              const read = !!notification.read_at;
              return (
                <Link
                  key={notification.id}
                  to={`/deal/${notification.deal_id}?tab=deal-management#flex-engagement-section`}
                  onClick={() => {
                    if (!read) markFlexAsRead([notification.id]);
                    onClose();
                  }}
                  className={cn(
                    "flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors rounded-lg",
                    read && "opacity-60"
                  )}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-lg flex-shrink-0">
                    {notification.alert_type === 'hot_engagement' ? '🔥' : 
                     notification.alert_type === 'term_sheet_request' ? '📋' :
                     notification.alert_type === 'nda_request' ? '📝' : 'ℹ️'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm", !read && "font-medium")}>{notification.title}</p>
                    <p className="text-sm text-muted-foreground">{notification.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  {!read && <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />}
                </Link>
              );
            })}
          </div>
        );

      case 'tasks':
        return (
          <div className="divide-y">
            {tasks.map((task) => (
              <Link
                key={task.id}
                to={task.workflow_id ? `/workflows/${task.workflow_id}` : '/scheduled-actions'}
                onClick={onClose}
                className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors rounded-lg"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 flex-shrink-0">
                  <CalendarClock className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {task.action_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Scheduled for {format(new Date(task.scheduled_for), 'MMM d, h:mm a')}
                  </p>
                </div>
                <Badge variant="outline">Pending</Badge>
              </Link>
            ))}
          </div>
        );

      case 'suggestions':
        return (
          <div className="divide-y">
            {suggestions.map((suggestion) => {
              const config = suggestionTypeConfig[suggestion.type];
              const Icon = config.icon;
              return (
                <div
                  key={suggestion.id}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors rounded-lg"
                >
                  <Link
                    to={`/deal/${suggestion.dealId}`}
                    onClick={onClose}
                    className="flex items-center gap-4 flex-1 min-w-0"
                  >
                    <div className={cn("flex h-10 w-10 items-center justify-center rounded-full flex-shrink-0", config.bg)}>
                      <Icon className={cn("h-5 w-5", config.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{suggestion.title}</p>
                      <p className="text-sm text-muted-foreground line-clamp-1">{suggestion.description}</p>
                    </div>
                  </Link>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      suggestion.priority === 'high' && 'border-destructive/50 text-destructive',
                      suggestion.priority === 'medium' && 'border-warning/50 text-warning'
                    )}
                  >
                    {suggestion.priority}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 flex-shrink-0"
                    onClick={(e) => handleEditSuggestion(e, suggestion)}
                  >
                    <Edit3 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        );

      case 'milestones':
        return (
          <div className="divide-y">
            {overdueMilestones.map((milestone) => {
              const dueDate = milestone.due_date ? new Date(milestone.due_date) : null;
              const daysOverdue = dueDate ? differenceInDays(new Date(), dueDate) : 0;
              return (
                <Link
                  key={milestone.id}
                  to={`/deal/${milestone.deal_id}`}
                  onClick={onClose}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors rounded-lg"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 flex-shrink-0">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{milestone.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {milestone.deal_company} • <span className="text-destructive">{daysOverdue} days overdue</span>
                    </p>
                  </div>
                  <Badge variant="destructive">Overdue</Badge>
                </Link>
              );
            })}
            {upcomingMilestones.map((milestone) => {
              const dueDate = milestone.due_date ? new Date(milestone.due_date) : null;
              return (
                <Link
                  key={milestone.id}
                  to={`/deal/${milestone.deal_id}`}
                  onClick={onClose}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors rounded-lg"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/10 flex-shrink-0">
                    <Clock className="h-5 w-5 text-warning" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{milestone.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {milestone.deal_company} • Due {dueDate ? format(dueDate, 'MMM d') : 'soon'}
                    </p>
                  </div>
                  <Badge variant="outline" className="border-warning/50 text-warning">Upcoming</Badge>
                </Link>
              );
            })}
          </div>
        );

      case 'activity':
        return (
          <div className="divide-y">
            {activities.map((activity) => {
              const read = isRead('activity', activity.id);
              return (
                <Link
                  key={activity.id}
                  to={`/deal/${activity.deal_id}`}
                  onClick={() => {
                    if (!read) markAsRead([{ notification_type: 'activity', notification_id: activity.id }]);
                    onClose();
                  }}
                  className={cn(
                    "flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors rounded-lg",
                    read && "opacity-60"
                  )}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-lg flex-shrink-0">
                    {getActivityIcon(activity.activity_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm", !read && "font-medium")}>{activity.description}</p>
                    <p className="text-sm text-muted-foreground">
                      {activity.deal_name && <span className="font-medium">{activity.deal_name}</span>}
                      {activity.deal_name && ' • '}
                      {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  {!read && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
                </Link>
              );
            })}
          </div>
        );

      default:
        return null;
    }
  };

  const Icon = currentSection.icon;

  return (
    <div className="flex flex-col h-full">
      {/* Navigation Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/30">
        <Button
          variant="ghost"
          size="icon"
          onClick={goToPrevious}
          className="h-10 w-10"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        
        <div className="flex flex-col items-center gap-1">
          <div className={cn("flex items-center gap-2 px-4 py-2 rounded-full", currentSection.bgColor)}>
            <Icon className={cn("h-5 w-5", currentSection.iconColor)} />
            <span className={cn("font-semibold", currentSection.iconColor)}>
              {currentSection.title}
            </span>
            <Badge variant="secondary" className="ml-1">
              {currentSection.count}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            {sections.map((section, idx) => (
              <button
                key={section.id}
                onClick={() => setCurrentIndex(idx)}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  idx === currentIndex 
                    ? "w-6 bg-primary" 
                    : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                )}
                aria-label={`Go to ${section.title}`}
              />
            ))}
          </div>
        </div>
        
        <Button
          variant="ghost"
          size="icon"
          onClick={goToNext}
          className="h-10 w-10"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 animate-fade-in" key={currentSection.id}>
          {renderSectionContent()}
        </div>
      </ScrollArea>

      {/* Section Quick Nav */}
      <div className="px-4 py-3 border-t bg-muted/20">
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {sections.map((section, idx) => {
            const SectionIcon = section.icon;
            return (
              <Button
                key={section.id}
                variant={idx === currentIndex ? "default" : "outline"}
                size="sm"
                onClick={() => setCurrentIndex(idx)}
                className={cn(
                  "h-8 gap-1.5",
                  idx === currentIndex && "shadow-md"
                )}
              >
                <SectionIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{section.title}</span>
                <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-xs">
                  {section.count}
                </Badge>
              </Button>
            );
          })}
        </div>
      </div>

      <SuggestionActionDialog
        suggestion={selectedSuggestion}
        open={actionDialogOpen}
        onOpenChange={setActionDialogOpen}
        onComplete={handleActionComplete}
      />
    </div>
  );
}
