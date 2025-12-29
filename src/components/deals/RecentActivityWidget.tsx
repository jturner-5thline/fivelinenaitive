import { useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { 
  Activity, 
  ArrowRight, 
  Building2, 
  UserPlus, 
  GitBranch, 
  CircleDot, 
  FileText, 
  MessageSquare, 
  PlusCircle,
  RefreshCw,
  Trash2,
  CheckCircle,
  Edit
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAllActivities } from '@/hooks/useAllActivities';
import { Link } from 'react-router-dom';

export function RecentActivityWidget() {
  const { activities, isLoading } = useAllActivities();

  const recentActivities = useMemo(() => {
    return activities.slice(0, 8);
  }, [activities]);

  const getActivityIcon = (type: string) => {
    const iconClass = "h-3.5 w-3.5";
    
    switch (type) {
      case 'lender_added':
        return <UserPlus className={iconClass} />;
      case 'lender_updated':
        return <RefreshCw className={iconClass} />;
      case 'lender_removed':
      case 'lender_deleted':
        return <Trash2 className={iconClass} />;
      case 'stage_changed':
        return <GitBranch className={iconClass} />;
      case 'status_changed':
        return <CircleDot className={iconClass} />;
      case 'deal_created':
        return <PlusCircle className={iconClass} />;
      case 'deal_updated':
        return <Edit className={iconClass} />;
      case 'note_added':
      case 'status_note_added':
        return <MessageSquare className={iconClass} />;
      case 'attachment_added':
      case 'document_added':
        return <FileText className={iconClass} />;
      case 'milestone_completed':
        return <CheckCircle className={iconClass} />;
      default:
        return <Activity className={iconClass} />;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'lender_added':
      case 'deal_created':
        return 'bg-success/10 text-success';
      case 'lender_removed':
      case 'lender_deleted':
        return 'bg-destructive/10 text-destructive';
      case 'stage_changed':
        return 'bg-primary/10 text-primary';
      case 'status_changed':
        return 'bg-warning/10 text-warning';
      case 'milestone_completed':
        return 'bg-success/10 text-success';
      default:
        return 'bg-primary/10 text-primary';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3 animate-pulse">
                <div className="h-6 w-6 rounded-full bg-muted" />
                <div className="flex-1 space-y-1">
                  <div className="h-3 w-3/4 bg-muted rounded" />
                  <div className="h-2 w-1/2 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (recentActivities.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No recent activity
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[200px] px-4 pb-4">
          <div className="space-y-3">
            {recentActivities.map((activity) => (
              <Link
                key={activity.id}
                to={`/deal/${activity.deal_id}`}
                className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors group"
              >
                <div className={`flex-shrink-0 h-6 w-6 rounded-full ${getActivityColor(activity.activity_type)} flex items-center justify-center`}>
                  {getActivityIcon(activity.activity_type)}
                </div>
                <div className="flex-1 min-w-0">
                  {activity.deal_name && (
                    <div className="flex items-center gap-1 mb-0.5">
                      <Building2 className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[10px] font-medium text-muted-foreground truncate">
                        {activity.deal_name}
                      </span>
                    </div>
                  )}
                  <p className="text-xs text-foreground line-clamp-2">
                    {activity.description}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                  </p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1" />
              </Link>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}