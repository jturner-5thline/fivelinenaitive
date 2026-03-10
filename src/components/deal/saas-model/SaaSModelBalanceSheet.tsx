import { useState } from 'react';
import { SaaSModelData } from './types';
import { SpreadsheetTable, RowDef, ViewMode } from './SpreadsheetTable';

interface Props {
  model: SaaSModelData;
}

export function SaaSModelBalanceSheet({ model }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('monthly');
  const bs = model.balanceSheet;

  const rows: RowDef[] = [
    { key: 'sec-assets', label: 'ASSETS', values: [], isSection: true },
    { key: 'cash', label: 'Cash & Cash Equivalents', values: bs.cash },
    { key: 'mkt-sec', label: 'Marketable Securities', values: bs.marketableSecurities },
    { key: 'ar', label: 'Accounts Receivable', values: bs.ar },
    { key: 'prepaid', label: 'Prepaid Expenses', values: bs.prepaid },
    { key: 'inventory', label: 'Inventory', values: bs.inventory },
    { key: 'other-ca', label: 'Other Current Assets', values: bs.otherCurrentAssets },
    { key: 'total-ca', label: 'Total Current Assets', values: bs.totalCurrentAssets, isSubtotal: true, formula: 'SUM(Current Asset items)' },
    { key: 'ppe', label: 'PP&E', values: bs.ppe },
    { key: 'fixed-assets', label: 'Fixed Assets', values: bs.fixedAssets },
    { key: 'cap-software', label: 'Capitalized Software', values: bs.capSoftware },
    { key: 'intangibles', label: 'Intangible Assets', values: bs.intangibles },
    { key: 'other-lt-assets', label: 'Other LT Assets', values: bs.otherLTAssets },
    { key: 'total-lt-assets', label: 'Total LT Assets', values: bs.totalLTAssets, isSubtotal: true, formula: 'SUM(LT Asset items)' },
    { key: 'total-assets', label: 'Total Assets', values: bs.totalAssets, isTotal: true, formula: 'Total Current + Total LT Assets' },
    { key: 'sec-liabilities', label: 'LIABILITIES', values: [], isSection: true },
    { key: 'ap', label: 'Accounts Payable', values: bs.ap },
    { key: 'credit-cards', label: 'Credit Cards', values: bs.creditCards },
    { key: 'emp-accruals', label: 'Employee Accruals', values: bs.employeeAccruals },
    { key: 'other-accrued', label: 'Other Accrued Liabilities', values: bs.otherAccrued },
    { key: 'st-debt', label: 'Short-Term Debt', values: bs.stDebt },
    { key: 'deferred-rev', label: 'Deferred Revenue', values: bs.deferredRevenue },
    { key: 'other-st-liab', label: 'Other ST Liabilities', values: bs.otherSTLiabilities },
    { key: 'total-cl', label: 'Total Current Liabilities', values: bs.totalCurrentLiabilities, isSubtotal: true, formula: 'SUM(Current Liability items)' },
    { key: 'lt-debt', label: 'Long-Term Debt', values: bs.ltDebt },
    { key: 'gov-loan', label: 'Government Loan', values: bs.govLoan },
    { key: 'shareholder-loan', label: 'Shareholder Loan', values: bs.shareholderLoan },
    { key: 'conv-notes', label: 'Convertible Notes', values: bs.convertibleNotes },
    { key: 'total-lt-liab', label: 'Total LT Liabilities', values: bs.totalLTLiabilities, isSubtotal: true, formula: 'SUM(LT Liability items)' },
    { key: 'total-liab', label: 'Total Liabilities', values: bs.totalLiabilities, isTotal: true, formula: 'Total Current + Total LT Liabilities' },
    { key: 'sec-equity', label: 'EQUITY', values: [], isSection: true },
    { key: 'paid-in-cap', label: 'Paid in Capital', values: bs.paidInCapital },
    { key: 'retained-earnings', label: 'Retained Earnings', values: bs.retainedEarnings },
    { key: 'net-income-bs', label: 'Net Income', values: bs.netIncomeBs },
    { key: 'total-equity', label: 'Total Equity', values: bs.totalEquity, isTotal: true, formula: 'SUM(Equity items)' },
    { key: 'total-l-e', label: 'Total Liabilities & Equity', values: bs.totalLiabilitiesEquity, isTotal: true, formula: 'Total Liabilities + Total Equity' },
    { key: 'bs-check', label: 'BS Check (should be 0)', values: bs.bsCheck, isCheck: true, formula: 'Total Assets - Total L&E' },
  ];

  return (
    <SpreadsheetTable
      title="Balance Sheet"
      rows={rows}
      months={model.months}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      annualAggregation="last"
      actualThruDate={model.settings.actualThruDate}
    />
  );
}
