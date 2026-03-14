export type DataType = 'number' | 'string' | 'date';

export interface Field {
  id: string;
  name: string;
  group: 'Financials' | 'AccountDim' | 'DateDim' | 'General' | 'System';
  dataType: DataType;
  isMeasure: boolean;
}

export type Grain = 'day' | 'month' | 'quarter' | 'year';

export interface AxisConfig {
  fieldId: string | null;
  grain?: Grain;
  window?: 'last3Months' | 'ytd' | 'all' | 'custom';
}

export interface SeriesConfig {
  fieldId: string | null;
  mode: 'single' | 'many';
}

export interface ValueConfig {
  fieldId: string | null;
  agg: 'sum' | 'avg' | 'count';
  format: 'currency' | 'percent' | 'number';
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
  type: 'table' | 'columnChart' | 'kpi';
  datasetId: string;
  xAxis: AxisConfig;
  series: SeriesConfig;
  values: ValueConfig[];
  filters: FilterConfig[];
  formula?: FormulaConfig;
}

// ---------- seed data ----------

export const SEED_FIELDS: Field[] = [
  // Financials
  { id: 'f-amount',       name: 'Amount',          group: 'Financials', dataType: 'number', isMeasure: true },
  { id: 'f-budget',       name: 'Budget',          group: 'Financials', dataType: 'number', isMeasure: true },
  { id: 'f-variance',     name: 'Variance',        group: 'Financials', dataType: 'number', isMeasure: true },
  { id: 'f-revenue',      name: 'Revenue',         group: 'Financials', dataType: 'number', isMeasure: true },
  { id: 'f-cogs',         name: 'COGS',            group: 'Financials', dataType: 'number', isMeasure: true },
  // Account Dim
  { id: 'a-full',         name: 'Account Full',    group: 'AccountDim', dataType: 'string', isMeasure: false },
  { id: 'a-parent',       name: 'Account Parent',  group: 'AccountDim', dataType: 'string', isMeasure: false },
  { id: 'a-type',         name: 'Account Type',    group: 'AccountDim', dataType: 'string', isMeasure: false },
  // Date Dim
  { id: 'd-report',       name: 'Reporting Month', group: 'DateDim',    dataType: 'date',   isMeasure: false },
  { id: 'd-fiscal',       name: 'Fiscal Quarter',  group: 'DateDim',    dataType: 'date',   isMeasure: false },
  { id: 'd-year',         name: 'Fiscal Year',     group: 'DateDim',    dataType: 'date',   isMeasure: false },
  // General
  { id: 'g-dept',         name: 'Department',      group: 'General',    dataType: 'string', isMeasure: false },
  { id: 'g-entity',       name: 'Entity',          group: 'General',    dataType: 'string', isMeasure: false },
  { id: 'g-region',       name: 'Region',          group: 'General',    dataType: 'string', isMeasure: false },
  // System
  { id: 's-created',      name: 'Created Date',    group: 'System',     dataType: 'date',   isMeasure: false },
  { id: 's-user',         name: 'Created By',      group: 'System',     dataType: 'string', isMeasure: false },
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
