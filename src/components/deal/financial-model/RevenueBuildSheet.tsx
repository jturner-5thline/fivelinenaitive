import { useRef } from 'react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { SpreadsheetCell } from './SpreadsheetCell';
import { MonthlyData } from '@/hooks/useFinancialModel';
import { cn } from '@/lib/utils';

interface RevenueBuildSheetProps {
  monthlyData: MonthlyData[];
}

const rowDefinitions = [
  { key: 'newCustomers', label: 'New Customers', format: 'number' as const },
  { key: 'churnedCustomers', label: 'Churned Customers', format: 'number' as const, isNegative: true },
  { key: 'totalCustomers', label: 'Total Customers', format: 'number' as const, isBold: true },
  { key: 'divider1', label: '', isDivider: true },
  { key: 'mrr', label: 'Monthly Recurring Revenue', format: 'currency' as const, isBold: true },
  { key: 'revenue', label: 'Total Revenue', format: 'currency' as const, isBold: true },
];

export function RevenueBuildSheet({ monthlyData }: RevenueBuildSheetProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex flex-col h-full border rounded-lg overflow-hidden bg-background">
      {/* Fixed Row Labels + Scrollable Data */}
      <div className="flex flex-1 min-h-0">
        {/* Fixed Left Column */}
        <div className="w-48 flex-shrink-0 border-r bg-slate-50 dark:bg-slate-900">
          {/* Header spacer */}
          <div className="h-8 border-b bg-slate-100 dark:bg-slate-800 flex items-center px-3">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Metric</span>
          </div>
          {/* Row labels */}
          {rowDefinitions.map((row, i) => (
            <div
              key={row.key}
              className={cn(
                'h-8 flex items-center px-3 border-b',
                row.isDivider && 'bg-slate-100 dark:bg-slate-800 h-2',
                row.isBold && 'font-semibold',
                i % 2 === 0 && !row.isDivider && 'bg-slate-50/50 dark:bg-slate-900/50',
              )}
            >
              {!row.isDivider && (
                <span className="text-xs text-slate-700 dark:text-slate-300 truncate">
                  {row.label}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Scrollable Data Area */}
        <ScrollArea className="flex-1">
          <div className="min-w-max">
            {/* Month Headers */}
            <div className="flex h-8 border-b sticky top-0 z-10">
              {monthlyData.map((month, colIndex) => (
                <div
                  key={month.label}
                  className={cn(
                    'w-24 flex-shrink-0 flex items-center justify-center border-r bg-slate-100 dark:bg-slate-800',
                    colIndex % 12 === 0 && 'bg-blue-100 dark:bg-blue-900/50',
                  )}
                >
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {month.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Data Rows */}
            {rowDefinitions.map((row, rowIndex) => (
              <div key={row.key} className={cn('flex', row.isDivider && 'h-2 bg-slate-100 dark:bg-slate-800')}>
                {!row.isDivider && monthlyData.map((month, colIndex) => (
                  <div
                    key={`${row.key}-${month.label}`}
                    className={cn(
                      'w-24 flex-shrink-0 h-8 border-r border-b',
                      rowIndex % 2 === 0 && 'bg-slate-50/50 dark:bg-slate-900/50',
                      colIndex % 12 === 0 && 'border-l-2 border-l-blue-300 dark:border-l-blue-700',
                    )}
                  >
                    <SpreadsheetCell
                      value={month[row.key as keyof MonthlyData] as number}
                      format={row.format}
                      isBold={row.isBold}
                      isNegative={row.isNegative}
                      className="h-full"
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </div>
  );
}
