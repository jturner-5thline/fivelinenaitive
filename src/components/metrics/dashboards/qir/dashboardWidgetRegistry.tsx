import React, { lazy, Suspense } from 'react';

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