import { useState, useMemo } from 'react';
import { SaaSModelData } from './types';
import { SpreadsheetTable, RowDef, ViewMode } from './SpreadsheetTable';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown, DollarSign, Percent } from 'lucide-react';
import { fmtCurrency, fmtPct } from './formatters';
import { cn } from '@/lib/utils';
import { Toggle } from '@/components/ui/toggle';

interface Props {
  model: SaaSModelData;
}

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
    <Card className="border-border/20">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
          <Icon className="h-3.5 w-3.5 text-muted-foreground/40" />
        </div>
        <div className="text-base font-semibold font-mono tabular-nums">{formatted}</div>
        {hasDelta && (
          <div className={cn(
            "flex items-center gap-1 mt-0.5 text-[10px] font-medium",
            isPositive ? "text-emerald-500" : "text-destructive"
          )}>
            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {isPositive ? '+' : ''}{delta!.toFixed(1)}% MoM
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SaaSModelIncomeStatement({ model }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('monthly');
  const [showVariance, setShowVariance] = useState(false);
  const [compactCurrency, setCompactCurrency] = useState(true);

  // Compute latest-period KPIs
  const kpis = useMemo(() => {
    const len = model.totalRevenue.length;
    if (len === 0) return null;
    const lastIdx = len - 1;
    const prevIdx = lastIdx - 1;

    const rev = model.totalRevenue[lastIdx] ?? 0;
    const prevRev = prevIdx >= 0 ? (model.totalRevenue[prevIdx] ?? 0) : 0;
    const revDelta = prevRev !== 0 ? ((rev - prevRev) / Math.abs(prevRev)) * 100 : 0;

    const gm = model.grossMarginPct[lastIdx] ?? 0;
    const prevGm = prevIdx >= 0 ? (model.grossMarginPct[prevIdx] ?? 0) : 0;
    const gmDelta = prevGm !== 0 ? gm - prevGm : 0;

    const oi = model.operatingIncome[lastIdx] ?? 0;
    const prevOi = prevIdx >= 0 ? (model.operatingIncome[prevIdx] ?? 0) : 0;
    const oiDelta = prevOi !== 0 ? ((oi - prevOi) / Math.abs(prevOi)) * 100 : 0;

    const ni = model.netIncome[lastIdx] ?? 0;
    const prevNi = prevIdx >= 0 ? (model.netIncome[prevIdx] ?? 0) : 0;
    const niDelta = prevNi !== 0 ? ((ni - prevNi) / Math.abs(prevNi)) * 100 : 0;

    return { rev, revDelta, gm, gmDelta, oi, oiDelta, ni, niDelta };
  }, [model]);

  const rows: RowDef[] = [
    { key: 'sec-revenue', label: 'REVENUE', values: [], isSection: true },
    { key: 'recurring-rev', label: 'Recurring Revenue', values: model.revenue.recurring },
    { key: 'non-recurring-rev', label: 'Non-Recurring Revenue', values: model.revenue.nonRecurring },
    { key: 'other-rev', label: 'Other Revenue', values: model.revenue.other },
    { key: 'total-rev', label: 'Total Revenue', values: model.totalRevenue, isTotal: true, formula: 'SUM(Recurring + Non-Recurring + Other)' },
    { key: 'sec-cogs', label: 'COST OF GOODS SOLD', values: [], isSection: true },
    { key: 'cogs-recurring', label: 'COGS on Recurring', values: model.cogs.onRecurring },
    { key: 'cogs-nonrecurring', label: 'COGS on Non-Recurring', values: model.cogs.onNonRecurring },
    { key: 'cogs-labor', label: 'COGS — Labor', values: model.cogs.labor },
    { key: 'total-cogs', label: 'Total COGS', values: model.totalCOGS, isTotal: true, formula: 'SUM(COGS items)' },
    { key: 'gross-profit', label: 'Gross Profit', values: model.grossProfit, isSubtotal: true, formula: 'Total Revenue - Total COGS' },
    { key: 'gross-margin-pct', label: '% Gross Margin', values: model.grossMarginPct, isPct: true, formula: 'Gross Profit / Total Revenue' },
    { key: 'sec-opex', label: 'OPERATING EXPENSES', values: [], isSection: true },
    { key: 'salaries', label: 'Salaries & Benefits', values: model.opex.salaries },
    { key: 'sales-marketing', label: 'Sales & Marketing', values: model.opex.salesMarketing },
    { key: 'rnd', label: 'R&D', values: model.opex.rnd },
    { key: 'prof-fees', label: 'Professional Fees', values: model.opex.professionalFees },
    { key: 'gna', label: 'G&A', values: model.opex.gna },
    { key: 'total-opex', label: 'Total OpEx', values: model.totalOpEx, isTotal: true, formula: 'SUM(OpEx items)' },
    { key: 'op-income', label: 'Operating Income', values: model.operatingIncome, isSubtotal: true, formula: 'Gross Profit - Total OpEx' },
    { key: 'op-margin-pct', label: '% Operating Margin', values: model.operatingMarginPct, isPct: true, formula: 'Operating Income / Total Revenue' },
    { key: 'sec-btl', label: 'BELOW THE LINE', values: [], isSection: true },
    { key: 'int-expense', label: 'Interest Expense', values: model.interestExpense },
    { key: 'int-income', label: 'Interest Income', values: model.interestIncome },
    { key: 'depreciation', label: 'Depreciation', values: model.depreciation },
    { key: 'other-expense', label: 'Other Expense', values: model.otherExpense },
    { key: 'ebt', label: 'EBT', values: model.ebt, isSubtotal: true, formula: 'Operating Income ± Below the Line' },
    { key: 'tax-expense', label: 'Tax Expense', values: model.taxExpense },
    { key: 'net-income', label: 'Net Income', values: model.netIncome, isTotal: true, formula: 'EBT - Tax Expense' },
  ];

  return (
    <div className="space-y-3">
      {/* Summary KPI Cards */}
      {kpis && (
        <div className="grid grid-cols-4 gap-3">
          <KpiCard label="Total Revenue" value={kpis.rev} delta={kpis.revDelta} format="currency" icon={DollarSign} />
          <KpiCard label="Gross Margin" value={kpis.gm} delta={kpis.gmDelta} format="pct" icon={Percent} />
          <KpiCard label="Operating Income" value={kpis.oi} delta={kpis.oiDelta} format="currency" icon={TrendingUp} />
          <KpiCard label="Net Income" value={kpis.ni} delta={kpis.niDelta} format="currency" icon={DollarSign} />
        </div>
      )}

      <SpreadsheetTable
        title="Income Statement"
        rows={rows}
        months={model.months}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        annualAggregation="sum"
        actualThruDate={model.settings.actualThruDate}
        showVariance={showVariance}
        onToggleVariance={() => setShowVariance(v => !v)}
        conditionalFormatting
      />
    </div>
  );
}
