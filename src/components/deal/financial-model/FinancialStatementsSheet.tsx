import { ScrollArea } from '@/components/ui/scroll-area';
import { SpreadsheetCell } from './SpreadsheetCell';
import { AnnualData } from '@/hooks/useFinancialModel';
import { cn } from '@/lib/utils';

interface FinancialStatementsSheetProps {
  annualData: AnnualData[];
}

interface RowDefinition {
  key: string;
  label?: string;
  format?: 'currency' | 'percent';
  isHeader?: boolean;
  isDivider?: boolean;
  isBold?: boolean;
  isNegative?: boolean;
  indent?: number;
}

const incomeStatementRows: RowDefinition[] = [
  { key: 'header_is', label: 'INCOME STATEMENT', isHeader: true },
  { key: 'revenue', label: 'Revenue', format: 'currency' },
  { key: 'cogs', label: 'Cost of Goods Sold', format: 'currency', indent: 1, isNegative: true },
  { key: 'grossProfit', label: 'Gross Profit', format: 'currency', isBold: true },
  { key: 'grossMargin', label: 'Gross Margin %', format: 'percent', indent: 1 },
  { key: 'divider1', isDivider: true },
  { key: 'salesMarketing', label: 'Sales & Marketing', format: 'currency', indent: 1, isNegative: true },
  { key: 'rd', label: 'Research & Development', format: 'currency', indent: 1, isNegative: true },
  { key: 'ga', label: 'General & Administrative', format: 'currency', indent: 1, isNegative: true },
  { key: 'headcountCost', label: 'Headcount Costs', format: 'currency', indent: 1, isNegative: true },
  { key: 'totalOpex', label: 'Total Operating Expenses', format: 'currency', isBold: true, isNegative: true },
  { key: 'operatingIncome', label: 'Operating Income', format: 'currency', isBold: true },
  { key: 'operatingMargin', label: 'Operating Margin %', format: 'percent', indent: 1 },
  { key: 'netIncome', label: 'Net Income', format: 'currency', isBold: true },
];

const cashFlowRows: RowDefinition[] = [
  { key: 'header_cf', label: 'CASH FLOW STATEMENT', isHeader: true },
  { key: 'operatingCashFlow', label: 'Operating Cash Flow', format: 'currency' },
  { key: 'investingCashFlow', label: 'Investing Cash Flow', format: 'currency' },
  { key: 'financingCashFlow', label: 'Financing Cash Flow', format: 'currency' },
  { key: 'netCashChange', label: 'Net Change in Cash', format: 'currency', isBold: true },
  { key: 'endingCash', label: 'Ending Cash Balance', format: 'currency', isBold: true },
];

export function FinancialStatementsSheet({ annualData }: FinancialStatementsSheetProps) {
  const allRows = [...incomeStatementRows, { key: 'space', isDivider: true }, ...cashFlowRows];

  return (
    <div className="flex flex-col h-full border rounded-lg overflow-hidden bg-background">
      <div className="flex flex-1 min-h-0">
        {/* Fixed Left Column */}
        <div className="w-56 flex-shrink-0 border-r bg-slate-50 dark:bg-slate-900">
          <div className="h-10 border-b bg-slate-100 dark:bg-slate-800 flex items-center px-3">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Financial Statements</span>
          </div>
          {allRows.map((row, i) => (
            <div
              key={row.key}
              className={cn(
                'h-9 flex items-center border-b',
                row.isHeader && 'bg-slate-200 dark:bg-slate-700 h-10',
                row.isDivider && 'bg-slate-100 dark:bg-slate-800 h-3',
                row.isBold && 'font-semibold bg-slate-100/50 dark:bg-slate-800/50',
                !row.isHeader && !row.isDivider && i % 2 === 0 && 'bg-slate-50/50 dark:bg-slate-900/50',
              )}
              style={{ paddingLeft: row.indent ? `${row.indent * 16 + 12}px` : '12px' }}
            >
              {!row.isDivider && (
                <span className={cn(
                  'text-xs truncate',
                  row.isHeader ? 'font-bold text-slate-800 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300'
                )}>
                  {row.label}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Year Columns */}
        <ScrollArea className="flex-1">
          <div className="flex min-w-max">
            {annualData.map((year) => (
              <div key={year.year} className="w-32 flex-shrink-0 border-r">
                {/* Year Header */}
                <div className="h-10 border-b bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                  <span className="text-sm font-bold text-blue-800 dark:text-blue-200">
                    {year.year}
                  </span>
                </div>
                {/* Data Cells */}
                {allRows.map((row, i) => {
                  if (row.isDivider) {
                    return <div key={row.key} className="h-3 bg-slate-100 dark:bg-slate-800 border-b" />;
                  }
                  if (row.isHeader) {
                    return <div key={row.key} className="h-10 bg-slate-200 dark:bg-slate-700 border-b" />;
                  }
                  
                  const value = year[row.key as keyof AnnualData] as number;
                  const displayNegative = row.isNegative || (row.key === 'operatingIncome' && value < 0) || (row.key === 'netIncome' && value < 0);
                  
                  return (
                    <div
                      key={row.key}
                      className={cn(
                        'h-9 border-b',
                        row.isBold && 'bg-slate-100/50 dark:bg-slate-800/50',
                        !row.isBold && i % 2 === 0 && 'bg-slate-50/50 dark:bg-slate-900/50',
                      )}
                    >
                      <SpreadsheetCell
                        value={row.isNegative ? -Math.abs(value) : value}
                        format={row.format}
                        isBold={row.isBold}
                        isNegative={displayNegative}
                        className="h-full"
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
