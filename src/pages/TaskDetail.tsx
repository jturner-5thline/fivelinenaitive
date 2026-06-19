import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { useMyTasks, type Task } from '@/hooks/useTasks';
import { useUndoStack } from '@/hooks/useUndoStack';
import { TaskDetailDrawer } from '@/components/tasks/TaskDetailDrawer';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { invalidateAllTaskCaches } from '@/lib/taskCache';
import { toast } from 'sonner';

function toRestorableTaskRow(task: Task): Record<string, unknown> {
  const row: Record<string, unknown> = { ...(task as unknown as Record<string, unknown>) };
  delete row.assignee_profile;
  delete row.creator_profile;
  delete row.deal;
  delete row.contact;
  delete row.crm_company;
  delete row.project;
  delete row.subtasks;
  row.updated_at = new Date().toISOString();
  return row;
}

export default function TaskDetail() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const undoStack = useUndoStack();
  const { tasks, isLoading, updateTask, deleteTask } = useMyTasks();

  const task = tasks.find(t => t.id === taskId);

  const restoreDeletedTask = useCallback(async (snapshot: Task) => {
    const { error } = await supabase.from('tasks').upsert(toRestorableTaskRow(snapshot) as never);
    if (error) throw error;
    invalidateAllTaskCaches(queryClient);
    navigate(`/tasks/${snapshot.id}`);
  }, [navigate, queryClient]);

  const handleDeleteWithUndo = useCallback(() => {
    if (!task) return;
    const snapshot = task;
    undoStack.push({
      label: 'Delete task',
      undo: () => restoreDeletedTask(snapshot),
    });
    deleteTask.mutate(task.id);
    toast.success('Task deleted', {
      action: { label: 'Undo', onClick: () => restoreDeletedTask(snapshot) },
      duration: 8000,
    });
  }, [deleteTask, restoreDeletedTask, task, undoStack]);

  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (task) return;
      const action = undoStack.pop();
      if (!action) return;
      e.preventDefault();
      Promise.resolve(action.undo()).then(() => toast.success(`Undone: ${action.label}`)).catch(() => toast.error('Could not undo'));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [task, undoStack]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-muted-foreground">Task not found</p>
        <Button variant="outline" onClick={() => navigate('/tasks')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Tasks
        </Button>
      </div>
    );
  }

  return (
    <>
      <Helmet><title>{task.title} | Tasks | 5thLine</title></Helmet>
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-6 py-3 border-b">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate('/tasks')}>
            <ArrowLeft className="h-4 w-4" /> Back to Tasks
          </Button>
        </div>
        <div className="flex-1 overflow-auto flex justify-center">
          <div className="w-full max-w-3xl">
            <TaskDetailDrawer
              task={task}
              onClose={() => navigate('/tasks')}
              onUpdate={(updates) => updateTask.mutate({ id: task.id, ...updates })}
              onDelete={handleDeleteWithUndo}
              fullPage
            />
          </div>
        </div>
      </div>
    </>
  );
}
