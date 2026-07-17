/**
 * Registry of "plannable" widgets per dashboard.
 *
 * Each entry drives the Excel-style Plans/Targets dialog opened from the
 * gear icon rendered on that dashboard. Values are persisted in
 * `insights_metric_targets` with `metric_key = plan:{dashboardKey}:{widgetKey}`
 * and `period_month = YYYY-MM` (monthly) or `YYYY-Qn` (quarterly).
 *
 * Dashboard labels and the Master Plan tab order are derived from the shared
 * `src/config/insightsDashboards.ts` source of truth — the same list that
 * renders the Insights sidebar selector. This file only owns the widget lists.
 * To rename a tab, edit `insightsDashboards.ts`; the change propagates here.
 */
import {
  DASHBOARD_OPTION_IDS,
  DASHBOARD_LABEL_BY_ID,
} from '@/config/insightsDashboards';

export type PlanWidgetFormat = 'number' | 'currency' | 'percent';

export interface PlannableWidget {
  key: string;
  label: string;
  format: PlanWidgetFormat;
  /** Optional short helper hint shown under the label. */
  hint?: string;
}

export type PlannableDashboardKey =
  | 'management-snapshot'
  | 'finserv-financial-metrics'
  | 'consolidated-debt-pipeline'
  | 'sales-bd-roi'
  | 'management-review'
  | 'executive'
  | 'controller'
  | 'quickbooks-financial'
  | 'sales-team-board'
  | 'weekly-rundown'
  | 'deal-stage-timeline'
  | 'revenue-overview'
  // Sidebar-aligned ids that mirror `DASHBOARD_OPTIONS` in
  // `src/config/insightsDashboards.ts` so the Master Plan tabs stay in lock
  // step with the Insights dashboard selector.
  | 'revenue-customers'
  | 'controller-dashboard'
  | 'sales-dashboard-v2';

/**
 * Fallback labels for dashboards that have plannable widgets but are NOT
 * present in the Insights sidebar selector (legacy / hidden dashboards).
 * Sidebar-visible dashboards intentionally omit an entry here — their label
 * is resolved live from `DASHBOARD_LABEL_BY_ID` so it can never drift.
 */
const LEGACY_DASHBOARD_LABELS: Partial<Record<PlannableDashboardKey, string>> = {
  executive: 'Executive',
  'quickbooks-financial': 'QuickBooks Financial',
  'sales-team-board': 'Sales Team Board',
  'weekly-rundown': 'Weekly Rundown Carousel',
  'deal-stage-timeline': 'Deal Stage Timeline',
  'revenue-overview': 'Revenue & Customers',
  controller: 'Controller Dashboard',
};

/** Widget lists per dashboard id. Labels are resolved separately. */
const PLANNABLE_WIDGETS: Record<PlannableDashboardKey, PlannableWidget[]> = {
  'management-snapshot': [
      { key: 'total-revenue', label: 'Total Revenue', format: 'currency' },
      { key: 'debt-revenue', label: 'Debt Revenue', format: 'currency' },
      { key: 'finserv-revenue', label: 'FinServ Revenue', format: 'currency' },
      { key: 'deals-signed', label: 'Deals Signed', format: 'number' },
      { key: 'finserv-clients-signed', label: 'FinServ Clients Signed', format: 'number' },
      { key: 'outstanding-ar', label: 'Outstanding A/R', format: 'currency' },
      { key: 'avg-rev-per-client', label: 'Avg Revenue / Client', format: 'currency' },
  ],
  'finserv-financial-metrics': [
      { key: 'total-revenue', label: 'Total Revenue', format: 'currency' },
      { key: 'total-mrr', label: 'Total MRR', format: 'currency' },
      { key: 'active-clients', label: 'Active Client Count', format: 'number' },
      { key: 'gross-profit', label: 'Gross Profit', format: 'currency' },
      { key: 'net-profit', label: 'Net Profit', format: 'currency' },
      { key: 'gross-margin', label: 'Gross Margin', format: 'percent' },
      { key: 'net-margin', label: 'Net Margin', format: 'percent' },
      { key: 'utilization', label: 'Utilization %', format: 'percent' },
      { key: 'cashflow', label: 'Cashflow', format: 'currency' },
      { key: 'revenue-per-hour', label: 'Revenue / Hour', format: 'currency' },
      { key: 'avg-rev-per-client', label: 'Avg Revenue / Client', format: 'currency' },
  ],
  'consolidated-debt-pipeline': [
      { key: 'total-revenue-opportunity', label: 'Total Revenue Opportunity', format: 'currency' },
      { key: 'active-deals', label: 'Active Deals', format: 'number' },
      { key: 'deals-on-board', label: 'Deals on the Board (#)', format: 'number' },
      { key: 'deals-on-board-value', label: 'Deals on the Board ($)', format: 'currency' },
      { key: 'deals-signed', label: 'Deals Signed', format: 'number' },
      { key: 'deals-closed', label: 'Deals Closed', format: 'number' },
      { key: 'nda-sent', label: 'NDA Sent', format: 'number' },
      { key: 'terms-issued', label: 'Terms Issued', format: 'number' },
      { key: 'in-due-diligence', label: 'In Due Diligence', format: 'number' },
      { key: 'proposals-issued', label: 'Proposals Issued', format: 'number' },
      { key: 'proposal-to-signed-conversion', label: 'Proposal → Signed Conversion (# deals)', format: 'percent' },
      { key: 'agreements-pending', label: 'Agreements Pending', format: 'number' },
      { key: 'closed-won-fees', label: 'Closed-Won Fees', format: 'currency' },
  ],
  'sales-bd-roi': [
      { key: 'ttm-revenue', label: 'TTM Revenue', format: 'currency' },
      { key: 'ttm-cost', label: 'TTM Cost', format: 'currency' },
      { key: 'ttm-profit', label: 'TTM Profit', format: 'currency' },
      { key: 'dobs-count', label: "DOB's Count", format: 'number' },
      { key: 'dobs-value', label: "DOB's Value", format: 'currency' },
      { key: 'meetings-booked', label: 'Meetings Booked', format: 'number' },
  ],
  'management-review': [
      { key: 'revenue', label: 'Revenue', format: 'currency' },
      { key: 'ebitda', label: 'EBITDA', format: 'currency' },
      { key: 'headcount', label: 'Headcount', format: 'number' },
      { key: 'new-clients', label: 'New Clients', format: 'number' },
      { key: 'churn-clients', label: 'Churned Clients', format: 'number' },
  ],
  executive: [
      { key: 'deals-created', label: 'Deals Created', format: 'number' },
      { key: 'deals-advanced', label: 'Deals Advanced', format: 'number' },
      { key: 'deals-signed', label: 'Deals Signed', format: 'number' },
      { key: 'deals-closed', label: 'Deals Closed', format: 'number' },
      { key: 'meetings-held', label: 'Meetings Held', format: 'number' },
      { key: 'emails-sent', label: 'Emails Sent', format: 'number' },
  ],
  controller: [
      { key: 'cash-on-hand', label: 'Cash on Hand', format: 'currency' },
      { key: 'operating-cash', label: 'Operating Cash', format: 'currency' },
      { key: 'ap-outstanding', label: 'A/P Outstanding', format: 'currency' },
      { key: 'ar-outstanding', label: 'A/R Outstanding', format: 'currency' },
      { key: 'burn-rate', label: 'Burn Rate', format: 'currency' },
  ],
  'quickbooks-financial': [
      { key: 'revenue', label: 'Revenue', format: 'currency' },
      { key: 'cogs', label: 'COGS', format: 'currency' },
      { key: 'gross-profit', label: 'Gross Profit', format: 'currency' },
      { key: 'operating-expenses', label: 'Operating Expenses', format: 'currency' },
      { key: 'net-income', label: 'Net Income', format: 'currency' },
  ],
  'sales-team-board': [
      { key: 'calls-made', label: 'Calls Made', format: 'number' },
      { key: 'emails-sent', label: 'Emails Sent', format: 'number' },
      { key: 'meetings-set', label: 'Meetings Set', format: 'number' },
      { key: 'deals-created', label: 'Deals Created', format: 'number' },
      { key: 'quota-attainment', label: 'Quota Attainment %', format: 'percent' },
  ],
  'weekly-rundown': [
      { key: 'deals-touched', label: 'Deals Touched', format: 'number' },
      { key: 'new-deals', label: 'New Deals', format: 'number' },
      { key: 'meetings-held', label: 'Meetings Held', format: 'number' },
      { key: 'tasks-completed', label: 'Tasks Completed', format: 'number' },
  ],
  'deal-stage-timeline': [
      { key: 'avg-days-nda', label: 'Avg Days: NDA', format: 'number' },
      { key: 'avg-days-terms', label: 'Avg Days: Terms Issued', format: 'number' },
      { key: 'avg-days-dd', label: 'Avg Days: Due Diligence', format: 'number' },
      { key: 'avg-days-proposal', label: 'Avg Days: Proposal', format: 'number' },
      { key: 'avg-days-close', label: 'Avg Days: Close', format: 'number' },
  ],
  'revenue-overview': [
      { key: 'total-revenue', label: 'Total Revenue', format: 'currency' },
      { key: 'debt-revenue', label: 'Debt Revenue', format: 'currency' },
      { key: 'finserv-revenue', label: 'FinServ Revenue', format: 'currency' },
      { key: 'recurring-revenue', label: 'Recurring Revenue', format: 'currency' },
      { key: 'one-time-revenue', label: 'One-Time Revenue', format: 'currency' },
  ],
  // Sidebar-aligned entries. Labels come from `DASHBOARD_LABEL_BY_ID`.
  'revenue-customers': [
      { key: 'total-revenue', label: 'Total Revenue', format: 'currency' },
      { key: 'debt-revenue', label: 'Debt Revenue', format: 'currency' },
      { key: 'finserv-revenue', label: 'FinServ Revenue', format: 'currency' },
      { key: 'recurring-revenue', label: 'Recurring Revenue', format: 'currency' },
      { key: 'one-time-revenue', label: 'One-Time Revenue', format: 'currency' },
  ],
  'controller-dashboard': [
      { key: 'cash-on-hand', label: 'Cash on Hand', format: 'currency' },
      { key: 'operating-cash', label: 'Operating Cash', format: 'currency' },
      { key: 'ap-outstanding', label: 'A/P Outstanding', format: 'currency' },
      { key: 'ar-outstanding', label: 'A/R Outstanding', format: 'currency' },
      { key: 'burn-rate', label: 'Burn Rate', format: 'currency' },
  ],
  'sales-dashboard-v2': [
      { key: 'deals-on-board', label: 'Deals on the Board (#)', format: 'number' },
      { key: 'deals-on-board-value', label: 'Deals on the Board ($)', format: 'currency' },
      { key: 'proposals-issued', label: 'Proposals Issued', format: 'number' },
      { key: 'proposal-to-signed-conversion', label: 'Proposal → Signed Conversion (# deals)', format: 'percent' },
      { key: 'calls-made', label: 'Calls Made', format: 'number' },
      { key: 'emails-sent', label: 'Emails Sent', format: 'number' },
      { key: 'meetings-set', label: 'Meetings Set', format: 'number' },
      { key: 'deals-created', label: 'Deals Created', format: 'number' },
      { key: 'quota-attainment', label: 'Quota Attainment %', format: 'percent' },
  ],
};

/**
 * Resolve a dashboard's display label. Sidebar-visible dashboards always win
 * (single source of truth); legacy/hidden dashboards fall back to
 * `LEGACY_DASHBOARD_LABELS`; otherwise the key itself is returned.
 */
export function getPlannableDashboardLabel(key: PlannableDashboardKey): string {
  return (
    DASHBOARD_LABEL_BY_ID[key] ??
    LEGACY_DASHBOARD_LABELS[key] ??
    key
  );
}

/**
 * Backwards-compatible aggregated map used across the plans UI. Built lazily
 * from `PLANNABLE_WIDGETS` + `getPlannableDashboardLabel` so any rename in
 * `insightsDashboards.ts` is picked up automatically.
 */
export const PLANNABLE_DASHBOARDS: Record<
  PlannableDashboardKey,
  { label: string; widgets: PlannableWidget[] }
> = Object.fromEntries(
  (Object.entries(PLANNABLE_WIDGETS) as [PlannableDashboardKey, PlannableWidget[]][])
    .map(([k, widgets]) => [k, { label: getPlannableDashboardLabel(k), widgets }])
) as Record<PlannableDashboardKey, { label: string; widgets: PlannableWidget[] }>;

/**
 * Ordered list of dashboards that appear as tabs in the Master Plan dialog.
 * Derived directly from `DASHBOARD_OPTION_IDS` (the Insights sidebar) so the
 * two surfaces are guaranteed to match. Ids without a widget list are skipped;
 * legacy registry entries remain plannable via their own dashboard gear icons
 * but are hidden from the Master Plan tab strip.
 */
export const MASTER_PLAN_TAB_ORDER: PlannableDashboardKey[] = DASHBOARD_OPTION_IDS
  .filter((id): id is PlannableDashboardKey => id in PLANNABLE_WIDGETS);

export function getPlannableWidgets(dashboardKey: PlannableDashboardKey) {
  return PLANNABLE_DASHBOARDS[dashboardKey];
}

/** Build the persisted metric_key that scopes a plan value to a dashboard+widget. */
export function buildPlanMetricKey(dashboardKey: PlannableDashboardKey, widgetKey: string): string {
  return `plan:${dashboardKey}:${widgetKey}`;
}