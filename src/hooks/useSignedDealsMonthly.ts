import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { type StageEntryDeal } from '@/hooks/usePipelineStageMetrics';

// Pipeline & stage IDs (same as usePipelineStageMetrics)
const ACTIVE_PIPELINE_ID = 'b78ad452-b489-4c89-8a91-789347c05f79';
const FINSERV_PIPELINE_ID = 'eb9db15a-62cc-4b99-adcf-24e57a2a46ce';
const FINAL_CREDIT_ITEMS_STAGE = 'final-credit-items';
const FS_ACTIVE_CLIENT_STAGE = 'fs-active-client';

export interface MonthBucket {
  label: string; // "Jan 26"
  key: string;   // "2026-01"
  count: number;
  deals: StageEntryDeal[];
}

/** Build last N month buckets ending with the current month, oldest first. */
function buildMonthBuckets(n: number): { label: string; key: string; start: string; end: string }[] {
  const now = new Date();
  const buckets: { label: string; key: string; start: string; end: string }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const endDate = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short' }) + ' ' + String(d.getFullYear()).slice(2);
    buckets.push({
      label,
      key,
      start: `${key}-01`,
      end: `${key}-${endDate.getDate()}`,
    });
  }
  return buckets;
}

function useStageEntryMonthlySeries(
  targetStage: string,
  pipelineId: string,
  monthCount = 6,
) {
  const { user } = useAuth();
  const buckets = useMemo(() => buildMonthBuckets(monthCount), [monthCount]);
  const startDate = buckets[0].start;
  const endDate = buckets[buckets.length - 1].end;

  const { data, isLoading } = useQuery({
    queryKey: ['stage-entry-monthly', targetStage, pipelineId, startDate, endDate],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('activity_logs')
        .select(`
          deal_id,
          created_at,
          deals!inner (
            company,
            value,
            manager,
            stage,
            pipeline_id
          )
        `)
        .eq('activity_type', 'stage_change')
        .eq('metadata->>to', targetStage)
        .gte('created_at', startDate)
        .lte('created_at', endDate + 'T23:59:59.999Z')
        .order('created_at', { ascending: true });

      if (error) throw error;
      return rows ?? [];
    },
    enabled: !!user,
  });

  return useMemo(() => {
    // Deduplicate: first entry per deal
    const seen = new Map<string, StageEntryDeal & { monthKey: string }>();
    for (const row of data ?? []) {
      if (seen.has(row.deal_id)) continue;
      const deal = row.deals as any;
      if (!deal || deal.pipeline_id !== pipelineId) continue;
      const ts = new Date(row.created_at);
      const monthKey = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}`;
      seen.set(row.deal_id, {
        deal_id: row.deal_id,
        company: deal.company ?? '—',
        value: Number(deal.value) || 0,
        manager: deal.manager,
        current_stage: deal.stage,
        entered_at: row.created_at,
        pipeline_id: deal.pipeline_id,
        monthKey,
      });
    }

    // Aggregate into buckets
    const result: MonthBucket[] = buckets.map(b => ({ label: b.label, key: b.key, count: 0, deals: [] }));
    const bucketMap = new Map(result.map(r => [r.key, r]));
    for (const entry of seen.values()) {
      const bucket = bucketMap.get(entry.monthKey);
      if (bucket) {
        bucket.count++;
        bucket.deals.push(entry);
      }
    }

    return { months: result, isLoading };
  }, [data, isLoading, buckets, pipelineId]);
}

export function useDealsSignedMonthlySeries(monthCount = 6) {
  return useStageEntryMonthlySeries(FINAL_CREDIT_ITEMS_STAGE, ACTIVE_PIPELINE_ID, monthCount);
}

export function useFinServClientsSignedMonthlySeries(monthCount = 6) {
  return useStageEntryMonthlySeries(FS_ACTIVE_CLIENT_STAGE, FINSERV_PIPELINE_ID, monthCount);
}
