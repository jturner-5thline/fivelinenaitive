import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Filter, Clock, AlertTriangle, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';

export function ClaapSyncSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [backfillProgress, setBackfillProgress] = useState<{
    running: boolean;
    processed: number;
    matched: number;
    rematched: number;
    skipped: number;
    alreadyExists: number;
    errors: number;
    batchesDone: number;
    errorDetails: Array<{ claap_id: string; title: string | null; error: string }>;
    processedTitles: string[];
  } | null>(null);

  // Fetch company config
  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['claap-sync-config'],
    queryFn: async () => {
      const { data: member } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (!member?.company_id) return null;

      const { data } = await (supabase
        .from('claap_integration_config')
        .select('*')
        .eq('company_id', member.company_id)
        .maybeSingle() as any);

      return data ? { ...data, company_id: member.company_id } : { company_id: member.company_id, sync_all_calls: false };
    },
    enabled: !!user,
  });

  // Fetch skipped calls
  const { data: skippedCalls, isLoading: skippedLoading } = useQuery({
    queryKey: ['claap-skipped-calls'],
    queryFn: async () => {
      const { data } = await (supabase
        .from('claap_skipped_calls')
        .select('*')
        .eq('force_synced', false)
        .order('created_at', { ascending: false })
        .limit(50) as any);
      return data || [];
    },
    enabled: !!user,
  });

  // Toggle sync mode
  const toggleSyncAll = useMutation({
    mutationFn: async (syncAll: boolean) => {
      if (!config?.company_id) throw new Error('No company');

      // Upsert config
      const { error } = await (supabase
        .from('claap_integration_config')
        .upsert({
          company_id: config.company_id,
          sync_all_calls: syncAll,
          is_active: true,
        }, { onConflict: 'company_id' }) as any);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claap-sync-config'] });
      toast.success('Sync settings updated');
    },
    onError: (err: any) => toast.error('Failed to update', { description: err.message }),
  });

  // Force sync a skipped call
  const forceSync = useMutation({
    mutationFn: async (skippedCallId: string) => {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/claap-webhook`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'force_sync',
            data: { skipped_call_id: skippedCallId, user_id: user!.id },
          }),
        }
      );
      const result = await response.json();
      if (!result.ok) throw new Error(result.error || 'Force sync failed');
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claap-skipped-calls'] });
      toast.success('Call synced successfully');
    },
    onError: (err: any) => toast.error('Force sync failed', { description: err.message }),
  });

  // Backfill historical calls
  const runBackfill = async (rematchExistingOnly = false) => {
    if (!config?.company_id) {
      toast.error('No company configuration found');
      return;
    }

    setBackfillProgress({ running: true, processed: 0, matched: 0, rematched: 0, skipped: 0, alreadyExists: 0, errors: 0, batchesDone: 0, errorDetails: [], processedTitles: [] });
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    let cursor: string | null = null;
    let totalProcessed = 0, totalMatched = 0, totalRematched = 0, totalSkipped = 0, totalExists = 0, totalErrors = 0;
    let batchesDone = 0;
    let allErrorDetails: Array<{ claap_id: string; title: string | null; error: string }> = [];
    let allTitles: string[] = [];

    try {
      for (let i = 0; i < 50; i++) {
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/claap-backfill`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              company_id: config.company_id,
              days_back: 60,
              batch_size: 20,
              cursor,
              time_budget_ms: 50000,
              rematch_existing_only: rematchExistingOnly,
            }),
          }
        );

        const result = await response.json();
        if (!result.ok) throw new Error(result.error || 'Backfill failed');

        totalProcessed += result.processed || 0;
        totalMatched += result.matched || 0;
        totalRematched += result.rematched || 0;
        totalSkipped += result.skipped || 0;
        totalExists += result.already_exists || 0;
        totalErrors += result.errors || 0;
        batchesDone++;
        if (result.error_details) allErrorDetails = [...allErrorDetails, ...result.error_details];
        if (result.processed_titles) allTitles = [...allTitles, ...result.processed_titles];

        setBackfillProgress({
          running: true, processed: totalProcessed, matched: totalMatched,
          rematched: totalRematched, skipped: totalSkipped, alreadyExists: totalExists, errors: totalErrors, batchesDone,
          errorDetails: allErrorDetails, processedTitles: allTitles,
        });

        if (rematchExistingOnly || !result.has_more || !result.next_cursor) break;
        cursor = result.next_cursor;
      }

      toast.success(rematchExistingOnly ? 'Call re-match complete' : 'Historical backfill complete', {
        description: rematchExistingOnly
          ? `Processed: ${totalProcessed} | Re-matched: ${totalRematched} | Skipped: ${totalSkipped}`
          : `Processed: ${totalProcessed} | Matched: ${totalMatched} | Re-matched: ${totalRematched} | Skipped: ${totalSkipped} | Already synced: ${totalExists}`,
        duration: 10000,
      });

      queryClient.invalidateQueries({ queryKey: ['claap-skipped-calls'] });
    } catch (err: any) {
      toast.error('Backfill failed', { description: err.message });
    } finally {
      setBackfillProgress(prev => prev ? { ...prev, running: false } : null);
    }
  };

  if (configLoading) {
    return (
      <Card>
        <CardContent className="py-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Left column: Historical Sync + Call Sync Settings */}
      <div className="space-y-4">
        {/* Historical Backfill */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Download className="h-4 w-4" />
              Historical Sync
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Fetch all Claap recordings from the past 60 days and apply smart matching to route them to deals, companies, and contacts.
            </p>
            {backfillProgress && (
              <div className="space-y-2 bg-muted/50 rounded-lg p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">
                    {backfillProgress.running ? `Processing batch ${backfillProgress.batchesDone}...` : 'Complete'}
                  </span>
                  {backfillProgress.running && <Loader2 className="h-3 w-3 animate-spin" />}
                </div>
                <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                  <span>Processed: {backfillProgress.processed}</span>
                  <span>Matched: {backfillProgress.matched}</span>
                  <span>Re-matched: {backfillProgress.rematched}</span>
                  <span>Skipped: {backfillProgress.skipped}</span>
                  <span>Already synced: {backfillProgress.alreadyExists}</span>
                  {backfillProgress.errors > 0 && (
                    <span className="text-destructive col-span-2">Errors: {backfillProgress.errors}</span>
                  )}
                </div>
                {backfillProgress.errorDetails?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <span className="text-xs font-medium text-destructive">Error details:</span>
                    <ScrollArea className="max-h-24">
                      {backfillProgress.errorDetails.map((e, i) => (
                        <div key={i} className="text-xs text-destructive/80 truncate">
                          • {e.title || e.claap_id}: {e.error}
                        </div>
                      ))}
                    </ScrollArea>
                  </div>
                )}
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => runBackfill(false)}
                disabled={backfillProgress?.running}
                className="w-full"
              >
                {backfillProgress?.running ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                {backfillProgress?.running ? 'Syncing...' : 'Sync Historical Calls'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => runBackfill(true)}
                disabled={backfillProgress?.running}
                className="w-full"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Re-match All Calls
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Sync Mode Toggle */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Call Sync Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Only sync matched calls</p>
                <p className="text-xs text-muted-foreground">
                  Unmatched calls are skipped when enabled.
                </p>
              </div>
              <Switch
                checked={!config?.sync_all_calls}
                onCheckedChange={(checked) => toggleSyncAll.mutate(!checked)}
                disabled={toggleSyncAll.isPending}
              />
            </div>
            <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
              <p className="text-xs font-medium">Matching priority:</p>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                <li>• <strong>Deal</strong> — Title, aliases, or contacts match a deal</li>
                <li>• <strong>Lender</strong> — Domain or name matches a lender</li>
                <li>• <strong>Company</strong> — Domain or title matches a CRM company</li>
                <li>• <strong>Contact</strong> — Email matches a CRM contact</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right column: Skipped Calls */}
      <Card className="flex flex-col">
        <CardHeader className="pb-3 shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Recently Skipped Calls
              {skippedCalls && skippedCalls.length > 0 && (
                <Badge variant="secondary" className="text-xs">{skippedCalls.length}</Badge>
              )}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0">
          {skippedLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : !skippedCalls || skippedCalls.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No skipped calls. All synced calls matched successfully.
            </p>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-2 pr-2">
                {skippedCalls.map((call: any) => (
                  <div
                    key={call.id}
                    className="flex items-center justify-between border rounded-lg p-2.5 gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {call.title || 'Untitled Call'}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {call.started_at
                            ? format(new Date(call.started_at), 'MMM d, yyyy h:mm a')
                            : format(new Date(call.created_at), 'MMM d, yyyy h:mm a')}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {call.skip_reason}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => forceSync.mutate(call.id)}
                      disabled={forceSync.isPending}
                      className="shrink-0"
                    >
                      {forceSync.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3 mr-1" />
                      )}
                      Sync
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
