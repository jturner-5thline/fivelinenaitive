import type { Deal, DealMilestone } from '@/types/deal';
import { Check, Circle, AlertOctagon } from 'lucide-react';
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
  if (status === 'done') return <Check className="h-3 w-3 text-[#1a7a52]" strokeWidth={3} />;
  if (status === 'blocked') return <AlertOctagon className="h-3 w-3 text-[#8b2020]" />;
  return <Circle className="h-2.5 w-2.5 text-[#9a6800]" strokeWidth={2.5} />;
}

function statusBg(status: Status): string {
  if (status === 'done') return 'bg-[#1a7a52]/10 border-[#1a7a52]/25';
  if (status === 'blocked') return 'bg-[#8b2020]/10 border-[#8b2020]/25';
  return 'bg-[#9a6800]/10 border-[#9a6800]/25';
}

export function MilestonesPanel({ deal }: MilestonesPanelProps) {
  const milestones = (deal.milestones || []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  return (
    <div className="p-5 flex flex-col h-full">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7a9aaa] mb-3">
        Milestones & Outstanding
      </div>

      {milestones.length === 0 ? (
        <p className="text-[12px] text-[#4a6070] font-light italic">No milestones tracked.</p>
      ) : (
        <div className="space-y-1.5">
          {milestones.slice(0, 8).map(m => {
            const status = statusOf(m);
            return (
              <div
                key={m.id}
                className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md border ${statusBg(status)}`}
              >
                <span className="shrink-0 inline-flex items-center justify-center h-4 w-4 rounded-full bg-white/70">
                  <StatusIcon status={status} />
                </span>
                <span className={`flex-1 text-[12px] truncate ${status === 'done' ? 'text-[#4a6070] line-through' : 'text-[#1a2b38] font-medium'}`}>
                  {m.title}
                </span>
                {m.dueDate && (
                  <span className="text-[10px] text-[#4a6070] whitespace-nowrap">
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