import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Pause, Play, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export function ClaapFundingBackfill({ companyId }: { companyId?: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const allowed = ['jturner@5thline.co', 'ffustinoni@5thline.co'].includes(user?.email ?? '');
  const { data: job, isLoading, error } = useQuery({
    queryKey: ['claap-funding-backfill', companyId], enabled: !!companyId && allowed,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('claap-funding-backfill', { body: { action: 'status', company_id: companyId } });
      if (error) throw error;
      return data.job as { status: string; phase: string; scanned: number; imported: number; hydrated: number; linked: number; failures: number; last_error: string | null; window_start: string; window_end: string } | null;
    },
  });
  const action = useMutation({
    mutationFn: async (action: 'start' | 'resume' | 'pause' | 'process') => {
      const { data, error } = await supabase.functions.invoke('claap-funding-backfill', { body: { action, company_id: companyId } });
      if (error || data?.error) throw error ?? new Error(data.error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['claap-funding-backfill', companyId] }),
    onError: (error: Error) => toast.error('History sync unavailable', { description: error.message }),
  });
  if (!allowed) return null;
  return <section className="space-y-3 border-t border-border pt-4">
    <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-medium">Funding Source History · 4 years</h3><Badge variant="secondary">{job?.status ?? 'Not started'}</Badge></div>
    {error && <p className="text-xs text-destructive">History status unavailable</p>}
    {job && <><div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground"><span>Scanned: {job.scanned}</span><span>Imported: {job.imported}</span><span>Content synced: {job.hydrated}</span><span>New links: {job.linked}</span><span>Retries: {job.failures}</span><span className="capitalize">{job.phase}</span></div>{job.last_error && <p className="text-xs text-muted-foreground">{job.last_error}</p>}</>}
    <div className="flex flex-wrap gap-2">
      {!job && <Button size="sm" variant="outline" disabled={isLoading || action.isPending || !companyId} onClick={() => action.mutate('start')}><Download className="mr-2 h-4 w-4" />Start 4-year backfill</Button>}
      {job && job.status !== 'complete' && <><Button size="sm" variant="outline" disabled={action.isPending} onClick={() => action.mutate(job.status === 'paused' ? 'resume' : 'pause')}>{job.status === 'paused' ? <Play className="mr-2 h-4 w-4" /> : <Pause className="mr-2 h-4 w-4" />}{job.status === 'paused' ? 'Resume' : 'Pause'}</Button><Button size="sm" variant="outline" disabled={action.isPending || job.status === 'paused'} onClick={() => action.mutate('process')}><RefreshCw className="mr-2 h-4 w-4" />Run next batch</Button></>}
    </div>
  </section>;
}