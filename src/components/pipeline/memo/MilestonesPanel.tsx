import type { Deal, DealMilestone } from '@/types/deal';
import { CheckCircle2, Circle, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

interface MilestonesPanelProps {
  deal: Deal;
}

type Status = 'done' | 'pending' | 'blocked';

function statusOf(m: DealMilestone): Status {
  if (m.completed) return 'done';
  if (m.status === 'off_track') return 'blocked';
  return 'pending';
}

function StatusIcon({ status }: { status: Status }) {
  if (status === 'done') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (status === 'blocked') return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
  return <Circle className="h-3.5 w-3.5 text-amber-500" />;
}

export function MilestonesPanel({ deal }: MilestonesPanelProps) {
  const milestones = (deal.milestones || []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  return (
    <div className="p-5 flex flex-col h-full">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">
        Milestones & Outstanding
      </div>

      {milestones.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No milestones tracked.</p>
      ) : (
        <div className="space-y-1">
          {milestones.slice(0, 8).map(m => {
            const status = statusOf(m);
            return (
              <div
                key={m.id}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-accent/50 transition-colors"
              >
                <StatusIcon status={status} />
                <span
                  className={`flex-1 text-xs truncate ${
                    status === 'done'
                      ? 'text-muted-foreground line-through'
                      : 'text-foreground font-medium'
                  }`}
                >
                  {m.title}
                </span>
                {m.dueDate && (
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {format(new Date(m.dueDate), 'MMM d')}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}