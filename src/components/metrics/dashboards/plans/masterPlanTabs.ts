import { MASTER_PLAN_TAB_ORDER, PLANNABLE_DASHBOARDS, type PlannableDashboardKey, type PlannableWidget } from './plannableWidgetsRegistry';

const HIDDEN_MASTER_PLAN_TABS = new Set<string>(['management-snapshot', 'controller-dashboard', 'controller', 'management-review', 'revenue-customers', 'sales-dashboard-v2']);

/**
 * Master Plan rows for the KPIs & Metrics entity sections, in display order with
 * Master Plan labels. Dashboard registries stay untouched; rows not listed here
 * are hidden from the Master Plan (UI and MCP).
 */
export const MASTER_PLAN_ROW_OVERRIDES: Partial<Record<PlannableDashboardKey, [key: string, label: string][]>> = {
  'consolidated-debt-pipeline': [
    ['deals-on-board', 'Deals on Board'],
    ['deals-on-board-value', 'Dollars on Board'],
    ['proposals-issued', 'Proposals Issued #'],
    ['dollars-proposed', 'Dollars Proposed'],
    ['deals-signed', 'Deals Signed'],
    ['dollars-signed', 'Dollars Signed'],
    ['clients-receiving-terms', 'Terms Issued'],
    ['dollars-terms-issued', 'Terms Issued $'],
    ['terms-signed', 'Terms Signed'],
    ['volume-of-terms-signed', 'Volume of Terms Signed'],
    ['deals-closed', 'Deals Closed'],
    ['dollars-funded', 'Dollars Funded'],
    ['retainer-revenue', 'Retainer Revenue'],
    ['consulting-milestone-revenue', 'Consulting / Milestone Revenue'],
    ['fee-revenue', 'Fee Revenue'],
    ['conv-days-onboard-proposal', 'Conversion Timing - On-Board to Proposal'],
    ['conv-days-proposal-engage', 'Conversion Timing - Proposal to Engage'],
    ['conv-days-engage-terms-issued', 'Conversion Timing - Engage to Terms Issued'],
    ['conv-days-engage-terms-signed', 'Conversion Timing - Engage to Terms Signed'],
    ['conv-days-terms-signed-funded', 'Conversion Timing - Terms Signed to Funded'],
    ['conv-rate-onboard-proposal', 'Conversion Rate - On-Board to Proposal'],
    ['conv-rate-proposal-engage', 'Conversion Rate - Proposal to Engage'],
    ['conv-rate-engaged-terms-issued', 'Conversion Rate - Engaged to Terms Issued'],
    ['conv-rate-engaged-terms-signed', 'Conversion Rate - Engaged to Terms Signed'],
    ['conv-rate-terms-funded', 'Conversion Rate - Terms to Funded'],
    ['proposals-pending', 'Proposals Pending #'],
    ['proposals-pending-value', 'Proposals Pending $'],
    ['agreements-pending', 'Agreements Pending #'],
    ['agreements-pending-value', 'Agreements Pending $'],
    ['active-deals', 'Active Deals'],
    ['active-dollars', 'Active Dollars'],
    ['active-revenue', 'Active Revenue'],
    ['in-due-diligence', 'Deals in Diligence'],
    ['dollars-in-diligence', 'Dollars in Diligence'],
    ['revenue-in-diligence', 'Revenue in Diligence'],
  ],
  'finserv-financial-metrics': [
    ['active-clients', 'Active Clients'],
    ['new-clients', 'New Clients'],
    ['total-mrr', 'MRR'],
    ['revenue-run-rate', 'Revenue Run Rate'],
  ],
};

/** Label fixes for rows shown on other tabs that share a key with the entity sections. */
const MASTER_PLAN_LABEL_FIXES: Record<string, string> = {
  'clients-receiving-terms': 'Terms Issued',
  'deals-closed': 'Deals Closed',
  'dollars-funded': 'Dollars Funded',
};

function applyOverrides(k: PlannableDashboardKey) {
  const def = PLANNABLE_DASHBOARDS[k];
  const rows = MASTER_PLAN_ROW_OVERRIDES[k];
  if (!rows) {
    return { ...def, widgets: def.widgets
      .filter((w) => !(k === 'sales-dashboard-v2' && w.key === 'terms-issued'))
      .map((w) => (MASTER_PLAN_LABEL_FIXES[w.key] ? { ...w, label: MASTER_PLAN_LABEL_FIXES[w.key] } : w)) };
  }
  const byKey = new Map(def.widgets.map((w) => [w.key, w] as const));
  const widgets: PlannableWidget[] = rows.flatMap(([key, label]) => {
    const w = byKey.get(key);
    return w ? [{ ...w, label }] : [];
  });
  return { ...def, widgets };
}

export const VISIBLE_ENTRIES = MASTER_PLAN_TAB_ORDER
  .filter(k => Boolean(PLANNABLE_DASHBOARDS[k]) && !HIDDEN_MASTER_PLAN_TABS.has(k))
  .map(k => [k, applyOverrides(k)] as [PlannableDashboardKey, typeof PLANNABLE_DASHBOARDS[PlannableDashboardKey]]);
/** Debt Advisory + FinServ sections now live on the Sales Dashboard tab (old Sales Dashboard rows are hidden). */
export const ENTITY_TAB = 'entity-metrics';
export const ENTITY_TAB_TITLE = 'Sales Dashboard';
/** KPIs & Metrics tab: TTM per-head rows from each Financials segment. */
export const KPI_TTM_TAB = 'kpis-ttm';
export const ENTITY_TAB_KEYS = ['finserv-financial-metrics', 'consolidated-debt-pipeline'];
export const ENTITY_TAB_LABELS: Record<string, string> = { 'finserv-financial-metrics': 'FinServ', 'consolidated-debt-pipeline': 'Debt Advisory' };
