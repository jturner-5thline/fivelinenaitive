// Shared types and utilities for Data Mapping components
import type { MappingFieldName, FieldMapping } from './types';
import { IS_FIELDS, BS_FIELDS } from './types';
import { formatUSD } from '@/lib/formatters/currency';

export type Phase = 'upload' | 'triage' | 'mapping';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface AnalyzedFile {
  file: File;
  sheets: import('@/lib/excelUtils').ParsedSheet[];
  analysis: import('./types').FileAnalysisResult;
}

export interface AutoMapResult {
  fieldName: MappingFieldName;
  rowIdx: number;
  label: string;
  confidence: ConfidenceLevel;
  matchType: 'exact' | 'keyword' | 'fuzzy';
}

export interface ValidationWarning {
  severity: 'error' | 'warning' | 'info';
  field: string;
  message: string;
}

// Keyword alias dictionary for auto-detection
export const KEYWORD_ALIASES: Record<string, MappingFieldName> = {
  'mrr': 'Recurring Revenue', 'monthly recurring revenue': 'Recurring Revenue', 'recurring revenue': 'Recurring Revenue', 'subscription revenue': 'Recurring Revenue', 'saas revenue': 'Recurring Revenue',
  'non-recurring': 'Non-Recurring Revenue', 'non recurring revenue': 'Non-Recurring Revenue', 'one-time revenue': 'Non-Recurring Revenue', 'services revenue': 'Non-Recurring Revenue', 'professional services': 'Non-Recurring Revenue',
  'other revenue': 'Other Revenue', 'other income': 'Other Revenue', 'miscellaneous revenue': 'Other Revenue',
  'cogs recurring': 'COGS on Recurring Revenue', 'cost of recurring': 'COGS on Recurring Revenue', 'hosting costs': 'COGS on Recurring Revenue',
  'cogs non-recurring': 'COGS on Non-Recurring Revenue', 'cost of services': 'COGS on Non-Recurring Revenue',
  'cogs labor': 'COGS - Labor', 'cost of labor': 'COGS - Labor', 'direct labor': 'COGS - Labor',
  'salaries': 'Salaries and Benefits', 'salary': 'Salaries and Benefits', 'wages': 'Salaries and Benefits', 'compensation': 'Salaries and Benefits', 'payroll': 'Salaries and Benefits', 'benefits': 'Salaries and Benefits',
  'sales and marketing': 'Sales and Marketing', 's&m': 'Sales and Marketing', 'marketing': 'Sales and Marketing', 'advertising': 'Sales and Marketing',
  'r&d': 'Research and Development', 'research': 'Research and Development', 'development': 'Research and Development', 'engineering': 'Research and Development',
  'professional fees': 'Professional Fees', 'legal': 'Professional Fees', 'accounting': 'Professional Fees', 'consulting': 'Professional Fees',
  'g&a': 'General and Administrative', 'general and admin': 'General and Administrative', 'admin': 'General and Administrative', 'office': 'General and Administrative', 'rent': 'General and Administrative',
  'interest expense': 'Interest Expense', 'interest paid': 'Interest Expense',
  'interest income': 'Interest Income', 'interest earned': 'Interest Income',
  'depreciation': 'Depreciation Expense', 'amortization': 'Depreciation Expense', 'd&a': 'Depreciation Expense',
  'other expense': 'Other Expense', 'other expenses': 'Other Expense',
  'tax': 'Tax Expense', 'taxes': 'Tax Expense', 'income tax': 'Tax Expense', 'tax expense': 'Tax Expense',
  'cash': 'Cash and Cash Equivalents', 'cash and equivalents': 'Cash and Cash Equivalents', 'cash & equivalents': 'Cash and Cash Equivalents',
  'marketable securities': 'Marketable Securities', 'investments': 'Marketable Securities', 'short-term investments': 'Marketable Securities',
  'accounts receivable': 'Accounts Receivable', 'a/r': 'Accounts Receivable', 'ar': 'Accounts Receivable', 'trade receivables': 'Accounts Receivable',
  'prepaid': 'Prepaid Expenses', 'prepaid expenses': 'Prepaid Expenses', 'prepaids': 'Prepaid Expenses',
  'inventory': 'Inventory', 'inventories': 'Inventory',
  'other current assets': 'Other Current Assets',
  'ppe': 'Property Plant & Equipment', 'property': 'Property Plant & Equipment', 'pp&e': 'Property Plant & Equipment', 'equipment': 'Property Plant & Equipment',
  'fixed assets': 'Fixed Assets',
  'capitalized software': 'Capitalized Software', 'cap software': 'Capitalized Software', 'software': 'Capitalized Software',
  'intangibles': 'Intangible Assets', 'intangible assets': 'Intangible Assets', 'goodwill': 'Intangible Assets',
  'other lt assets': 'Other LT Assets', 'other long-term assets': 'Other LT Assets',
  'accounts payable': 'Accounts Payable', 'a/p': 'Accounts Payable', 'ap': 'Accounts Payable', 'trade payables': 'Accounts Payable',
  'credit cards': 'Credit Cards', 'credit card': 'Credit Cards',
  'employee accruals': 'Employee Accruals', 'accrued compensation': 'Employee Accruals', 'accrued payroll': 'Employee Accruals',
  'other accrued': 'Other Accrued Liabilities', 'accrued liabilities': 'Other Accrued Liabilities', 'accrued expenses': 'Other Accrued Liabilities',
  'short-term debt': 'Short-Term Debt', 'st debt': 'Short-Term Debt', 'current debt': 'Short-Term Debt', 'line of credit': 'Short-Term Debt',
  'deferred revenue': 'Deferred Revenue', 'unearned revenue': 'Deferred Revenue', 'deferred': 'Deferred Revenue',
  'other st liabilities': 'Other Short-Term Liabilities', 'other current liabilities': 'Other Short-Term Liabilities',
  'long-term debt': 'Long-Term Debt', 'lt debt': 'Long-Term Debt', 'term loan': 'Long-Term Debt', 'notes payable': 'Long-Term Debt',
  'government loan': 'Government Loan', 'gov loan': 'Government Loan', 'ppp': 'Government Loan', 'eidl': 'Government Loan', 'sba': 'Government Loan',
  'shareholder loan': 'Shareholder Loan', 'shareholder note': 'Shareholder Loan', 'related party': 'Shareholder Loan',
  'convertible': 'Convertible Notes', 'convertible notes': 'Convertible Notes', 'convertible debt': 'Convertible Notes',
  'paid in capital': 'Paid in Capital', 'common stock': 'Paid in Capital', 'equity': 'Paid in Capital', 'additional paid-in': 'Paid in Capital',
  'retained earnings': 'Retained Earnings', 'accumulated deficit': 'Retained Earnings',
};

export const IS_SECTIONS: { label: string; fields: string[] }[] = [
  { label: 'Revenue', fields: ['Recurring Revenue', 'Non-Recurring Revenue', 'Other Revenue'] },
  { label: 'Cost of Goods Sold', fields: ['COGS on Recurring Revenue', 'COGS on Non-Recurring Revenue', 'COGS - Labor'] },
  { label: 'Operating Expenses', fields: ['Salaries and Benefits', 'Sales and Marketing', 'Research and Development', 'Professional Fees', 'General and Administrative'] },
  { label: 'Other', fields: ['Interest Expense', 'Interest Income', 'Depreciation Expense', 'Other Expense', 'Tax Expense'] },
];

export const BS_SECTIONS: { label: string; fields: string[] }[] = [
  { label: 'Current Assets', fields: ['Cash and Cash Equivalents', 'Marketable Securities', 'Accounts Receivable', 'Prepaid Expenses', 'Inventory', 'Other Current Assets'] },
  { label: 'Long-Term Assets', fields: ['Property Plant & Equipment', 'Fixed Assets', 'Capitalized Software', 'Intangible Assets', 'Other LT Assets'] },
  { label: 'Current Liabilities', fields: ['Accounts Payable', 'Credit Cards', 'Employee Accruals', 'Other Accrued Liabilities', 'Short-Term Debt', 'Deferred Revenue', 'Other Short-Term Liabilities'] },
  { label: 'Long-Term Liabilities', fields: ['Long-Term Debt', 'Government Loan', 'Shareholder Loan', 'Convertible Notes'] },
  { label: 'Equity', fields: ['Paid in Capital', 'Retained Earnings'] },
];

export function getMatchConfidence(label: string, keyword: string): ConfidenceLevel {
  const normalized = label.toLowerCase().trim();
  if (normalized === keyword) return 'high';
  if (normalized.startsWith(keyword)) return 'high';
  const wordBoundary = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  if (wordBoundary.test(normalized)) return 'medium';
  return 'low';
}

export function getConfidencePct(level: ConfidenceLevel): number {
  return level === 'high' ? 95 : level === 'medium' ? 75 : 50;
}

export function getFieldPath(fieldName: MappingFieldName): string[] {
  const map: Record<string, string[]> = {
    'Recurring Revenue': ['revenue', 'recurring'],
    'Non-Recurring Revenue': ['revenue', 'nonRecurring'],
    'Other Revenue': ['revenue', 'other'],
    'COGS on Recurring Revenue': ['cogs', 'onRecurring'],
    'COGS on Non-Recurring Revenue': ['cogs', 'onNonRecurring'],
    'COGS - Labor': ['cogs', 'labor'],
    'Salaries and Benefits': ['opex', 'salaries'],
    'Sales and Marketing': ['opex', 'salesMarketing'],
    'Research and Development': ['opex', 'rnd'],
    'Professional Fees': ['opex', 'professionalFees'],
    'General and Administrative': ['opex', 'gna'],
    'Interest Expense': ['interestExpense'],
    'Interest Income': ['interestIncome'],
    'Depreciation Expense': ['depreciation'],
    'Other Expense': ['otherExpense'],
    'Tax Expense': ['taxExpense'],
    'Cash and Cash Equivalents': ['balanceSheet', 'cash'],
    'Marketable Securities': ['balanceSheet', 'marketableSecurities'],
    'Accounts Receivable': ['balanceSheet', 'ar'],
    'Prepaid Expenses': ['balanceSheet', 'prepaid'],
    'Inventory': ['balanceSheet', 'inventory'],
    'Other Current Assets': ['balanceSheet', 'otherCurrentAssets'],
    'Property Plant & Equipment': ['balanceSheet', 'ppe'],
    'Fixed Assets': ['balanceSheet', 'fixedAssets'],
    'Capitalized Software': ['balanceSheet', 'capSoftware'],
    'Intangible Assets': ['balanceSheet', 'intangibles'],
    'Other LT Assets': ['balanceSheet', 'otherLTAssets'],
    'Accounts Payable': ['balanceSheet', 'ap'],
    'Credit Cards': ['balanceSheet', 'creditCards'],
    'Employee Accruals': ['balanceSheet', 'employeeAccruals'],
    'Other Accrued Liabilities': ['balanceSheet', 'otherAccrued'],
    'Short-Term Debt': ['balanceSheet', 'stDebt'],
    'Deferred Revenue': ['balanceSheet', 'deferredRevenue'],
    'Other Short-Term Liabilities': ['balanceSheet', 'otherSTLiabilities'],
    'Long-Term Debt': ['balanceSheet', 'ltDebt'],
    'Government Loan': ['balanceSheet', 'govLoan'],
    'Shareholder Loan': ['balanceSheet', 'shareholderLoan'],
    'Convertible Notes': ['balanceSheet', 'convertibleNotes'],
    'Paid in Capital': ['balanceSheet', 'paidInCapital'],
    'Retained Earnings': ['balanceSheet', 'retainedEarnings'],
  };
  return map[fieldName] || [];
}

export function formatCellValue(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number') return formatUSD(val);
  const str = String(val);
  const parsed = parseFloat(str.replace(/[,$\s]/g, ''));
  if (!isNaN(parsed) && str.match(/^[\s$(-]*[\d,.]+[\s)]*$/)) return formatUSD(parsed);
  return str;
}

export function isNumericCell(val: unknown): boolean {
  if (typeof val === 'number') return true;
  if (val === null || val === undefined) return false;
  const str = String(val);
  const parsed = parseFloat(str.replace(/[,$\s]/g, ''));
  return !isNaN(parsed) && str.match(/^[\s$(-]*[\d,.]+[\s)]*$/) !== null;
}

export function applyMappingsToModel(
  fieldMappings: Record<string, FieldMapping[]>,
  selectedFile: AnalyzedFile,
  updateModel: (updater: (prev: import('./types').SaaSModelData) => import('./types').SaaSModelData) => void,
) {
  updateModel(prev => {
    const updated = { ...prev };
    Object.entries(fieldMappings).forEach(([fieldName, mappings]) => {
      const path = getFieldPath(fieldName as MappingFieldName);
      if (!path.length) return;

      const sheet = selectedFile.sheets.find(s => s.name === mappings[0]?.sheet) || selectedFile.sheets[0];
      const numCols = Math.min(24, (sheet.data[0]?.length || 1) - 1);
      const values = new Array(24).fill(0);

      mappings.forEach(m => {
        const row = sheet.data[m.rowIdx];
        if (!row) return;
        for (let c = 1; c <= numCols && c <= 24; c++) {
          const val = typeof row[c] === 'number' ? row[c] as number : parseFloat(String(row[c] || '0').replace(/[,$]/g, ''));
          if (!isNaN(val)) values[c - 1] += val;
        }
      });

      if (path.length === 1) {
        (updated as any)[path[0]] = values;
      } else if (path.length === 2) {
        (updated as any)[path[0]][path[1]] = values;
      }
    });
    return updated;
  });
}

/** Detect header row — the first row where most cells are non-numeric text */
export function detectHeaderRow(data: unknown[][]): number | null {
  for (let i = 0; i < Math.min(5, data.length); i++) {
    const row = data[i];
    if (!row || row.length < 3) continue;
    const textCells = row.slice(1).filter(cell => {
      if (cell === null || cell === undefined) return false;
      const str = String(cell).trim();
      if (!str) return false;
      // Check if it looks like a date header (month/year)
      if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(str)) return true;
      if (/^\d{4}$/.test(str)) return true; // Year
      if (/^(q[1-4]|fy)/i.test(str)) return true; // Quarter/FY
      // Non-numeric text
      return isNaN(parseFloat(str.replace(/[,$\s]/g, '')));
    });
    // If >50% of non-empty cells are text, it's likely a header
    const nonEmpty = row.slice(1).filter(c => c !== null && c !== undefined && String(c).trim() !== '');
    if (nonEmpty.length >= 2 && textCells.length / nonEmpty.length > 0.5) {
      return i;
    }
  }
  return null;
}

/** Extract column headers from detected header row */
export function extractColumnHeaders(data: unknown[][], headerRowIdx: number): string[] {
  const row = data[headerRowIdx];
  if (!row) return [];
  return row.slice(1).map(cell => {
    if (cell === null || cell === undefined) return '';
    return String(cell).trim();
  });
}
