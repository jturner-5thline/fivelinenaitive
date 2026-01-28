import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Building2, Users, Zap, Activity, CalendarClock, Target, Clock, Sparkles, TrendingUp, Edit3 } from 'lucide-react';
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

interface NotificationGridCardsProps {
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

export function NotificationGridCards({
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
}: NotificationGridCardsProps) {
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

  return (
    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-max">
      {/* Alerts Card */}
      {alerts.length > 0 && (
        <Card className="flex flex-col max-h-[400px]">
          <CardHeader className="pb-2 flex-shrink-0">
            <CardTitle className="flex items-center gap-2 text-base text-warning">
              <AlertTriangle className="h-4 w-4" />
              Alerts ({alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            <ScrollArea className="h-full max-h-[320px]">
              <div className="divide-y px-4 pb-4">
                {alerts.slice(0, 8).map((alert) => {
                  const read = isRead('stale_alert', alert.dealId);
                  return (
                    <Link
                      key={alert.id}
                      to={`/deal/${alert.dealId}${alert.type === 'stale-lender' ? '?highlight=stale' : ''}`}
                      onClick={() => {
                        if (!read) {
                          markAsRead([{ notification_type: 'stale_alert', notification_id: alert.dealId }]);
                        }
                        onClose();
                      }}
                      className={cn(
                        "flex items-center gap-3 py-3 hover:bg-muted/50 transition-colors rounded-md px-2 -mx-2",
                        read && "opacity-60"
                      )}
                    >
                      <div className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0",
                        alert.severity === 'destructive' ? 'bg-destructive/10' : 'bg-warning/10'
                      )}>
                        {alert.type === 'stale-deal' ? (
                          <Building2 className={cn("h-4 w-4", alert.severity === 'destructive' ? 'text-destructive' : 'text-warning')} />
                        ) : (
                          <Users className={cn("h-4 w-4", alert.severity === 'destructive' ? 'text-destructive' : 'text-warning')} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm truncate", !read && "font-medium")}>{alert.company}</p>
                        <p className="text-xs text-muted-foreground truncate">{alert.daysSinceUpdate} days ago</p>
                      </div>
                      {!read && <div className={cn("h-2 w-2 rounded-full", alert.severity === 'destructive' ? 'bg-destructive' : 'bg-warning')} />}
                    </Link>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* FLEx Engagement Card */}
      {flexNotifications.length > 0 && (
        <Card className="flex flex-col max-h-[400px]">
          <CardHeader className="pb-2 flex-shrink-0">
            <CardTitle className="flex items-center gap-2 text-base text-amber-600 dark:text-amber-400">
              <Zap className="h-4 w-4" />
              FLEx Engagement ({flexNotifications.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            <ScrollArea className="h-full max-h-[320px]">
              <div className="divide-y px-4 pb-4">
                {flexNotifications.slice(0, 8).map((notification) => {
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
                        "flex items-center gap-3 py-3 hover:bg-muted/50 transition-colors rounded-md px-2 -mx-2",
                        read && "opacity-60"
                      )}
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10 text-base flex-shrink-0">
                        {notification.alert_type === 'hot_engagement' ? '🔥' : 
                         notification.alert_type === 'term_sheet_request' ? '📋' :
                         notification.alert_type === 'nda_request' ? '📝' : 'ℹ️'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm truncate", !read && "font-medium")}>{notification.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      {!read && <div className="h-2 w-2 rounded-full bg-amber-500" />}
                    </Link>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Tasks & Reminders Card */}
      {tasks.length > 0 && (
        <Card className="flex flex-col max-h-[400px]">
          <CardHeader className="pb-2 flex-shrink-0">
            <CardTitle className="flex items-center gap-2 text-base text-primary">
              <CalendarClock className="h-4 w-4" />
              Tasks & Reminders ({tasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            <ScrollArea className="h-full max-h-[320px]">
              <div className="divide-y px-4 pb-4">
                {tasks.slice(0, 8).map((task) => (
                  <Link
                    key={task.id}
                    to={task.workflow_id ? `/workflows/${task.workflow_id}` : '/scheduled-actions'}
                    onClick={onClose}
                    className="flex items-center gap-3 py-3 hover:bg-muted/50 transition-colors rounded-md px-2 -mx-2"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 flex-shrink-0">
                      <CalendarClock className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {task.action_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {format(new Date(task.scheduled_for), 'MMM d, h:mm a')}
                      </p>
                    </div>
                    <Badge variant="outline" className="flex-shrink-0 text-xs">Pending</Badge>
                  </Link>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Recommended Actions Card */}
      {suggestions.length > 0 && (
        <Card className="flex flex-col max-h-[400px]">
          <CardHeader className="pb-2 flex-shrink-0">
            <CardTitle className="flex items-center gap-2 text-base text-primary">
              <Sparkles className="h-4 w-4" />
              Recommended Actions ({suggestions.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            <ScrollArea className="h-full max-h-[320px]">
              <div className="divide-y px-4 pb-4">
                {suggestions.slice(0, 8).map((suggestion) => {
                  const config = suggestionTypeConfig[suggestion.type];
                  const Icon = config.icon;
                  return (
                    <div
                      key={suggestion.id}
                      className="flex items-center gap-3 py-3 hover:bg-muted/50 transition-colors rounded-md px-2 -mx-2"
                    >
                      <Link
                        to={`/deal/${suggestion.dealId}`}
                        onClick={onClose}
                        className="flex items-center gap-3 flex-1 min-w-0"
                      >
                        <div className={cn("flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0", config.bg)}>
                          <Icon className={cn("h-4 w-4", config.color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{suggestion.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{suggestion.description}</p>
                        </div>
                      </Link>
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "flex-shrink-0 text-xs",
                          suggestion.priority === 'high' && 'border-destructive/50 text-destructive',
                          suggestion.priority === 'medium' && 'border-warning/50 text-warning'
                        )}
                      >
                        {suggestion.priority}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 flex-shrink-0"
                        onClick={(e) => handleEditSuggestion(e, suggestion)}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Milestones Card */}
      {(overdueMilestones.length > 0 || upcomingMilestones.length > 0) && (
        <Card className="flex flex-col max-h-[400px]">
          <CardHeader className="pb-2 flex-shrink-0">
            <CardTitle className="flex items-center gap-2 text-base text-purple-600 dark:text-purple-400">
              <Target className="h-4 w-4" />
              Milestones ({overdueMilestones.length + upcomingMilestones.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            <ScrollArea className="h-full max-h-[320px]">
              <div className="divide-y px-4 pb-4">
                {overdueMilestones.slice(0, 4).map((milestone) => {
                  const dueDate = milestone.due_date ? new Date(milestone.due_date) : null;
                  const daysOverdue = dueDate ? differenceInDays(new Date(), dueDate) : 0;
                  return (
                    <Link
                      key={milestone.id}
                      to={`/deal/${milestone.deal_id}`}
                      onClick={onClose}
                      className="flex items-center gap-3 py-3 hover:bg-muted/50 transition-colors rounded-md px-2 -mx-2"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/10 flex-shrink-0">
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{milestone.title}</p>
                        <p className="text-xs text-destructive truncate">{daysOverdue} days overdue</p>
                      </div>
                      <Badge variant="destructive" className="flex-shrink-0 text-xs">Overdue</Badge>
                    </Link>
                  );
                })}
                {upcomingMilestones.slice(0, 4).map((milestone) => {
                  const dueDate = milestone.due_date ? new Date(milestone.due_date) : null;
                  return (
                    <Link
                      key={milestone.id}
                      to={`/deal/${milestone.deal_id}`}
                      onClick={onClose}
                      className="flex items-center gap-3 py-3 hover:bg-muted/50 transition-colors rounded-md px-2 -mx-2"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-warning/10 flex-shrink-0">
                        <Clock className="h-4 w-4 text-warning" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{milestone.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          Due {dueDate ? format(dueDate, 'MMM d') : 'soon'}
                        </p>
                      </div>
                      <Badge variant="outline" className="border-warning/50 text-warning flex-shrink-0 text-xs">Upcoming</Badge>
                    </Link>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity Card */}
      {activities.length > 0 && (
        <Card className="flex flex-col max-h-[400px]">
          <CardHeader className="pb-2 flex-shrink-0">
            <CardTitle className="flex items-center gap-2 text-base text-muted-foreground">
              <Activity className="h-4 w-4" />
              Recent Activity ({activities.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            <ScrollArea className="h-full max-h-[320px]">
              <div className="divide-y px-4 pb-4">
                {activities.slice(0, 8).map((activity) => {
                  const read = isRead('activity', activity.id);
                  return (
                    <Link
                      key={activity.id}
                      to={`/deal/${activity.deal_id}`}
                      onClick={() => {
                        if (!read) {
                          markAsRead([{ notification_type: 'activity', notification_id: activity.id }]);
                        }
                        onClose();
                      }}
                      className={cn(
                        "flex items-center gap-3 py-3 hover:bg-muted/50 transition-colors rounded-md px-2 -mx-2",
                        read && "opacity-60"
                      )}
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-base flex-shrink-0">
                        {getActivityIcon(activity.activity_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm truncate", !read && "font-medium")}>{activity.description}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      {!read && <div className="h-2 w-2 rounded-full bg-primary" />}
                    </Link>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
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
