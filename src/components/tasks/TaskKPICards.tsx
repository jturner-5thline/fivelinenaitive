import { useMemo } from 'react';
import { type Task } from '@/hooks/useTasks';
import { ClipboardList, AlertTriangle, Activity, ShieldX } from 'lucide-react';
import { isPast, isToday } from 'date-fns';

interface TaskKPICardsProps {
  tasks: Task[];
}

const cards = [
  { key: 'total', label: 'Total Tasks', icon: ClipboardList, color: '#3b7eff' },
  { key: 'overdue', label: 'Overdue', icon: AlertTriangle, color: '#ff4d4d' },
  { key: 'in_progress', label: 'In Progress', icon: Activity, color: '#3b7eff' },
  { key: 'blocked', label: 'Blocked', icon: ShieldX, color: '#ff4d4d' },
] as const;

export function TaskKPICards({ tasks }: TaskKPICardsProps) {
  const counts = useMemo(() => {
    const overdueCount = tasks.filter(t =>
      t.due_date && t.status !== 'complete' &&
      isPast(new Date(t.due_date + 'T23:59:59')) &&
      !isToday(new Date(t.due_date + 'T00:00:00'))
    ).length;

    return {
      total: tasks.length,
      overdue: overdueCount,
      in_progress: tasks.filter(t => t.status === 'in_progress').length,
      blocked: tasks.filter(t => t.status === 'blocked').length,
    };
  }, [tasks]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 py-4">
      {cards.map(card => {
        const Icon = card.icon;
        const count = counts[card.key];
        return (
          <div
            key={card.key}
            className="flex items-center gap-3 rounded-xl border px-4 py-3"
            style={{
              backgroundColor: '#13181f',
              borderColor: '#2a2f3e',
            }}
          >
            <div
              className="flex items-center justify-center rounded-lg shrink-0"
              style={{
                width: 40,
                height: 40,
                backgroundColor: `${card.color}18`,
              }}
            >
              <Icon className="h-5 w-5" style={{ color: card.color }} />
            </div>
            <div>
              <p className="text-[28px] font-bold leading-none" style={{ color: 'white' }}>
                {count}
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#8b92a5' }}>
                {card.label}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
