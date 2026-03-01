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
    case 'IF': return (args[0] ?? 0) > 0 ? (args[1] ?? 0) : (args[2] ?? 0);
    case 'PCT_CHANGE': return args[0] !== 0 ? ((args[1] - args[0]) / Math.abs(args[0])) * 100 : 0;
    case 'RATIO': return args[1] !== 0 ? args[0] / args[1] : 0;
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

export const FORMULA_FUNCTIONS = [
  { name: 'SUM', description: 'Sum of values', args: 'values...' },
  { name: 'AVG', description: 'Average of values', args: 'values...' },
  { name: 'MIN', description: 'Minimum value', args: 'values...' },
  { name: 'MAX', description: 'Maximum value', args: 'values...' },
  { name: 'ABS', description: 'Absolute value', args: 'value' },
  { name: 'ROUND', description: 'Round to nearest integer', args: 'value' },
  { name: 'IF', description: 'Conditional: IF(condition, true, false)', args: 'cond, trueVal, falseVal' },
  { name: 'PCT_CHANGE', description: '% change: ((new−old)/old)×100', args: 'old, new' },
  { name: 'RATIO', description: 'Ratio of two values', args: 'numerator, denominator' },
] as const;

export const DEAL_FIELDS = [
  { field: 'value', label: 'Deal Value', entity: 'deal' },
  { field: 'fee_amount', label: 'Fee Amount', entity: 'deal' },
  { field: 'fee_percentage', label: 'Fee Percentage', entity: 'deal' },
  { field: 'id', label: 'Deal Count', entity: 'deal' },
] as const;

export const FIELD_AGGREGATIONS = [
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'count', label: 'Count' },
  { value: 'min', label: 'Minimum' },
  { value: 'max', label: 'Maximum' },
] as const;
