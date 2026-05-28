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
import { DollarSign, FileText, AlertTriangle, TrendingUp, CreditCard, Percent, ChevronRight, ChevronDown, ArrowUp, ArrowDown } from 'lucide-react';
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
    body?: React.ReactNode;
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

  // A/R drilldown source data: every open invoice across all connected QBO
  // entities the viewer can see. We aggregate client-side into a customer-level
  // summary table with expandable invoice-level detail.
  const { data: arInvoiceRows } = useQuery({
    queryKey: ['qb-ar-open-invoices'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quickbooks_invoices')
        .select('customer_name, doc_number, balance, total_amt, txn_date, due_date, realm_id')
        .gt('balance', 0)
        .order('due_date', { ascending: true })
        .limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const showArDrill = () => {
    setDrill({
      context: {
        sourceId: 'qb:Accounts Receivable',
        sourceLabel: 'Accounts Receivable',
        selection: `${(arInvoiceRows ?? []).length} open invoices · ${formatCurrency(metrics?.totalAR ?? 0)} outstanding`,
      },
      columns: [],
      rows: [],
      body: <ArDrilldownBody invoices={arInvoiceRows ?? []} />,
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
  // Trend buckets: always source from invoice sums so partial-month / missing
  // P&L reports don't artificially zero out recent months. Invoice sums are
  // accurate per-month and aggregate across every connected QBO entity that
  // the user has access to.
  const effectiveMonthlyRevenue = metrics.monthlyRevenue;

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
      body={drill?.body}
      defaultSort={drill?.defaultSort}
      emptyHint="No detail records available."
    />
    </>
  );
}

/* ─── A/R drilldown: customer-level summary with expandable invoices ─── */

interface ArInvoice {
  customer_name: string | null;
  doc_number: string | null;
  balance: number | null;
  total_amt: number | null;
  txn_date: string | null;
  due_date: string | null;
  realm_id: string | null;
}

interface ArCustomerRow {
  customer: string;
  balance: number;
  invoiceCount: number;
  oldestDays: number;
  buckets: { current: number; '1-30': number; '31-60': number; '61-90': number; '90+': number };
  invoices: Array<{
    invoice: string;
    txn_date: string | null;
    due_date: string | null;
    balance: number;
    daysOutstanding: number;
    daysOverdue: number;
  }>;
}

function aggregateAr(invoices: ArInvoice[]): ArCustomerRow[] {
  const today = new Date();
  const todayMs = today.getTime();
  const byCustomer = new Map<string, ArCustomerRow>();
  for (const inv of invoices) {
    const customer = inv.customer_name?.trim() || 'Unknown';
    const balance = Number(inv.balance) || 0;
    if (balance <= 0) continue;
    const txnMs = inv.txn_date ? new Date(inv.txn_date).getTime() : null;
    const dueMs = inv.due_date ? new Date(inv.due_date).getTime() : null;
    const daysOutstanding = txnMs ? Math.max(0, Math.floor((todayMs - txnMs) / 86_400_000)) : 0;
    const daysOverdue = dueMs ? Math.max(0, Math.floor((todayMs - dueMs) / 86_400_000)) : 0;
    let entry = byCustomer.get(customer);
    if (!entry) {
      entry = {
        customer,
        balance: 0,
        invoiceCount: 0,
        oldestDays: 0,
        buckets: { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 },
        invoices: [],
      };
      byCustomer.set(customer, entry);
    }
    entry.balance += balance;
    entry.invoiceCount += 1;
    entry.oldestDays = Math.max(entry.oldestDays, daysOutstanding);
    if (daysOverdue <= 0) entry.buckets.current += balance;
    else if (daysOverdue <= 30) entry.buckets['1-30'] += balance;
    else if (daysOverdue <= 60) entry.buckets['31-60'] += balance;
    else if (daysOverdue <= 90) entry.buckets['61-90'] += balance;
    else entry.buckets['90+'] += balance;
    entry.invoices.push({
      invoice: inv.doc_number ?? '—',
      txn_date: inv.txn_date,
      due_date: inv.due_date,
      balance,
      daysOutstanding,
      daysOverdue,
    });
  }
  return Array.from(byCustomer.values()).map(c => ({
    ...c,
    invoices: c.invoices.sort((a, b) => b.daysOverdue - a.daysOverdue),
  }));
}

type ArSortKey = 'customer' | 'balance' | 'invoiceCount' | 'oldestDays';

function ArDrilldownBody({ invoices }: { invoices: ArInvoice[] }) {
  const customers = useMemo(() => aggregateAr(invoices), [invoices]);
  const [sortKey, setSortKey] = useState<ArSortKey>('balance');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...customers].sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [customers, sortKey, sortDir]);

  const toggle = (c: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });

  const setSort = (k: ArSortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir(k === 'customer' ? 'asc' : 'desc'); }
  };

  const headerStyle: React.CSSProperties = {
    padding: '10px 14px', fontSize: 9, fontWeight: 700, letterSpacing: '.08em',
    textTransform: 'uppercase', color: 'rgba(160,200,255,0.55)',
    borderBottom: '1px solid rgba(120,170,255,0.2)', textAlign: 'left',
    position: 'sticky', top: 0, background: 'rgba(10,18,36,0.97)',
    userSelect: 'none',
  };
  const sortBtn = (label: string, k: ArSortKey, align: 'left' | 'right' = 'left') => (
    <span
      onClick={() => setSort(k)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        cursor: 'pointer', justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        width: '100%',
      }}
    >
      {label}
      {sortKey === k && (sortDir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
    </span>
  );

  if (!customers.length) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'rgba(180,200,230,0.65)', fontSize: 13 }}>
        No outstanding invoices.
      </div>
    );
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr>
          <th style={{ ...headerStyle, width: 28 }} />
          <th style={headerStyle}>{sortBtn('Customer', 'customer')}</th>
          <th style={{ ...headerStyle, textAlign: 'right' }}>{sortBtn('Outstanding', 'balance', 'right')}</th>
          <th style={{ ...headerStyle, textAlign: 'right' }}>{sortBtn('Invoices', 'invoiceCount', 'right')}</th>
          <th style={{ ...headerStyle, textAlign: 'right' }}>{sortBtn('Oldest (days)', 'oldestDays', 'right')}</th>
          <th style={headerStyle}>Aging</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((c) => {
          const isOpen = expanded.has(c.customer);
          return (
            <React.Fragment key={c.customer}>
              <tr
                onClick={() => toggle(c.customer)}
                style={{
                  borderBottom: '1px solid rgba(120,170,255,0.08)',
                  cursor: 'pointer',
                }}
              >
                <td style={{ padding: '10px 8px', color: 'rgba(180,200,230,0.7)' }}>
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </td>
                <td style={{ padding: '10px 14px', color: '#dde8f8', fontWeight: 500 }}>{c.customer}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', tabularNums: 'tabular-nums' } as React.CSSProperties}>
                  {formatCurrency(c.balance)}
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'right', color: 'rgba(200,225,245,0.85)' }}>
                  {c.invoiceCount}
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                  <span style={{
                    color: c.oldestDays > 90 ? '#f87171' : c.oldestDays > 30 ? '#fbbf24' : 'rgba(200,225,245,0.75)',
                    fontWeight: 500,
                  }}>
                    {c.oldestDays > 0 ? `${c.oldestDays}d` : '—'}
                  </span>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <AgingMiniBar buckets={c.buckets} total={c.balance} />
                </td>
              </tr>
              {isOpen && (
                <tr style={{ background: 'rgba(80,140,255,0.04)' }}>
                  <td colSpan={6} style={{ padding: '8px 14px 16px 42px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={{ ...headerStyle, position: 'static', padding: '6px 10px' }}>Invoice #</th>
                          <th style={{ ...headerStyle, position: 'static', padding: '6px 10px' }}>Invoice Date</th>
                          <th style={{ ...headerStyle, position: 'static', padding: '6px 10px' }}>Due Date</th>
                          <th style={{ ...headerStyle, position: 'static', padding: '6px 10px', textAlign: 'right' }}>Balance</th>
                          <th style={{ ...headerStyle, position: 'static', padding: '6px 10px', textAlign: 'right' }}>Days Outstanding</th>
                          <th style={{ ...headerStyle, position: 'static', padding: '6px 10px', textAlign: 'right' }}>Days Overdue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.invoices.map((inv, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid rgba(120,170,255,0.06)' }}>
                            <td style={{ padding: '6px 10px', color: 'rgba(200,225,245,0.85)' }}>{inv.invoice}</td>
                            <td style={{ padding: '6px 10px', color: 'rgba(180,200,230,0.75)' }}>{inv.txn_date ?? '—'}</td>
                            <td style={{ padding: '6px 10px', color: 'rgba(180,200,230,0.75)' }}>{inv.due_date ?? '—'}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', color: '#dde8f8' }}>{formatCurrency(inv.balance)}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', color: 'rgba(200,225,245,0.75)' }}>{inv.daysOutstanding}d</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                              {inv.daysOverdue > 0 ? (
                                <span style={{ color: inv.daysOverdue > 60 ? '#f87171' : '#fbbf24', fontWeight: 500 }}>
                                  {inv.daysOverdue}d
                                </span>
                              ) : <span style={{ opacity: 0.5 }}>—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function AgingMiniBar({ buckets, total }: { buckets: ArCustomerRow['buckets']; total: number }) {
  const segs: Array<{ key: string; value: number; color: string; label: string }> = [
    { key: 'current', value: buckets.current,  color: '#34d399', label: 'Current' },
    { key: '1-30',    value: buckets['1-30'],  color: '#fbbf24', label: '1–30' },
    { key: '31-60',   value: buckets['31-60'], color: '#fb923c', label: '31–60' },
    { key: '61-90',   value: buckets['61-90'], color: '#f87171', label: '61–90' },
    { key: '90+',     value: buckets['90+'],   color: '#dc2626', label: '90+' },
  ];
  if (total <= 0) return <span style={{ opacity: 0.5 }}>—</span>;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 160 }}>
      <div style={{ display: 'flex', height: 6, width: 120, borderRadius: 3, overflow: 'hidden', background: 'rgba(120,170,255,0.1)' }}>
        {segs.map(s => s.value > 0 && (
          <div
            key={s.key}
            title={`${s.label}: ${formatCurrency(s.value)}`}
            style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
          />
        ))}
      </div>
    </div>
  );
}
