import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PartnerTierInfo, AutoTier } from '@/hooks/usePartnerTier';

export interface PartnerTierHistoryEntry {
  id: string;
  partner_id: string;
  company_id: string;
  from_tier: number | null;
  to_tier: number;
  source: 'auto' | 'manual_override' | 'override_cleared';
  reason: string | null;
  thresholds: Record<string, any> | null;
  changed_by: string | null;
  changed_by_email: string | null;
  created_at: string;
}

export function usePartnerTierHistory(partnerId: string | undefined | null) {
  return useQuery({
    queryKey: ['partner_tier_history', partnerId],
    enabled: !!partnerId,
    queryFn: async (): Promise<PartnerTierHistoryEntry[]> => {
      const { data, error } = await supabase
        .from('partner_tier_history' as any)
        .select('*')
        .eq('partner_id', partnerId as string)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as PartnerTierHistoryEntry[];
    },
    staleTime: 30_000,
  });
}

function thresholdsSnapshot(info: PartnerTierInfo) {
  return {
    qualifiedTrailing3mo: info.qualifiedTrailing3mo,
    signedTrailing3mo: info.signedTrailing3mo,
    addedToBoardTrailing3mo: info.addedToBoardTrailing3mo,
    addedToBoardTrailing12mo: info.addedToBoardTrailing12mo,
    totalDeals: info.totalDeals,
  };
}

/**
 * Records auto tier changes as the computed tier stabilises. The
 * `record_partner_tier` RPC is idempotent for `auto` source — it only inserts
 * when the new tier differs from the most recent log entry — so multiple
 * clients observing the same value will not create duplicate rows.
 */
export function useRecordPartnerTierAuto(
  partnerId: string | undefined | null,
  tierInfo: PartnerTierInfo | undefined,
) {
  const qc = useQueryClient();
  const lastSent = useRef<number | null>(null);
  useEffect(() => {
    if (!partnerId || !tierInfo) return;
    // Manual overrides are recorded explicitly by the override save flow.
    if (tierInfo.manualOverride) return;
    if (lastSent.current === tierInfo.tier) return;
    lastSent.current = tierInfo.tier;
    (async () => {
      try {
        const { data } = await supabase.rpc('record_partner_tier' as any, {
          _partner_id: partnerId,
          _to_tier: tierInfo.tier,
          _source: 'auto',
          _reason: null,
          _thresholds: thresholdsSnapshot(tierInfo),
        });
        if (data) {
          qc.invalidateQueries({ queryKey: ['partner_tier_history', partnerId] });
          // Fan out in-app + email notifications for auto tier changes.
          // The edge function itself filters out baseline (first-ever) snapshots.
          supabase.functions
            .invoke('notify-partner-tier-change', { body: { historyId: data } })
            .catch(() => {/* best-effort */});
        }
      } catch {
        // best-effort
      }
    })();
  }, [partnerId, tierInfo, qc]);
}

export async function recordPartnerTierOverride(params: {
  partnerId: string;
  toTier: AutoTier;
  reason: string;
  thresholds?: Record<string, any> | null;
}) {
  await supabase.rpc('record_partner_tier' as any, {
    _partner_id: params.partnerId,
    _to_tier: params.toTier,
    _source: 'manual_override',
    _reason: params.reason,
    _thresholds: params.thresholds ?? null,
  });
}

export async function recordPartnerTierOverrideCleared(params: {
  partnerId: string;
  fallbackTier: AutoTier;
  thresholds?: Record<string, any> | null;
}) {
  await supabase.rpc('record_partner_tier' as any, {
    _partner_id: params.partnerId,
    _to_tier: params.fallbackTier,
    _source: 'override_cleared',
    _reason: null,
    _thresholds: params.thresholds ?? null,
  });
}