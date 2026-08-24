import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Shared activity-date basis for every Sales & BD metric / leaderboard.
 *
 * `deals.created_at` is the CRM *import* timestamp, not when the deal actually
 * happened. The real "deal started" date is the earliest `deal_stage_history`
 * event for that deal; when a deal has no history rows we fall back to
 * `created_at`.
 *
 * Every widget that timebounds deals must use this hook (plus
 * `filterByEffectiveDate`) so all surfaces agree on the same basis.
 */
export function useDealFirstActivityDates(dealIds: string[]) {
  const sorted = [...dealIds].sort();
  return useQuery({
    queryKey: [
      'deal_first_activity_dates',
      sorted.length,
      sorted[0] ?? null,
      sorted[sorted.length - 1] ?? null,
    ],
    enabled: sorted.length > 0,
    queryFn: async () => {
      const map = new Map<string, string>();
      const chunkSize = 200;
      for (let i = 0; i < sorted.length; i += chunkSize) {
        const chunk = sorted.slice(i, i + chunkSize);
        const { data, error } = await supabase
          .from('deal_stage_history')
          .select('deal_id, changed_at')
          .in('deal_id', chunk);
        if (error) throw error;
        for (const row of (data || []) as { deal_id: string; changed_at: string | null }[]) {
          if (!row.changed_at) continue;
          const prev = map.get(row.deal_id);
          if (!prev || row.changed_at < prev) map.set(row.deal_id, row.changed_at);
        }
      }
      return map;
    },
    initialData: new Map<string, string>(),
  });
}

/** Effective activity date for a deal given the first-activity map. */
export function effectiveDealDate<T extends { id: string; created_at: string }>(
  deal: T,
  firstActivityByDeal: Map<string, string>,
): string {
  return firstActivityByDeal.get(deal.id) || deal.created_at;
}

/**
 * Rewrites each deal's `created_at` to its effective activity date and filters
 * to the selected timeframe.
 */
export function filterByEffectiveDate<T extends { id: string; created_at: string }>(
  deals: T[],
  firstActivityByDeal: Map<string, string>,
  rangeStart: Date | null,
  rangeEnd: Date | null,
): T[] {
  const withDate = deals.map(d => ({ ...d, created_at: effectiveDealDate(d, firstActivityByDeal) }));
  if (!rangeStart && !rangeEnd) return withDate;
  const startMs = rangeStart ? rangeStart.getTime() : -Infinity;
  const endMs = rangeEnd ? rangeEnd.getTime() : Infinity;
  return withDate.filter(d => {
    const t = new Date(d.created_at).getTime();
    return Number.isFinite(t) && t >= startMs && t <= endMs;
  });
}
