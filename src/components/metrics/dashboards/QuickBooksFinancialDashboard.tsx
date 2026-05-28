import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuickBooksMetrics, type QuickBooksMetricsPeriod } from '@/hooks/useQuickBooksMetrics';
import { useQuickBooksStatus } from '@/hooks/useQuickBooks';
import { useQBTotalIncomeSeries } from '@/hooks/useQBTotalIncomeSeries';
import {
  resolveQboClientLabelEnriched,
  buildCrmCompanyNameIndex,
  OTHER_INDIVIDUALS_LABEL,
} from '@/lib/qboClientName';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, Line, Area, LabelList,
} from 'recharts';
import type { Granularity } from '@/lib/insightsTimeRange';
import { createGlassBarShape } from '@/components/metrics/charts/LiquidGlassBar';
import { PieGlassDefs, pieGlassFill, GlassActiveShape } from '@/components/metrics/charts/LiquidGlassPie';
import { DollarSign, Users, FileText, AlertTriangle, TrendingUp, CreditCard, Percent } from 'lucide-react';
import { InsightsDrilldownDrawer, type DrilldownContext, type DrilldownColumn } from '@/components/metrics/insights/InsightsDrilldownDrawer';

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(210, 70%, 50%)",
  "hsl(180, 60%, 45%)",
  "hsl(330, 60%, 50%)",
];

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
};

/** Return a renderer that only emits a label for values >= the 80th percentile
 *  of the supplied dataset, formatted as `$Xk`. Reduces label collision on
 *  dense charts. */
function makeLabelFormatter(values: number[]) {
  if (!values.length) return () => '';
  const sorted = [...values].filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (!sorted.length) return () => '';
  const idx = Math.floor(sorted.length * 0.2); // bottom 20% suppressed
  const threshold = sorted[idx] ?? 0;
  return (v: number) => (v >= threshold ? formatCurrency(v) : '');
}

const dataLabelStyle = {
  fill: 'hsl(var(--muted-foreground))',
  fontSize: 10,
  fontWeight: 500,
} as const;

interface Props {
  /** Optional period filter for flow-based metrics (revenue/payments/etc). */
  period?: QuickBooksMetricsPeriod & { label: string };
  /** Optional text rendered as a Badge on each tile header (e.g. "Monthly · 2026 YTD"). */
  periodBadge?: string;
  /** Bucket granularity for the trend chart. Defaults to monthly. */
  granularity?: Granularity;
  /** Toggle inline $ data labels on bars. Defaults to true. */
  showDataLabels?: boolean;
  /** Where revenue numbers come from. 'pl' sources from QBO ProfitAndLoss
   *  "Total Income" (accurate; matches QBO's native consolidated P&L). 'invoices'
   *  sums quickbooks_invoices.total_amt (legacy; overstates Debt). Defaults to
   *  'invoices' for backwards compatibility — Controller passes 'pl'. */
  revenueSource?: 'pl' | 'invoices';
}

export function QuickBooksFinancialDashboard({
  period,
  periodBadge,
  granularity = 'monthly',
  showDataLabels = true,
  revenueSource = 'invoices',
}: Props = {}) {
  const { data: status } = useQuickBooksStatus();
  const { data: metrics, isLoading } = useQuickBooksMetrics(
    undefined,
    period ? { start: period.start, end: period.end } : undefined,
    granularity,
  );
  // P&L-sourced revenue series (Scott / 2026-05-27 fix). Only consulted when
  // revenueSource === 'pl'. Falls back transparently to invoice-sums when no
  // stored P&L exists for the period.
  const plSeries = useQBTotalIncomeSeries(
    revenueSource === 'pl' && period ? { start: period.start, end: period.end } : undefined,
    granularity,
  );
  // CRM company index for the "Other / Individuals" enriched resolver.
  const { data: crmCompanies = [] } = useQuery({
    queryKey: ['qb-fin-crm-companies'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('name')
        .not('name', 'is', null);
      if (error) throw error;
      return data ?? [];
    },
  });
  const crmIndex = useMemo(() => buildCrmCompanyNameIndex(crmCompanies), [crmCompanies]);
  const [drill, setDrill] = useState<{
    context: DrilldownContext;
    columns: DrilldownColumn[];
    rows: Array<Record<string, unknown>>;
    defaultSort?: { key: string; dir: 'asc' | 'desc' };
  } | null>(null);

  const showDrill = (
    sourceLabel: string,
    selection: string,
    rows: Array<{ metric: string; value: string }>,
  ) => setDrill({
    context: { sourceId: `qb:${sourceLabel}`, sourceLabel, selection },
    columns: [
      { key: 'metric', label: 'Field' },
      { key: 'value', label: 'Value', align: 'right' },
    ],
    rows,
  });

  // Build invoice-level A/R drilldown (Customer, Invoice #, Amount, Invoice Date,
  // Due Date, Days Overdue). Sortable by all columns; defaults to Days Overdue desc.
  const { data: arInvoiceRows } = useQuery({
    queryKey: ['qb-ar-open-invoices'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quickbooks_invoices')
        .select('customer_name, doc_number, balance, total_amt, txn_date, due_date')
        .gt('balance', 0)
        .order('due_date', { ascending: true })
        .limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const showArDrill = () => {
    const today = new Date();
    const rows = (arInvoiceRows ?? []).map((inv: any) => {
      const due = inv.due_date ? new Date(inv.due_date) : null;
      const daysOverdue = due
        ? Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86_400_000))
        : 0;
      return {
        customer: inv.customer_name ?? '—',
        invoice: inv.doc_number ?? '—',
        amount: Number(inv.balance) || 0,
        txn_date: inv.txn_date ?? null,
        due_date: inv.due_date ?? null,
        days_overdue: daysOverdue,
      };
    });
    setDrill({
      context: {
        sourceId: 'qb:Accounts Receivable',
        sourceLabel: 'Accounts Receivable',
        selection: `${rows.length} open invoices · ${formatCurrency(metrics?.totalAR ?? 0)} outstanding`,
      },
      columns: [
        { key: 'customer', label: 'Customer', sortable: true },
        { key: 'invoice', label: 'Invoice #', sortable: true },
        { key: 'amount', label: 'Amount', align: 'right', sortable: true,
          render: (r: any) => formatCurrency(r.amount) },
        { key: 'txn_date', label: 'Invoice Date', sortable: true,
          render: (r: any) => r.txn_date ?? '—' },
        { key: 'due_date', label: 'Due Date', sortable: true,
          render: (r: any) => r.due_date ?? '—' },
        { key: 'days_overdue', label: 'Days Overdue', align: 'right', sortable: true,
          render: (r: any) => r.days_overdue > 0
            ? <span style={{ color: r.days_overdue > 60 ? '#f87171' : '#fbbf24' }}>{r.days_overdue}</span>
            : <span style={{ opacity: 0.5 }}>—</span> },
      ],
      rows,
      defaultSort: { key: 'days_overdue', dir: 'desc' },
    });
  };

  if (!status?.connected) {
    return (
      <Card className="glass-module">
        <CardContent className="py-12 text-center">
          <CreditCard className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="text-lg font-semibold mb-2">QuickBooks Not Connected</h3>
          <p className="text-muted-foreground text-sm">
            Connect your QuickBooks account in Integrations to see financial metrics here.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[100px]" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[300px]" />
          ))}
        </div>
      </div>
    );
  }

  if (!metrics) return null;

  // Effective revenue figures — P&L-sourced when revenueSource === 'pl'.
  const effectiveTotalRevenue =
    revenueSource === 'pl' ? plSeries.totalIncome : metrics.totalRevenue;
  const effectiveMonthlyRevenue =
    revenueSource === 'pl'
      ? metrics.monthlyRevenue.map((m, i) => ({
          ...m,
          revenue: plSeries.buckets[i]?.value ?? m.revenue,
        }))
      : metrics.monthlyRevenue;

  // Re-bucket Top Customers using the enriched resolver so "Other / Individuals"
  // replaces personal-name leakage on the chart.
  const enrichedTopCustomers = (() => {
    const map = new Map<string, number>();
    for (const c of metrics.topCustomers) {
      const label = resolveQboClientLabelEnriched({
        customerName: c.name,
        customer: { display_name: c.name, company_name: null },
        crmCompanyIndex: crmIndex,
      });
      map.set(label, (map.get(label) ?? 0) + c.revenue);
    }
    return Array.from(map.entries())
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  })();

  const effectiveCollectionRate =
    effectiveTotalRevenue > 0
      ? ((effectiveTotalRevenue - metrics.totalAR) / effectiveTotalRevenue) * 100
      : 0;

  const statCards = [
    { title: 'Total Revenue', value: formatCurrency(effectiveTotalRevenue), icon: DollarSign, color: 'hsl(var(--primary))', subtitle: revenueSource === 'pl' ? 'QBO P&L Total Income' : undefined, onClick: () => showDrill('Total Revenue', revenueSource === 'pl' ? 'QBO P&L Total Income' : 'Sum of invoices', [{ metric: 'Total Revenue', value: formatCurrency(effectiveTotalRevenue) }, { metric: 'Source', value: revenueSource === 'pl' ? 'P&L · Total Income' : 'Invoices · total_amt' }]) },
    { title: 'Accounts Receivable', value: formatCurrency(metrics.totalAR), icon: FileText, color: 'hsl(var(--chart-2))', onClick: showArDrill },
    { title: 'Payments Received', value: formatCurrency(metrics.totalPayments), icon: CreditCard, color: 'hsl(var(--success, 142 71% 45%))', onClick: () => showDrill('Payments Received', 'All-time', [{ metric: 'Payments Received', value: formatCurrency(metrics.totalPayments) }]) },
    { title: 'Collection Rate', value: `${effectiveCollectionRate.toFixed(1)}%`, icon: Percent, color: 'hsl(var(--chart-3))', onClick: () => showDrill('Collection Rate', 'Payments / Revenue', [
      { metric: 'Payments', value: formatCurrency(metrics.totalPayments) },
      { metric: 'Revenue', value: formatCurrency(effectiveTotalRevenue) },
      { metric: 'Collection Rate', value: `${effectiveCollectionRate.toFixed(1)}%` },
    ]) },
    { title: 'Overdue', value: formatCurrency(metrics.overdueAmount), subtitle: `${metrics.overdueCount} invoices`, icon: AlertTriangle, color: 'hsl(var(--destructive))', onClick: () => showDrill('Overdue Invoices', `${metrics.overdueCount} invoices`, [
      { metric: 'Overdue Amount', value: formatCurrency(metrics.overdueAmount) },
      { metric: 'Overdue Count', value: `${metrics.overdueCount}` },
    ]) },
  ];

  return (
    <>
    <div className="space-y-6">
      {/* Stat Cards */}
      {periodBadge && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{periodBadge}</Badge>
          <span className="text-[11px] text-muted-foreground">A/R, A/P, aging &amp; overdue are current snapshots</span>
          {revenueSource === 'pl' && (
            <span className="text-[11px] text-muted-foreground">
              · Revenue from QBO P&amp;L Total Income
              {plSeries.isSyncingMissing && ' (syncing missing periods…)'}
            </span>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {statCards.map((card) => (
          <Card key={card.title} onClick={card.onClick} className="cursor-pointer hover:border-primary/40 transition-colors">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{card.title}</p>
                  <p className="text-xl font-bold text-foreground">{card.value}</p>
                  {'subtitle' in card && card.subtitle && (
                    <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
                  )}
                </div>
                <div className="p-2 rounded-full" style={{ backgroundColor: `${card.color}20` }}>
                  <card.icon className="h-4 w-4" style={{ color: card.color }} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Trend */}
        <Card className="glass-module">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Revenue & Payments Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={effectiveMonthlyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number, name: string) => [formatCurrency(v), name]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  <Legend />
                  <Bar
                    dataKey="revenue"
                    fill="hsl(var(--primary))"
                    name="Revenue"
                    radius={[3, 3, 0, 0]}
                    cursor="pointer"
                    onClick={(d: any) => showDrill('Revenue & Payments Trend', d?.month, [
                      { metric: 'Revenue', value: formatCurrency(Number(d?.revenue) || 0) },
                      { metric: 'Payments', value: formatCurrency(Number(d?.payments) || 0) },
                    ])}
                  >
                    {showDataLabels && (
                      <LabelList
                        dataKey="revenue"
                        position="top"
                        formatter={makeLabelFormatter(effectiveMonthlyRevenue.map(d => d.revenue))}
                        style={dataLabelStyle}
                      />
                    )}
                  </Bar>
                  <Line type="monotone" dataKey="payments" stroke="hsl(var(--chart-2))" name="Payments" strokeWidth={1} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* AR Aging */}
        <Card className="glass-module">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Accounts Receivable Aging</CardTitle>
            <CardDescription>Outstanding balances by aging bucket</CardDescription>
          </CardHeader>
          <CardContent>
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.arAgingData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), "Outstanding"]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  <Bar
                    dataKey="value"
                    radius={[3, 3, 0, 0]}
                    cursor="pointer"
                    onClick={(d: any) => showDrill('A/R Aging', d?.bucket, [
                      { metric: 'Bucket', value: String(d?.bucket ?? '') },
                      { metric: 'Outstanding', value: formatCurrency(Number(d?.value) || 0) },
                    ])}
                  >
                    {metrics.arAgingData.map((entry, index) => (
                      <Cell key={index} fill={index <= 1 ? "hsl(var(--primary))" : index <= 2 ? "hsl(var(--chart-4))" : "hsl(var(--destructive))"} />
                    ))}
                    {showDataLabels && (
                      <LabelList
                        dataKey="value"
                        position="top"
                        formatter={makeLabelFormatter(metrics.arAgingData.map(d => d.value))}
                        style={dataLabelStyle}
                      />
                    )}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Customers */}
        <Card className="glass-module">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Top Customers by Revenue</CardTitle>
            <CardDescription>Based on invoice totals</CardDescription>
          </CardHeader>
          <CardContent>
            <div style={{ height: 280 }}>
              {enrichedTopCustomers.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={enrichedTopCustomers} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 9 }} />
                    <Tooltip formatter={(v: number) => [formatCurrency(v), "Revenue"]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                    <Bar
                      dataKey="revenue"
                      shape={createGlassBarShape({ radius: 3 })}
                      cursor="pointer"
                      onClick={(d: any) => showDrill('Top Customers by Revenue', d?.name, [
                        { metric: 'Customer', value: String(d?.name ?? '') },
                        { metric: 'Revenue', value: formatCurrency(Number(d?.revenue) || 0) },
                      ])}
                    >
                      {enrichedTopCustomers.map((_, index) => (
                        <Cell key={index} fill={COLORS[index % COLORS.length]} />
                      ))}
                      {showDataLabels && (
                        <LabelList
                          dataKey="revenue"
                          position="right"
                          formatter={makeLabelFormatter(enrichedTopCustomers.map(d => d.revenue))}
                          style={dataLabelStyle}
                        />
                      )}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">No customer data</div>
              )}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
    <InsightsDrilldownDrawer
      open={!!drill}
      onClose={() => setDrill(null)}
      context={drill?.context ?? null}
      columns={drill?.columns ?? []}
      rows={drill?.rows ?? []}
      defaultSort={drill?.defaultSort}
      emptyHint="No detail records available."
    />
    </>
  );
}
