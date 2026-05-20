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
  // Full pre-edit pre-image of every server-persisted slice that any
  // saved cash-flow change can mutate. Captured at pushUndo() time so
  // performUndo() can deterministically reverse the most recent edit:
  //  - scheduledItems: full row list — covers add/edit/delete of recurring
  //    or one-time entries, drilldown saves, Configure popup saves, and
  //    per-period `amount_overrides` flips ("For this Period Only").
  //    "Going Forward" edits are reversed because we restore the prior
  //    base `amount` and `frequency_config` for the row.
  //  - weeklyOverrides: explicit Beginning/Ending/Net cell overrides.
  //  - creditFacilities: LOC / facility configuration list.
  // Typed loosely (any[]) here to avoid a circular import with the
  // scheduled-cash-flow type module — the consumer narrows on use.
  scheduledItems?: any[];
  weeklyOverrides?: Record<string, any>;
  creditFacilities?: any[];
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
  /**
   * Per-week manual override for "Add'l Liquidity (Delayed Draw)".
   * When undefined, the row defaults to the previous week's TOTAL CASH ON HAND.
   */
  addlLiquidity?: number;
}
export type WeeklyOverrides = Record<string, WeeklyCashOverride>;

// =====================================================================
// Line of Credit / Credit Facilities
// =====================================================================
// A facility (e.g. "SVB Line of Credit") with a total commitment, an
// initial drawn balance, and an active date range. Available LOC for a
// given week = facility_amount − running_drawn(week), where running drawn
// is computed from `initial_drawn` plus tagged Configure entries
// (LOC Draw / LOC Repayment) plus per-week manual overrides.
export interface CreditFacility {
  id: string;
  name: string;
  /** Total facility commitment (e.g. 500_000). Always positive. */
  facility_amount: number;
  /**
   * Drawn amount as-of `start_date`. Subsequent weekly running balance is
   * computed forward from here. Always positive (≤ facility_amount).
   */
  initial_drawn: number;
  /** ISO yyyy-mm-dd. Facility effective date — weeks before this show 0. */
  start_date: string;
  /** ISO yyyy-mm-dd or null. Maturity — weeks after this show 0. */
  end_date: string | null;
  /**
   * Optional per-week manual override of the running drawn balance for
   * this facility. Keyed by the same weekKey used in WeeklyData.
   * If present for a given week, it pins the drawn balance for that week
   * and all subsequent weeks (until the next override).
   */
  drawn_overrides?: Record<string, number>;
}

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
  'Debt Advisory Revenue',
  'Retainers',
  'Milestones',
  'Closing Fees',
  'Referral Fees',
  'FinServ Revenue',
  'Technology Revenue',
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
