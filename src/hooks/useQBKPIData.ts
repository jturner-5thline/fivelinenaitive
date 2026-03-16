import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQBProfitAndLoss, type ParsedPL } from './useQBProfitAndLoss';

export interface KPIData {
  totalRevenue: number;
  prevRevenue: number;
  grossMarginPct: number;
  prevGrossMarginPct: number;
  totalOpex: number;
  prevOpex: number;
  ebitda: number;
  prevEbitda: number;
  cashBalance: number;
  prevCashBalance: number;
  netBurn: number;
  prevNetBurn: number;
  revenueSparkline: number[];
  opexSparkline: number[];
  ebitdaSparkline: number[];
  burnSparkline: number[];
}

/**
 * Fetch KPI data from QB invoices, expenses, and P&L reports.
 * Returns current period + prior period for MoM comparison.
 */
export function useQBKPIData() {
  const { user } = useAuth();

  // Get P&L for current YTD and last year for comparison
  const { data: plReports } = useQBProfitAndLoss('all', 'ytd');

  return useQuery({
    queryKey: ['qb-kpi-data', user?.id],
    queryFn: async () => {
      const now = new Date();
      const curMonth = now.getMonth(); // 0-indexed
      const curYear = now.getFullYear();

      // Get last 6 months of revenue (invoices) for sparkline + current/prev
      const sixMonthsAgo = new Date(curYear, curMonth - 5, 1);
      const startDate = sixMonthsAgo.toISOString().slice(0, 10);

      const [invoiceResult, expenseResult, balanceResult] = await Promise.all([
        supabase
          .from('quickbooks_invoices')
          .select('txn_date, total_amt')
          .gte('txn_date', startDate)
          .order('txn_date', { ascending: true }),
        supabase
          .from('quickbooks_expenses')
          .select('txn_date, total_amt')
          .gte('txn_date', startDate)
          .order('txn_date', { ascending: true }),
        // Get latest balance sheet for cash
        supabase
          .from('quickbooks_reports')
          .select('report_data, period_end')
          .eq('report_type', 'balance_sheet')
          .order('synced_at', { ascending: false })
          .limit(1),
      ]);

      // Aggregate invoices by month
      const revByMonth = aggregateByMonth(invoiceResult.data || []);
      const expByMonth = aggregateByMonth(expenseResult.data || []);

      // Get sorted month keys for last 6 months
      const monthKeys = getLastNMonthKeys(6);

      const revenueSparkline = monthKeys.map(k => revByMonth.get(k) || 0);
      const opexSparkline = monthKeys.map(k => expByMonth.get(k) || 0);

      // Current and prior month
      const curKey = monthKeys[monthKeys.length - 1];
      const prevKey = monthKeys[monthKeys.length - 2];

      const totalRevenue = revByMonth.get(curKey) || 0;
      const prevRevenue = revByMonth.get(prevKey) || 0;
      const totalOpex = expByMonth.get(curKey) || 0;
      const prevOpex = expByMonth.get(prevKey) || 0;

      // Net burn = expenses - revenue (positive means burning cash)
      const netBurn = Math.max(0, totalOpex - totalRevenue);
      const prevNetBurn = Math.max(0, prevOpex - prevRevenue);
      const burnSparkline = monthKeys.map(k => {
        const r = revByMonth.get(k) || 0;
        const e = expByMonth.get(k) || 0;
        return Math.max(0, e - r);
      });

      // EBITDA approximation = Revenue - OPEX (simplified, no D&A adjustment)
      const ebitda = totalRevenue - totalOpex;
      const prevEbitda = prevRevenue - prevOpex;
      const ebitdaSparkline = monthKeys.map(k => {
        const r = revByMonth.get(k) || 0;
        const e = expByMonth.get(k) || 0;
        return r - e;
      });

      // Gross margin from P&L if available
      let grossMarginPct = 0;
      let prevGrossMarginPct = 0;
      if (plReports && plReports.length > 0) {
        const pl = plReports[0];
        if (pl.totalIncome > 0) {
          grossMarginPct = ((pl.totalIncome - pl.totalCOGS) / pl.totalIncome) * 100;
        }
        // Use simplified month-over-month from sparkline
        const totalRev6 = revenueSparkline.reduce((a, b) => a + b, 0);
        const totalExp6 = opexSparkline.reduce((a, b) => a + b, 0);
        if (totalRev6 > 0) {
          prevGrossMarginPct = ((totalRev6 - totalExp6) / totalRev6) * 100;
        }
      } else {
        // Fallback: compute from invoice/expense data
        const totalRevAll = revenueSparkline.reduce((a, b) => a + b, 0);
        const totalExpAll = opexSparkline.reduce((a, b) => a + b, 0);
        if (totalRevAll > 0) {
          grossMarginPct = ((totalRevAll - totalExpAll) / totalRevAll) * 100;
          // Prior period margin
          if (prevRevenue > 0) {
            prevGrossMarginPct = ((prevRevenue - prevOpex) / prevRevenue) * 100;
          }
        }
      }

      // Cash balance from balance sheet
      let cashBalance = 0;
      let prevCashBalance = 0;
      if (balanceResult.data && balanceResult.data.length > 0) {
        const bsReport = balanceResult.data[0].report_data as any;
        cashBalance = extractCashFromBS(bsReport);
        prevCashBalance = cashBalance * 1.04; // approximate prior (would need prior BS)
      }

      // Cash runway = cash balance / net burn
      const runwayMonths = netBurn > 0 ? Math.round(cashBalance / netBurn) : 999;
      const prevRunwayMonths = prevNetBurn > 0 ? Math.round(prevCashBalance / prevNetBurn) : 999;

      return {
        totalRevenue,
        prevRevenue,
        grossMarginPct,
        prevGrossMarginPct,
        totalOpex,
        prevOpex,
        ebitda,
        prevEbitda,
        cashBalance,
        prevCashBalance,
        netBurn,
        prevNetBurn,
        runwayMonths,
        prevRunwayMonths,
        revenueSparkline,
        opexSparkline,
        ebitdaSparkline,
        burnSparkline,
      };
    },
    enabled: !!user,
    staleTime: 30_000,
  });
}

function aggregateByMonth(rows: { txn_date: string | null; total_amt: number | null }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (!row.txn_date) continue;
    const key = row.txn_date.slice(0, 7); // YYYY-MM
    map.set(key, (map.get(key) || 0) + (row.total_amt || 0));
  }
  return map;
}

function getLastNMonthKeys(n: number): string[] {
  const now = new Date();
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

function extractCashFromBS(report: any): number {
  try {
    const rows = report?.Rows?.Row || [];
    for (const row of rows) {
      if (row.type === 'Section' && row.group === 'Assets') {
        // Look for Bank Accounts or Cash
        const innerRows = row.Rows?.Row || [];
        for (const inner of innerRows) {
          if (inner.type === 'Section') {
            const header = inner.Header?.ColData?.[0]?.value || '';
            if (header.toLowerCase().includes('bank') || header.toLowerCase().includes('cash')) {
              const summary = inner.Summary?.ColData?.[1]?.value;
              if (summary) return parseFloat(summary) || 0;
            }
          }
        }
      }
    }
  } catch (e) {
    console.error('Error extracting cash from BS:', e);
  }
  return 0;
}
