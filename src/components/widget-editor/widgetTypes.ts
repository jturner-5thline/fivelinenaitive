export type DataType = 'number' | 'string' | 'date';
export type FieldSource = 'quickbooks' | 'hubspot' | 'naitive';

export interface Field {
  id: string;
  name: string;
  group: 'Financials' | 'AccountDim' | 'DateDim' | 'General' | 'System';
  dataType: DataType;
  isMeasure: boolean;
  source: FieldSource;
}

export type Grain = 'day' | 'week' | 'month' | 'quarter' | 'year';

export type TimeWindow = 'mtd' | 'lastMonth' | 'qtd' | 'lastQuarter' | 'ytd' | 'lastYear' | 'ttm' | 'last3Months' | 'last6Months' | 'last12Months' | 'all' | 'custom';

export interface AxisConfig {
  fieldId: string | null;
  grain?: Grain;
  window?: TimeWindow;
  showZeroPeriods?: boolean;
}

export interface SeriesConfig {
  fieldId: string | null;
  mode: 'single' | 'many';
}

export interface ValueConfig {
  fieldId: string | null;
  agg: 'sum' | 'avg' | 'count';
  format: 'currency' | 'percent' | 'number';
  breakdown?: 'total' | 'byAccount';
  accountFilter?: string[]; // QB account IDs to include (empty = all)
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

export interface WidgetConfig {
  id: string;
  name: string;
  type: 'table' | 'columnChart' | 'kpi' | 'bar' | 'line' | 'column' | 'stackedBar';
  datasetId: string;
  entityId?: string | null;
  xAxis: AxisConfig;
  series: SeriesConfig;
  values: ValueConfig[];
  filters: FilterConfig[];
  formula?: FormulaConfig;
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
