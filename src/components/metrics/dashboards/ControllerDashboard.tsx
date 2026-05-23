import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
} from 'recharts';
import { createGlassBarShape } from '@/components/metrics/charts/LiquidGlassBar';
import { InsightsDrilldownDrawer, type DrilldownContext, type DrilldownColumn } from '@/components/metrics/insights/InsightsDrilldownDrawer';
import { QuickBooksFinancialDashboard } from './QuickBooksFinancialDashboard';

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

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
};

const formatCurrencyFull = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

const truncateLabel = (label: string, maxLen = 14) =>
  label.length > maxLen ? label.slice(0, maxLen) + '…' : label;

/* ─── Revenue-by-Client hook ─── */
function useRevenueByClient(realmId: string) {
  return useQuery({
    queryKey: ['controller-revenue-by-client', realmId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quickbooks_invoices')
        .select('customer_name, total_amt')
        .eq('realm_id', realmId);

      if (error) throw error;

      const map: Record<string, number> = {};
      (data ?? []).forEach((inv) => {
        const name = inv.customer_name || 'Unknown';
        map[name] = (map[name] || 0) + (Number(inv.total_amt) || 0);
      });

      return Object.entries(map)
        .map(([name, revenue]) => ({ name, revenue }))
        .sort((a, b) => b.revenue - a.revenue);
    },
  });
}

/* ─── Credit Card Balances hook ─── */
function useCreditCardBalances() {
  return useQuery({
    queryKey: ['controller-credit-card-balances'],
    queryFn: async () => {
      const allRealms = [...new Set(CREDIT_CARD_ACCOUNTS.map((a) => a.realm_id))];
      const { data, error } = await supabase
        .from('quickbooks_accounts')
        .select('name, current_balance, realm_id')
        .eq('account_type', 'Credit Card')
        .in('realm_id', allRealms);

      if (error) throw error;

      return CREDIT_CARD_ACCOUNTS.map((acc) => {
        const match = (data ?? []).find(
          (row) => row.name === acc.qbName && row.realm_id === acc.realm_id
        );
        return {
          name: acc.displayName,
          balance: Math.abs(Number(match?.current_balance) || 0),
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
        .select('name, current_balance, realm_id')
        .eq('account_type', 'Bank')
        .or('name.ilike.%chase%,name.ilike.%m&t%,name.ilike.%m & t%');

      if (error) throw error;

      return (data ?? [])
        .map((row) => ({
          name: row.name,
          balance: Number(row.current_balance) || 0,
        }))
        .sort((a, b) => b.balance - a.balance);
    },
  });
}

/* ─── Shared chart card wrapper ─── */
function ChartCard({
  title,
  subtitle,
  isLoading,
  isError,
  isEmpty,
  children,
}: {
  title: string;
  subtitle?: string;
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className="glass-module">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
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

/* ─── Main dashboard ─── */
export function ControllerDashboard() {
  const finservRevenue = useRevenueByClient(FINSERV_REALM_ID);
  const debtRevenue = useRevenueByClient(DEBT_REALM_ID);
  const firmLiquidity = useFirmLiquidity();
  const creditCards = useCreditCardBalances();

  // Universal drilldown state
  const [drill, setDrill] = useState<{
    context: DrilldownContext;
    columns: DrilldownColumn[];
    rows: Array<Record<string, unknown>>;
  } | null>(null);

  const openClientDrill = (label: string, sourceLabel: string, value: number) => {
    setDrill({
      context: { sourceId: 'controller:client-revenue', sourceLabel, selection: label },
      columns: [
        { key: 'metric', label: 'Field' },
        { key: 'value', label: 'Value', align: 'right' },
      ],
      rows: [
        { metric: 'Client', value: label },
        { metric: 'Total Revenue (TTM)', value: formatCurrencyFull(value) },
      ],
    });
  };

  const openAccountDrill = (label: string, sourceLabel: string, value: number) => {
    setDrill({
      context: { sourceId: 'controller:account-balance', sourceLabel, selection: label },
      columns: [
        { key: 'metric', label: 'Field' },
        { key: 'value', label: 'Value', align: 'right' },
      ],
      rows: [
        { metric: 'Account', value: label },
        { metric: 'Current Balance', value: formatCurrencyFull(value) },
      ],
    });
  };

  return (
    <>
    <div className="space-y-6">
      {/* Revenue by client: FinServ + Debt side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="FinServ Revenue by Client"
          subtitle="5th Line Financial Services, LLC"
          isLoading={finservRevenue.isLoading}
          isError={finservRevenue.isError}
          isEmpty={!finservRevenue.data?.length}
        >
          <div className="h-[300px]">
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
                  onClick={(d: any) => openClientDrill(d?.name, 'FinServ Revenue by Client', Number(d?.revenue) || 0)}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Debt Revenue by Client"
          subtitle="5th Line Capital Advisors, LLC"
          isLoading={debtRevenue.isLoading}
          isError={debtRevenue.isError}
          isEmpty={!debtRevenue.data?.length}
        >
          <div className="h-[300px]">
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
                  onClick={(d: any) => openClientDrill(d?.name, 'Debt Revenue by Client', Number(d?.revenue) || 0)}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* Credit Card Balances */}
      <ChartCard
        title="Credit Card Balances"
        subtitle="All Connected Entities"
        isLoading={creditCards.isLoading}
        isError={creditCards.isError}
        isEmpty={!creditCards.data?.length}
      >
        <div className="h-[260px] max-w-2xl">
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
                onClick={(d: any) => openAccountDrill(d?.name, 'Credit Card Balances', Number(d?.balance) || 0)}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* Firm Liquidity */}
      <ChartCard
        title="Firm Liquidity"
        subtitle="All Connected Entities"
        isLoading={firmLiquidity.isLoading}
        isError={firmLiquidity.isError}
        isEmpty={!firmLiquidity.data?.length}
      >
        <div className="h-[280px]">
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
                onClick={(d: any) => openAccountDrill(d?.name, 'Firm Liquidity', Number(d?.balance) || 0)}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
    <InsightsDrilldownDrawer
      open={!!drill}
      onClose={() => setDrill(null)}
      context={drill?.context ?? null}
      columns={drill?.columns ?? []}
      rows={drill?.rows ?? []}
      emptyHint="No detail records available."
    />
    {/*
      QuickBooks Financial tiles — merged in from the standalone
      "QuickBooks Financial" dashboard so the Controller Dashboard is the
      single source of truth for QBO-driven financial reporting.
      Preserves the original data sources, configs, filters, and drilldowns.
    */}
    <div className="mt-8 space-y-3">
      <div>
        <h3 className="text-base font-semibold text-foreground">QuickBooks Financial</h3>
        <p className="text-xs text-muted-foreground">
          P&amp;L, A/R, payments, and customer-level reporting across connected QuickBooks entities.
        </p>
      </div>
      <QuickBooksFinancialDashboard />
    </div>
    </>
  );
}
