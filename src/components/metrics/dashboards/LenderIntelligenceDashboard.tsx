import { useMasterLenders } from '@/hooks/useMasterLenders';
import { LenderAnalyticsDialog } from '@/components/lenders/LenderAnalyticsDialog';

/**
 * Full-page mirror of the "Lender Intelligence Dashboard" pop-up shown on the
 * Funding Sources page. Same component, rendered inline (embedded) with the
 * complete lender directory as its scope.
 */
export function LenderIntelligenceDashboard() {
  const { lenders, totalCount } = useMasterLenders({ mode: 'all', eagerAll: true });

  return (
    <LenderAnalyticsDialog
      embedded
      open
      onOpenChange={() => {}}
      lenders={lenders}
      totalLenderCount={totalCount ?? lenders.length}
    />
  );
}

export default LenderIntelligenceDashboard;
