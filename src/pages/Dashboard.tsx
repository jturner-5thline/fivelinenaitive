import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { 
  ArrowUpRight,
  Send,
  Plus,
  Globe,
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
  ChevronUp
} from 'lucide-react';
import { useProfile } from '@/hooks/useProfile';
import { useAllActivities } from '@/hooks/useAllActivities';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CreateDealDialog } from '@/components/deals/CreateDealDialog';
import { DealsCalendar } from '@/components/deals/DealsCalendar';
import { NewsFeedWidget } from '@/components/deals/NewsFeedWidget';

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
  const [inputValue, setInputValue] = useState('');
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      navigate('/deals');
    }
  };

  return (
    <>
      <Helmet>
        <title>Dashboard - nAItive</title>
        <meta name="description" content="Your personal dashboard for managing deals and workflows." />
      </Helmet>

      <div className="bg-background flex flex-col items-center px-4 py-12">
        <div className="w-full max-w-3xl space-y-8">
          {/* Greeting */}
          <div className="text-center space-y-2">
            <p className="text-lg text-muted-foreground">
              {getTimeBasedGreeting()}, {firstName}
            </p>
            <h1 className="text-4xl md:text-5xl font-serif text-foreground">
              What can I do for you?
            </h1>
          </div>

          {/* Input Card */}
          <Card className="p-4 shadow-lg">
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                placeholder="Describe what you want to accomplish..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="border-0 text-base placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8">
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Badge variant="outline" className="gap-1.5 cursor-pointer hover:bg-accent">
                    <Globe className="h-3.5 w-3.5" />
                    Website
                  </Badge>
                </div>
                <Button 
                  type="submit" 
                  size="icon" 
                  variant="ghost" 
                  className="h-8 w-8 rounded-full bg-muted hover:bg-muted/80"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </Card>

          {/* Quick Widgets */}
          <div className="grid grid-cols-4 gap-4">
            {/* Calendar Widget */}
            <Card className="p-4 hover:bg-muted/50 transition-colors cursor-pointer">
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Calendar className="h-6 w-6 text-primary" />
                </div>
                <span className="text-sm font-medium text-foreground">Calendar</span>
              </div>
            </Card>

            {/* Email Widget */}
            <Card className="p-4 hover:bg-muted/50 transition-colors cursor-pointer">
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="h-12 w-12 rounded-xl bg-accent/50 flex items-center justify-center">
                  <Mail className="h-6 w-6 text-accent-foreground" />
                </div>
                <span className="text-sm font-medium text-foreground">Email</span>
              </div>
            </Card>

            {/* Quick Props Widget */}
            <Card className="p-4 hover:bg-muted/50 transition-colors cursor-pointer">
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="h-12 w-12 rounded-xl bg-success/20 flex items-center justify-center">
                  <Zap className="h-6 w-6 text-success" />
                </div>
                <span className="text-sm font-medium text-foreground">Quick Props</span>
              </div>
            </Card>

            {/* Create New Deal Widget */}
            <CreateDealDialog 
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
          </div>

          {/* Deals Calendar */}
          <DealsCalendar />

          {/* News Feed */}
          <NewsFeedWidget />

          {/* Recent Activity - Collapsible */}
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
                      {activityOpen ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
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
                              <p className="text-sm text-foreground line-clamp-1">
                                {activity.description}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {activity.deal_name && (
                                  <span className="text-xs text-primary font-medium truncate max-w-[150px]">
                                    {activity.deal_name}
                                  </span>
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
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full mt-2 text-muted-foreground"
                        onClick={() => navigate('/deals')}
                      >
                        View all activity
                        <ArrowUpRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </div>
      </div>
    </>
  );
}
