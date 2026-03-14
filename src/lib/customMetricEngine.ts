/**
 * Custom Metric Formula Engine
 * Supports visual formula building with data source references, 
 * cross-widget references, raw field aggregations, and functions.
 */

// ─── AST Node Types ────────────────────────────────────────────

export interface FormulaNumberNode {
  type: 'number';
  value: number;
}

export interface FormulaSourceNode {
  type: 'source';
  sourceId: string;
  label?: string;
}

export interface FormulaWidgetNode {
  type: 'widget';
  widgetId: string;
  label?: string;
}

export interface FormulaFieldNode {
  type: 'field';
  entity: string;
  field: string;
  aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max';
  filter?: { field: string; op: string; value: string };
  label?: string;
}

export interface FormulaOperatorNode {
  type: 'operator';
  op: '+' | '-' | '*' | '/';
  left: FormulaNode;
  right: FormulaNode;
}

export interface FormulaFunctionNode {
  type: 'function';
  name: string;
  args: FormulaNode[];
}

export type FormulaNode =
  | FormulaNumberNode
  | FormulaSourceNode
  | FormulaWidgetNode
  | FormulaFieldNode
  | FormulaOperatorNode
  | FormulaFunctionNode;

export type FormulaResultType = 'number' | 'currency' | 'percentage';

export interface CustomMetricDefinition {
  id: string;
  user_id: string;
  company_id?: string | null;
  name: string;
  description?: string | null;
  formula: FormulaNode;
  result_type: FormulaResultType;
  format_options?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ─── Evaluation Context ────────────────────────────────────────

export interface FormulaContext {
  sources: Record<string, number>;
  widgets: Record<string, number>;
  resolveField?: (entity: string, field: string, aggregation: string, filter?: FormulaFieldNode['filter']) => number;
}

export function evaluateFormula(node: FormulaNode, ctx: FormulaContext): number {
  switch (node.type) {
    case 'number': return node.value;
    case 'source': return ctx.sources[node.sourceId] ?? 0;
    case 'widget': return ctx.widgets[node.widgetId] ?? 0;
    case 'field':
      return ctx.resolveField?.(node.entity, node.field, node.aggregation, node.filter) ?? 0;
    case 'operator': {
      const l = evaluateFormula(node.left, ctx);
      const r = evaluateFormula(node.right, ctx);
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return r !== 0 ? l / r : 0;
      }
      return 0;
    }
    case 'function': {
      const args = node.args.map(a => evaluateFormula(a, ctx));
      return evalFn(node.name, args);
    }
    default: return 0;
  }
}

function evalFn(name: string, args: number[]): number {
  switch (name.toUpperCase()) {
    case 'ABS': return Math.abs(args[0] ?? 0);
    case 'ROUND': return Math.round(args[0] ?? 0);
    case 'FLOOR': return Math.floor(args[0] ?? 0);
    case 'CEIL': return Math.ceil(args[0] ?? 0);
    case 'MIN': return Math.min(...args);
    case 'MAX': return Math.max(...args);
    case 'SUM': return args.reduce((s, v) => s + v, 0);
    case 'AVG': return args.length > 0 ? args.reduce((s, v) => s + v, 0) / args.length : 0;
    case 'COUNT': return args.length;
    case 'MEDIAN': {
      const sorted = [...args].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }
    case 'IF': return (args[0] ?? 0) > 0 ? (args[1] ?? 0) : (args[2] ?? 0);
    case 'COUNTIF': return args.filter(v => v > 0).length;
    case 'SUMIF': return args.filter(v => v > 0).reduce((s, v) => s + v, 0);
    case 'PCT_CHANGE': return args[0] !== 0 ? ((args[1] - args[0]) / Math.abs(args[0])) * 100 : 0;
    case 'RATIO': return args[1] !== 0 ? args[0] / args[1] : 0;
    case 'PERCENT_OF': return args[1] !== 0 ? (args[0] / args[1]) * 100 : 0;
    case 'MTD': return args[0] ?? 0;
    case 'QTD': return args[0] ?? 0;
    case 'YTD': return args[0] ?? 0;
    case 'LAST_N_DAYS': return args[0] ?? 0;
    case 'DELTA_VS': return args.length >= 2 && args[1] !== 0 ? ((args[0] - args[1]) / Math.abs(args[1])) * 100 : 0;
    default: return 0;
  }
}

// ─── Display helpers ───────────────────────────────────────────

export function formulaToString(node: FormulaNode): string {
  switch (node.type) {
    case 'number': return String(node.value);
    case 'source': return `[${node.label || node.sourceId}]`;
    case 'widget': return `{${node.label || node.widgetId}}`;
    case 'field': return `${node.aggregation.toUpperCase()}(${node.entity}.${node.field})`;
    case 'operator': return `(${formulaToString(node.left)} ${node.op} ${formulaToString(node.right)})`;
    case 'function': return `${node.name}(${node.args.map(formulaToString).join(', ')})`;
    default: return '?';
  }
}

// ─── Palette constants ─────────────────────────────────────────

export interface FormulaFunctionDef {
  name: string;
  description: string;
  args: string;
  category: 'aggregation' | 'conditional' | 'time' | 'math';
}

export const FORMULA_FUNCTIONS: FormulaFunctionDef[] = [
  // Aggregations
  { name: 'SUM', description: 'Sum of values', args: 'values...', category: 'aggregation' },
  { name: 'AVG', description: 'Average of values', args: 'values...', category: 'aggregation' },
  { name: 'COUNT', description: 'Count of items', args: 'values...', category: 'aggregation' },
  { name: 'MIN', description: 'Minimum value', args: 'values...', category: 'aggregation' },
  { name: 'MAX', description: 'Maximum value', args: 'values...', category: 'aggregation' },
  { name: 'MEDIAN', description: 'Median of values', args: 'values...', category: 'aggregation' },
  // Conditional
  { name: 'IF', description: 'Conditional: IF(cond, true, false)', args: 'cond, trueVal, falseVal', category: 'conditional' },
  { name: 'COUNTIF', description: 'Count items matching condition', args: 'field, condition', category: 'conditional' },
  { name: 'SUMIF', description: 'Sum items matching condition', args: 'field, condition', category: 'conditional' },
  // Time
  { name: 'MTD', description: 'Month-to-date value', args: 'metric', category: 'time' },
  { name: 'QTD', description: 'Quarter-to-date value', args: 'metric', category: 'time' },
  { name: 'YTD', description: 'Year-to-date value', args: 'metric', category: 'time' },
  { name: 'LAST_N_DAYS', description: 'Value over last N days', args: 'metric, n', category: 'time' },
  { name: 'DELTA_VS', description: 'Change vs prior period (%)', args: 'metric, period', category: 'time' },
  // Math
  { name: 'ROUND', description: 'Round to N decimals', args: 'value, decimals', category: 'math' },
  { name: 'ABS', description: 'Absolute value', args: 'value', category: 'math' },
  { name: 'PERCENT_OF', description: '(part / total) × 100', args: 'part, total', category: 'math' },
  { name: 'PCT_CHANGE', description: '% change: ((new−old)/old)×100', args: 'old, new', category: 'math' },
  { name: 'RATIO', description: 'Ratio of two values', args: 'numerator, denominator', category: 'math' },
];

export const DEAL_FIELDS = [
  { field: 'value', label: 'Deal Value', entity: 'deal', dataType: '$' },
  { field: 'fee_amount', label: 'Fee Amount', entity: 'deal', dataType: '$' },
  { field: 'fee_percentage', label: 'Fee Percentage', entity: 'deal', dataType: '%' },
  { field: 'id', label: 'Deal Count', entity: 'deal', dataType: '#' },
  { field: 'stage', label: 'Stage', entity: 'deal', dataType: 'text' },
  { field: 'close_date', label: 'Close Date', entity: 'deal', dataType: 'date' },
  { field: 'origination_fee', label: 'Origination Fee', entity: 'deal', dataType: '$' },
  { field: 'status', label: 'Status', entity: 'deal', dataType: 'text' },
] as const;

export const HUBSPOT_FIELDS = [
  { field: 'dealname', label: 'Deal Name', entity: 'hubspot_deal', dataType: 'text' },
  { field: 'amount', label: 'Amount', entity: 'hubspot_deal', dataType: '$' },
  { field: 'pipeline', label: 'Pipeline', entity: 'hubspot_deal', dataType: 'text' },
  { field: 'dealstage', label: 'Deal Stage', entity: 'hubspot_deal', dataType: 'text' },
  { field: 'closedate', label: 'Close Date', entity: 'hubspot_deal', dataType: 'date' },
  { field: 'owner', label: 'Owner', entity: 'hubspot_deal', dataType: 'text' },
] as const;

export const QUICKBOOKS_INVOICE_FIELDS = [
  { field: 'total', label: 'Total', entity: 'qb_invoice', dataType: '$' },
  { field: 'balance', label: 'Balance', entity: 'qb_invoice', dataType: '$' },
  { field: 'due_date', label: 'Due Date', entity: 'qb_invoice', dataType: 'date' },
  { field: 'status', label: 'Status', entity: 'qb_invoice', dataType: 'text' },
] as const;

export const QUICKBOOKS_EXPENSE_FIELDS = [
  { field: 'total', label: 'Total', entity: 'qb_expense', dataType: '$' },
  { field: 'vendor', label: 'Vendor', entity: 'qb_expense', dataType: 'text' },
  { field: 'date', label: 'Date', entity: 'qb_expense', dataType: 'date' },
  { field: 'category', label: 'Category', entity: 'qb_expense', dataType: 'text' },
] as const;

export const ALL_FIELD_GROUPS = [
  { groupLabel: 'naitive > Deals', source: 'naitive' as const, fields: DEAL_FIELDS },
  { groupLabel: 'HubSpot > Deals', source: 'hubspot' as const, fields: HUBSPOT_FIELDS },
  { groupLabel: 'QuickBooks > Invoices', source: 'quickbooks' as const, fields: QUICKBOOKS_INVOICE_FIELDS },
  { groupLabel: 'QuickBooks > Expenses', source: 'quickbooks' as const, fields: QUICKBOOKS_EXPENSE_FIELDS },
];

export const FIELD_AGGREGATIONS = [
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'count', label: 'Count' },
  { value: 'min', label: 'Minimum' },
  { value: 'max', label: 'Maximum' },
] as const;
