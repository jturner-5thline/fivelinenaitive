import type { FilterRule, MatchMode } from './filterTypes';

/**
 * Build a single PostgREST filter string for one FilterRule.
 * Returns a string like "field.ilike.%val%" or null if the rule is incomplete.
 */
function ruleToFilterString(r: FilterRule): string | null {
  const f = r.field;
  if (!f) return null;

  const v = r.value;
  const op = r.operator;

  switch (op) {
    case 'contains':
      return `${f}.ilike.%${v}%`;
    case 'does_not_contain':
      return `${f}.not.ilike.%${v}%`;
    case 'equals':
    case 'is':
      return `${f}.eq.${v}`;
    case 'not_equals':
    case 'is_not':
      return `${f}.neq.${v}`;
    case 'starts_with':
      return `${f}.ilike.${v}%`;
    case 'ends_with':
      return `${f}.ilike.%${v}`;
    case 'greater_than':
      return `${f}.gt.${v}`;
    case 'less_than':
      return `${f}.lt.${v}`;
    case 'greater_or_equal':
      return `${f}.gte.${v}`;
    case 'less_or_equal':
      return `${f}.lte.${v}`;
    case 'before':
      return `${f}.lt.${v}`;
    case 'after':
      return `${f}.gt.${v}`;
    case 'in_last_days': {
      const d = new Date(Date.now() - Number(v) * 86400000).toISOString();
      return `${f}.gte.${d}`;
    }
    case 'in_next_days': {
      const d = new Date(Date.now() + Number(v) * 86400000).toISOString();
      return `${f}.lte.${d}`;
    }
    case 'is_empty':
      return `${f}.is.null`;
    case 'is_not_empty':
      return `${f}.not.is.null`;
    case 'is_true':
      return `${f}.eq.true`;
    case 'is_false':
      return `${f}.eq.false`;
    case 'is_any_of': {
      const vals = Array.isArray(v) ? v : [v];
      return `${f}.in.(${vals.join(',')})`;
    }
    case 'is_none_of': {
      const vals = Array.isArray(v) ? v : [v];
      return `${f}.not.in.(${vals.join(',')})`;
    }
    default:
      return null;
  }
}

/**
 * Apply advanced FilterRules to a Supabase query builder.
 * Works with AND (chain) or OR (.or()) logic.
 */
export function applyFiltersToQuery<T extends { or: (s: string) => T; filter: (col: string, op: string, val: any) => T }>(
  query: T,
  filters: FilterRule[],
  matchMode: MatchMode,
): T {
  // Only keep complete rules
  const complete = filters.filter(
    (r) => r.field && r.operator,
  );
  if (complete.length === 0) return query;

  const strings = complete.map(ruleToFilterString).filter(Boolean) as string[];
  if (strings.length === 0) return query;

  if (matchMode === 'any') {
    // OR – combine all into one .or() call
    return query.or(strings.join(','));
  }

  // AND – apply each filter individually
  for (const rule of complete) {
    query = applyOneRule(query, rule);
  }
  return query;
}

function applyOneRule<T extends { or: (s: string) => T; filter: (col: string, op: string, val: any) => T; ilike: (col: string, val: string) => T; eq: (col: string, val: any) => T; neq: (col: string, val: any) => T; gt: (col: string, val: any) => T; lt: (col: string, val: any) => T; gte: (col: string, val: any) => T; lte: (col: string, val: any) => T; is: (col: string, val: any) => T; not: (col: string, op: string, val: any) => T; in: (col: string, vals: any[]) => T }>(
  query: T,
  r: FilterRule,
): T {
  const f = r.field;
  const v = r.value;
  const op = r.operator;

  switch (op) {
    case 'contains':
      return (query as any).ilike(f, `%${v}%`);
    case 'does_not_contain':
      return (query as any).not(f, 'ilike', `%${v}%`);
    case 'equals':
    case 'is':
      return (query as any).eq(f, v);
    case 'not_equals':
    case 'is_not':
      return (query as any).neq(f, v);
    case 'starts_with':
      return (query as any).ilike(f, `${v}%`);
    case 'ends_with':
      return (query as any).ilike(f, `%${v}`);
    case 'greater_than':
      return (query as any).gt(f, v);
    case 'less_than':
      return (query as any).lt(f, v);
    case 'greater_or_equal':
      return (query as any).gte(f, v);
    case 'less_or_equal':
      return (query as any).lte(f, v);
    case 'before':
      return (query as any).lt(f, v);
    case 'after':
      return (query as any).gt(f, v);
    case 'in_last_days': {
      const d = new Date(Date.now() - Number(v) * 86400000).toISOString();
      return (query as any).gte(f, d);
    }
    case 'in_next_days': {
      const d = new Date(Date.now() + Number(v) * 86400000).toISOString();
      return (query as any).lte(f, d);
    }
    case 'is_empty':
      return (query as any).is(f, null);
    case 'is_not_empty':
      return (query as any).not(f, 'is', null);
    case 'is_true':
      return (query as any).eq(f, true);
    case 'is_false':
      return (query as any).eq(f, false);
    case 'is_any_of': {
      const vals = Array.isArray(v) ? v : [v];
      return (query as any).in(f, vals);
    }
    case 'is_none_of': {
      const vals = Array.isArray(v) ? v : [v];
      return (query as any).not(f, 'in', `(${vals.join(',')})`);
    }
    default:
      return query;
  }
}
