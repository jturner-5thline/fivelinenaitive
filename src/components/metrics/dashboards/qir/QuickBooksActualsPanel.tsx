import React, { useMemo } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { useQBProfitAndLoss } from '@/hooks/useQBProfitAndLoss';
import { toast } from 'sonner';

const TEXT_PRIMARY = '#dde8f8';
const TEXT_MUTED = 'rgba(180,200,230,0.65)';
const TEXT_LABEL = 'rgba(160,200,255,0.55)';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/**
 * Build a custom_<start>_<end> date-range string for the QB hook
 * given the report's period selection.
 */
export function periodToCustomDateRange(period: 'monthly' | 'quarterly', quarter: string, month: string): string | null {
  const pad = (n: number) => String(n).padStart(2, '0');
  if (period === 'monthly') {
    if (!month) return null;
    const [name, yearStr] = month.split(' ');
    const m = MONTH_NAMES.indexOf(name);
    const year = Number(yearStr);
    if (m < 0 || !Number.isFinite(year)) return null;
    const start = `${year}-${pad(m + 1)}-01`;
    const lastDay = new Date(year, m + 1, 0).getDate();
    const end = `${year}-${pad(m + 1)}-${pad(lastDay)}`;
    return `custom_${start}_${end}`;
  }
  // quarterly: "Q1 2026"
  const [q, yearStr] = quarter.split(' ');
  const year = Number(yearStr);
  if (!q || !Number.isFinite(year)) return null;
  const qIdx = ['Q1','Q2','Q3','Q4'].indexOf(q);
  if (qIdx < 0) return null;
  const startMonth = qIdx * 3 + 1;
  const endMonth = startMonth + 2;
  const start = `${year}-${pad(startMonth)}-01`;
  const lastDay = new Date(year, endMonth, 0).getDate();
  const end = `${year}-${pad(endMonth)}-${pad(lastDay)}`;
  return `custom_${start}_${end}`;
}

export interface QbActuals {
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  syncedAt: Date | null;
  periodLabel: string;
}

/** Aggregate QB P&L across all entities for the report period. */
export function useQbActualsForPeriod(period: 'monthly' | 'quarterly', quarter: string, month: string) {
  const dateRange = useMemo(() => periodToCustomDateRange(period, quarter, month), [period, quarter, month]);
  const { data: plReports, isLoading, dataUpdatedAt, syncForDateRange, isSyncing, refetch } =
    useQBProfitAndLoss('all', dateRange || undefined);

  const actuals = useMemo<QbActuals | null>(() => {
    if (!plReports || plReports.length === 0) return null;
    const totalIncome = plReports.reduce((s, r) => s + (r.totalIncome || 0), 0);
    const totalExpenses = plReports.reduce((s, r) => s + (r.totalExpenses || 0), 0);
    const netIncome = plReports.reduce((s, r) => s + (r.netIncome || 0), 0);
    // synced_at not on parsed type; use react-query dataUpdatedAt as proxy + fallback
    return {
      totalIncome,
      totalExpenses,
      netIncome,
      syncedAt: dataUpdatedAt ? new Date(dataUpdatedAt) : null,
      periodLabel: period === 'monthly' ? month : quarter,
    };
  }, [plReports, dataUpdatedAt, period, month, quarter]);

  return { actuals, isLoading, isSyncing, syncNow: syncForDateRange, refetch, hasRange: !!dateRange };
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.trunc(n));
}
function fmtRelativeTime(d: Date | null): string {
  if (!d) return 'never';
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export type ActualsViewMode = 'actuals' | 'plan_vs_actuals' | 'forecast';

interface PanelProps {
  period: 'monthly' | 'quarterly';
  quarter: string;
  month: string;
  /** plan revenue from KPIs (target string) */
  planRevenue?: number;
  viewMode: ActualsViewMode;
  onChangeViewMode: (m: ActualsViewMode) => void;
}

export function QuickBooksActualsPanel({ period, quarter, month, planRevenue, viewMode, onChangeViewMode }: PanelProps) {
  const { actuals, isLoading, isSyncing, syncNow, refetch, hasRange } = useQbActualsForPeriod(period, quarter, month);

  const staleHours = actuals?.syncedAt ? (Date.now() - actuals.syncedAt.getTime()) / 3600000 : Infinity;
  const isStale = staleHours > 48;

  const planRev = Number(planRevenue) || 0;
  const variance = actuals ? actuals.totalIncome - planRev : 0;
  const variancePct = planRev > 0 && actuals ? (variance / planRev) * 100 : 0;

  const onSync = async () => {
    try {
      if (!hasRange) {
        toast.error('Invalid period');
        return;
      }
      await syncNow();
      await refetch();
      toast.success('QuickBooks actuals refreshed');
    } catch (e: any) {
      toast.error(`Sync failed: ${e?.message || 'unknown error'}`);
    }
  };

  const card: React.CSSProperties = {
    borderRadius: 8,
    background: 'rgba(16,28,52,0.55)',
    border: '1px solid rgba(80,140,255,0.18)',
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginBottom: 12,
  };

  const pill = (bg: string, color: string, border: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase',
    padding: '4px 8px', borderRadius: 9999, background: bg, color, border,
  });

  const segBtn = (active: boolean): React.CSSProperties => ({
    padding: '5px 10px', fontSize: 11, fontWeight: 600,
    background: active ? 'rgba(40,110,180,0.55)' : 'transparent',
    color: active ? '#e8f4ff' : TEXT_MUTED,
    border: 'none', cursor: 'pointer',
  });

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: TEXT_LABEL }}>
            QuickBooks Actuals — {actuals?.periodLabel || (period === 'monthly' ? month : quarter)}
          </span>
          {isStale ? (
            <span style={pill('rgba(220,170,40,0.13)', '#f0c84a', '1px solid rgba(220,170,40,0.25)')} title="QuickBooks data is older than 48 hours.">
              <AlertTriangle size={10} /> May not match QuickBooks
            </span>
          ) : actuals ? (
            <span style={pill('rgba(40,190,120,0.15)', '#4de8a0', '1px solid rgba(40,190,120,0.28)')}>
              <CheckCircle2 size={10} /> In sync
            </span>
          ) : null}
          <span style={{ fontSize: 11, color: TEXT_MUTED }}>
            Last synced: {fmtRelativeTime(actuals?.syncedAt || null)}
            {actuals?.syncedAt ? ` (${actuals.syncedAt.toLocaleString()})` : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'inline-flex', borderRadius: 8, border: '1px solid rgba(120,170,255,0.18)', overflow: 'hidden' }}>
            <button style={segBtn(viewMode === 'actuals')} onClick={() => onChangeViewMode('actuals')}>Actuals only</button>
            <button style={segBtn(viewMode === 'plan_vs_actuals')} onClick={() => onChangeViewMode('plan_vs_actuals')}>Plan vs. Actuals</button>
            <button style={segBtn(viewMode === 'forecast')} onClick={() => onChangeViewMode('forecast')}>Forecast</button>
          </div>
          <button
            onClick={onSync}
            disabled={isSyncing}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px',
              borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: isSyncing ? 'wait' : 'pointer',
              background: 'rgba(40,90,150,0.35)', border: '1px solid rgba(80,150,220,0.25)', color: '#cfe6ff',
            }}
            title="Force-refresh actuals from QuickBooks"
          >
            {isSyncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Sync from QuickBooks
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <Stat label="Revenue (Actual)" value={isLoading ? '—' : actuals ? fmtCurrency(actuals.totalIncome) : '—'} />
        <Stat label="Expenses (Actual)" value={isLoading ? '—' : actuals ? fmtCurrency(actuals.totalExpenses) : '—'} />
        <Stat label="Net Income (Actual)" value={isLoading ? '—' : actuals ? fmtCurrency(actuals.netIncome) : '—'} />
        {viewMode === 'plan_vs_actuals' && (
          <Stat
            label="Revenue vs Plan"
            value={actuals && planRev > 0 ? `${variance >= 0 ? '+' : ''}${fmtCurrency(variance)} (${variancePct.toFixed(1)}%)` : '—'}
            tone={variance >= 0 ? 'pos' : 'neg'}
          />
        )}
      </div>

      {!actuals && !isLoading && (
        <div style={{ fontSize: 11, color: TEXT_MUTED }}>
          No QuickBooks data found for this period yet. Click <strong>Sync from QuickBooks</strong> to fetch it.
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  const color = tone === 'pos' ? '#4de8a0' : tone === 'neg' ? '#f08585' : TEXT_PRIMARY;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8 }}>
      <span style={{ fontSize: 9, color: TEXT_LABEL, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}