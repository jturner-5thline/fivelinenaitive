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
  | 'management-review'
  | 'executive'
  | 'controller'
  | 'quickbooks-financial'
  | 'sales-team-board'
  | 'weekly-rundown'
  | 'deal-stage-timeline'
  | 'revenue-overview'
  // Sidebar-aligned aliases so the Master Plan tabs exactly match the
  // Insights dashboard selector ids (see DASHBOARD_OPTIONS in Insights.tsx).
  | 'revenue-customers'
  | 'controller-dashboard'
  | 'sales-dashboard-v2';

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
      { key: 'deals-on-board', label: 'Deals on Board', format: 'number' },
      { key: 'deals-signed', label: 'Deals Signed', format: 'number' },
      { key: 'deals-closed', label: 'Deals Closed', format: 'number' },
      { key: 'nda-sent', label: 'NDA Sent', format: 'number' },
      { key: 'terms-issued', label: 'Terms Issued', format: 'number' },
      { key: 'in-due-diligence', label: 'In Due Diligence', format: 'number' },
      { key: 'proposals-issued', label: 'Proposals Issued', format: 'number' },
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
  executive: {
    label: 'Executive',
    widgets: [
      { key: 'deals-created', label: 'Deals Created', format: 'number' },
      { key: 'deals-advanced', label: 'Deals Advanced', format: 'number' },
      { key: 'deals-signed', label: 'Deals Signed', format: 'number' },
      { key: 'deals-closed', label: 'Deals Closed', format: 'number' },
      { key: 'meetings-held', label: 'Meetings Held', format: 'number' },
      { key: 'emails-sent', label: 'Emails Sent', format: 'number' },
    ],
  },
  controller: {
    label: 'Controller Dashboard',
    widgets: [
      { key: 'cash-on-hand', label: 'Cash on Hand', format: 'currency' },
      { key: 'operating-cash', label: 'Operating Cash', format: 'currency' },
      { key: 'ap-outstanding', label: 'A/P Outstanding', format: 'currency' },
      { key: 'ar-outstanding', label: 'A/R Outstanding', format: 'currency' },
      { key: 'burn-rate', label: 'Burn Rate', format: 'currency' },
    ],
  },
  'quickbooks-financial': {
    label: 'QuickBooks Financial',
    widgets: [
      { key: 'revenue', label: 'Revenue', format: 'currency' },
      { key: 'cogs', label: 'COGS', format: 'currency' },
      { key: 'gross-profit', label: 'Gross Profit', format: 'currency' },
      { key: 'operating-expenses', label: 'Operating Expenses', format: 'currency' },
      { key: 'net-income', label: 'Net Income', format: 'currency' },
    ],
  },
  'sales-team-board': {
    label: 'Sales Team Board',
    widgets: [
      { key: 'calls-made', label: 'Calls Made', format: 'number' },
      { key: 'emails-sent', label: 'Emails Sent', format: 'number' },
      { key: 'meetings-set', label: 'Meetings Set', format: 'number' },
      { key: 'deals-created', label: 'Deals Created', format: 'number' },
      { key: 'quota-attainment', label: 'Quota Attainment %', format: 'percent' },
    ],
  },
  'weekly-rundown': {
    label: 'Weekly Rundown Carousel',
    widgets: [
      { key: 'deals-touched', label: 'Deals Touched', format: 'number' },
      { key: 'new-deals', label: 'New Deals', format: 'number' },
      { key: 'meetings-held', label: 'Meetings Held', format: 'number' },
      { key: 'tasks-completed', label: 'Tasks Completed', format: 'number' },
    ],
  },
  'deal-stage-timeline': {
    label: 'Deal Stage Timeline',
    widgets: [
      { key: 'avg-days-nda', label: 'Avg Days: NDA', format: 'number' },
      { key: 'avg-days-terms', label: 'Avg Days: Terms Issued', format: 'number' },
      { key: 'avg-days-dd', label: 'Avg Days: Due Diligence', format: 'number' },
      { key: 'avg-days-proposal', label: 'Avg Days: Proposal', format: 'number' },
      { key: 'avg-days-close', label: 'Avg Days: Close', format: 'number' },
    ],
  },
  'revenue-overview': {
    label: 'Revenue & Customers',
    widgets: [
      { key: 'total-revenue', label: 'Total Revenue', format: 'currency' },
      { key: 'debt-revenue', label: 'Debt Revenue', format: 'currency' },
      { key: 'finserv-revenue', label: 'FinServ Revenue', format: 'currency' },
      { key: 'recurring-revenue', label: 'Recurring Revenue', format: 'currency' },
      { key: 'one-time-revenue', label: 'One-Time Revenue', format: 'currency' },
    ],
  },
  // ---------------------------------------------------------------------------
  // Sidebar-aligned entries. Keys mirror DASHBOARD_OPTIONS ids in Insights.tsx
  // so tabs in the Master Plan dialog match the visible dashboard selector.
  // ---------------------------------------------------------------------------
  'revenue-customers': {
    label: 'Revenue & Customers',
    widgets: [
      { key: 'total-revenue', label: 'Total Revenue', format: 'currency' },
      { key: 'debt-revenue', label: 'Debt Revenue', format: 'currency' },
      { key: 'finserv-revenue', label: 'FinServ Revenue', format: 'currency' },
      { key: 'recurring-revenue', label: 'Recurring Revenue', format: 'currency' },
      { key: 'one-time-revenue', label: 'One-Time Revenue', format: 'currency' },
    ],
  },
  'controller-dashboard': {
    label: 'Controller Dashboard',
    widgets: [
      { key: 'cash-on-hand', label: 'Cash on Hand', format: 'currency' },
      { key: 'operating-cash', label: 'Operating Cash', format: 'currency' },
      { key: 'ap-outstanding', label: 'A/P Outstanding', format: 'currency' },
      { key: 'ar-outstanding', label: 'A/R Outstanding', format: 'currency' },
      { key: 'burn-rate', label: 'Burn Rate', format: 'currency' },
    ],
  },
  'sales-dashboard-v2': {
    label: 'Sales Dashboard',
    widgets: [
      { key: 'deals-on-board', label: 'Deals on Board', format: 'number' },
      { key: 'proposals-issued', label: 'Proposals Issued', format: 'number' },
      { key: 'calls-made', label: 'Calls Made', format: 'number' },
      { key: 'emails-sent', label: 'Emails Sent', format: 'number' },
      { key: 'meetings-set', label: 'Meetings Set', format: 'number' },
      { key: 'deals-created', label: 'Deals Created', format: 'number' },
      { key: 'quota-attainment', label: 'Quota Attainment %', format: 'percent' },
    ],
  },
};

/**
 * Ordered list of dashboards that appear as tabs in the Master Plan dialog.
 * Matches the Insights sidebar exactly (DASHBOARD_OPTIONS in Insights.tsx).
 * Other registry entries remain plannable via their own dashboard gear icons
 * but are hidden from the Master Plan tab strip to prevent user confusion.
 */
export const MASTER_PLAN_TAB_ORDER: PlannableDashboardKey[] = [
  'management-snapshot',       // Weekly Rundown
  'management-review',         // Insights Dashboard
  'revenue-customers',         // Revenue & Customers
  'controller-dashboard',      // Controller Dashboard
  'sales-dashboard-v2',        // Sales Dashboard
  'sales-bd-roi',              // Sales & BD ROI
  'consolidated-debt-pipeline',// Debt Advisory Metrics
  'finserv-financial-metrics', // FinServ Financial Metrics
];

export function getPlannableWidgets(dashboardKey: PlannableDashboardKey) {
  return PLANNABLE_DASHBOARDS[dashboardKey];
}

/** Build the persisted metric_key that scopes a plan value to a dashboard+widget. */
export function buildPlanMetricKey(dashboardKey: PlannableDashboardKey, widgetKey: string): string {
  return `plan:${dashboardKey}:${widgetKey}`;
}