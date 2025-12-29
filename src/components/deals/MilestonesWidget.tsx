import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Target, Clock, AlertTriangle, CheckCircle2, ChevronRight, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAllMilestones } from '@/hooks/useAllMilestones';
import { differenceInDays, format, isAfter, isBefore, addDays } from 'date-fns';
import { cn } from '@/lib/utils';

export function MilestonesWidget() {
  const { milestones, isLoading } = useAllMilestones();

  const { overdue, upcoming, completed } = useMemo(() => {
    const now = new Date();
    const weekFromNow = addDays(now, 7);

    const overdue: typeof milestones = [];
    const upcoming: typeof milestones = [];
    const completed: typeof milestones = [];

    milestones.forEach(m => {
      if (m.completed) {
        completed.push(m);
      } else if (m.due_date && isBefore(new Date(m.due_date), now)) {
        overdue.push(m);
      } else if (m.due_date && isBefore(new Date(m.due_date), weekFromNow)) {
        upcoming.push(m);
      }
    });

    return {
      overdue: overdue.slice(0, 5),
      upcoming: upcoming.slice(0, 5),
      completed: completed.slice(0, 3),
    };
  }, [milestones]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-5 w-5" />
            Milestones
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const totalActive = overdue.length + upcoming.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="h-5 w-5" />
          Milestones
          {overdue.length > 0 && (
            <Badge variant="destructive" className="ml-auto">
              {overdue.length} overdue
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {totalActive > 0 
            ? `${upcoming.length} upcoming, ${overdue.length} overdue`
            : 'No upcoming milestones'
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {totalActive === 0 && completed.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No milestones to display</p>
          </div>
        ) : (
          <ScrollArea className="h-[280px]">
            <div className="space-y-4">
              {/* Overdue Section */}
              {overdue.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <span className="text-sm font-medium text-destructive">Overdue</span>
                  </div>
                  <div className="space-y-2">
                    {overdue.map(m => (
                      <MilestoneItem key={m.id} milestone={m} variant="overdue" />
                    ))}
                  </div>
                </div>
              )}

              {/* Upcoming Section */}
              {upcoming.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4 text-warning" />
                    <span className="text-sm font-medium text-warning">Due This Week</span>
                  </div>
                  <div className="space-y-2">
                    {upcoming.map(m => (
                      <MilestoneItem key={m.id} milestone={m} variant="upcoming" />
                    ))}
                  </div>
                </div>
              )}

              {/* Recently Completed */}
              {completed.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span className="text-sm font-medium text-success">Recently Completed</span>
                  </div>
                  <div className="space-y-2">
                    {completed.map(m => (
                      <MilestoneItem key={m.id} milestone={m} variant="completed" />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

interface MilestoneItemProps {
  milestone: {
    id: string;
    title: string;
    deal_id: string;
    due_date: string | null;
    deal_company: string;
    completed_at: string | null;
  };
  variant: 'overdue' | 'upcoming' | 'completed';
}

function MilestoneItem({ milestone, variant }: MilestoneItemProps) {
  const now = new Date();
  const dueDate = milestone.due_date ? new Date(milestone.due_date) : null;
  const daysOverdue = dueDate ? differenceInDays(now, dueDate) : 0;

  return (
    <Link
      to={`/deal/${milestone.deal_id}`}
      className={cn(
        "flex items-center gap-3 p-2 rounded-lg border transition-colors hover:bg-muted/50",
        variant === 'overdue' && "border-destructive/30 bg-destructive/5",
        variant === 'upcoming' && "border-warning/30 bg-warning/5",
        variant === 'completed' && "border-success/30 bg-success/5 opacity-75"
      )}
    >
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-sm font-medium truncate",
          variant === 'completed' && "line-through text-muted-foreground"
        )}>
          {milestone.title}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {milestone.deal_company}
        </p>
      </div>
      <div className="text-right shrink-0">
        {variant === 'overdue' && dueDate && (
          <p className="text-xs font-medium text-destructive">
            {daysOverdue}d overdue
          </p>
        )}
        {variant === 'upcoming' && dueDate && (
          <p className="text-xs font-medium text-warning">
            {format(dueDate, 'MMM d')}
          </p>
        )}
        {variant === 'completed' && milestone.completed_at && (
          <p className="text-xs text-muted-foreground">
            {format(new Date(milestone.completed_at), 'MMM d')}
          </p>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </Link>
  );
}
