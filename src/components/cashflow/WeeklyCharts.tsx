import { useEffect, useRef, memo, useMemo, useState, useCallback } from 'react';
import { Chart, registerables } from 'chart.js';
import type { WeeklyData, ThemeMode } from './types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Maximize2 } from 'lucide-react';

Chart.register(...registerables);

interface WeeklyChartsProps {
  weeklyData: WeeklyData;
  theme: ThemeMode;
  /**
   * Optional set of week keys (entries of weeklyData) that should be plotted.
   * When provided, the chart x-axis is restricted to exactly this window so it
   * stays in lockstep with the Weekly Report table. When omitted/empty, all
   * weeks in weeklyData are plotted (legacy behavior).
   */
  visibleWeekKeys?: string[];
  /** Week key (entry of weeklyData) of the peak Ending Cash in the visible window. */
  peakWeekKey?: string | null;
  /** Week key (entry of weeklyData) of the low Ending Cash in the visible window. */
  lowWeekKey?: string | null;
  /** Deprecated — pulsing animation is no longer used. Kept for prop back-compat. */
  lowWeekBelowCaution?: boolean;
}

export const WeeklyCharts = memo(function WeeklyCharts({
  weeklyData, theme, visibleWeekKeys,
  peakWeekKey = null, lowWeekKey = null,
}: WeeklyChartsProps) {
  const [expanded, setExpanded] = useState<null | 'liquidity' | 'flow'>(null);

  // Memoize chart data to avoid recalculation
  const chartData = useMemo(() => {
    const all = Object.entries(weeklyData || {}).sort(([a], [b]) => a.localeCompare(b));
    let entries = all;
    if (visibleWeekKeys && visibleWeekKeys.length > 0) {
      const allow = new Set(visibleWeekKeys);
      entries = all.filter(([k]) => allow.has(k));
    }
    const orderedKeys = entries.map(([k]) => k);
    const peakIdx = peakWeekKey ? orderedKeys.indexOf(peakWeekKey) : -1;
    const lowIdx = lowWeekKey ? orderedKeys.indexOf(lowWeekKey) : -1;
    return {
      labels: entries.map(([, v]) => {
        const d = new Date(v.week_ending);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }),
      endingCash: entries.map(([, v]) => (v["ENDING CASH"] as number) / 1000),
      totalLiquidity: entries.map(([, v]) => (v["TOTAL CASH ON HAND"] as number) / 1000),
      cashIn: entries.map(([, v]) => ((v["TOTAL RECEIPTS"] as number) || 0) / 1000),
      cashOut: entries.map(([, v]) => ((v["TOTAL DISBURSEMENTS"] as number) || 0) / 1000),
      peakIdx,
      lowIdx,
    };
  }, [weeklyData, visibleWeekKeys, peakWeekKey, lowWeekKey]);

  // Build the config builders + chart instance map. We use callback refs so
  // each chart is destroyed *synchronously* when its canvas is removed from
  // the DOM (e.g. when the expand Dialog closes). Otherwise Chart.js's
  // responsive resize listener can fire on a detached canvas and crash with
  // "Cannot read properties of null (reading 'ownerDocument')".
  const { labels, endingCash, totalLiquidity, cashIn, cashOut, peakIdx, lowIdx } = chartData;

    // Build sparse arrays so the peak/low markers render as a single point on
    // top of the Ending Cash line at exactly the right (week, value) coordinate.
    const peakPoints: (number | null)[] =
      peakIdx >= 0
        ? labels.map((_, i) => (i === peakIdx ? endingCash[i] : null))
        : [];
    const lowPoints: (number | null)[] =
      lowIdx >= 0
        ? labels.map((_, i) => (i === lowIdx ? endingCash[i] : null))
        : [];

    const isDark = theme === 'dark';
    const gridColor = isDark ? 'rgba(42,51,72,0.5)' : 'rgba(209,213,219,0.5)';
    const textColor = isDark ? '#8892a8' : '#5a6070';

  const isDark = theme === 'dark';
  const gridColor = isDark ? 'rgba(42,51,72,0.5)' : 'rgba(209,213,219,0.5)';
  const textColor = isDark ? '#8892a8' : '#5a6070';

  // Sparse arrays so peak/low markers sit on the Ending Cash line.
  const peakPoints: (number | null)[] =
    peakIdx >= 0 ? labels.map((_, i) => (i === peakIdx ? endingCash[i] : null)) : [];
  const lowPoints: (number | null)[] =
    lowIdx >= 0 ? labels.map((_, i) => (i === lowIdx ? endingCash[i] : null)) : [];

  const commonOptions = {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 300,
      animation: false as const,
      plugins: {
        legend: {
          position: 'bottom' as const,
          labels: {
            font: { size: 10 },
            color: textColor,
            boxWidth: 28,
            boxHeight: 0,
            useLineStyle: true,
          },
        },
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: {
            font: { size: 9 },
            color: textColor,
            // Auto-thin ticks based on window size: show all up to ~16, then taper
            maxTicksLimit: labels.length <= 16 ? labels.length : labels.length <= 32 ? 16 : 20,
            autoSkip: true,
          },
        },
        y: {
          grid: { color: gridColor },
          ticks: {
            font: { size: 9 },
            color: textColor,
            callback: (v: any) => `$${Number(v) >= 1000 ? (Number(v)/1000).toFixed(0) + 'M' : v + 'K'}`,
          },
        },
      },
    };

  const buildLiquidityConfig = () => ({
      type: 'line' as const,
      data: {
        labels,
        datasets: [
          {
            label: 'Total Liquidity',
            data: totalLiquidity,
            borderColor: isDark ? '#4a90d9' : '#2563eb',
            backgroundColor: isDark ? 'rgba(74,144,217,0.1)' : 'rgba(37,99,235,0.1)',
            fill: true,
            tension: 0.3,
            borderWidth: 1.5,
            pointRadius: labels.length > 50 ? 0 : 3,
          },
          {
            label: 'Ending Cash',
            data: endingCash,
            borderColor: isDark ? '#22c55e' : '#16a34a',
            backgroundColor: isDark ? 'rgba(34,197,94,0.1)' : 'rgba(22,163,74,0.1)',
            fill: true,
            tension: 0.3,
            borderWidth: 1.5,
            pointRadius: labels.length > 50 ? 0 : 3,
          },
          {
            label: 'Min Liquidity $250K',
            data: new Array(labels.length).fill(250),
            borderColor: isDark ? '#f59e0b' : '#d97706',
            borderDash: [5, 5],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
          },
          {
            label: 'Caution $100K',
            data: new Array(labels.length).fill(100),
            borderColor: isDark ? '#5a6580' : '#9ca3af',
            borderDash: [3, 3],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
          },
          ...(peakIdx >= 0
            ? [{
                label: 'Peak Cash',
                data: peakPoints,
                borderColor: isDark ? '#22c55e' : '#16a34a',
                backgroundColor: isDark ? '#22c55e' : '#16a34a',
                pointStyle: 'triangle' as const,
                pointRadius: 9,
                pointHoverRadius: 11,
                pointBorderWidth: 2,
                pointBorderColor: isDark ? '#0b1020' : '#ffffff',
                showLine: false,
                fill: false,
              }]
            : []),
          ...(lowIdx >= 0
            ? [{
                label: 'Low Cash',
                data: lowPoints,
                borderColor: isDark ? '#ef4444' : '#dc2626',
                backgroundColor: isDark ? '#ef4444' : '#dc2626',
                // Triangle rotated 180° = ▼
                pointStyle: 'triangle' as const,
                pointRotation: 180,
                pointRadius: 9,
                pointHoverRadius: 11,
                pointBorderWidth: 2,
                pointBorderColor: isDark ? '#0b1020' : '#ffffff',
                showLine: false,
                fill: false,
              }]
            : []),
        ],
      },
      options: {
        ...commonOptions,
        plugins: {
          ...commonOptions.plugins,
          tooltip: {
            callbacks: { label: (ctx) => `${ctx.dataset.label}: $${ctx.parsed.y.toFixed(0)}K` },
          },
        },
      },
    });

  const buildFlowConfig = () => ({
      type: 'line' as const,
      data: {
        labels,
        datasets: [
          {
            label: 'Cash Out',
            data: cashOut,
            borderColor: isDark ? '#ef4444' : '#dc2626',
            backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : 'rgba(220,38,38,0.08)',
            fill: true,
            tension: 0.3,
            borderWidth: 1,
            pointRadius: labels.length > 50 ? 0 : 3,
            order: 2,
          },
          {
            label: 'Cash In',
            data: cashIn,
            borderColor: isDark ? '#22c55e' : '#16a34a',
            backgroundColor: isDark ? 'rgba(34,197,94,0.92)' : 'rgba(22,163,74,0.92)',
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: labels.length > 50 ? 0 : 3,
            order: 1,
          },
        ],
      },
      options: {
        ...commonOptions,
        plugins: {
          ...commonOptions.plugins,
          tooltip: {
            callbacks: { label: (ctx) => `${ctx.dataset.label}: $${ctx.parsed.y.toFixed(1)}K` },
          },
        },
        scales: {
          ...commonOptions.scales,
          y: {
            ...commonOptions.scales.y,
            ticks: {
              ...commonOptions.scales.y.ticks,
              callback: (v: any) => `$${v}K`,
            },
          },
        },
      },
    });

  // Map of canvas element -> { chart, key } so we can detect when the data
  // changed and reinitialize, and destroy synchronously when the canvas
  // detaches.
  const chartsByCanvas = useRef<Map<HTMLCanvasElement, { chart: Chart; key: string }>>(new Map());

  // A version key changes whenever chart data/theme change, prompting
  // mounted canvases to rebuild their chart.
  const versionKey = useMemo(
    () => JSON.stringify({ l: labels.length, theme, peakIdx, lowIdx, first: labels[0], last: labels[labels.length - 1] }),
    [labels, theme, peakIdx, lowIdx],
  );

  const makeRef = useCallback(
    (build: () => any) => (canvas: HTMLCanvasElement | null) => {
      // Detach: destroy any existing chart for the previous canvas.
      if (!canvas) return;
      const existing = chartsByCanvas.current.get(canvas);
      if (existing && existing.key === versionKey) return; // already up to date
      if (existing) {
        try { existing.chart.destroy(); } catch { /* no-op */ }
        chartsByCanvas.current.delete(canvas);
      }
      // Guard: only create if canvas is actually attached to a document.
      if (!canvas.ownerDocument || !canvas.isConnected) return;
      try {
        const chart = new Chart(canvas, build());
        chartsByCanvas.current.set(canvas, { chart, key: versionKey });
      } catch {
        /* swallow init errors so finance page never crashes */
      }
    },
    [versionKey],
  );

  // Rebuild when versionKey changes for canvases that are still mounted.
  useEffect(() => {
    chartsByCanvas.current.forEach((entry, canvas) => {
      if (entry.key === versionKey) return;
      try { entry.chart.destroy(); } catch { /* no-op */ }
      chartsByCanvas.current.delete(canvas);
      if (canvas.isConnected && canvas.ownerDocument) {
        const build = canvas.dataset.chartKind === 'flow' ? buildFlowConfig : buildLiquidityConfig;
        try {
          const chart = new Chart(canvas, build());
          chartsByCanvas.current.set(canvas, { chart, key: versionKey });
        } catch { /* no-op */ }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionKey]);

  // Destroy all on unmount.
  useEffect(() => () => {
    chartsByCanvas.current.forEach((entry) => {
      try { entry.chart.destroy(); } catch { /* no-op */ }
    });
    chartsByCanvas.current.clear();
  }, []);

  const liquidityRef = useCallback(makeRef(buildLiquidityConfig), [makeRef]);
  const flowRef = useCallback(makeRef(buildFlowConfig), [makeRef]);

  // Cleanup ref for modal canvases — destroys synchronously on unmount.
  const cleanupRef = useCallback((canvas: HTMLCanvasElement | null) => {
    if (canvas) return;
    // When React calls cleanup on a callback ref, we get null. But we don't
    // know which canvas it was for here — the makeRef handles attach. The
    // shared unmount effect above destroys all on full unmount. For modal
    // canvases, we destroy them when `expanded` changes via the effect below.
  }, []);

  return (
    <>
      <div className="cf-charts-row">
        <div className="cf-chart-card">
          <div className="cf-chart-title flex items-center justify-between">
            <span>Cash Balance & Liquidity</span>
            <button
              type="button"
              onClick={() => setExpanded('liquidity')}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 -m-1 rounded"
              aria-label="Expand Cash Balance & Liquidity chart"
              title="Expand"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div style={{ height: 200 }}>
            <canvas ref={chart1Ref} />
          </div>
        </div>
        <div className="cf-chart-card">
          <div className="cf-chart-title flex items-center justify-between">
            <span>Cash In vs Cash Out</span>
            <button
              type="button"
              onClick={() => setExpanded('flow')}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 -m-1 rounded"
              aria-label="Expand Cash In vs Cash Out chart"
              title="Expand"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div style={{ height: 200 }}>
            <canvas ref={chart2Ref} />
          </div>
        </div>
      </div>
      <Dialog open={expanded !== null} onOpenChange={(o) => !o && setExpanded(null)}>
        <DialogContent className="max-w-[min(96vw,1400px)] w-[min(96vw,1400px)]">
          <DialogHeader>
            <DialogTitle>
              {expanded === 'liquidity' ? 'Cash Balance & Liquidity' : 'Cash In vs Cash Out'}
            </DialogTitle>
          </DialogHeader>
          <div style={{ height: 'min(70vh, 640px)' }} className="w-full">
            {expanded === 'liquidity' && (
              <canvas data-chart-kind="liquidity" ref={modalLiquidityRef} />
            )}
            {expanded === 'flow' && (
              <canvas data-chart-kind="flow" ref={modalFlowRef} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});
