import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { 
  ArrowUpRight,
  Activity,
  FileText,
  Users,
  TrendingUp,
  Clock,
  Briefcase,
  Calendar,
  Mail,
  Zap,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useProfile } from '@/hooks/useProfile';
import { useAllActivities } from '@/hooks/useAllActivities';
import { useDashboardWidgets } from '@/contexts/DashboardWidgetsContext';
import { useDashboardLayout } from '@/contexts/DashboardLayoutContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CreateDealDialog } from '@/components/deals/CreateDealDialog';
import { NewsFeedWidget } from '@/components/deals/NewsFeedWidget';
import { NotificationCarousel } from '@/components/dashboard/NotificationCarousel';
import { QuickPromptsDialog } from '@/components/dashboard/QuickPromptsDialog';
import { DashboardWidgetSettings } from '@/components/dashboard/DashboardWidgetSettings';
import { DashboardAIInput } from '@/components/dashboard/DashboardAIInput';
import { WorkflowSuggestionsWidget } from '@/components/dashboard/WorkflowSuggestionsWidget';
import { AgentSuggestionsWidget } from '@/components/dashboard/AgentSuggestionsWidget';
import { DashboardLayoutSwitcher } from '@/components/dashboard/DashboardLayoutSwitcher';
import { MyDealsWidget } from '@/components/dashboard/MyDealsWidget';
import { MyTasksWidget } from '@/components/dashboard/MyTasksWidget';
import { MyDayWidget } from '@/components/dashboard/MyDayWidget';
import { KeyAlertsWidget } from '@/components/dashboard/KeyAlertsWidget';
import { EmailIntelligenceWidget } from '@/components/dashboard/EmailIntelligenceWidget';

const getActivityIcon = (type: string) => {
  switch (type) {
    case 'deal_created':
    case 'deal_updated':
      return FileText;
    case 'lender_added':
    case 'lender_updated':
      return Users;
    case 'stage_changed':
    case 'status_changed':
      return TrendingUp;
    default:
      return Activity;
  }
};

const getActivityColor = (type: string) => {
  switch (type) {
    case 'deal_created':
      return 'text-success';
    case 'stage_changed':
    case 'status_changed':
      return 'text-primary';
    case 'lender_added':
      return 'text-accent-foreground';
    default:
      return 'text-muted-foreground';
  }
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { activities, isLoading: activitiesLoading } = useAllActivities(5);
  const { isWidgetEnabled, getQuickActionWidgets } = useDashboardWidgets();
  const { layoutMode, toggles } = useDashboardLayout();
  const [activityOpen, setActivityOpen] = useState(() => {
    const saved = localStorage.getItem('dashboard-activity-open');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const handleActivityToggle = (open: boolean) => {
    setActivityOpen(open);
    localStorage.setItem('dashboard-activity-open', JSON.stringify(open));
  };

  const firstName = profile?.first_name || profile?.display_name?.split(' ')[0] || 'there';

  const getTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const quickActionWidgets = getQuickActionWidgets();
  const hasQuickActions = quickActionWidgets.length > 0;

  const renderQuickActionWidget = (widgetId: string) => {
    switch (widgetId) {
      case 'calendar':
        return (
          <Card key="calendar" className="p-4 hover:bg-muted/50 transition-colors cursor-pointer">
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
              <span className="text-sm font-medium text-foreground">Calendar</span>
            </div>
          </Card>
        );
      case 'email':
        return (
          <Card key="email" className="p-4 hover:bg-muted/50 transition-colors cursor-pointer">
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="h-12 w-12 rounded-xl bg-accent/50 flex items-center justify-center">
                <Mail className="h-6 w-6 text-accent-foreground" />
              </div>
              <span className="text-sm font-medium text-foreground">Email</span>
            </div>
          </Card>
        );
      case 'quick-prompts':
        return (
          <QuickPromptsDialog
            key="quick-prompts"
            trigger={
              <Card className="p-4 hover:bg-muted/50 transition-colors cursor-pointer">
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="h-12 w-12 rounded-xl bg-success/20 flex items-center justify-center">
                    <Zap className="h-6 w-6 text-success" />
                  </div>
                  <span className="text-sm font-medium text-foreground">Quick Prompts</span>
                </div>
              </Card>
            }
          />
        );
      case 'create-deal':
        return (
          <CreateDealDialog 
            key="create-deal"
            trigger={
              <Card className="p-4 hover:bg-muted/50 transition-colors cursor-pointer">
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                    <Briefcase className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <span className="text-sm font-medium text-foreground">Create New Deal</span>
                </div>
              </Card>
            }
          />
        );
      default:
        return null;
    }
  };

  // Recent activity section (shared across layouts)
  const renderRecentActivity = () => {
    if (!isWidgetEnabled('recent-activity')) return null;
    return (
      <Collapsible open={activityOpen} onOpenChange={handleActivityToggle}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors">
              <CardTitle className="text-lg font-medium flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  Recent Activity
                </div>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  {activityOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-1">
              {activitiesLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <div className="flex-1 space-y-1">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/4" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : activities.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No recent activity yet. Start by creating a deal!
                </p>
              ) : (
                <div className="space-y-1">
                  {activities.map((activity) => {
                    const IconComponent = getActivityIcon(activity.activity_type);
                    const colorClass = getActivityColor(activity.activity_type);
                    return (
                      <button
                        key={activity.id}
                        onClick={() => navigate(`/deal/${activity.deal_id}`)}
                        className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
                      >
                        <div className={`mt-0.5 p-1.5 rounded-full bg-muted ${colorClass}`}>
                          <IconComponent className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground line-clamp-1">{activity.description}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {activity.deal_name && (
                              <span className="text-xs text-primary font-medium truncate max-w-[150px]">{activity.deal_name}</span>
                            )}
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                    );
                  })}
                  <Button variant="ghost" size="sm" className="w-full mt-2 text-muted-foreground" onClick={() => navigate('/deals')}>
                    View all activity
                    <ArrowUpRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    );
  };

  // =========================================
  // FOCUS MODE: AI input hero, deals + calendar side-by-side
  // =========================================
  const renderFocusMode = () => (
    <div className="w-full max-w-5xl space-y-8">
      {/* Greeting */}
      <div className="text-center space-y-2">
        <p className="text-lg text-muted-foreground">{getTimeBasedGreeting()}, {firstName}</p>
        <h1 className="text-4xl md:text-5xl font-serif text-foreground">What can I do for you?</h1>
      </div>

      {/* AI Search Input — Hero */}
      <DashboardAIInput />

      {/* Quick Widgets */}
      {hasQuickActions && (
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(quickActionWidgets.length, 4)}, minmax(0, 1fr))` }}>
          {quickActionWidgets.map(widget => renderQuickActionWidget(widget.id))}
        </div>
      )}

      {/* Key Alerts */}
      <KeyAlertsWidget />

      {/* Two-column: My Deals + My Day */}
      <div className="grid gap-6 md:grid-cols-2">
        <MyDealsWidget variant="expanded" maxItems={8} />
        <div className="space-y-6">
          <MyDayWidget defaultOpen={!toggles.collapseCalendarByDefault} />
          <MyTasksWidget variant="compact" defaultOpen={false} />
        </div>
      </div>

      {/* Email Intelligence */}
      <EmailIntelligenceWidget />

      {/* Notification Carousel */}
      {isWidgetEnabled('notifications') && <NotificationCarousel />}

      {/* AI Suggestions */}
      <div className="grid gap-4 md:grid-cols-2">
        <WorkflowSuggestionsWidget />
        <AgentSuggestionsWidget />
      </div>

      {/* News Feed */}
      {isWidgetEnabled('news-feed') && <NewsFeedWidget />}

      {/* Recent Activity */}
      {renderRecentActivity()}
    </div>
  );

  // =========================================
  // TASK OPS MODE: Tasks hero, deals + alerts in columns
  // =========================================
  const renderTaskOpsMode = () => (
    <div className="w-full max-w-5xl space-y-8">
      {/* Greeting — compact */}
      <div className="space-y-1">
        <p className="text-lg text-muted-foreground">{getTimeBasedGreeting()}, {firstName}</p>
        <h1 className="text-3xl font-serif text-foreground">Here's what needs your attention</h1>
      </div>

      {/* Tasks — Hero section */}
      <MyTasksWidget variant="expanded" defaultOpen={true} />

      {/* Key Alerts — prominent */}
      <KeyAlertsWidget />

      {/* Two-column: My Deals + Calendar/Email */}
      <div className="grid gap-6 md:grid-cols-2">
        <MyDealsWidget variant="expanded" maxItems={10} />
        <div className="space-y-6">
          <MyDayWidget defaultOpen={!toggles.collapseCalendarByDefault} />
          <EmailIntelligenceWidget />
        </div>
      </div>

      {/* AI Search */}
      <DashboardAIInput />

      {/* Notification Carousel */}
      {isWidgetEnabled('notifications') && <NotificationCarousel />}

      {/* AI Suggestions */}
      <div className="grid gap-4 md:grid-cols-2">
        <WorkflowSuggestionsWidget />
        <AgentSuggestionsWidget />
      </div>

      {/* Recent Activity */}
      {renderRecentActivity()}
    </div>
  );

  // =========================================
  // PIPELINE VIEW: Full-width deals table with inline details
  // =========================================
  const renderPipelineView = () => (
    <div className="w-full max-w-6xl space-y-6">
      {/* Compact greeting + AI input */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{getTimeBasedGreeting()}, {firstName}</p>
          <h1 className="text-2xl font-serif text-foreground">Pipeline Overview</h1>
        </div>
        <div className="flex items-center gap-2">
          {hasQuickActions && quickActionWidgets.slice(0, 2).map(w => renderQuickActionWidget(w.id))}
        </div>
      </div>

      {/* Key Alerts — inline banner style */}
      <KeyAlertsWidget />

      {/* My Deals — full width table variant */}
      <MyDealsWidget variant="table" />

      {/* Three-column: Tasks + Calendar + Email */}
      <div className="grid gap-6 md:grid-cols-3">
        <MyTasksWidget variant="compact" defaultOpen={true} />
        <MyDayWidget defaultOpen={!toggles.collapseCalendarByDefault} />
        <EmailIntelligenceWidget />
      </div>

      {/* AI Input */}
      <DashboardAIInput />

      {/* Notification Carousel */}
      {isWidgetEnabled('notifications') && <NotificationCarousel />}

      {/* News + Activity collapsed */}
      <div className="grid gap-4 md:grid-cols-2">
        {isWidgetEnabled('news-feed') && <NewsFeedWidget />}
        {renderRecentActivity()}
      </div>
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Dashboard - naitive</title>
        <meta name="description" content="Your personal dashboard for managing deals and workflows." />
      </Helmet>

      <div className="bg-transparent flex flex-col items-center px-4 py-8">
        {/* Layout Switcher */}
        <div className="w-full max-w-6xl flex items-center justify-between mb-6">
          <DashboardLayoutSwitcher />
          <DashboardWidgetSettings
            trigger={
              <Button variant="ghost" size="sm" className="text-muted-foreground text-xs">
                Widgets
              </Button>
            }
          />
        </div>

        {layoutMode === 'focus' && renderFocusMode()}
        {layoutMode === 'task-ops' && renderTaskOpsMode()}
        {layoutMode === 'pipeline' && renderPipelineView()}
      </div>
    </>
  );
}
