import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LabelList,
} from 'recharts';
import { createGlassBarShape } from '@/components/metrics/charts/LiquidGlassBar';
import {
  InsightsTimeRangeSelector,
  type InsightsTimeRangeValue,
} from '@/components/insights/InsightsTimeRangeSelector';
import {
  defaultGranularityForRange,
  loadPersistedRange,
  resolveRange,
} from '@/lib/insightsTimeRange';
import {
  DrilldownProvider,
  useDrilldown,
  type DrilldownRequest,
} from '@/components/insights/ChartDrilldown';
import { QuickBooksFinancialDashboard } from './QuickBooksFinancialDashboard';
import {
  resolveQboClientLabelEnriched,
  buildCrmCompanyNameIndex,
  OTHER_INDIVIDUALS_LABEL,
} from '@/lib/qboClientName';
import { useLocalStorageState } from '@/hooks/useLocalStorageState';

const DEBT_REALM_ID = '193514877331929';
const FINSERV_REALM_ID = '9341451968897660';

// Credit card accounts – sourced from multiple QuickBooks entities
const CREDIT_CARD_REALM = '123146077561874';
const CREDIT_CARD_ACCOUNTS = [
  { qbName: 'AMEX 41002',           displayName: 'AMEX 41002',        realm_id: CREDIT_CARD_REALM },
  { qbName: 'Amex x82008',          displayName: 'Amex x82008',       realm_id: CREDIT_CARD_REALM },
  { qbName: 'Ramp Visa x5454',      displayName: 'Ramp Visa x5454',   realm_id: CREDIT_CARD_REALM },
  { qbName: 'Wells Fargo CC #5733', displayName: 'Wells Fargo 5733',   realm_id: DEBT_REALM_ID },
  { qbName: 'Wells Fargo CC #5758', displayName: 'Wells Fargo 5758',   realm_id: '9130350272677286' },
];

const QBO_CHART_OF_ACCOUNTS_URL = 'https://qbo.intuit.com/app/chartofaccounts';
const QBO_CUSTOMERS_URL = 'https://qbo.intuit.com/app/customers';

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
};

const formatCurrencyFull = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

const truncateLabel = (label: string, maxLen = 14) =>
  label.length > maxLen ? label.slice(0, maxLen) + '…' : label;

/** 80th-percentile data-label formatter — only labels bars that are large
 *  enough to read without colliding with neighbors. */
function makeLabelFormatter(values: number[]) {
  const sorted = [...values].filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (!sorted.length) return () => '';
  const threshold = sorted[Math.floor(sorted.length * 0.2)] ?? 0;
  return (v: number) => (v >= threshold ? formatCurrency(v) : '');
}

const dataLabelStyle = {
  fill: 'hsl(var(--muted-foreground))',
  fontSize: 10,
  fontWeight: 500,
} as const;

/* ─── Revenue-by-Client hook (period-aware) ─── */
function useRevenueByClient(realmId: string, period: { start: string; end: string }) {
  return useQuery({
    queryKey: ['controller-revenue-by-client', realmId, period.start, period.end],
    queryFn: async () => {
      const [invoiceRes, customerRes, companyRes] = await Promise.all([
        supabase
          .from('quickbooks_invoices')
          .select('customer_id, customer_name, total_amt, txn_date')
          .eq('realm_id', realmId)
          .gte('txn_date', period.start)
          .lte('txn_date', period.end),
        supabase
          .from('quickbooks_customers')
          .select('qb_id, display_name, company_name')
          .eq('realm_id', realmId),
        supabase.from('companies').select('name').not('name', 'is', null),
      ]);

      if (invoiceRes.error) throw invoiceRes.error;
      if (customerRes.error) throw customerRes.error;

      const customerById = new Map<string, { company_name: string | null; display_name: string | null }>();
      for (const c of customerRes.data ?? []) {
        if (!c.qb_id) continue;
        customerById.set(c.qb_id, { company_name: c.company_name, display_name: c.display_name });
      }
      const crmIndex = buildCrmCompanyNameIndex(companyRes.data ?? []);

      const map: Record<string, number> = {};
      for (const inv of invoiceRes.data ?? []) {
        const customer = inv.customer_id ? customerById.get(inv.customer_id) : undefined;
        const label = resolveQboClientLabelEnriched({
          customerName: inv.customer_name,
          customer,
          crmCompanyIndex: crmIndex,
        });
        map[label] = (map[label] || 0) + (Number(inv.total_amt) || 0);
      }

      return Object.entries(map)
        .map(([name, revenue]) => ({ name, revenue }))
        // Sort by revenue desc; keep "Other / Individuals" pinned to the end so
        // it never dominates the eye at the top of the chart.
        .sort((a, b) => {
          if (a.name === OTHER_INDIVIDUALS_LABEL) return 1;
          if (b.name === OTHER_INDIVIDUALS_LABEL) return -1;
          return b.revenue - a.revenue;
        });
    },
  });
}

/* ─── Credit Card Balances hook (current snapshot) ─── */
function useCreditCardBalances() {
  return useQuery({
    queryKey: ['controller-credit-card-balances'],
    queryFn: async () => {
      const allRealms = [...new Set(CREDIT_CARD_ACCOUNTS.map((a) => a.realm_id))];
      const { data, error } = await supabase
        .from('quickbooks_accounts')
        .select('name, current_balance, realm_id, synced_at')
        .eq('account_type', 'Credit Card')
        .in('realm_id', allRealms);

      if (error) throw error;

      return CREDIT_CARD_ACCOUNTS.map((acc) => {
        const match = (data ?? []).find(
          (row) => row.name === acc.qbName && row.realm_id === acc.realm_id,
        );
        return {
          name: acc.displayName,
          balance: Math.abs(Number(match?.current_balance) || 0),
          realm_id: acc.realm_id,
          updated_at: match?.synced_at ?? null,
        };
      });
    },
  });
}

/* ─── Firm Liquidity: Chase & M&T bank accounts across all realms ─── */
function useFirmLiquidity() {
  return useQuery({
    queryKey: ['controller-firm-liquidity'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quickbooks_accounts')
        .select('name, current_balance, realm_id, synced_at')
        .eq('account_type', 'Bank')
        .or('name.ilike.%chase%,name.ilike.%m&t%,name.ilike.%m & t%');

      if (error) throw error;

      return (data ?? [])
        .map((row) => ({
          name: row.name,
          balance: Number(row.current_balance) || 0,
          realm_id: row.realm_id,
          updated_at: row.synced_at ?? null,
        }))
        .sort((a, b) => b.balance - a.balance);
    },
  });
}

/* ─── Shared chart card wrapper ─── */
function ChartCard({
  title,
  subtitle,
  badge,
  isLoading,
  isError,
  isEmpty,
  children,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className="glass-module">
      <CardHeader className="pb-2 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {badge && (
            <Badge variant="outline" className="text-[10px] shrink-0">
              {badge}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-12 text-destructive gap-2">
            <AlertCircle className="h-6 w-6" />
            <p className="text-sm">Something went wrong loading this widget</p>
          </div>
        ) : isEmpty ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <p className="text-sm">No QuickBooks data available for this period</p>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Custom tooltip ─── */
function CurrencyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/15 bg-[hsl(var(--popover)/0.96)] px-3 py-2 text-xs text-white shadow-xl backdrop-blur-xl">
      <p className="mb-1 font-semibold text-white">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="font-medium text-white/90">
          {formatCurrencyFull(p.value)}
        </p>
      ))}
    </div>
  );
}

/* ─── Inner shell (uses useDrilldown — must live under DrilldownProvider) ─── */
function ControllerDashboardInner() {
  // ── Shared time-range selector (parity with FinServ board) ──────────────
  const initialPersisted = useMemo(() => loadPersistedRange('controller-dashboard'), []);
  const initialResolved = useMemo(() => {
    const id = initialPersisted?.presetId ?? 'ytd';
    return resolveRange(id, {
      custom: initialPersisted?.custom,
      includeCurrentMonth: initialPersisted?.includeCurrentMonth ?? true,
    });
  }, [initialPersisted]);
  const [range, setRange] = useState<InsightsTimeRangeValue>(() => ({
    presetId: initialPersisted?.presetId ?? 'ytd',
    granularity:
      initialPersisted?.granularity ?? defaultGranularityForRange(initialResolved.start, initialResolved.end),
    custom: initialPersisted?.custom,
    includeCurrentMonth: initialPersisted?.includeCurrentMonth ?? true,
    resolved: initialResolved,
  }));

  const granularityLabel =
    range.granularity === 'monthly' ? 'Monthly' :
    range.granularity === 'quarterly' ? 'Quarterly' : 'Yearly';
  const periodBadge = `${granularityLabel} · ${range.resolved.label}`;
  const snapshotBadge = `Snapshot · today · ${range.resolved.label}`;

  const period = useMemo(
    () => ({ start: range.resolved.start, end: range.resolved.end, label: range.resolved.label }),
    [range.resolved.start, range.resolved.end, range.resolved.label],
  );

  // Per-user "show data labels" toggle (Scott's nice-to-have).
  const [showDataLabels, setShowDataLabels] = useLocalStorageState<boolean>(
    'controller-dashboard:data-labels',
    true,
  );

  // Data — every period-bound hook resubscribes when the selector changes.
  const finservRevenue = useRevenueByClient(FINSERV_REALM_ID, period);
  const debtRevenue    = useRevenueByClient(DEBT_REALM_ID, period);
  const firmLiquidity  = useFirmLiquidity();
  const creditCards    = useCreditCardBalances();

  // ── Drilldown wiring ────────────────────────────────────────────────────
  const { open: openDrill } = useDrilldown();

  const openClientDrill = (
    label: string,
    sourceLabel: string,
    realm: string,
    revenueInPeriod: number,
  ) => {
    const req: DrilldownRequest = {
      kind: 'client-series',
      sourceLabel,
      selection: label,
      period,
      granularity: range.granularity,
      client: label,
      realm,
      externalLink: { href: QBO_CUSTOMERS_URL, label: 'View customer in QuickBooks' },
      rows: [
        { metric: 'Client', value: label },
        { metric: 'Revenue in period', value: formatCurrencyFull(revenueInPeriod) },
      ],
    };
    openDrill(req);
  };

  const openAccountDrill = (
    label: string,
    sourceLabel: string,
    value: number,
    extras: Array<{ metric: string; value: string }> = [],
  ) => {
    openDrill({
      kind: 'value',
      sourceLabel,
      selection: label,
      period,
      granularity: range.granularity,
      externalLink: { href: QBO_CHART_OF_ACCOUNTS_URL, label: 'View account in QuickBooks' },
      rows: [
        { metric: 'Account', value: label },
        { metric: 'Current Balance', value: formatCurrencyFull(value) },
        ...extras,
      ],
    });
  };

  return (
    <div className="space-y-6">
      {/* Shared time-range selector (parity with FinServ board) */}
      <div className="flex items-center gap-3 flex-wrap">
        <InsightsTimeRangeSelector
          boardId="controller-dashboard"
          defaultPresetId="ytd"
          defaultGranularity="monthly"
          onChange={setRange}
        />
        <div className="flex items-center gap-2 ml-auto">
          <Switch
            id="controller-data-labels"
            checked={showDataLabels}
            onCheckedChange={setShowDataLabels}
          />
          <Label htmlFor="controller-data-labels" className="text-xs text-muted-foreground cursor-pointer">
            Show data labels
          </Label>
        </div>
        {(finservRevenue.isLoading || debtRevenue.isLoading) && (
          <Badge variant="outline" className="text-xs animate-pulse">Loading from QuickBooks…</Badge>
        )}
      </div>

      {/* Revenue by client: FinServ + Debt side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="FinServ Revenue by Client"
          subtitle="5th Line Financial Services, LLC"
          badge={periodBadge}
          isLoading={finservRevenue.isLoading}
          isError={finservRevenue.isError}
          isEmpty={!finservRevenue.data?.length}
        >
          <div className="h-[300px]" role="group" aria-label="FinServ revenue by client">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={finservRevenue.data} margin={{ bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(v) => truncateLabel(v)}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis
                  tickFormatter={formatCurrency}
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                />
                <Tooltip content={<CurrencyTooltip />} />
                <Bar
                  dataKey="revenue"
                  fill="hsl(var(--primary))"
                  shape={createGlassBarShape({ radius: 3 })}
                  cursor="pointer"
                  aria-label="Click a client bar to open drilldown"
                  onClick={(d: any) => openClientDrill(d?.name, 'FinServ Revenue by Client', FINSERV_REALM_ID, Number(d?.revenue) || 0)}
                >
                  {showDataLabels && finservRevenue.data && (
                    <LabelList
                      dataKey="revenue"
                      position="top"
                      formatter={makeLabelFormatter(finservRevenue.data.map(d => d.revenue))}
                      style={dataLabelStyle}
                    />
                  )}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Debt Revenue by Client"
          subtitle="5th Line Capital Advisors, LLC"
          badge={periodBadge}
          isLoading={debtRevenue.isLoading}
          isError={debtRevenue.isError}
          isEmpty={!debtRevenue.data?.length}
        >
          <div className="h-[300px]" role="group" aria-label="Debt revenue by client">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={debtRevenue.data} margin={{ bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(v) => truncateLabel(v)}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis
                  tickFormatter={formatCurrency}
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                />
                <Tooltip content={<CurrencyTooltip />} />
                <Bar
                  dataKey="revenue"
                  fill="hsl(var(--chart-2))"
                  shape={createGlassBarShape({ radius: 3 })}
                  cursor="pointer"
                  aria-label="Click a client bar to open drilldown"
                  onClick={(d: any) => openClientDrill(d?.name, 'Debt Revenue by Client', DEBT_REALM_ID, Number(d?.revenue) || 0)}
                >
                  {showDataLabels && debtRevenue.data && (
                    <LabelList
                      dataKey="revenue"
                      position="top"
                      formatter={makeLabelFormatter(debtRevenue.data.map(d => d.revenue))}
                      style={dataLabelStyle}
                    />
                  )}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* Credit Card Balances — current snapshot (QBO doesn't keep balance history). */}
      <ChartCard
        title="Credit Card Balances"
        subtitle="All connected entities · current snapshot"
        badge={snapshotBadge}
        isLoading={creditCards.isLoading}
        isError={creditCards.isError}
        isEmpty={!creditCards.data?.length}
      >
        <div className="h-[260px] max-w-2xl" role="group" aria-label="Credit card balances">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={creditCards.data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis
                tickFormatter={formatCurrency}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              />
              <Tooltip content={<CurrencyTooltip />} />
              <Bar
                dataKey="balance"
                fill="hsl(var(--chart-3))"
                shape={createGlassBarShape({ radius: 3 })}
                cursor="pointer"
                aria-label="Click a card bar to open drilldown"
                onClick={(d: any) => openAccountDrill(
                  d?.name,
                  'Credit Card Balances',
                  Number(d?.balance) || 0,
                  [
                    { metric: 'QBO Realm', value: String(d?.realm_id ?? '') },
                    { metric: 'Last sync', value: d?.updated_at ? new Date(d.updated_at).toLocaleString() : '—' },
                  ],
                )}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* Firm Liquidity — current snapshot. */}
      <ChartCard
        title="Firm Liquidity"
        subtitle="All connected entities · current snapshot"
        badge={snapshotBadge}
        isLoading={firmLiquidity.isLoading}
        isError={firmLiquidity.isError}
        isEmpty={!firmLiquidity.data?.length}
      >
        <div className="h-[280px]" role="group" aria-label="Firm liquidity bank accounts">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={firmLiquidity.data} margin={{ bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(v) => truncateLabel(v)}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis
                tickFormatter={formatCurrency}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              />
              <Tooltip content={<CurrencyTooltip />} />
              <Bar
                dataKey="balance"
                fill="hsl(var(--chart-4))"
                shape={createGlassBarShape({ radius: 3 })}
                cursor="pointer"
                aria-label="Click an account bar to open drilldown"
                onClick={(d: any) => openAccountDrill(
                  d?.name,
                  'Firm Liquidity',
                  Number(d?.balance) || 0,
                  [
                    { metric: 'QBO Realm', value: String(d?.realm_id ?? '') },
                    { metric: 'Last sync', value: d?.updated_at ? new Date(d.updated_at).toLocaleString() : '—' },
                  ],
                )}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/*
        QuickBooks Financial tiles — merged in from the standalone
        "QuickBooks Financial" dashboard so the Controller Dashboard is the
        single source of truth for QBO-driven financial reporting. The whole
        section subscribes to the shared selector via the `period`/`periodBadge`
        props (revenue, payments, expenses, bills, top customers, invoice
        status — A/R, A/P, aging & overdue remain current snapshots since QBO
        doesn't keep balance history).
      */}
      <div className="mt-8 space-y-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">QuickBooks Financial</h3>
          <p className="text-xs text-muted-foreground">
            P&amp;L, A/R, payments, and customer-level reporting across connected QuickBooks entities.
          </p>
        </div>
        <QuickBooksFinancialDashboard
          period={period}
          periodBadge={periodBadge}
          granularity={range.granularity}
          showDataLabels={showDataLabels}
          revenueSource="pl"
        />
      </div>
    </div>
  );
}

/* ─── Public wrapper provides the shared drilldown drawer for every chart ─── */
export function ControllerDashboard() {
  return (
    <DrilldownProvider>
      <ControllerDashboardInner />
    </DrilldownProvider>
  );
}