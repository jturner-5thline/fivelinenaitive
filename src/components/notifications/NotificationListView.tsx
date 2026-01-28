import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Building2, Users, Zap, Activity, CalendarClock, Target, Clock, Sparkles, TrendingUp, ChevronRight, ChevronDown, Bell, Edit3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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

interface NotificationListViewProps {
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
  totalNotifications: number;
  isLoading: boolean;
  onSuggestionsRefresh?: () => void;
}

export function NotificationListView({
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
  totalNotifications,
  isLoading,
  onSuggestionsRefresh,
}: NotificationListViewProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    alerts: true,
    flex: true,
    tasks: true,
    suggestions: true,
    milestones: true,
    activity: true,
  });
  const [selectedSuggestion, setSelectedSuggestion] = useState<DealSuggestion | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleEditSuggestion = (e: React.MouseEvent, suggestion: DealSuggestion) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedSuggestion(suggestion);
    setActionDialogOpen(true);
  };

  const handleActionComplete = () => {
    onSuggestionsRefresh?.();
  };

  return (
    <div className="divide-y">
      {/* Alerts Section */}
      {alerts.length > 0 && (
        <Collapsible open={openSections.alerts} onOpenChange={() => toggleSection('alerts')}>
          <CollapsibleTrigger className="w-full">
            <div className="px-6 py-3 bg-warning/10 sticky top-0 z-10 hover:bg-warning/15 transition-colors cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-warning">
                  <AlertTriangle className="h-4 w-4" />
                  Alerts ({alerts.length})
                </div>
                <ChevronDown className={cn(
                  "h-4 w-4 text-warning transition-transform duration-200",
                  !openSections.alerts && "-rotate-90"
                )} />
              </div>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
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
                      <p className={cn("text-sm", !read && "font-medium")}>{alert.company}</p>
                      <p className="text-sm text-muted-foreground">{alert.description} • {alert.daysSinceUpdate} days ago</p>
                    </div>
                    {!read && <div className={cn("h-2.5 w-2.5 rounded-full flex-shrink-0", alert.severity === 'destructive' ? 'bg-destructive' : 'bg-warning')} />}
                    <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  </Link>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
      
      {/* FLEx Alerts Section */}
      {flexNotifications.length > 0 && (
        <Collapsible open={openSections.flex} onOpenChange={() => toggleSection('flex')}>
          <CollapsibleTrigger className="w-full">
            <div className="px-6 py-3 bg-amber-500/10 sticky top-0 z-10 hover:bg-amber-500/15 transition-colors cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
                  <Zap className="h-4 w-4" />
                  FLEx Engagement ({flexNotifications.length})
                </div>
                <ChevronDown className={cn(
                  "h-4 w-4 text-amber-600 dark:text-amber-400 transition-transform duration-200",
                  !openSections.flex && "-rotate-90"
                )} />
              </div>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
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
                      <p className={cn("text-sm", !read && "font-medium")}>{notification.title}</p>
                      <p className="text-sm text-muted-foreground">{notification.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {notification.deal_name && <span className="font-medium">{notification.deal_name}</span>}
                        {notification.deal_name && ' • '}
                        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    {!read && <div className="h-2.5 w-2.5 rounded-full bg-amber-500 flex-shrink-0" />}
                    <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  </Link>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Tasks & Reminders Section */}
      {tasks.length > 0 && (
        <Collapsible open={openSections.tasks} onOpenChange={() => toggleSection('tasks')}>
          <CollapsibleTrigger className="w-full">
            <div className="px-6 py-3 bg-primary/10 sticky top-0 z-10 hover:bg-primary/15 transition-colors cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <CalendarClock className="h-4 w-4" />
                  Tasks & Reminders ({tasks.length})
                </div>
                <ChevronDown className={cn(
                  "h-4 w-4 text-primary transition-transform duration-200",
                  !openSections.tasks && "-rotate-90"
                )} />
              </div>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="divide-y">
              {tasks.map((task) => (
                <Link
                  key={task.id}
                  to={task.workflow_id ? `/workflows/${task.workflow_id}` : '/scheduled-actions'}
                  onClick={onClose}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 flex-shrink-0">
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
                  <Badge variant="outline" className="flex-shrink-0">Pending</Badge>
                  <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                </Link>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Recommended Actions Section */}
      {suggestions.length > 0 && (
        <Collapsible open={openSections.suggestions} onOpenChange={() => toggleSection('suggestions')}>
          <CollapsibleTrigger className="w-full">
            <div className="px-6 py-3 bg-primary/10 sticky top-0 z-10 hover:bg-primary/15 transition-colors cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <Sparkles className="h-4 w-4" />
                  Recommended Actions ({suggestions.length})
                </div>
                <ChevronDown className={cn(
                  "h-4 w-4 text-primary transition-transform duration-200",
                  !openSections.suggestions && "-rotate-90"
                )} />
              </div>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="divide-y">
              {suggestions.map((suggestion) => {
                const config = suggestionTypeConfig[suggestion.type];
                const Icon = config.icon;
                return (
                  <div
                    key={suggestion.id}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-muted/50 transition-colors"
                  >
                    <Link 
                      to={`/deal/${suggestion.dealId}`}
                      onClick={onClose}
                      className="flex items-center gap-4 flex-1 min-w-0"
                    >
                      <div className={cn("flex h-11 w-11 items-center justify-center rounded-full flex-shrink-0", config.bg)}>
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
                        "flex-shrink-0",
                        suggestion.priority === 'high' && 'border-destructive/50 text-destructive',
                        suggestion.priority === 'medium' && 'border-warning/50 text-warning',
                        suggestion.priority === 'low' && 'border-muted-foreground/50 text-muted-foreground'
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
          </CollapsibleContent>
        </Collapsible>
      )}
      
      {/* Milestones Section */}
      {(overdueMilestones.length > 0 || upcomingMilestones.length > 0) && (
        <Collapsible open={openSections.milestones} onOpenChange={() => toggleSection('milestones')}>
          <CollapsibleTrigger className="w-full">
            <div className="px-6 py-3 bg-purple-500/10 sticky top-0 z-10 hover:bg-purple-500/15 transition-colors cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-purple-600 dark:text-purple-400">
                  <Target className="h-4 w-4" />
                  Milestones ({overdueMilestones.length + upcomingMilestones.length})
                </div>
                <ChevronDown className={cn(
                  "h-4 w-4 text-purple-600 dark:text-purple-400 transition-transform duration-200",
                  !openSections.milestones && "-rotate-90"
                )} />
              </div>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="divide-y">
              {overdueMilestones.map((milestone) => {
                const dueDate = milestone.due_date ? new Date(milestone.due_date) : null;
                const daysOverdue = dueDate ? differenceInDays(new Date(), dueDate) : 0;
                return (
                  <Link
                    key={milestone.id}
                    to={`/deal/${milestone.deal_id}`}
                    onClick={onClose}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 flex-shrink-0">
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{milestone.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {milestone.deal_company} • <span className="text-destructive">{daysOverdue} days overdue</span>
                      </p>
                    </div>
                    <Badge variant="destructive" className="flex-shrink-0">Overdue</Badge>
                    <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
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
                    className="flex items-center gap-4 px-6 py-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-warning/10 flex-shrink-0">
                      <Clock className="h-5 w-5 text-warning" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{milestone.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {milestone.deal_company} • Due {dueDate ? format(dueDate, 'MMM d') : 'soon'}
                      </p>
                    </div>
                    <Badge variant="outline" className="border-warning/50 text-warning flex-shrink-0">Upcoming</Badge>
                    <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  </Link>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Activity Feed Section */}
      {activities.length > 0 && (
        <Collapsible open={openSections.activity} onOpenChange={() => toggleSection('activity')}>
          <CollapsibleTrigger className="w-full">
            <div className="px-6 py-3 bg-muted/30 sticky top-0 z-10 hover:bg-muted/40 transition-colors cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <Activity className="h-4 w-4" />
                  Recent Activity ({activities.length})
                </div>
                <ChevronDown className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform duration-200",
                  !openSections.activity && "-rotate-90"
                )} />
              </div>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
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
                      "flex items-center gap-4 px-6 py-4 hover:bg-muted/50 transition-colors",
                      read && "opacity-60"
                    )}
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-xl flex-shrink-0">
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
                    {!read && <div className="h-2.5 w-2.5 rounded-full bg-primary flex-shrink-0" />}
                    <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  </Link>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
      
      {/* Empty State */}
      {totalNotifications === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Bell className="h-16 w-16 text-muted-foreground/30 mb-4" />
          <p className="text-lg font-medium">All caught up!</p>
          <p className="text-sm text-muted-foreground">No notifications at the moment</p>
        </div>
      )}
      
      {/* Loading State */}
      {isLoading && activities.length === 0 && (
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      <SuggestionActionDialog
        suggestion={selectedSuggestion}
        open={actionDialogOpen}
        onOpenChange={setActionDialogOpen}
        onComplete={handleActionComplete}
      />
    </div>
  );
}
