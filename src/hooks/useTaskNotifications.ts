import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isPast, isToday, differenceInDays } from 'date-fns';
import type { Task } from './useTasks';

export interface TaskNotification {
  id: string;
  type: 'overdue' | 'due_today' | 'due_soon' | 'assigned';
  task: Task;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export function useTaskNotifications() {
  const { user } = useAuth();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['task-notifications', user?.id],
    enabled: !!user,
    refetchInterval: 60000, // Refresh every minute
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('assigned_to', user.id)
        .is('archived_at', null)
        // Canonical completion check — mirror `isTaskCompleted` from
        // `@/lib/taskCache` so the badge only clears when the task is
        // ACTUALLY marked complete (either historic status literal, or
        // a populated completed_at). Viewing a task never touches these
        // fields, so the count persists until real completion or a
        // due-date change (which triggers cache invalidation via
        // `invalidateAllTaskCaches`).
        .is('completed_at', null)
        .not('status', 'in', '("complete","completed")')
        .order('due_date', { ascending: true });
      if (error) throw error;

      const tasks = (data || []) as Task[];
      const result: TaskNotification[] = [];

      tasks.forEach(task => {
        if (!task.due_date) return;
        const dueDate = new Date(task.due_date + 'T23:59:59');
        const today = new Date();

        if (isPast(dueDate) && !isToday(new Date(task.due_date + 'T00:00:00'))) {
          const daysOverdue = differenceInDays(today, new Date(task.due_date + 'T00:00:00'));
          result.push({
            id: `overdue-${task.id}`,
            type: 'overdue',
            task,
            message: `"${task.title}" is ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue`,
            severity: 'error',
          });
        } else if (isToday(new Date(task.due_date + 'T00:00:00'))) {
          result.push({
            id: `due-today-${task.id}`,
            type: 'due_today',
            task,
            message: `"${task.title}" is due today`,
            severity: 'warning',
          });
        } else {
          const daysUntil = differenceInDays(new Date(task.due_date + 'T00:00:00'), today);
          if (daysUntil <= 3) {
            result.push({
              id: `due-soon-${task.id}`,
              type: 'due_soon',
              task,
              message: `"${task.title}" is due in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`,
              severity: 'info',
            });
          }
        }
      });

      return result;
    },
  });

  const overdueCount = notifications.filter(n => n.type === 'overdue').length;
  const dueTodayCount = notifications.filter(n => n.type === 'due_today').length;

  return { notifications, isLoading, overdueCount, dueTodayCount };
}
