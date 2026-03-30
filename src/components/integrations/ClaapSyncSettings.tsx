import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Filter, Clock, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';

export function ClaapSyncSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

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
    <div className="space-y-4">
      {/* Sync Mode Toggle */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Call Sync Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Only sync matched calls</p>
              <p className="text-xs text-muted-foreground">
                When enabled, only calls matching a lender, company, or contact will be synced. Unmatched calls are skipped.
              </p>
            </div>
            <Switch
              checked={!config?.sync_all_calls}
              onCheckedChange={(checked) => toggleSyncAll.mutate(!checked)}
              disabled={toggleSyncAll.isPending}
            />
          </div>
          <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
            <p className="text-xs font-medium">Matching checks (in order):</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• <strong>Contact</strong> — Participant email matches a CRM contact</li>
              <li>• <strong>Company</strong> — Participant domain or meeting title matches a CRM company</li>
              <li>• <strong>Lender</strong> — Meeting title, participant domain, or contact name matches a lender</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Skipped Calls Log */}
      <Card>
        <CardHeader className="pb-3">
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
        <CardContent>
          {skippedLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : !skippedCalls || skippedCalls.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No skipped calls. All synced calls matched a lender, company, or contact.
            </p>
          ) : (
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-2">
                {skippedCalls.map((call: any) => (
                  <div
                    key={call.id}
                    className="flex items-center justify-between border rounded-lg p-3 gap-3"
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
                        Reason: {call.skip_reason}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => forceSync.mutate(call.id)}
                      disabled={forceSync.isPending}
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
