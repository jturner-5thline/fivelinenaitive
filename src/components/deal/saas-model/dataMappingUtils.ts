// Shared types and utilities for Data Mapping components
import type { MappingFieldName, FieldMapping } from './types';
import { IS_FIELDS, BS_FIELDS } from './types';
import { formatUSD } from '@/lib/formatters/currency';
import { generateMonths } from './calculations';

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

/**
 * Convert a field path array to an account key string for storage.
 * e.g. ['revenue', 'recurring'] => 'revenue.recurring'
 */
export function fieldPathToAccountKey(path: string[]): string {
  return path.join('.');
}

/**
 * Extract mapped values from a file with month alignment.
 * Returns array of { year_month, account_key, account_label, value } for DB storage.
 */
export function extractMappedDataRows(
  fieldMappings: Record<string, FieldMapping[]>,
  selectedFile: AnalyzedFile,
  startMonth: number,
  startYear: number,
  flippedRows?: Set<number>,
  excludedColumns?: Set<number>,
  flippedColumns?: Set<number>,
): Array<{ year_month: string; account_key: string; account_label: string; value: number }> {
  const rows: Array<{ year_month: string; account_key: string; account_label: string; value: number }> = [];

  Object.entries(fieldMappings).forEach(([fieldName, mappings]) => {
    const path = getFieldPath(fieldName as MappingFieldName);
    if (!path.length) return;
    const accountKey = fieldPathToAccountKey(path);

    const sheet = selectedFile.sheets.find(s => s.name === mappings[0]?.sheet) || selectedFile.sheets[0];
    const numCols = Math.min(24, (sheet.data[0]?.length || 1) - 1);

    // Collect values per column slot
    const values: number[] = new Array(24).fill(0);
    mappings.forEach(m => {
      const row = sheet.data[m.rowIdx];
      if (!row) return;
      const rowMultiplier = flippedRows?.has(m.rowIdx) ? -1 : 1;
      let colSlot = 0;
      for (let c = 1; c <= numCols && colSlot < 24; c++) {
        if (excludedColumns?.has(c)) continue;
        const colMultiplier = flippedColumns?.has(c) ? -1 : 1;
        const val = typeof row[c] === 'number' ? row[c] as number : parseFloat(String(row[c] || '0').replace(/[,$]/g, ''));
        if (!isNaN(val)) values[colSlot] += val * rowMultiplier * colMultiplier;
        colSlot++;
      }
    });

    // Map each column slot to a year_month
    let totalSlots = 0;
    for (let c = 1; c <= numCols; c++) {
      if (excludedColumns?.has(c)) continue;
      totalSlots++;
    }

    for (let i = 0; i < totalSlots && i < 24; i++) {
      const totalMonthIdx = (startMonth - 1) + i;
      const year = startYear + Math.floor(totalMonthIdx / 12);
      const month = (totalMonthIdx % 12) + 1;
      const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

      if (values[i] !== 0) {
        rows.push({
          year_month: yearMonth,
          account_key: accountKey,
          account_label: fieldName,
          value: Math.round(values[i] * 100) / 100,
        });
      }
    }
  });

  return rows;
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

/**
 * Detect the first month/year from column headers of the uploaded file.
 * Returns { month, year } or null if not detectable.
 */
export function detectFirstMonthFromHeaders(headers: string[]): { month: number; year: number } | null {
  for (const h of headers) {
    const parsed = parseDateFromHeader(h);
    if (parsed && parsed.month && parsed.year) {
      return { month: parsed.month, year: parsed.year };
    }
  }
  return null;
}

export function applyMappingsToModel(
  fieldMappings: Record<string, FieldMapping[]>,
  selectedFile: AnalyzedFile,
  updateModel: (updater: (prev: import('./types').SaaSModelData) => import('./types').SaaSModelData) => void,
  flippedRows?: Set<number>,
  excludedColumns?: Set<number>,
  flippedColumns?: Set<number>,
  startDate?: { month: number; year: number } | null,
) {
  updateModel(prev => {
    const updated = { ...prev };

    // Update months timeline if a start date is provided
    if (startDate) {
      updated.months = generateMonths(startDate.year, startDate.month);
    }

    Object.entries(fieldMappings).forEach(([fieldName, mappings]) => {
      const path = getFieldPath(fieldName as MappingFieldName);
      if (!path.length) return;

      const sheet = selectedFile.sheets.find(s => s.name === mappings[0]?.sheet) || selectedFile.sheets[0];
      const numCols = Math.min(24, (sheet.data[0]?.length || 1) - 1);
      const values = new Array(24).fill(0);

      mappings.forEach(m => {
        const row = sheet.data[m.rowIdx];
        if (!row) return;
        const rowMultiplier = flippedRows?.has(m.rowIdx) ? -1 : 1;
        let colSlot = 0;
        for (let c = 1; c <= numCols && colSlot < 24; c++) {
          if (excludedColumns?.has(c)) continue;
          const colMultiplier = flippedColumns?.has(c) ? -1 : 1;
          const val = typeof row[c] === 'number' ? row[c] as number : parseFloat(String(row[c] || '0').replace(/[,$]/g, ''));
          if (!isNaN(val)) values[colSlot] += val * rowMultiplier * colMultiplier;
          colSlot++;
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

/**
 * Parse a date from a column header string.
 * Supports formats: "Dec 2025", "December 2025", "12/2025", "2025-12", "Dec-25", "FY2025 Q4", "Q4 2025", "2025"
 */
export function parseDateFromHeader(header: string): { month: number | null; year: number | null; quarter: number | null } | null {
  if (!header || !header.trim()) return null;
  const h = header.trim();

  // Month-Year formats
  const MONTHS: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
    oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  };

  // "Dec 2025", "December 2025", "Dec-2025"
  const monthYearFull = h.match(/^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[.\s-]+(\d{4})$/i);
  if (monthYearFull) {
    const month = MONTHS[monthYearFull[1].toLowerCase().slice(0, 3)];
    return { month, year: parseInt(monthYearFull[2]), quarter: null };
  }

  // "Dec-25", "Dec 25" (2-digit year)
  const monthYearShort = h.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[.\s-]+(\d{2})$/i);
  if (monthYearShort) {
    const month = MONTHS[monthYearShort[1].toLowerCase().slice(0, 3)];
    const yr = parseInt(monthYearShort[2]);
    const year = yr >= 50 ? 1900 + yr : 2000 + yr;
    return { month, year, quarter: null };
  }

  // "12/2025" or "2025-12"
  const numericSlash = h.match(/^(\d{1,2})[/\-](\d{4})$/);
  if (numericSlash) {
    const a = parseInt(numericSlash[1]), b = parseInt(numericSlash[2]);
    if (a >= 1 && a <= 12) return { month: a, year: b, quarter: null };
  }
  const numericDash = h.match(/^(\d{4})[/\-](\d{1,2})$/);
  if (numericDash) {
    const yr = parseInt(numericDash[1]), m = parseInt(numericDash[2]);
    if (m >= 1 && m <= 12) return { month: m, year: yr, quarter: null };
  }

  // "FY2025 Q4", "Q4 2025", "FY2025", "FY25"
  const fyQ = h.match(/^(?:fy\s*)?(\d{2,4})\s*q(\d)$/i) || h.match(/^q(\d)\s*(?:fy\s*)?(\d{2,4})$/i);
  if (fyQ) {
    const parts = h.match(/^q(\d)/i) ? [fyQ[2], fyQ[1]] : [fyQ[1], fyQ[2]];
    let yr = parseInt(parts[0]);
    if (yr < 100) yr = yr >= 50 ? 1900 + yr : 2000 + yr;
    const q = parseInt(parts[1]);
    if (q >= 1 && q <= 4) return { month: null, year: yr, quarter: q };
  }

  const fyOnly = h.match(/^fy\s*(\d{2,4})$/i);
  if (fyOnly) {
    let yr = parseInt(fyOnly[1]);
    if (yr < 100) yr = yr >= 50 ? 1900 + yr : 2000 + yr;
    return { month: null, year: yr, quarter: null };
  }

  // Plain year
  const plainYear = h.match(/^(\d{4})$/);
  if (plainYear) return { month: null, year: parseInt(plainYear[1]), quarter: null };

  return null;
}

/**
 * Validate extracted dates for sequentiality and gaps.
 * Returns warnings for non-sequential or gapped dates.
 */
export interface DateWarning {
  colIndex: number;
  header: string;
  type: 'gap' | 'non-sequential' | 'ambiguous';
  message: string;
}

export function validateDateSequence(headers: string[]): DateWarning[] {
  const warnings: DateWarning[] = [];
  const parsed = headers.map(h => parseDateFromHeader(h));
  
  let lastDate: { month: number | null; year: number | null } | null = null;
  for (let i = 0; i < parsed.length; i++) {
    const d = parsed[i];
    if (!d || !d.year) continue;
    
    if (lastDate && lastDate.year) {
      // Check for non-sequential years
      if (d.month && lastDate.month) {
        const curr = d.year * 12 + d.month;
        const prev = lastDate.year * 12 + lastDate.month;
        const diff = Math.abs(curr - prev);
        if (diff > 2 && diff !== 12) {
          warnings.push({
            colIndex: i,
            header: headers[i],
            type: 'gap',
            message: `Gap detected: ${headers[i - 1] || 'prev'} → ${headers[i]} (${diff} month gap)`,
          });
        }
      }
    }
    lastDate = d;
  }
  return warnings;
}
