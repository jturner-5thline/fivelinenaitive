import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { 
  LayoutDashboard, 
  FolderKanban, 
  Building2, 
  CloudCog, 
  LinkIcon,
  ArrowUpRight,
  Send,
  Plus,
  Globe,
  Activity,
  FileText,
  Users,
  TrendingUp,
  Clock
} from 'lucide-react';
import { useProfile } from '@/hooks/useProfile';
import { useAllActivities } from '@/hooks/useAllActivities';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

const quickActions = [
  { label: 'Landing page', icon: Globe },
  { label: 'Dashboard', icon: LayoutDashboard, active: true },
  { label: 'Portfolio', icon: FolderKanban },
  { label: 'Corporate', icon: Building2 },
  { label: 'SaaS', icon: CloudCog },
  { label: 'Link...', icon: LinkIcon },
];

const exploreIdeas = [
  { label: 'Sales tracking dashboard', href: '/deals' },
  { label: 'Lender Database', href: '/lenders' },
  { label: 'Analytics Dashboard', href: '/analytics' },
];

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

      <div className="min-h-screen bg-background flex flex-col items-center px-4 py-12">
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

          {/* Quick Actions */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">What would you like to build?</p>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <button className="flex items-center gap-1 hover:text-foreground transition-colors">
                  <LinkIcon className="h-3.5 w-3.5" />
                  Add website reference
                </button>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {quickActions.map((action) => (
                <Button
                  key={action.label}
                  variant={action.active ? 'outline' : 'ghost'}
                  size="sm"
                  className={`gap-2 ${action.active ? 'border-primary text-primary' : ''}`}
                  onClick={() => {
                    if (action.label === 'Dashboard') navigate('/deals');
                    if (action.label === 'Portfolio') navigate('/analytics');
                    if (action.label === 'Corporate') navigate('/company');
                    if (action.label === 'SaaS') navigate('/insights');
                  }}
                >
                  <action.icon className="h-4 w-4" />
                  {action.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Explore Ideas */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Explore ideas</p>
            <div className="flex flex-wrap gap-2">
              {exploreIdeas.map((idea) => (
                <Button
                  key={idea.label}
                  variant="outline"
                  size="sm"
                  className="gap-2 text-muted-foreground hover:text-foreground"
                  onClick={() => navigate(idea.href)}
                >
                  {idea.label}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Button>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Recent Activity
              </CardTitle>
            </CardHeader>
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
          </Card>
        </div>
      </div>
    </>
  );
}
