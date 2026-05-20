import { useEffect, useRef, memo, useMemo, useState, useCallback } from 'react';
import { Chart, registerables } from 'chart.js';
import type { WeeklyData, ThemeMode } from './types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Maximize2 } from 'lucide-react';

Chart.register(...registerables);

interface WeeklyChartsProps {
  weeklyData: WeeklyData;
  theme: ThemeMode;
  visibleWeekKeys?: string[];
  peakWeekKey?: string | null;
  lowWeekKey?: string | null;
  lowWeekBelowCaution?: boolean;
}

export const WeeklyCharts = memo(function WeeklyCharts({
  weeklyData, theme, visibleWeekKeys,
  peakWeekKey = null, lowWeekKey = null,
}: WeeklyChartsProps) {
  const [expanded, setExpanded] = useState<null | 'liquidity' | 'flow'>(null);

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

  const { labels, endingCash, totalLiquidity, cashIn, cashOut, peakIdx, lowIdx } = chartData;
  const isDark = theme === 'dark';
  const gridColor = isDark ? 'rgba(42,51,72,0.5)' : 'rgba(209,213,219,0.5)';
  const textColor = isDark ? '#8892a8' : '#5a6070';

  const peakPoints: (number | null)[] =
    peakIdx >= 0 ? labels.map((_, i) => (i === peakIdx ? endingCash[i] : null)) : [];
  const lowPoints: (number | null)[] =
    lowIdx >= 0 ? labels.map((_, i) => (i === lowIdx ? endingCash[i] : null)) : [];

  const commonOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    resizeDelay: 300,
    animation: false as const,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: { font: { size: 10 }, color: textColor, boxWidth: 28, boxHeight: 0, useLineStyle: true },
      },
    },
    scales: {
      x: {
        grid: { color: gridColor },
        ticks: {
          font: { size: 9 },
          color: textColor,
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
  }), [gridColor, textColor, labels.length]);

  const buildLiquidityConfig = useCallback(() => ({
    type: 'line' as const,
    data: {
      labels,
      datasets: [
        {
          label: 'Total Liquidity', data: totalLiquidity,
          borderColor: isDark ? '#4a90d9' : '#2563eb',
          backgroundColor: isDark ? 'rgba(74,144,217,0.1)' : 'rgba(37,99,235,0.1)',
          fill: true, tension: 0.3, borderWidth: 1.5, pointRadius: labels.length > 50 ? 0 : 3,
        },
        {
          label: 'Ending Cash', data: endingCash,
          borderColor: isDark ? '#22c55e' : '#16a34a',
          backgroundColor: isDark ? 'rgba(34,197,94,0.1)' : 'rgba(22,163,74,0.1)',
          fill: true, tension: 0.3, borderWidth: 1.5, pointRadius: labels.length > 50 ? 0 : 3,
        },
        {
          label: 'Min Liquidity $250K', data: new Array(labels.length).fill(250),
          borderColor: isDark ? '#f59e0b' : '#d97706',
          borderDash: [5, 5], borderWidth: 1.5, pointRadius: 0, fill: false,
        },
        {
          label: 'Caution $100K', data: new Array(labels.length).fill(100),
          borderColor: isDark ? '#5a6580' : '#9ca3af',
          borderDash: [3, 3], borderWidth: 1.5, pointRadius: 0, fill: false,
        },
        ...(peakIdx >= 0 ? [{
          label: 'Peak Cash', data: peakPoints,
          borderColor: isDark ? '#22c55e' : '#16a34a',
          backgroundColor: isDark ? '#22c55e' : '#16a34a',
          pointStyle: 'triangle' as const, pointRadius: 9, pointHoverRadius: 11,
          pointBorderWidth: 2, pointBorderColor: isDark ? '#0b1020' : '#ffffff',
          showLine: false, fill: false,
        }] : []),
        ...(lowIdx >= 0 ? [{
          label: 'Low Cash', data: lowPoints,
          borderColor: isDark ? '#ef4444' : '#dc2626',
          backgroundColor: isDark ? '#ef4444' : '#dc2626',
          pointStyle: 'triangle' as const, pointRotation: 180,
          pointRadius: 9, pointHoverRadius: 11,
          pointBorderWidth: 2, pointBorderColor: isDark ? '#0b1020' : '#ffffff',
          showLine: false, fill: false,
        }] : []),
      ],
    },
    options: {
      ...commonOptions,
      plugins: {
        ...commonOptions.plugins,
        tooltip: { callbacks: { label: (ctx: any) => `${ctx.dataset.label}: $${ctx.parsed.y.toFixed(0)}K` } },
      },
    },
  }), [labels, totalLiquidity, endingCash, peakPoints, lowPoints, peakIdx, lowIdx, isDark, commonOptions]);

  const buildFlowConfig = useCallback(() => ({
    type: 'line' as const,
    data: {
      labels,
      datasets: [
        {
          label: 'Cash Out', data: cashOut,
          borderColor: isDark ? '#ef4444' : '#dc2626',
          backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : 'rgba(220,38,38,0.08)',
          fill: true, tension: 0.3, borderWidth: 1,
          pointRadius: labels.length > 50 ? 0 : 3, order: 2,
        },
        {
          label: 'Cash In', data: cashIn,
          borderColor: isDark ? '#22c55e' : '#16a34a',
          backgroundColor: isDark ? 'rgba(34,197,94,0.92)' : 'rgba(22,163,74,0.92)',
          fill: true, tension: 0.3, borderWidth: 2,
          pointRadius: labels.length > 50 ? 0 : 3, order: 1,
        },
      ],
    },
    options: {
      ...commonOptions,
      plugins: {
        ...commonOptions.plugins,
        tooltip: { callbacks: { label: (ctx: any) => `${ctx.dataset.label}: $${ctx.parsed.y.toFixed(1)}K` } },
      },
      scales: {
        ...commonOptions.scales,
        y: {
          ...commonOptions.scales.y,
          ticks: { ...commonOptions.scales.y.ticks, callback: (v: any) => `$${v}K` },
        },
      },
    },
  }), [labels, cashIn, cashOut, isDark, commonOptions]);

  // Per-canvas instance tracking. Callback refs guarantee we destroy each
  // chart *before* React detaches its canvas — otherwise Chart.js's
  // ResizeObserver fires on a detached node and crashes with
  // "Cannot read properties of null (reading 'ownerDocument')".
  const instances = useRef<Map<HTMLCanvasElement, Chart>>(new Map());

  const versionKey = useMemo(
    () => `${labels.length}|${theme}|${peakIdx}|${lowIdx}|${labels[0] ?? ''}|${labels[labels.length - 1] ?? ''}`,
    [labels, theme, peakIdx, lowIdx],
  );

  const attach = useCallback((canvas: HTMLCanvasElement | null, build: () => any) => {
    if (!canvas) return;
    if (!canvas.ownerDocument || !canvas.isConnected) return;
    const existing = instances.current.get(canvas);
    if (existing) {
      try { existing.destroy(); } catch { /* no-op */ }
      instances.current.delete(canvas);
    }
    try {
      instances.current.set(canvas, new Chart(canvas, build()));
    } catch { /* no-op */ }
  }, []);

  // Rebuild all currently-mounted charts when versionKey/builders change.
  useEffect(() => {
    instances.current.forEach((chart, canvas) => {
      try { chart.destroy(); } catch { /* no-op */ }
      if (!canvas.isConnected || !canvas.ownerDocument) {
        instances.current.delete(canvas);
        return;
      }
      const kind = canvas.dataset.chartKind;
      const build = kind === 'flow' ? buildFlowConfig : buildLiquidityConfig;
      try {
        instances.current.set(canvas, new Chart(canvas, build()));
      } catch { /* no-op */ }
    });
  }, [versionKey, buildFlowConfig, buildLiquidityConfig]);

  // Destroy all on unmount.
  useEffect(() => () => {
    instances.current.forEach((c) => { try { c.destroy(); } catch { /* no-op */ } });
    instances.current.clear();
  }, []);

  const makeCallbackRef = (build: () => any) => (canvas: HTMLCanvasElement | null) => {
    if (canvas) {
      attach(canvas, build);
    }
    // React 18 calls the same ref with `null` on unmount of *that* element,
    // but we can't distinguish which canvas it was; the per-canvas Map and
    // the unmount-cleanup effect handle disposal collectively.
  };

  // Stable refs that survive re-renders so React doesn't thrash attach/detach.
  const liquidityRef = useRef(makeCallbackRef(buildLiquidityConfig));
  const flowRef = useRef(makeCallbackRef(buildFlowConfig));
  const modalLiquidityRef = useRef(makeCallbackRef(buildLiquidityConfig));
  const modalFlowRef = useRef(makeCallbackRef(buildFlowConfig));
  // Refresh closures when builders change.
  liquidityRef.current = makeCallbackRef(buildLiquidityConfig);
  flowRef.current = makeCallbackRef(buildFlowConfig);
  modalLiquidityRef.current = makeCallbackRef(buildLiquidityConfig);
  modalFlowRef.current = makeCallbackRef(buildFlowConfig);

  // When dialog closes, destroy any modal-canvas charts immediately so the
  // canvas can be unmounted safely.
  useEffect(() => {
    if (expanded !== null) return;
    instances.current.forEach((chart, canvas) => {
      if (canvas.dataset.chartScope === 'modal') {
        try { chart.destroy(); } catch { /* no-op */ }
        instances.current.delete(canvas);
      }
    });
  }, [expanded]);

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
            <canvas data-chart-kind="liquidity" ref={(c) => liquidityRef.current(c)} />
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
            <canvas data-chart-kind="flow" ref={(c) => flowRef.current(c)} />
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
              <canvas
                data-chart-kind="liquidity"
                data-chart-scope="modal"
                ref={(c) => modalLiquidityRef.current(c)}
              />
            )}
            {expanded === 'flow' && (
              <canvas
                data-chart-kind="flow"
                data-chart-scope="modal"
                ref={(c) => modalFlowRef.current(c)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});
