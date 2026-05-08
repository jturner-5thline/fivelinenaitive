import type { Deal, DealMilestone } from '@/types/deal';
import type { DealTaskItem } from '@/hooks/usePipelineDealTasks';
import { Diamond } from 'lucide-react';
import { format, differenceInCalendarDays } from 'date-fns';
import { EditableTaskRow } from './EditableTaskRow';

interface TasksMilestonesBandProps {
  deal: Deal;
  tasks: DealTaskItem[];
}

function nextUpcomingMilestone(milestones: DealMilestone[] | undefined) {
  if (!milestones?.length) return null;
  const now = Date.now();
  return milestones
    .filter((m) => !m.completed && m.dueDate)
    .map((m) => ({ m, t: new Date(m.dueDate as string).getTime() }))
    .filter(({ t }) => t >= now - 86_400_000)
    .sort((a, b) => a.t - b.t)[0]?.m ?? null;
}

function relativeDays(dueDate: string): string {
  const days = differenceInCalendarDays(new Date(dueDate), new Date());
  if (days === 0) return 'today';
  if (days === 1) return '1 day';
  if (days > 0) return `${days} days`;
  if (days === -1) return '1 day overdue';
  return `${Math.abs(days)} days overdue`;
}

/**
 * Tasks & milestones band rendered between the card header and the
 * 3-column insights row. Lists open tasks/outstanding items (capped) and
 * highlights the next upcoming milestone, if any.
 */
export function TasksMilestonesBand({ deal, tasks }: TasksMilestonesBandProps) {
  const milestone = nextUpcomingMilestone(deal.milestones);
  const visibleTasks = tasks.slice(0, 4);
  const hasContent = visibleTasks.length > 0 || !!milestone;

  return (
    <div className="px-5 py-3 bg-muted/40 border-b border-border">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2">
        Tasks & milestones
      </div>

      {!hasContent ? (
        <p className="text-xs italic text-muted-foreground">
          No outstanding tasks or milestones.
        </p>
      ) : (
        <div className="space-y-1.5">
          {visibleTasks.map((t) => (
            <EditableTaskRow key={t.id} task={t} />
          ))}
          {tasks.length > visibleTasks.length && (
            <div className="text-[10px] text-muted-foreground pl-1">
              +{tasks.length - visibleTasks.length} more
            </div>
          )}
          {milestone && (
            <div className="flex items-center gap-2.5 rounded-md bg-primary/10 border border-primary/20 px-2.5 py-1.5">
              <Diamond className="h-3.5 w-3.5 text-primary shrink-0 fill-primary" />
              <span className="flex-1 text-xs text-foreground font-medium truncate" title={milestone.title}>
                {milestone.title}
                {milestone.dueDate && ` · ${format(new Date(milestone.dueDate), 'MMM d')}`}
              </span>
              {milestone.dueDate && (
                <span className="text-[10px] text-primary whitespace-nowrap">
                  {relativeDays(milestone.dueDate)}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}