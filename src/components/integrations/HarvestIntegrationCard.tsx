import { Clock, RefreshCw } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useHarvestStatus, useHarvestSync } from '@/hooks/useHarvest';
import { toast } from 'sonner';
export function HarvestIntegrationCard() {
  const status = useHarvestStatus();
  const sync = useHarvestSync();
  return <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Clock className="h-4 w-4" />Harvest</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <p className="text-sm text-muted-foreground">{status.isLoading ? 'Checking connection…' : status.error ? status.error.message : status.data?.connected ? 'Connected · FinServ' : 'Not connected'}</p>
      <p className="text-xs text-muted-foreground">{status.data?.state?.last_synced_at ? `Last synced ${new Date(status.data.state.last_synced_at).toLocaleString()} · ${status.data.state.total_entries.toLocaleString()} entries` : 'No completed sync'}</p>
      {status.data?.state?.pending_run && <p className="text-xs text-muted-foreground">Import pending · page {status.data.state.next_page}</p>}
      <Button variant="outline" disabled={!status.data?.canSync || sync.isPending || !status.data?.connected} onClick={() => sync.mutate(undefined, { onSuccess: () => toast.success('Harvest synced'), onError: e => toast.error(e.message) })}>
        <RefreshCw className={`mr-2 h-4 w-4 ${sync.isPending ? 'animate-spin' : ''}`} />{sync.isPending ? 'Syncing…' : status.data?.state?.pending_run ? 'Resume Sync' : 'Sync Now'}
      </Button>
    </CardContent></Card>;
}