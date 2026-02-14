import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Activity, ArrowUpRight, Clock, FileText, Users, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAllActivities } from '@/hooks/useAllActivities';

const getActivityIcon = (type: string) => {
  switch (type) {
    case 'deal_created': case 'deal_updated': return FileText;
    case 'lender_added': case 'lender_updated': return Users;
    case 'stage_changed': case 'status_changed': return TrendingUp;
    default: return Activity;
  }
};

const getActivityColor = (type: string) => {
  switch (type) {
    case 'deal_created': return 'text-success';
    case 'stage_changed': case 'status_changed': return 'text-primary';
    case 'lender_added': return 'text-accent-foreground';
    default: return 'text-muted-foreground';
  }
};

export default function RecentActivityWidget() {
  const navigate = useNavigate();
  const { activities, isLoading } = useAllActivities(8);

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3"><Skeleton className="h-5 w-32" /></CardHeader>
        <CardContent className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-1"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/4" /></div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          {activities.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No recent activity yet.</p>
          ) : (
            <div className="space-y-1">
              {activities.map((activity) => {
                const IconComponent = getActivityIcon(activity.activity_type);
                const colorClass = getActivityColor(activity.activity_type);
                return (
                  <button
                    key={activity.id}
                    onClick={() => navigate(`/deal/${activity.deal_id}`)}
                    className="w-full flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className={`mt-0.5 p-1.5 rounded-full bg-muted ${colorClass}`}>
                      <IconComponent className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground line-clamp-1">{activity.description}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {activity.deal_name && <span className="text-xs text-primary font-medium truncate max-w-[120px]">{activity.deal_name}</span>}
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />{formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </button>
                );
              })}
              <Button variant="ghost" size="sm" className="w-full mt-1 text-muted-foreground text-xs" onClick={() => navigate('/deals')}>
                View all activity <ArrowUpRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
