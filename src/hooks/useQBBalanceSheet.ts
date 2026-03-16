import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { dateRangeToDates, getComparisonDateRange } from './useQBProfitAndLoss';

// ─── Types ─────────────────────────────────────────────────────
interface QBColData { value: string; id?: string }
interface QBDataRow { type: 'Data'; ColData: QBColData[] }
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

export interface BSLineItem {
  name: string;
  amount: number;
  depth: number;
  isHeader: boolean;
  isTotal: boolean;
  children?: BSLineItem[];
}

export interface BSSection {
  group: string;
  label: string;
  amount: number;
  items: BSLineItem[];
}

export interface ParsedBS {
  header: QBReportHeader;
  sections: BSSection[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  realmId: string;
  periodEnd: string;
}

// ─── Parser ────────────────────────────────────────────────────
function parseRowsRecursive(rows: QBReportRow[], depth: number): BSLineItem[] {
  if (!rows || !Array.isArray(rows)) return [];
  const items: BSLineItem[] = [];

  for (const row of rows) {
    if (row.type === 'Data') {
      const colData = row.ColData;
      if (colData && colData.length >= 2) {
        items.push({
          name: colData[0].value,
          amount: parseFloat(colData[1].value) || 0,
          depth,
          isTotal: false,
          isHeader: false,
        });
      }
    } else if (row.type === 'Section') {
      const section = row as QBSectionRow;
      if (section.Header?.ColData?.[0]?.value) {
        const headerItem: BSLineItem = {
          name: section.Header.ColData[0].value,
          amount: 0,
          depth,
          isTotal: false,
          isHeader: true,
          children: [],
        };
        if (section.Rows?.Row) {
          headerItem.children = parseRowsRecursive(section.Rows.Row, depth + 1);
        }
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

function parseQBBalanceSheet(report: QBReport, realmId: string, periodEnd: string): ParsedBS {
  const topLevelRows = report.Rows?.Row || [];
  const sections: BSSection[] = [];
  let totalAssets = 0, totalLiabilities = 0, totalEquity = 0;

  for (const row of topLevelRows) {
    if (row.type !== 'Section') continue;
    const section = row as QBSectionRow;
    const group = section.group || '';
    const summaryLabel = section.Summary?.ColData?.[0]?.value || group;
    const summaryAmount = parseFloat(section.Summary?.ColData?.[1]?.value || '0') || 0;

    let items: BSLineItem[] = [];
    if (section.Rows?.Row) {
      items = parseRowsRecursive(section.Rows.Row, 0);
    }
    if (!section.Header && !section.Rows && section.Summary) {
      items = [{
        name: summaryLabel,
        amount: summaryAmount,
        depth: 0,
        isTotal: true,
        isHeader: false,
      }];
    }

    sections.push({ group, label: summaryLabel, amount: summaryAmount, items });

    if (group === 'TotalAssets' || group === 'Assets') totalAssets = summaryAmount;
    if (group === 'TotalLiabilities' || group === 'Liabilities') totalLiabilities = summaryAmount;
    if (group === 'TotalEquity' || group === 'Equity') totalEquity = summaryAmount;
  }

  return { header: report.Header, sections, totalAssets, totalLiabilities, totalEquity, realmId, periodEnd };
}

// ─── Hook ──────────────────────────────────────────────────────
export function useQBBalanceSheet(realmId?: string | null, dateRange?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const dates = dateRangeToDates(dateRange);

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!dates) return;
      const res = await supabase.functions.invoke('quickbooks-sync', {
        body: {
          syncType: 'balance_sheet',
          ...(realmId && realmId !== 'all' ? { realmId } : {}),
          start_date: dates.end_date,
          end_date: dates.end_date,
        },
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qb-balance-sheet'] });
    },
  });

  const query = useQuery({
    queryKey: ['qb-balance-sheet', user?.id, realmId, dates?.end_date],
    queryFn: async () => {
      let q = supabase
        .from('quickbooks_reports')
        .select('*')
        .eq('report_type', 'balance_sheet')
        .order('synced_at', { ascending: false });

      if (realmId && realmId !== 'all') {
        q = q.eq('realm_id', realmId);
      }
      if (dates) {
        q = q.eq('period_end', dates.end_date);
      }

      const { data, error } = await q;
      if (error) throw error;

      if ((!data || data.length === 0) && dates) return null;
      if (!data || data.length === 0) return null;

      if (realmId === 'all' || !realmId) {
        const byRealm = new Map<string, typeof data[0]>();
        for (const row of data) {
          if (!byRealm.has(row.realm_id)) byRealm.set(row.realm_id, row);
        }
        return Array.from(byRealm.values()).map(row =>
          parseQBBalanceSheet(row.report_data as unknown as QBReport, row.realm_id, row.period_end || '')
        );
      }

      const row = data[0];
      return [parseQBBalanceSheet(row.report_data as unknown as QBReport, row.realm_id, row.period_end || '')];
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  return { ...query, syncForDateRange: syncMutation.mutateAsync, isSyncing: syncMutation.isPending };
}
