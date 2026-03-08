import { useState } from 'react';
import { SaaSModelData } from './types';
import { fmtCurrency, fmtPct, isNegative } from './formatters';
import { annualRollup } from './calculations';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  model: SaaSModelData;
}

type ViewMode = 'monthly' | 'annual';

interface RowDef {
  label: string;
  values: number[];
  isTotal?: boolean;
  isSubtotal?: boolean;
  isPct?: boolean;
  isSection?: boolean;
}

export function SaaSModelIncomeStatement({ model }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('monthly');

  const allRows: RowDef[] = [
    // Revenue
    { label: 'REVENUE', values: [], isSection: true },
    { label: 'Recurring Revenue', values: model.revenue.recurring },
    { label: 'Non-Recurring Revenue', values: model.revenue.nonRecurring },
    { label: 'Other Revenue', values: model.revenue.other },
    { label: 'Total Revenue', values: model.totalRevenue, isTotal: true },
    // COGS
    { label: 'COST OF GOODS SOLD', values: [], isSection: true },
    { label: 'COGS on Recurring', values: model.cogs.onRecurring },
    { label: 'COGS on Non-Recurring', values: model.cogs.onNonRecurring },
    { label: 'COGS — Labor', values: model.cogs.labor },
    { label: 'Total COGS', values: model.totalCOGS, isTotal: true },
    // Gross Profit
    { label: 'Gross Profit', values: model.grossProfit, isSubtotal: true },
    { label: '% Gross Margin', values: model.grossMarginPct, isPct: true },
    // OpEx
    { label: 'OPERATING EXPENSES', values: [], isSection: true },
    { label: 'Salaries & Benefits', values: model.opex.salaries },
    { label: 'Sales & Marketing', values: model.opex.salesMarketing },
    { label: 'R&D', values: model.opex.rnd },
    { label: 'Professional Fees', values: model.opex.professionalFees },
    { label: 'G&A', values: model.opex.gna },
    { label: 'Total OpEx', values: model.totalOpEx, isTotal: true },
    // Operating Income
    { label: 'Operating Income', values: model.operatingIncome, isSubtotal: true },
    { label: '% Operating Margin', values: model.operatingMarginPct, isPct: true },
    // Below the line
    { label: 'BELOW THE LINE', values: [], isSection: true },
    { label: 'Interest Expense', values: model.interestExpense },
    { label: 'Interest Income', values: model.interestIncome },
    { label: 'Depreciation', values: model.depreciation },
    { label: 'Other Expense', values: model.otherExpense },
    { label: 'EBT', values: model.ebt, isSubtotal: true },
    { label: 'Tax Expense', values: model.taxExpense },
    { label: 'Net Income', values: model.netIncome, isTotal: true },
  ];

  const years = [...new Set(model.months.map(m => m.year))];

  if (viewMode === 'annual') {
    return (
      <Card className="border-border/30">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Income Statement</h3>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setViewMode('monthly')}>Monthly</Button>
              <Button variant="default" size="sm" className="h-7 text-xs" onClick={() => setViewMode('annual')}>Annual</Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground sticky left-0 bg-card min-w-[200px]">Line Item</th>
                  {years.map(y => (
                    <th key={y} className="text-right py-2 px-3 font-medium text-muted-foreground min-w-[100px]">{y}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allRows.map((row, idx) => {
                  if (row.isSection) {
                    return (
                      <tr key={idx}>
                        <td colSpan={years.length + 1} className="pt-4 pb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sticky left-0 bg-card">{row.label}</td>
                      </tr>
                    );
                  }
                  const annualVals = years.map(y => {
                    const indices = model.months.map((m, i) => m.year === y ? i : -1).filter(i => i >= 0);
                    if (row.isPct) return indices.reduce((s, i) => s + row.values[i], 0) / indices.length;
                    return indices.reduce((s, i) => s + row.values[i], 0);
                  });
                  return (
                    <tr key={idx} className={cn(
                      "border-b border-border/10 hover:bg-muted/10",
                      (row.isTotal || row.isSubtotal) && "border-t border-border/30"
                    )}>
                      <td className={cn(
                        "py-1.5 px-3 sticky left-0 bg-card",
                        (row.isTotal || row.isSubtotal) && "font-semibold"
                      )}>{row.label}</td>
                      {annualVals.map((v, vi) => (
                        <td key={vi} className={cn(
                          "py-1.5 px-3 text-right font-mono tabular-nums",
                          (row.isTotal || row.isSubtotal) && "font-semibold",
                          isNegative(v) && "text-destructive"
                        )}>
                          {row.isPct ? fmtPct(v) : fmtCurrency(v)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/30">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Income Statement</h3>
            <div className="flex gap-1">
              <Button variant="default" size="sm" className="h-7 text-xs" onClick={() => setViewMode('monthly')}>Monthly</Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setViewMode('annual')}>Annual</Button>
          </div>
        </div>
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border/40">
                <th className="text-left py-2 px-3 font-medium text-muted-foreground sticky left-0 bg-card z-20 min-w-[200px]">Line Item</th>
                {model.months.map((m, i) => (
                  <th key={i} className="text-right py-2 px-2 font-medium text-muted-foreground min-w-[80px] whitespace-nowrap">{m.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allRows.map((row, idx) => {
                if (row.isSection) {
                  return (
                    <tr key={idx}>
                      <td colSpan={model.months.length + 1} className="pt-4 pb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sticky left-0 bg-card">{row.label}</td>
                    </tr>
                  );
                }
                return (
                  <tr key={idx} className={cn(
                    "border-b border-border/10 hover:bg-muted/10",
                    (row.isTotal || row.isSubtotal) && "border-t border-border/30"
                  )}>
                    <td className={cn(
                      "py-1.5 px-3 sticky left-0 bg-card z-10",
                      (row.isTotal || row.isSubtotal) && "font-semibold"
                    )}>{row.label}</td>
                    {row.values.map((v, vi) => (
                      <td key={vi} className={cn(
                        "py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap",
                        (row.isTotal || row.isSubtotal) && "font-semibold",
                        isNegative(v) && "text-destructive"
                      )}>
                        {row.isPct ? fmtPct(v) : fmtCurrency(v)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
