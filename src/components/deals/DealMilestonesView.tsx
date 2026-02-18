import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Target, CheckCircle2, Circle, Clock, AlertTriangle, ChevronRight, Loader2, ArrowUpDown, ArrowLeft, Calendar as CalendarIcon, X, CheckSquare, Square } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAllMilestones, MilestoneWithDeal } from '@/hooks/useAllMilestones';
import { MILESTONE_STATUS_CONFIG, MilestoneStatus } from '@/types/deal';
import { differenceInDays, format, isBefore } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type MilestoneFilter = 'all' | 'incomplete' | 'complete';
type MilestoneSort = 'oldest' | 'newest';

export function DealMilestonesView({ onBack, managerFilter = [] }: { onBack?: () => void; managerFilter?: string[] }) {
  const { milestones, isLoading, refetch } = useAllMilestones();
  const [filter, setFilter] = useState<MilestoneFilter>('all');
  const [sort, setSort] = useState<MilestoneSort>('oldest');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

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

  const visibleIds = useMemo(() => new Set(filteredAndSorted.map(m => m.id)), [filteredAndSorted]);
  const allSelected = filteredAndSorted.length > 0 && filteredAndSorted.every(m => selectedIds.has(m.id));

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAndSorted.map(m => m.id)));
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  // Clean up selection when filter changes
  const activeSelected = useMemo(() => {
    return [...selectedIds].filter(id => visibleIds.has(id));
  }, [selectedIds, visibleIds]);

  const bulkUpdateDueDate = async (date: Date | undefined) => {
    if (activeSelected.length === 0 || !date) return;
    setIsBulkUpdating(true);
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      const updates = activeSelected.map(id =>
        supabase.from('deal_milestones').update({ due_date: dateStr }).eq('id', id)
      );
      await Promise.all(updates);
      toast({ title: 'Due dates updated', description: `Updated ${activeSelected.length} milestone(s)` });
      clearSelection();
      refetch();
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to update due dates', variant: 'destructive' });
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const bulkUpdateStatus = async (status: MilestoneStatus) => {
    if (activeSelected.length === 0) return;
    setIsBulkUpdating(true);
    try {
      const updates = activeSelected.map(id =>
        supabase.from('deal_milestones').update({ status }).eq('id', id)
      );
      await Promise.all(updates);
      toast({ title: 'Status updated', description: `Updated ${activeSelected.length} milestone(s)` });
      clearSelection();
      refetch();
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to update status', variant: 'destructive' });
    } finally {
      setIsBulkUpdating(false);
    }
  };

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

        {/* Select All toggle */}
        <Button variant="ghost" size="sm" className="gap-1.5 h-8" onClick={toggleSelectAll}>
          {allSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
          {allSelected ? 'Deselect All' : 'Select All'}
        </Button>

        <span className="text-sm text-muted-foreground ml-auto">
          {activeSelected.length > 0
            ? `${activeSelected.length} selected`
            : `${filteredAndSorted.length} ${filteredAndSorted.length === 1 ? 'milestone' : 'milestones'}`}
        </span>
      </div>

      {/* Bulk Actions Bar */}
      {activeSelected.length > 0 && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg border bg-muted/50 flex-wrap">
          <span className="text-sm font-medium mr-1">
            {activeSelected.length} selected:
          </span>

          {/* Bulk Due Date */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 h-8" disabled={isBulkUpdating}>
                <CalendarIcon className="h-3.5 w-3.5" />
                Set Due Date
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                onSelect={(date) => bulkUpdateDueDate(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {/* Bulk Status */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 h-8" disabled={isBulkUpdating}>
                Set Status
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {(Object.keys(MILESTONE_STATUS_CONFIG) as MilestoneStatus[]).map((s) => (
                <DropdownMenuItem key={s} onClick={() => bulkUpdateStatus(s)}>
                  <span className={cn(
                    "inline-block w-2 h-2 rounded-full mr-2",
                    MILESTONE_STATUS_CONFIG[s].color
                  )} />
                  {MILESTONE_STATUS_CONFIG[s].label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="sm" className="h-8 ml-auto" onClick={clearSelection}>
            <X className="h-3.5 w-3.5 mr-1" />
            Clear
          </Button>
        </div>
      )}

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
            <MilestoneRow
              key={m.id}
              milestone={m}
              selected={selectedIds.has(m.id)}
              onToggle={() => toggleSelect(m.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MilestoneRow({ milestone, selected, onToggle }: { milestone: MilestoneWithDeal; selected: boolean; onToggle: () => void }) {
  const now = new Date();
  const dueDate = milestone.due_date ? new Date(milestone.due_date) : null;
  const isOverdue = dueDate && !milestone.completed && isBefore(dueDate, now);
  const daysOverdue = dueDate ? differenceInDays(now, dueDate) : 0;

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border transition-colors",
        isOverdue && "border-destructive/30 bg-destructive/5",
        milestone.completed && "opacity-75",
        selected && "ring-2 ring-primary/40 bg-primary/5"
      )}
    >
      {/* Checkbox */}
      <Checkbox
        checked={selected}
        onCheckedChange={onToggle}
        className="shrink-0"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Link wraps the rest */}
      <Link
        to={`/deal/${milestone.deal_id}`}
        className="flex items-center gap-4 flex-1 min-w-0"
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
            <Badge variant="secondary" className="shrink-0 text-sm font-semibold rounded-md ml-auto px-2.5 py-0.5 border border-primary/40">
              {milestone.deal_owner}
            </Badge>
          )}
          {milestone.status && MILESTONE_STATUS_CONFIG[milestone.status] && (
            <span className={cn(
              "shrink-0 text-xs font-medium px-2 py-0.5 rounded-md border",
              MILESTONE_STATUS_CONFIG[milestone.status].bgClass,
              MILESTONE_STATUS_CONFIG[milestone.status].textClass,
              MILESTONE_STATUS_CONFIG[milestone.status].borderClass
            )}>
              {MILESTONE_STATUS_CONFIG[milestone.status].label}
            </span>
          )}
        </div>

        <div className="text-right shrink-0">
          {isOverdue && dueDate && (
            <Badge variant="destructive" className="text-xs rounded-md">
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
    </div>
  );
}
