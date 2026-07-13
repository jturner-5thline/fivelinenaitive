import React, { useEffect, useMemo, useRef, useState } from 'react';
import ChartJS from 'chart.js/auto';
import {
  endOfDay,
  endOfMonth,
  endOfQuarter,
  format,
  isWithinInterval,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  subMonths,
  subQuarters,
} from 'date-fns';
import { RefreshCw, Loader2, Save, X } from 'lucide-react';
import WhatWorkingSections from './WhatWorkingSections';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useQuickBooksMetrics } from '@/hooks/useQuickBooksMetrics';
import { computeClosingFee } from '@/lib/fees';
import { useMetricsData } from '@/hooks/useMetricsData';
import { useInsightsTimeframe, useInsightsTimeframeOptional } from '@/contexts/InsightsTimeframeContext';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { isExcludedDealName } from '@/utils/excludedDeals';
import { DraggableGridLayout } from '@/components/metrics/DraggableGridLayout';
import { useGridLayout, type GridLayoutItem } from '@/hooks/useGridLayout';
import { QuarterlyRevenueGrowthCard } from '@/components/insights/QuarterlyRevenueGrowthCard';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { InsightsDrilldownDrawer, type DrilldownColumn, type DrilldownContext, type DrilldownTrend } from '@/components/metrics/insights/InsightsDrilldownDrawer';
import { TtmRevenueDrilldownBody } from '@/components/metrics/dashboards/qir/TtmRevenueDrilldownBody';
import { StatDrilldownBody } from '@/components/metrics/dashboards/qir/StatDrilldownBody';
import { useTwelveWeekCashflowForecast } from '@/hooks/useTwelveWeekCashflowForecast';
import { supabase } from '@/integrations/supabase/client';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { NaitiveDealOverlay } from '@/components/naitive-pipeline/NaitiveDealOverlay';
import type { Deal } from '@/types/deal';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid, LabelList } from 'recharts';
import { BarChart, Bar, ReferenceLine, ComposedChart } from 'recharts';
import { useCompany } from '@/hooks/useCompany';
import { useAuth } from '@/contexts/AuthContext';
import { ensureFinServPnlSnapshots } from '@/hooks/useFinServFinancialMetrics';
import { buildBuckets, type Granularity } from '@/lib/insightsTimeRange';
import { QBO_ENTITIES } from '@/config/qboEntities';
import { formatUSD } from '@/lib/formatters/currency';
import { DashboardPlansGear } from './plans/DashboardPlansGear';

const setChartDefaults = () => {
  ChartJS.defaults.color = 'rgba(255,255,255,0.5)';
  ChartJS.defaults.borderColor = 'rgba(255,255,255,0.08)';
  ChartJS.defaults.font.size = 9;
  ChartJS.defaults.font.family = 'system-ui, sans-serif';
};

const gx: any = { ticks: { color: 'rgba(255,255,255,0.45)', font: { size: 9 } }, grid: { display: false }, border: { display: false } };
const gy: any = { ticks: { color: 'rgba(255,255,255,0.35)', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.08)' }, border: { display: false } };
const def: any = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } };
const NA_COLOR = 'rgba(255,255,255,0.35)';

// ============================================================================
// Liabilities & Debt Service table — pulls live account balances from QBO
// (5th Line Capital Advisors LLC realm) for the accounts we can wire today.
// Rows without a mapped QBO account render em-dashes until sourced.
// ============================================================================
const LIAB_REALM_ADVISORS = '193514877331929'; // 5th Line Capital Advisors LLC
const LIAB_REALM_CAPITAL = '123146077561874'; // 5th Line Capital, LLC

interface LiabRow {
  name: string;
  // Direct QBO account lookup: match by exact `name` in the given realm.
  qbo?: { realmId: string; accountName: string };
  // Aggregate lookup: sum current_balance across all accounts in a realm
  // whose account_type matches (used for the "Total for Credit Cards"
  // balance sheet subtotal, which QBO derives from all Credit Card accounts).
  qboAggregate?: { realmId: string; accountType: string };
}

const LIAB_ROWS: LiabRow[] = [
  { name: 'SBA Loan', qbo: { realmId: LIAB_REALM_CAPITAL, accountName: 'SBA Loan 2 (IC)' } },
  { name: 'Headway LOC', qbo: { realmId: LIAB_REALM_ADVISORS, accountName: 'Headway Capital Loan' } },
  { name: 'AMEX LOC', qbo: { realmId: LIAB_REALM_CAPITAL, accountName: 'Amex Credit Line' } },
  { name: 'M&T LOC', qbo: { realmId: LIAB_REALM_CAPITAL, accountName: 'M&T Line of Credit (96001)' } },
  { name: 'Other Loans', qbo: { realmId: LIAB_REALM_CAPITAL, accountName: 'WAA Loan' } },
  { name: "CC's (Est.)", qboAggregate: { realmId: LIAB_REALM_CAPITAL, accountType: 'Credit Card' } },
];

function formatLiabCurrency(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(Number(val))) return '—';
  const num = Math.abs(Number(val));
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}MM`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
  return `$${num.toFixed(0)}`;
}

// Full-precision variant used only for hover tooltips, so operators can
// verify the exact underlying dollar amount without cluttering the table.
function formatLiabCurrencyFull(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(Number(val))) return '—';
  const num = Math.abs(Number(val));
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Walk a QBO balance sheet report tree and return the numeric value found
 * for the first row matching `predicate`. Returns null if not found.
 *
 * QBO report_data shape:
 *   { Rows: { Row: [ { type: "Data", ColData: [{id,value:name},{value:"123.45"}] }
 *                  | { type: "Section", group, Header, Summary, Rows: {...} } ] } }
 */
function walkBalanceSheetRows(
  node: any,
  predicate: (row: any) => number | null,
): number | null {
  if (!node || typeof node !== 'object') return null;
  const direct = predicate(node);
  if (direct !== null) return direct;
  const rows = node?.Rows?.Row;
  if (Array.isArray(rows)) {
    for (const child of rows) {
      const val = walkBalanceSheetRows(child, predicate);
      if (val !== null) return val;
    }
  }
  return null;
}

function extractDataRowValue(report: any, accountName: string): number | null {
  return walkBalanceSheetRows(report, (row) => {
    if (row?.type !== 'Data') return null;
    const cols = row?.ColData;
    if (!Array.isArray(cols) || cols.length < 2) return null;
    if (cols[0]?.value !== accountName) return null;
    const raw = cols[1]?.value;
    if (raw === undefined || raw === null || raw === '') return null;
    const num = Number(raw);
    return isNaN(num) ? null : num;
  });
}

function extractSectionTotal(report: any, group: string): number | null {
  return walkBalanceSheetRows(report, (row) => {
    if (row?.type !== 'Section' || row?.group !== group) return null;
    const raw = row?.Summary?.ColData?.[1]?.value;
    if (raw === undefined || raw === null || raw === '') return null;
    const num = Number(raw);
    return isNaN(num) ? null : num;
  });
}

function extractRowValue(report: any, row: LiabRow): number | null {
  if (row.qbo) return extractDataRowValue(report, row.qbo.accountName);
  if (row.qboAggregate) return extractSectionTotal(report, 'CreditCards');
  return null;
}

function priorEndFromTimeframeStart(startISO: string): string {
  const d = new Date(startISO + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Historical balance table for a single liability account. Shown inside the
 * drilldown drawer when the user clicks a row in the Liabilities widget.
 * Renders trailing 12 month-end balances (from stored QBO balance-sheet
 * snapshots) plus period-over-period $ and % change.
 */
function LiabilityHistoryDrilldownBody({ row }: { row: LiabRow }) {
  const realmId = row.qbo?.realmId ?? row.qboAggregate?.realmId ?? null;

  const { data: history = [], isLoading } = useQuery({
    queryKey: ['liability-history', row.name, realmId],
    queryFn: async () => {
      if (!realmId) return [] as { label: string; asOf: string; value: number | null }[];
      // Build 12 trailing month-end anchors, ending with today's month.
      // Always show the last 12 months regardless of the currently selected
      // Insights timeframe (drilldown is intentionally longer-horizon).
      const now = new Date();
      const anchors: { label: string; date: Date }[] = [];
      for (let i = 11; i >= 0; i--) {
        // Last day of the month (now.month - i)
        const d = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
        anchors.push({
          label: d.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
          date: d,
        });
      }
      const pad = (n: number) => String(n).padStart(2, '0');
      const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      // Ask QuickBooks for a true "as-of" BalanceSheet for each month-end
      // anchor. Stored `quickbooks_reports` snapshots are only captured when
      // a sync happens to run, so they drift from the real month-end balance
      // (e.g. the May 26 sync misses the actual May 31 and June 30 numbers).
      // Fetching fresh reports per anchor gives per-account balances that
      // exactly match what a user would see running the report in QBO today.
      const asOfDates = anchors.map((a) => iso(a.date));
      const { data: fnData, error: fnError } = await supabase.functions.invoke(
        'quickbooks-balance-history',
        { body: { realmId, asOfDates, accounting_method: 'Accrual' } },
      );
      if (fnError) throw fnError;
      const results: Array<{ asOf: string; report: any | null }> = fnData?.results ?? [];
      const byDate = new Map(results.map((r) => [r.asOf, r.report] as const));
      return anchors.map((a) => {
        const anchorISO = iso(a.date);
        const report = byDate.get(anchorISO) ?? null;
        const value = report ? extractRowValue(report, row) : null;
        return { label: a.label, asOf: anchorISO, value };
      });
    },
    enabled: !!realmId,
    staleTime: 5 * 60_000,
  });

  const signPrefix = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');
  const deltaColor = (delta: number | null) => {
    if (delta === null || delta === 0) return 'rgba(255,255,255,0.55)';
    return delta > 0 ? '#ff6b7a' : '#3de89a';
  };

  return (
    <div style={{ padding: '4px 4px 12px' }}>
      <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginBottom: 8 }}>
        Trailing 12 month-end balances sourced from QuickBooks balance-sheet snapshots.
        Each period's $ and % change is computed vs the immediately prior month-end.
      </div>
      {isLoading ? (
        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, padding: '12px 4px' }}>Loading history…</div>
      ) : (
        <>
          <div style={{ height: 200, marginBottom: 16 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={history.map(h => ({ label: h.label, value: h.value !== null ? Math.abs(h.value) : null }))}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => {
                    const abs = Math.abs(v);
                    if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
                    if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`;
                    return `$${abs}`;
                  }}
                  width={55}
                />
                <RTooltip
                  contentStyle={{ background: 'rgba(20,22,32,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, fontSize: 12 }}
                  labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
                  formatter={(v: number) => [formatLiabCurrency(v), 'Balance']}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(213,90%,70%)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: 'hsl(213,90%,70%)' }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.5px' }}>
              <th style={{ padding: '6px 8px', textAlign: 'left' }}>Period</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Balance</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>$ Change</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>% Change</th>
            </tr>
          </thead>
          <tbody>
            {history.slice().reverse().map((h, i, arr) => {
              // arr is reversed (newest first); prior period is the NEXT
              // item in this reversed list.
              const prev = i < arr.length - 1 ? arr[i + 1].value : null;
              const delta = h.value !== null && prev !== null ? h.value - prev : null;
              // % change is only meaningful when the prior base is a
              // positive number. If the prior period was zero or negative
              // (credit balance / net-owed), a raw % is misleading (a
              // -294% figure came from dividing by a small negative base),
              // so we surface "n/m" and show the absolute $ change only.
              const pct = delta !== null && prev !== null && prev > 0
                ? (delta / prev) * 100
                : null;
              const pctUnavailable = delta !== null && (prev === null || prev <= 0);
              const dc = deltaColor(delta);
              return (
                <tr key={h.label} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <td style={{ padding: '6px 8px', color: 'hsl(0,0%,100%)' }}>{h.label}</td>
                  <td
                    style={{ padding: '6px 8px', textAlign: 'right', color: 'hsl(0,0%,100%)' }}
                    title={h.value !== null ? formatLiabCurrencyFull(h.value) : undefined}
                  >
                    {h.value !== null ? formatLiabCurrency(h.value) : '—'}
                  </td>
                  <td
                    style={{ padding: '6px 8px', textAlign: 'right', color: dc, fontWeight: 600 }}
                    title={delta !== null ? `${signPrefix(delta)}${formatLiabCurrencyFull(delta)}` : undefined}
                  >
                    {delta !== null ? `${signPrefix(delta)}${formatLiabCurrency(delta)}` : '—'}
                  </td>
                  <td
                    style={{ padding: '6px 8px', textAlign: 'right', color: dc, fontWeight: 600 }}
                    title={pctUnavailable ? 'Prior period base was zero or negative, so % change is not meaningful.' : undefined}
                  >
                    {pct !== null
                      ? `${signPrefix(pct)}${Math.abs(pct).toFixed(1)}%`
                      : pctUnavailable
                        ? 'n/m'
                        : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function LiabilitiesDebtServiceTable({ onOpenDrilldown }: { onOpenDrilldown?: (row: LiabRow) => void }) {
  const tf = useInsightsTimeframeOptional()?.timeframe;
  const currentAsOf = tf?.end ?? new Date().toISOString().slice(0, 10);
  const priorAsOf = tf?.start ? priorEndFromTimeframeStart(tf.start) : null;

  const realmIds = Array.from(new Set(
    LIAB_ROWS.map(r => r.qbo?.realmId ?? r.qboAggregate?.realmId).filter((r): r is string => !!r),
  ));

  const { data: snapshots = {} } = useQuery({
    queryKey: ['liabilities-bs-snapshots', currentAsOf, priorAsOf, realmIds],
    queryFn: async () => {
      // Fetch the latest balance sheet snapshot at-or-before each anchor date,
      // per realm. Returns a nested map: { [realmId]: { current, prior } }.
      const result: Record<string, { current: any; prior: any }> = {};
      for (const realmId of realmIds) {
        const anchors: { key: 'current' | 'prior'; date: string | null }[] = [
          { key: 'current', date: currentAsOf },
          { key: 'prior', date: priorAsOf },
        ];
        result[realmId] = { current: null, prior: null };
        for (const a of anchors) {
          if (!a.date) continue;
          const { data, error } = await supabase
            .from('quickbooks_reports')
            .select('report_data, period_end')
            .eq('report_type', 'balance_sheet')
            .eq('realm_id', realmId)
            .lte('period_end', a.date)
            .order('period_end', { ascending: false })
            .limit(1);
          if (error) throw error;
          if (data && data.length > 0) result[realmId][a.key] = data[0].report_data;
        }
      }
      return result;
    },
    enabled: realmIds.length > 0,
    staleTime: 60_000,
  });

  // Roll-up totals for the header ("Total" pill in the top-left).
  // Liabilities polarity: an INCREASE in total is unfavorable (red).
  const rowValues = LIAB_ROWS.map((row) => {
    const realmId = row.qbo?.realmId ?? row.qboAggregate?.realmId;
    const snap = realmId ? snapshots[realmId] : undefined;
    const current = snap?.current ? extractRowValue(snap.current, row) : null;
    const prior = snap?.prior ? extractRowValue(snap.prior, row) : null;
    return { current, prior };
  });
  const totalCurrent = rowValues.reduce<number | null>(
    (acc, r) => (r.current === null ? acc : (acc ?? 0) + r.current),
    null,
  );
  const totalDelta = rowValues.reduce<number | null>(
    (acc, r) => (r.current === null || r.prior === null ? acc : (acc ?? 0) + (r.current - r.prior)),
    null,
  );
  const totalPriorBase = totalDelta !== null && totalCurrent !== null ? totalCurrent - totalDelta : null;
  const totalPct = totalDelta !== null && totalPriorBase !== null && totalPriorBase > 0
    ? (totalDelta / totalPriorBase) * 100
    : null;
  const totalPctUnavailable = totalDelta !== null && (totalPriorBase === null || totalPriorBase <= 0);
  const totalDeltaColor = totalDelta === null || totalDelta === 0
    ? 'rgba(255,255,255,0.55)'
    : totalDelta > 0
      ? '#ff6b7a'
      : '#3de89a';
  const signPrefix = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');

  return (
    <div className="text-xs">
      <div className="flex items-baseline gap-2 px-2 pb-2">
        <span className="text-[9px] font-bold uppercase tracking-[1px] text-white/55">Total</span>
        <span
          className="text-[15px] font-bold text-white leading-none"
          title={totalCurrent !== null ? formatLiabCurrencyFull(totalCurrent) : undefined}
        >
          {totalCurrent !== null ? formatLiabCurrency(totalCurrent) : '—'}
        </span>
        {totalDelta !== null && (
          <span
            className="text-[11px] font-semibold whitespace-nowrap"
            style={{ color: totalDeltaColor }}
            title={
              totalPctUnavailable
                ? `${signPrefix(totalDelta)}${formatLiabCurrencyFull(Math.abs(totalDelta))} · Prior period base was zero or negative, so % change is not meaningful.`
                : `${signPrefix(totalDelta)}${formatLiabCurrencyFull(Math.abs(totalDelta))}`
            }
          >
            {signPrefix(totalDelta)}{formatLiabCurrency(Math.abs(totalDelta))}
            {totalPct !== null ? (
              <span className="ml-1 opacity-85">({signPrefix(totalPct)}{Math.abs(totalPct).toFixed(1)}%)</span>
            ) : totalPctUnavailable ? (
              <span className="ml-1 opacity-85">(n/m)</span>
            ) : null}
          </span>
        )}
      </div>
      <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-2 px-2 pb-2 border-b border-white/10 text-[10px] uppercase tracking-wide text-muted-foreground">
        <div>Account</div>
        <div className="text-right">Current Balance</div>
        <div className="text-right">$ Change</div>
        <div className="text-right">% Change</div>
      </div>
      {LIAB_ROWS.map((row) => {
        const realmId = row.qbo?.realmId ?? row.qboAggregate?.realmId;
        const snap = realmId ? snapshots[realmId] : undefined;
        const current = snap?.current ? extractRowValue(snap.current, row) : null;
        const prior = snap?.prior ? extractRowValue(snap.prior, row) : null;
        const delta = current !== null && prior !== null ? current - prior : null;
        const pct = delta !== null && prior !== null && prior > 0
          ? (delta / prior) * 100
          : null;
        const pctUnavailable = delta !== null && (prior === null || prior <= 0);
        // For liabilities, an INCREASE (positive delta) is unfavorable → red.
        const deltaColor = delta === null || delta === 0
          ? 'text-muted-foreground'
          : delta > 0
            ? 'text-[#ff6b7a]'
            : 'text-[#3de89a]';
        const clickable = !!onOpenDrilldown && !!realmId;
        return (
          <button
            type="button"
            key={row.name}
            onClick={clickable ? () => onOpenDrilldown!(row) : undefined}
            disabled={!clickable}
            className={`w-full text-left grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-2 px-2 py-1.5 border-b border-white/5 last:border-0 ${clickable ? 'hover:bg-white/5 cursor-pointer' : 'cursor-default'} transition-colors`}
          >
            <div className="text-foreground/90 truncate flex items-center gap-1.5">
              {DEBT_RATING_BY_ACCOUNT[row.name] && (
                <span
                  className="text-[11px] font-bold"
                  style={{ color: DEBT_RATING_COLORS[DEBT_RATING_BY_ACCOUNT[row.name]] }}
                >
                  {DEBT_RATING_BY_ACCOUNT[row.name]}
                </span>
              )}
              <span className="truncate">{row.name}</span>
            </div>
            <div
              className="text-right text-foreground/90"
              title={current !== null ? formatLiabCurrencyFull(current) : undefined}
            >
              {current !== null ? formatLiabCurrency(current) : '—'}
            </div>
            <div
              className={`text-right ${deltaColor}`}
              title={delta !== null ? `${signPrefix(delta)}${formatLiabCurrencyFull(delta)}` : undefined}
            >
              {delta !== null
                ? `${signPrefix(delta)}${formatLiabCurrency(delta)}`
                : '—'}
            </div>
            <div
              className={`text-right ${deltaColor}`}
              title={pctUnavailable ? 'Prior period base was zero or negative, so % change is not meaningful.' : undefined}
            >
              {pct !== null
                ? `${signPrefix(pct)}${Math.abs(pct).toFixed(1)}%`
                : pctUnavailable
                  ? 'n/m'
                  : '—'}
            </div>
          </button>
        );
      })}
    </div>
  );
}

const renderDelta = (
  current: number | null,
  prior: number | null,
  label: string,
  opts: { polarity?: 'higher-is-better' | 'lower-is-better' } = {},
) => {
  if (current === null || prior === null) {
    return <span style={{ color: 'rgba(255,255,255,0.45)' }}>No prior {label} comparison</span>;
  }
  const delta = current - prior;
  // Only compute % when the prior base is strictly positive. A zero or
  // negative base produces misleading percentages (e.g. -294% on a small
  // negative prior), so we flag those as "n/m" with a tooltip.
  const pct = prior > 0 ? (delta / prior) * 100 : null;
  const pctUnavailable = prior <= 0;
  const polarity = opts.polarity ?? 'higher-is-better';
  const favorable = polarity === 'higher-is-better' ? delta >= 0 : delta <= 0;
  const color = delta === 0 ? 'rgba(255,255,255,0.55)' : favorable ? '#3de89a' : '#ff6b7a';
  const arrow = delta >= 0 ? '▲' : '▼';
  const sign = delta >= 0 ? '+' : '−';
  const absDelta = Math.abs(delta);
  const dollar = `${sign}${fmtUSD(absDelta)}`;
  const pctStr = pct === null ? (pctUnavailable ? 'n/m' : '—') : `${sign}${Math.abs(pct).toFixed(1)}%`;
  const tooltip = pctUnavailable
    ? `Prior ${label} base was zero or negative, so % change is not meaningful.`
    : undefined;
  return (
    <span style={{ color, fontWeight: 600 }} title={tooltip}>
      {arrow} {dollar} <span style={{ opacity: 0.85, fontWeight: 500 }}>({pctStr}) vs prior {label}</span>
    </span>
  );
};

type DateRange = { start: Date; end: Date };
type MonthBucket = { key: string; label: string; start: Date; end: Date };

// ============================================================================
// Debt by Rating (A/B/C) — stacked bar chart of debt account balances at
// each period end, aggregated by the internal credit rating we assign per
// account. Ratings are sourced from the Liabilities & Debt Service widget
// account list above. Fetches historical balances via the
// `quickbooks-balance-history` edge function, one call per realm.
// ============================================================================
type DebtRating = 'A' | 'B' | 'C';
const DEBT_RATING_BY_ACCOUNT: Record<string, DebtRating> = {
  'SBA Loan': 'A',
  'M&T LOC': 'A',
  'AMEX LOC': 'B',
  'Other Loans': 'B',
  'Headway LOC': 'C',
  "CC's (Est.)": 'C',
};
const DEBT_RATING_COLORS: Record<DebtRating, string> = {
  A: '#3de89a', // green
  B: '#f5c542', // yellow
  C: '#ff6b7a', // red
};

function DebtByRatingWidget() {
  return <DebtByRatingWidgetInner />;
}

function TtmDscrChart() {
  return <TtmDscrChartInner />;
}

function MonthlyDebtPaymentsChart() {
  const { reportingPeriod, timeframe } = useInsightsTimeframe();
  const view: 'month' | 'quarter' =
    reportingPeriod?.view === 'quarter' ? 'quarter' : 'month';
  const anchorEnd = reportingPeriod?.end ?? timeframe.end;

  const data = useMemo(() => {
    if (!anchorEnd) return [] as { label: string; value: number }[];
    const end = new Date(anchorEnd + 'T00:00:00');
    if (view === 'quarter') {
      const qEnd = endOfQuarter(end);
      return Array.from({ length: 6 }, (_, i) => {
        const d = endOfQuarter(subQuarters(qEnd, 5 - i));
        const q = Math.floor(d.getMonth() / 3) + 1;
        return { label: `Q${q} ${String(d.getFullYear()).slice(2)}`, value: 0 };
      });
    }
    const mEnd = endOfMonth(end);
    return Array.from({ length: 12 }, (_, i) => {
      const d = endOfMonth(subMonths(mEnd, 11 - i));
      return {
        label: d.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
        value: 0,
      };
    });
  }, [anchorEnd, view]);

  return (
    <div className="pt-1">
      <div className="mb-2 flex items-center justify-between">
        <span
          className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground cursor-help"
          title="Total monthly debt service payments (principal + interest)"
        >
          Monthly Debt Payments
        </span>
        <span className="text-[10px] text-muted-foreground">
          {view === 'quarter' ? 'Quarterly' : 'Monthly'}
        </span>
      </div>
      <div className="relative h-[160px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={45}
              tickFormatter={(v: number) => {
                const abs = Math.abs(v);
                if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
                if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`;
                return `$${abs}`;
              }}
            />
            <Bar dataKey="value" fill="hsl(213,90%,70%)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-md bg-black/40 px-2 py-1 text-[11px] font-medium text-muted-foreground">
            Coming soon
          </span>
        </div>
      </div>
    </div>
  );
}

function TtmDscrChartInner() {
  const { reportingPeriod, timeframe } = useInsightsTimeframe();
  const view: 'month' | 'quarter' =
    reportingPeriod?.view === 'quarter' ? 'quarter' : 'month';
  const anchorEnd = reportingPeriod?.end ?? timeframe.end;

  const data = useMemo(() => {
    if (!anchorEnd) return [] as { label: string; value: null }[];
    const end = new Date(anchorEnd + 'T00:00:00');
    if (view === 'quarter') {
      const qEnd = endOfQuarter(end);
      return Array.from({ length: 6 }, (_, i) => {
        const d = endOfQuarter(subQuarters(qEnd, 5 - i));
        const q = Math.floor(d.getMonth() / 3) + 1;
        return { label: `Q${q} ${String(d.getFullYear()).slice(2)}`, value: null };
      });
    }
    const mEnd = endOfMonth(end);
    return Array.from({ length: 12 }, (_, i) => {
      const d = endOfMonth(subMonths(mEnd, 11 - i));
      return {
        label: d.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
        value: null,
      };
    });
  }, [anchorEnd, view]);

  return (
    <div className="pt-1">
      <div className="mb-2 flex items-center justify-between">
        <span
          className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground cursor-help"
          title="TTM Debt Service Coverage Ratio"
        >
          TTM DSCR
        </span>
        <span className="text-[10px] text-muted-foreground">
          {view === 'quarter' ? 'Quarterly' : 'Monthly'}
        </span>
      </div>
      <div className="relative h-[160px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={35}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="hsl(213,90%,70%)"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={{ r: 3, fill: 'hsl(213,90%,70%)' }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-md bg-black/40 px-2 py-1 text-[11px] font-medium text-muted-foreground">
            Coming soon
          </span>
        </div>
      </div>
    </div>
  );
}

function DebtByRatingWidgetInner() {
  const { reportingPeriod, timeframe } = useInsightsTimeframe();
  const view: 'month' | 'quarter' =
    reportingPeriod?.view === 'quarter' ? 'quarter' : 'month';
  const anchorEnd = reportingPeriod?.end ?? timeframe.end;

  const anchors = useMemo(() => {
    if (!anchorEnd) return [] as { label: string; asOf: string }[];
    const pad = (n: number) => String(n).padStart(2, '0');
    const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const end = new Date(anchorEnd + 'T00:00:00');
    const out: { label: string; asOf: string }[] = [];
    if (view === 'quarter') {
      const qEnd = endOfQuarter(end);
      for (let i = 5; i >= 0; i--) {
        const d = endOfQuarter(subQuarters(qEnd, i));
        const q = Math.floor(d.getMonth() / 3) + 1;
        out.push({ label: `Q${q} ${String(d.getFullYear()).slice(2)}`, asOf: iso(d) });
      }
    } else {
      const mEnd = endOfMonth(end);
      for (let i = 11; i >= 0; i--) {
        const d = endOfMonth(subMonths(mEnd, i));
        out.push({
          label: d.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
          asOf: iso(d),
        });
      }
    }
    return out;
  }, [anchorEnd, view]);

  // Ratings apply to a stable subset of LIAB_ROWS (excludes CC's aggregate).
  const ratedRows = useMemo(
    () => LIAB_ROWS.filter((r) => DEBT_RATING_BY_ACCOUNT[r.name]),
    [],
  );
  const realmIds = useMemo(
    () => Array.from(new Set(
      ratedRows
        .map((r) => r.qbo?.realmId ?? r.qboAggregate?.realmId)
        .filter((id): id is string => !!id),
    )),
    [ratedRows],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['debt-by-rating', view, anchors.map((a) => a.asOf).join(','), realmIds.join(',')],
    enabled: anchors.length > 0 && realmIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const asOfDates = anchors.map((a) => a.asOf);
      // Fetch balance-sheet reports per realm for every anchor date.
      const byRealm = new Map<string, Map<string, any>>();
      await Promise.all(
        realmIds.map(async (realmId) => {
          const { data: fnData, error } = await supabase.functions.invoke(
            'quickbooks-balance-history',
            { body: { realmId, asOfDates, accounting_method: 'Accrual' } },
          );
          if (error) throw error;
          const results: Array<{ asOf: string; report: any | null }> = fnData?.results ?? [];
          byRealm.set(realmId, new Map(results.map((r) => [r.asOf, r.report])));
        }),
      );

      return anchors.map((a) => {
        const totals: Record<DebtRating, number> = { A: 0, B: 0, C: 0 };
        for (const row of ratedRows) {
          const realmId = row.qbo?.realmId ?? row.qboAggregate?.realmId;
          const report = realmId ? byRealm.get(realmId)?.get(a.asOf) ?? null : null;
          const val = report ? extractRowValue(report, row) : null;
          if (val !== null && !isNaN(val)) {
            totals[DEBT_RATING_BY_ACCOUNT[row.name]] += Math.abs(val);
          }
        }
        return { label: a.label, ...totals };
      });
    },
  });

  const chartData = data ?? [];
  const loading = isLoading || isFetching;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          {(['A', 'B', 'C'] as DebtRating[]).map((r) => {
            const latest = chartData[chartData.length - 1];
            const bal = latest ? (latest as any)[r] as number : 0;
            return (
              <div key={r} className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ background: DEBT_RATING_COLORS[r] }}
                />
                <span className="font-medium text-foreground">{r}</span>
                <span>{formatLiabCurrency(bal)}</span>
              </div>
            );
          })}
        </div>
        <span className="text-muted-foreground">
          {view === 'quarter' ? 'Quarterly' : 'Monthly'}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        {loading && chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Loading debt history…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => {
                  const abs = Math.abs(v);
                  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
                  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`;
                  return `$${abs}`;
                }}
                width={55}
              />
              <RTooltip
                contentStyle={{
                  background: 'rgba(20,22,32,0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
                formatter={(v: number, name: string) => [formatLiabCurrency(v), `Rating ${name}`]}
              />
              {/* Stack order: A (bottom, green) → B (yellow) → C (top, red). */}
              <Bar dataKey="A" stackId="debt" fill={DEBT_RATING_COLORS.A} />
              <Bar dataKey="B" stackId="debt" fill={DEBT_RATING_COLORS.B} />
              <Bar dataKey="C" stackId="debt" fill={DEBT_RATING_COLORS.C} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

type RevenueSeriesPoint = {
  key: string;
  month: string;
  revenue: number;
  payments: number;
  expenses: number;
  invoiceCount: number;
};

const fmtUSD = (v: number | null | undefined, opts: { unit?: 'auto' | 'k' | 'M' } = {}) => {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const unit = opts.unit ?? 'auto';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (unit === 'M' || (unit === 'auto' && abs >= 1_000_000)) return `${sign}$${(abs / 1_000_000).toFixed(2)}MM`;
  if (unit === 'k' || (unit === 'auto' && abs >= 1_000)) return `${sign}$${(abs / 1000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
};

const fmtDelta = (curr: number | null, prev: number | null, basis = 'vs prior period'): { label: string; positive: boolean } | null => {
  if (curr === null || prev === null) return null;
  const d = curr - prev;
  return { label: `${d >= 0 ? '+' : '−'} ${fmtUSD(Math.abs(d))} ${basis}`, positive: d >= 0 };
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

const toDateRange = (start: string, end: string): DateRange => ({
  start: startOfDay(parseValueDate(start) ?? new Date()),
  end: endOfDay(parseValueDate(end) ?? new Date()),
});

const isDateInRange = (value: string | null | undefined, range: DateRange) => {
  const d = parseValueDate(value);
  return d ? isWithinInterval(d, range) : false;
};

const sumAmountInRange = <T,>(
  items: T[],
  range: DateRange,
  getDate: (item: T) => string | null | undefined,
  getAmount: (item: T) => number | null | undefined,
) => items.reduce((sum, item) => sum + (isDateInRange(getDate(item), range) ? Number(getAmount(item) ?? 0) : 0), 0);

const countInRange = <T,>(
  items: T[],
  range: DateRange,
  getDate: (item: T) => string | null | undefined,
) => items.reduce((count, item) => count + (isDateInRange(getDate(item), range) ? 1 : 0), 0);

const buildMonthBuckets = (start: Date, end: Date): MonthBucket[] => {
  const buckets: MonthBucket[] = [];
  let cursor = startOfMonth(start);
  const finalMonth = startOfMonth(end);
  while (cursor <= finalMonth) {
    const bucketStart = startOfMonth(cursor);
    const bucketEnd = endOfMonth(cursor);
    buckets.push({
      key: format(bucketStart, 'yyyy-MM'),
      label: format(bucketStart, 'MMM-yy'),
      start: bucketStart,
      end: bucketEnd,
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return buckets;
};

const buildTrailingMonthBuckets = (anchorEnd: Date, count = 12) => {
  const start = startOfMonth(subMonths(anchorEnd, count - 1));
  return buildMonthBuckets(start, anchorEnd).slice(-count);
};

const buildPreviousRange = (range: DateRange, view?: 'month' | 'quarter' | null): DateRange => {
  if (view === 'month') {
    const prevStart = startOfMonth(subMonths(range.start, 1));
    return { start: startOfDay(prevStart), end: endOfDay(endOfMonth(prevStart)) };
  }
  if (view === 'quarter') {
    const prevStart = startOfQuarter(subQuarters(range.start, 1));
    return { start: startOfDay(prevStart), end: endOfDay(endOfQuarter(prevStart)) };
  }
  const duration = range.end.getTime() - range.start.getTime();
  const prevEnd = new Date(range.start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - duration);
  return { start: startOfDay(prevStart), end: endOfDay(prevEnd) };
};

const formatRangeLabel = (range: DateRange) => `${format(range.start, 'yyyy-MM-dd')} → ${format(range.end, 'yyyy-MM-dd')}`;

function Card({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`relative overflow-hidden rounded-[10px] ${className}`}
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', ...style }}>
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg,transparent,hsla(213,90%,70%,0.4),transparent)' }} />
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>{children}</div>;
}

function Sep() {
  return <div style={{ height: 1, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)', margin: '8px 0' }} />;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: 11 }}>
      <span style={{ color: 'rgba(255,255,255,0.55)' }}>{label}</span>
      <span style={{ fontWeight: 500, color: 'hsl(0,0%,100%)' }}>{children}</span>
    </div>
  );
}

function NaPlaceholder({ height = 90, label = 'Data unavailable' }: { height?: number; label?: string }) {
  return (
    <div style={{
      height,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: 6,
      background: 'rgba(255,255,255,0.03)',
      border: '1px dashed rgba(255,255,255,0.10)',
      color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 600, letterSpacing: '0.6px',
      textAlign: 'center',
      padding: '0 12px',
    }}>{label}</div>
  );
}

function CashflowForecastWidget() {
  const { weeks, isLoading } = useTwelveWeekCashflowForecast();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useChart(
    canvasRef,
    weeks.length === 0
      ? null
      : {
          type: 'bar',
          data: {
            labels: weeks.map((w) => format(new Date(w.weekEnding + 'T00:00:00'), 'MMM d')),
            datasets: [
              {
                label: 'Ending Cash',
                data: weeks.map((w) => w.endingCash),
                backgroundColor: weeks.map((w) =>
                  w.endingCash < 0 ? 'hsla(0,75%,60%,0.55)' : 'hsla(213,90%,70%,0.55)',
                ),
                borderColor: weeks.map((w) =>
                  w.endingCash < 0 ? 'hsla(0,75%,60%,0.85)' : 'hsla(213,90%,70%,0.85)',
                ),
                borderWidth: 1,
                borderRadius: 4,
              },
            ],
          },
          options: {
            ...def,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  title: (items: any[]) => {
                    const i = items?.[0]?.dataIndex ?? 0;
                    const w = weeks[i];
                    if (!w) return '';
                    return `Week ending ${format(new Date(w.weekEnding + 'T00:00:00'), 'EEE, MMM d, yyyy')}`;
                  },
                  label: (ctx: any) => `Ending Cash: ${fmtUSD(Number(ctx.parsed?.y ?? 0))}`,
                },
              },
            },
            scales: {
              x: gx,
              y: {
                ...gy,
                ticks: {
                  ...gy.ticks,
                  callback: (v: any) => fmtUSD(Number(v)),
                },
              },
            },
          },
        },
    [weeks],
  );

  if (isLoading) {
    return <NaPlaceholder height={170} label="Loading 12-week forecast…" />;
  }
  if (!weeks || weeks.length === 0) {
    return <NaPlaceholder height={170} label="No forecast data — add scheduled cash flows in Finance > Cash Flow" />;
  }

  return (
    <div className="h-full w-full flex flex-col gap-2">
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <canvas ref={canvasRef} />
      </div>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.4px' }}>
        Source: Finance &gt; Cash Flow — ENDING CASH per week
      </div>
    </div>
  );
}

// ============================================================================
// Consolidated OPEX — sums "Total for Expenses" (operating_expenses) across
// all 4 QBO entities for each bucket in the selected timeframe. Buckets are
// monthly or quarterly based on the Reporting Period toggle.
// ============================================================================
// Shared bar label: absolute value sits above (positive) / below (negative)
// the bar; Δ$ and Δ% are stacked INSIDE the bar (Δ$ on top, Δ% below),
// drawn in white with a dark stroke for guaranteed contrast against any
// bar color. Renders nothing when the bar is too narrow to fit legibly.
function makeBarValueDeltaLabel(
  chartData: Array<{ value: number; deltaAbs: number | null; deltaPct: number | null }>,
  formatValue: (v: number) => string,
  opts?: { invertDeltaColors?: boolean; polarity?: 'higher-is-better' | 'lower-is-better' },
) {
  // Polarity-based semantic coloring. `polarity` is preferred; `invertDeltaColors`
  // is kept for backward compat and maps to lower-is-better.
  const polarity: 'higher-is-better' | 'lower-is-better' =
    opts?.polarity ?? (opts?.invertDeltaColors ? 'lower-is-better' : 'higher-is-better');
  // Softer semantic tokens tuned for the dark analytics surface.
  const goodColor = 'hsl(152, 55%, 60%)';
  const badColor = 'hsl(0, 65%, 65%)';
  const neutralColor = 'hsl(220, 10%, 62%)';
  const colorFor = (delta: number | null | undefined) => {
    if (delta == null || !isFinite(delta) || delta === 0) return neutralColor;
    const favorable = polarity === 'higher-is-better' ? delta > 0 : delta < 0;
    return favorable ? goodColor : badColor;
  };
  return function BarValueDeltaLabel(props: any) {
    const { x, y, width, height, index } = props;
    const w = Number(width) || 0;
    if (w < 22) return null;
    const d = chartData[index];
    if (!d) return null;
    const cx = Number(x) + w / 2;
    const barTop = Number(y);
    const pct = d.deltaPct;
    const abs = d.deltaAbs;
    const pctSign = pct == null || pct === 0 ? '' : pct > 0 ? '+' : '−';
    const absSign = abs == null || abs === 0 ? '' : abs > 0 ? '+' : '−';
    const pctText = pct == null ? '' : `${pctSign}${Math.abs(pct).toFixed(1)}%`;
    const absText = abs == null ? '' : `${absSign}${formatValue(Math.abs(abs))}`;
    // Always render OUTSIDE the plot area, stacked above the bar top:
    // Δ$ (top) → Δ% → value (closest to bar). No dark outline so labels
    // read as supporting metadata rather than embedded chart text.
    const valueY = barTop - 6;
    const pctY = valueY - 11;
    const absY = valueY - 22;
    return (
      <g>
        <text x={cx} y={valueY} textAnchor="middle" fill="rgba(255,255,255,0.92)" fontSize={10} fontWeight={600}>
          {formatValue(d.value)}
        </text>
        {absText && (
          <text x={cx} y={absY} textAnchor="middle" fill={colorFor(abs)} fontSize={10} fontWeight={600}>
            {absText}
          </text>
        )}
        {pctText && (
          <text x={cx} y={pctY} textAnchor="middle" fill={colorFor(pct)} fontSize={9} fontWeight={600}>
            {pctText}
          </text>
        )}
      </g>
    );
  };
}

function ConsolidatedOpexWidget() {
  const { company } = useCompany();
  const { reportingPeriod, timeframe } = useInsightsTimeframe();
  const view: 'month' | 'quarter' = reportingPeriod?.view === 'quarter' ? 'quarter' : 'month';
  const anchorEnd = reportingPeriod?.end ?? timeframe.end;
  const granularity: Granularity = view === 'quarter' ? 'quarterly' : 'monthly';
  const [showDelta, setShowDelta] = useState(false);

  const buckets = useMemo(() => {
    if (!anchorEnd) return [];
    const end = new Date(anchorEnd + 'T00:00:00');
    if (view === 'quarter') {
      const qEndAnchor = endOfQuarter(end);
      const start = startOfQuarter(subQuarters(qEndAnchor, 3));
      return buildBuckets(format(start, 'yyyy-MM-dd'), format(qEndAnchor, 'yyyy-MM-dd'), 'quarterly');
    }
    const mEndAnchor = endOfMonth(end);
    const start = startOfMonth(subMonths(mEndAnchor, 11));
    return buildBuckets(format(start, 'yyyy-MM-dd'), format(mEndAnchor, 'yyyy-MM-dd'), 'monthly');
  }, [anchorEnd, view]);
  const rangeStart = buckets[0]?.start_date ?? '';
  const rangeEnd = buckets[buckets.length - 1]?.end_date ?? '';

  // One extra prior bucket used only to seed the Δ Trend line at index 0
  // so it starts on the first visible bar rather than the second.
  const priorBucket = useMemo(() => {
    if (!anchorEnd) return null;
    const end = new Date(anchorEnd + 'T00:00:00');
    if (view === 'quarter') {
      const qEndAnchor = endOfQuarter(end);
      const priorEnd = endOfQuarter(subQuarters(qEndAnchor, 4));
      const priorStart = startOfQuarter(priorEnd);
      return { start_date: format(priorStart, 'yyyy-MM-dd'), end_date: format(priorEnd, 'yyyy-MM-dd') };
    }
    const mEndAnchor = endOfMonth(end);
    const priorEnd = endOfMonth(subMonths(mEndAnchor, 12));
    const priorStart = startOfMonth(priorEnd);
    return { start_date: format(priorStart, 'yyyy-MM-dd'), end_date: format(priorEnd, 'yyyy-MM-dd') };
  }, [anchorEnd, view]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['consolidated-opex', company?.id, rangeStart, rangeEnd, granularity, priorBucket?.start_date],
    enabled: !!company?.id && buckets.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const periods = [
        ...(priorBucket ? [priorBucket] : []),
        ...buckets.map(b => ({ start_date: b.start_date, end_date: b.end_date })),
      ];
      const perRealm = await Promise.all(
        QBO_ENTITIES.map(async (e) => {
          try {
            return await ensureFinServPnlSnapshots(company!.id, periods, e.realmId);
          } catch (err) {
            console.warn('[opex] snapshot fetch failed', e.label, err);
            return [];
          }
        }),
      );
      const byKey = new Map<string, number>();
      buckets.forEach(b => byKey.set(`${b.start_date}_${b.end_date}`, 0));
      const priorKey = priorBucket ? `${priorBucket.start_date}_${priorBucket.end_date}` : null;
      let priorValue = 0;
      for (const rows of perRealm) {
        for (const r of rows) {
          const k = `${r.period_start}_${r.period_end}`;
          if (byKey.has(k)) byKey.set(k, (byKey.get(k) ?? 0) + Number(r.operating_expenses ?? 0));
          if (priorKey && k === priorKey) priorValue += Number(r.operating_expenses ?? 0);
        }
      }
      const series = buckets.map(b => ({
        label: b.label,
        key: b.key,
        value: byKey.get(`${b.start_date}_${b.end_date}`) ?? 0,
      }));
      const total = series.reduce((s, p) => s + p.value, 0);
      return { series, total, priorValue };
    },
  });

  const series = data?.series ?? [];
  const total = data?.total ?? 0;
  const priorValue = data?.priorValue ?? null;
  const loading = isLoading || isFetching;
  const granularityLabel = view === 'quarter' ? 'Quarterly' : 'Monthly';

  // Period-over-period change trendline data (Δ Trend). Index 0 uses the
  // immediately preceding period as the baseline so the line starts on the
  // first visible bar. $ delta drives the secondary axis; % is in the tooltip.
  const chartData = series.map((p, i) => {
    const prev = i === 0 ? priorValue : series[i - 1].value;
    const deltaAbs = prev == null ? null : p.value - prev;
    const deltaPct = prev == null || prev === 0 ? null : ((p.value - prev) / Math.abs(prev)) * 100;
    return { ...p, deltaAbs, deltaPct };
  });

  return (
    <div className="h-full w-full flex flex-col gap-2">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <PeriodReadout
          label={series[series.length - 1]?.label}
          value={series[series.length - 1]?.value ?? null}
          previous={series.length >= 2 ? series[series.length - 2].value : priorValue}
          polarity="lower-is-better"
          loading={loading && !data}
        />
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {showDelta && series.length >= 2 && (
            <RangeTrendDelta
              fromLabel={series[0]?.label}
              toLabel={series[series.length - 1]?.label}
              fromValue={series[0]?.value}
              toValue={series[series.length - 1]?.value}
              polarity="lower-is-better"
            />
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowDelta(v => !v); }}
            onMouseDown={(e) => e.stopPropagation()}
            title="Toggle period-over-period change line ($ and %)"
            style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase',
              padding: '3px 9px', borderRadius: 999, cursor: 'pointer',
              border: '1px solid ' + (showDelta ? 'hsl(38, 92%, 62%)' : 'rgba(255,255,255,0.12)'),
              color: showDelta ? 'hsl(38, 92%, 62%)' : 'rgba(255,255,255,0.75)',
              background: showDelta ? 'hsla(38, 92%, 62%, 0.12)' : 'rgba(255,255,255,0.05)',
            }}
          >
            Δ Trend
          </button>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
            Total: <span style={{ color: 'hsl(0,0%,100%)', fontWeight: 600 }}>
              {loading && !data ? '…' : formatUSD(total / 1000)}
            </span>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 140 }}>
        {series.length === 0 || (loading && !data) ? (
          <NaPlaceholder height={160} label={loading ? 'Loading…' : 'No OPEX data for the selected period.'} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 44, right: showDelta ? 48 : 8, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis
                yAxisId="left"
                tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={56}
                tickFormatter={(v: number) => formatUSD((v as number) / 1000)}
              />
              {showDelta && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: 'hsl(38, 92%, 62%)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                  tickFormatter={(v: number) => formatUSD((v as number) / 1000)}
                />
              )}
              <RTooltip
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                contentStyle={{ background: 'rgba(20,22,30,0.95)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, fontSize: 11 }}
                labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
                formatter={(v: number, name: string) => {
                  if (name === 'Δ $') return [formatUSD((v as number) / 1000), 'Δ $'];
                  if (name === 'Δ %') return [`${(v as number).toFixed(1)}%`, 'Δ %'];
                  return [formatUSD((v as number) / 1000), 'OPEX'];
                }}
              />
              <Bar
                yAxisId="left"
                dataKey="value"
                name="OPEX"
                fill="hsl(35, 85%, 55%)"
                radius={[4, 4, 0, 0]}
              >
                <LabelList dataKey="value" content={makeBarValueDeltaLabel(chartData, (v) => formatUSD(v / 1000), { polarity: 'lower-is-better' })} />
              </Bar>
              {showDelta && (
                <>
                  <Line yAxisId="right" type="monotone" dataKey="deltaAbs" name="Δ $" stroke="hsl(38, 92%, 62%)" strokeWidth={2} dot={{ r: 3, fill: 'hsl(38, 92%, 62%)' }} connectNulls />
                  <Line yAxisId="right" type="monotone" dataKey="deltaPct" name="Δ %" stroke="transparent" dot={false} activeDot={false} legendType="none" />
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.4px' }}>
        Source: QuickBooks P&L (accrual) — Operating Expenses summed across Debt, FinServ, Tech, and Capital entities
      </div>
    </div>
  );
}

// ============================================================================
// Consolidated CashFlow — Operating Activities line from the QBO Statement of
// Cash Flows summed across all 4 QBO entities, bucketed monthly or quarterly
// based on the Reporting Period toggle. Anchored at the selected period end,
// showing the selected + 3 prior quarters (quarter view) or selected + 11
// prior months (month view).
// ============================================================================
function ConsolidatedCashflowWidget() {
  const { company } = useCompany();
  const { reportingPeriod, timeframe } = useInsightsTimeframe();
  const view: 'month' | 'quarter' = reportingPeriod?.view === 'quarter' ? 'quarter' : 'month';
  const anchorEnd = reportingPeriod?.end ?? timeframe.end;
  const granularity: Granularity = view === 'quarter' ? 'quarterly' : 'monthly';

  const buckets = useMemo(() => {
    if (!anchorEnd) return [];
    const end = new Date(anchorEnd + 'T00:00:00');
    if (view === 'quarter') {
      const qEndAnchor = endOfQuarter(end);
      const start = startOfQuarter(subQuarters(qEndAnchor, 3));
      return buildBuckets(format(start, 'yyyy-MM-dd'), format(qEndAnchor, 'yyyy-MM-dd'), 'quarterly');
    }
    const mEndAnchor = endOfMonth(end);
    const start = startOfMonth(subMonths(mEndAnchor, 11));
    return buildBuckets(format(start, 'yyyy-MM-dd'), format(mEndAnchor, 'yyyy-MM-dd'), 'monthly');
  }, [anchorEnd, view]);

  // Underlying QBO cash flow snapshots are stored at monthly bucket
  // granularity per (realm, period_start, period_end). We request the full
  // span in one call per realm; the sync populates monthly rows within that
  // range which we then aggregate into the widget's buckets.
  // Extend the fetch span one bucket earlier so the Δ Trend line has a
  // baseline for index 0 and starts on the first visible bar.
  const priorBucket = useMemo(() => {
    if (!anchorEnd) return null;
    const end = new Date(anchorEnd + 'T00:00:00');
    if (view === 'quarter') {
      const qEndAnchor = endOfQuarter(end);
      const priorEnd = endOfQuarter(subQuarters(qEndAnchor, 4));
      const priorStart = startOfQuarter(priorEnd);
      return { start_date: format(priorStart, 'yyyy-MM-dd'), end_date: format(priorEnd, 'yyyy-MM-dd') };
    }
    const mEndAnchor = endOfMonth(end);
    const priorEnd = endOfMonth(subMonths(mEndAnchor, 12));
    const priorStart = startOfMonth(priorEnd);
    return { start_date: format(priorStart, 'yyyy-MM-dd'), end_date: format(priorEnd, 'yyyy-MM-dd') };
  }, [anchorEnd, view]);
  const spanStart = (priorBucket?.start_date ?? buckets[0]?.start_date) ?? '';
  const spanEnd = buckets[buckets.length - 1]?.end_date ?? '';

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['consolidated-cashflow-ops', company?.id, spanStart, spanEnd, granularity],
    enabled: !!company?.id && !!spanStart && !!spanEnd,
    staleTime: 60_000,
    queryFn: async () => {
      type CfRow = {
        realm_id: string;
        bucket_start: string;
        bucket_end: string;
        operating_activities: number | null;
        fetched_at: string | null;
      };
      // Snapshots may exist under multiple (period_start, period_end)
      // request bounds. We collapse to one authoritative row per
      // (realm_id, bucket_start) by taking the most-recent fetched_at row
      // that has a non-null operating_activities value.
      const readRows = async (): Promise<Map<string, CfRow>> => {
        const { data: rows, error } = await supabase
          .from('qbo_cashflow_snapshots')
          .select('realm_id, bucket_start, bucket_end, operating_activities, fetched_at')
          .eq('company_id', company!.id)
          .eq('accounting_method', 'Accrual')
          .gte('bucket_start', spanStart)
          .lte('bucket_start', spanEnd)
          .in('realm_id', QBO_ENTITIES.map(e => e.realmId))
          .order('fetched_at', { ascending: false });
        if (error) throw error;
        const best = new Map<string, CfRow>();
        for (const r of (rows ?? []) as CfRow[]) {
          const key = `${r.realm_id}|${r.bucket_start}`;
          const existing = best.get(key);
          // Prefer non-null operating_activities; otherwise keep first (newest).
          if (!existing) {
            best.set(key, r);
          } else if (existing.operating_activities == null && r.operating_activities != null) {
            best.set(key, r);
          }
        }
        return best;
      };

      // Expected (realm × bucket_start) coverage for the target range.
      const monthBuckets = buildBuckets(spanStart, spanEnd, 'monthly');
      const expectedKeys: string[] = [];
      for (const e of QBO_ENTITIES) {
        for (const mb of monthBuckets) expectedKeys.push(`${e.realmId}|${mb.start_date}`);
      }

      let best = await readRows();
      // A realm needs a resync if ANY expected month bucket is missing OR
      // present but with a null operating_activities value.
      const realmsToSync = QBO_ENTITIES.filter(e => {
        for (const mb of monthBuckets) {
          const row = best.get(`${e.realmId}|${mb.start_date}`);
          if (!row || row.operating_activities == null) return true;
        }
        return false;
      });
      if (realmsToSync.length > 0) {
        await Promise.all(realmsToSync.map(async (e) => {
          try {
            await supabase.functions.invoke('quickbooks-sync', {
              body: {
                syncType: 'cash_flow',
                realmId: e.realmId,
                company_id: company!.id,
                accounting_method: 'Accrual',
                start_date: spanStart,
                end_date: spanEnd,
              },
            });
          } catch (err) {
            console.warn('[cashflow] sync failed', e.label, err);
          }
        }));
        best = await readRows();
      }

      const series = buckets.map(b => {
        const bStart = new Date(b.start_date + 'T00:00:00').getTime();
        const bEnd = new Date(b.end_date + 'T00:00:00').getTime();
        let value = 0;
        for (const r of best.values()) {
          const rs = new Date(r.bucket_start + 'T00:00:00').getTime();
          if (rs < bStart || rs > bEnd) continue;
          value += Number(r.operating_activities ?? 0);
        }
        return { label: b.label, key: b.key, value };
      });
      const total = series.reduce((s, p) => s + p.value, 0);
      // Compute the prior-bucket baseline value (used to seed Δ Trend at
      // index 0) from the same aggregated snapshot map.
      let priorValue: number | null = null;
      if (priorBucket) {
        const pStart = new Date(priorBucket.start_date + 'T00:00:00').getTime();
        const pEnd = new Date(priorBucket.end_date + 'T00:00:00').getTime();
        let v = 0;
        for (const r of best.values()) {
          const rs = new Date(r.bucket_start + 'T00:00:00').getTime();
          if (rs < pStart || rs > pEnd) continue;
          v += Number(r.operating_activities ?? 0);
        }
        priorValue = v;
      }
      return { series, total, priorValue };
    },
  });

  const series = data?.series ?? [];
  const total = data?.total ?? 0;
  const priorValue = data?.priorValue ?? null;
  const loading = isLoading || isFetching;
  const granularityLabel = view === 'quarter' ? 'Quarterly' : 'Monthly';

  const fmt = (v: number) => {
    const abs = Math.abs(v);
    const s = formatUSD(abs / 1000);
    return v < 0 ? `(${s})` : s;
  };
  const [showDelta, setShowDelta] = useState(false);
  const chartData = series.map((p, i) => {
    const prev = i === 0 ? priorValue : series[i - 1].value;
    const deltaAbs = prev == null ? null : p.value - prev;
    const deltaPct = prev == null || prev === 0 ? null : ((p.value - prev) / Math.abs(prev)) * 100;
    return { ...p, deltaAbs, deltaPct };
  });

  return (
    <div className="h-full w-full flex flex-col gap-2">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <PeriodReadout
          label={series[series.length - 1]?.label}
          value={series[series.length - 1]?.value ?? null}
          previous={series.length >= 2 ? series[series.length - 2].value : priorValue}
          polarity="higher-is-better"
          loading={loading && !data}
          format={(v) => fmt(v)}
        />
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {showDelta && series.length >= 2 && (
            <RangeTrendDelta
              fromLabel={series[0]?.label}
              toLabel={series[series.length - 1]?.label}
              fromValue={series[0]?.value}
              toValue={series[series.length - 1]?.value}
              polarity="higher-is-better"
              format={(v) => fmt(v)}
            />
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowDelta(v => !v); }}
            onMouseDown={(e) => e.stopPropagation()}
            title="Toggle period-over-period change line ($ and %)"
            style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase',
              padding: '3px 9px', borderRadius: 999, cursor: 'pointer',
              border: '1px solid ' + (showDelta ? 'hsl(38, 92%, 62%)' : 'rgba(255,255,255,0.12)'),
              color: showDelta ? 'hsl(38, 92%, 62%)' : 'rgba(255,255,255,0.75)',
              background: showDelta ? 'hsla(38, 92%, 62%, 0.12)' : 'rgba(255,255,255,0.05)',
            }}
          >
            Δ Trend
          </button>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
            Total: <span style={{ color: 'hsl(0,0%,100%)', fontWeight: 600 }}>
              {loading && !data ? '…' : fmt(total)}
            </span>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 140 }}>
        {series.length === 0 || (loading && !data) ? (
          <NaPlaceholder height={160} label={loading ? 'Loading…' : 'No cash flow data for the selected period.'} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 44, right: showDelta ? 48 : 8, left: 0, bottom: 18 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis
                yAxisId="left"
                tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={64}
                tickFormatter={(v: number) => fmt(v as number)}
              />
              {showDelta && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: 'hsl(38, 92%, 62%)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                  tickFormatter={(v: number) => fmt(v as number)}
                />
              )}
              <ReferenceLine yAxisId="left" y={0} stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
              <RTooltip
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                contentStyle={{ background: 'rgba(20,22,30,0.95)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, fontSize: 11 }}
                labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
                formatter={(v: number, name: string) => {
                  if (name === 'Δ $') return [fmt(v as number), 'Δ $'];
                  if (name === 'Δ %') return [`${(v as number).toFixed(1)}%`, 'Δ %'];
                  return [fmt(v as number), 'Operating CF'];
                }}
              />
              <Bar yAxisId="left" dataKey="value" name="Operating CF" radius={[4, 4, 0, 0]}
                fill="hsl(160, 70%, 55%)"
                shape={(props: any) => {
                  const { x, y, width, height, value } = props;
                  const negative = Number(value) < 0;
                  const color = negative ? 'hsl(0, 75%, 62%)' : 'hsl(160, 70%, 55%)';
                  const h = Math.abs(height);
                  const yy = negative ? y + height : y;
                  return <rect x={x} y={yy} width={width} height={h} fill={color} rx={4} ry={4} />;
                }}
              >
                <LabelList dataKey="value" content={makeBarValueDeltaLabel(chartData, (v) => fmt(v), { polarity: 'higher-is-better' })} />
              </Bar>
              {showDelta && (
                <>
                  <Line yAxisId="right" type="monotone" dataKey="deltaAbs" name="Δ $" stroke="hsl(38, 92%, 62%)" strokeWidth={2} dot={{ r: 3, fill: 'hsl(38, 92%, 62%)' }} connectNulls />
                  <Line yAxisId="right" type="monotone" dataKey="deltaPct" name="Δ %" stroke="transparent" dot={false} activeDot={false} legendType="none" />
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.4px' }}>
        Source: QuickBooks Statement of Cash Flows (accrual) — "Net cash provided by operating activities" summed across Debt, FinServ, Tech, and Capital entities
      </div>
    </div>
  );
}

function GridShell({
  isEditMode,
  title,
  children,
  headerExtra,
  dragHandleMode = 'header',
  titleAlign = 'left',
  titleTooltip,
}: {
  isEditMode: boolean;
  title: string;
  children: React.ReactNode;
  headerExtra?: React.ReactNode;
  dragHandleMode?: 'header' | 'manual';
  titleAlign?: 'left' | 'center';
  titleTooltip?: string;
}) {
  return (
    <div className="h-full w-full flex flex-col rounded-[10px] overflow-hidden relative"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg,transparent,hsla(213,90%,70%,0.4),transparent)' }} />
      <div
        className={`px-3 py-2 flex items-center justify-between ${dragHandleMode === 'header' && isEditMode ? 'widget-drag-handle cursor-grab active:cursor-grabbing' : ''}`}
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '1.2px',
          textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)',
          flex: titleAlign === 'center' ? 1 : undefined,
          textAlign: titleAlign === 'center' ? 'center' : 'left',
          cursor: titleTooltip ? 'help' : undefined,
        }}
        title={titleTooltip}
        >
          {title}
        </div>
        <div className="flex items-center gap-2">
          {headerExtra}
          {dragHandleMode === 'header' && isEditMode && (
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)' }}>⋮⋮ drag</div>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 p-3 overflow-hidden">{children}</div>
    </div>
  );
}

/**
 * Compact period-metric readout shown at the top of trend widgets.
 * Displays: "{period label} {value}  {±delta$} ({±delta%})" — coloring the
 * delta by metric polarity (green = favorable, red = unfavorable, gray = flat/na).
 */
function PeriodReadout({
  label,
  value,
  previous,
  polarity,
  loading,
  format,
}: {
  label?: string | null;
  value: number | null;
  previous: number | null | undefined;
  polarity: 'higher-is-better' | 'lower-is-better';
  loading?: boolean;
  /** Formats a plain dollar amount into the widget's preferred display (e.g. "$185K"). */
  format?: (v: number) => string;
}) {
  const fmt = format ?? ((v: number) => formatUSD(v / 1000));
  const hasValue = value != null && isFinite(value);
  const dAbs = hasValue && previous != null && isFinite(previous) ? (value as number) - previous : null;
  const dPct = dAbs != null && previous != null && previous !== 0 ? (dAbs / Math.abs(previous)) * 100 : null;

  const neutral = 'hsl(220,10%,62%)';
  const good = 'hsl(152,55%,60%)';
  const bad = 'hsl(0,65%,65%)';
  const deltaColor = (() => {
    if (dAbs == null || !isFinite(dAbs) || dAbs === 0) return neutral;
    if (polarity === 'higher-is-better') return dAbs > 0 ? good : bad;
    return dAbs > 0 ? bad : good;
  })();

  const sign = dAbs != null && dAbs > 0 ? '+' : dAbs != null && dAbs < 0 ? '−' : '';
  const dAbsStr = dAbs != null ? `${sign}${fmt(Math.abs(dAbs))}` : null;
  const dPctStr = dPct != null ? `${sign}${Math.abs(dPct).toFixed(1)}%` : null;

  return (
    <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
      {label && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '1px',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.55)',
          }}
        >
          {label}
        </span>
      )}
      <span style={{ fontSize: 15, fontWeight: 700, color: 'hsl(0,0%,100%)', lineHeight: 1 }}>
        {loading ? '…' : hasValue ? fmt(value as number) : '—'}
      </span>
      {dAbsStr && (
        <span style={{ fontSize: 11, fontWeight: 600, color: deltaColor, whiteSpace: 'nowrap' }}>
          {dAbsStr}
          {dPctStr && (
            <span style={{ color: deltaColor, opacity: 0.85, marginLeft: 4 }}>({dPctStr})</span>
          )}
        </span>
      )}
    </div>
  );
}

/**
 * Shown when the Δ Trend toggle is on: the net change from the first
 * visible period to the current (last) period in the chart. Polarity-aware.
 */
function RangeTrendDelta({
  fromLabel,
  toLabel,
  fromValue,
  toValue,
  polarity,
  format,
}: {
  fromLabel?: string | null;
  toLabel?: string | null;
  fromValue: number | null | undefined;
  toValue: number | null | undefined;
  polarity: 'higher-is-better' | 'lower-is-better';
  format?: (v: number) => string;
}) {
  const fmt = format ?? ((v: number) => formatUSD(v / 1000));
  if (fromValue == null || toValue == null || !isFinite(fromValue) || !isFinite(toValue)) return null;
  const dAbs = toValue - fromValue;
  const dPct = fromValue !== 0 ? (dAbs / Math.abs(fromValue)) * 100 : null;
  const neutral = 'hsl(220,10%,62%)';
  const good = 'hsl(152,55%,60%)';
  const bad = 'hsl(0,65%,65%)';
  const color = dAbs === 0
    ? neutral
    : polarity === 'higher-is-better'
      ? (dAbs > 0 ? good : bad)
      : (dAbs > 0 ? bad : good);
  const sign = dAbs > 0 ? '+' : dAbs < 0 ? '−' : '';
  return (
    <span
      title={`Net change from ${fromLabel ?? 'first period'} to ${toLabel ?? 'current period'}`}
      style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', whiteSpace: 'nowrap' }}
    >
      {fromLabel && toLabel ? `${fromLabel} → ${toLabel}: ` : 'Δ: '}
      <span style={{ color, fontWeight: 700 }}>
        {sign}{fmt(Math.abs(dAbs))}
        {dPct != null && (
          <span style={{ marginLeft: 4, opacity: 0.9 }}>({sign}{Math.abs(dPct).toFixed(1)}%)</span>
        )}
      </span>
    </span>
  );
}

function useChart(
  ref: React.RefObject<HTMLCanvasElement | null>,
  config: any,
  deps: any[],
  onPointClick?: (index: number, label: string, value: number) => void,
) {
  // Force the chart-creation effect to re-run whenever the underlying <canvas>
  // element is (re)mounted. Some widgets (e.g. TTM Revenue) conditionally
  // swap between a NaPlaceholder and the canvas while data loads. When the
  // canvas mounts on a later render, `ref.current` is set but the deps array
  // captured earlier may already match its own previous snapshot after the
  // stringified data values stabilise, so the effect silently skips
  // creation. Bumping this counter every time the canvas node changes makes
  // creation deterministic.
  const [canvasMountTick, setCanvasMountTick] = React.useState(0);
  const prevNodeRef = React.useRef<HTMLCanvasElement | null>(null);
  React.useEffect(() => {
    if (ref.current !== prevNodeRef.current) {
      prevNodeRef.current = ref.current;
      if (ref.current) setCanvasMountTick(t => t + 1);
    }
  });
  useEffect(() => {
    if (!ref.current || !config) return;
    setChartDefaults();
    const finalConfig = onPointClick
      ? {
          ...config,
          options: {
            ...(config.options || {}),
            onHover: (evt: any, els: any[]) => {
              const target = evt?.native?.target as HTMLElement | undefined;
              if (target) target.style.cursor = els && els.length ? 'pointer' : 'default';
            },
            onClick: (_evt: any, elements: any[], chart: any) => {
              if (!elements || elements.length === 0) return;
              const el = elements[0];
              const idx = el.index ?? 0;
              const label = String(chart.data.labels?.[idx] ?? '');
              const value = Number(chart.data.datasets?.[el.datasetIndex ?? 0]?.data?.[idx] ?? 0);
              onPointClick(idx, label, value);
            },
          },
        }
      : config;
    const chart = new ChartJS(ref.current, finalConfig);
    // Ensure the chart picks up its actual container dimensions on the frame
    // after creation. Chart.js reads size synchronously during construction,
    // so a parent that just transitioned from placeholder to canvas may
    // still report 0×0 at that instant.
    requestAnimationFrame(() => {
      try { chart.resize(); } catch { /* destroyed */ }
    });
    // Chart.js occasionally initializes with 0x0 dimensions when the parent
    // grid cell hasn't been measured yet (e.g. first paint of a react-grid-
    // layout item, or a carousel slide entering view). In that case the
    // canvas draws nothing until the user pokes the toggle, which triggers a
    // recreate. Observe the container so we force a resize as soon as it
    // actually gets a non-zero size.
    const parent = ref.current.parentElement;
    let ro: ResizeObserver | null = null;
    if (parent && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        try { chart.resize(); } catch { /* chart already destroyed */ }
      });
      ro.observe(parent);
    }
    return () => {
      if (ro) ro.disconnect();
      chart.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, canvasMountTick]);
}

const KPI_SUMMARY_ROWS: { id: string; registryId: string }[] = [
  { id: 'kpi-row-total-revenue-curr', registryId: 'total-revenue-curr' },
  { id: 'kpi-row-operating-profit-curr', registryId: 'operating-profit-curr' },
  { id: 'kpi-row-ttm-revenue', registryId: 'ttm-revenue' },
  { id: 'kpi-row-ytd-revenue', registryId: 'ytd-revenue' },
  { id: 'kpi-row-debt-solutions-revenue', registryId: 'debt-solutions-revenue' },
  { id: 'kpi-row-debt-solutions-profit', registryId: 'debt-solutions-profit' },
  { id: 'kpi-row-finserv-revenue', registryId: 'finserv-revenue' },
  { id: 'kpi-row-finserv-profit', registryId: 'finserv-profit' },
  { id: 'kpi-row-liq-operating', registryId: 'liq-operating' },
  { id: 'kpi-row-liq-mt', registryId: 'liq-mt' },
  { id: 'kpi-row-liq-tax', registryId: 'liq-tax-reserves' },
  { id: 'kpi-row-liq-5lt', registryId: 'liq-5lt' },
  { id: 'kpi-row-liq-5lca', registryId: 'liq-5lca' },
  { id: 'kpi-row-liq-5lfs', registryId: 'liq-5lfs' },
];

// QBO realm IDs for per-entity revenue/profit breakdowns shown in Key Stats.
const KEY_STATS_DEBT_REALM_ID = '193514877331929';
const KEY_STATS_FINSERV_REALM_ID = '9341451968897660';

type PnlSnapshotForKeyStats = {
  realm_id: string;
  period_start: string;
  period_end: string;
  income_total: number | null;
  operating_expenses: number | null;
  net_operating_income: number | null;
};

const INSIGHTS_DEFAULT_LAYOUT: GridLayoutItem[] = [
  // One-time fallback only. If a shared backend row exists, useGridLayout
  // never re-applies these values after hydration.
  { i: 'kpi-summary',           x: 0, y: 0,  w: 6,  h: 9,  minW: 4, minH: 8 },
  { i: 'monthly-revenue',       x: 6, y: 0,  w: 6,  h: 4,  minW: 4, minH: 3 },
  { i: 'opex',                  x: 6, y: 4,  w: 6,  h: 5,  minW: 4, minH: 4 },
  { i: 'cashflow-12w',          x: 0, y: 9,  w: 6,  h: 4,  minW: 4, minH: 3 },
  { i: 'cashflow-ops',          x: 6, y: 9,  w: 6,  h: 4,  minW: 4, minH: 3 },
  { i: 'active-deals-list',     x: 0, y: 13, w: 6,  h: 8,  minW: 4, minH: 6 },
  { i: 'finserv-next3',         x: 6, y: 14, w: 6,  h: 8,  minW: 4, minH: 4 },
  { i: 'liabilities',           x: 0, y: 23, w: 12, h: 9,  minW: 6, minH: 6 },
];

const INSIGHTS_LAYOUT_IDS = INSIGHTS_DEFAULT_LAYOUT.map(i => i.i);

const cloneInsightsDefaultLayout = (): GridLayoutItem[] =>
  INSIGHTS_DEFAULT_LAYOUT.map(item => ({ ...item }));

const normalizeInsightsLayoutForSave = (items: GridLayoutItem[]): GridLayoutItem[] =>
  items.map(item => ({
    i: item.i,
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
    minW: item.minW,
    minH: item.minH,
    maxW: item.maxW,
    maxH: item.maxH,
  }));

// Plain-language descriptions for hover tooltips on Key Stats labels.
const KPI_DESCRIPTIONS: Record<string, string> = {
  'total-revenue-curr': 'Total revenue booked for the current reporting period across all QuickBooks entities.',
  'operating-profit-curr': 'Net Operating Income from the Accrual P&L for the current reporting period, consolidated across all QuickBooks entities.',
  'outstanding-ar': 'Sum of all open QuickBooks invoice balances as of today, across every entity.',
  'active-pipeline-value': 'Total value of active debt-advisory deals currently in flight in the Debt Pipeline.',
  'ttm-revenue': 'Trailing 12 months of revenue ending on the current reporting period end date.',
  'ytd-revenue': 'Year-to-date revenue for the current calendar year across all QuickBooks entities.',
  'debt-solutions-revenue': 'Revenue for the current period from the QuickBooks Debt Advisory entity.',
  'debt-solutions-profit': 'Net Operating Income from the Accrual P&L for the current period, QuickBooks Debt Advisory entity.',
  'finserv-revenue': 'Revenue for the current period from the QuickBooks FinServ entity.',
  'finserv-profit': 'Net Operating Income from the Accrual P&L for the current period, QuickBooks FinServ entity.',
  'liq-operating': 'Bank balance — Operating account. Not yet wired to a live data source.',
  'liq-mt': 'Bank balance — M&T account. Not yet wired to a live data source.',
  'liq-tax-reserves': 'Balance of tax reserves. Not yet wired to a live data source.',
  'liq-5lt': 'Balance for 5LT entity. Not yet wired to a live data source.',
  'liq-5lca': 'Balance for 5LCA entity. Not yet wired to a live data source.',
  'liq-5lfs': 'Balance for 5LFS entity. Not yet wired to a live data source.',
};

interface ManagementReviewDashboardProps {
  isEditMode?: boolean;
  onExitEditMode?: () => void;
}

export function ManagementReviewDashboard({ isEditMode = false, onExitEditMode }: ManagementReviewDashboardProps = {}) {
  const [openDealId, setOpenDealId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const qb = useQuickBooksMetrics();
  const metrics = useMetricsData();
  const { reportingPeriod, timeframe } = useInsightsTimeframe();
  const { activePipelineId } = usePipelineContext();
  const { user } = useAuth();
  const { company } = useCompany();
  const isLayoutEditor = (user?.email ?? '').toLowerCase() === 'jturner@5thline.co';
  const INSIGHTS_LAYOUT_DASHBOARD_ID = 'insights-management-review-v20';
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [drilldown, setDrilldown] = useState<{
    context: DrilldownContext;
    columns: DrilldownColumn<Record<string, any>>[];
    rows: Record<string, any>[];
    emptyHint?: string;
    trend?: DrilldownTrend;
    body?: React.ReactNode;
  } | null>(null);
  const closeDrilldown = () => setDrilldown(null);

  // Shared org-wide layout. The backend row is keyed by company + dashboard,
  // so once jturner saves it, everyone in the workspace hydrates the same grid.
  // The hook is intentionally allowed to call the shared save RPC for company
  // members; the RPC itself is the server-side gate that only permits
  // jturner@5thline.co to write this dashboard id.
  const {
    layout,
    saveLayout: saveSharedGridLayout,
    isLoaded: isSharedGridLayoutLoaded,
  } = useGridLayout(INSIGHTS_LAYOUT_DASHBOARD_ID, INSIGHTS_LAYOUT_IDS, {
    allowAllMembers: true,
    layoutDefaults: INSIGHTS_DEFAULT_LAYOUT,
    persistBreakpoints: true,
    strictPersistedLayout: true,
    debugLabel: 'Insights',
  });
  const latestLayoutRef = useRef<GridLayoutItem[]>(cloneInsightsDefaultLayout());
  const gridLatestLayoutGetterRef = useRef<(() => GridLayoutItem[]) | null>(null);

  useEffect(() => {
    latestLayoutRef.current = layout;
  }, [layout]);

  const saveLayout = React.useCallback((nextLayout: GridLayoutItem[], immediate?: boolean) => {
    if (!isLayoutEditor) return;
    const normalized = normalizeInsightsLayoutForSave(nextLayout);
    latestLayoutRef.current = normalized;
    saveSharedGridLayout(normalized, immediate);
  }, [isLayoutEditor, saveSharedGridLayout]);

  const editSnapshotRef = useRef<GridLayoutItem[] | null>(null);
  const wasEditingRef = useRef(false);
  useEffect(() => {
    if (isEditMode && !wasEditingRef.current) {
      editSnapshotRef.current = layout;
    }
    wasEditingRef.current = isEditMode;
  }, [isEditMode, layout]);

  const handleSaveLayout = async () => {
    if (!isLayoutEditor) return;
    const current = normalizeInsightsLayoutForSave(gridLatestLayoutGetterRef.current?.() ?? latestLayoutRef.current);
    saveSharedGridLayout(current, true);
    editSnapshotRef.current = null;
    toast.success('Layout saved');
    onExitEditMode?.();
  };

  const handleCancelLayout = () => {
    if (editSnapshotRef.current) {
      saveSharedGridLayout(editSnapshotRef.current, true);
    }
    editSnapshotRef.current = null;
    onExitEditMode?.();
  };

  const handleGridLatestLayoutRef = React.useCallback((getLayout: () => GridLayoutItem[]) => {
    gridLatestLayoutGetterRef.current = getLayout;
  }, []);

  const periodRange = useMemo(
    () => toDateRange(reportingPeriod?.start ?? timeframe.start, reportingPeriod?.end ?? timeframe.end),
    [reportingPeriod?.start, reportingPeriod?.end, timeframe.start, timeframe.end],
  );
  const previousRange = useMemo(
    () => buildPreviousRange(periodRange, reportingPeriod?.view ?? null),
    [periodRange, reportingPeriod?.view],
  );
  const comparisonBasis = reportingPeriod?.view === 'quarter' ? 'vs prior quarter' : 'vs prior month';
  const periodLabel = reportingPeriod?.label ?? timeframe.label;
  const periodToken = reportingPeriod?.period ?? `${timeframe.start}_${timeframe.end}`;

  const isCurrentReportingPeriod = useMemo(() => {
    if (!reportingPeriod) return false;
    const now = new Date();
    if (reportingPeriod.view === 'month') {
      return reportingPeriod.period === format(now, 'yyyy-MM');
    }
    return reportingPeriod.period === `${format(now, 'yyyy')}-Q${Math.floor(now.getMonth() / 3) + 1}`;
  }, [reportingPeriod]);

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
        queryClient.invalidateQueries({ queryKey: ['management-review-qbo-pnl-snapshots'] }),
        queryClient.invalidateQueries({ queryKey: ['metrics-deals'] }),
        metrics.refetch(),
      ]);
      setLastUpdated(new Date());
    } finally {
      setRefreshing(false);
    }
  };

  const isLoading = qb.isLoading || metrics.isLoading;
  const qbConnected = (qb.rawInvoices?.length ?? 0) > 0 || (qb.rawPayments?.length ?? 0) > 0 || (qb.rawExpenses?.length ?? 0) > 0;
  const qbInvoices = qb.rawInvoices ?? [];
  const qbPayments = qb.rawPayments ?? [];
  const qbExpenses = qb.rawExpenses ?? [];

  const allDeals = useMemo(
    () => (metrics.rawDeals || []).filter(d => !isExcludedDealName(d.company)),
    [metrics.rawDeals],
  );

  const revenueSeries: RevenueSeriesPoint[] = useMemo(() => {
    const buckets = reportingPeriod?.view === 'quarter'
      ? buildMonthBuckets(periodRange.start, periodRange.end)
      : buildTrailingMonthBuckets(periodRange.end, 12);

    return buckets.map((bucket) => ({
      key: bucket.key,
      month: bucket.label,
      revenue: sumAmountInRange(qbInvoices, bucket, inv => inv.txn_date, inv => inv.total_amt),
      payments: sumAmountInRange(qbPayments, bucket, payment => payment.txn_date, payment => payment.total_amt),
      expenses: sumAmountInRange(qbExpenses, bucket, expense => expense.txn_date, expense => expense.total_amt),
      invoiceCount: countInRange(qbInvoices, bucket, inv => inv.txn_date),
    }));
  }, [periodRange, qbInvoices, qbPayments, qbExpenses, reportingPeriod?.view]);

  const ytdRange = useMemo<DateRange>(() => ({
    start: startOfDay(new Date(periodRange.end.getFullYear(), 0, 1)),
    end: periodRange.end,
  }), [periodRange.end]);

  const ttmRange = useMemo<DateRange>(() => {
    const end = periodRange.end;
    // Trailing 12 months ending on the selected period end.
    // e.g. period end 2026-04-30 → start 2025-05-01.
    const start = startOfDay(new Date(end.getFullYear() - 1, end.getMonth() + 1, 1));
    return { start, end };
  }, [periodRange.end]);

  // Prior comparable TTM: the immediately preceding 12-month window
  // (e.g. current TTM May 2025–Apr 2026 → prior TTM May 2024–Apr 2025).
  const priorTtmRange = useMemo<DateRange>(() => {
    const end = startOfDay(new Date(ttmRange.start.getFullYear(), ttmRange.start.getMonth(), 0));
    const start = startOfDay(new Date(end.getFullYear() - 1, end.getMonth() + 1, 1));
    return { start, end };
  }, [ttmRange.start]);

  // Prior YTD: same Jan 1 → same month/day cutoff in the prior year.
  const priorYtdRange = useMemo<DateRange>(() => {
    const end = startOfDay(new Date(periodRange.end.getFullYear() - 1, periodRange.end.getMonth(), periodRange.end.getDate()));
    const start = startOfDay(new Date(end.getFullYear(), 0, 1));
    return { start, end };
  }, [periodRange.end]);

  const ytdSeries = useMemo(() => {
    const buckets = buildMonthBuckets(ytdRange.start, ytdRange.end);
    return buckets.map((bucket) => ({
      month: bucket.label,
      revenue: sumAmountInRange(qbInvoices, bucket, inv => inv.txn_date, inv => inv.total_amt),
    }));
  }, [qbInvoices, ytdRange]);

  const periodRevenue = useMemo(
    () => sumAmountInRange(qbInvoices, periodRange, inv => inv.txn_date, inv => inv.total_amt),
    [qbInvoices, periodRange],
  );
  const previousRevenue = useMemo(
    () => sumAmountInRange(qbInvoices, previousRange, inv => inv.txn_date, inv => inv.total_amt),
    [qbInvoices, previousRange],
  );
  const periodExpenses = useMemo(
    () => sumAmountInRange(qbExpenses, periodRange, exp => exp.txn_date, exp => exp.total_amt),
    [qbExpenses, periodRange],
  );
  const previousExpenses = useMemo(
    () => sumAmountInRange(qbExpenses, previousRange, exp => exp.txn_date, exp => exp.total_amt),
    [qbExpenses, previousRange],
  );
  const periodPayments = useMemo(
    () => sumAmountInRange(qbPayments, periodRange, payment => payment.txn_date, payment => payment.total_amt),
    [qbPayments, periodRange],
  );

  const pnlSnapshotPeriods = useMemo(() => {
    const byKey = new Map<string, { start_date: string; end_date: string }>();
    const addRange = (range: DateRange) => {
      const period = {
        start_date: format(range.start, 'yyyy-MM-dd'),
        end_date: format(range.end, 'yyyy-MM-dd'),
      };
      byKey.set(`${period.start_date}_${period.end_date}`, period);
    };

    addRange(periodRange);
    addRange(previousRange);
    buildTrailingMonthBuckets(periodRange.end, 12).forEach(addRange);
    for (let i = 7; i >= 0; i--) {
      const quarterStart = startOfQuarter(subQuarters(periodRange.end, i));
      addRange({ start: startOfDay(quarterStart), end: endOfDay(endOfQuarter(quarterStart)) });
    }

    return Array.from(byKey.values()).sort((a, b) => a.start_date.localeCompare(b.start_date));
  }, [periodRange, previousRange]);

  const pnlSnapshots = useQuery({
    queryKey: [
      'management-review-qbo-pnl-snapshots',
      company?.id,
      pnlSnapshotPeriods.map(p => `${p.start_date}_${p.end_date}`).join('|'),
    ],
    enabled: !!company?.id && pnlSnapshotPeriods.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<PnlSnapshotForKeyStats[]> => {
      const startDates = pnlSnapshotPeriods.map(p => p.start_date).sort();
      const endDates = pnlSnapshotPeriods.map(p => p.end_date).sort();
      const requestedKeys = new Set(pnlSnapshotPeriods.map(p => `${p.start_date}_${p.end_date}`));
      const realmIds = QBO_ENTITIES.map(entity => entity.realmId);
      const { data, error } = await supabase
        .from('qbo_pnl_snapshots')
        .select('realm_id, period_start, period_end, income_total, operating_expenses, net_operating_income')
        .eq('company_id', company!.id)
        .eq('accounting_method', 'Accrual')
        .in('realm_id', realmIds)
        .gte('period_start', startDates[0])
        .lte('period_start', startDates[startDates.length - 1])
        .gte('period_end', endDates[0])
        .lte('period_end', endDates[endDates.length - 1]);

      if (error) throw error;

      return ((data ?? []) as PnlSnapshotForKeyStats[]).filter(row =>
        requestedKeys.has(`${row.period_start}_${row.period_end}`),
      );
    },
  });

  const pnlByRangeRealm = useMemo(() => {
    const map = new Map<string, PnlSnapshotForKeyStats>();
    for (const row of pnlSnapshots.data ?? []) {
      map.set(`${row.realm_id}_${row.period_start}_${row.period_end}`, row);
    }
    return map;
  }, [pnlSnapshots.data]);

  const getPnlSnapshotTotal = (range: DateRange, realmId?: string): number | null => {
    if (pnlSnapshots.isLoading || pnlSnapshots.isError) return null;
    const start = format(range.start, 'yyyy-MM-dd');
    const end = format(range.end, 'yyyy-MM-dd');
    const realms = realmId ? [realmId] : QBO_ENTITIES.map((entity) => entity.realmId);
    return realms.reduce((sum, rid) => {
      const row = pnlByRangeRealm.get(`${rid}_${start}_${end}`);
      return sum + Number(row?.net_operating_income ?? 0);
    }, 0);
  };

  const totalRevCurr = qbConnected ? periodRevenue : null;
  const totalRevPrev = qbConnected ? previousRevenue : null;
  const pnlConnected = !pnlSnapshots.isError && !!company?.id;
  const opProfitCurr = pnlConnected ? getPnlSnapshotTotal(periodRange) : null;
  const opProfitPrev = pnlConnected ? getPnlSnapshotTotal(previousRange) : null;

  // Per-entity (Debt Solutions vs FinServ) revenue & profit for the active
  // selected period and the matching prior comparison window. Sourced from the
  // same qbInvoices / qbExpenses dataset as Total Revenue / Operating Profit
  // above, filtered by QBO realm_id.
  const sumByRealm = (
    rows: any[],
    range: DateRange,
    realmId: string,
  ) =>
    sumAmountInRange(
      rows.filter((r: any) => r.realm_id === realmId),
      range,
      (r: any) => r.txn_date,
      (r: any) => r.total_amt,
    );

  const debtRevCurr = qbConnected ? sumByRealm(qbInvoices, periodRange, KEY_STATS_DEBT_REALM_ID) : null;
  const debtRevPrev = qbConnected ? sumByRealm(qbInvoices, previousRange, KEY_STATS_DEBT_REALM_ID) : null;
  const debtProfitCurr = pnlConnected ? getPnlSnapshotTotal(periodRange, KEY_STATS_DEBT_REALM_ID) : null;
  const debtProfitPrev = pnlConnected ? getPnlSnapshotTotal(previousRange, KEY_STATS_DEBT_REALM_ID) : null;

  const finservRevCurr = qbConnected ? sumByRealm(qbInvoices, periodRange, KEY_STATS_FINSERV_REALM_ID) : null;
  const finservRevPrev = qbConnected ? sumByRealm(qbInvoices, previousRange, KEY_STATS_FINSERV_REALM_ID) : null;
  const finservProfitCurr = pnlConnected ? getPnlSnapshotTotal(periodRange, KEY_STATS_FINSERV_REALM_ID) : null;
  const finservProfitPrev = pnlConnected ? getPnlSnapshotTotal(previousRange, KEY_STATS_FINSERV_REALM_ID) : null;
  const ytdRevenue = qbConnected ? ytdSeries.reduce((sum, row) => sum + row.revenue, 0) : null;
  const ttmSeries = useMemo(() => {
    const buckets = buildMonthBuckets(ttmRange.start, ttmRange.end);
    return buckets.map((bucket) => ({
      month: bucket.label,
      revenue: sumAmountInRange(qbInvoices, bucket, inv => inv.txn_date, inv => inv.total_amt),
    }));
  }, [qbInvoices, ttmRange]);
  const ttmRevenue = qbConnected ? ttmSeries.reduce((sum, row) => sum + row.revenue, 0) : null;

  const priorTtmRevenue = useMemo(
    () => qbConnected ? sumAmountInRange(qbInvoices, priorTtmRange, inv => inv.txn_date, inv => inv.total_amt) : null,
    [qbConnected, qbInvoices, priorTtmRange],
  );
  const priorYtdRevenue = useMemo(
    () => qbConnected ? sumAmountInRange(qbInvoices, priorYtdRange, inv => inv.txn_date, inv => inv.total_amt) : null,
    [qbConnected, qbInvoices, priorYtdRange],
  );

  const chartMode = reportingPeriod?.view === 'quarter' ? 'quarter' : 'rolling';
  const chartWindowLabel = chartMode === 'quarter'
    ? `4 quarters ending ${periodLabel}`
    : `12 months ending ${periodLabel}`;

  const monthLabels = revenueSeries.map(point => point.month);
  const monthRevenue = revenueSeries.map(point => point.revenue);
  const monthExpenses = revenueSeries.map(point => point.expenses);
  const monthNet = revenueSeries.map(point => point.revenue - point.expenses);

  // TTM Revenue trend: for each bucket in revenueSeries, plot the trailing
  // 12-month total revenue ending at that bucket's end (sum across all QBO
  // entities). Each point recalculates its own rolling 12-month window.
  // In quarter view: show current quarter + previous 3 quarters (4 points),
  // each point = TTM revenue ending at that quarter's end. In month/rolling
  // view: 12 trailing months ending at period end.
  const ttmTrendSeries = useMemo(() => {
    if (reportingPeriod?.view === 'quarter') {
      const anchor = endOfQuarter(periodRange.end);
      const buckets = Array.from({ length: 4 }, (_, i) => {
        const qStart = startOfQuarter(subQuarters(anchor, 3 - i));
        const qEnd = endOfQuarter(qStart);
        return {
          key: format(qStart, "yyyy-'Q'Q"),
          label: format(qStart, "'Q'Q yy"),
          start: qStart,
          end: qEnd,
        };
      });
      return buckets.map((bucket) => {
        const end = bucket.end;
        const start = startOfMonth(subMonths(end, 11));
        const revenue = sumAmountInRange(
          qbInvoices,
          { start, end },
          inv => inv.txn_date,
          inv => inv.total_amt,
        );
        return { key: bucket.key, month: bucket.label, windowStart: start, windowEnd: end, revenue };
      });
    }
    const buckets = buildTrailingMonthBuckets(periodRange.end, 12);
    return buckets.map((bucket) => {
      const end = bucket.end;
      const start = startOfMonth(subMonths(end, 11));
      const revenue = sumAmountInRange(
        qbInvoices,
        { start, end },
        inv => inv.txn_date,
        inv => inv.total_amt,
      );
      return {
        key: bucket.key,
        month: bucket.label,
        windowStart: start,
        windowEnd: end,
        revenue,
      };
    });
  }, [periodRange, qbInvoices, reportingPeriod?.view]);
  const ttmTrendValues = ttmTrendSeries.map(p => p.revenue);

  const pipelineUnavailableReason = isCurrentReportingPeriod
    ? 'No active pipeline records found for the current snapshot.'
    : `Unavailable for ${periodLabel} — no historical pipeline snapshot source exists.`;
  const arUnavailableReason = isCurrentReportingPeriod
    ? 'No receivables snapshot available.'
    : `Unavailable for ${periodLabel} — no historical A/R snapshot source exists.`;

  const activeDeals = useMemo(
    () => (isCurrentReportingPeriod
      ? allDeals.filter(d => d.status !== 'archived' && d.stage !== 'closed-won' && d.stage !== 'closed-lost')
      : []),
    [allDeals, isCurrentReportingPeriod],
  );

  // Focused active deals list for the "Active Deals" widget:
  // - Only deals in the active pipeline
  // - Stages between Final Credit Items and In Due Diligence (inclusive)
  // - Exclude On Hold and Archived statuses
  // Centralized stage normalization shared by inclusion logic + display.
  // Accepts slug, human label, or legacy variants and returns a canonical slug.
  const normalizeDebtPipelineStage = (raw: unknown): string => {
    const s = String(raw ?? '').toLowerCase().trim().replace(/[\s/]+/g, '-').replace(/-+/g, '-');
    const aliases: Record<string, string> = {
      'final-credit-items': 'final-credit-items',
      'final-credit-item': 'final-credit-items',
      'submitted-to-lenders': 'submitted-to-lenders',
      'submitted': 'submitted-to-lenders',
      'lenders-in-review': 'lenders-in-review',
      'lender-review': 'lenders-in-review',
      'in-lender-review': 'lenders-in-review',
      'terms-issued': 'terms-issued',
      'term-sheet': 'terms-issued',
      'term-sheets': 'terms-issued',
      'in-due-diligence': 'in-due-diligence',
      'due-diligence': 'in-due-diligence',
      'diligence': 'in-due-diligence',
    };
    return aliases[s] ?? s;
  };

  const ACTIVE_DEAL_LIST_STAGES = useMemo(() => new Set([
    'final-credit-items',
    'submitted-to-lenders',
    'lenders-in-review',
    'terms-issued',
    'in-due-diligence',
  ]), []);

  const DEBT_PIPELINE_EXCLUDED_STATUSES = useMemo(
    () => new Set(['archived', 'closed-lost', 'closed lost']),
    [],
  );

  const debtPipelineDebug = useMemo(() => {
    const excluded: Array<{
      id: string;
      name: string;
      rawStage: unknown;
      normalized: string;
      reason: string;
      status: string | null;
      onHold: boolean | null;
      pipelineId: string | null;
      projectedCloseDate: string | null;
      totalFee: number | null;
      retainerFee: number | null;
      milestoneFee: number | null;
      inActivePipeline: boolean;
    }> = [];
    const included = allDeals.filter((d: any) => {
      const normalized = normalizeDebtPipelineStage(d.stage);
      const normalizedStatus = String(d.status ?? '').toLowerCase().trim();
      const inActivePipeline = !activePipelineId || !d.pipeline_id || d.pipeline_id === activePipelineId;

      if (!ACTIVE_DEAL_LIST_STAGES.has(normalized)) {
        excluded.push({
          id: String(d.id ?? d.company ?? normalized),
          name: d.company,
          rawStage: d.stage,
          normalized,
          reason: 'stage-out-of-range',
          status: d.status ?? null,
          onHold: d.on_hold ?? null,
          pipelineId: d.pipeline_id ?? null,
          projectedCloseDate: d.projected_close_date ?? null,
          totalFee: d.total_fee == null ? null : Number(d.total_fee),
          retainerFee: d.retainer_fee == null ? null : Number(d.retainer_fee),
          milestoneFee: d.milestone_fee == null ? null : Number(d.milestone_fee),
          inActivePipeline,
        });
        return false;
      }
      if (DEBT_PIPELINE_EXCLUDED_STATUSES.has(normalizedStatus)) {
        excluded.push({
          id: String(d.id ?? d.company ?? normalized),
          name: d.company,
          rawStage: d.stage,
          normalized,
          reason: `status:${normalizedStatus || 'unknown'}`,
          status: d.status ?? null,
          onHold: d.on_hold ?? null,
          pipelineId: d.pipeline_id ?? null,
          projectedCloseDate: d.projected_close_date ?? null,
          totalFee: d.total_fee == null ? null : Number(d.total_fee),
          retainerFee: d.retainer_fee == null ? null : Number(d.retainer_fee),
          milestoneFee: d.milestone_fee == null ? null : Number(d.milestone_fee),
          inActivePipeline,
        });
        return false;
      }
      if (!inActivePipeline) {
        excluded.push({
          id: String(d.id ?? d.company ?? normalized),
          name: d.company,
          rawStage: d.stage,
          normalized,
          reason: `wrong-pipeline:${d.pipeline_id}`,
          status: d.status ?? null,
          onHold: d.on_hold ?? null,
          pipelineId: d.pipeline_id ?? null,
          projectedCloseDate: d.projected_close_date ?? null,
          totalFee: d.total_fee == null ? null : Number(d.total_fee),
          retainerFee: d.retainer_fee == null ? null : Number(d.retainer_fee),
          milestoneFee: d.milestone_fee == null ? null : Number(d.milestone_fee),
          inActivePipeline,
        });
        return false;
      }
      return true;
    });

    const reasonCounts = excluded.reduce<Record<string, number>>((acc, item) => {
      acc[item.reason] = (acc[item.reason] || 0) + 1;
      return acc;
    }, {});

    if (import.meta.env.DEV) {
      const interesting = excluded.filter(e =>
        /upflex|athyna/i.test(e.name || '') || e.normalized === 'in-due-diligence' || e.normalized === 'final-credit-items'
      );
      if (interesting.length) {
        // eslint-disable-next-line no-console
        console.info('[DebtPipeline] excluded candidates', interesting);
      }
      // eslint-disable-next-line no-console
      console.info('[DebtPipeline] included', included.map((d: any) => ({ name: d.company, stage: d.stage, pipeline: d.pipeline_id })));
    }

    const sortedIncluded = included.sort((a: any, b: any) => {
      const aRaw = a.projected_close_date ?? a.dashboard_closing_date ?? a.closing_date ?? null;
      const bRaw = b.projected_close_date ?? b.dashboard_closing_date ?? b.closing_date ?? null;
      const ad = aRaw ? new Date(aRaw).getTime() : Infinity;
      const bd = bRaw ? new Date(bRaw).getTime() : Infinity;
      if (ad !== bd) return ad - bd;
      return String(a.company || '').localeCompare(String(b.company || ''));
    });

    return {
      included: sortedIncluded,
      excluded,
      totalCandidates: allDeals.length,
      reasonCounts,
      trackedDeals: allDeals
        .filter((d: any) => /upflex|athyna/i.test(String(d.company || '')))
        .map((d: any) => ({
          id: d.id,
          name: d.company,
          rawStage: d.stage,
          normalizedStage: normalizeDebtPipelineStage(d.stage),
          status: d.status ?? null,
          onHold: d.on_hold ?? null,
          pipelineId: d.pipeline_id ?? null,
          projectedCloseDate: d.projected_close_date ?? null,
          totalFee: d.total_fee == null ? null : Number(d.total_fee),
          retainerFee: d.retainer_fee == null ? null : Number(d.retainer_fee),
          milestoneFee: d.milestone_fee == null ? null : Number(d.milestone_fee),
          inActivePipeline: !activePipelineId || !d.pipeline_id || d.pipeline_id === activePipelineId,
        })),
    };
  }, [allDeals, activePipelineId, ACTIVE_DEAL_LIST_STAGES, DEBT_PIPELINE_EXCLUDED_STATUSES]);

  const activeDealsList = debtPipelineDebug.included;

  // Latest status note per deal (for hover tooltips on Deal Name + Status)
  const [debtPipelineStatusNotes, setDebtPipelineStatusNotes] = useState<Record<string, string>>({});
  const debtPipelineDealIds = useMemo(
    () => activeDealsList.map((d: any) => d.id),
    [activeDealsList],
  );
  const debtPipelineDealIdsKey = debtPipelineDealIds.join(',');
  useEffect(() => {
    let cancelled = false;
    if (debtPipelineDealIds.length === 0) {
      setDebtPipelineStatusNotes({});
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from('deal_status_notes')
        .select('deal_id, note, created_at')
        .in('deal_id', debtPipelineDealIds)
        .order('created_at', { ascending: false });
      if (cancelled || error || !data) return;
      const latest: Record<string, string> = {};
      for (const row of data as any[]) {
        if (!latest[row.deal_id]) latest[row.deal_id] = row.note;
      }
      setDebtPipelineStatusNotes(latest);
    })();
    return () => { cancelled = true; };
  }, [debtPipelineDealIdsKey]);

  // 6-month revenue chart: selected month + 5 following months.
  // Revenue per month = sum of total_fee for active-pipeline deals whose
  // projected_close_date falls in that month.
  const debtPipelineChart = useMemo(() => {
    const anchor = reportingPeriod?.view === 'month'
      ? startOfMonth(periodRange.start)
      : startOfMonth(periodRange.end);
    const buckets: { key: string; label: string; start: Date; end: Date }[] = [];
    for (let i = 0; i < 6; i++) {
      const s = startOfMonth(new Date(anchor.getFullYear(), anchor.getMonth() + i, 1));
      const e = endOfMonth(s);
      buckets.push({ key: format(s, 'yyyy-MM'), label: format(s, 'MMM yy'), start: s, end: e });
    }
    const totals = buckets.map(b => {
      const sum = activeDealsList.reduce((acc: number, d: any) => {
        if (!d.projected_close_date) return acc;
        const dt = new Date(d.projected_close_date);
        if (Number.isNaN(dt.getTime())) return acc;
        if (dt >= b.start && dt <= b.end) return acc + Number(d.total_fee || 0);
        return acc;
      }, 0);
      return sum;
    });
    return { labels: buckets.map(b => b.label), values: totals };
  }, [activeDealsList, periodRange, reportingPeriod?.view]);

  const debtPipelineChartRef = useRef<HTMLCanvasElement>(null);
  useChart(
    debtPipelineChartRef,
    debtPipelineChart.labels.length > 0
      ? {
          type: 'bar',
          data: {
            labels: debtPipelineChart.labels,
            datasets: [{
              data: debtPipelineChart.values,
              backgroundColor: 'hsla(213,90%,70%,0.65)',
              borderColor: 'hsl(213,90%,70%)',
              borderWidth: 1,
              borderRadius: 4,
            }],
          },
          options: {
            ...def,
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: (ctx: any) => fmtUSD(Number(ctx.parsed.y || 0)) } },
            },
            scales: { x: gx, y: { ...gy, ticks: { ...gy.ticks, callback: (v: number) => fmtUSD(v) } } },
          },
        }
      : null,
    [JSON.stringify(debtPipelineChart.labels), JSON.stringify(debtPipelineChart.values)],
  );

  const statusDisplay = (status: string): { label: string; color: string } | null => {
    if (status === 'on-track') return { label: 'On Track', color: '#3de89a' };
    if (status === 'at-risk') return { label: 'At Risk', color: '#ffbe1e' };
    if (status === 'off-track') return { label: 'Off Track', color: '#ff6b7a' };
    return null;
  };

  const formatCloseMonth = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '—';
    const d = parseValueDate(dateStr);
    return d ? format(d, 'MMM yyyy') : '—';
  };
  // Deal close date can live in one of three fields depending on how it was
  // entered (Insights dashboard vs. deal detail vs. legacy FinServ flow).
  // Fall back in priority order so a user-entered date always surfaces.
  const resolveDealCloseDate = (d: any): string | null =>
    d?.projected_close_date ?? d?.dashboard_closing_date ?? d?.closing_date ?? null;
  const activeDealCount = activeDeals.length;
  const activePipelineValue = activeDeals.reduce((sum, deal) => sum + Number(deal.value || 0), 0);
  const avgDealSize = activeDealCount > 0 ? activePipelineValue / activeDealCount : 0;

  const stageBreakdown = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of activeDeals) {
      const stage = (d.stage || 'unknown')
        .split('-')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      m.set(stage, (m.get(stage) || 0) + Number(d.value || 0));
    }
    return Array.from(m.entries())
      .map(([stage, value]) => ({ stage, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [activeDeals]);

  const totalAR = useMemo(() => {
    if (!isCurrentReportingPeriod) return null;
    return qbInvoices.reduce((sum, inv) => sum + Number(inv.balance || 0), 0);
  }, [qbInvoices, isCurrentReportingPeriod]);

  const overdueInvoices = useMemo(() => {
    if (!isCurrentReportingPeriod) return [];
    const now = new Date();
    return qbInvoices.filter(inv => {
      const due = parseValueDate(inv.due_date);
      return !!due && Number(inv.balance || 0) > 0 && due < now;
    });
  }, [qbInvoices, isCurrentReportingPeriod]);

  const overdueAR = useMemo(
    () => (isCurrentReportingPeriod ? overdueInvoices.reduce((sum, inv) => sum + Number(inv.balance || 0), 0) : null),
    [isCurrentReportingPeriod, overdueInvoices],
  );

  const arBuckets = useMemo(() => {
    if (!isCurrentReportingPeriod) return [] as { bucket: string; value: number }[];
    const now = new Date();
    const agingBuckets = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    qbInvoices.forEach(inv => {
      const balance = Number(inv.balance || 0);
      if (balance <= 0) return;
      const dueDate = parseValueDate(inv.due_date);
      if (!dueDate) {
        agingBuckets.current += balance;
        return;
      }
      const daysPast = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysPast <= 0) agingBuckets.current += balance;
      else if (daysPast <= 30) agingBuckets['1-30'] += balance;
      else if (daysPast <= 60) agingBuckets['31-60'] += balance;
      else if (daysPast <= 90) agingBuckets['61-90'] += balance;
      else agingBuckets['90+'] += balance;
    });
    return Object.entries(agingBuckets).map(([bucket, value]) => ({ bucket, value }));
  }, [qbInvoices, isCurrentReportingPeriod]);

  const rcRef = useRef<HTMLCanvasElement>(null);
  const ncRef = useRef<HTMLCanvasElement>(null);
  const pcRef = useRef<HTMLCanvasElement>(null);
  const arRef = useRef<HTMLCanvasElement>(null);

  const lastIdx = monthLabels.length - 1;
  const bcol = monthLabels.map((_, i) => i === lastIdx ? 'hsla(213,90%,70%,0.85)' : 'hsla(213,90%,70%,0.55)');
  const bbrd = monthLabels.map((_, i) => i === lastIdx ? 'hsl(213,90%,70%)' : 'rgba(255,255,255,0.08)');

  useChart(
    rcRef,
    qbConnected && monthLabels.length > 0
      ? {
          type: 'bar',
          data: { labels: monthLabels, datasets: [{ data: monthRevenue, backgroundColor: bcol, borderColor: bbrd, borderWidth: 1, borderRadius: 4 }] },
          options: { ...def, scales: { x: gx, y: { ...gy, ticks: { ...gy.ticks, callback: (v: number) => fmtUSD(v) } } } },
        }
      : null,
    [qbConnected, JSON.stringify(monthLabels), JSON.stringify(monthRevenue), periodToken],
    (idx, label, value) => {
      const row = revenueSeries[idx];
      setDrilldown({
        context: {
          sourceId: 'chart:monthly-revenue',
          sourceLabel: 'Revenue · QuickBooks',
          selection: label,
          periodLabel,
          filters: [
            { label: 'Reporting period', value: periodLabel },
            { label: 'Chart window', value: chartWindowLabel },
          ],
        },
        columns: [
          { key: 'month', label: 'Month' },
          { key: 'revenue', label: 'Revenue', align: 'right', render: (r) => fmtUSD(r.revenue) },
          { key: 'payments', label: 'Payments', align: 'right', render: (r) => fmtUSD(r.payments) },
          { key: 'expenses', label: 'Expenses', align: 'right', render: (r) => fmtUSD(r.expenses) },
          { key: 'invoiceCount', label: 'Invoices', align: 'right' },
        ],
        rows: row ? [row] : [{ month: label, revenue: value, payments: 0, expenses: 0, invoiceCount: 0 }],
        emptyHint: 'No QuickBooks invoice activity recorded for this month.',
      });
    },
  );

  const ttmLabels = ttmTrendSeries.map(p => p.month);
  const ttmCol = ttmTrendSeries.map((_p, i) => i === ttmTrendSeries.length - 1 ? 'hsla(213,90%,70%,0.85)' : 'hsla(213,90%,70%,0.55)');
  const ttmBrd = ttmTrendSeries.map((_p, i) => i === ttmTrendSeries.length - 1 ? 'hsl(213,90%,70%)' : 'rgba(255,255,255,0.08)');
  const [trendMode, setTrendMode] = useState<'ttm' | 'monthly' | 'quarterly-yoy'>('ttm');
  const [showTrendDelta, setShowTrendDelta] = useState<boolean>(false);
  const isQuarterView = reportingPeriod?.view === 'quarter';
  // In quarter view the "Monthly" toggle becomes "Quarterly": show revenue
  // per quarter for the last 4 quarters (aligned with the TTM buckets).
  const monthlyTrendLabels = isQuarterView
    ? ttmTrendSeries.map(p => p.month)
    : ttmSeries.map(p => p.month);
  const monthlyTrendValues = isQuarterView
    ? ttmTrendSeries.map(p => sumAmountInRange(
        qbInvoices,
        { start: startOfQuarter(p.windowEnd), end: p.windowEnd },
        inv => inv.txn_date,
        inv => inv.total_amt,
      ))
    : ttmSeries.map(p => p.revenue);
  const monthlyCol = monthlyTrendLabels.map((_l, i) => i === monthlyTrendLabels.length - 1 ? 'hsla(213,90%,70%,0.85)' : 'hsla(213,90%,70%,0.55)');
  const monthlyBrd = monthlyTrendLabels.map((_l, i) => i === monthlyTrendLabels.length - 1 ? 'hsl(213,90%,70%)' : 'rgba(255,255,255,0.08)');
  const activeTrendValues = trendMode === 'ttm' ? ttmTrendValues : monthlyTrendValues;
  // Compute a "prior" value for the FIRST bucket so the trend line starts at
  // the first period rather than the second. Prior = the same-shape window
  // immediately preceding bucket 0 (prior TTM window, prior quarter, or prior
  // month depending on the active trend mode / view).
  const priorFirstValue = useMemo<number | null>(() => {
    if (!qbConnected || activeTrendValues.length === 0) return null;
    if (trendMode === 'ttm') {
      const firstEnd = ttmTrendSeries[0]?.windowEnd;
      if (!firstEnd) return null;
      const prevEnd = isQuarterView
        ? endOfQuarter(subQuarters(firstEnd, 1))
        : endOfMonth(subMonths(firstEnd, 1));
      const prevStart = startOfMonth(subMonths(prevEnd, 11));
      return sumAmountInRange(qbInvoices, { start: prevStart, end: prevEnd }, inv => inv.txn_date, inv => inv.total_amt);
    }
    if (isQuarterView) {
      const firstEnd = ttmTrendSeries[0]?.windowEnd;
      if (!firstEnd) return null;
      const prevQEnd = endOfQuarter(subQuarters(firstEnd, 1));
      const prevQStart = startOfQuarter(prevQEnd);
      return sumAmountInRange(qbInvoices, { start: prevQStart, end: prevQEnd }, inv => inv.txn_date, inv => inv.total_amt);
    }
    const prevEnd = endOfMonth(subMonths(ttmRange.start, 1));
    const prevStart = startOfMonth(prevEnd);
    return sumAmountInRange(qbInvoices, { start: prevStart, end: prevEnd }, inv => inv.txn_date, inv => inv.total_amt);
  }, [qbConnected, trendMode, isQuarterView, ttmTrendSeries, ttmRange, qbInvoices, activeTrendValues.length]);
  const trendDeltasPct = activeTrendValues.map((v, i) => {
    const prev = i === 0 ? priorFirstValue : activeTrendValues[i - 1];
    if (prev == null || prev === 0) return null;
    return ((v - prev) / Math.abs(prev)) * 100;
  });
  const trendDeltasAbs = activeTrendValues.map((v, i) => {
    const prev = i === 0 ? priorFirstValue : activeTrendValues[i - 1];
    if (prev == null) return null;
    return v - prev;
  });
  useChart(
    ncRef,
    qbConnected && (trendMode === 'ttm' ? ttmLabels.length > 0 : monthlyTrendLabels.length > 0)
      ? {
          type: 'bar',
          plugins: [{
            id: 'revenueBarValueDeltaLabels',
            afterDatasetsDraw(chart: any) {
              const { ctx, chartArea } = chart;
              const barDs = chart.getDatasetMeta(0);
              if (!barDs || !barDs.data) return;
              ctx.save();
              ctx.textAlign = 'center';
              barDs.data.forEach((bar: any, i: number) => {
                const v = Number(chart.data.datasets[0].data[i] ?? 0);
                if (!isFinite(v) || v === 0) return;
                const w = bar.width ?? 0;
                if (w < 26) return;
                const pct = trendDeltasPct[i];
                const abs = trendDeltasAbs[i];
                // Value above the bar top.
                const topY = Math.max(bar.y - 6, chartArea.top + 12);
                ctx.fillStyle = 'rgba(255,255,255,0.92)';
                ctx.strokeStyle = 'transparent';
                ctx.font = '600 10px system-ui, -apple-system, sans-serif';
                ctx.fillText(fmtUSD(v), bar.x, topY);
                // Δ$ and Δ% stacked INSIDE the bar (Δ$ top, Δ% below),
                // white text with dark stroke for contrast against any bar color.
                const barBottom = bar.base ?? chartArea.bottom;
                const barH = Math.abs(barBottom - bar.y);
                if (barH < 28) return;
                const midY = bar.y + barH / 2;
                const absY = midY - 2;
                const pctY = midY + 11;
                const drawStroked = (txt: string, cx: number, cy: number, size: number, color: string) => {
                  ctx.font = `700 ${size}px system-ui, -apple-system, sans-serif`;
                  ctx.lineWidth = 3;
                  ctx.lineJoin = 'round';
                  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
                  ctx.strokeText(txt, cx, cy);
                  ctx.fillStyle = color;
                  ctx.fillText(txt, cx, cy);
                };
                if (abs != null && abs !== 0) {
                  const s = abs > 0 ? '+' : '−';
                  drawStroked(`${s}${fmtUSD(Math.abs(abs))}`, bar.x, absY, 10, abs > 0 ? 'hsl(150, 80%, 62%)' : 'hsl(0, 82%, 66%)');
                }
                if (pct != null && isFinite(pct) && pct !== 0) {
                  const s = pct > 0 ? '+' : '−';
                  drawStroked(`${s}${Math.abs(pct).toFixed(1)}%`, bar.x, pctY, 9, pct > 0 ? 'hsl(150, 80%, 62%)' : 'hsl(0, 82%, 66%)');
                }
              });
              ctx.restore();
            },
          }],
          data: trendMode === 'ttm'
            ? {
                labels: ttmLabels,
                datasets: [
                  { label: 'TTM Revenue', data: ttmTrendValues, backgroundColor: ttmCol, borderColor: ttmBrd, borderWidth: 1, borderRadius: 4, order: 2, yAxisID: 'y' },
                  ...(showTrendDelta ? [{
                    type: 'line' as const,
                    label: '% Change vs Prior',
                    data: trendDeltasPct,
                    borderColor: 'hsl(38, 92%, 62%)',
                    backgroundColor: 'hsl(38, 92%, 62%)',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    tension: 0.25,
                    spanGaps: true,
                    order: 1,
                    yAxisID: 'y1',
                  }] : []),
                ],
              }
            : {
                labels: monthlyTrendLabels,
                datasets: [
                  { label: 'Monthly Revenue', data: monthlyTrendValues, backgroundColor: monthlyCol, borderColor: monthlyBrd, borderWidth: 1, borderRadius: 4, order: 2, yAxisID: 'y' },
                  ...(showTrendDelta ? [{
                    type: 'line' as const,
                    label: '% Change vs Prior',
                    data: trendDeltasPct,
                    borderColor: 'hsl(38, 92%, 62%)',
                    backgroundColor: 'hsl(38, 92%, 62%)',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    tension: 0.25,
                    spanGaps: true,
                    order: 1,
                    yAxisID: 'y1',
                  }] : []),
                ],
              },
          options: {
            ...def,
            plugins: {
              ...((def as any).plugins || {}),
              tooltip: {
                callbacks: {
                  title: (items: any[]) => {
                    const idx = items?.[0]?.dataIndex ?? 0;
                    if (trendMode === 'ttm') {
                      const p = ttmTrendSeries[idx];
                      if (!p) return '';
                      return `12 mo ending ${format(p.windowEnd, 'MMM yyyy')}`;
                    }
                    return monthlyTrendLabels[idx] ?? '';
                  },
                  label: (item: any) => {
                    const idx = item.dataIndex;
                    if (item.dataset?.yAxisID === 'y1') {
                      const pct = trendDeltasPct[idx];
                      const abs = trendDeltasAbs[idx];
                      if (pct === null || abs === null) return 'Δ vs prior: n/a';
                      const sign = pct >= 0 ? '+' : '';
                      return `Δ vs prior: ${sign}${fmtUSD(abs)}  (${sign}${pct.toFixed(1)}%)`;
                    }
                    if (trendMode === 'ttm') {
                      const p = ttmTrendSeries[idx];
                      const range = p ? `${format(p.windowStart, 'MMM d, yyyy')} – ${format(p.windowEnd, 'MMM d, yyyy')}` : '';
                      return `TTM Revenue: ${fmtUSD(item.parsed.y)}${range ? `  (${range})` : ''}`;
                    }
                    return `Monthly Revenue: ${fmtUSD(item.parsed.y)}`;
                  },
                },
              },
            },
            scales: {
              x: gx,
              y: { ...gy, ticks: { ...gy.ticks, callback: (v: number) => fmtUSD(v) } },
              ...(showTrendDelta ? {
                y1: {
                  position: 'right' as const,
                  grid: { drawOnChartArea: false },
                  ticks: {
                    color: 'hsl(38, 92%, 62%)',
                    font: { size: 10 },
                    callback: (v: number) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(0)}%`,
                  },
                },
              } : {}),
            },
          },
        }
      : null,
    [qbConnected, trendMode, showTrendDelta, JSON.stringify(ttmLabels), JSON.stringify(ttmTrendValues), JSON.stringify(monthlyTrendLabels), JSON.stringify(monthlyTrendValues), JSON.stringify(trendDeltasPct), periodToken],
    (idx, label, value) => {
      if (trendMode === 'monthly') {
        setDrilldown({
          context: {
            sourceId: 'chart:monthly-revenue-trend',
            sourceLabel: 'Monthly Revenue · QuickBooks',
            selection: label,
            periodLabel,
            filters: [{ label: 'Metric', value: 'Monthly revenue (all entities)' }],
          },
          columns: [
            { key: 'month', label: 'Month' },
            { key: 'revenue', label: 'Revenue', align: 'right', render: (r) => fmtUSD(r.revenue) },
          ],
          rows: [{ month: label, revenue: value }],
          emptyHint: 'No QuickBooks invoice activity recorded for this month.',
        });
        return;
      }
      const p = ttmTrendSeries[idx];
      setDrilldown({
        context: {
          sourceId: 'chart:ttm-revenue',
          sourceLabel: 'TTM Revenue · QuickBooks',
          selection: label,
          periodLabel,
          filters: [
            { label: 'Reporting period', value: periodLabel },
            { label: 'Metric', value: 'Trailing 12-month revenue (all entities)' },
            ...(p ? [{ label: 'Window', value: `${format(p.windowStart, 'MMM d, yyyy')} – ${format(p.windowEnd, 'MMM d, yyyy')}` }] : []),
          ],
        },
        columns: [],
        rows: [],
        body: (
          <TtmRevenueDrilldownBody
            invoices={qbInvoices as any}
            ttmRange={p ? { start: p.windowStart, end: p.windowEnd } : ttmRange}
          />
        ),
      });
    },
  );

  useChart(
    pcRef,
    stageBreakdown.length > 0
      ? {
          type: 'bar',
          data: { labels: stageBreakdown.map(s => s.stage), datasets: [{ data: stageBreakdown.map(s => s.value), backgroundColor: 'hsla(213,90%,70%,0.7)', borderColor: 'hsl(213,90%,70%)', borderWidth: 1, borderRadius: 4 }] },
          options: { ...def, indexAxis: 'y' as const, scales: { x: { ...gx, ticks: { ...gx.ticks, callback: (v: number) => fmtUSD(v) } }, y: { ...gy } } },
        }
      : null,
    [JSON.stringify(stageBreakdown), periodToken],
    (_idx, label) => {
      const stageKey = label.toLowerCase().replace(/\s+/g, '-');
      const dealsInStage = activeDeals.filter(d => {
        const pretty = (d.stage || 'unknown').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        return pretty === label || d.stage === stageKey;
      });
      setDrilldown({
        context: {
          sourceId: 'chart:pipeline-by-stage',
          sourceLabel: 'Active Pipeline by Stage',
          selection: label,
          periodLabel,
          filters: [{ label: 'Snapshot source', value: 'Current live pipeline only' }],
        },
        columns: [
          { key: 'company', label: 'Deal' },
          { key: 'stage', label: 'Stage' },
          { key: 'value', label: 'Value', align: 'right', render: (r) => fmtUSD(Number(r.value || 0)) },
        ],
        rows: dealsInStage,
        emptyHint: pipelineUnavailableReason,
      });
    },
  );

  useChart(
    arRef,
    arBuckets.length > 0
      ? {
          type: 'bar',
          data: { labels: arBuckets.map(b => b.bucket), datasets: [{ data: arBuckets.map(b => b.value), backgroundColor: arBuckets.map(b => b.bucket === 'current' ? 'rgba(40,220,140,0.6)' : b.bucket === '90+' ? 'rgba(255,90,100,0.7)' : 'rgba(255,190,30,0.6)'), borderWidth: 1, borderRadius: 3 }] },
          options: { ...def, scales: { x: gx, y: { ...gy, ticks: { ...gy.ticks, callback: (v: number) => fmtUSD(v) } } } },
        }
      : null,
    [JSON.stringify(arBuckets), periodToken],
    (_idx, label, value) => {
      setDrilldown({
        context: {
          sourceId: 'chart:ar-aging',
          sourceLabel: 'A/R Aging · QuickBooks',
          selection: label,
          periodLabel,
          filters: [{ label: 'Snapshot source', value: 'Current receivables only' }],
        },
        columns: [
          { key: 'bucket', label: 'Bucket' },
          { key: 'value', label: 'Outstanding', align: 'right', render: (r) => fmtUSD(Number(r.value || 0)) },
        ],
        rows: [{ bucket: label, value }],
        emptyHint: arUnavailableReason,
      });
    },
  );

  type KpiTile = { id: string; l: string; v: string; sub: React.ReactNode; live: boolean; emptyHint?: string };
  const kpiRegistry: KpiTile[] = [
    {
      id: 'total-revenue-curr',
      l: 'Revenue',
      live: qbConnected,
      v: fmtUSD(totalRevCurr),
      sub: (() => {
        const d = fmtDelta(totalRevCurr, totalRevPrev, comparisonBasis);
        return d ? <span style={{ color: d.positive ? '#3de89a' : '#ff6b7a' }}>{d.label}</span> : <span style={{ color: NA_COLOR }}>—</span>;
      })(),
    },
    {
      id: 'operating-profit-curr',
      l: 'Operating Profit',
      live: pnlConnected && !pnlSnapshots.isLoading,
      v: fmtUSD(opProfitCurr),
      sub: (() => {
        const d = fmtDelta(opProfitCurr, opProfitPrev, comparisonBasis);
        return d ? <span style={{ color: d.positive ? '#3de89a' : '#ff6b7a' }}>{d.label}</span> : <span style={{ color: NA_COLOR }}>—</span>;
      })(),
    },
    {
      id: 'outstanding-ar',
      l: 'Outstanding A/R',
      live: qbConnected && isCurrentReportingPeriod,
      v: fmtUSD(totalAR),
      sub: <span style={{ color: overdueAR && overdueAR > 0 ? '#ff6b7a' : '#3de89a' }}>{overdueAR !== null ? `Overdue ${fmtUSD(overdueAR)}` : '—'}</span>,
      emptyHint: arUnavailableReason,
    },
    {
      id: 'active-pipeline-value',
      l: 'Active Pipeline Value',
      live: isCurrentReportingPeriod,
      v: fmtUSD(activePipelineValue),
      sub: <span style={{ color: 'rgba(255,255,255,0.55)' }}>{activeDealCount} active deal{activeDealCount === 1 ? '' : 's'}</span>,
      emptyHint: pipelineUnavailableReason,
    },
    {
      id: 'ttm-revenue',
      l: 'TTM Revenue',
      live: qbConnected,
      v: fmtUSD(ttmRevenue),
      sub: renderDelta(ttmRevenue, priorTtmRevenue, 'TTM'),
      emptyHint: 'TTM revenue unavailable — connect QuickBooks to populate finance data.',
    },
    {
      id: 'ytd-revenue',
      l: 'YTD Revenue',
      live: qbConnected,
      v: fmtUSD(ytdRevenue),
      sub: renderDelta(ytdRevenue, priorYtdRevenue, 'YTD'),
    },
    ...([
      { id: 'liq-operating', l: 'Operating Acc.' },
      { id: 'liq-mt', l: 'M&T Acc.' },
      { id: 'liq-tax-reserves', l: 'Tax Reserves' },
      { id: 'liq-5lt', l: '5LT' },
      { id: 'liq-5lca', l: '5LCA' },
      { id: 'liq-5lfs', l: '5LFS' },
    ].map(({ id, l }) => ({
      id,
      l,
      live: false,
      v: '—',
      sub: <span style={{ color: NA_COLOR }}>—</span>,
    }))),
    {
      id: 'debt-solutions-revenue',
      l: 'Debt Solutions Revenue',
      live: qbConnected,
      v: fmtUSD(debtRevCurr),
      sub: (() => {
        const d = fmtDelta(debtRevCurr, debtRevPrev, comparisonBasis);
        return d ? <span style={{ color: d.positive ? '#3de89a' : '#ff6b7a' }}>{d.label}</span> : <span style={{ color: NA_COLOR }}>—</span>;
      })(),
    },
    {
      id: 'debt-solutions-profit',
      l: 'Debt Solutions Profit',
      live: pnlConnected && !pnlSnapshots.isLoading,
      v: fmtUSD(debtProfitCurr),
      sub: (() => {
        const d = fmtDelta(debtProfitCurr, debtProfitPrev, comparisonBasis);
        return d ? <span style={{ color: d.positive ? '#3de89a' : '#ff6b7a' }}>{d.label}</span> : <span style={{ color: NA_COLOR }}>—</span>;
      })(),
    },
    {
      id: 'finserv-revenue',
      l: 'FinServ Revenue',
      live: qbConnected,
      v: fmtUSD(finservRevCurr),
      sub: (() => {
        const d = fmtDelta(finservRevCurr, finservRevPrev, comparisonBasis);
        return d ? <span style={{ color: d.positive ? '#3de89a' : '#ff6b7a' }}>{d.label}</span> : <span style={{ color: NA_COLOR }}>—</span>;
      })(),
    },
    {
      id: 'finserv-profit',
      l: 'FinServ Profit',
      live: pnlConnected && !pnlSnapshots.isLoading,
      v: fmtUSD(finservProfitCurr),
      sub: (() => {
        const d = fmtDelta(finservProfitCurr, finservProfitPrev, comparisonBasis);
        return d ? <span style={{ color: d.positive ? '#3de89a' : '#ff6b7a' }}>{d.label}</span> : <span style={{ color: NA_COLOR }}>—</span>;
      })(),
    },
  ];

  const kpiById = useMemo(() => {
    const m = new Map<string, KpiTile>();
    kpiRegistry.forEach(k => m.set(k.id, k));
    return m;
  }, [kpiRegistry]);

  const auditRows = useMemo(() => ([
    {
      widget: 'Revenue',
      dataSource: 'quickbooks_invoices',
      queryParams: `txn_date in ${formatRangeLabel(periodRange)} (client-filtered live query)`,
      reportingPeriod: periodLabel,
      state: qbConnected ? 'live-query-cached-recomputed' : 'truthful-empty',
      recomputesOnPeriodChange: true,
    },
    {
      widget: 'Operating Profit',
      dataSource: 'qbo_pnl_snapshots.net_operating_income',
      queryParams: `Accrual P&L period ${formatRangeLabel(periodRange)}; compare ${formatRangeLabel(previousRange)}; all entities consolidated`,
      reportingPeriod: periodLabel,
      state: pnlConnected ? 'live-pnl-snapshot-consolidated' : 'truthful-empty',
      recomputesOnPeriodChange: true,
    },
    {
      widget: 'Outstanding A/R',
      dataSource: 'quickbooks_invoices balances',
      queryParams: isCurrentReportingPeriod ? 'current receivables snapshot' : 'no historical A/R snapshot source',
      reportingPeriod: periodLabel,
      state: isCurrentReportingPeriod ? 'live-snapshot' : 'truthful-empty',
      recomputesOnPeriodChange: true,
    },
    {
      widget: 'Active Pipeline Value / Active Pipeline by Stage',
      dataSource: 'deals current snapshot',
      queryParams: isCurrentReportingPeriod ? 'current live pipeline snapshot' : 'no historical pipeline snapshot source',
      reportingPeriod: periodLabel,
      state: isCurrentReportingPeriod ? 'live-snapshot' : 'truthful-empty',
      recomputesOnPeriodChange: true,
    },
    {
      widget: 'TTM Revenue',
      dataSource: 'quickbooks_invoices (all entities)',
      queryParams: `txn_date in ${formatRangeLabel(ttmRange)}`,
      reportingPeriod: periodLabel,
      state: qbConnected ? 'live-query-cached-recomputed' : 'truthful-empty',
      recomputesOnPeriodChange: true,
    },
    {
      widget: 'TTM Revenue Trend chart',
      dataSource: 'quickbooks_invoices (all entities)',
      queryParams: chartMode === 'quarter'
        ? `rolling 12-mo windows for each month in ${formatRangeLabel(periodRange)}`
        : `rolling 12-mo windows for 12 months ending ${format(periodRange.end, 'yyyy-MM-dd')}`,
      reportingPeriod: periodLabel,
      state: qbConnected ? 'live-query-cached-recomputed' : 'truthful-empty',
      recomputesOnPeriodChange: true,
    },
    {
      widget: 'YTD Revenue',
      dataSource: 'quickbooks_invoices',
      queryParams: `txn_date in ${formatRangeLabel(ytdRange)}`,
      reportingPeriod: periodLabel,
      state: qbConnected ? 'live-query-cached-recomputed' : 'truthful-empty',
      recomputesOnPeriodChange: true,
    },
    {
      widget: 'Bank Account Balances / Liabilities / DSCR / Cashflow / Debt Rating',
      dataSource: 'none',
      queryParams: 'no live source wired',
      reportingPeriod: periodLabel,
      state: 'truthful-empty',
      recomputesOnPeriodChange: true,
    },
    {
      widget: 'Asana Goals & Portfolios',
      dataSource: 'Asana live integration',
      queryParams: 'operational widget; not reporting-period-scoped',
      reportingPeriod: periodLabel,
      state: 'live-nonfinancial',
      recomputesOnPeriodChange: true,
    },
  ]), [chartMode, isCurrentReportingPeriod, periodLabel, periodRange, previousRange, qbConnected, pnlConnected, ytdRange, ttmRange]);

  useEffect(() => {
    console.groupCollapsed(`[Insights period audit] ${periodLabel}`);
    console.table(auditRows);
    console.groupEnd();
  }, [auditRows, periodLabel]);

  return (
    <div style={{ background: 'transparent', color: '#c8e8ff', fontFamily: 'system-ui, sans-serif', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="flex items-center justify-end">
        <DashboardPlansGear dashboardKey="management-review" />
      </div>
      {isEditMode && isLayoutEditor && (
        <div className="flex items-center gap-2 px-1">
          <span className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Layout edit mode — drag titles to move, drag corners to resize
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" onClick={handleCancelLayout}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
            <Button size="sm" onClick={handleSaveLayout}>
              <Save className="h-3.5 w-3.5 mr-1" /> Save Layout
            </Button>
          </div>
        </div>
      )}

      {isSharedGridLayoutLoaded ? (
      <DraggableGridLayout
        layout={layout}
        onLayoutChange={saveLayout}
        onLatestLayoutRef={handleGridLatestLayoutRef}
        isEditMode={isEditMode && isLayoutEditor}
        rowHeight={70}
        draggableHandle=".widget-drag-handle"
        draggableCancel=".react-resizable-handle"
        compactType={null}
        preventCollision
        saveImmediatelyOnInteractionEnd={false}
      >
        <div key="kpi-summary" data-grid-item-id="kpi-summary" className="h-full">
          <GridShell isEditMode={isEditMode} title="Key Stats">
            {(() => {
              const priorByReg: Record<string, number | null> = {
                'total-revenue-curr': totalRevPrev,
                'operating-profit-curr': opProfitPrev,
                'outstanding-ar': null,
                'active-pipeline-value': null,
                'ttm-revenue': priorTtmRevenue,
                'ytd-revenue': priorYtdRevenue,
                'debt-solutions-revenue': debtRevPrev,
                'debt-solutions-profit': debtProfitPrev,
                'finserv-revenue': finservRevPrev,
                'finserv-profit': finservProfitPrev,
              };
              const currByReg: Record<string, number | null> = {
                'total-revenue-curr': totalRevCurr,
                'operating-profit-curr': opProfitCurr,
                'outstanding-ar': totalAR,
                'active-pipeline-value': activePipelineValue,
                'ttm-revenue': ttmRevenue,
                'ytd-revenue': ytdRevenue,
                'debt-solutions-revenue': debtRevCurr,
                'debt-solutions-profit': debtProfitCurr,
                'finserv-revenue': finservRevCurr,
                'finserv-profit': finservProfitCurr,
              };
              const handleRowClick = (reg: string, k: KpiTile) => {
                if (isEditMode || !k.live) return;
                const explainer = KPI_DESCRIPTIONS[reg];
                const initialGran: 'monthly' | 'quarterly' = isQuarterView ? 'quarterly' : 'monthly';
                const basis = isQuarterView ? 'quarter' : 'month';
                const commonCtx = {
                  sourceId: `kpi:${reg}`,
                  sourceLabel: k.l,
                  selection: k.v,
                  periodLabel,
                };

                // Aggregators over QuickBooks data
                const sumInvoices = (r: DateRange, realmId?: string) => sumAmountInRange(
                  realmId ? qbInvoices.filter((row: any) => row.realm_id === realmId) : qbInvoices,
                  r, inv => inv.txn_date, inv => inv.total_amt,
                );
                const sumExpenses = (r: DateRange, realmId?: string) => sumAmountInRange(
                  realmId ? qbExpenses.filter((row: any) => row.realm_id === realmId) : qbExpenses,
                  r, exp => exp.txn_date, exp => exp.total_amt,
                );
                const revenueEntities = [
                  { id: 'debt', label: 'Debt Advisory', compute: (r: DateRange) => sumInvoices(r, KEY_STATS_DEBT_REALM_ID) },
                  { id: 'finserv', label: 'FinServ', compute: (r: DateRange) => sumInvoices(r, KEY_STATS_FINSERV_REALM_ID) },
                  { id: 'other', label: 'Other entities', compute: (r: DateRange) => {
                    const total = sumInvoices(r);
                    const debt = sumInvoices(r, KEY_STATS_DEBT_REALM_ID);
                    const fs = sumInvoices(r, KEY_STATS_FINSERV_REALM_ID);
                    return total - debt - fs;
                  } },
                ];
                const profitEntities = [
                  { id: 'debt', label: 'Debt Advisory', compute: (r: DateRange) => getPnlSnapshotTotal(r, KEY_STATS_DEBT_REALM_ID) ?? 0 },
                  { id: 'finserv', label: 'FinServ', compute: (r: DateRange) => getPnlSnapshotTotal(r, KEY_STATS_FINSERV_REALM_ID) ?? 0 },
                  { id: 'other', label: 'Other entities', compute: (r: DateRange) => {
                    const total = getPnlSnapshotTotal(r) ?? 0;
                    const debt = getPnlSnapshotTotal(r, KEY_STATS_DEBT_REALM_ID) ?? 0;
                    const fs = getPnlSnapshotTotal(r, KEY_STATS_FINSERV_REALM_ID) ?? 0;
                    return total - debt - fs;
                  } },
                ];

                const openStat = (opts: {
                  compute: (r: DateRange) => number;
                  anchorEnd: Date;
                  currentRange: DateRange;
                  priorRange: DateRange;
                  entities?: Array<{ id: string; label: string; compute: (r: DateRange) => number }>;
                  filters?: Array<{ label: string; value: string }>;
                  comparisonBasisLabel?: string;
                }) => {
                  setDrilldown({
                    context: { ...commonCtx, filters: opts.filters },
                    columns: [],
                    rows: [],
                    body: (
                      <StatDrilldownBody
                        label={k.l}
                        explainer={explainer}
                        compute={opts.compute}
                        currentRange={opts.currentRange}
                        priorRange={opts.priorRange}
                        anchorEnd={opts.anchorEnd}
                        entities={opts.entities}
                        formatValue={(v) => fmtUSD(v)}
                        initialGranularity={initialGran}
                        comparisonBasisLabel={opts.comparisonBasisLabel ?? basis}
                      />
                    ),
                  });
                };

                if (reg === 'total-revenue-curr') {
                  return openStat({
                    compute: (r) => sumInvoices(r),
                    anchorEnd: periodRange.end,
                    currentRange: periodRange,
                    priorRange: previousRange,
                    entities: revenueEntities,
                    filters: [{ label: 'Source', value: 'QuickBooks invoices · all entities' }],
                  });
                }
                if (reg === 'operating-profit-curr') {
                  return openStat({
                    compute: (r) => getPnlSnapshotTotal(r) ?? 0,
                    anchorEnd: periodRange.end,
                    currentRange: periodRange,
                    priorRange: previousRange,
                    entities: profitEntities,
                    filters: [{ label: 'Source', value: 'QuickBooks Accrual P&L · Net Operating Income · all entities' }],
                  });
                }
                if (reg === 'debt-solutions-revenue') {
                  return openStat({
                    compute: (r) => sumInvoices(r, KEY_STATS_DEBT_REALM_ID),
                    anchorEnd: periodRange.end,
                    currentRange: periodRange,
                    priorRange: previousRange,
                    filters: [{ label: 'Entity', value: 'QuickBooks · Debt Advisory' }],
                  });
                }
                if (reg === 'debt-solutions-profit') {
                  return openStat({
                    compute: (r) => getPnlSnapshotTotal(r, KEY_STATS_DEBT_REALM_ID) ?? 0,
                    anchorEnd: periodRange.end,
                    currentRange: periodRange,
                    priorRange: previousRange,
                    filters: [{ label: 'Entity', value: 'QuickBooks Accrual P&L · Debt Advisory' }],
                  });
                }
                if (reg === 'finserv-revenue') {
                  return openStat({
                    compute: (r) => sumInvoices(r, KEY_STATS_FINSERV_REALM_ID),
                    anchorEnd: periodRange.end,
                    currentRange: periodRange,
                    priorRange: previousRange,
                    filters: [{ label: 'Entity', value: 'QuickBooks · FinServ' }],
                  });
                }
                if (reg === 'finserv-profit') {
                  return openStat({
                    compute: (r) => getPnlSnapshotTotal(r, KEY_STATS_FINSERV_REALM_ID) ?? 0,
                    anchorEnd: periodRange.end,
                    currentRange: periodRange,
                    priorRange: previousRange,
                    filters: [{ label: 'Entity', value: 'QuickBooks Accrual P&L · FinServ' }],
                  });
                }
                if (reg === 'ttm-revenue') {
                  setDrilldown({
                    context: {
                      ...commonCtx,
                      filters: [
                        { label: 'Window', value: `${format(ttmRange.start, 'MMM d, yyyy')} – ${format(ttmRange.end, 'MMM d, yyyy')}` },
                        { label: 'Source', value: 'QuickBooks invoices · all entities' },
                      ],
                    },
                    columns: [],
                    rows: [],
                    body: <TtmRevenueDrilldownBody invoices={qbInvoices as any} ttmRange={ttmRange} />,
                  });
                  return;
                }
                if (reg === 'ytd-revenue') {
                  return openStat({
                    compute: (r) => sumInvoices(r),
                    anchorEnd: ytdRange.end,
                    currentRange: ytdRange,
                    priorRange: priorYtdRange,
                    entities: revenueEntities,
                    comparisonBasisLabel: 'YTD',
                    filters: [{ label: 'Source', value: 'QuickBooks invoices · YTD, all entities' }],
                  });
                }
                if (reg === 'outstanding-ar') {
                  setDrilldown({
                    context: { ...commonCtx, filters: [{ label: 'Snapshot source', value: 'Current open invoice balances' }] },
                    columns: [
                      { key: 'bucket', label: 'Aging bucket' },
                      { key: 'value', label: 'Outstanding', align: 'right', render: (r) => fmtUSD(Number(r.value || 0)) },
                    ],
                    rows: arBuckets,
                    emptyHint: arUnavailableReason,
                  });
                  return;
                }
                if (reg === 'active-pipeline-value') {
                  setDrilldown({
                    context: { ...commonCtx, filters: [{ label: 'Snapshot source', value: 'Live active pipeline' }] },
                    columns: [
                      { key: 'company', label: 'Deal' },
                      { key: 'stage', label: 'Stage' },
                      { key: 'value', label: 'Value', align: 'right', render: (r) => fmtUSD(Number(r.value || 0)) },
                    ],
                    rows: activeDeals,
                    emptyHint: pipelineUnavailableReason,
                  });
                  return;
                }

                // Fallback (non-live stats and anything else)
                setDrilldown({
                  context: commonCtx,
                  columns: [
                    { key: 'metric', label: 'Metric' },
                    { key: 'value', label: 'Value', align: 'right' },
                  ],
                  rows: [{ metric: k.l, value: k.v }],
                  emptyHint: k.emptyHint,
                });
              };
              const thStyle: React.CSSProperties = {
                padding: '6px 10px', color: 'rgba(255,255,255,0.55)', fontWeight: 700,
                fontSize: 9, letterSpacing: '1px', textTransform: 'uppercase',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
              };
              const tdBase: React.CSSProperties = {
                padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)',
                fontSize: 12,
              };
              return (
                <div style={{ height: '100%', overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '40%' }} />
                      <col style={{ width: '20%' }} />
                      <col style={{ width: '20%' }} />
                      <col style={{ width: '20%' }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, textAlign: 'left' }}>Metric</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Current</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>$ Change</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>% Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {KPI_SUMMARY_ROWS.map(({ id, registryId }) => {
                        const k = kpiById.get(registryId);
                        if (!k) return null;
                        const sectionHeader =
                          registryId === 'liq-operating'
                            ? 'Liquidity'
                            : registryId === 'debt-solutions-revenue'
                            ? 'Debt Advisory'
                            : registryId === 'finserv-revenue'
                            ? 'FinServ'
                            : null;
                        const curr = currByReg[registryId];
                        const prior = priorByReg[registryId];
                        const hasDelta = k.live && curr !== null && prior !== null;
                        const delta = hasDelta ? (curr as number) - (prior as number) : null;
                        const pct = hasDelta && (prior as number) !== 0
                          ? ((delta as number) / Math.abs(prior as number)) * 100
                          : null;
                        const positive = (delta ?? 0) >= 0;
                        const deltaColor = delta === null ? NA_COLOR : positive ? '#3de89a' : '#ff6b7a';
                        const sign = delta === null ? '' : positive ? '+' : '−';
                        const clickable = !isEditMode && k.live;
                        return (
                          <React.Fragment key={id}>
                            {sectionHeader && (
                              <tr>
                                <td
                                  colSpan={4}
                                  style={{
                                    padding: '10px 8px 4px',
                                    fontSize: 10,
                                    fontWeight: 700,
                                    letterSpacing: '1.2px',
                                    textTransform: 'uppercase',
                                    color: 'rgba(255,255,255,0.55)',
                                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                                  }}
                                >
                                  {sectionHeader}
                                </td>
                              </tr>
                            )}
                          <tr
                            onClick={() => handleRowClick(registryId, k)}
                            style={{ cursor: clickable ? 'pointer' : 'default' }}
                          >
                            <td style={{ ...tdBase, color: '#e8f6ff', fontWeight: 500 }}>
                              <span title={KPI_DESCRIPTIONS[registryId] || k.l} style={{ cursor: 'help' }}>{k.l}</span>
                              {!k.live && k.emptyHint && (
                                <div style={{ fontSize: 10, color: NA_COLOR, marginTop: 2, fontWeight: 400 }}>
                                  {k.emptyHint}
                                </div>
                              )}
                            </td>
                            <td style={{ ...tdBase, textAlign: 'right', color: k.live ? '#e8f6ff' : NA_COLOR, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                              {k.live ? k.v : (k.v && k.v !== '$0' ? k.v : 'Unavailable')}
                            </td>
                            <td style={{ ...tdBase, textAlign: 'right', color: deltaColor, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                              {delta === null ? '—' : `${sign}${fmtUSD(Math.abs(delta))}`}
                            </td>
                            <td style={{ ...tdBase, textAlign: 'right', color: deltaColor, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                              {pct === null ? '—' : `${sign}${Math.abs(pct).toFixed(1)}%`}
                            </td>
                          </tr>
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </GridShell>
        </div>

        <div key="monthly-revenue" data-grid-item-id="monthly-revenue" className="h-full">
          <GridShell
            isEditMode={isEditMode}
            title={
              trendMode === 'ttm'
                ? 'TTM Revenue'
                : trendMode === 'monthly'
                ? (isQuarterView ? 'Quarterly Revenue Trend' : 'Monthly Revenue Trend')
                : 'Quarterly Revenue Growth (YoY)'
            }
            titleTooltip={
              trendMode === 'ttm'
                ? 'TTM Revenue (rolling 12 months) — each point shows total revenue for the 12 months ending in that period; all QuickBooks entities combined'
                : trendMode === 'monthly'
                ? (isQuarterView
                    ? 'Quarterly Revenue — each bar shows total revenue for that calendar quarter across all QuickBooks entities'
                    : 'Monthly Revenue — each bar shows total revenue for that calendar month across all QuickBooks entities')
                : undefined
            }
            headerExtra={
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {showTrendDelta && trendMode !== 'quarterly-yoy' && (() => {
                  const vals = trendMode === 'ttm' ? ttmTrendValues : monthlyTrendValues;
                  const labels = trendMode === 'ttm' ? ttmLabels : monthlyTrendLabels;
                  if (!vals || vals.length < 2) return null;
                  return (
                    <RangeTrendDelta
                      fromLabel={labels[0]}
                      toLabel={labels[labels.length - 1]}
                      fromValue={vals[0]}
                      toValue={vals[vals.length - 1]}
                      polarity="higher-is-better"
                    />
                  );
                })()}
                {trendMode !== 'quarterly-yoy' && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowTrendDelta(v => !v); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    title="Toggle period-over-period change line ($ and %)"
                    style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase',
                      padding: '3px 9px', borderRadius: 999, cursor: 'pointer',
                      border: '1px solid ' + (showTrendDelta ? 'hsl(38, 92%, 62%)' : 'rgba(255,255,255,0.12)'),
                      color: showTrendDelta ? 'hsl(38, 92%, 62%)' : 'rgba(255,255,255,0.75)',
                      background: showTrendDelta ? 'hsla(38, 92%, 62%, 0.12)' : 'rgba(255,255,255,0.05)',
                    }}
                  >
                    Δ Trend
                  </button>
                )}
                <div style={{ display: 'inline-flex', padding: 2, borderRadius: 999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                {(['ttm', 'monthly', 'quarterly-yoy'] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setTrendMode(m); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase',
                      padding: '3px 9px', borderRadius: 999, border: 'none', cursor: 'pointer',
                      color: trendMode === m ? 'hsl(228,22%,14%)' : 'rgba(255,255,255,0.75)',
                      background: trendMode === m ? 'linear-gradient(180deg, hsl(213,90%,75%), hsl(213,90%,70%))' : 'transparent',
                    }}
                  >
                    {m === 'ttm' ? 'TTM' : m === 'monthly' ? (isQuarterView ? 'Quarterly' : 'Monthly') : 'Quarterly Growth'}
                  </button>
                ))}
                </div>
              </div>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
              {trendMode !== 'quarterly-yoy' && (() => {
                const vals = trendMode === 'ttm' ? ttmTrendValues : monthlyTrendValues;
                const labels = trendMode === 'ttm' ? ttmLabels : monthlyTrendLabels;
                if (!vals || vals.length === 0) return null;
                const last = vals[vals.length - 1] ?? null;
                const prev = vals.length >= 2 ? vals[vals.length - 2] : null;
                return (
                  <PeriodReadout
                    label={labels[labels.length - 1]}
                    value={last}
                    previous={prev}
                    polarity="higher-is-better"
                    loading={isLoading}
                  />
                );
              })()}
              {trendMode === 'quarterly-yoy' ? (
                <div style={{ flex: 1, minHeight: 180, display: 'flex' }}><QuarterlyRevenueGrowthCard bare /></div>
              ) : qbConnected && (trendMode === 'ttm' ? ttmLabels.length > 0 : monthlyTrendLabels.length > 0)
                ? <div style={{ position: 'relative', flex: 1, minHeight: 180 }}><canvas ref={ncRef} /></div>
                : <NaPlaceholder height={200} label={isLoading ? 'Loading…' : 'Revenue unavailable — connect QuickBooks to populate finance data.'} />}
            </div>
          </GridShell>
        </div>


        <div key="active-deals-list" data-grid-item-id="active-deals-list" className="h-full">
          <GridShell isEditMode={isEditMode} title="Debt Pipeline">
            <TooltipProvider>
              <div style={{ height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(() => {
                  const leftMetrics = [
                    "Next 3 Months' Revenue",
                    "Next 3 Months' Profit",
                    'Client Signings',
                    'Deals Closing',
                    'Dollars Funding',
                  ];
                  const rightMetrics = [
                    'Deal Count',
                    'Dollar Volume',
                    'Potential Revenue',
                    'Active Revenue',
                  ];
                  const rows = Math.max(leftMetrics.length, rightMetrics.length);
                  const labelStyle: React.CSSProperties = { padding: '6px 8px', color: 'rgba(255,255,255,0.55)', fontWeight: 700, fontSize: 9, letterSpacing: '1px', textTransform: 'uppercase', whiteSpace: 'nowrap' };
                  const valueStyle: React.CSSProperties = { padding: '6px 8px', color: 'hsl(0,0%,100%)', fontWeight: 600, textAlign: 'right' };
                  return (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <tbody>
                        {Array.from({ length: rows }).map((_, i) => (
                          <tr key={i} style={{ borderBottom: i === rows - 1 ? 'none' : '1px solid rgba(255,255,255,0.04)' }}>
                            <td style={labelStyle}>{leftMetrics[i] ?? ''}</td>
                            <td style={valueStyle}>{leftMetrics[i] ? '—' : ''}</td>
                            <td style={{ ...labelStyle, borderLeft: '1px solid rgba(255,255,255,0.08)' }}>{rightMetrics[i] ?? ''}</td>
                            <td style={valueStyle}>{rightMetrics[i] ? '—' : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
                {activeDealsList.length === 0 ? (
                  <NaPlaceholder height={140} label="No active deals in Final Credit through In Due Diligence." />
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <th style={{ textAlign: 'left', padding: '6px 8px', color: 'rgba(255,255,255,0.55)', fontWeight: 700, fontSize: 9, letterSpacing: '1px', textTransform: 'uppercase' }}>Deal Name</th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', color: 'rgba(255,255,255,0.55)', fontWeight: 700, fontSize: 9, letterSpacing: '1px', textTransform: 'uppercase' }}>Closing Fee $</th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', color: 'rgba(255,255,255,0.55)', fontWeight: 700, fontSize: 9, letterSpacing: '1px', textTransform: 'uppercase' }}>Expected Close Month</th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', color: 'rgba(255,255,255,0.55)', fontWeight: 700, fontSize: 9, letterSpacing: '1px', textTransform: 'uppercase' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeDealsList.map((d: any) => {
                        const sd = statusDisplay(d.status);
                        const note = debtPipelineStatusNotes[d.id] || 'No status note yet';
                        return (
                          <tr key={d.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                            <td style={{ padding: '6px 8px', color: '#e8f6ff', fontWeight: 500 }}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => setOpenDealId(String(d.id))}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      padding: 0,
                                      margin: 0,
                                      font: 'inherit',
                                      color: '#e8f6ff',
                                      cursor: 'pointer',
                                      textAlign: 'left',
                                      textDecoration: 'underline',
                                      textDecorationColor: 'rgba(255,255,255,0.25)',
                                      textUnderlineOffset: 3,
                                    }}
                                  >
                                    {d.company}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[280px] whitespace-normal break-words text-[12px] font-normal leading-snug normal-case tracking-normal text-left">{note}</TooltipContent>
                              </Tooltip>
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: 'hsl(0,0%,100%)' }}>{(() => {
                              const closing = computeClosingFee(d.value, d.success_fee_percent, d.milestone_fee);
                              return closing > 0 ? fmtUSD(closing) : '—';
                            })()}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: 'hsl(0,0%,100%)' }}>{formatCloseMonth(resolveDealCloseDate(d))}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: sd?.color ?? 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span style={{ cursor: 'help' }}>{sd?.label ?? '—'}</span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[280px] whitespace-normal break-words text-[12px] font-normal leading-snug normal-case tracking-normal text-left">{note}</TooltipContent>
                              </Tooltip>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                <div style={{ marginTop: 4 }}>
                  <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 9, letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 700, padding: '4px 8px' }}>
                    Revenue by Month · Next 6 Months
                  </div>
                  <div style={{ position: 'relative', height: 140 }}>
                    <canvas ref={debtPipelineChartRef} />
                  </div>
                </div>
              </div>
            </TooltipProvider>
          </GridShell>
        </div>

        <div key="liabilities" data-grid-item-id="liabilities" className="h-full">
          <GridShell isEditMode={isEditMode} title="Liabilities & Debt Service">
            <div className="flex h-full flex-col gap-4">
              <div className="grid grid-cols-1 gap-x-4 gap-y-4 lg:grid-cols-2">
                <div className="min-w-0">
                  <LiabilitiesDebtServiceTable
                    onOpenDrilldown={(row) => {
                      setDrilldown({
                        context: {
                          sourceId: `liabilities:${row.name}`,
                          sourceLabel: `${row.name} · Liabilities & Debt Service`,
                          selection: row.name,
                          periodLabel,
                          filters: [
                            { label: 'Source', value: row.qbo
                                ? `QuickBooks · ${row.qbo.accountName}`
                                : `QuickBooks · Credit Cards (aggregate)` },
                            { label: 'Reporting period', value: periodLabel },
                          ],
                        },
                        columns: [],
                        rows: [],
                        body: <LiabilityHistoryDrilldownBody row={row} />,
                      });
                    }}
                  />
                </div>
                <div className="min-w-0 min-h-[240px]">
                  <DebtByRatingWidget />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-x-4 gap-y-4 border-t border-border pt-4 lg:grid-cols-2 flex-1 min-h-0">
                <div className="min-w-0 flex flex-col min-h-[220px]">
                  <div className="mb-2 text-xs font-medium text-muted-foreground">TTM DSCR</div>
                  <div className="flex-1 min-h-0">
                    <TtmDscrChart />
                  </div>
                </div>
                <div className="min-w-0 flex flex-col min-h-[220px]">
                  <div className="mb-2 text-xs font-medium text-muted-foreground">Monthly Debt Payments</div>
                  <div className="flex-1 min-h-0">
                    <MonthlyDebtPaymentsChart />
                  </div>
                </div>
              </div>
            </div>
          </GridShell>
        </div>
        <div key="cashflow-12w" data-grid-item-id="cashflow-12w" className="h-full">
          <GridShell isEditMode={isEditMode} title="12-Week Cashflow Forecast">
            <CashflowForecastWidget />
          </GridShell>
        </div>
        <div key="finserv-next3" data-grid-item-id="finserv-next3" className="h-full">
          <GridShell isEditMode={isEditMode} title="FinServ: Next 3 Months">
            <div className="flex h-full flex-col">
              <div className="flex flex-col divide-y divide-border">
                {[
                  "Next 3 Months' Revenue",
                  "Next 3 Months' Profit",
                  'Operating Cashflow',
                  'Client Signings',
                  'Current Run Rate',
                ].map((label) => (
                  <div key={label} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium text-foreground">—</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex-1 min-h-[160px]">
                <div className="mb-1 text-xs font-medium text-muted-foreground">
                  Next 3 Months' Revenue & Profit
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={(() => {
                      const now = new Date();
                      return Array.from({ length: 3 }, (_, i) => {
                        const d = new Date(now.getFullYear(), now.getMonth() + 1 + i, 1);
                        return {
                          month: d.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
                          revenue: 0,
                          profit: 0,
                        };
                      });
                    })()}
                    margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: number) =>
                        v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
                      }
                    />
                    <RTooltip
                      formatter={(v: number, n: string) => [`$${Number(v).toLocaleString()}`, n]}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="profit" name="Profit" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </GridShell>
        </div>
        <div key="opex" data-grid-item-id="opex" className="h-full">
          <GridShell
            isEditMode={isEditMode}
            title="OPEX"
            titleTooltip="Total for Expenses — Consolidated View, all QBO entities"
          >
            <ConsolidatedOpexWidget />
          </GridShell>
        </div>
        <div key="cashflow-ops" data-grid-item-id="cashflow-ops" className="h-full">
          <GridShell
            isEditMode={isEditMode}
            title="CashFlow"
            titleTooltip="Operating Cash Flow — Consolidated View, all QBO entities"
          >
            <ConsolidatedCashflowWidget />
          </GridShell>
        </div>
      </DraggableGridLayout>
      ) : (
        <div className="flex min-h-[480px] items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading shared layout…
        </div>
      )}

      <InsightsDrilldownDrawer
        open={!!drilldown}
        onClose={closeDrilldown}
        context={drilldown?.context ?? null}
        columns={drilldown?.columns ?? []}
        rows={drilldown?.rows ?? []}
        emptyHint={drilldown?.emptyHint}
        trend={drilldown?.trend}
        body={drilldown?.body}
      />

      <NaitiveDealOverlay
        deal={openDealId ? ({ id: openDealId, company: 'Deal' } as unknown as Deal) : null}
        orderedDeals={[]}
        stages={[]}
        onClose={() => setOpenDealId(null)}
        onNavigate={(d) => setOpenDealId(d.id)}
        onStageChange={() => { /* stage changes handled inside embedded deal detail */ }}
      />
    </div>
  );
}
