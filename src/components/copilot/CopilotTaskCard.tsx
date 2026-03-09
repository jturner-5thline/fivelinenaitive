import { useState } from 'react';
import { Check, Clock, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface Task {
  id: string;
  title: string;
  status?: string;
  priority?: string;
  due_date?: string;
  assignee?: {
    display_name?: string;
    avatar_url?: string;
  };
}

interface Props {
  task: Task;
  onNavigate?: () => void;
}

const priorityColors: Record<string, string> = {
  urgent: 'rgb(239, 68, 68)',
  high: 'rgb(245, 158, 11)',
  medium: 'rgb(59, 130, 246)',
  low: 'rgb(156, 163, 175)',
};

export function CopilotTaskCard({ task, onNavigate }: Props) {
  const [isCompleting, setIsCompleting] = useState(false);

  const handleTaskClick = () => {
    const newPath = `/tasks`;
    window.history.pushState({}, '', newPath);
    window.dispatchEvent(new PopStateEvent('popstate'));
    onNavigate?.();
  };

  const handleComplete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCompleting) return;

    setIsCompleting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('tasks')
        .update({ status: 'done' })
        .eq('id', task.id);

      if (error) throw error;
      toast.success('Task completed!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to complete task');
    } finally {
      setIsCompleting(false);
    }
  };

  const isOverdue = task.due_date && new Date(task.due_date) < new Date();
  const isToday = task.due_date && new Date(task.due_date).toDateString() === new Date().toDateString();

  let dueDateColor = 'hsl(var(--muted-foreground))';
  let dueDateIcon = Clock;
  if (isOverdue) {
    dueDateColor = 'rgb(239, 68, 68)';
    dueDateIcon = AlertCircle;
  } else if (isToday) {
    dueDateColor = 'rgb(245, 158, 11)';
  }

  const priorityColor = priorityColors[task.priority?.toLowerCase() || 'medium'];
  const dueDateText = task.due_date 
    ? formatDistanceToNow(new Date(task.due_date), { addSuffix: !isOverdue })
    : null;

  const getInitials = (name?: string) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  const DueDateIcon = dueDateIcon;

  return (
    <div
      style={{
        background: 'var(--glass-surface)',
        border: '1px solid var(--glass-border)',
        borderRadius: 8,
        padding: '12px 14px',
        marginTop: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <button
          onClick={handleComplete}
          disabled={isCompleting}
          style={{
            width: 18,
            height: 18,
            borderRadius: 4,
            border: '2px solid hsl(var(--muted-foreground))',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 2,
            transition: 'all 150ms',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'hsl(var(--primary))';
            e.currentTarget.style.background = 'hsl(var(--primary))';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'hsl(var(--muted-foreground))';
            e.currentTarget.style.background = 'transparent';
          }}
        >
          {isCompleting && <Check size={12} style={{ color: 'white' }} />}
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: priorityColor,
                marginTop: 6,
                flexShrink: 0,
              }}
            />
            <button
              onClick={handleTaskClick}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--foreground)',
                textAlign: 'left',
                cursor: 'pointer',
                textDecoration: 'underline',
                textDecorationColor: 'transparent',
                transition: 'text-decoration-color 150ms',
                flex: 1,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.textDecorationColor = 'hsl(var(--primary))')}
              onMouseLeave={(e) => (e.currentTarget.style.textDecorationColor = 'transparent')}
            >
              {task.title}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {task.assignee && (
                <>
                  {task.assignee.avatar_url ? (
                    <img
                      src={task.assignee.avatar_url}
                      alt=""
                      style={{ width: 16, height: 16, borderRadius: '50%' }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: 'hsl(var(--primary))',
                        color: 'white',
                        fontSize: 8,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {getInitials(task.assignee.display_name)}
                    </div>
                  )}
                  <span style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {task.assignee.display_name}
                  </span>
                </>
              )}
            </div>

            {dueDateText && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: dueDateColor }}>
                <DueDateIcon size={10} />
                {dueDateText}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}