import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { subMonths, subYears, startOfYear, format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, subQuarters } from 'date-fns';

// ─── QuickBooks Report JSON types ──────────────────────────────
interface QBColData {
  value: string;
  id?: string;
}

interface QBDataRow {
  type: 'Data';
  ColData: QBColData[];
}

interface QBSectionRow {
  type: 'Section';
  group?: string;
  Header?: { ColData: QBColData[] };
  Rows?: { Row: QBReportRow[] };
  Summary?: { ColData: QBColData[] };
}

type QBReportRow = QBDataRow | QBSectionRow;

interface QBReportHeader {
  ReportName: string;
  StartPeriod: string;
  EndPeriod: string;
  ReportBasis: string;
  Currency: string;
}

interface QBReport {
  Header: QBReportHeader;
  Rows: { Row: QBReportRow[] };
}

// ─── Parsed P&L types ──────────────────────────────────────────
export interface PLLineItem {
  id?: string;
  name: string;
  amount: number;
  depth: number;
  isTotal: boolean;
  isHeader: boolean;
  children?: PLLineItem[];
}

export interface PLSection {
  group: string;
  label: string;
  amount: number;
  items: PLLineItem[];
}

export interface ParsedPL {
  header: QBReportHeader;
  sections: PLSection[];
  totalIncome: number;
  totalCOGS: number;
  grossProfit: number;
  totalExpenses: number;
  netOperatingIncome: number;
  netIncome: number;
  realmId: string;
  reportDate: string;
  periodStart: string;
  periodEnd: string;
}

// ─── Parser ────────────────────────────────────────────────────
function parseRowsRecursive(rows: QBReportRow[], depth: number): PLLineItem[] {
  if (!rows || !Array.isArray(rows)) return [];

  const items: PLLineItem[] = [];

  for (const row of rows) {
    if (row.type === 'Data') {
      const colData = row.ColData;
      if (colData && colData.length >= 2) {
        items.push({
          id: colData[0].id,
          name: colData[0].value,
          amount: parseFloat(colData[1].value) || 0,
          depth,
          isTotal: false,
          isHeader: false,
        });
      }
    } else if (row.type === 'Section') {
      const section = row as QBSectionRow;

      // Header line
      if (section.Header?.ColData?.[0]?.value) {
        const headerItem: PLLineItem = {
          id: section.Header.ColData[0].id,
          name: section.Header.ColData[0].value,
          amount: 0,
          depth,
          isTotal: false,
          isHeader: true,
          children: [],
        };

        // Child rows
        if (section.Rows?.Row) {
          headerItem.children = parseRowsRecursive(section.Rows.Row, depth + 1);
        }

        // Summary/total line
        if (section.Summary?.ColData?.[1]?.value) {
          headerItem.amount = parseFloat(section.Summary.ColData[1].value) || 0;
          headerItem.children?.push({
            name: section.Summary.ColData[0].value,
            amount: parseFloat(section.Summary.ColData[1].value) || 0,
            depth: depth + 1,
            isTotal: true,
            isHeader: false,
          });
        }

        items.push(headerItem);
      } else if (section.Summary?.ColData) {
        // Summary-only section (like Gross Profit, Net Income)
        items.push({
          name: section.Summary.ColData[0].value,
          amount: parseFloat(section.Summary.ColData[1]?.value) || 0,
          depth,
          isTotal: true,
          isHeader: false,
        });
      }
    }
  }

  return items;
}

function parseQBProfitAndLoss(report: QBReport, realmId: string, reportDate: string, periodStart: string, periodEnd: string): ParsedPL {
  const topLevelRows = report.Rows?.Row || [];
  const sections: PLSection[] = [];

  let totalIncome = 0;
  let totalCOGS = 0;
  let grossProfit = 0;
  let totalExpenses = 0;
  let netOperatingIncome = 0;
  let netIncome = 0;

  for (const row of topLevelRows) {
    if (row.type !== 'Section') continue;
    const section = row as QBSectionRow;
    const group = section.group || '';
    const summaryLabel = section.Summary?.ColData?.[0]?.value || group;
    const summaryAmount = parseFloat(section.Summary?.ColData?.[1]?.value || '0') || 0;

    let items: PLLineItem[] = [];
    if (section.Rows?.Row) {
      items = parseRowsRecursive(section.Rows.Row, 0);
    }

    // If it's a summary-only row (like Gross Profit)
    if (!section.Header && !section.Rows && section.Summary) {
      items = [{
        name: summaryLabel,
        amount: summaryAmount,
        depth: 0,
        isTotal: true,
        isHeader: false,
      }];
    }

    sections.push({
      group,
      label: summaryLabel,
      amount: summaryAmount,
      items,
    });

    switch (group) {
      case 'Income': totalIncome = summaryAmount; break;
      case 'COGS': totalCOGS = summaryAmount; break;
      case 'GrossProfit': grossProfit = summaryAmount; break;
      case 'Expenses': totalExpenses = summaryAmount; break;
      case 'NetOperatingIncome': netOperatingIncome = summaryAmount; break;
      case 'NetIncome': netIncome = summaryAmount; break;
    }
  }

  return {
    header: report.Header,
    sections,
    totalIncome,
    totalCOGS,
    grossProfit,
    totalExpenses,
    netOperatingIncome,
    netIncome,
    realmId,
    reportDate,
    periodStart: periodStart || report.Header?.StartPeriod,
    periodEnd: periodEnd || report.Header?.EndPeriod,
  };
}

// Convert UI dateRange string to start/end date strings
export function dateRangeToDates(dateRange?: string): { start_date: string; end_date: string } | null {
  if (!dateRange) return null;
  const now = new Date();
  let start: Date;
  const end = endOfMonth(now);

  switch (dateRange) {
    case '3m':
      start = startOfMonth(subMonths(now, 2));
      break;
    case '6m':
      start = startOfMonth(subMonths(now, 5));
      break;
    case '12m':
      start = startOfMonth(subMonths(now, 11));
      break;
    case 'ytd':
      start = startOfYear(now);
      break;
    default:
      // Support custom_YYYY-MM-DD_YYYY-MM-DD format
      if (dateRange.startsWith('custom_')) {
        const parts = dateRange.replace('custom_', '').split('_');
        if (parts.length === 2) {
          return { start_date: parts[0], end_date: parts[1] };
        }
      }
      return null;
  }
  return {
    start_date: format(start, 'yyyy-MM-dd'),
    end_date: format(end, 'yyyy-MM-dd'),
  };
}

// Compute comparison date range based on mode and current dateRange
export function getComparisonDateRange(
  dateRange: string | undefined,
  comparisonMode: 'budget' | 'prior_year' | 'prior_period'
): { start_date: string; end_date: string } | null {
  const dates = dateRangeToDates(dateRange);
  if (!dates) return null;

  const startDate = new Date(dates.start_date);
  const endDate = new Date(dates.end_date);

  if (comparisonMode === 'prior_year') {
    return {
      start_date: format(subYears(startDate, 1), 'yyyy-MM-dd'),
      end_date: format(subYears(endDate, 1), 'yyyy-MM-dd'),
    };
  }

  if (comparisonMode === 'prior_period') {
    // Shift back by the same number of months
    const diffMs = endDate.getTime() - startDate.getTime();
    const diffMonths = Math.round(diffMs / (1000 * 60 * 60 * 24 * 30));
    const priorEnd = subMonths(startDate, 1);
    const priorStart = subMonths(startDate, diffMonths);
    return {
      start_date: format(startOfMonth(priorStart), 'yyyy-MM-dd'),
      end_date: format(endOfMonth(priorEnd), 'yyyy-MM-dd'),
    };
  }

  // 'budget' — no QB comparison data available
  return null;
}

// ─── Hook ──────────────────────────────────────────────────────
export function useQBProfitAndLoss(realmId?: string | null, dateRange?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const dates = dateRangeToDates(dateRange);

  // Sync mutation: re-fetch from QuickBooks with specific date params
  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!dates) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const body: Record<string, string> = {
        syncType: 'profit_and_loss',
        ...(realmId && realmId !== 'all' ? { realmId } : {}),
        start_date: dates.start_date,
        end_date: dates.end_date,
      };

      const res = await supabase.functions.invoke('quickbooks-sync', { body });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qb-profit-and-loss'] });
    },
  });

  const query = useQuery({
    queryKey: ['qb-profit-and-loss', user?.id, realmId, dates?.start_date, dates?.end_date],
    queryFn: async () => {
      let q = supabase
        .from('quickbooks_reports')
        .select('*')
        .eq('report_type', 'profit_and_loss')
        .order('synced_at', { ascending: false });

      if (realmId && realmId !== 'all') {
        q = q.eq('realm_id', realmId);
      }

      // Filter by matching period dates if provided
      if (dates) {
        q = q.eq('period_start', dates.start_date).eq('period_end', dates.end_date);
      }

      const { data, error } = await q;
      if (error) throw error;

      // If no matching data found for this date range, trigger a sync
      if ((!data || data.length === 0) && dates) {
        // Return null to show loading; the effect below will trigger sync
        return null;
      }

      if (!data || data.length === 0) return null;

      if (realmId === 'all' || !realmId) {
        const byRealm = new Map<string, typeof data[0]>();
        for (const row of data) {
          if (!byRealm.has(row.realm_id)) {
            byRealm.set(row.realm_id, row);
          }
        }
        return Array.from(byRealm.values()).map(row =>
          parseQBProfitAndLoss(
            row.report_data as unknown as QBReport,
            row.realm_id,
            row.report_date || '',
            row.period_start || '',
            row.period_end || '',
          )
        );
      }

      const row = data[0];
      return [parseQBProfitAndLoss(
        row.report_data as unknown as QBReport,
        row.realm_id,
        row.report_date || '',
        row.period_start || '',
        row.period_end || '',
      )];
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  return {
    ...query,
    syncForDateRange: syncMutation.mutateAsync,
    isSyncing: syncMutation.isPending,
  };
}
