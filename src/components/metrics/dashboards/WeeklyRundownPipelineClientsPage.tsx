import { useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { usePipelineData, useBriefingWindow } from '@/hooks/useDailyBriefingData';
import { RecentPipelineActivitySection } from '@/components/dashboard/briefingPrimitives';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

/**
 * Page 3 of the Weekly Rundown carousel: "Pipeline & Clients".
 *
 * For now this surfaces the SAME "Recent Pipeline Activity" widget that
 * appears in the Daily Briefing modal. Both render through the shared
 * <RecentPipelineActivitySection /> primitive so styling stays identical
 * and the data shape comes from the same usePipelineData() hook.
 *
 * Period sync: usePipelineData uses useBriefingWindow() ("since 5 PM ET
 * yesterday"). That matches the source widget exactly, so this page reflects
 * the same activity feed as the Daily Briefing — no additional sync work
 * is required for this widget. Other widgets on this page (Proposals
 * Issued, Clients Signed) will be added in follow-up turns and can bind to
 * the Weekly Rundown quarter selector at that time.
 */
export function WeeklyRundownPipelineClientsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const window = useBriefingWindow();
  const { data, isLoading, isFetching } = usePipelineData(true);

  const recentActivity = data?.recentActivity ?? [];

  const handleRowClick = (a: any) => {
    if (a?.deal_id) navigate(`/deal/${a.deal_id}`);
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['briefing'] });
    queryClient.invalidateQueries({ queryKey: ['pipeline'] });
  };

  return (
    <div className="px-4 py-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Pipeline & Clients</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {window?.label || 'Activity since 5 PM ET yesterday'}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={isFetching}
          className="text-xs gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {isLoading && !data ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg bg-white/[0.04]" />
          ))}
        </div>
      ) : (
        <RecentPipelineActivitySection
          recentActivity={recentActivity}
          onRowClick={handleRowClick}
          onNavigate={(path) => navigate(path)}
        />
      )}
    </div>
  );
}
