import { DealTasksPanel } from './DealTasksPanel';
import { FlexInfoNotificationsPanel } from './FlexInfoNotificationsPanel';
import { EngagementSummaryCard } from './EngagementSummaryCard';
import { EngagementTrendsCard } from './EngagementTrendsCard';
import { DealActivityChart } from './DealActivityChart';
import { DealFlagLog } from './DealFlagLog';

import { useFlagNotes } from '@/hooks/useFlagNotes';

interface DealManagementTabProps {
  dealId: string;
  dealName?: string;
  dealValue?: number;
  dealStage?: string;
  dealType?: string;
  dealStatus?: string;
  lenderCount?: number;
}

export function DealManagementTab({ dealId, dealName, dealValue, dealStage, dealType, dealStatus, lenderCount }: DealManagementTabProps) {
  const { flagNotes } = useFlagNotes(dealId);
  const hasFlags = flagNotes.length > 0;

  return (
    <div className="space-y-4">
      {/* Row 1 — Tasks · Info Requests — equal-height stretch */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="h-[420px]">
          <DealTasksPanel dealId={dealId} />
        </div>
        <div className="h-[420px]">
          <FlexInfoNotificationsPanel dealId={dealId} />
        </div>
      </div>

      {/* Row 2 — Charts — mirrored pair, equal height */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <EngagementTrendsCard dealId={dealId} />
        <DealActivityChart dealId={dealId} />
      </div>

      {/* Row 3 — Flag Log + Engagement — aligned pair */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <DealFlagLog dealId={dealId} />
        <EngagementSummaryCard dealId={dealId} />
      </div>
    </div>
  );
}
