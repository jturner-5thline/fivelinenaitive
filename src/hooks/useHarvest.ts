import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNaitivePipelineAccess, FIFTH_LINE_COMPANY_ID } from './useNaitivePipelineAccess';
import { useInsightsTimeframe } from '@/contexts/InsightsTimeframeContext';
import { aggregateHarvest } from '@/lib/harvest';

async function invoke(action: 'status' | 'sync') {
  const { data, error } = await supabase.functions.invoke('sync-harvest', { body: { action } });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json();
      throw new Error(body.error ?? 'Harvest request failed');
    }
    throw error;
  }
  return data;
}
export function useHarvestStatus() {
  const { hasAccess } = useNaitivePipelineAccess();
  return useQuery({ queryKey: ['harvest-status'], queryFn: () => invoke('status'), enabled: hasAccess, staleTime: 60000 });
}
export function useHarvestSync() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async () => {
    for (let page = 0; page < 200; page++) {
      const result = await invoke('sync');
      if (result.done) return result;
    }
    throw new Error('Sync paused; select Sync Now to resume.');
  }, onSettled: () => {
    qc.invalidateQueries({ queryKey: ['harvest-status'] });
    qc.invalidateQueries({ queryKey: ['harvest-entries'] });
  } });
}
export function useHarvestData() {
  const status = useHarvestStatus();
  const { timeframe } = useInsightsTimeframe();
  const run = status.data?.state?.active_run;
  const query = useQuery({
    queryKey: ['harvest-entries', run, timeframe.start, timeframe.end],
    enabled: Boolean(run),
    queryFn: async () => {
      const rows = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from('harvest_time_entries').select('*')
          .eq('company_id', FIFTH_LINE_COMPANY_ID).eq('sync_run', run)
          .gte('spent_date', timeframe.start).lte('spent_date', timeframe.end)
          .order('harvest_id').range(offset, offset + 999);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 1000) break;
      }
      return rows;
    },
  });
  return { ...query, entries: query.data ?? [], months: aggregateHarvest(query.data ?? []), status,
    isLoading: status.isLoading || (Boolean(run) && query.isLoading), error: status.error ?? query.error };
}