import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useClaapQuotaStatus, useRequestClaapRefresh } from '@/hooks/useClaapQuotaStatus';

interface Props {
  /** When provided, the "Refresh when available" button targets this recording row. */
  recordingRowId?: string;
  className?: string;
}

/**
 * Shows a banner when Claap's daily rate limit has been hit or when we're
 * in quota-protect mode. Cached transcripts / summaries in Supabase continue
 * to render underneath — this only surfaces the sync state.
 */
export function ClaapQuotaBanner({ recordingRowId, className }: Props) {
  const { data: status, isLoading } = useClaapQuotaStatus();
  const refresh = useRequestClaapRefresh();

  if (isLoading || !status) return null;
  if (!status.outOfQuota && !status.protectMode) return null;

  const lastSynced = status.lastSyncedAt
    ? formatDistanceToNow(new Date(status.lastSyncedAt), { addSuffix: true })
    : 'unknown';
  const resets = status.resetAt
    ? formatDistanceToNow(new Date(status.resetAt), { addSuffix: true })
    : 'later today';

  const title = status.outOfQuota
    ? 'Claap sync paused — daily rate limit reached'
    : 'Claap sync in quota-protect mode';

  return (
    <Alert variant="destructive" className={className}>
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span>
          Showing cached notes — last synced {lastSynced}. Quota resets {resets}.
        </span>
        {recordingRowId && (
          <Button
            size="sm"
            variant="outline"
            disabled={refresh.isPending}
            onClick={() => refresh.mutate(recordingRowId)}
          >
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${refresh.isPending ? 'animate-spin' : ''}`} />
            Refresh when available
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}