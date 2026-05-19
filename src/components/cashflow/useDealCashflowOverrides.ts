import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DealCashflowOverride {
  deal_entry_id: string;
  excluded_dates: string[];
  end_date: string | null;
}

/**
 * Per-occurrence and series-truncation overrides for deal-projected cashflow
 * rows (Retainers, Closing Fees, Milestones). These let the user delete a
 * single instance or "this and future" instances directly from the cashflow
 * drilldown grid without editing the underlying deal record.
 *
 * Storage: `cashflow_deal_overrides` table, keyed by (company_id, deal_entry_id).
 */
export function useDealCashflowOverrides(companyId: string | undefined) {
  const [overrides, setOverrides] = useState<Record<string, DealCashflowOverride>>({});
  const [isLoading, setIsLoading] = useState(false);

  const fetchOverrides = useCallback(async () => {
    if (!companyId) { setOverrides({}); return; }
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('cashflow_deal_overrides' as any)
        .select('deal_entry_id, excluded_dates, end_date')
        .eq('company_id', companyId);
      if (error) {
        console.error('Error loading deal cashflow overrides:', error);
        setOverrides({});
        return;
      }
      const map: Record<string, DealCashflowOverride> = {};
      for (const row of (data as any[] | null) || []) {
        map[row.deal_entry_id] = {
          deal_entry_id: row.deal_entry_id,
          excluded_dates: Array.isArray(row.excluded_dates)
            ? row.excluded_dates.map((d: any) => String(d).slice(0, 10))
            : [],
          end_date: row.end_date ? String(row.end_date).slice(0, 10) : null,
        };
      }
      setOverrides(map);
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetchOverrides(); }, [fetchOverrides]);

  /**
   * Add a single excluded date (idempotent) for the given deal entry id.
   */
  const excludeOccurrence = useCallback(
    async (dealEntryId: string, occurrenceDate: string): Promise<boolean> => {
      if (!companyId) return false;
      const existing = overrides[dealEntryId];
      const nextDates = existing?.excluded_dates?.includes(occurrenceDate)
        ? existing.excluded_dates
        : [...(existing?.excluded_dates || []), occurrenceDate];
      const { data: userResp } = await supabase.auth.getUser();
      const userId = userResp?.user?.id ?? null;
      const { error } = await supabase
        .from('cashflow_deal_overrides' as any)
        .upsert(
          {
            company_id: companyId,
            deal_entry_id: dealEntryId,
            excluded_dates: nextDates,
            end_date: existing?.end_date ?? null,
            created_by: userId,
          },
          { onConflict: 'company_id,deal_entry_id' },
        );
      if (error) {
        console.error('Error excluding deal cashflow occurrence:', error);
        return false;
      }
      setOverrides((prev) => ({
        ...prev,
        [dealEntryId]: {
          deal_entry_id: dealEntryId,
          excluded_dates: nextDates,
          end_date: existing?.end_date ?? null,
        },
      }));
      return true;
    },
    [companyId, overrides],
  );

  /**
   * Truncate the deal-projected series at `cutoffDate` (inclusive — the
   * cutoff date itself is excluded too). Prior occurrences remain visible.
   */
  const truncateSeries = useCallback(
    async (dealEntryId: string, cutoffDate: string): Promise<boolean> => {
      if (!companyId) return false;
      const existing = overrides[dealEntryId];
      const nextDates = existing?.excluded_dates?.includes(cutoffDate)
        ? existing.excluded_dates
        : [...(existing?.excluded_dates || []), cutoffDate];
      // end_date stored is the day BEFORE the cutoff so generation stops there.
      const d = new Date(cutoffDate + 'T00:00:00');
      d.setDate(d.getDate() - 1);
      const truncEnd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const { data: userResp } = await supabase.auth.getUser();
      const userId = userResp?.user?.id ?? null;
      const { error } = await supabase
        .from('cashflow_deal_overrides' as any)
        .upsert(
          {
            company_id: companyId,
            deal_entry_id: dealEntryId,
            excluded_dates: nextDates,
            end_date: truncEnd,
            created_by: userId,
          },
          { onConflict: 'company_id,deal_entry_id' },
        );
      if (error) {
        console.error('Error truncating deal cashflow series:', error);
        return false;
      }
      setOverrides((prev) => ({
        ...prev,
        [dealEntryId]: {
          deal_entry_id: dealEntryId,
          excluded_dates: nextDates,
          end_date: truncEnd,
        },
      }));
      return true;
    },
    [companyId, overrides],
  );

  return { overrides, isLoading, fetchOverrides, excludeOccurrence, truncateSeries };
}