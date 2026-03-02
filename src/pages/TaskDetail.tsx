import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useMyTasks } from '@/hooks/useTasks';
import { TaskDetailDrawer } from '@/components/tasks/TaskDetailDrawer';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function TaskDetail() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { tasks, isLoading, updateTask, deleteTask } = useMyTasks();

  const task = tasks.find(t => t.id === taskId);

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
              onDelete={() => { deleteTask.mutate(task.id); navigate('/tasks'); }}
              fullPage
            />
          </div>
        </div>
      </div>
    </>
  );
}
