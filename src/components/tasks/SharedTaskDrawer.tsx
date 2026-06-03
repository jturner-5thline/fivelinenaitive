import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { TaskDetailDrawer } from '@/components/tasks/TaskDetailDrawer';
import type { Task } from '@/hooks/useTasks';
import { invalidateAllTaskCaches } from '@/lib/taskCache';
import { toast } from 'sonner';

interface SharedTaskDrawerProps {
  taskId: string | null;
  onClose: () => void;
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

  const { data: task, isLoading } = useQuery({
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
    if (taskId && !isLoading && !task) {
      // Task not found (or no access) — close so user is not stuck on an empty sheet.
      toast.error('Task not found');
      onClose();
    }
  }, [taskId, isLoading, task, onClose]);

  return (
    <Sheet open={!!taskId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 border-l border-border bg-card overflow-hidden"
      >
        {task ? (
          <TaskDetailDrawer
            task={task}
            onClose={onClose}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
            Loading task…
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
