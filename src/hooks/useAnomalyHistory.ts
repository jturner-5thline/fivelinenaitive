import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';
import type { TrendAlert } from '@/hooks/useInsightsComparison';

export interface AnomalyHistoryRow {
  id: string;
  signature: string;
  metric_key: string;
  metric_label: string;
  period_key: string;
  period_label: string;
  level: 'positive' | 'warning' | 'critical';
  message: string;
  pct_change: number | null;
  abs_change: number | null;
  first_seen_at: string;
  last_seen_at: string;
  occurrence_count: number;
  dismissed_at: string | null;
  snoozed_until: string | null;
  resolved_at: string | null;
  notes: string | null;
}

function signatureFor(metricKey: string, periodKey: string) {
  return `${metricKey}::${periodKey}`;
}

export function useAnomalyHistory() {
  return useQuery({
    queryKey: ['anomaly-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('insights_anomaly_history' as any)
        .select('*')
        .order('last_seen_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as AnomalyHistoryRow[];
    },
  });
}

/** Persist freshly detected alerts. Upserts by signature, increments occurrence_count
 *  and refreshes last_seen_at. Skips if user has snoozed the signature. */
export function useRecordAnomalies(args: {
  alerts: TrendAlert[];
  periodKey: string;
  periodLabel: string;
  detailsByMetric?: Record<string, { metricKey: string; pct?: number | null; abs?: number | null }>;
  enabled?: boolean;
}) {
  const { alerts, periodKey, periodLabel, detailsByMetric, enabled = true } = args;
  const { user } = useAuth();
  const { company } = useCompany();
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled || !user || alerts.length === 0) return;
    let cancelled = false;
    (async () => {
      const rows = alerts.map(a => {
        const detail = detailsByMetric?.[a.id] ?? detailsByMetric?.[a.metric];
        const metricKey = detail?.metricKey ?? a.metric;
        const sig = signatureFor(metricKey, periodKey);
        return {
          owner_user_id: user.id,
          company_id: company?.id ?? null,
          signature: sig,
          metric_key: metricKey,
          metric_label: a.metric,
          period_key: periodKey,
          period_label: periodLabel,
          level: a.level,
          message: a.message,
          pct_change: detail?.pct ?? null,
          abs_change: detail?.abs ?? null,
          last_seen_at: new Date().toISOString(),
        };
      });
      // Upsert: increment occurrence on conflict via RPC-less dance
      for (const r of rows) {
        const { data: existing } = await supabase
          .from('insights_anomaly_history' as any)
          .select('id, occurrence_count, dismissed_at, snoozed_until')
          .eq('owner_user_id', r.owner_user_id)
          .eq('signature', r.signature)
          .maybeSingle();
        if (cancelled) return;
        if (existing) {
          const ex: any = existing;
          // Skip if currently snoozed in the future
          if (ex.snoozed_until && new Date(ex.snoozed_until) > new Date()) continue;
          await supabase
            .from('insights_anomaly_history' as any)
            .update({
              last_seen_at: r.last_seen_at,
              occurrence_count: (ex.occurrence_count ?? 1) + 1,
              level: r.level,
              message: r.message,
              pct_change: r.pct_change,
              abs_change: r.abs_change,
              dismissed_at: null,
            })
            .eq('id', ex.id);
        } else {
          await supabase.from('insights_anomaly_history' as any).insert(r);
        }
      }
      if (!cancelled) qc.invalidateQueries({ queryKey: ['anomaly-history'] });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, user?.id, periodKey, alerts.map(a => a.id).join('|')]);
}

export function useUpdateAnomaly() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      action: 'dismiss' | 'snooze' | 'resolve' | 'reopen';
      snoozeDays?: number;
      notes?: string;
    }) => {
      const patch: any = {};
      const now = new Date();
      if (input.action === 'dismiss') patch.dismissed_at = now.toISOString();
      if (input.action === 'snooze') {
        const days = input.snoozeDays ?? 7;
        patch.snoozed_until = new Date(now.getTime() + days * 86400_000).toISOString();
      }
      if (input.action === 'resolve') patch.resolved_at = now.toISOString();
      if (input.action === 'reopen') {
        patch.dismissed_at = null;
        patch.snoozed_until = null;
        patch.resolved_at = null;
      }
      if (input.notes !== undefined) patch.notes = input.notes;
      const { error } = await supabase
        .from('insights_anomaly_history' as any)
        .update(patch)
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['anomaly-history'] });
      const labels: Record<string, string> = {
        dismiss: 'Anomaly dismissed',
        snooze: 'Anomaly snoozed',
        resolve: 'Anomaly resolved',
        reopen: 'Anomaly reopened',
      };
      toast.success(labels[vars.action]);
    },
    onError: (e: any) => toast.error('Failed: ' + (e?.message ?? 'unknown')),
  });
}
