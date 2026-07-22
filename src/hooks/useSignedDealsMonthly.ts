import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { type StageEntryDeal } from '@/hooks/usePipelineStageMetrics';

// Pipeline & stage IDs (same as usePipelineStageMetrics)
const ACTIVE_PIPELINE_ID = 'b78ad452-b489-4c89-8a91-789347c05f79';
const FINSERV_PIPELINE_ID = 'eb9db15a-62cc-4b99-adcf-24e57a2a46ce';
const IN_DEVELOPMENT_PIPELINE_ID = '40b17dfb-9122-49e0-bf7c-5aa993d5d615';
// Treat first entry into Final Credit Items OR any downstream stage as
// "signed" — deals sometimes skip FCI and jump straight to Terms Issued
// (e.g. Xnergy United Network).
const SIGNED_STAGES = ['final-credit-items', 'terms-issued', 'in-due-diligence', 'funded-invoiced'];
const FS_ACTIVE_CLIENT_STAGE = 'fs-active-client';

export interface MonthBucket {
  label: string; // "Jan 26"
  key: string;   // "2026-01"
  count: number;
  deals: StageEntryDeal[];
}

type MonthDef = { key: string; label: string; start: string; end: string };

function toMonthBuckets(months: MonthDef[]): { label: string; key: string; start: string; end: string }[] {
  return months.map(m => ({
    label: m.label + ' ' + m.key.slice(2, 4),
    key: m.key,
    start: m.start,
    end: m.end,
  }));
}

function useStageEntryMonthlySeries(
  targetStage: string | string[],
  pipelineId: string | string[],
  quarterMonths: MonthDef[],
) {
  const { user } = useAuth();
  const pipelineIds = Array.isArray(pipelineId) ? pipelineId : [pipelineId];
  const pipelineKey = pipelineIds.join(',');
  const targetStages = Array.isArray(targetStage) ? targetStage : [targetStage];
  const targetKey = targetStages.join(',');
  const buckets = useMemo(() => toMonthBuckets(quarterMonths), [quarterMonths]);
  const startDate = buckets[0]?.start ?? '';
  const endDate = buckets[buckets.length - 1]?.end ?? '';

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['stage-entry-monthly', targetKey, pipelineKey, startDate, endDate],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('activity_logs')
        .select(`
          deal_id,
          created_at,
          metadata,
          deals!inner (
            company,
            value,
            manager,
            stage,
            pipeline_id
          )
        `)
        .eq('activity_type', 'stage_change')
        .in('metadata->>to', targetStages)
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
      if (!deal || !pipelineIds.includes(deal.pipeline_id)) continue;
      const ts = new Date(row.created_at);
      const monthKey = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}`;
      const meta = (row as any).metadata ?? {};
      seen.set(row.deal_id, {
        deal_id: row.deal_id,
        company: deal.company ?? '—',
        value: Number(deal.value) || 0,
        manager: deal.manager,
        current_stage: deal.stage,
        entered_at: row.created_at,
        pipeline_id: deal.pipeline_id,
        from_stage: meta.from ?? null,
        to_stage: meta.to ?? targetStages[0],
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

    // Treat any in-flight refetch (e.g. when the quarter changes) as loading
    // so the UI shows a skeleton instead of stale data.
    const loading = isLoading || isFetching;
    return { months: result, isLoading: loading };
  }, [data, isLoading, isFetching, buckets, pipelineKey]);
}

export function useDealsSignedMonthlySeries(quarterMonths: MonthDef[]) {
  return useStageEntryMonthlySeries(
    SIGNED_STAGES,
    [ACTIVE_PIPELINE_ID, IN_DEVELOPMENT_PIPELINE_ID],
    quarterMonths,
  );
}

export function useFinServClientsSignedMonthlySeries(quarterMonths: MonthDef[]) {
  return useStageEntryMonthlySeries(FS_ACTIVE_CLIENT_STAGE, FINSERV_PIPELINE_ID, quarterMonths);
}
