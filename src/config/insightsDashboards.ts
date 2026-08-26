/**
 * Single source of truth for the Insights dashboard selector.
 *
 * Both the sidebar dropdown in `src/pages/Insights.tsx` and the Master Plan
 * tab strip (`src/components/metrics/dashboards/plans/`) read from this list,
 * so their labels and ordering can never drift apart.
 *
 * To add, rename, or reorder a dashboard shown in either surface: edit this
 * file. The Master Plan tab strip automatically picks up the change for any
 * dashboard id present in `PLANNABLE_WIDGETS`.
 */
export type InsightsDashboardFolderId = 'management-insights' | 'financial' | 'sales-bd';

export interface InsightsDashboardOption {
  id: string;
  name: string;
  isFavorite: boolean;
  folder: InsightsDashboardFolderId | null;
}

export const DASHBOARD_OPTIONS: InsightsDashboardOption[] = [
  { id: 'management-snapshot', name: 'Weekly Rundown', isFavorite: true, folder: 'management-insights' },
  { id: 'revenue-customers', name: 'Revenue & Customers', isFavorite: false, folder: 'financial' },
  { id: 'controller-dashboard', name: 'Controller Dashboard', isFavorite: false, folder: 'financial' },
  { id: 'sales-bd-page', name: 'Sales & BD', isFavorite: false, folder: 'sales-bd' },
  { id: 'sales-dashboard-v2', name: 'Sales Dashboard', isFavorite: false, folder: 'sales-bd' },
  { id: 'finserv-financial-metrics', name: 'FinServ Financial Metrics', isFavorite: false, folder: null },
  { id: 'consolidated-debt-pipeline', name: 'Debt Advisory Metrics', isFavorite: false, folder: 'sales-bd' },
  { id: 'lender-intelligence', name: 'Lender Intelligence Dashboard', isFavorite: false, folder: 'sales-bd' },
  { id: 'sales-bd-roi', name: 'Sales & BD ROI', isFavorite: false, folder: 'sales-bd' },
  { id: 'management-review', name: 'Insights Dashboard', isFavorite: false, folder: 'management-insights' },
];

/** Ordered id list — Master Plan tab strip iterates this to build tabs. */
export const DASHBOARD_OPTION_IDS: string[] = DASHBOARD_OPTIONS.map((d) => d.id);

/** Lookup: dashboard id -> visible label (as shown in the sidebar). */
export const DASHBOARD_LABEL_BY_ID: Record<string, string> = Object.fromEntries(
  DASHBOARD_OPTIONS.map((d) => [d.id, d.name])
);

export function getInsightsDashboardLabel(id: string): string | undefined {
  return DASHBOARD_LABEL_BY_ID[id];
}