import { useState, useMemo, useEffect } from 'react';
import { SaaSModelData } from './types';
import { SpreadsheetTable, RowDef, ViewMode } from './SpreadsheetTable';
import { TrendingUp, TrendingDown, DollarSign, Percent } from 'lucide-react';
import { fmtCurrency, fmtPct } from './formatters';
import { cn } from '@/lib/utils';
import { Toggle } from '@/components/ui/toggle';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { generateMonths } from './calculations';
import type { MonthEntry } from './types';
import { useFinancialComments } from '@/hooks/useFinancialComments';

interface Props {
  model: SaaSModelData;
  dealId?: string;
}

/* ── KPI Card — aligned with mapping-theme surface system ── */
function KpiCard({ label, value, delta, format, icon: Icon }: {
  label: string;
  value: number;
  delta?: number;
  format: 'currency' | 'pct';
  icon: React.ElementType;
}) {
  const formatted = format === 'currency' ? fmtCurrency(value) : fmtPct(value);
  const hasDelta = delta !== undefined && delta !== 0;
  const isPositive = (delta ?? 0) > 0;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
          <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
        </div>
        <div className="text-lg font-bold tabular-nums tracking-[-0.01em] text-foreground">{formatted}</div>
        {hasDelta && (
          <div className={cn(
            "flex items-center gap-1 mt-1.5 text-[10px] font-medium",
            isPositive ? "text-emerald-400" : "text-destructive"
          )}>
            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {isPositive ? '+' : ''}{delta!.toFixed(1)}% MoM
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Account key to model path mapping (reverse of getFieldPath)
const ACCOUNT_KEY_MAP: Record<string, { section: string; field: string }> = {
  'revenue.recurring': { section: 'revenue', field: 'recurring' },
  'revenue.nonRecurring': { section: 'revenue', field: 'nonRecurring' },
  'revenue.other': { section: 'revenue', field: 'other' },
  'cogs.onRecurring': { section: 'cogs', field: 'onRecurring' },
  'cogs.onNonRecurring': { section: 'cogs', field: 'onNonRecurring' },
  'cogs.labor': { section: 'cogs', field: 'labor' },
  'opex.salaries': { section: 'opex', field: 'salaries' },
  'opex.salesMarketing': { section: 'opex', field: 'salesMarketing' },
  'opex.rnd': { section: 'opex', field: 'rnd' },
  'opex.professionalFees': { section: 'opex', field: 'professionalFees' },
  'opex.gna': { section: 'opex', field: 'gna' },
  'interestExpense': { section: 'root', field: 'interestExpense' },
  'interestIncome': { section: 'root', field: 'interestIncome' },
  'depreciation': { section: 'root', field: 'depreciation' },
  'otherExpense': { section: 'root', field: 'otherExpense' },
  'taxExpense': { section: 'root', field: 'taxExpense' },
};

interface FinancialDataRow {
  year_month: string;
  account_key: string;
  account_label: string;
  value: number;
  source_file_id: string;
}

export function SaaSModelIncomeStatement({ model, dealId }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('monthly');
  const [showVariance, setShowVariance] = useState(false);
  const [compactCurrency, setCompactCurrency] = useState(true);
  const [financialData, setFinancialData] = useState<FinancialDataRow[]>([]);
  const [fileNames, setFileNames] = useState<Record<string, string>>({});
  const {
    comments: financialComments,
    addComment,
    deleteComment,
    getCommentsForAnchor,
    getCommentCountForRow,
  } = useFinancialComments(dealId || '');

  // Load multi-file financial data
  useEffect(() => {
    if (!dealId) return;
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from('deal_financial_data' as any)
        .select('year_month, account_key, account_label, value, source_file_id')
        .eq('deal_id', dealId)
        .order('year_month');
      if (!cancelled && data) {
        setFinancialData(data as any as FinancialDataRow[]);
        const fileIds = [...new Set((data as any[]).map(r => r.source_file_id))];
        if (fileIds.length > 0) {
          const { data: files } = await supabase
            .from('deal_financial_files' as any)
            .select('id, file_name')
            .in('id', fileIds);
          if (files) {
            const map: Record<string, string> = {};
            (files as any[]).forEach(f => { map[f.id] = f.file_name; });
            if (!cancelled) setFileNames(map);
          }
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [dealId]);

  // Build merged model data from financial data if available
  const mergedData = useMemo(() => {
    if (financialData.length === 0) return null;

    const yearMonths = [...new Set(financialData.map(r => r.year_month))].sort();
    if (yearMonths.length === 0) return null;

    const firstYm = yearMonths[0];
    const lastYm = yearMonths[yearMonths.length - 1];
    const [firstYear, firstMonth] = firstYm.split('-').map(Number);
    const [lastYear, lastMonth] = lastYm.split('-').map(Number);
    const totalMonths = (lastYear - firstYear) * 12 + (lastMonth - firstMonth) + 1;
    const monthCount = Math.min(Math.max(totalMonths, 12), 48);

    const months = generateMonths(firstYear, firstMonth).slice(0, monthCount);
    while (months.length < monthCount) {
      const prev = months[months.length - 1];
      const nextMonth = prev.month === 12 ? 1 : prev.month + 1;
      const nextYear = prev.month === 12 ? prev.year + 1 : prev.year;
      const names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const short = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      months.push({
        date: new Date(nextYear, nextMonth - 1, 1).toISOString(),
        label: `${short[nextMonth - 1]} '${String(nextYear).slice(2)}`,
        fullLabel: `${names[nextMonth - 1]} ${nextYear}`,
        year: nextYear,
        month: nextMonth,
        isActual: true,
      });
    }

    const zeros = () => new Array(monthCount).fill(0);
    const arrays: Record<string, number[]> = {};
    const sources: Record<string, Record<number, string>> = {};

    financialData.forEach(row => {
      const [y, m] = row.year_month.split('-').map(Number);
      const idx = (y - firstYear) * 12 + (m - firstMonth);
      if (idx < 0 || idx >= monthCount) return;
      if (!arrays[row.account_key]) {
        arrays[row.account_key] = zeros();
        sources[row.account_key] = {};
      }
      arrays[row.account_key][idx] = row.value;
      sources[row.account_key][idx] = row.source_file_id;
    });

    const get = (key: string) => arrays[key] || zeros();

    const revenue = {
      recurring: get('revenue.recurring'),
      nonRecurring: get('revenue.nonRecurring'),
      other: get('revenue.other'),
    };
    const totalRevenue = months.map((_, i) => revenue.recurring[i] + revenue.nonRecurring[i] + revenue.other[i]);

    const cogs = {
      onRecurring: get('cogs.onRecurring'),
      onNonRecurring: get('cogs.onNonRecurring'),
      labor: get('cogs.labor'),
    };
    const totalCOGS = months.map((_, i) => cogs.onRecurring[i] + cogs.onNonRecurring[i] + cogs.labor[i]);
    const grossProfit = months.map((_, i) => totalRevenue[i] - totalCOGS[i]);
    const grossMarginPct = months.map((_, i) => totalRevenue[i] ? (grossProfit[i] / totalRevenue[i]) * 100 : 0);

    const opex = {
      salaries: get('opex.salaries'),
      salesMarketing: get('opex.salesMarketing'),
      rnd: get('opex.rnd'),
      professionalFees: get('opex.professionalFees'),
      gna: get('opex.gna'),
    };
    const totalOpEx = months.map((_, i) => opex.salaries[i] + opex.salesMarketing[i] + opex.rnd[i] + opex.professionalFees[i] + opex.gna[i]);
    const operatingIncome = months.map((_, i) => grossProfit[i] - totalOpEx[i]);
    const operatingMarginPct = months.map((_, i) => totalRevenue[i] ? (operatingIncome[i] / totalRevenue[i]) * 100 : 0);

    const interestExpense = get('interestExpense');
    const interestIncome = get('interestIncome');
    const depreciation = get('depreciation');
    const otherExpense = get('otherExpense');
    const taxExpense = get('taxExpense');
    const ebitda = months.map((_, i) => operatingIncome[i] + depreciation[i]);
    const netIncome = months.map((_, i) => ebitda[i] - interestExpense[i] + interestIncome[i] - otherExpense[i] - taxExpense[i]);

    return {
      months,
      revenue, totalRevenue,
      cogs, totalCOGS,
      grossProfit, grossMarginPct,
      opex, totalOpEx,
      operatingIncome, operatingMarginPct,
      interestExpense, interestIncome, depreciation, otherExpense,
      ebitda, taxExpense, netIncome,
      sources,
    };
  }, [financialData]);

  const displayData = mergedData || model;
  const displayMonths = mergedData?.months || model.months;

  const kpis = useMemo(() => {
    const rev = displayData.totalRevenue;
    const len = rev.length;
    if (len === 0) return null;
    const lastIdx = len - 1;
    const prevIdx = lastIdx - 1;

    const revVal = rev[lastIdx] ?? 0;
    const prevRev = prevIdx >= 0 ? (rev[prevIdx] ?? 0) : 0;
    const revDelta = prevRev !== 0 ? ((revVal - prevRev) / Math.abs(prevRev)) * 100 : 0;

    const gm = displayData.grossMarginPct[lastIdx] ?? 0;
    const prevGm = prevIdx >= 0 ? (displayData.grossMarginPct[prevIdx] ?? 0) : 0;
    const gmDelta = prevGm !== 0 ? gm - prevGm : 0;

    const oi = displayData.operatingIncome[lastIdx] ?? 0;
    const prevOi = prevIdx >= 0 ? (displayData.operatingIncome[prevIdx] ?? 0) : 0;
    const oiDelta = prevOi !== 0 ? ((oi - prevOi) / Math.abs(prevOi)) * 100 : 0;

    const ni = displayData.netIncome[lastIdx] ?? 0;
    const prevNi = prevIdx >= 0 ? (displayData.netIncome[prevIdx] ?? 0) : 0;
    const niDelta = prevNi !== 0 ? ((ni - prevNi) / Math.abs(prevNi)) * 100 : 0;

    return { rev: revVal, revDelta, gm, gmDelta, oi, oiDelta, ni, niDelta };
  }, [displayData]);

  const rows: RowDef[] = [
    { key: 'sec-revenue', label: 'REVENUE', values: [], isSection: true },
    { key: 'recurring-rev', label: 'Recurring Revenue', values: displayData.revenue.recurring },
    { key: 'non-recurring-rev', label: 'Non-Recurring Revenue', values: displayData.revenue.nonRecurring },
    { key: 'other-rev', label: 'Other Revenue', values: displayData.revenue.other },
    { key: 'total-rev', label: 'Total Revenue', values: displayData.totalRevenue, isTotal: true, formula: 'SUM(Recurring + Non-Recurring + Other)' },
    { key: 'sec-cogs', label: 'COST OF GOODS SOLD', values: [], isSection: true },
    { key: 'cogs-recurring', label: 'COGS on Recurring', values: displayData.cogs.onRecurring },
    { key: 'cogs-nonrecurring', label: 'COGS on Non-Recurring', values: displayData.cogs.onNonRecurring },
    { key: 'cogs-labor', label: 'COGS — Labor', values: displayData.cogs.labor },
    { key: 'total-cogs', label: 'Total COGS', values: displayData.totalCOGS, isTotal: true, formula: 'SUM(COGS items)' },
    { key: 'gross-profit', label: 'Gross Profit', values: displayData.grossProfit, isSubtotal: true, formula: 'Total Revenue - Total COGS' },
    { key: 'gross-margin-pct', label: '% Gross Margin', values: displayData.grossMarginPct, isPct: true, formula: 'Gross Profit / Total Revenue' },
    { key: 'sec-opex', label: 'OPERATING EXPENSES', values: [], isSection: true },
    { key: 'salaries', label: 'Salaries & Benefits', values: displayData.opex.salaries },
    { key: 'sales-marketing', label: 'Sales & Marketing', values: displayData.opex.salesMarketing },
    { key: 'rnd', label: 'R&D', values: displayData.opex.rnd },
    { key: 'prof-fees', label: 'Professional Fees', values: displayData.opex.professionalFees },
    { key: 'gna', label: 'G&A', values: displayData.opex.gna },
    { key: 'total-opex', label: 'Total OpEx', values: displayData.totalOpEx, isTotal: true, formula: 'SUM(OpEx items)' },
    { key: 'op-income', label: 'Operating Income / EBIT', values: displayData.operatingIncome, isSubtotal: true, formula: 'Gross Profit - Total OpEx' },
    { key: 'op-margin-pct', label: '% Operating Margin', values: displayData.operatingMarginPct, isPct: true, formula: 'Operating Income / Total Revenue' },
    { key: 'sec-da', label: 'D&A ADD-BACKS', values: [], isSection: true },
    { key: 'depreciation', label: 'Depreciation', values: displayData.depreciation },
    { key: 'ebitda', label: 'EBITDA', values: displayData.ebitda, isSubtotal: true, formula: 'Operating Income + Depreciation' },
    { key: 'sec-non-op', label: 'NON-OPERATING ITEMS', values: [], isSection: true },
    { key: 'int-expense', label: 'Interest Expense', values: displayData.interestExpense },
    { key: 'int-income', label: 'Interest Income', values: displayData.interestIncome },
    { key: 'other-expense', label: 'Other Expense', values: displayData.otherExpense },
    { key: 'tax-expense', label: 'Tax Expense', values: displayData.taxExpense },
    { key: 'net-income', label: 'Net Income', values: displayData.netIncome, isTotal: true, formula: 'EBITDA - Interest + Other - Tax' },
  ];

  return (
    <div className="space-y-3 mapping-workbench">
      {/* Summary KPI Cards */}
      {kpis && (
        <div className="grid grid-cols-4 gap-3">
          <KpiCard label="Total Revenue" value={kpis.rev} delta={kpis.revDelta} format="currency" icon={DollarSign} />
          <KpiCard label="Gross Margin" value={kpis.gm} delta={kpis.gmDelta} format="pct" icon={Percent} />
          <KpiCard label="Operating Income" value={kpis.oi} delta={kpis.oiDelta} format="currency" icon={TrendingUp} />
          <KpiCard label="Net Income" value={kpis.ni} delta={kpis.niDelta} format="currency" icon={DollarSign} />
        </div>
      )}

      <div className="flex items-center justify-end gap-2 -mb-1">
        <Toggle
          size="sm"
          pressed={compactCurrency}
          onPressedChange={setCompactCurrency}
          aria-label="Toggle abbreviated currency"
          className="h-7 px-2 text-[11px] font-mono gap-1"
        >
          <DollarSign className="h-3 w-3" />
          {compactCurrency ? '$1.0MM' : '$1,000,000'}
        </Toggle>
      </div>

      <SpreadsheetTable
        title="Income Statement"
        rows={rows}
        months={displayMonths}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        annualAggregation="sum"
        actualThruDate={model.settings.actualThruDate}
        showVariance={showVariance}
        onToggleVariance={() => setShowVariance(v => !v)}
        conditionalFormatting
        compactCurrency={compactCurrency}
        statementType="income_statement"
        comments={financialComments}
        onAddComment={addComment}
        onDeleteComment={deleteComment}
        getCommentsForAnchor={getCommentsForAnchor}
        getCommentCountForRow={getCommentCountForRow}
      />
    </div>
  );
}
