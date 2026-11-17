/**
 * Sales Dashboard-V2 Sales Model rows and authored forecast seed, shared by the
 * dashboard and the read-only MCP dashboard tool. Import-safe.
 */
export const SEED_YEAR = 2026;
export const SEED_MONTH_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7, 8];

export type MetricKey =
  | 'salesCalls'
  | 'dealsOnBoard'
  | 'dollarsOnBoard'
  | 'proposalsIssued'
  | 'dollarsProposed'
  | 'clientsSigned'
  | 'dollarsSigned'
  | 'clientsReceivingTerms'
  | 'termsSigned'
  | 'volumeOfTermsSigned'
  | 'dealsClosed'
  | 'dollarsFunded'
  | 'finservProposalsIssued'
  | 'finservDollarsProposed';

export interface RowDef {
  key: MetricKey;
  label: string;
  type: 'count' | 'money';
  bold?: boolean;
}

export const ROW_ORDER: RowDef[] = [
  { key: 'salesCalls', label: 'Sales Calls', type: 'count' },
  { key: 'dealsOnBoard', label: 'Deals on Board', type: 'count' },
  { key: 'dollarsOnBoard', label: 'Dollars on Board', type: 'money' },
  { key: 'proposalsIssued', label: 'Proposals Issued', type: 'count' },
  { key: 'dollarsProposed', label: 'Dollars Proposed', type: 'money' },
  { key: 'clientsSigned', label: 'Clients Signed', type: 'count' },
  { key: 'dollarsSigned', label: 'Dollars Signed', type: 'money' },
  { key: 'clientsReceivingTerms', label: 'Clients Receiving Terms', type: 'count' },
  { key: 'termsSigned', label: 'Terms Signed', type: 'count' },
  { key: 'volumeOfTermsSigned', label: 'Volume of Terms Signed', type: 'money' },
  { key: 'dealsClosed', label: 'FinServ: Deals on the Board', type: 'count' },
  { key: 'dollarsFunded', label: 'FinServ $ on the Board', type: 'money', bold: true },
  { key: 'finservProposalsIssued', label: 'FinServ: Proposals Issued', type: 'count' },
  { key: 'finservDollarsProposed', label: 'FinServ Proposals Issued $', type: 'money' },
];

export const PLAN: Record<MetricKey, number[]> = {
  salesCalls: [44, 46, 48, 48, 50, 50, 52, 52, 54],
  dealsOnBoard: [2, 2, 2, 2, 2, 2, 2, 2, 2],
  dollarsOnBoard: [30.3, 30.3, 30.3, 30.3, 30.3, 30.3, 30.3, 30.3, 30.3],
  proposalsIssued: [7, 7, 7, 7, 7, 7, 7, 7, 7],
  dollarsProposed: [20, 20, 20, 20, 20, 20, 20, 20, 20],
  clientsSigned: [1, 2, 2, 2, 2, 2, 2, 2, 2],
  dollarsSigned: [4.8, 8.0, 8.0, 8.0, 8.0, 8.0, 8.0, 12.0, 12.0],
  clientsReceivingTerms: [2, 2, 2, 1, 2, 2, 2, 2, 2],
  termsSigned: [2, 2, 2, 2, 1, 2, 2, 2, 2],
  volumeOfTermsSigned: [6.4, 6.4, 6.4, 6.4, 3.5, 7.2, 8.0, 8.0, 8.0],
  dealsClosed: [2, 2, 2, 2, 2, 2, 2, 1, 2],
  dollarsFunded: [6.4, 6.4, 6.4, 6.4, 6.7, 7.2, 8.0, 4.8, 8.0],
  finservProposalsIssued: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  finservDollarsProposed: [0, 0, 0, 0, 0, 0, 0, 0, 0],
};

export const PLAN_OVERLAY_MAP: Partial<Record<MetricKey, { widgetKey: string; divisor: number }>> = {
  dealsOnBoard: { widgetKey: 'deals-on-board', divisor: 1 },
  dollarsOnBoard: { widgetKey: 'deals-on-board-value', divisor: 1_000_000 },
  proposalsIssued: { widgetKey: 'proposals-issued', divisor: 1 },
  dollarsProposed: { widgetKey: 'dollars-proposed', divisor: 1_000_000 },
  clientsSigned: { widgetKey: 'deals-signed', divisor: 1 },
  dollarsSigned: { widgetKey: 'dollars-signed', divisor: 1_000_000 },
  clientsReceivingTerms: { widgetKey: 'clients-receiving-terms', divisor: 1 },
  termsSigned: { widgetKey: 'terms-signed', divisor: 1 },
  volumeOfTermsSigned: { widgetKey: 'volume-of-terms-signed', divisor: 1_000_000 },
  dealsClosed: { widgetKey: 'deals-closed', divisor: 1 },
  dollarsFunded: { widgetKey: 'dollars-funded', divisor: 1_000_000 },
  finservProposalsIssued: { widgetKey: 'finserv-proposals-issued', divisor: 1 },
  finservDollarsProposed: { widgetKey: 'finserv-dollars-proposed', divisor: 1_000_000 },
};


/** Merge Master Plan rows (plan:sales-dashboard-v2:* preferred over plan:consolidated-debt-pipeline:*). */
export function mergeMasterPlanRows(
  rows: Array<{ metric_key: string; period_month: string | null; target_value: number | string }>,
  keySet: Set<string>,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, { v2?: number; cdp?: number }>> = {};
  for (const row of rows) {
    if (!row.period_month) continue;
    const parts = row.metric_key.split(':');
    if (parts.length !== 3 || parts[0] !== 'plan') continue;
    const [, namespace, widgetKey] = parts;
    if (!keySet.has(widgetKey)) continue;
    const monthMap = out[widgetKey] ?? (out[widgetKey] = {});
    const bucket = monthMap[row.period_month] ?? (monthMap[row.period_month] = {});
    if (namespace === 'sales-dashboard-v2') bucket.v2 = Number(row.target_value) || 0;
    else if (namespace === 'consolidated-debt-pipeline') bucket.cdp = Number(row.target_value) || 0;
  }
  const flat: Record<string, Record<string, number>> = {};
  for (const [wk, months] of Object.entries(out)) {
    const m: Record<string, number> = {};
    for (const [ym, b] of Object.entries(months)) {
      const v = b.v2 ?? b.cdp;
      if (v !== undefined) m[ym] = v;
    }
    flat[wk] = m;
  }
  return flat;
}

/** Seed forecast for a calendar month (0-based): authored PLAN for SEED_YEAR Jan–Sep, else 0. */
export function seedPlanValue(k: MetricKey, year: number, monIdx: number): number {
  if (year !== SEED_YEAR) return 0;
  const seedIdx = SEED_MONTH_INDEXES.indexOf(monIdx);
  return seedIdx >= 0 ? PLAN[k][seedIdx] ?? 0 : 0;
}

/** Every Master Plan widget key the Sales Model reads. */
export const MASTER_PLAN_KEYS: string[] = Array.from(new Set(Object.values(PLAN_OVERLAY_MAP).map((m) => m!.widgetKey)));
