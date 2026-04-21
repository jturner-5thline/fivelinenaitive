import { RefreshCw } from 'lucide-react';
import { useOperationalData } from '@/hooks/useDailyBriefingData';
import { OperationalDashboard } from '@/components/dashboard/operational/OperationalDashboard';
import { Button } from '@/components/ui/button';

/**
 * Page 4 of the Weekly Rundown carousel: "Ops & Projects".
 *
 * Reuses the SAME OperationalDashboard component that powers the Daily
 * Briefing modal's "Operational" tab — same Asana data source (the
 * `briefing-operational` edge function via `useOperationalData`), same
 * KPI cards, charts, and section ordering.
 *
 * Team scope: the briefing modal passes `targetAssigneeName` to filter
 * Asana tasks down to a single user (e.g., "Niki Heikali" or
 * jturner-only views). This page intentionally calls
 * `useOperationalData(true)` with NO assignee, so the edge function
 * returns the entire team/company portfolio — overdue, due today,
 * upcoming, and recently completed across all assignees.
 */
export function WeeklyRundownOpsProjectsPage() {
  const { data, isLoading, error, refetch } = useOperationalData(true);

  return (
    <div className="px-4 py-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Ops & Projects</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Team-wide Asana portfolio · same layout as the Daily Briefing's Operational tab
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
          className="text-xs gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <OperationalDashboard
        data={data ?? null}
        isLoading={isLoading}
        error={error as Error | null}
        onRefetch={refetch}
      />
    </div>
  );
}
