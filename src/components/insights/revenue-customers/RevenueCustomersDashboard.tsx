import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

// Re-use existing chart widgets (Phase 2 will refactor their internals to
// consume the filter context; for now they retain their internal data fetching
// but live inside the unified responsive grid).
const IncomeYTDMoMVarianceCard = lazy(() => import('../IncomeYTDMoMVarianceCard').then(m => ({ default: m.IncomeYTDMoMVarianceCard })));
const IncomeYTDByEntityCard = lazy(() => import('../IncomeYTDByEntityCard').then(m => ({ default: m.IncomeYTDByEntityCard })));
const YTDIncomeBreakdownByEntityCard = lazy(() => import('../YTDIncomeBreakdownByEntityCard').then(m => ({ default: m.YTDIncomeBreakdownByEntityCard })));
const FinServTTMTop5CustomersCard = lazy(() => import('../FinServTTMTop5CustomersCard').then(m => ({ default: m.FinServTTMTop5CustomersCard })));
const IncomeMoMCard = lazy(() => import('../IncomeMoMCard').then(m => ({ default: m.IncomeMoMCard })));
const FinServTopCustomersCard = lazy(() => import('../FinServTopCustomersCard').then(m => ({ default: m.FinServTopCustomersCard })));
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
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 [&>*]:min-w-0">
          <Suspense fallback={<ChartFallback />}><div className="xl:col-span-2"><IncomeYTDByEntityCard /></div></Suspense>
          <Suspense fallback={<ChartFallback />}><div className="xl:col-span-2"><IncomeYTDMoMVarianceCard /></div></Suspense>
          <Suspense fallback={<ChartFallback />}><div className="xl:col-span-2"><YTDIncomeBreakdownByEntityCard /></div></Suspense>
          <Suspense fallback={<ChartFallback />}><div className="xl:col-span-2"><FinServTTMTop5CustomersCard /></div></Suspense>
          <Suspense fallback={<ChartFallback />}><div className="xl:col-span-2"><IncomeMoMCard /></div></Suspense>
          <Suspense fallback={<ChartFallback />}><div className="xl:col-span-2"><FinServTopCustomersCard /></div></Suspense>
    </div>
  );
}