import { DealTasksPanel } from './DealTasksPanel';
import { FlexInfoNotificationsPanel } from './FlexInfoNotificationsPanel';
import { EngagementSummaryCard } from './EngagementSummaryCard';
import { EngagementTrendsCard } from './EngagementTrendsCard';
import { DealActivityChart } from './DealActivityChart';
import { DealFlagLog } from './DealFlagLog';
import { useFlagNotes } from '@/hooks/useFlagNotes';

interface DealManagementTabProps {
  dealId: string;
}

export function DealManagementTab({ dealId }: DealManagementTabProps) {
  const { flagNotes } = useFlagNotes(dealId);
  const hasFlags = flagNotes.length > 0;

  return (
    <div className="space-y-4">
      {/* Row 1: Tasks | Info Requests | Engagement Summary — 3 equal columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="min-h-[360px] flex">
          <DealTasksPanel dealId={dealId} />
        </div>
        <div className="min-h-[360px] flex">
          <FlexInfoNotificationsPanel dealId={dealId} />
        </div>
        <div className="min-h-[360px] flex md:col-span-2 lg:col-span-1">
          <EngagementSummaryCard dealId={dealId} />
        </div>
      </div>

      {/* Row 2: Engagement Trends | Deal Activity — 2 equal columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="min-h-[340px]">
          <EngagementTrendsCard dealId={dealId} />
        </div>
        <div className="min-h-[340px]">
          <DealActivityChart dealId={dealId} />
        </div>
      </div>

      {/* Row 3: Flag Log — full width when populated, half when empty */}
      <div className={hasFlags ? 'w-full' : 'max-w-[50%] max-lg:max-w-full'}>
        <DealFlagLog dealId={dealId} />
      </div>
    </div>
  );
}
