import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, RefreshCw, Filter, Clock, AlertTriangle, Download, CheckCircle2, Link2, Search, EyeOff, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { ClaapCallMatchCard, type ClaapCallData } from '@/components/claap/ClaapCallMatchCard';
import { ClaapSuggestionCard } from '@/components/claap/ClaapSuggestionCard';
import { useClaapSuggestions } from '@/hooks/useClaapSuggestions';

export function ClaapSyncSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const { suggestions, isLoading: suggestionsLoading, generateSuggestions } = useClaapSuggestions();
  const [backfillProgress, setBackfillProgress] = useState<{
    running: boolean;
    processed: number;
    matched: number;
    rematched: number;
    skipped: number;
    skippedInternalOnly: number;
    unmatched: number;
    alreadyExists: number;
    errors: number;
    batchesDone: number;
    pagesProcessed: number;
    totalCallsScanned: number;
    pageSize: number;
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

  // Fetch all calls with enhanced fields
  const { data: allCalls, isLoading: callsLoading } = useQuery({
    queryKey: ['claap-all-calls'],
    queryFn: async () => {
      const { data } = await (supabase
        .from('claap_meetings')
        .select('id, title, status, match_source, call_type, started_at, created_at, deal_id, duration_seconds, recording_url, match_status, match_method, match_confidence, match_reason, match_candidates, manually_locked')
        .order('created_at', { ascending: false })
        .limit(200) as any);

      if (!data) return [];

      // Fetch deal names for linked calls
      const dealIds = [...new Set(data.filter((c: any) => c.deal_id).map((c: any) => c.deal_id))] as string[];
      let dealNames: Record<string, string> = {};
      if (dealIds.length > 0) {
        const { data: deals } = await supabase
          .from('deals')
          .select('id, company')
          .in('id', dealIds);
        if (deals) {
          dealNames = Object.fromEntries(deals.map(d => [d.id, d.company]));
        }
      }

      return data.map((c: any) => ({
        ...c,
        deal_name: c.deal_id ? dealNames[c.deal_id] || null : null,
      })) as ClaapCallData[];
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
      queryClient.invalidateQueries({ queryKey: ['claap-all-calls'] });
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

    setBackfillProgress({
      running: true,
      processed: 0,
      matched: 0,
      rematched: 0,
      skipped: 0,
      skippedInternalOnly: 0,
      unmatched: 0,
      alreadyExists: 0,
      errors: 0,
      batchesDone: 0,
      pagesProcessed: 0,
      totalCallsScanned: 0,
      pageSize: 20,
      errorDetails: [],
      processedTitles: [],
    });
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    let cursor: string | null = null;
    let totalProcessed = 0;
    let totalMatched = 0;
    let totalRematched = 0;
    let totalSkipped = 0;
    let totalSkippedInternalOnly = 0;
    let totalUnmatched = 0;
    let totalExists = 0;
    let totalErrors = 0;
    let totalCallsScanned = 0;
    let totalPagesProcessed = 0;
    let batchesDone = 0;
    let pageSize = 20;
    let allErrorDetails: Array<{ claap_id: string; title: string | null; error: string }> = [];
    let allTitles: string[] = [];

    try {
      for (let i = 0; i < 200; i++) {
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/claap-backfill`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              company_id: config.company_id,
              days_back: 365,
              batch_size: pageSize,
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
        totalSkippedInternalOnly += result.skipped_internal_only || 0;
        totalUnmatched += result.unmatched || 0;
        totalExists += result.already_exists || 0;
        totalErrors += result.errors || 0;
        totalCallsScanned += result.records_returned || result.total_in_batch || 0;
        totalPagesProcessed += result.pages_processed || 1;
        batchesDone++;
        pageSize = result.page_size || pageSize;
        if (result.error_details) allErrorDetails = [...allErrorDetails, ...result.error_details];
        if (result.processed_titles) allTitles = [...allTitles, ...result.processed_titles];

        setBackfillProgress({
          running: true,
          processed: totalProcessed,
          matched: totalMatched,
          rematched: totalRematched,
          skipped: totalSkipped,
          skippedInternalOnly: totalSkippedInternalOnly,
          unmatched: totalUnmatched,
          alreadyExists: totalExists,
          errors: totalErrors,
          batchesDone,
          pagesProcessed: totalPagesProcessed,
          totalCallsScanned,
          pageSize,
          errorDetails: allErrorDetails,
          processedTitles: allTitles,
        });

        if (rematchExistingOnly || !result.has_more || !result.next_cursor) break;
        cursor = result.next_cursor;
      }

      // After re-matching, run AI suggestions for any calls still unmatched
      if (rematchExistingOnly) {
        try {
          await generateSuggestions.mutateAsync({ allUnmatched: true });
        } catch (e) {
          // Surface but don't fail the whole flow
          console.error('Auto-suggest after re-match failed', e);
        }
      }

      toast.success(rematchExistingOnly ? 'Call re-match complete' : 'Historical backfill complete', {
        description: rematchExistingOnly
          ? `Processed: ${totalProcessed} | Re-matched: ${totalRematched} | Pages: ${totalPagesProcessed}`
          : `Scanned: ${totalCallsScanned} | Processed: ${totalProcessed} | Matched: ${totalMatched} | Unmatched: ${totalUnmatched} | Internal-only skipped: ${totalSkippedInternalOnly} | Already synced: ${totalExists}`,
        duration: 10000,
      });

      queryClient.invalidateQueries({ queryKey: ['claap-skipped-calls'] });
      queryClient.invalidateQueries({ queryKey: ['claap-all-calls'] });
    } catch (err: any) {
      toast.error('Backfill failed', { description: err.message });
    } finally {
      setBackfillProgress(prev => prev ? { ...prev, running: false } : null);
    }
  };

  // Filter calls by tab status
  const filterCalls = (status: string) => {
    if (!allCalls) return [];
    let filtered = allCalls.filter((c: ClaapCallData) => {
      if (status === 'matched') return c.match_status === 'matched' || c.match_status === 'manually_linked';
      if (status === 'needs_review') return c.match_status === 'needs_review' || c.match_status === 'suggested';
      if (status === 'unmatched') return c.match_status === 'unmatched' || (!c.match_status && !c.deal_id);
      if (status === 'ignored') return c.match_status === 'ignored';
      return true;
    });
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(c => c.title?.toLowerCase().includes(term) || c.deal_name?.toLowerCase().includes(term));
    }
    return filtered;
  };

  const matchedCount = filterCalls('matched').length;
  const reviewCount = filterCalls('needs_review').length;
  const unmatchedCount = filterCalls('unmatched').length;
  const ignoredCount = filterCalls('ignored').length;

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
              Fetch all Claap recordings from the past 365 days and apply smart matching to route them to deals, companies, and contacts. Only calls where every participant is an internal @5thline.co attendee are excluded.
            </p>
            {backfillProgress && (
              <div className="space-y-2 bg-muted/50 rounded-lg p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">
                    {backfillProgress.running
                      ? `Processing page ${backfillProgress.pagesProcessed || backfillProgress.batchesDone}...`
                      : 'Complete'}
                  </span>
                  {backfillProgress.running && <Loader2 className="h-3 w-3 animate-spin" />}
                </div>
                <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                  <span>Pages: {backfillProgress.pagesProcessed}</span>
                  <span>Scanned: {backfillProgress.totalCallsScanned}</span>
                  <span>Processed: {backfillProgress.processed}</span>
                  <span>Matched: {backfillProgress.matched}</span>
                  <span>Re-matched: {backfillProgress.rematched}</span>
                  <span>Unmatched: {backfillProgress.unmatched}</span>
                  <span>Skipped: {backfillProgress.skipped}</span>
                  <span>Internal-only: {backfillProgress.skippedInternalOnly}</span>
                  <span>Already synced: {backfillProgress.alreadyExists}</span>
                  <span>Page size: {backfillProgress.pageSize}</span>
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
              <p className="text-xs font-medium">Smart matching priority:</p>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                <li>• <strong>Deal</strong> — Title, aliases, contacts, or domain match a deal</li>
                <li>• <strong>Lender</strong> — Domain or name matches a lender</li>
                <li>• <strong>Company</strong> — Domain or title matches a CRM company</li>
                <li>• <strong>Contact</strong> — Email matches a CRM contact</li>
              </ul>
              <p className="text-xs text-muted-foreground mt-1">
                Unmatched calls can receive AI-powered suggestions based on titles, participants, and learned patterns. Manually linked calls are protected from auto-rematch.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right column: Call Matching Management */}
      <Card className="flex flex-col">
        <CardHeader className="pb-2 shrink-0">
          <CardTitle className="text-sm flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Call Matching
          </CardTitle>
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search calls or deals..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0">
          <Tabs defaultValue="matched" className="w-full">
            <TabsList className="w-full grid grid-cols-4 h-8">
              <TabsTrigger value="matched" className="text-[10px] gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Matched
                {matchedCount > 0 && <Badge variant="secondary" className="text-[9px] h-3.5 px-1">{matchedCount}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="needs_review" className="text-[10px] gap-1">
                <AlertTriangle className="h-3 w-3" />
                Review
                {reviewCount > 0 && <Badge variant="secondary" className="text-[9px] h-3.5 px-1 bg-amber-500/20 text-amber-600">{reviewCount}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="unmatched" className="text-[10px] gap-1">
                <Search className="h-3 w-3" />
                Unmatched
                {unmatchedCount > 0 && <Badge variant="secondary" className="text-[9px] h-3.5 px-1">{unmatchedCount}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="ignored" className="text-[10px] gap-1">
                <EyeOff className="h-3 w-3" />
                Ignored
              </TabsTrigger>
            </TabsList>

            <TabsContent value="matched" className="mt-3">
              {callsLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="max-h-[450px] overflow-y-auto pr-1 space-y-2">
                  {filterCalls('matched').length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No matched calls yet.</p>
                  ) : (
                    filterCalls('matched').map((call: ClaapCallData) => (
                      <ClaapCallMatchCard key={call.id} call={call} />
                    ))
                  )}
                </div>
              )}
            </TabsContent>

            {/* Review tab: show AI suggestion cards */}
            <TabsContent value="needs_review" className="mt-3">
              {callsLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="max-h-[450px] overflow-y-auto pr-1 space-y-2">
                  {filterCalls('needs_review').length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No calls awaiting review. Click "Generate AI Suggestions" on the Unmatched tab to populate.
                    </p>
                  ) : (
                    filterCalls('needs_review').map((call: ClaapCallData) => {
                      const callSuggestions = suggestions[call.id] || [];
                      if (callSuggestions.length > 0) {
                        return (
                          <ClaapSuggestionCard
                            key={call.id}
                            call={{
                              id: call.id,
                              title: call.title,
                              started_at: call.started_at,
                              created_at: call.created_at,
                              duration_seconds: call.duration_seconds,
                              recording_url: call.recording_url,
                              match_status: call.match_status,
                              suggestions: callSuggestions,
                            }}
                          />
                        );
                      }
                      return <ClaapCallMatchCard key={call.id} call={call} />;
                    })
                  )}
                </div>
              )}
            </TabsContent>

            {/* Unmatched tab with AI suggestions */}
            <TabsContent value="unmatched" className="mt-3">
              {callsLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {unmatchedCount > 0 && (
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] text-muted-foreground">
                        {unmatchedCount} unmatched call{unmatchedCount !== 1 ? 's' : ''}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px]"
                        onClick={() => generateSuggestions.mutate({ allUnmatched: true })}
                        disabled={generateSuggestions.isPending}
                      >
                        {generateSuggestions.isPending ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3 mr-1" />
                        )}
                        {generateSuggestions.isPending ? 'Analyzing all unmatched...' : 'Generate AI Suggestions (all)'}
                      </Button>
                    </div>
                  )}
                  <div className="max-h-[450px] overflow-y-auto pr-1 space-y-2">
                    {filterCalls('unmatched').length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No unmatched calls.</p>
                    ) : (
                      filterCalls('unmatched').map((call: ClaapCallData) => {
                        const callSuggestions = suggestions[call.id] || [];
                        if (callSuggestions.length > 0) {
                          return (
                            <ClaapSuggestionCard
                              key={call.id}
                              call={{
                                id: call.id,
                                title: call.title,
                                started_at: call.started_at,
                                created_at: call.created_at,
                                duration_seconds: call.duration_seconds,
                                recording_url: call.recording_url,
                                match_status: call.match_status,
                                suggestions: callSuggestions,
                              }}
                            />
                          );
                        }
                        return <ClaapCallMatchCard key={call.id} call={call} />;
                      })
                    )}
                  </div>
                </>
              )}
            </TabsContent>

            {/* Ignored tab */}
            <TabsContent value="ignored" className="mt-3">
              {callsLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="max-h-[450px] overflow-y-auto pr-1 space-y-2">
                  {filterCalls('ignored').length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No ignored calls.</p>
                  ) : (
                    filterCalls('ignored').map((call: ClaapCallData) => (
                      <ClaapCallMatchCard key={call.id} call={call} />
                    ))
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Skipped calls section */}
          {skippedCalls && skippedCalls.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs font-medium mb-2 flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3 text-amber-500" />
                Skipped by Filter ({skippedCalls.length})
              </p>
              <div className="max-h-[200px] overflow-y-auto pr-1 space-y-1.5">
                {skippedCalls.map((call: any) => (
                  <div key={call.id} className="flex items-center justify-between border rounded-lg p-2 gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{call.title || 'Untitled Call'}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{call.skip_reason}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs shrink-0"
                      onClick={() => forceSync.mutate(call.id)}
                      disabled={forceSync.isPending}
                    >
                      {forceSync.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                      Sync
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
