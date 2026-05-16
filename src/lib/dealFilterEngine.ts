/**
 * Generic AI-driven deal filter engine.
 *
 * This layer is intentionally decoupled from the existing
 * `DealFilters` UI state in `useDeals` so the same translation +
 * application pipeline can later be reused for tasks, calendar events,
 * pipeline snapshots, etc. by swapping the field resolver.
 */
import { differenceInDays } from 'date-fns';
import type { Deal, DealStage, DealStatus } from '@/types/deal';

export type DealFilterField =
  | 'name'
  | 'company'
  | 'value'
  | 'stage'
  | 'stage_order' // numeric position in the pipeline
  | 'status'
  | 'engagementType'
  | 'dealTypes'
  | 'manager'
  | 'dealOwner'
  | 'lender'
  | 'lenderCount'
  | 'referredBy'
  | 'closingDate'
  | 'createdAt'
  | 'updatedAt'
  | 'retainerFee'
  | 'milestoneFee'
  | 'totalFee'
  | 'isFlagged'
  | 'onHold';

export type DealFilterOp =
  | 'equals'
  | 'not_equals'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'not_contains'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'is_null'
  | 'is_not_null'
  | 'is_true'
  | 'is_false'
  | 'before'
  | 'after'
  | 'in_last_days'
  | 'in_next_days'
  | 'older_than_days';

export interface DealFilterRule {
  id: string;
  field: DealFilterField;
  op: DealFilterOp;
  value?: string | number | boolean | Array<string | number>;
  /** Human-readable chip label, e.g. "Closing date is missing". */
  label: string;
}

export interface AIDealFilterSpec {
  filters: DealFilterRule[];
  matchMode?: 'all' | 'any';
  /** Short confirmation sentence describing what was applied. */
  summary?: string;
  /** If set, the AI couldn't translate the request. */
  clarification?: string;
  /** If true, existing AI filters should be cleared first. */
  replace?: boolean;
  /** If true, existing AI filters should be cleared and nothing applied. */
  clearAll?: boolean;
}

const NORMALIZE = (v: unknown) => (v == null ? '' : String(v)).trim().toLowerCase();

const isEmpty = (v: unknown): boolean => {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (typeof v === 'number') return v === 0;
  if (Array.isArray(v)) return v.length === 0;
  return false;
};

function asArray<T = string>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v == null) return [];
  return [v as T];
}

function getStageOrder(stage: string, stages: { id: string }[]): number {
  const idx = stages.findIndex((s) => s.id === stage);
  return idx === -1 ? 999 : idx;
}

function parseDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

function compareNum(a: number, op: DealFilterOp, b: number): boolean {
  switch (op) {
    case 'gt': return a > b;
    case 'gte': return a >= b;
    case 'lt': return a < b;
    case 'lte': return a <= b;
    case 'equals': return a === b;
    case 'not_equals': return a !== b;
    default: return false;
  }
}

/**
 * Read a normalized value off a deal for a given filter field.
 */
function getDealValue(deal: Deal, field: DealFilterField): unknown {
  switch (field) {
    case 'name': return deal.name;
    case 'company': return deal.company;
    case 'value': return deal.value;
    case 'stage': return deal.stage;
    case 'status': return deal.status;
    case 'engagementType': return deal.engagementType;
    case 'dealTypes': return deal.dealTypes ?? [];
    case 'manager': return deal.manager;
    case 'dealOwner': return deal.dealOwner ?? deal.ownedBy ?? '';
    case 'lender': return deal.lender;
    case 'lenderCount': return deal.lenders?.length ?? 0;
    case 'referredBy': return deal.referredBy?.name ?? deal.referredBy?.id ?? '';
    case 'closingDate': return deal.closingDate ?? deal.dashboardClosingDate ?? deal.projectedCloseDate ?? null;
    case 'createdAt': return deal.createdAt;
    case 'updatedAt': return deal.updatedAt;
    case 'retainerFee': return deal.retainerFee;
    case 'milestoneFee': return deal.milestoneFee;
    case 'totalFee': return deal.totalFee;
    case 'isFlagged': return Boolean(deal.isFlagged);
    case 'onHold': return Boolean(deal.onHold);
    default: return undefined;
  }
}

export interface ApplyContext {
  stages: { id: string; label: string }[];
  now?: Date;
}

export function evaluateRule(
  deal: Deal,
  rule: DealFilterRule,
  ctx: ApplyContext,
): boolean {
  const now = ctx.now ?? new Date();

  // Special: stage_order compares against pipeline position.
  if (rule.field === 'stage_order') {
    const dealOrder = getStageOrder(deal.stage, ctx.stages);
    if (rule.op === 'between' && Array.isArray(rule.value)) {
      const [a, b] = rule.value.map(Number);
      return dealOrder >= Math.min(a, b) && dealOrder <= Math.max(a, b);
    }
    let target: number;
    if (typeof rule.value === 'string') {
      target = getStageOrder(rule.value, ctx.stages);
    } else {
      target = Number(rule.value ?? 0);
    }
    return compareNum(dealOrder, rule.op, target);
  }

  const raw = getDealValue(deal, rule.field);

  switch (rule.op) {
    case 'is_null':
      return isEmpty(raw);
    case 'is_not_null':
      return !isEmpty(raw);
    case 'is_true':
      return raw === true;
    case 'is_false':
      return raw === false || raw == null;
  }

  // Date comparisons
  if (
    rule.op === 'before' ||
    rule.op === 'after' ||
    rule.op === 'in_last_days' ||
    rule.op === 'in_next_days' ||
    rule.op === 'older_than_days'
  ) {
    const d = parseDate(raw);
    if (!d) return false;
    if (rule.op === 'in_last_days') {
      const days = Number(rule.value ?? 0);
      const diff = differenceInDays(now, d);
      return diff >= 0 && diff <= days;
    }
    if (rule.op === 'older_than_days') {
      const days = Number(rule.value ?? 0);
      return differenceInDays(now, d) > days;
    }
    if (rule.op === 'in_next_days') {
      const days = Number(rule.value ?? 0);
      const diff = differenceInDays(d, now);
      return diff >= 0 && diff <= days;
    }
    const target = parseDate(rule.value);
    if (!target) return false;
    return rule.op === 'before' ? d.getTime() < target.getTime() : d.getTime() > target.getTime();
  }

  // Array membership
  if (Array.isArray(raw)) {
    const values = (raw as unknown[]).map(NORMALIZE);
    const wanted = asArray(rule.value).map(NORMALIZE);
    switch (rule.op) {
      case 'in':
      case 'contains':
      case 'equals':
        return wanted.some((w) => values.includes(w));
      case 'not_in':
      case 'not_contains':
      case 'not_equals':
        return !wanted.some((w) => values.includes(w));
    }
  }

  // Numeric comparisons
  if (typeof raw === 'number' && rule.op !== 'contains' && rule.op !== 'not_contains') {
    if (rule.op === 'between' && Array.isArray(rule.value)) {
      const [a, b] = rule.value.map(Number);
      return raw >= Math.min(a, b) && raw <= Math.max(a, b);
    }
    const target = Number(rule.value ?? 0);
    if (rule.op === 'in' || rule.op === 'not_in') {
      const set = asArray<number>(rule.value).map(Number);
      const hit = set.includes(raw);
      return rule.op === 'in' ? hit : !hit;
    }
    return compareNum(raw, rule.op, target);
  }

  // String/enum comparisons
  const left = NORMALIZE(raw);
  switch (rule.op) {
    case 'equals':
      return left === NORMALIZE(rule.value);
    case 'not_equals':
      return left !== NORMALIZE(rule.value);
    case 'contains':
      return left.includes(NORMALIZE(rule.value));
    case 'not_contains':
      return !left.includes(NORMALIZE(rule.value));
    case 'in': {
      const wanted = asArray(rule.value).map(NORMALIZE);
      return wanted.some((w) => left === w || left.includes(w));
    }
    case 'not_in': {
      const wanted = asArray(rule.value).map(NORMALIZE);
      return !wanted.some((w) => left === w || left.includes(w));
    }
    default:
      return false;
  }
}

export function applyDealFilterRules(
  deals: Deal[],
  rules: DealFilterRule[],
  ctx: ApplyContext,
  matchMode: 'all' | 'any' = 'all',
): Deal[] {
  if (!rules || rules.length === 0) return deals;
  return deals.filter((deal) => {
    if (matchMode === 'any') {
      return rules.some((r) => {
        try { return evaluateRule(deal, r, ctx); } catch { return false; }
      });
    }
    return rules.every((r) => {
      try { return evaluateRule(deal, r, ctx); } catch { return false; }
    });
  });
}

/**
 * Whitelist of fields the AI is allowed to emit. Anything else is dropped
 * for safety before reaching the apply layer.
 */
export const ALLOWED_FIELDS: ReadonlyArray<DealFilterField> = [
  'name', 'company', 'value', 'stage', 'stage_order', 'status',
  'engagementType', 'dealTypes', 'manager', 'dealOwner', 'lender',
  'lenderCount', 'referredBy', 'closingDate', 'createdAt', 'updatedAt',
  'retainerFee', 'milestoneFee', 'totalFee', 'isFlagged', 'onHold',
];

export const ALLOWED_OPS: ReadonlyArray<DealFilterOp> = [
  'equals', 'not_equals', 'in', 'not_in', 'contains', 'not_contains',
  'gt', 'gte', 'lt', 'lte', 'between', 'is_null', 'is_not_null',
  'is_true', 'is_false', 'before', 'after', 'in_last_days',
  'in_next_days', 'older_than_days',
];

export function sanitizeRules(rules: unknown): DealFilterRule[] {
  if (!Array.isArray(rules)) return [];
  const out: DealFilterRule[] = [];
  for (const r of rules) {
    if (!r || typeof r !== 'object') continue;
    const rec = r as Record<string, unknown>;
    const field = rec.field as DealFilterField;
    const op = rec.op as DealFilterOp;
    if (!ALLOWED_FIELDS.includes(field)) continue;
    if (!ALLOWED_OPS.includes(op)) continue;
    out.push({
      id: (typeof rec.id === 'string' && rec.id) || `ai-${Math.random().toString(36).slice(2, 10)}`,
      field,
      op,
      value: rec.value as DealFilterRule['value'],
      label: typeof rec.label === 'string' && rec.label ? rec.label : `${field} ${op}`,
    });
  }
  return out;
}

// Re-export aliases so unrelated entity types can be wired later.
export type { DealStage, DealStatus };