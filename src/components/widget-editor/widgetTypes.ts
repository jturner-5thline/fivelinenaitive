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
  type: 'table' | 'columnChart' | 'kpi' | 'bar' | 'line' | 'column';
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
  // Check seed fields first, then COA-generated fields
  return SEED_FIELDS.find((f) => f.id === fieldId)
    ?? QB_CHART_OF_ACCOUNTS.flatMap(e => e.accounts).find(a => a.id === fieldId) as Field | undefined;
}

// ---------- QuickBooks entities (realms) ----------

export interface QBEntity {
  id: string;
  name: string;
  realmId: string;
}

export const QB_ENTITIES: QBEntity[] = [
  { id: 'entity-1', name: 'Acme Corp — US Operations', realmId: '4620816365185389260' },
  { id: 'entity-2', name: 'Acme Corp — Canada', realmId: '9130348291837465012' },
  { id: 'entity-3', name: 'Acme Holdings Ltd', realmId: '1284756901234567890' },
];

// ---------- Chart of Accounts per entity ----------

export interface COAAccount {
  id: string;
  name: string;
  fullName: string;
  accountType: 'Income' | 'Expense' | 'COGS' | 'Asset' | 'Liability' | 'Equity' | 'Other';
  parentName?: string;
  group: Field['group'];
  dataType: DataType;
  isMeasure: boolean;
  source: FieldSource;
}

interface EntityCOA {
  entityId: string;
  accounts: COAAccount[];
}

export const QB_CHART_OF_ACCOUNTS: EntityCOA[] = [
  {
    entityId: 'entity-1',
    accounts: [
      // Income
      { id: 'coa-1-sales', name: 'Sales Revenue', fullName: 'Income > Sales Revenue', accountType: 'Income', parentName: 'Income', group: 'Financials', dataType: 'number', isMeasure: true, source: 'quickbooks' },
      { id: 'coa-1-service', name: 'Service Revenue', fullName: 'Income > Service Revenue', accountType: 'Income', parentName: 'Income', group: 'Financials', dataType: 'number', isMeasure: true, source: 'quickbooks' },
      { id: 'coa-1-other-income', name: 'Other Income', fullName: 'Income > Other Income', accountType: 'Income', parentName: 'Income', group: 'Financials', dataType: 'number', isMeasure: true, source: 'quickbooks' },
      // COGS
      { id: 'coa-1-cogs-materials', name: 'Materials', fullName: 'COGS > Materials', accountType: 'COGS', parentName: 'COGS', group: 'Financials', dataType: 'number', isMeasure: true, source: 'quickbooks' },
      { id: 'coa-1-cogs-labor', name: 'Direct Labor', fullName: 'COGS > Direct Labor', accountType: 'COGS', parentName: 'COGS', group: 'Financials', dataType: 'number', isMeasure: true, source: 'quickbooks' },
      // Expenses
      { id: 'coa-1-rent', name: 'Rent & Lease', fullName: 'Expenses > Rent & Lease', accountType: 'Expense', parentName: 'Operating Expenses', group: 'Financials', dataType: 'number', isMeasure: true, source: 'quickbooks' },
      { id: 'coa-1-payroll', name: 'Payroll', fullName: 'Expenses > Payroll', accountType: 'Expense', parentName: 'Operating Expenses', group: 'Financials', dataType: 'number', isMeasure: true, source: 'quickbooks' },
      { id: 'coa-1-utilities', name: 'Utilities', fullName: 'Expenses > Utilities', accountType: 'Expense', parentName: 'Operating Expenses', group: 'Financials', dataType: 'number', isMeasure: true, source: 'quickbooks' },
      { id: 'coa-1-marketing', name: 'Marketing & Advertising', fullName: 'Expenses > Marketing & Advertising', accountType: 'Expense', parentName: 'Operating Expenses', group: 'Financials', dataType: 'number', isMeasure: true, source: 'quickbooks' },
      { id: 'coa-1-insurance', name: 'Insurance', fullName: 'Expenses > Insurance', accountType: 'Expense', parentName: 'Operating Expenses', group: 'Financials', dataType: 'number', isMeasure: true, source: 'quickbooks' },
      { id: 'coa-1-depreciation', name: 'Depreciation', fullName: 'Expenses > Depreciation', accountType: 'Expense', parentName: 'Operating Expenses', group: 'Financials', dataType: 'number', isMeasure: true, source: 'quickbooks' },
    ],
  },
  {
    entityId: 'entity-2',
    accounts: [
      { id: 'coa-2-sales', name: 'Sales Revenue', fullName: 'Income > Sales Revenue', accountType: 'Income', parentName: 'Income', group: 'Financials', dataType: 'number', isMeasure: true, source: 'quickbooks' },
      { id: 'coa-2-consulting', name: 'Consulting Revenue', fullName: 'Income > Consulting Revenue', accountType: 'Income', parentName: 'Income', group: 'Financials', dataType: 'number', isMeasure: true, source: 'quickbooks' },
      { id: 'coa-2-cogs', name: 'Cost of Goods Sold', fullName: 'COGS > Cost of Goods Sold', accountType: 'COGS', parentName: 'COGS', group: 'Financials', dataType: 'number', isMeasure: true, source: 'quickbooks' },
      { id: 'coa-2-salaries', name: 'Salaries & Wages', fullName: 'Expenses > Salaries & Wages', accountType: 'Expense', parentName: 'Operating Expenses', group: 'Financials', dataType: 'number', isMeasure: true, source: 'quickbooks' },
      { id: 'coa-2-rent', name: 'Office Rent', fullName: 'Expenses > Office Rent', accountType: 'Expense', parentName: 'Operating Expenses', group: 'Financials', dataType: 'number', isMeasure: true, source: 'quickbooks' },
      { id: 'coa-2-travel', name: 'Travel & Entertainment', fullName: 'Expenses > Travel & Entertainment', accountType: 'Expense', parentName: 'Operating Expenses', group: 'Financials', dataType: 'number', isMeasure: true, source: 'quickbooks' },
      { id: 'coa-2-professional', name: 'Professional Fees', fullName: 'Expenses > Professional Fees', accountType: 'Expense', parentName: 'Operating Expenses', group: 'Financials', dataType: 'number', isMeasure: true, source: 'quickbooks' },
    ],
  },
  {
    entityId: 'entity-3',
    accounts: [
      { id: 'coa-3-mgmt-fees', name: 'Management Fees', fullName: 'Income > Management Fees', accountType: 'Income', parentName: 'Income', group: 'Financials', dataType: 'number', isMeasure: true, source: 'quickbooks' },
      { id: 'coa-3-intercompany', name: 'Intercompany Revenue', fullName: 'Income > Intercompany Revenue', accountType: 'Income', parentName: 'Income', group: 'Financials', dataType: 'number', isMeasure: true, source: 'quickbooks' },
      { id: 'coa-3-admin', name: 'G&A Expenses', fullName: 'Expenses > G&A Expenses', accountType: 'Expense', parentName: 'Operating Expenses', group: 'Financials', dataType: 'number', isMeasure: true, source: 'quickbooks' },
      { id: 'coa-3-legal', name: 'Legal Fees', fullName: 'Expenses > Legal Fees', accountType: 'Expense', parentName: 'Operating Expenses', group: 'Financials', dataType: 'number', isMeasure: true, source: 'quickbooks' },
      { id: 'coa-3-audit', name: 'Audit & Accounting', fullName: 'Expenses > Audit & Accounting', accountType: 'Expense', parentName: 'Operating Expenses', group: 'Financials', dataType: 'number', isMeasure: true, source: 'quickbooks' },
    ],
  },
];

export function getCOAForEntity(entityId: string): COAAccount[] {
  return QB_CHART_OF_ACCOUNTS.find(e => e.entityId === entityId)?.accounts ?? [];
}
