/**
 * Master Plan "Financials" tab: basic P&L plan figures by segment, entered
 * monthly and quarterly. Stored in insights_metric_targets as
 * metric_key = plan:financials:{segment}:{row}, period_month = YYYY-MM or YYYY-Qn.
 */
export type FinancialFormat = 'currency' | 'percent' | 'number';

export const FINANCIAL_SEGMENTS = [
  { key: 'consolidated', label: 'Consolidated / Parent' },
  { key: 'finserv', label: 'FinServ' },
  { key: 'debt', label: 'Debt Services' },
  { key: 'tech', label: 'Tech' },
] as const;

export const FINANCIAL_ROWS: { key: string; label: string; format: FinancialFormat }[] = [
  { key: 'revenue', label: 'Revenue', format: 'currency' },
  { key: 'gross-margin', label: 'Gross Margin', format: 'currency' },
  { key: 'gross-margin-pct', label: 'Gross Margin %', format: 'percent' },
  { key: 'total-opex', label: 'Total Operating Expenses', format: 'currency' },
  { key: 'total-firm-expenses', label: 'Total Firm Expenses (COGS+OP)', format: 'currency' },
  { key: 'net-operating-income', label: 'Net Operating Income', format: 'currency' },
  { key: 'margin-pct', label: 'Margin %', format: 'percent' },
];

/** TTM per-head efficiency rows, shown under every segment. */
export const FINANCIAL_TTM_ROWS: { key: string; label: string; format: FinancialFormat }[] = [
  { key: 'ttm-revenue-per-head', label: 'TTM Revenue/Head', format: 'currency' },
  { key: 'ttm-gross-profit-per-head', label: 'TTM Gross Profit/Head', format: 'currency' },
  { key: 'ttm-operating-profit-per-head', label: 'TTM Operating Profit/Head', format: 'currency' },
  { key: 'ttm-operating-cashflow-per-head', label: 'TTM Operating Cashflow/Head', format: 'currency' },
];

export type FinancialRowPart = 'all' | 'base' | 'ttm';
/** Rows for one segment. Consolidated adds TTM Avg Headcount; segment units label total expenses as unit expenses.
 *  'base' = P&L rows (Financials tab), 'ttm' = TTM rows (KPIs & Metrics tab); storage keys are the same either way. */
export function financialRowsFor(segment: string, part: FinancialRowPart = 'all') {
  const base = FINANCIAL_ROWS.map((r) =>
    r.key === 'total-firm-expenses' && segment !== 'consolidated' ? { ...r, label: 'Total Unit Expenses (COGS+OP)' } : r,
  );
  const ttm = segment === 'consolidated'
    ? [{ key: 'ttm-avg-headcount', label: 'TTM Avg Headcount', format: 'number' as FinancialFormat }, ...FINANCIAL_TTM_ROWS]
    : FINANCIAL_TTM_ROWS;
  return part === 'base' ? base : part === 'ttm' ? ttm : [...base, ...ttm];
}

/** Master Plan month header label, MMM-YY (e.g. Jan-27). */
export function monthHeaderLabel(year: number, monthIndex: number) {
  const m = new Date(year, monthIndex, 1).toLocaleDateString('en-US', { month: 'short' });
  return `${m}-${String(year % 100).padStart(2, '0')}`;
}

export const FINANCIAL_YEARS = [2026, 2027, 2028];

export function financialMetricKey(segment: string, row: string) {
  return `plan:financials:${segment}:${row}`;
}

export function financialPeriods(year: number, mode: 'monthly' | 'quarterly') {
  if (mode === 'quarterly') return [1, 2, 3, 4].map((q) => ({ key: `${year}-Q${q}`, label: `Q${q} ${year}` }));
  return Array.from({ length: 12 }, (_, i) => ({
    key: `${year}-${String(i + 1).padStart(2, '0')}`,
    label: monthHeaderLabel(year, i),
  }));
}

/** Parse typed input. Currency accepts $ and commas; percent accepts "82", "82%" or "-19%". Stored as the percent number (82 = 82%). */
export function parseFinancialInput(raw: string): number | null {
  const s = raw.replace(/[$,%\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error('Enter a number');
  return n;
}

/** Excel-style display: "$#,##0" for currency, "0%" for percent. */
export function formatFinancial(value: number, format: FinancialFormat): string {
  if (format === 'percent') return `${Math.round(value)}%`;
  if (format === 'number') return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
  const r = Math.round(value);
  return `${r < 0 ? '-' : ''}$${Math.abs(r).toLocaleString('en-US')}`;
}
