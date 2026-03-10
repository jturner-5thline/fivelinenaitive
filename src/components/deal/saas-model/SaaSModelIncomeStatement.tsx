import { useState } from 'react';
import { SaaSModelData } from './types';
import { SpreadsheetTable, RowDef, ViewMode } from './SpreadsheetTable';

interface Props {
  model: SaaSModelData;
}

export function SaaSModelIncomeStatement({ model }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('monthly');

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
    <SpreadsheetTable
      title="Income Statement"
      rows={rows}
      months={model.months}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      annualAggregation="sum"
      actualThruDate={model.settings.actualThruDate}
    />
  );
}
