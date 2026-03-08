import { useState } from 'react';
import { SaaSModelData } from './types';
import { fmtCurrency, isNegative } from './formatters';
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
  isSection?: boolean;
  isCheck?: boolean;
}

export function SaaSModelBalanceSheet({ model }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('monthly');
  const bs = model.balanceSheet;

  const allRows: RowDef[] = [
    { label: 'ASSETS', values: [], isSection: true },
    { label: 'Cash & Cash Equivalents', values: bs.cash },
    { label: 'Marketable Securities', values: bs.marketableSecurities },
    { label: 'Accounts Receivable', values: bs.ar },
    { label: 'Prepaid Expenses', values: bs.prepaid },
    { label: 'Inventory', values: bs.inventory },
    { label: 'Other Current Assets', values: bs.otherCurrentAssets },
    { label: 'Total Current Assets', values: bs.totalCurrentAssets, isSubtotal: true },
    { label: 'PP&E', values: bs.ppe },
    { label: 'Fixed Assets', values: bs.fixedAssets },
    { label: 'Capitalized Software', values: bs.capSoftware },
    { label: 'Intangible Assets', values: bs.intangibles },
    { label: 'Other LT Assets', values: bs.otherLTAssets },
    { label: 'Total LT Assets', values: bs.totalLTAssets, isSubtotal: true },
    { label: 'Total Assets', values: bs.totalAssets, isTotal: true },
    // Liabilities
    { label: 'LIABILITIES', values: [], isSection: true },
    { label: 'Accounts Payable', values: bs.ap },
    { label: 'Credit Cards', values: bs.creditCards },
    { label: 'Employee Accruals', values: bs.employeeAccruals },
    { label: 'Other Accrued Liabilities', values: bs.otherAccrued },
    { label: 'Short-Term Debt', values: bs.stDebt },
    { label: 'Deferred Revenue', values: bs.deferredRevenue },
    { label: 'Other ST Liabilities', values: bs.otherSTLiabilities },
    { label: 'Total Current Liabilities', values: bs.totalCurrentLiabilities, isSubtotal: true },
    { label: 'Long-Term Debt', values: bs.ltDebt },
    { label: 'Government Loan', values: bs.govLoan },
    { label: 'Shareholder Loan', values: bs.shareholderLoan },
    { label: 'Convertible Notes', values: bs.convertibleNotes },
    { label: 'Total LT Liabilities', values: bs.totalLTLiabilities, isSubtotal: true },
    { label: 'Total Liabilities', values: bs.totalLiabilities, isTotal: true },
    // Equity
    { label: 'EQUITY', values: [], isSection: true },
    { label: 'Paid in Capital', values: bs.paidInCapital },
    { label: 'Retained Earnings', values: bs.retainedEarnings },
    { label: 'Net Income', values: bs.netIncomeBs },
    { label: 'Total Equity', values: bs.totalEquity, isTotal: true },
    // Check
    { label: 'Total Liabilities & Equity', values: bs.totalLiabilitiesEquity, isTotal: true },
    { label: 'BS Check (should be 0)', values: bs.bsCheck, isCheck: true },
  ];

  const years = [...new Set(model.months.map(m => m.year))];

  // For annual view, BS uses point-in-time (last month of year)
  const getAnnualValues = (values: number[]) => {
    return years.map(y => {
      const indices = model.months.map((m, i) => m.year === y ? i : -1).filter(i => i >= 0);
      return values[indices[indices.length - 1]] ?? 0;
    });
  };

  const renderTable = (columns: { label: string; index: number }[], getVal: (values: number[], colIdx: number) => number) => (
    <div className="overflow-x-auto max-h-[70vh]">
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 z-10 bg-card">
          <tr className="border-b border-border/40">
            <th className="text-left py-2 px-3 font-medium text-muted-foreground sticky left-0 bg-card z-20 min-w-[200px]">Line Item</th>
            {columns.map(c => (
              <th key={c.index} className="text-right py-2 px-2 font-medium text-muted-foreground min-w-[80px] whitespace-nowrap">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allRows.map((row, idx) => {
            if (row.isSection) {
              return (
                <tr key={idx}>
                  <td colSpan={columns.length + 1} className="pt-4 pb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sticky left-0 bg-card">{row.label}</td>
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
                  (row.isTotal || row.isSubtotal) && "font-semibold",
                  row.isCheck && "text-muted-foreground"
                )}>{row.label}</td>
                {columns.map((c, ci) => {
                  const v = getVal(row.values, ci);
                  return (
                    <td key={c.index} className={cn(
                      "py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap",
                      (row.isTotal || row.isSubtotal) && "font-semibold",
                      isNegative(v) && "text-destructive",
                      row.isCheck && v !== 0 && "text-destructive font-bold"
                    )}>
                      {fmtCurrency(v)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <Card className="border-border/30">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Balance Sheet</h3>
          <div className="flex gap-1">
            <Button variant={viewMode === 'monthly' ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setViewMode('monthly')}>Monthly</Button>
            <Button variant={viewMode === 'annual' ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setViewMode('annual')}>Annual</Button>
          </div>
        </div>
        {viewMode === 'monthly'
          ? renderTable(
              model.months.map((m, i) => ({ label: m.label, index: i })),
              (values, colIdx) => values[colIdx] ?? 0
            )
          : renderTable(
              years.map((y, i) => ({ label: String(y), index: i })),
              (values, colIdx) => getAnnualValues(values)[colIdx] ?? 0
            )
        }
      </CardContent>
    </Card>
  );
}
