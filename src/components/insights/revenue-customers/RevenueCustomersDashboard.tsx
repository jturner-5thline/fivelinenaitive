import { lazy, Suspense } from 'react';
import { RevenueFiltersProvider } from './filterContext';
import { RevenueDrilldownProvider, useDrilldown } from './RevenueDrilldownDrawer';
import { RevenueCustomersToolbar } from './RevenueCustomersToolbar';
import { KpiTile } from './KpiTile';
import { useIncomeKpis } from './hooks/useIncomeKpis';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, UserPlus, UserMinus, DollarSign, TrendingUp } from 'lucide-react';

// Re-use existing chart widgets (Phase 2 will refactor their internals to
// consume the filter context; for now they retain their internal data fetching
// but live inside the unified responsive grid).
const IncomeYTDMoMVarianceCard = lazy(() => import('../IncomeYTDMoMVarianceCard').then(m => ({ default: m.IncomeYTDMoMVarianceCard })));
const IncomeYTDByEntityCard = lazy(() => import('../IncomeYTDByEntityCard').then(m => ({ default: m.IncomeYTDByEntityCard })));
const YTDIncomeBreakdownByEntityCard = lazy(() => import('../YTDIncomeBreakdownByEntityCard').then(m => ({ default: m.YTDIncomeBreakdownByEntityCard })));
const IncomeYTDChangeByEntityCard = lazy(() => import('../IncomeYTDChangeByEntityCard').then(m => ({ default: m.IncomeYTDChangeByEntityCard })));
const FinServTTMTop5CustomersCard = lazy(() => import('../FinServTTMTop5CustomersCard').then(m => ({ default: m.FinServTTMTop5CustomersCard })));
const TotalIncomeRolling12MoCard = lazy(() => import('../TotalIncomeRolling12MoCard').then(m => ({ default: m.TotalIncomeRolling12MoCard })));
const IncomeVsCOGSRolling12MoCard = lazy(() => import('../IncomeVsCOGSRolling12MoCard').then(m => ({ default: m.IncomeVsCOGSRolling12MoCard })));
const IncomeMoMCard = lazy(() => import('../IncomeMoMCard').then(m => ({ default: m.IncomeMoMCard })));
const ClientCountMoMCard = lazy(() => import('../ClientCountMoMCard').then(m => ({ default: m.ClientCountMoMCard })));
const IncomeTop5CustomersMoMCard = lazy(() => import('../IncomeTop5CustomersMoMCard').then(m => ({ default: m.IncomeTop5CustomersMoMCard })));
const FinServTopCustomersCard = lazy(() => import('../FinServTopCustomersCard').then(m => ({ default: m.FinServTopCustomersCard })));

function fmtCurrency(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function KpiRow() {
  const k = useIncomeKpis();
  const { open } = useDrilldown();

  const openIncomeDrill = () => {
    open({
      title: 'Income (selected period)',
      description: `${k.rows.length} invoices`,
      rows: k.rows.map((r: any) => ({
        customer: r.customer_ref_name ?? '—',
        date: r.txn_date,
        amount: Number(r.total_amt) || 0,
      })),
      columns: [
        { key: 'customer', label: 'Customer' },
        { key: 'date', label: 'Date' },
        { key: 'amount', label: 'Amount', align: 'right', format: (v) => fmtCurrency(Number(v)) },
      ],
    });
  };

  const openCustomerDrill = () => {
    const byCust = new Map<string, number>();
    for (const r of k.rows as any[]) {
      const c = r.customer_ref_name || '—';
      byCust.set(c, (byCust.get(c) ?? 0) + (Number(r.total_amt) || 0));
    }
    const rows = [...byCust.entries()].map(([customer, income]) => ({ customer, income }));
    open({
      title: 'Customers (selected period)',
      description: `${rows.length} unique customers`,
      rows,
      columns: [
        { key: 'customer', label: 'Customer' },
        { key: 'income', label: 'Income', align: 'right', format: (v) => fmtCurrency(Number(v)) },
      ],
    });
  };

  const cmpLabel =
    k.delta == null ? undefined :
    'vs prior';

  return (
    <>
      <KpiTile
        label="Total Income"
        value={k.isLoading ? '' : fmtCurrency(k.currTotal)}
        delta={k.delta}
        deltaLabel={cmpLabel}
        sparklineData={k.sparkline}
        sparklineType="area"
        loading={k.isLoading}
        onClick={openIncomeDrill}
        icon={<DollarSign className="h-3.5 w-3.5" />}
      />
      <KpiTile
        label="Total Customers"
        value={k.isLoading ? '' : String(k.customerCount)}
        delta={k.customerDelta}
        deltaLabel={cmpLabel}
        loading={k.isLoading}
        onClick={openCustomerDrill}
        icon={<Users className="h-3.5 w-3.5" />}
      />
      <KpiTile
        label="New Customers"
        value={k.isLoading ? '' : String(k.newCustomers)}
        loading={k.isLoading}
        icon={<UserPlus className="h-3.5 w-3.5" />}
      />
      <KpiTile
        label="Churned Customers"
        value={k.isLoading ? '' : String(k.churnedCustomers)}
        loading={k.isLoading}
        icon={<UserMinus className="h-3.5 w-3.5" />}
      />
      <KpiTile
        label="ARPU"
        value={k.isLoading ? '' : fmtCurrency(k.arpu)}
        delta={k.priorArpu > 0 ? (k.arpu - k.priorArpu) / k.priorArpu : null}
        deltaLabel={cmpLabel}
        loading={k.isLoading}
        icon={<TrendingUp className="h-3.5 w-3.5" />}
      />
    </>
  );
}

function ChartFallback() {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 min-h-[280px]">
      <Skeleton className="h-4 w-40 mb-3" />
      <Skeleton className="h-[220px] w-full" />
    </div>
  );
}

export function RevenueCustomersDashboard() {
  return (
    <RevenueFiltersProvider>
      <RevenueDrilldownProvider>
        <RevenueCustomersToolbar />

        {/* KPI strip: 1/2/5 columns */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
          <KpiRow />
        </div>

        {/* Main chart grid: 12-col on xl, 2-col on lg, 1-col on mobile.
            We use a 2-col grid that doubles to 4-col on xl so existing charts
            sit cleanly side-by-side without overflow. */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 [&>*]:min-w-0">
          <Suspense fallback={<ChartFallback />}><div className="xl:col-span-2"><TotalIncomeRolling12MoCard /></div></Suspense>
          <Suspense fallback={<ChartFallback />}><div className="xl:col-span-2"><IncomeVsCOGSRolling12MoCard /></div></Suspense>
          <Suspense fallback={<ChartFallback />}><div className="xl:col-span-2"><IncomeYTDByEntityCard /></div></Suspense>
          <Suspense fallback={<ChartFallback />}><div className="xl:col-span-2"><IncomeYTDMoMVarianceCard /></div></Suspense>
          <Suspense fallback={<ChartFallback />}><div className="xl:col-span-2"><YTDIncomeBreakdownByEntityCard /></div></Suspense>
          <Suspense fallback={<ChartFallback />}><div className="xl:col-span-2"><IncomeYTDChangeByEntityCard /></div></Suspense>
          <Suspense fallback={<ChartFallback />}><div className="xl:col-span-2"><FinServTTMTop5CustomersCard /></div></Suspense>
          <Suspense fallback={<ChartFallback />}><div className="xl:col-span-2"><IncomeMoMCard /></div></Suspense>
          <Suspense fallback={<ChartFallback />}><div className="xl:col-span-2"><ClientCountMoMCard /></div></Suspense>
          <Suspense fallback={<ChartFallback />}><div className="xl:col-span-2"><IncomeTop5CustomersMoMCard /></div></Suspense>
          <Suspense fallback={<ChartFallback />}><div className="xl:col-span-4"><FinServTopCustomersCard /></div></Suspense>
        </div>
      </RevenueDrilldownProvider>
    </RevenueFiltersProvider>
  );
}