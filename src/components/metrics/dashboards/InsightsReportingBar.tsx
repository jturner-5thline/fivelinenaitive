import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { format, endOfDay, startOfDay, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { useQuickBooksMetrics } from '@/hooks/useQuickBooksMetrics';
import { useMetricsData } from '@/hooks/useMetricsData';
import { useInsightsTimeframe } from '@/contexts/InsightsTimeframeContext';

const fmtUSD = (v: number | null | undefined) => {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  return `${sign}$${(abs / 1_000_000).toFixed(2)}MM`;
};

const parseValueDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const toRange = (start: string, end: string) => ({
  start: startOfDay(parseValueDate(start) ?? new Date()),
  end: endOfDay(parseValueDate(end) ?? new Date()),
});

const sumInRange = <T,>(items: T[], range: { start: Date; end: Date }, getDate: (i: T) => string | null | undefined, getAmount: (i: T) => number | null | undefined) =>
  items.reduce((sum, item) => {
    const d = parseValueDate(getDate(item));
    if (!d || !isWithinInterval(d, range)) return sum;
    return sum + Number(getAmount(item) ?? 0);
  }, 0);

interface Props {
  tabsSlot?: React.ReactNode;
}

export function InsightsReportingBar({ tabsSlot }: Props) {
  const queryClient = useQueryClient();
  const qb = useQuickBooksMetrics();
  const metrics = useMetricsData();
  const { reportingPeriod, timeframe } = useInsightsTimeframe();
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const periodRange = useMemo(
    () => toRange(reportingPeriod?.start ?? timeframe.start, reportingPeriod?.end ?? timeframe.end),
    [reportingPeriod?.start, reportingPeriod?.end, timeframe.start, timeframe.end],
  );
  const periodLabel = reportingPeriod?.label ?? timeframe.label;
  const periodToken = reportingPeriod?.period ?? `${timeframe.start}_${timeframe.end}`;

  const ytdRange = useMemo(() => ({
    start: startOfDay(new Date(periodRange.end.getFullYear(), 0, 1)),
    end: periodRange.end,
  }), [periodRange.end]);

  const qbInvoices = qb.rawInvoices ?? [];
  const qbConnected = (qb.rawInvoices?.length ?? 0) > 0 || (qb.rawPayments?.length ?? 0) > 0 || (qb.rawExpenses?.length ?? 0) > 0;

  const totalRevCurr = useMemo(
    () => qbConnected ? sumInRange(qbInvoices, periodRange, (inv: any) => inv.txn_date, (inv: any) => inv.total_amt) : null,
    [qbConnected, qbInvoices, periodRange],
  );
  const ytdRevenue = useMemo(
    () => qbConnected ? sumInRange(qbInvoices, ytdRange, (inv: any) => inv.txn_date, (inv: any) => inv.total_amt) : null,
    [qbConnected, qbInvoices, ytdRange],
  );

  const isLoading = qb.isLoading || metrics.isLoading;
  useEffect(() => {
    if (!qb.isLoading && !metrics.isLoading) setLastUpdated(new Date());
  }, [qb.isLoading, metrics.isLoading, periodToken]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['quickbooks-invoices'] }),
        queryClient.invalidateQueries({ queryKey: ['quickbooks-customers'] }),
        queryClient.invalidateQueries({ queryKey: ['quickbooks-payments'] }),
        queryClient.invalidateQueries({ queryKey: ['qb-quickbooks_expenses'] }),
        queryClient.invalidateQueries({ queryKey: ['qb-quickbooks_bills'] }),
        queryClient.invalidateQueries({ queryKey: ['qb-quickbooks_accounts'] }),
        queryClient.invalidateQueries({ queryKey: ['metrics-deals'] }),
        metrics.refetch(),
      ]);
      setLastUpdated(new Date());
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <Card className="glass-module">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {tabsSlot}
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
              Reporting period {periodLabel}
            </span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
              Last updated {format(lastUpdated, 'MMM d, yyyy h:mm a')}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, flexWrap: 'wrap' }}>
            <span style={{ color: 'rgba(255,255,255,0.5)' }}>Period Rev</span>
            <span style={{ fontWeight: 700, color: '#e8f6ff' }}>{fmtUSD(totalRevCurr)}</span>
            <span style={{ color: 'rgba(255,255,255,0.5)' }}>YTD</span>
            <span style={{ fontWeight: 700, color: '#e8f6ff' }}>{fmtUSD(ytdRevenue)}</span>
            <button
              onClick={handleRefresh}
              disabled={refreshing || isLoading}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                background: 'rgba(255,255,255,0.08)', color: 'hsl(213,90%,70%)',
                border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
                opacity: (refreshing || isLoading) ? 0.6 : 1,
              }}
            >
              {refreshing || isLoading
                ? <Loader2 size={12} className="animate-spin" />
                : <RefreshCw size={12} />}
              Refresh
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default InsightsReportingBar;
