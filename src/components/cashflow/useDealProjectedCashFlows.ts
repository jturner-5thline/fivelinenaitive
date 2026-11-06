import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ScheduledCashFlow } from './scheduledCashFlows';
import type { DealCashflowOverride } from './dealProjections';
import { buildDealProjectedCashFlows, retainerDealIds, DEAL_PROJECTION_SELECT, type StageHistoryRow } from './dealProjections';

/**
 * Project Cash-In entries from the naitive deal pipeline:
 *  - One-time Closing Fee at expected close date = deal value × success_fee_percent (default 2%)
 *  - One-time Retainer 14 days after the deal first entered "Final Credit Items" (never recurring)
 *
 * Entries are tagged with id prefix `deal:` and a `notes` value of
 * `naitive Deal — <Company> · <kind>` so the drilldown shows provenance.
 * They use the same ScheduledCashFlow shape so the existing merge / drilldown
 * pipeline picks them up unchanged.
 */
export function useDealProjectedCashFlows(
  companyId: string | undefined,
  enabled: boolean,
  overrides?: Record<string, DealCashflowOverride>,
) {
  const [items, setItems] = useState<ScheduledCashFlow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !companyId) { setItems([]); return; }
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('deals')
        .select(DEAL_PROJECTION_SELECT)
        .eq('company_id', companyId)
        .limit(500);
      if (cancelled) return;
      if (error || !data) {
        setItems([]); setIsLoading(false); return;
      }
      let hist: StageHistoryRow[] = [];
      const ids = retainerDealIds(data as any[]);
      if (ids.length) {
        const { data: h } = await (supabase as any)
          .from('deal_stage_history')
          .select('deal_id, to_stage, to_stage_id, changed_at')
          .in('deal_id', ids)
          .order('changed_at', { ascending: true });
        if (cancelled) return;
        hist = (h || []) as StageHistoryRow[];
      }
      const applied = buildDealProjectedCashFlows(data as any[], hist, overrides);
      setItems(applied);
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [companyId, enabled, overrides]);

  return { items, isLoading };
}