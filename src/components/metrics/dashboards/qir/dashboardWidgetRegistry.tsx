import React, { lazy, Suspense } from 'react';
import { getCurrentQuarter } from '@/hooks/useQBQuarterlyRevenue';

/**
 * Registry of dashboard widgets that can be embedded into an Insights report
 * exactly as they render on their home dashboard. Each entry maps to an
 * already-standalone card/chart component so the embed uses the source's
 * live data + styling.
 *
 * To add a new widget: extract it into its own component (if it isn't
 * already), then append an entry here. The Add Widgets pop-up and the
 * narrative `dashboardWidgetEmbed` node both consume this registry.
 */

export type DashboardWidgetWidth = 'half' | 'full';

export interface DashboardWidgetEntry {
  id: string;
  label: string;
  dashboard: string;
  description?: string;
  defaultWidth: DashboardWidgetWidth;
  render: () => React.ReactNode;
}

// Lazy imports keep the picker/dialog lightweight; each widget only loads
// when actually previewed or embedded.
const FinServPerHourStat = lazy(() =>
  import('@/components/insights/FinServPerHourStat').then(m => ({ default: m.FinServPerHourStat })),
);
const ClientCountMoMCard = lazy(() =>
  import('@/components/insights/ClientCountMoMCard').then(m => ({ default: m.ClientCountMoMCard })),
);
const IncomeYTDCard = lazy(() =>
  import('@/components/insights/IncomeYTDCard').then(m => ({ default: m.IncomeYTDCard })),
);
const IncomeMoMCard = lazy(() =>
  import('@/components/insights/IncomeMoMCard').then(m => ({ default: m.IncomeMoMCard })),
);
const IncomeYTDByEntityCard = lazy(() =>
  import('@/components/insights/IncomeYTDByEntityCard').then(m => ({ default: m.IncomeYTDByEntityCard })),
);
const IncomeYTDMoMVarianceCard = lazy(() =>
  import('@/components/insights/IncomeYTDMoMVarianceCard').then(m => ({ default: m.IncomeYTDMoMVarianceCard })),
);
const QuarterlyRevenueGrowthCard = lazy(() =>
  import('@/components/insights/QuarterlyRevenueGrowthCard').then(m => ({ default: m.QuarterlyRevenueGrowthCard })),
);
const YTDIncomeBreakdownByEntityCard = lazy(() =>
  import('@/components/insights/YTDIncomeBreakdownByEntityCard').then(m => ({ default: m.YTDIncomeBreakdownByEntityCard })),
);
const FinServTopCustomersCard = lazy(() =>
  import('@/components/insights/FinServTopCustomersCard').then(m => ({ default: m.FinServTopCustomersCard })),
);
const FinServActiveClientCountStat = lazy(() =>
  import('@/components/insights/FinServPipelineSnapshotStat').then(m => ({ default: m.FinServActiveClientCountStat })),
);
const FinServTotalMrrStat = lazy(() =>
  import('@/components/insights/FinServPipelineSnapshotStat').then(m => ({ default: m.FinServTotalMrrStat })),
);

// ── Full dashboards (rendered as embeds) ─────────────────────────────────
const FinServFinancialMetricsDashboard = lazy(() =>
  import('@/components/metrics/dashboards/FinServFinancialMetricsDashboard').then(m => ({ default: m.FinServFinancialMetricsDashboard })),
);
const QuickBooksFinancialDashboard = lazy(() =>
  import('@/components/metrics/dashboards/QuickBooksFinancialDashboard').then(m => ({ default: m.QuickBooksFinancialDashboard })),
);
const ControllerDashboard = lazy(() =>
  import('@/components/metrics/dashboards/ControllerDashboard').then(m => ({ default: m.ControllerDashboard })),
);
const ExecutiveDashboard = lazy(() =>
  import('@/components/metrics/dashboards/ExecutiveDashboard').then(m => ({ default: m.ExecutiveDashboard })),
);
const DealStageTimelineDashboard = lazy(() =>
  import('@/components/metrics/dashboards/DealStageTimelineDashboard').then(m => ({ default: m.DealStageTimelineDashboard })),
);
const PipelineVelocitySection = lazy(() =>
  import('@/components/metrics/dashboards/PipelineVelocitySection').then(m => ({ default: m.PipelineVelocitySection })),
);
const HarvestMonthlyTrackingDashboard = lazy(() =>
  import('@/components/metrics/dashboards/HarvestMonthlyTrackingDashboard').then(m => ({ default: m.HarvestMonthlyTrackingDashboard })),
);
const WeeklyCashflowDashboard = lazy(() =>
  import('@/components/metrics/dashboards/WeeklyCashflowDashboard').then(m => ({ default: m.WeeklyCashflowDashboard })),
);
const IncomeBoardDashboard = lazy(() =>
  import('@/components/metrics/dashboards/IncomeBoardDashboard').then(m => ({ default: m.IncomeBoardDashboard })),
);
const SalesTeamBoardDashboard = lazy(() =>
  import('@/components/metrics/dashboards/SalesTeamBoardDashboard').then(m => ({ default: m.SalesTeamBoardDashboard })),
);
const SalesTeamBoardKpiGrid = lazy(() =>
  import('@/components/metrics/dashboards/SalesTeamBoardDashboard').then(m => ({ default: m.SalesTeamBoardKpiGrid })),
);

// ── Section-level widgets ────────────────────────────────────────────────
const ExecTotalActiveDealVolumeWidget = lazy(() =>
  import('@/components/metrics/dashboards/ExecutiveDashboard').then(m => ({ default: m.ExecTotalActiveDealVolumeWidget })),
);
const ExecDealsClosedWidget = lazy(() =>
  import('@/components/metrics/dashboards/ExecutiveDashboard').then(m => ({ default: m.ExecDealsClosedWidget })),
);
const ExecDealsByStatusWidget = lazy(() =>
  import('@/components/metrics/dashboards/ExecutiveDashboard').then(m => ({ default: m.ExecDealsByStatusWidget })),
);

const RevenueQuarterlySection = lazy(() =>
  import('@/components/metrics/dashboards/RevenueOverviewDashboard').then(m => ({ default: m.RevenueQuarterlySection })),
);
const DebtRevenueWidget = lazy(() =>
  import('@/components/metrics/dashboards/RevenueOverviewDashboard').then(m => ({ default: m.DebtRevenueWidget })),
);
const FinServRevenueWidget = lazy(() =>
  import('@/components/metrics/dashboards/RevenueOverviewDashboard').then(m => ({ default: m.FinServRevenueWidget })),
);

const OutstandingARPieChart = lazy(() =>
  import('@/components/metrics/dashboards/SignedDealsAndARSection').then(m => ({ default: m.OutstandingARPieChart })),
);
const DealsSignedWidget = lazy(() =>
  import('@/components/metrics/dashboards/SignedDealsAndARSection').then(m => ({ default: m.DealsSignedWidget })),
);
const FinServClientsSignedWidget = lazy(() =>
  import('@/components/metrics/dashboards/SignedDealsAndARSection').then(m => ({ default: m.FinServClientsSignedWidget })),
);
const OutstandingARWidget = lazy(() =>
  import('@/components/metrics/dashboards/SignedDealsAndARSection').then(m => ({ default: m.OutstandingARWidget })),
);
const SignedDealsAndARSection = lazy(() =>
  import('@/components/metrics/dashboards/SignedDealsAndARSection').then(m => ({ default: m.SignedDealsAndARSection })),
);
const PipelineMetricsSection = lazy(() =>
  import('@/components/metrics/dashboards/PipelineMetricsSection').then(m => ({ default: m.PipelineMetricsSection })),
);

const RevenueHistoricalTrend = lazy(() =>
  import('@/components/metrics/dashboards/HistoricalTrendChart').then(m => ({ default: m.RevenueHistoricalTrend })),
);
const ProfitHistoricalTrend = lazy(() =>
  import('@/components/metrics/dashboards/HistoricalTrendChart').then(m => ({ default: m.ProfitHistoricalTrend })),
);

// ── Additional insights cards / panels ───────────────────────────────────
const InsightsAISummaryCard = lazy(() =>
  import('@/components/insights/InsightsAISummaryCard').then(m => ({ default: m.InsightsAISummaryCard })),
);
const InsightsForecastPanel = lazy(() =>
  import('@/components/insights/InsightsForecastPanel').then(m => ({ default: m.InsightsForecastPanel })),
);
const AnomalyHistoryPanel = lazy(() =>
  import('@/components/insights/AnomalyHistoryPanel').then(m => ({ default: m.AnomalyHistoryPanel })),
);
const FlagsHurdlesAnalytics = lazy(() =>
  import('@/components/insights/FlagsHurdlesAnalytics').then(m => ({ default: m.FlagsHurdlesAnalytics })),
);

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<WidgetSkeleton />}>
      <div style={{ width: '100%' }}>{children}</div>
    </Suspense>
  );
}

function WidgetSkeleton() {
  return (
    <div
      style={{
        width: '100%',
        minHeight: 160,
        borderRadius: 10,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(160,200,255,0.55)',
        fontSize: 11,
        letterSpacing: '.06em',
        textTransform: 'uppercase',
      }}
    >
      Loading widget…
    </div>
  );
}

export const DASHBOARD_WIDGETS: DashboardWidgetEntry[] = [
  // ── FinServ Financial Metrics ──────────────────────────────────────────
  {
    id: 'finserv-active-client-count-card',
    label: 'Active Client Count',
    dashboard: 'FinServ Financial Metrics',
    description: 'Snapshot of active FinServ clients with sparkline trend.',
    defaultWidth: 'half',
    render: () => <Wrap><FinServActiveClientCountStat title="Active Client Count" color="#22c55e" /></Wrap>,
  },
  {
    id: 'finserv-total-mrr-card',
    label: 'Total MRR',
    dashboard: 'FinServ Financial Metrics',
    description: 'Recurring monthly revenue across active FinServ clients.',
    defaultWidth: 'half',
    render: () => <Wrap><FinServTotalMrrStat title="Total MRR" color="#3b82f6" /></Wrap>,
  },
  {
    id: 'finserv-revenue-per-hour-card',
    label: 'Revenue per Hour',
    dashboard: 'FinServ Financial Metrics',
    description: 'Trailing revenue per included deal hour.',
    defaultWidth: 'half',
    render: () => <Wrap><FinServPerHourStat title="Revenue per Hour" color="#38bdf8" mode="revenue" /></Wrap>,
  },
  {
    id: 'finserv-profit-per-hour-card',
    label: 'Profit per Hour',
    dashboard: 'FinServ Financial Metrics',
    description: 'Trailing profit per included deal hour.',
    defaultWidth: 'half',
    render: () => <Wrap><FinServPerHourStat title="Profit per Hour" color="#a855f7" mode="profit" /></Wrap>,
  },
  {
    id: 'finserv-client-count-mom',
    label: 'Client Count — Month over Month',
    dashboard: 'FinServ Financial Metrics',
    description: 'MoM change in active client count.',
    defaultWidth: 'full',
    render: () => <Wrap><ClientCountMoMCard /></Wrap>,
  },
  {
    id: 'finserv-top-customers',
    label: 'Top Customers',
    dashboard: 'FinServ Financial Metrics',
    description: 'Highest-revenue FinServ customers this period.',
    defaultWidth: 'full',
    render: () => <Wrap><FinServTopCustomersCard /></Wrap>,
  },

  // ── QuickBooks Revenue Reporting ───────────────────────────────────────
  {
    id: 'qb-income-ytd',
    label: 'Income — YTD',
    dashboard: 'QuickBooks Revenue Reporting',
    description: 'Year-to-date consolidated income.',
    defaultWidth: 'half',
    render: () => <Wrap><IncomeYTDCard /></Wrap>,
  },
  {
    id: 'qb-income-mom',
    label: 'Income — Month over Month',
    dashboard: 'QuickBooks Revenue Reporting',
    description: 'Monthly income comparison.',
    defaultWidth: 'full',
    render: () => <Wrap><IncomeMoMCard /></Wrap>,
  },
  {
    id: 'qb-income-ytd-by-entity',
    label: 'Income YTD by Entity',
    dashboard: 'QuickBooks Revenue Reporting',
    description: 'YTD income split by legal entity.',
    defaultWidth: 'full',
    render: () => <Wrap><IncomeYTDByEntityCard /></Wrap>,
  },
  {
    id: 'qb-income-ytd-mom-variance',
    label: 'YTD MoM Variance',
    dashboard: 'QuickBooks Revenue Reporting',
    description: 'Variance vs prior YTD, month over month.',
    defaultWidth: 'full',
    render: () => <Wrap><IncomeYTDMoMVarianceCard /></Wrap>,
  },
  {
    id: 'qb-quarterly-revenue-growth',
    label: 'Quarterly Revenue Growth',
    dashboard: 'QuickBooks Revenue Reporting',
    description: 'Sequential quarterly revenue growth.',
    defaultWidth: 'full',
    render: () => <Wrap><QuarterlyRevenueGrowthCard /></Wrap>,
  },
  {
    id: 'qb-ytd-breakdown-by-entity',
    label: 'YTD Income Breakdown by Entity',
    dashboard: 'QuickBooks Revenue Reporting',
    description: 'Stacked entity breakdown, YTD.',
    defaultWidth: 'full',
    render: () => <Wrap><YTDIncomeBreakdownByEntityCard /></Wrap>,
  },
  {
    id: 'qb-revenue-quarterly-section',
    label: 'Quarterly Revenue Section',
    dashboard: 'QuickBooks Revenue Reporting',
    description: 'Full quarterly revenue overview (Debt + FinServ).',
    defaultWidth: 'full',
    render: () => <Wrap><RevenueQuarterlySection selectedQuarter={getCurrentQuarter()} /></Wrap>,
  },
  {
    id: 'qb-debt-revenue-widget',
    label: 'Debt Revenue Widget',
    dashboard: 'QuickBooks Revenue Reporting',
    description: 'Debt revenue for the current quarter.',
    defaultWidth: 'half',
    render: () => <Wrap><DebtRevenueWidget selectedQuarter={getCurrentQuarter()} /></Wrap>,
  },
  {
    id: 'qb-finserv-revenue-widget',
    label: 'FinServ Revenue Widget',
    dashboard: 'QuickBooks Revenue Reporting',
    description: 'FinServ revenue for the current quarter.',
    defaultWidth: 'half',
    render: () => <Wrap><FinServRevenueWidget selectedQuarter={getCurrentQuarter()} /></Wrap>,
  },
  {
    id: 'qb-revenue-historical-trend',
    label: 'Revenue — Historical Trend',
    dashboard: 'QuickBooks Revenue Reporting',
    description: 'Multi-quarter revenue trendline.',
    defaultWidth: 'full',
    render: () => <Wrap><RevenueHistoricalTrend variant="debt" color="#38bdf8" /></Wrap>,
  },
  {
    id: 'qb-profit-historical-trend',
    label: 'Profit — Historical Trend',
    dashboard: 'QuickBooks Revenue Reporting',
    description: 'Multi-quarter profit trendline.',
    defaultWidth: 'full',
    render: () => <Wrap><ProfitHistoricalTrend entityName="5th Line Capital Advisors" color="#22c55e" /></Wrap>,
  },

  // ── Pipeline & Signed Deals ─────────────────────────────────────────────
  {
    id: 'outstanding-ar-pie',
    label: 'Outstanding AR — Pie',
    dashboard: 'Signed Deals & AR',
    description: 'Outstanding AR by customer/entity.',
    defaultWidth: 'half',
    render: () => <Wrap><OutstandingARPieChart /></Wrap>,
  },
  {
    id: 'deals-signed-widget',
    label: 'Deals Signed',
    dashboard: 'Signed Deals & AR',
    description: 'Signed deal count for the current quarter.',
    defaultWidth: 'half',
    render: () => <Wrap><DealsSignedWidget selectedQuarter={getCurrentQuarter()} /></Wrap>,
  },
  {
    id: 'finserv-clients-signed-widget',
    label: 'FinServ Clients Signed',
    dashboard: 'Signed Deals & AR',
    description: 'FinServ client signings for the current quarter.',
    defaultWidth: 'half',
    render: () => <Wrap><FinServClientsSignedWidget selectedQuarter={getCurrentQuarter()} /></Wrap>,
  },
  {
    id: 'outstanding-ar-widget',
    label: 'Outstanding AR',
    dashboard: 'Signed Deals & AR',
    description: 'Total outstanding AR snapshot.',
    defaultWidth: 'half',
    render: () => <Wrap><OutstandingARWidget /></Wrap>,
  },
  {
    id: 'signed-deals-ar-section',
    label: 'Signed Deals & AR (Full Section)',
    dashboard: 'Signed Deals & AR',
    description: 'All signed-deal + AR widgets grouped.',
    defaultWidth: 'full',
    render: () => <Wrap><SignedDealsAndARSection selectedQuarter={getCurrentQuarter()} /></Wrap>,
  },
  {
    id: 'pipeline-metrics-section',
    label: 'Pipeline Metrics (Full Section)',
    dashboard: 'Pipeline',
    description: 'All pipeline metric widgets for the current quarter.',
    defaultWidth: 'full',
    render: () => <Wrap><PipelineMetricsSection selectedQuarter={getCurrentQuarter()} /></Wrap>,
  },
  {
    id: 'pipeline-velocity-section',
    label: 'Pipeline Velocity',
    dashboard: 'Pipeline',
    description: 'Stage-to-stage funnel velocity over the past four quarters.',
    defaultWidth: 'full',
    render: () => <Wrap><PipelineVelocitySection /></Wrap>,
  },
  {
    id: 'deal-stage-timeline',
    label: 'Deal Stage Timeline',
    dashboard: 'Pipeline',
    description: 'Gantt-style timeline of deals across stages.',
    defaultWidth: 'full',
    render: () => <Wrap><DealStageTimelineDashboard /></Wrap>,
  },

  // ── Executive ───────────────────────────────────────────────────────────
  {
    id: 'exec-total-active-deal-volume',
    label: 'Total Active Deal Volume',
    dashboard: 'Executive Dashboard',
    description: 'Current active pipeline dollar volume.',
    defaultWidth: 'half',
    render: () => <Wrap><ExecTotalActiveDealVolumeWidget /></Wrap>,
  },
  {
    id: 'exec-deals-closed',
    label: 'Deals Closed',
    dashboard: 'Executive Dashboard',
    description: 'Deals closed in the selected week.',
    defaultWidth: 'half',
    render: () => <Wrap><ExecDealsClosedWidget /></Wrap>,
  },
  {
    id: 'exec-deals-by-status',
    label: 'Deals by Status',
    dashboard: 'Executive Dashboard',
    description: 'Distribution of deals across pipeline statuses.',
    defaultWidth: 'full',
    render: () => <Wrap><ExecDealsByStatusWidget /></Wrap>,
  },
  {
    id: 'exec-dashboard-full',
    label: 'Executive Dashboard (Full)',
    dashboard: 'Executive Dashboard',
    description: 'The complete Executive Dashboard view.',
    defaultWidth: 'full',
    render: () => <Wrap><ExecutiveDashboard /></Wrap>,
  },

  // ── Sales Team Board ────────────────────────────────────────────────────
  {
    id: 'sales-team-kpi-grid',
    label: 'Sales Team KPI Grid',
    dashboard: 'Sales Team Board',
    description: 'Rep-level KPI grid for the current quarter.',
    defaultWidth: 'full',
    render: () => <Wrap><SalesTeamBoardKpiGrid quarter={getCurrentQuarter()} /></Wrap>,
  },
  {
    id: 'sales-team-board-full',
    label: 'Sales Team Board (Full)',
    dashboard: 'Sales Team Board',
    description: 'The complete Sales Team Board dashboard.',
    defaultWidth: 'full',
    render: () => <Wrap><SalesTeamBoardDashboard /></Wrap>,
  },

  // ── Full dashboard embeds ───────────────────────────────────────────────
  {
    id: 'finserv-dashboard-full',
    label: 'FinServ Financial Metrics (Full)',
    dashboard: 'FinServ Financial Metrics',
    description: 'The complete FinServ Financial Metrics dashboard.',
    defaultWidth: 'full',
    render: () => <Wrap><FinServFinancialMetricsDashboard /></Wrap>,
  },
  {
    id: 'quickbooks-financial-full',
    label: 'QuickBooks Financials (Full)',
    dashboard: 'QuickBooks Financials',
    description: 'Revenue, expenses, and profit rollup from QuickBooks.',
    defaultWidth: 'full',
    render: () => <Wrap><QuickBooksFinancialDashboard /></Wrap>,
  },
  {
    id: 'controller-dashboard-full',
    label: 'Controller Dashboard (Full)',
    dashboard: 'Controller Dashboard',
    description: 'Bank/credit entity balances and controller-level KPIs.',
    defaultWidth: 'full',
    render: () => <Wrap><ControllerDashboard /></Wrap>,
  },
  {
    id: 'harvest-monthly-tracking',
    label: 'Harvest Monthly Tracking',
    dashboard: 'Harvest Monthly Tracking',
    description: 'Monthly hours tracking from Harvest.',
    defaultWidth: 'full',
    render: () => <Wrap><HarvestMonthlyTrackingDashboard /></Wrap>,
  },
  {
    id: 'weekly-cashflow',
    label: 'Weekly Cashflow',
    dashboard: 'Weekly Cashflow',
    description: 'Rolling weekly cashflow model.',
    defaultWidth: 'full',
    render: () => <Wrap><WeeklyCashflowDashboard /></Wrap>,
  },
  {
    id: 'income-board',
    label: 'Income Board',
    dashboard: 'Income Board',
    description: 'Income board across all entities.',
    defaultWidth: 'full',
    render: () => <Wrap><IncomeBoardDashboard /></Wrap>,
  },

  // ── Insights panels ─────────────────────────────────────────────────────
  {
    id: 'insights-ai-summary',
    label: 'AI Summary',
    dashboard: 'Insights',
    description: 'AI-generated executive summary for the current period.',
    defaultWidth: 'full',
    render: () => <Wrap><InsightsAISummaryCard /></Wrap>,
  },
  {
    id: 'insights-forecast-panel',
    label: 'Forecast Panel',
    dashboard: 'Insights',
    description: 'Forward-looking forecast panel.',
    defaultWidth: 'full',
    render: () => <Wrap><InsightsForecastPanel /></Wrap>,
  },
  {
    id: 'insights-anomaly-history',
    label: 'Anomaly History',
    dashboard: 'Insights',
    description: 'Active and recurring anomalies with history.',
    defaultWidth: 'full',
    render: () => <Wrap><AnomalyHistoryPanel /></Wrap>,
  },
  {
    id: 'insights-flags-hurdles',
    label: 'Flags & Hurdles Analytics',
    dashboard: 'Insights',
    description: 'Flag/hurdle analytics across the period.',
    defaultWidth: 'full',
    render: () => <Wrap><FlagsHurdlesAnalytics /></Wrap>,
  },
];

export function getDashboardWidget(id: string): DashboardWidgetEntry | undefined {
  return DASHBOARD_WIDGETS.find(w => w.id === id);
}

export function groupDashboardWidgets(): { dashboard: string; widgets: DashboardWidgetEntry[] }[] {
  const order: string[] = [];
  const map = new Map<string, DashboardWidgetEntry[]>();
  for (const w of DASHBOARD_WIDGETS) {
    if (!map.has(w.dashboard)) { map.set(w.dashboard, []); order.push(w.dashboard); }
    map.get(w.dashboard)!.push(w);
  }
  return order.map(d => ({ dashboard: d, widgets: map.get(d)! }));
}