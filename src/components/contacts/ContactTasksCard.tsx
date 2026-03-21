import { useState } from 'react';
import { CheckSquare, Plus, Circle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useContactTasks } from '@/hooks/useTasks';
import { useTasks } from '@/hooks/useTasks';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

interface ContactTasksCardProps {
  contactId: string;
  contactName: string;
}

export function ContactTasksCard({ contactId, contactName }: ContactTasksCardProps) {
  const { data: tasks = [], isLoading } = useContactTasks(contactId);
  const { createTask, updateTask } = useTasks();
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const navigate = useNavigate();

  const handleCreate = () => {
    if (!newTitle.trim()) return;
    createTask.mutate(
      { title: newTitle.trim(), contact_id: contactId },
      {
        onSuccess: () => {
          setNewTitle('');
          setShowCreate(false);
        },
      }
    );
  };

  const handleToggle = (task: any) => {
    const newStatus = task.status === 'complete' ? 'not_started' : 'complete';
    updateTask.mutate({ id: task.id, status: newStatus });
  };

  const activeTasks = tasks.filter(t => t.status !== 'complete');
  const completedTasks = tasks.filter(t => t.status === 'complete');

  const priorityColor: Record<string, string> = {
    urgent: 'text-red-400',
    high: 'text-orange-400',
    medium: 'text-yellow-400',
    low: 'text-muted-foreground',
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <CheckSquare className="h-4 w-4" /> Tasks ({activeTasks.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activeTasks.length === 0 && completedTasks.length === 0 && !showCreate && (
          <p className="text-xs text-muted-foreground text-center py-4">No tasks yet</p>
        )}

        {activeTasks.length > 0 && (
          <div className="space-y-1.5 mb-2">
            {activeTasks.map(task => (
              <div
                key={task.id}
                className="flex items-start gap-2 p-1.5 rounded-md hover:bg-muted/30 group"
              >
                <button
                  onClick={() => handleToggle(task)}
                  className="mt-0.5 flex-shrink-0 text-muted-foreground hover:text-primary transition-colors"
                >
                  <Circle className="h-3.5 w-3.5" />
                </button>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-xs font-medium cursor-pointer hover:text-primary truncate"
                    onClick={() => navigate(`/tasks?task=${task.id}`)}
                  >
                    {task.title}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {task.due_date && (
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(task.due_date), 'MMM d')}
                      </span>
                    )}
                    <span className={cn('text-[10px]', priorityColor[task.priority] || 'text-muted-foreground')}>
                      {task.priority}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {completedTasks.length > 0 && (
          <div className="space-y-1 mb-2 opacity-60">
            {completedTasks.slice(0, 3).map(task => (
              <div
                key={task.id}
                className="flex items-center gap-2 p-1.5 rounded-md"
              >
                <button
                  onClick={() => handleToggle(task)}
                  className="flex-shrink-0 text-green-500 hover:text-muted-foreground transition-colors"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </button>
                <p className="text-xs line-through text-muted-foreground truncate">{task.title}</p>
              </div>
            ))}
            {completedTasks.length > 3 && (
              <p className="text-[10px] text-muted-foreground text-center">+{completedTasks.length - 3} more completed</p>
            )}
          </div>
        )}

        {showCreate ? (
          <div className="space-y-2">
            <Input
              autoFocus
              placeholder="Task title..."
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') { setShowCreate(false); setNewTitle(''); }
              }}
              className="h-8 text-xs"
            />
            <div className="flex items-center gap-1.5">
              <Button size="sm" className="h-7 text-xs" onClick={handleCreate} disabled={!newTitle.trim() || createTask.isPending}>
                Add Task
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setShowCreate(false); setNewTitle(''); }}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" size="sm" className="w-full mt-1 text-xs" onClick={() => setShowCreate(true)}>
            <Plus className="h-3 w-3 mr-1" /> Add Task
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
