import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Target, CheckCircle2, Circle, Clock, AlertTriangle, ChevronRight, Loader2, ArrowUpDown, ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAllMilestones, MilestoneWithDeal } from '@/hooks/useAllMilestones';
import { differenceInDays, format, isBefore } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type MilestoneFilter = 'all' | 'incomplete' | 'complete';
type MilestoneSort = 'oldest' | 'newest';

export function DealMilestonesView({ onBack, managerFilter = [] }: { onBack?: () => void; managerFilter?: string[] }) {
  const { milestones, isLoading } = useAllMilestones();
  const [filter, setFilter] = useState<MilestoneFilter>('all');
  const [sort, setSort] = useState<MilestoneSort>('oldest');

  const filteredAndSorted = useMemo(() => {
    let result = [...milestones];

    // Manager filter
    if (managerFilter.length > 0) {
      result = result.filter(m => m.deal_owner && managerFilter.includes(m.deal_owner));
    }

    // Filter
    if (filter === 'complete') {
      result = result.filter(m => m.completed);
    } else if (filter === 'incomplete') {
      result = result.filter(m => !m.completed);
    }

    // Sort by due_date
    result.sort((a, b) => {
      const dateA = a.due_date ? new Date(a.due_date).getTime() : Infinity;
      const dateB = b.due_date ? new Date(b.due_date).getTime() : Infinity;
      return sort === 'oldest' ? dateA - dateB : dateB - dateA;
    });

    return result;
  }, [milestones, filter, sort, managerFilter]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        {onBack && (
          <Button variant="outline" size="sm" className="gap-1.5 h-8 font-medium bg-gradient-to-r from-background to-primary/20 border-primary/30 hover:border-primary/50 hover:to-primary/30 transition-all" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Back to Deals
          </Button>
        )}
        <div className="flex items-center border rounded-md">
          {(['all', 'incomplete', 'complete'] as MilestoneFilter[]).map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'secondary' : 'ghost'}
              size="sm"
              className={cn("h-8 px-3 capitalize", f === 'all' && 'rounded-r-none', f === 'complete' && 'rounded-l-none', f === 'incomplete' && 'rounded-none border-x')}
              onClick={() => setFilter(f)}
            >
              {f}
            </Button>
          ))}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 h-8">
              <ArrowUpDown className="h-3.5 w-3.5" />
              {sort === 'oldest' ? 'Oldest First' : 'Newest First'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setSort('oldest')} className={sort === 'oldest' ? 'bg-accent' : ''}>
              Oldest First
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSort('newest')} className={sort === 'newest' ? 'bg-accent' : ''}>
              Newest First
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="text-sm text-muted-foreground ml-auto">
          {filteredAndSorted.length} {filteredAndSorted.length === 1 ? 'milestone' : 'milestones'}
        </span>
      </div>

      {/* Milestones List */}
      {filteredAndSorted.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Target className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm font-medium">No milestones found</p>
          <p className="text-xs mt-1">Try changing your filter</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredAndSorted.map(m => (
            <MilestoneRow key={m.id} milestone={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function MilestoneRow({ milestone }: { milestone: MilestoneWithDeal }) {
  const now = new Date();
  const dueDate = milestone.due_date ? new Date(milestone.due_date) : null;
  const isOverdue = dueDate && !milestone.completed && isBefore(dueDate, now);
  const daysOverdue = dueDate ? differenceInDays(now, dueDate) : 0;

  return (
    <Link
      to={`/deal/${milestone.deal_id}`}
      className={cn(
        "flex items-center gap-4 p-3 rounded-lg border transition-colors hover:bg-muted/50",
        isOverdue && "border-destructive/30 bg-destructive/5",
        milestone.completed && "opacity-75"
      )}
    >
      {milestone.completed ? (
        <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
      ) : isOverdue ? (
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
      ) : (
        <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
      )}

      <div className="flex-1 min-w-0 flex items-center gap-2">
        <Badge variant="secondary" className="shrink-0 font-medium text-sm bg-accent/20 text-accent-foreground border border-accent/30 rounded-md">
          {milestone.deal_company}
        </Badge>
        <span className="text-sm text-muted-foreground">—</span>
        <p className={cn(
          "text-sm font-medium truncate",
          milestone.completed && "line-through text-muted-foreground"
        )}>
          {milestone.title}
        </p>
        {milestone.deal_owner && (
          <Badge className="shrink-0 text-sm font-semibold rounded-md ml-auto px-2.5 py-0.5 bg-gradient-to-r from-primary/30 via-accent/20 to-primary/10 text-primary-foreground drop-shadow-sm border border-primary/20">
            {milestone.deal_owner}
          </Badge>
        )}
      </div>

      <div className="text-right shrink-0">
        {isOverdue && dueDate && (
          <Badge variant="destructive" className="text-xs">
            {daysOverdue}d overdue
          </Badge>
        )}
        {!isOverdue && dueDate && !milestone.completed && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {format(dueDate, 'MMM d, yyyy')}
          </span>
        )}
        {milestone.completed && milestone.completed_at && (
          <span className="text-xs text-muted-foreground">
            Completed {format(new Date(milestone.completed_at), 'MMM d')}
          </span>
        )}
        {!dueDate && !milestone.completed && (
          <span className="text-xs text-muted-foreground">No date</span>
        )}
      </div>

      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </Link>
  );
}
