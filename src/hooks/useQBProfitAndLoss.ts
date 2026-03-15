import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

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

// ─── Hook ──────────────────────────────────────────────────────
export function useQBProfitAndLoss(realmId?: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['qb-profit-and-loss', user?.id, realmId],
    queryFn: async () => {
      let query = supabase
        .from('quickbooks_reports')
        .select('*')
        .eq('report_type', 'profit_and_loss')
        .order('synced_at', { ascending: false });

      if (realmId && realmId !== 'all') {
        query = query.eq('realm_id', realmId);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) return null;

      if (realmId === 'all') {
        // Group by realm, take latest for each
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

      // Single entity — latest report
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
    staleTime: 10_000,
  });
}
