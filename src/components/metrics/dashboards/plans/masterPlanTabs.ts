import { MASTER_PLAN_TAB_ORDER, PLANNABLE_DASHBOARDS, type PlannableDashboardKey } from './plannableWidgetsRegistry';

const HIDDEN_MASTER_PLAN_TABS = new Set<string>(['management-snapshot', 'controller-dashboard', 'controller', 'management-review', 'revenue-customers']);
export const VISIBLE_ENTRIES = MASTER_PLAN_TAB_ORDER
  .filter(k => Boolean(PLANNABLE_DASHBOARDS[k]) && !HIDDEN_MASTER_PLAN_TABS.has(k))
  .map(k => [k, PLANNABLE_DASHBOARDS[k]] as [PlannableDashboardKey, typeof PLANNABLE_DASHBOARDS[PlannableDashboardKey]]);
export const ENTITY_TAB = 'entity-metrics';
export const ENTITY_TAB_KEYS = ['finserv-financial-metrics', 'consolidated-debt-pipeline'];
export const ENTITY_TAB_LABELS: Record<string, string> = { 'finserv-financial-metrics': 'FinServ', 'consolidated-debt-pipeline': 'Debt Advisory' };