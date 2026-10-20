import type { Deal } from '@/types/deal';

export const CLIENT_TYPE_OPTIONS = [
  'Type A - AINS',
  'Type B - AINS + Advisory',
  'Type C - Advisory + GTM',
] as const;
export const UNASSIGNED_CLIENT_TYPE = 'Unassigned';

export type ClientTypeMetric = 'count' | 'mrr';

export interface ClientTypeSlice {
  name: string;
  value: number;
  deals: Deal[];
}

/** Groups deals by client type; Unassigned only appears when non-empty. */
export function buildClientTypeMix(deals: Deal[], metric: ClientTypeMetric): ClientTypeSlice[] {
  const buckets = new Map<string, Deal[]>();
  [...CLIENT_TYPE_OPTIONS, UNASSIGNED_CLIENT_TYPE].forEach((k) => buckets.set(k, []));
  for (const d of deals) {
    const key = d.clientType && buckets.has(d.clientType) ? d.clientType : UNASSIGNED_CLIENT_TYPE;
    buckets.get(key)!.push(d);
  }
  return [...buckets.entries()]
    .map(([name, ds]) => ({
      name,
      deals: ds,
      value: metric === 'count' ? ds.length : ds.reduce((s, d) => s + (d.mrr ?? 0), 0),
    }))
    .filter((s) => !(s.name === UNASSIGNED_CLIENT_TYPE && s.deals.length === 0));
}
