import { useState } from 'react';
import { AlertCircle, CalendarClock, CheckCircle2, Inbox, Loader2, Link2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTodayTasks, type TodayTask } from '@/hooks/useTodayTasks';
import { invalidateAllTaskCaches } from '@/lib/taskCache';
import { useQueryClient } from '@tanstack/react-query';

/**
 * "Do / schedule" card shape of the unified Today surface.
 *
 * Shows only the today slice (overdue, due today, or blocking a queued
 * decision). The full list stays in My Tasks — this panel is intentionally
 * short so the surface remains answerable in one sitting.
 */

const BUCKET_META: Record<TodayTask['bucket'], { label: string; className: string }> = {
  overdue: { label: 'Overdue', className: 'border-red-500/40 text-red-300 bg-red-500/10' },
  today: { label: 'Due today', className: 'border-amber-500/40 text-amber-300 bg-amber-500/10' },
  blocking: { label: 'From queue', className: 'border-sky-500/40 text-sky-300 bg-sky-500/10' },
};

function TaskRow({ task, onDone }: { task: TodayTask; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const meta = BUCKET_META[task.bucket];

  const complete = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', task.id);
      if (error) throw error;
      toast.success('Task completed');
      onDone();
    } catch (e: any) {
      toast.error(e?.message || 'Could not complete task');
    } finally {
      setBusy(false);
    }
  };

  const origin = task.source_calendar_event_title
    || (task.source_queue_item_id ? 'Approval queue' : null);

  return (
    <div className="glass-module flex items-start gap-3 rounded-lg px-3 py-2.5">
      <button
        type="button"
        onClick={complete}
        disabled={busy}
        aria-label={`Complete ${task.title}`}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-2 border-muted-foreground/60 hover:border-primary hover:bg-primary/20 transition-colors flex items-center justify-center"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground leading-snug break-words">{task.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <Badge variant="outline" className={cn('h-4 px-1.5 text-[10px] font-medium', meta.className)}>
            {meta.label}
          </Badge>
          {task.deal?.company && <span className="truncate">{task.deal.company}</span>}
          {task.due_date && (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3 w-3" />
              {task.due_date}
            </span>
          )}
          {origin && (
            <span className="inline-flex items-center gap-1 truncate" title={`From: ${origin}`}>
              <Link2 className="h-3 w-3" />
              {origin}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function TodayTasksPanel() {
  const { tasks, isLoading, refetch, counts } = useTodayTasks(true);
  const queryClient = useQueryClient();

  const handleDone = () => {
    refetch();
    invalidateAllTaskCaches(queryClient);
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading tasks…
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <CheckCircle2 className="h-8 w-8 text-emerald-400/70" />
        <p className="text-sm font-medium text-foreground">Nothing due today</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Overdue work, tasks due today, and anything created from the queue show up here.
          Everything else lives in My Tasks.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 px-1 pb-2 text-[11px] text-muted-foreground">
        {counts.overdue > 0 && (
          <span className="inline-flex items-center gap-1 text-red-300">
            <AlertCircle className="h-3 w-3" /> {counts.overdue} overdue
          </span>
        )}
        {counts.today > 0 && <span>{counts.today} due today</span>}
        {counts.blocking > 0 && (
          <span className="inline-flex items-center gap-1">
            <Inbox className="h-3 w-3" /> {counts.blocking} from queue
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {tasks.map(t => (
          <TaskRow key={t.id} task={t} onDone={handleDone} />
        ))}
      </div>
    </div>
  );
}

export default TodayTasksPanel;