export type DataType = 'number' | 'string' | 'date';
export type FieldSource = 'quickbooks' | 'hubspot' | 'naitive';

export interface Field {
  id: string;
  name: string;
  group: 'Financials' | 'AccountDim' | 'DateDim' | 'General' | 'System' | 'Pipeline' | 'DealMetrics' | 'Conversion' | 'Timing' | 'Activity' | 'Lenders';
  dataType: DataType;
  isMeasure: boolean;
  source: FieldSource;
}

export type Grain = 'day' | 'week' | 'month' | 'quarter' | 'year';

export type TimeWindow = 'mtd' | 'lastMonth' | 'qtd' | 'lastQuarter' | 'ytd' | 'lastYear' | 'ttm' | 'last3Months' | 'last6Months' | 'last12Months' | 'all' | 'custom' | '7d' | '30d' | '90d';

export interface AxisConfig {
  fieldId: string | null;
  label?: string;
  grain?: Grain;
  window?: TimeWindow;
  /** Used when window === 'custom' (or for arbitrary ranges driven by the global selector). */
  customRange?: { start: string; end: string };
  showZeroPeriods?: boolean;
}

export interface SeriesConfig {
  fieldId: string | null;
  label?: string;
  mode: 'single' | 'many';
}

export type ValueCombineOp = '+' | '-' | '*' | '/';

export interface ValueConfig {
  fieldId: string | null;
  label?: string; // Persisted display name (for QB accounts or custom labels)
  agg: 'sum' | 'avg' | 'count';
  format: 'currency' | 'percent' | 'number';
  breakdown?: 'total' | 'byAccount' | 'byEntity';
  accountFilter?: string[]; // QB account IDs to include (empty = all)
  combineOp?: ValueCombineOp; // How to combine with previous value (first value has none)
}

export interface FilterConfig {
  id: string;
  fieldId: string;
  operator: 'eq' | 'neq' | 'in' | 'gte' | 'lte';
  values: (string | number)[];
  scope: 'widget' | 'dashboard';
}

export interface FormulaConfig {
  expression: string;
}

export interface ComparisonConfig {
  enabled: boolean;
  compareTo: 'previous' | 'yoy' | 'custom';
  displayAs: '$' | '%' | 'both';
  colorCode: boolean;
}

export interface TrendLineConfig {
  enabled: boolean;
  type: 'linear' | 'movingAvg' | 'polynomial';
  window: number;
}

export interface DataLabelsConfig {
  enabled: boolean;
  position: 'above' | 'inside' | 'below';
  showPeriodTotals?: boolean;
}

export interface NegativeStylingConfig {
  enableNegativeStyling: boolean;
  negativeThreshold: number;
  negativeColor: string; // HSL string
}

// ──── KPI Detail Card ────
export type KPIComparisonMode = 'vs Previous Period' | 'vs Previous Year' | 'vs Plan/Budget';
export type KPILayoutVariant = 'full' | 'compact';

export interface KPIBreakdownColumn {
  label: string;
  valueField: string | null;
  varianceField: string | null;
  entityId?: string | null;
}

export interface KPIDetailCardConfig {
  cardTitle: string;
  mainValueField: string | null;
  comparisonMode: KPIComparisonMode;
  comparisonSourceField: string | null;
  breakdownColumns: 1 | 2;
  layoutVariant: KPILayoutVariant;
  footerLabel?: string;
  left: KPIBreakdownColumn;
  right: KPIBreakdownColumn;
}

export const DEFAULT_KPI_DETAIL_CARD_CONFIG: KPIDetailCardConfig = {
  cardTitle: 'KPI Detail',
  mainValueField: null,
  comparisonMode: 'vs Previous Period',
  comparisonSourceField: null,
  breakdownColumns: 2,
  layoutVariant: 'full',
  footerLabel: '',
  left: { label: '', valueField: null, varianceField: null },
  right: { label: '', valueField: null, varianceField: null },
};

export interface WidgetConfig {
  id: string;
  name: string;
  type: 'table' | 'columnChart' | 'kpi' | 'bar' | 'line' | 'column' | 'stackedBar' | 'kpiDetail';
  datasetId: string;
  entityId?: string | null;
  xAxis: AxisConfig;
  series: SeriesConfig;
  values: ValueConfig[];
  filters: FilterConfig[];
  formula?: FormulaConfig;
  comparison?: ComparisonConfig;
  trendLine?: TrendLineConfig;
  dataLabels?: DataLabelsConfig;
  negativeStyling?: NegativeStylingConfig;
  kpiDetailConfig?: KPIDetailCardConfig;
}

// ---------- seed data ----------

export const SEED_FIELDS: Field[] = [
  // Financials — QuickBooks
  { id: 'f-amount',       name: 'Amount',          group: 'Financials', dataType: 'number', isMeasure: true,  source: 'quickbooks' },
  { id: 'f-budget',       name: 'Budget',          group: 'Financials', dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'f-variance',     name: 'Variance',        group: 'Financials', dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'f-revenue',      name: 'Revenue',         group: 'Financials', dataType: 'number', isMeasure: true,  source: 'quickbooks' },
  { id: 'f-total-revenue', name: 'Total Revenue',   group: 'Financials', dataType: 'number', isMeasure: true,  source: 'quickbooks' },
  { id: 'f-cogs',         name: 'COGS',            group: 'Financials', dataType: 'number', isMeasure: true,  source: 'quickbooks' },
  { id: 'f-expenses',     name: 'Expenses',        group: 'Financials', dataType: 'number', isMeasure: true,  source: 'quickbooks' },
  { id: 'f-net-income',   name: 'Net Income',      group: 'Financials', dataType: 'number', isMeasure: true,  source: 'quickbooks' },
  // Financials — HubSpot
  { id: 'f-deal-amount',  name: 'Deal Amount',     group: 'Financials', dataType: 'number', isMeasure: true,  source: 'hubspot' },
  { id: 'f-pipeline-val', name: 'Pipeline Value',  group: 'Financials', dataType: 'number', isMeasure: true,  source: 'hubspot' },
  { id: 'f-win-rate',     name: 'Win Rate',        group: 'Financials', dataType: 'number', isMeasure: true,  source: 'hubspot' },
  // Account Dim
  { id: 'a-full',         name: 'Account Full',    group: 'AccountDim', dataType: 'string', isMeasure: false, source: 'quickbooks' },
  { id: 'a-parent',       name: 'Account Parent',  group: 'AccountDim', dataType: 'string', isMeasure: false, source: 'quickbooks' },
  { id: 'a-type',         name: 'Account Type',    group: 'AccountDim', dataType: 'string', isMeasure: false, source: 'quickbooks' },
  // Date Dim
  { id: 'd-report',       name: 'Reporting Month', group: 'DateDim',    dataType: 'date',   isMeasure: false, source: 'naitive' },
  { id: 'd-fiscal',       name: 'Fiscal Quarter',  group: 'DateDim',    dataType: 'date',   isMeasure: false, source: 'naitive' },
  { id: 'd-year',         name: 'Fiscal Year',     group: 'DateDim',    dataType: 'date',   isMeasure: false, source: 'naitive' },
  // General — HubSpot
  { id: 'g-deal-stage',   name: 'Deal Stage',      group: 'General',    dataType: 'string', isMeasure: false, source: 'hubspot' },
  { id: 'g-deal-owner',   name: 'Deal Owner',      group: 'General',    dataType: 'string', isMeasure: false, source: 'hubspot' },
  // General — naitive
  { id: 'g-dept',         name: 'Department',      group: 'General',    dataType: 'string', isMeasure: false, source: 'naitive' },
  { id: 'g-entity',       name: 'Entity',          group: 'General',    dataType: 'string', isMeasure: false, source: 'naitive' },
  { id: 'g-region',       name: 'Region',          group: 'General',    dataType: 'string', isMeasure: false, source: 'naitive' },
  // System
  { id: 's-created',      name: 'Created Date',    group: 'System',     dataType: 'date',   isMeasure: false, source: 'naitive' },
  { id: 's-user',         name: 'Created By',      group: 'System',     dataType: 'string', isMeasure: false, source: 'naitive' },

  // ──── Pipeline Metrics (naitive) ────
  { id: 'n-active-pipeline',      name: 'Active Pipeline Value',      group: 'Pipeline',     dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-active-deal-count',    name: 'Active Deal Count',          group: 'Pipeline',     dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-pipeline-by-stage',    name: 'Pipeline by Stage',          group: 'Pipeline',     dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-pipeline-by-type',     name: 'Pipeline by Deal Type',      group: 'Pipeline',     dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-pipeline-by-owner',    name: 'Pipeline by Owner',          group: 'Pipeline',     dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-weighted-pipeline',    name: 'Weighted Pipeline',          group: 'Pipeline',     dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-pipeline-growth',      name: 'Pipeline Growth (MoM)',      group: 'Pipeline',     dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-new-deals-added',      name: 'New Deals Added',            group: 'Pipeline',     dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-deals-lost',           name: 'Deals Lost',                 group: 'Pipeline',     dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-deals-on-hold',        name: 'Deals On Hold',              group: 'Pipeline',     dataType: 'number', isMeasure: true,  source: 'naitive' },

  // ──── Deal Metrics (naitive) ────
  { id: 'n-closed-won-value',     name: 'Closed Won Value',           group: 'DealMetrics',  dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-closed-won-count',     name: 'Closed Won Count',           group: 'DealMetrics',  dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-closed-lost-value',    name: 'Closed Lost Value',          group: 'DealMetrics',  dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-closed-lost-count',    name: 'Closed Lost Count',          group: 'DealMetrics',  dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-avg-deal-size',        name: 'Avg Deal Size',              group: 'DealMetrics',  dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-median-deal-size',     name: 'Median Deal Size',           group: 'DealMetrics',  dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-total-fees',           name: 'Total Fees Earned',          group: 'DealMetrics',  dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-avg-fee',              name: 'Average Fee',                group: 'DealMetrics',  dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-deal-value',           name: 'Deal Value',                 group: 'DealMetrics',  dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-deal-probability',     name: 'Deal Probability',           group: 'DealMetrics',  dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-ytd-closed-value',     name: 'YTD Closed Value',           group: 'DealMetrics',  dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-qtd-closed-value',     name: 'QTD Closed Value',           group: 'DealMetrics',  dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-ttm-closed-value',     name: 'TTM Closed Value',           group: 'DealMetrics',  dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-funded-value',         name: 'Funded Value',               group: 'DealMetrics',  dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-funded-count',         name: 'Funded Count',               group: 'DealMetrics',  dataType: 'number', isMeasure: true,  source: 'naitive' },

  // ──── Conversion Metrics (naitive) ────
  { id: 'n-win-rate',             name: 'Win Rate',                   group: 'Conversion',   dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-loss-rate',            name: 'Loss Rate',                  group: 'Conversion',   dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-stage-conversion',     name: 'Stage Conversion Rate',      group: 'Conversion',   dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-funnel-dropoff',       name: 'Funnel Drop-off Rate',       group: 'Conversion',   dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-proposal-to-close',    name: 'Proposal to Close Rate',     group: 'Conversion',   dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-qualified-rate',       name: 'Qualification Rate',         group: 'Conversion',   dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-lender-pass-rate',     name: 'Lender Pass Rate',           group: 'Conversion',   dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-lender-approval-rate', name: 'Lender Approval Rate',       group: 'Conversion',   dataType: 'number', isMeasure: true,  source: 'naitive' },

  // ──── Timing Metrics (naitive) ────
  { id: 'n-avg-days-to-close',    name: 'Avg Days to Close',          group: 'Timing',       dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-median-days-to-close', name: 'Median Days to Close',       group: 'Timing',       dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-avg-days-in-stage',    name: 'Avg Days in Stage',          group: 'Timing',       dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-deal-velocity',        name: 'Deal Velocity',              group: 'Timing',       dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-time-to-first-lender', name: 'Time to First Lender',       group: 'Timing',       dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-time-to-term-sheet',   name: 'Time to Term Sheet',         group: 'Timing',       dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-time-to-funding',      name: 'Time to Funding',            group: 'Timing',       dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-stale-deals',          name: 'Stale Deals (No Activity)',   group: 'Timing',       dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-overdue-milestones',   name: 'Overdue Milestones',         group: 'Timing',       dataType: 'number', isMeasure: true,  source: 'naitive' },

  // ──── Activity Metrics (naitive) ────
  { id: 'n-total-activities',     name: 'Total Activities',           group: 'Activity',     dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-activities-this-week', name: 'Activities This Week',       group: 'Activity',     dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-activities-by-type',   name: 'Activities by Type',         group: 'Activity',     dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-activities-by-user',   name: 'Activities by User',         group: 'Activity',     dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-meetings-count',       name: 'Meetings Count',             group: 'Activity',     dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-emails-sent',          name: 'Emails Sent',                group: 'Activity',     dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-notes-created',        name: 'Notes Created',              group: 'Activity',     dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-tasks-completed',      name: 'Tasks Completed',            group: 'Activity',     dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-tasks-overdue',        name: 'Tasks Overdue',              group: 'Activity',     dataType: 'number', isMeasure: true,  source: 'naitive' },

  // ──── Lender Metrics (naitive) ────
  { id: 'n-total-lenders',        name: 'Total Lenders',              group: 'Lenders',      dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-active-lenders',       name: 'Active Funding Sources',             group: 'Lenders',      dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-lenders-by-stage',     name: 'Lenders by Stage',           group: 'Lenders',      dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-lenders-by-tier',      name: 'Lenders by Tier',            group: 'Lenders',      dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-avg-lenders-per-deal', name: 'Avg Lenders per Deal',       group: 'Lenders',      dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-lender-response-time', name: 'Avg Lender Response Time',   group: 'Lenders',      dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-term-sheets-received', name: 'Term Sheets Received',       group: 'Lenders',      dataType: 'number', isMeasure: true,  source: 'naitive' },
  { id: 'n-term-sheet-rate',      name: 'Term Sheet Rate',            group: 'Lenders',      dataType: 'number', isMeasure: true,  source: 'naitive' },

  // ──── Deal Dimensions (naitive) ────
  { id: 'n-deal-stage',           name: 'Deal Stage',                 group: 'General',      dataType: 'string', isMeasure: false, source: 'naitive' },
  { id: 'n-deal-status',          name: 'Deal Status',                group: 'General',      dataType: 'string', isMeasure: false, source: 'naitive' },
  { id: 'n-deal-type',            name: 'Deal Type',                  group: 'General',      dataType: 'string', isMeasure: false, source: 'naitive' },
  { id: 'n-deal-owner',           name: 'Deal Owner',                 group: 'General',      dataType: 'string', isMeasure: false, source: 'naitive' },
  { id: 'n-deal-company',         name: 'Deal Company',               group: 'General',      dataType: 'string', isMeasure: false, source: 'naitive' },
  { id: 'n-pipeline',             name: 'Pipeline',                   group: 'General',      dataType: 'string', isMeasure: false, source: 'naitive' },
  { id: 'n-deal-created-date',    name: 'Deal Created Date',          group: 'DateDim',      dataType: 'date',   isMeasure: false, source: 'naitive' },
  { id: 'n-deal-closed-date',     name: 'Deal Closed Date',           group: 'DateDim',      dataType: 'date',   isMeasure: false, source: 'naitive' },
  { id: 'n-deal-funded-date',     name: 'Deal Funded Date',           group: 'DateDim',      dataType: 'date',   isMeasure: false, source: 'naitive' },
  { id: 'n-expected-close-date',  name: 'Expected Close Date',        group: 'DateDim',      dataType: 'date',   isMeasure: false, source: 'naitive' },
];

export const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  id: 'new-widget',
  name: 'Untitled Widget',
  type: 'table',
  datasetId: 'ds-gl',
  xAxis: { fieldId: null, grain: 'month', window: 'last3Months' },
  series: { fieldId: null, mode: 'single' },
  values: [],
  filters: [],
  formula: undefined,
};

// helper to look up field by id
export function getField(fieldId: string | null): Field | undefined {
  if (!fieldId) return undefined;
  return SEED_FIELDS.find((f) => f.id === fieldId);
}

// For QB COA account drag items, the fieldId starts with 'qb-account-'
export function isQBAccountField(fieldId: string | null): boolean {
  return !!fieldId && fieldId.startsWith('qb-account-');
}
