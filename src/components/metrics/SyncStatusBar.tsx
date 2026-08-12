import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CheckCircle2, RefreshCw, Settings2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useSyncSchedule } from '@/hooks/useSyncSchedule';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function SyncStatusBar() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { settings, updateSettings } = useSyncSchedule();
  const queryClient = useQueryClient();

  const { data: syncStatuses } = useQuery({
    queryKey: ['sync-status-bar'],
    queryFn: async () => {
      const results: Record<string, { lastSync: string | null }> = {};

      const { data: qbData } = await (supabase
        .from('quickbooks_customers') as any)
        .select('synced_at')
        .order('synced_at', { ascending: false })
        .limit(1);
      results.qb = { lastSync: qbData?.[0]?.synced_at || null };

      const { data: hsData } = await (supabase
        .from('hubspot_sync_runs') as any)
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1);
      results.hs = { lastSync: hsData?.[0]?.created_at || null };

      return results;
    },
    refetchInterval: 60_000,
  });

  const hasAnySyncs = syncStatuses && Object.values(syncStatuses).some(s => s.lastSync);

  const handleManualRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let hsBody: Record<string, unknown> = { action: 'syncDeals' };
      if (user) {
        const [{ data: membership }, { data: config }] = await Promise.all([
          (supabase.from('company_members') as any)
            .select('company_id')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle(),
          (supabase.from('integration_configs') as any)
            .select('id')
            .eq('provider', 'hubspot')
            .limit(1)
            .maybeSingle(),
        ]);
        hsBody = {
          action: 'syncDeals',
          userId: user.id,
          companyId: membership?.company_id || null,
          configId: config?.id || null,
        };
      }
      const results = await Promise.allSettled([
        supabase.functions.invoke('quickbooks-sync', { body: {} }),
        supabase.functions.invoke('hubspot-sync', { body: hsBody }),
      ]);
      const failed = results.filter(r => r.status === 'rejected').length;
      await queryClient.invalidateQueries({ queryKey: ['sync-status-bar'] });
      if (failed === results.length) {
        toast.error('Sync failed. Please try again.');
      } else if (failed > 0) {
        toast.warning('Partial sync completed.');
      } else {
        toast.success('Sync complete. Timestamps updated.');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Sync failed');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {syncStatuses?.qb?.lastSync && (
        <Badge variant="outline" className="text-xs gap-1.5 font-normal">
          <CheckCircle2 className="h-3 w-3 text-success" />
          <span className="text-muted-foreground">
            synced {formatDistanceToNow(new Date(syncStatuses.qb.lastSync), { addSuffix: true })}
          </span>
        </Badge>
      )}
      {syncStatuses?.hs?.lastSync && (
        <Badge variant="outline" className="text-xs gap-1.5 font-normal">
          <CheckCircle2 className="h-3 w-3 text-success" />
          <span className="font-medium">HubSpot</span>
          <span className="text-muted-foreground">
            synced {formatDistanceToNow(new Date(syncStatuses.hs.lastSync), { addSuffix: true })}
          </span>
        </Badge>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={handleManualRefresh}
        disabled={refreshing}
        className="h-7 px-2 gap-1.5 text-xs font-normal"
        aria-label="Refresh sync"
      >
        <RefreshCw className={cn('h-3 w-3', refreshing && 'animate-spin')} />
        {refreshing ? 'Syncing…' : 'Refresh'}
      </Button>

      {/* Auto-sync settings */}
      <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 hidden">
            <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="end">
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-1">Auto-Sync Schedule</h4>
              <p className="text-xs text-muted-foreground">Configure automatic data synchronization</p>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="qb-auto" className="text-sm">QuickBooks</Label>
              <Switch
                id="qb-auto"
                checked={settings?.qb_enabled ?? false}
                onCheckedChange={(checked) =>
                  updateSettings.mutate({ qb_enabled: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="hs-auto" className="text-sm">HubSpot</Label>
              <Switch
                id="hs-auto"
                checked={settings?.hs_enabled ?? false}
                onCheckedChange={(checked) =>
                  updateSettings.mutate({ hs_enabled: checked })
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Sync Interval</Label>
              <Select
                value={String(settings?.interval_hours ?? 48)}
                onValueChange={(v) =>
                  updateSettings.mutate({ interval_hours: parseInt(v) })
                }
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="6">Every 6 hours</SelectItem>
                  <SelectItem value="12">Every 12 hours</SelectItem>
                  <SelectItem value="24">Every 24 hours</SelectItem>
                  <SelectItem value="48">Every 48 hours</SelectItem>
                  <SelectItem value="72">Every 72 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(settings?.qb_enabled || settings?.hs_enabled) && (
              <p className="text-[11px] text-muted-foreground">
                Auto-sync runs every {settings?.interval_hours ?? 48}h for enabled sources.
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
