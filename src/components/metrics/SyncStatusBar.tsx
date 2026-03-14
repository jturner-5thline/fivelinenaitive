import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SyncSource {
  name: string;
  key: string;
  table: string;
  timestampColumn: string;
}

const SYNC_SOURCES: SyncSource[] = [
  { name: 'QuickBooks', key: 'qb', table: 'quickbooks_customers', timestampColumn: 'synced_at' },
  { name: 'HubSpot', key: 'hs', table: 'hubspot_sync_runs', timestampColumn: 'created_at' },
];

export function SyncStatusBar() {
  const { data: syncStatuses } = useQuery({
    queryKey: ['sync-status-bar'],
    queryFn: async () => {
      const results: Record<string, { lastSync: string | null; count: number }> = {};

      // QB: get latest synced_at from quickbooks_customers
      const { data: qbData } = await (supabase
        .from('quickbooks_customers') as any)
        .select('synced_at')
        .order('synced_at', { ascending: false })
        .limit(1);
      results.qb = {
        lastSync: qbData?.[0]?.synced_at || null,
        count: qbData?.length || 0,
      };

      // HS: get latest sync run
      const { data: hsData } = await (supabase
        .from('hubspot_sync_runs') as any)
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1);
      results.hs = {
        lastSync: hsData?.[0]?.created_at || null,
        count: hsData?.length || 0,
      };

      return results;
    },
    refetchInterval: 60_000, // refresh every minute
  });

  if (!syncStatuses) return null;

  const hasAnySyncs = Object.values(syncStatuses).some(s => s.lastSync);
  if (!hasAnySyncs) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {SYNC_SOURCES.map((source) => {
        const status = syncStatuses[source.key];
        if (!status?.lastSync) return null;

        const timeAgo = formatDistanceToNow(new Date(status.lastSync), { addSuffix: true });

        return (
          <Badge key={source.key} variant="outline" className="text-xs gap-1.5 font-normal">
            <CheckCircle2 className="h-3 w-3 text-success" />
            <span className="font-medium">{source.name}</span>
            <span className="text-muted-foreground">synced {timeAgo}</span>
          </Badge>
        );
      })}
    </div>
  );
}
