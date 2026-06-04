import { useEffect, Component, lazy, Suspense, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import type { Task } from '@/hooks/useTasks';
import { invalidateAllTaskCaches } from '@/lib/taskCache';
import { toast } from 'sonner';

// Lazy-load the heavy TaskDetailDrawer (runs ~8 parallel queries on mount and
// pulls in comments/mentions/attachments/subtasks subtrees). Its chunk is
// only parsed the first time a task drawer is actually opened, keeping the
// initial /deals (and every other surface that mounts SharedTaskDrawer)
// bundle smaller.
const TaskDetailDrawer = lazy(() =>
  import('@/components/tasks/TaskDetailDrawer').then((m) => ({ default: m.TaskDetailDrawer })),
);

function TaskDetailFallback() {
  return (
    <div className="flex flex-col h-full p-5 gap-3 animate-pulse">
      <div className="h-4 w-24 bg-muted/40 rounded" />
      <div className="h-6 w-3/4 bg-muted/40 rounded" />
      <div className="h-3 w-1/2 bg-muted/30 rounded" />
      <div className="h-3 w-2/3 bg-muted/30 rounded" />
      <div className="mt-4 h-32 w-full bg-muted/20 rounded" />
      <div className="mt-2 h-3 w-1/3 bg-muted/30 rounded" />
    </div>
  );
}

interface SharedTaskDrawerProps {
  taskId: string | null;
  onClose: () => void;
}

/**
 * Local error boundary so a render failure in TaskDetailDrawer (a heavy
 * component that runs ~8 parallel queries) does NOT leave the Sheet visibly
 * blank. Without this, any thrown error during hydration bubbles up to the
 * nearest boundary, which is typically far above the Sheet portal and
 * results in an empty SheetContent on screen.
 */
class DrawerErrorBoundary extends Component<{ onClose: () => void; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error('[SharedTaskDrawer] render failed:', error);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-6 space-y-3 text-sm">
          <p className="font-medium text-destructive">Task drawer failed to render.</p>
          <p className="text-xs text-muted-foreground break-all">{this.state.error.message}</p>
          <button
            type="button"
            className="text-xs underline text-muted-foreground"
            onClick={() => { this.setState({ error: null }); this.props.onClose(); }}
          >
            Close
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Shared right-sliding task drawer used from every surface that lists tasks
 * outside the dedicated Tasks page. Fetches the full task by id (with the
 * joined assignee profile the drawer needs) and wires update/delete through
 * Supabase + the global task cache invalidator so every surface stays in
 * sync. Reuses TaskDetailDrawer so behavior (comments, @-mentions, status,
 * subtasks, attachments, etc.) is identical to the Tasks page.
 */
export function SharedTaskDrawer({ taskId, onClose }: SharedTaskDrawerProps) {
  const qc = useQueryClient();

  const { data: task, isLoading, isFetching, error } = useQuery({
    queryKey: ['shared-task-drawer', taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      // Best-effort join: TaskDetailDrawer renders assignee_profile.
      let assignee_profile: Task['assignee_profile'] = null;
      if ((data as any).assigned_to) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('display_name, avatar_url, email')
          .eq('user_id', (data as any).assigned_to)
          .maybeSingle();
        assignee_profile = prof
          ? { display_name: prof.display_name || '', avatar_url: prof.avatar_url, email: prof.email || '' }
          : null;
      }
      return { ...(data as any), assignee_profile } as Task;
    },
  });

  const handleUpdate = async (updates: Partial<Task>) => {
    if (!taskId) return;
    const { error } = await supabase.from('tasks').update(updates as any).eq('id', taskId);
    if (error) {
      toast.error('Failed to update task');
      return;
    }
    invalidateAllTaskCaches(qc);
    qc.invalidateQueries({ queryKey: ['shared-task-drawer', taskId] });
  };

  const handleDelete = async () => {
    if (!taskId) return;
    const { error } = await supabase.from('tasks').delete().eq('id', taskId);
    if (error) {
      toast.error('Failed to delete task');
      return;
    }
    invalidateAllTaskCaches(qc);
    toast.success('Task deleted');
    onClose();
  };

  // Close on Escape handled by Sheet primitive
  useEffect(() => {
    // Only auto-close on a confirmed not-found result (loaded successfully,
    // no row). Do NOT close on transient query errors — that hid genuine RLS
    // / fetch failures behind a misleading "Task not found" toast.
    if (taskId && !isLoading && !isFetching && !error && task === null) {
      // Task not found (or no access) — close so user is not stuck on an empty sheet.
      toast.error('Task not found');
      onClose();
    }
  }, [taskId, isLoading, isFetching, error, task, onClose]);

  useEffect(() => {
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[SharedTaskDrawer] task fetch error:', error);
    }
  }, [error]);

  return (
    <Sheet open={!!taskId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 border-l border-border bg-card overflow-hidden"
      >
        {/* Radix requires a Title + Description for a11y. Without these, the
            Dialog primitive logs a warning and some screen-reader code paths
            can short-circuit content rendering. Visually hidden so the
            drawer's own header remains the visible title. */}
        <VisuallyHidden.Root>
          <SheetTitle>{task?.title || 'Task details'}</SheetTitle>
          <SheetDescription>Task detail drawer with comments, subtasks, and activity.</SheetDescription>
        </VisuallyHidden.Root>
        <DrawerErrorBoundary onClose={onClose}>
          {error ? (
            <div className="p-6 space-y-2 text-sm">
              <p className="font-medium text-destructive">Could not load task.</p>
              <p className="text-xs text-muted-foreground break-all">{(error as Error)?.message}</p>
            </div>
          ) : task ? (
            <Suspense fallback={<TaskDetailFallback />}>
              <TaskDetailDrawer
                task={task}
                onClose={onClose}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            </Suspense>
          ) : (
            <TaskDetailFallback />
          )}
        </DrawerErrorBoundary>
      </SheetContent>
    </Sheet>
  );
}
