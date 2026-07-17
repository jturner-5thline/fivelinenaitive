/**
 * Hardcoded registry of "plannable" widgets per dashboard.
 *
 * Each entry drives the Excel-style Plans/Targets dialog opened from the
 * gear icon rendered on that dashboard. Values are persisted in
 * `insights_metric_targets` with `metric_key = plan:{dashboardKey}:{widgetKey}`
 * and `period_month = YYYY-MM` (monthly) or `YYYY-Qn` (quarterly).
 */
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
  | 'management-review';

export const PLANNABLE_DASHBOARDS: Record<
  PlannableDashboardKey,
  { label: string; widgets: PlannableWidget[] }
> = {
  'management-snapshot': {
    // Sidebar in Insights labels this dashboard "Weekly Rundown".
    label: 'Weekly Rundown',
    widgets: [
      { key: 'total-revenue', label: 'Total Revenue', format: 'currency' },
      { key: 'debt-revenue', label: 'Debt Revenue', format: 'currency' },
      { key: 'finserv-revenue', label: 'FinServ Revenue', format: 'currency' },
      { key: 'deals-signed', label: 'Deals Signed', format: 'number' },
      { key: 'finserv-clients-signed', label: 'FinServ Clients Signed', format: 'number' },
      { key: 'outstanding-ar', label: 'Outstanding A/R', format: 'currency' },
      { key: 'avg-rev-per-client', label: 'Avg Revenue / Client', format: 'currency' },
    ],
  },
  'finserv-financial-metrics': {
    label: 'FinServ Financial Metrics',
    widgets: [
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
  },
  'consolidated-debt-pipeline': {
    // Sidebar in Insights labels this dashboard "Debt Advisory Metrics".
    label: 'Debt Advisory Metrics',
    widgets: [
      { key: 'total-revenue-opportunity', label: 'Total Revenue Opportunity', format: 'currency' },
      { key: 'active-deals', label: 'Active Deals', format: 'number' },
      { key: 'deals-signed', label: 'Deals Signed', format: 'number' },
      { key: 'deals-closed', label: 'Deals Closed', format: 'number' },
      { key: 'nda-sent', label: 'NDA Sent', format: 'number' },
      { key: 'terms-issued', label: 'Terms Issued', format: 'number' },
      { key: 'in-due-diligence', label: 'In Due Diligence', format: 'number' },
      { key: 'proposal-issued', label: 'Proposal Issued', format: 'number' },
      { key: 'agreements-pending', label: 'Agreements Pending', format: 'number' },
      { key: 'closed-won-fees', label: 'Closed-Won Fees', format: 'currency' },
    ],
  },
  'sales-bd-roi': {
    // Sidebar in Insights labels this dashboard "Sales & BD ROI".
    label: 'Sales & BD ROI',
    widgets: [
      { key: 'ttm-revenue', label: 'TTM Revenue', format: 'currency' },
      { key: 'ttm-cost', label: 'TTM Cost', format: 'currency' },
      { key: 'ttm-profit', label: 'TTM Profit', format: 'currency' },
      { key: 'dobs-count', label: "DOB's Count", format: 'number' },
      { key: 'dobs-value', label: "DOB's Value", format: 'currency' },
      { key: 'meetings-booked', label: 'Meetings Booked', format: 'number' },
    ],
  },
  'management-review': {
    // Sidebar in Insights labels this dashboard "Insights Dashboard".
    label: 'Insights Dashboard',
    widgets: [
      { key: 'revenue', label: 'Revenue', format: 'currency' },
      { key: 'ebitda', label: 'EBITDA', format: 'currency' },
      { key: 'headcount', label: 'Headcount', format: 'number' },
      { key: 'new-clients', label: 'New Clients', format: 'number' },
      { key: 'churn-clients', label: 'Churned Clients', format: 'number' },
    ],
  },
};

export function getPlannableWidgets(dashboardKey: PlannableDashboardKey) {
  return PLANNABLE_DASHBOARDS[dashboardKey];
}

/** Build the persisted metric_key that scopes a plan value to a dashboard+widget. */
export function buildPlanMetricKey(dashboardKey: PlannableDashboardKey, widgetKey: string): string {
  return `plan:${dashboardKey}:${widgetKey}`;
}