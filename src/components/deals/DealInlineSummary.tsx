import { useEffect, useState } from 'react';
import type { Deal } from '@/types/deal';
import { usePipelineDigests } from '@/hooks/usePipelineDigests';
import { usePipelineDealTasks } from '@/hooks/usePipelineDealTasks';
import { usePipelineDealMilestones } from '@/hooks/usePipelineDealMilestones';
import { MemoHeader } from '@/components/pipeline/memo/MemoHeader';
import { NextBestActionRow } from '@/components/pipeline/memo/NextBestActionRow';
import { TasksMilestonesBand } from '@/components/pipeline/memo/TasksMilestonesBand';
import { ActivityPanel } from '@/components/pipeline/memo/ActivityPanel';
import { CalendarPanel } from '@/components/pipeline/memo/CalendarPanel';
import { LendersPanel } from '@/components/pipeline/memo/LendersPanel';
import { cn } from '@/lib/utils';

interface DealInlineSummaryProps {
  deal: Deal;
  onOpenDeal?: (dealId: string) => void;
  onClose?: () => void;
}

type WorkbookTab = 'overview' | 'tasks' | 'lenders' | 'activity' | 'calendar';

const TABS: { id: WorkbookTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'lenders', label: 'Lenders' },
  { id: 'activity', label: 'Activity' },
  { id: 'calendar', label: 'Calendar' },
];

/**
 * Inline single-deal detail pane for the Deals list view.
 *
 * Layout — workbook style:
 *   [ MemoHeader      ] ← fixed header (title · tags · meta · STATUS)
 *   [ Content pane    ] ← scrollable, swaps based on active tab
 *   [ Workbook tabs   ] ← pinned to bottom (Overview/Tasks/Lenders/Activity/Calendar)
 *
 * Data wiring is identical to the previous PipelineMemoCard composition —
 * only structure/layout changes.
 */
export function DealInlineSummary({ deal, onOpenDeal, onClose }: DealInlineSummaryProps) {
  const deals = [deal];
  const { rawByDeal, isLoading } = usePipelineDigests(deals, true);
  const { data: tasksByDeal } = usePipelineDealTasks([deal.id], true);
  const { data: milestonesByDeal } = usePipelineDealMilestones([deal.id], true);

  const rawDigest = rawByDeal.get(deal.id);
  const tasks = tasksByDeal?.get(deal.id) || [];
  const milestones = milestonesByDeal?.get(deal.id);

  const [activeTab, setActiveTab] = useState<WorkbookTab>('overview');

  // Reset tab to Overview when switching deals.
  useEffect(() => {
    setActiveTab('overview');
  }, [deal.id]);

  const handleOpen = () => onOpenDeal?.(deal.id);

  return (
    <div className="flex flex-col h-full min-h-0 min-w-0">
      {/* Fixed header */}
      <div className="shrink-0">
        <MemoHeader
          deal={deal}
          showLiveDot
          onOpenDeal={handleOpen}
          onClose={onClose}
        />
        <NextBestActionRow deal={deal} tasks={tasks} rawDigest={rawDigest} />
      </div>

      {/* Scrollable content pane */}
      <div
        className="flex-1 min-h-0 overflow-y-auto"
        role="tabpanel"
        aria-labelledby={`workbook-tab-${activeTab}`}
      >
        {activeTab === 'overview' && (
          <div className="flex flex-col">
            <TasksMilestonesBand
              deal={deal}
              tasks={tasks}
              milestones={milestones}
              rawDigest={rawDigest}
            />
            <LendersPanel deal={deal} />
          </div>
        )}

        {activeTab === 'tasks' && (
          <TasksMilestonesBand
            deal={deal}
            tasks={tasks}
            milestones={milestones}
            rawDigest={rawDigest}
          />
        )}

        {activeTab === 'lenders' && <LendersPanel deal={deal} />}

        {activeTab === 'activity' && (
          <ActivityPanel
            deal={deal}
            rawDigest={rawDigest}
            isLoading={!!isLoading}
            emails={rawDigest?.emails || []}
          />
        )}

        {activeTab === 'calendar' && (
          <CalendarPanel deal={deal} tasks={tasks} onOpenDeal={handleOpen} />
        )}
      </div>

      {/* Workbook tab strip — pinned to bottom */}
      <div
        role="tablist"
        aria-label="Deal sections"
        className="shrink-0 border-t border-white/[0.08] bg-gradient-to-b from-white/[0.02] to-transparent px-2 pt-1 flex items-end gap-1 overflow-x-auto motion-reduce:transition-none"
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`workbook-tab-${tab.id}`}
              role="tab"
              type="button"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                  e.preventDefault();
                  const idx = TABS.findIndex((t) => t.id === tab.id);
                  const next =
                    e.key === 'ArrowRight'
                      ? TABS[(idx + 1) % TABS.length]
                      : TABS[(idx - 1 + TABS.length) % TABS.length];
                  setActiveTab(next.id);
                  const el = document.getElementById(`workbook-tab-${next.id}`);
                  el?.focus();
                }
              }}
              className={cn(
                'relative px-3 py-1.5 text-[12px] font-medium rounded-t-md whitespace-nowrap transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b93f8]/60',
                active
                  ? 'text-[#c8ccff] bg-[linear-gradient(180deg,#13131c,#0e0e15)] border border-b-0 border-white/[0.08]'
                  : 'text-muted-foreground hover:text-foreground bg-transparent',
              )}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-[2px] rounded-t-md bg-[#8b93f8]"
                />
              )}
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}