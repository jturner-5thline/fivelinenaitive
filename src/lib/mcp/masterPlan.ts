import { z } from 'zod';
import { VISIBLE_ENTRIES, ENTITY_TAB, ENTITY_TAB_KEYS, ENTITY_TAB_LABELS } from '@/components/metrics/dashboards/plans/masterPlanTabs';
import { FINANCIAL_YEARS, FINANCIAL_SEGMENTS, financialRowsFor, financialMetricKey, financialPeriods, FINANCIAL_TTM_SUM_ROWS, computeTtmSum } from '@/components/metrics/dashboards/plans/financialsPlan';
import { buildPlanMetricKey } from '@/components/metrics/dashboards/plans/plannableWidgetsRegistry';
import { HEADCOUNT_COMPANY_ID, HEADCOUNT_UNITS, headcountMonthlyTotal, headcountSummary } from '@/lib/monthlyHeadcount';
import type { supabaseForUser } from './supabase';

export { HEADCOUNT_COMPANY_ID };
const planYears = `(${FINANCIAL_YEARS.join('|')})`;
export const planPeriod = z.string().regex(new RegExp(`^${planYears}-(0[1-9]|1[0-2]|Q[1-4])$`));
export const headcountMonth = z.string().regex(new RegExp(`^${planYears}-(0[1-9]|1[0-2])$`));
export const headcountValue = z.number().finite().min(0).max(9999.99).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 1e-7, 'Use at most two decimal places').nullable();

export function masterPlanCatalog() {
  type CatalogRow = { key: string; label: string; format: string; unit?: string; metric_key: string; metric_keys: string[]; linked_dashboards: string[]; editable: boolean; derived?: true; source_metric_key?: string; calculation?: string };
  const finRow = (seg: string, r: { key: string; label: string; format: string }): CatalogRow => ({ key: r.key, label: r.label, format: r.format, metric_key: financialMetricKey(seg, r.key), metric_keys: [financialMetricKey(seg, r.key)], linked_dashboards: [], editable: true });
  // Calculated TTM sums: read-only, never stored, rejected by writes.
  const sumRows = (seg: string): CatalogRow[] => FINANCIAL_TTM_SUM_ROWS.map(r => ({ key: r.key, label: r.label, format: r.format, metric_key: financialMetricKey(seg, r.key), metric_keys: [], linked_dashboards: [], editable: false, derived: true, source_metric_key: financialMetricKey(seg, r.source), calculation: 'Sum of trailing 12 months (monthly) or 4 quarters (quarterly) of the source row; 2027 onward' }));
  const financials = { key: 'financials', label: 'Financials', sections: FINANCIAL_SEGMENTS.map(s => ({ key: s.key, label: s.label, rows: [...financialRowsFor(s.key, 'base').map(r => finRow(s.key, r)), ...sumRows(s.key)] })) };
  const kpiRows = FINANCIAL_SEGMENTS.map(s => ({ key: s.key, label: s.label, rows: [...sumRows(s.key), ...financialRowsFor(s.key, 'ttm').map(r => finRow(s.key, r))] }));
  const sections = VISIBLE_ENTRIES.map(([dk, def]) => ({ key: dk as string, label: ENTITY_TAB_LABELS[dk] ?? def.label, rows: def.widgets.map(w => {
    const linked = VISIBLE_ENTRIES.filter(([, d]) => d.widgets.some(x => x.key === w.key));
    return <CatalogRow>{ key: w.key, label: w.label, format: w.format as string, ...(w.unit ? { unit: w.unit } : {}), metric_key: buildPlanMetricKey(dk, w.key), metric_keys: linked.map(([k]) => buildPlanMetricKey(k, w.key)), linked_dashboards: linked.length > 1 ? linked.map(([, d]) => d.label) : [], editable: true };
  }) }));
  return [financials, { key: ENTITY_TAB, label: 'KPIs & Metrics', sections: kpiRows }, { key: 'sales-dashboard', label: 'Sales Dashboard', sections: sections.filter(s => ENTITY_TAB_KEYS.includes(s.key)) }, ...sections.filter(s => !ENTITY_TAB_KEYS.includes(s.key)).map(s => ({ key: s.key, label: VISIBLE_ENTRIES.find(([k]) => k === s.key)?.[1].label ?? s.label, sections: [s] }))];
}

export function normalizeTargetUpdates(updates: Array<{ metric_key: string; period: string; value: number | null }>) {
  const rows = masterPlanCatalog().flatMap(t => t.sections.flatMap(s => s.rows));
  const byKey = new Map(rows.map(r => [r.metric_key, r]));
  const result = new Map<string, { metric_key: string; metric_label: string; period: string; value: number | null }>();
  for (const u of updates) {
    planPeriod.parse(u.period);
    const row = byKey.get(u.metric_key);
    if (!row) throw new Error(`Unknown Master Plan metric: ${u.metric_key}`);
    if (!row.editable) throw new Error(`${u.metric_key} is a calculated row and cannot be written`);
    for (const key of row.metric_keys) {
      const id = `${key}|${u.period}`;
      const prev = result.get(id);
      if (prev && prev.value !== u.value) throw new Error(`Conflicting values for linked metric ${key} ${u.period}`);
      const tab = VISIBLE_ENTRIES.find(([k]) => key.startsWith(`plan:${k}:`));
      const label = tab ? `${tab[1].label} · ${tab[1].widgets.find(w => key === buildPlanMetricKey(tab[0], w.key))?.label}` : (() => {
        const [, , segment, metric] = key.split(':');
        return `Financials · ${FINANCIAL_SEGMENTS.find(s => s.key === segment)?.label} · ${financialRowsFor(segment).find(r => r.key === metric)?.label}`;
      })();
      result.set(id, { metric_key: key, metric_label: label, period: u.period, value: u.value });
    }
  }
  if (result.size > 2000) throw new Error('Batch exceeds 2,000 cells after linked metric expansion');
  return [...result.values()];
}

export async function assertMasterPlanAccess(sb: ReturnType<typeof supabaseForUser>, write = false) {
  // Verify the token with the auth server, then scope membership to that user.
  const { data: auth, error: authError } = await sb.auth.getUser();
  if (authError || !auth.user) throw new Error('Not authenticated');
  const { data: membership, error: memberError } = await sb.from('company_members').select('company_id').eq('company_id', HEADCOUNT_COMPANY_ID).eq('user_id', auth.user.id).maybeSingle();
  if (memberError || !membership) throw new Error('Master Plan requires 5th Line workspace membership');
  if (write && !['jturner@5thline.co', 'jmoffitt@5thline.co', 'ffustinoni@5thline.co'].includes(auth.user.email?.toLowerCase() ?? '')) throw new Error('Master Plan editor access required');
}

export type PlanTarget = { metric_key: string; period_month: string; target_value: number | null; updated_at?: string };
export type HeadcountRecord = { realm_id: string; month: string; headcount: number | null };
export function buildMasterPlan(targets: PlanTarget[], headcount: HeadcountRecord[], year: number | undefined, periodType: 'monthly' | 'quarterly' | 'both', tab?: string) {
  const years = year ? [year] : [...FINANCIAL_YEARS];
  const periods = years.flatMap(y => (periodType === 'both' ? ['monthly', 'quarterly'] as const : [periodType]).flatMap(m => financialPeriods(y, m).map(p => ({ ...p, period_type: m }))));
  const saved = new Map(targets.map(t => [`${t.metric_key}|${t.period_month}`, t]));
  const tabs = masterPlanCatalog().map(t => ({ ...t, columns: periods, sections: t.sections.map(s => ({ ...s, rows: s.rows.map(r => ({ ...r, cells: periods.map(p => {
    if (r.derived) return { period: p.key, value: computeTtmSum(k => saved.get(`${r.source_metric_key}|${k}`)?.target_value ?? null, p.key), updated_at: null, editable: false, derived: true, linked_value_conflict: false, stored_values: [] };
    // Match the dialog's shared widget last-row-wins precedence, while exposing conflicts.
    const variants = r.metric_keys.map(k => saved.get(`${k}|${p.key}`)).filter((v): v is PlanTarget => Boolean(v));
    const current = variants.at(-1);
    return { period: p.key, value: current?.target_value ?? null, updated_at: current?.updated_at ?? null, editable: true, linked_value_conflict: new Set(variants.map(v => v.target_value)).size > 1, stored_values: variants.map(v => ({ metric_key: v.metric_key, value: v.target_value })) };
  }) })) })) }));
  const hc = new Map(headcount.map(h => [`${h.realm_id}|${h.month.slice(0, 7)}`, h.headcount]));
  const monthly = (id: string, month: string) => hc.get(`${id}|${month}`) ?? null;
  const total = (month: string) => headcountMonthlyTotal(HEADCOUNT_UNITS.map(u => { const v = monthly(u.realmId, month); return v === null ? '' : String(v); }));
  const hcRows = [...HEADCOUNT_UNITS.map(u => ({ key: u.realmId, label: u.label, name: u.name, editable: true })), { key: 'total', label: 'Total', name: 'Firm total (minus duplicate)', editable: false }].map(r => {
    const value = (month: string) => r.key === 'total' ? total(month) : monthly(r.key, month);
    const average = (months: string[]) => headcountSummary(months.map(m => { const v = value(m); return v === null ? '' : String(v); })).average;
    return { ...r, format: 'headcount', cells: periods.map(p => ({ period: p.key, value: p.period_type === 'monthly' ? value(p.key) : average([1, 2, 3].map(i => `${p.key.slice(0, 4)}-${String((Number(p.key.at(-1)) - 1) * 3 + i).padStart(2, '0')}`)), editable: r.editable && p.period_type === 'monthly', derived: !r.editable || p.period_type === 'quarterly' })), annual_averages: years.map(y => ({ year: y, value: average(financialPeriods(y, 'monthly').map(p => p.key)) })) };
  });
  const allTabs = [tabs[0], tabs[1], { key: 'headcount', label: 'Headcount', columns: periods, sections: [{ key: 'units', label: 'Unit', rows: hcRows }] }, ...tabs.slice(2)];
  const selectedTab = tab === 'kpis' ? ENTITY_TAB : tab;
  if (selectedTab && selectedTab !== 'all' && !allTabs.some(t => t.key === selectedTab)) throw new Error('Unknown Master Plan tab');
  return { company_id: HEADCOUNT_COMPANY_ID, years, period_type: periodType, row_titles_editable: false, tabs: allTabs.filter(t => !selectedTab || selectedTab === 'all' || t.key === selectedTab) };
}