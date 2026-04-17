// Types for the Cash Flow Manager

export interface DailyRow {
  label: string;
  entity: string;
  values: number[];
}

export interface DailyData {
  dates: string[];
  rows: Record<string, DailyRow>;
}

export interface WeeklyEntry {
  week_num: number;
  week_ending: string;
  "BEGINNING CASH": number;
  "ENDING CASH": number;
  "Add'l Liquidity (Delayed Draw)": number;
  "TOTAL CASH ON HAND": number;
  [key: string]: number | string;
}

export interface WeeklyData {
  [dateKey: string]: WeeklyEntry;
}

export interface CashInItem {
  name: string;
  amount: number;
  date: string;
  category?: string;
}

export interface SidebarData {
  cash_in_next_8_weeks: CashInItem[];
  notes: string[];
}

export interface WeeklySummary {
  total_cash_in: number;
  total_cash_out: number;
  net_change: number;
  avg_ending_cash: number;
  min_ending_cash: number;
  max_ending_cash: number;
}

export interface DailyRowMeta {
  row_num: number | string;
  label: string;
  entity: string;
  section: 'balance_begin' | 'balance_end' | 'receipts' | 'disbursements' | 'transfers' | 'summary';
  is_total: boolean;
  is_protected: boolean;
  indent: boolean;
}

export interface DailyRowStructure {
  rows: DailyRowMeta[];
}

export interface RecurringTag {
  rowKey: string;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'annual';
  date: string;
}

export interface PlanSnapshot {
  id: string;
  name: string;
  timestamp: string;
  weeklyData: WeeklyData;
}

export interface UndoSnapshot {
  description: string;
  dailyData: DailyData;
  weeklyData: WeeklyData;
  sidebarData: SidebarData;
  recurringTags: RecurringTag[];
}

export interface ActivityLogEntry {
  timestamp: string;
  user: string;
  action: string;
}

export interface ExportArchiveEntry {
  id: string;
  title: string;
  timestamp: string;
  weekCount: number;
  dateRange: string;
  flags: ExportFlag[];
  notes: string;
}

export interface ExportFlag {
  label: string;
  color: string;
}

export type RoleMode = 'admin' | 'viewer';
export type ActiveTab = 'daily' | 'weekly';
export type ThemeMode = 'dark' | 'light';

// Per-week manual overrides for cash position rows.
// Keyed by week dateKey (same key used in WeeklyData). Each value may
// override BEGINNING CASH and/or ENDING CASH for that specific week.
// Precedence: override (if present) > computed value.
export interface WeeklyCashOverride {
  beginningCash?: number;
  endingCash?: number;
}
export type WeeklyOverrides = Record<string, WeeklyCashOverride>;

export const SECTION_KEYS = {
  BALANCE_BEGIN: 'balance_begin',
  BALANCE_END: 'balance_end',
  RECEIPTS: 'receipts',
  DISBURSEMENTS: 'disbursements',
  TRANSFERS: 'transfers',
  SUMMARY: 'summary',
} as const;

// Weekly category mapping for daily-to-weekly aggregation
export const WEEKLY_CATEGORIES = [
  'Revenue Deposits',
  'Customer Payments',
  'Consulting Fees',
  'Loan Proceeds',
  'Other Receipts',
  'Advertising & Marketing',
  'Insurance',
  'Payroll - Salaries',
  'Payroll - Taxes & Benefits',
  'Contractors & Consultants',
  'Rent & Occupancy',
  'Software & Technology',
  'Legal & Professional',
  'Travel & Entertainment',
  'Office & Admin',
  'Loan Payments',
  'Other Disbursements',
  'Internal Transfers',
] as const;
