import { 
  Clock, 
  UserPlus, 
  FileText, 
  TrendingUp, 
  MessageSquare, 
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Trash2,
  Undo2
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ActivityItem {
  id: string;
  type: 'status_change' | 'stage_change' | 'note_added' | 'contact_added' | 'value_updated' | 'comment' | 'created' | 'lender_removed';
  description: string;
  user: string;
  timestamp: string;
  metadata?: {
    from?: string;
    to?: string;
    value?: string;
    lenderName?: string;
    lenderData?: any;
  };
  onUndo?: () => void;
}

interface ActivityTimelineProps {
  activities: ActivityItem[];
}

const activityIcons: Record<ActivityItem['type'], typeof Clock> = {
  status_change: ArrowRight,
  stage_change: TrendingUp,
  note_added: FileText,
  contact_added: UserPlus,
  value_updated: TrendingUp,
  comment: MessageSquare,
  created: CheckCircle,
  lender_removed: Trash2,
};

const activityColors: Record<ActivityItem['type'], string> = {
  status_change: 'bg-blue-500',
  stage_change: 'bg-purple-500',
  note_added: 'bg-amber-500',
  contact_added: 'bg-cyan-500',
  value_updated: 'bg-success',
  comment: 'bg-slate-500',
  created: 'bg-primary',
  lender_removed: 'bg-destructive',
};

export function ActivityTimeline({ activities }: ActivityTimelineProps) {
  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="flow-root">
      <ul className="-mb-8">
        {activities.map((activity, index) => {
          const Icon = activityIcons[activity.type];
          const isLast = index === activities.length - 1;

          return (
            <li key={activity.id} className="animate-fade-in" style={{ animationDelay: `${index * 50}ms` }}>
              <div className="relative pb-8">
                {!isLast && (
                  <span
                    className="absolute left-4 top-8 -ml-px h-full w-0.5 bg-border"
                    aria-hidden="true"
                  />
                )}
                <div className="relative flex items-start space-x-3">
                  <div className={`relative flex h-8 w-8 items-center justify-center rounded-full ${activityColors[activity.type]}`}>
                    <Icon className="h-4 w-4 text-white" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-foreground">
                        {activity.description}
                        {activity.metadata?.from && activity.metadata?.to && (
                          <span className="text-muted-foreground">
                            {' '}from <span className="font-medium text-foreground">{activity.metadata.from}</span> to{' '}
                            <span className="font-medium text-foreground">{activity.metadata.to}</span>
                          </span>
                        )}
                      </p>
                      {activity.onUndo && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs gap-1 px-2 shrink-0"
                          onClick={activity.onUndo}
                        >
                          <Undo2 className="h-3 w-3" />
                          Undo
                        </Button>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{activity.user}</span>
                      <span>•</span>
                      <time dateTime={activity.timestamp}>{formatDate(activity.timestamp)}</time>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
