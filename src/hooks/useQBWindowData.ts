import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { type TimeWindow } from '@/components/widget-editor/widgetTypes';

/** Compute date range from a TimeWindow — same logic as useQBPreviewData */
function getDateRange(window: TimeWindow): { start: string; end: string } | null {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (window) {
    case 'mtd':
      return { start: `${year}-${String(month + 1).padStart(2, '0')}-01`, end: now.toISOString().slice(0, 10) };
    case 'lastMonth': {
      const lm = month === 0 ? 11 : month - 1;
      const ly = month === 0 ? year - 1 : year;
      const lastDay = new Date(ly, lm + 1, 0).getDate();
      return { start: `${ly}-${String(lm + 1).padStart(2, '0')}-01`, end: `${ly}-${String(lm + 1).padStart(2, '0')}-${lastDay}` };
    }
    case 'qtd': {
      const qStart = Math.floor(month / 3) * 3;
      return { start: `${year}-${String(qStart + 1).padStart(2, '0')}-01`, end: now.toISOString().slice(0, 10) };
    }
    case 'lastQuarter': {
      const curQ = Math.floor(month / 3);
      const prevQ = curQ === 0 ? 3 : curQ - 1;
      const pqYear = curQ === 0 ? year - 1 : year;
      const pqStart = prevQ * 3;
      const pqEnd = new Date(pqYear, pqStart + 3, 0);
      return { start: `${pqYear}-${String(pqStart + 1).padStart(2, '0')}-01`, end: pqEnd.toISOString().slice(0, 10) };
    }
    case 'ytd':
      return { start: `${year}-01-01`, end: now.toISOString().slice(0, 10) };
    case 'lastYear':
      return { start: `${year - 1}-01-01`, end: `${year - 1}-12-31` };
    case 'ttm':
    case 'last12Months': {
      const s = new Date(now); s.setMonth(s.getMonth() - 12);
      return { start: s.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    }
    case 'last6Months': {
      const s = new Date(now); s.setMonth(s.getMonth() - 6);
      return { start: s.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    }
    case 'last3Months': {
      const s = new Date(now); s.setMonth(s.getMonth() - 3);
      return { start: s.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    }
    case 'all':
    case 'custom':
    default:
      return null;
  }
}

export interface QBWindowDataPoint {
  period: string;
  amount: number;
}

/**
 * Query QuickBooks invoices (revenue) for a given time window and optional realmId,
 * aggregated by month. Uses same date range logic as the widget editor's useQBPreviewData.
 */
export function useQBRevenueByWindow(window: TimeWindow, realmId?: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['qb-revenue-window', user?.id, window, realmId],
    queryFn: async () => {
      const dateRange = getDateRange(window);

      let query = supabase
        .from('quickbooks_invoices')
        .select('txn_date, total_amt')
        .order('txn_date', { ascending: true });

      if (realmId) {
        query = query.eq('realm_id', realmId);
      }
      if (dateRange) {
        query = query.gte('txn_date', dateRange.start).lte('txn_date', dateRange.end);
      }

      const { data: rows, error } = await query;
      if (error) throw error;

      // Aggregate by month
      const periodMap = new Map<string, { label: string; amount: number }>();
      for (const row of rows ?? []) {
        if (!row.txn_date) continue;
        const d = new Date(row.txn_date + 'T00:00:00');
        const key = row.txn_date.slice(0, 7); // YYYY-MM
        const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        const existing = periodMap.get(key);
        if (existing) {
          existing.amount += row.total_amt ?? 0;
        } else {
          periodMap.set(key, { label, amount: row.total_amt ?? 0 });
        }
      }

      const sorted = Array.from(periodMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, v]) => ({ period: v.label, amount: v.amount }));

      const total = sorted.reduce((s, r) => s + r.amount, 0);

      return { periods: sorted, total };
    },
    enabled: !!user,
    staleTime: 60_000,
  });
}
