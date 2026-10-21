import { useCashThresholds, thresholdLabel } from './cashThresholds';
import { useEffect, useRef, memo, useMemo, useState } from 'react';
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
  const chart1Ref = useRef<HTMLCanvasElement>(null);
  const chart2Ref = useRef<HTMLCanvasElement>(null);
  const chart1ModalRef = useRef<HTMLCanvasElement>(null);
  const chart2ModalRef = useRef<HTMLCanvasElement>(null);
  const chart1WrapRef = useRef<HTMLDivElement>(null);
  const chart2WrapRef = useRef<HTMLDivElement>(null);
  const chart1ModalWrapRef = useRef<HTMLDivElement>(null);
  const chart2ModalWrapRef = useRef<HTMLDivElement>(null);
  const instances = useRef<Chart[]>([]);
  const observers = useRef<ResizeObserver[]>([]);
  const [expanded, setExpanded] = useState<null | 'liquidity' | 'flow'>(null);
  const thresholds = useCashThresholds();

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

  useEffect(() => {
    instances.current.forEach((c) => c.destroy());
    instances.current = [];

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
    const textColor = isDark ? '#ffffff' : '#111827';

    // Vertical gradient fill fading from the line color to transparent.
    const gradient = (rgb: string, topAlpha: number) => (ctx: any) => {
      const { chart } = ctx;
      const area = chart?.chartArea;
      if (!area) return `rgba(${rgb},${topAlpha * 0.5})`;
      const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
      g.addColorStop(0, `rgba(${rgb},${topAlpha})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      return g;
    };
    const fmtK = (v: number) =>
      Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(2)}M` : `$${v.toFixed(1)}K`;
    const hoverRadius = labels.length > 50 ? 4 : 6;

    const commonOptions = {
      responsive: false,
      maintainAspectRatio: false,
      animation: { duration: 500, easing: 'easeOutQuart' as const },
      transitions: { active: { animation: { duration: 180 } } },
      interaction: { mode: 'index' as const, intersect: false },
      hover: { mode: 'index' as const, intersect: false },
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
        tooltip: {
          backgroundColor: isDark ? 'rgba(11,21,38,0.96)' : 'rgba(255,255,255,0.97)',
          borderColor: isDark ? '#1E2C46' : '#e5e7eb',
          borderWidth: 1,
          titleColor: isDark ? '#ffffff' : '#111827',
          bodyColor: isDark ? '#ffffff' : '#374151',
          titleFont: { size: 11, weight: 'bold' as const },
          bodyFont: { size: 11 },
          padding: 10,
          cornerRadius: 6,
          boxPadding: 4,
          usePointStyle: true,
          caretSize: 5,
          // Hide static threshold lines from the hover box.
          filter: (item: any) => !/^(Min Liquidity|Caution)/.test(item.dataset.label || '') && item.parsed?.y != null,
          callbacks: {
            title: (items: any[]) => (items[0] ? `Week ending ${items[0].label}` : ''),
            label: (ctx: any) => ` ${ctx.dataset.label}: ${fmtK(ctx.parsed.y)}`,
            labelPointStyle: () => ({ pointStyle: 'circle' as const, rotation: 0 }),
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
            backgroundColor: gradient(isDark ? '74,144,217' : '37,99,235', 0.28),
            pointHoverRadius: hoverRadius,
            fill: 'start' as const,
            tension: 0.3,
            borderWidth: 1.5,
            pointRadius: labels.length > 50 ? 0 : 3,
          },
          {
            label: 'Ending Cash',
            data: endingCash,
            borderColor: isDark ? '#34d399' : '#16a34a',
            backgroundColor: gradient(isDark ? '52,211,153' : '22,163,74', 0.26),
            pointHoverRadius: hoverRadius,
            fill: 'start' as const,
            tension: 0.3,
            borderWidth: 1.5,
            pointRadius: labels.length > 50 ? 0 : 3,
          },
          {
            label: `Min Liquidity ${thresholdLabel(thresholds.minLiquidity)}`,
            data: new Array(labels.length).fill(thresholds.minLiquidity / 1000),
            borderColor: isDark ? '#f59e0b' : '#d97706',
            borderDash: [5, 5],
            borderWidth: 1.5,
            pointRadius: 0,
            pointHoverRadius: 0,
            fill: false,
          },
          {
            label: `Caution ${thresholdLabel(thresholds.caution)}`,
            data: new Array(labels.length).fill(thresholds.caution / 1000),
            borderColor: isDark ? '#5a6580' : '#9ca3af',
            borderDash: [3, 3],
            borderWidth: 1.5,
            pointRadius: 0,
            pointHoverRadius: 0,
            fill: false,
          },
          ...(peakIdx >= 0
            ? [{
                label: 'Peak Cash',
                data: peakPoints,
                borderColor: isDark ? '#34d399' : '#16a34a',
                backgroundColor: isDark ? '#34d399' : '#16a34a',
                pointStyle: 'triangle' as const,
                pointRadius: 9,
                pointHoverRadius: 12,
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
                borderColor: isDark ? '#f87171' : '#dc2626',
                backgroundColor: isDark ? '#f87171' : '#dc2626',
                // Triangle rotated 180° = ▼
                pointStyle: 'triangle' as const,
                pointRotation: 180,
                pointRadius: 9,
                pointHoverRadius: 12,
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
            borderColor: isDark ? '#f87171' : '#dc2626',
            backgroundColor: gradient(isDark ? '248,113,113' : '220,38,38', 0.22),
            pointHoverRadius: hoverRadius,
            fill: 'start' as const,
            tension: 0.3,
            borderWidth: 1,
            pointRadius: labels.length > 50 ? 0 : 3,
            order: 2,
          },
          {
            label: 'Cash In',
            data: cashIn,
            borderColor: isDark ? '#34d399' : '#16a34a',
            backgroundColor: gradient(isDark ? '52,211,153' : '5,150,105', 0.28),
            pointHoverRadius: hoverRadius,
            fill: 'start' as const,
            tension: 0.3,
            borderWidth: 1.5,
            pointRadius: labels.length > 50 ? 0 : 3,
            order: 1,
          },
        ],
      },
      options: {
        ...commonOptions,
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

    const targets: Array<[HTMLCanvasElement | null, HTMLDivElement | null, () => any]> = [
      [chart1Ref.current, chart1WrapRef.current, buildLiquidityConfig],
      [chart2Ref.current, chart2WrapRef.current, buildFlowConfig],
      [expanded === 'liquidity' ? chart1ModalRef.current : null, chart1ModalWrapRef.current, buildLiquidityConfig],
      [expanded === 'flow' ? chart2ModalRef.current : null, chart2ModalWrapRef.current, buildFlowConfig],
    ];
    targets.forEach(([canvas, wrap, build]) => {
      if (!canvas || !wrap) return;
      if (!canvas.isConnected || !wrap.isConnected) return;
      let chart: Chart;
      try {
        chart = new Chart(canvas, build());
      } catch {
        return;
      }
      instances.current.push(chart);
      // Initial manual size to fill the wrapper (responsive:false disables auto).
      try { chart.resize(wrap.clientWidth, wrap.clientHeight); } catch { /* noop */ }
      // Manual, safe resize observer (bypasses Chart.js responsive code path
      // that crashes when the canvas's parent is detached during teardown).
      try {
        const ro = new ResizeObserver(() => {
          if (!wrap.isConnected || !canvas.isConnected) return;
          try {
            // Pass explicit parent dimensions so the canvas tracks the
            // wrapper width even when responsive:false. Without this, the
            // canvas keeps its initial intrinsic width and visually overflows
            // when the container shrinks (e.g. narrower Daily Rundown panel).
            chart.resize(wrap.clientWidth, wrap.clientHeight);
          } catch {
            /* swallow: chart may be torn down or detached */
          }
        });
        ro.observe(wrap);
        observers.current.push(ro);
      } catch {
        /* ResizeObserver unavailable */
      }
    });

    return () => {
      observers.current.forEach((o) => {
        try { o.disconnect(); } catch { /* noop */ }
      });
      observers.current = [];
      instances.current.forEach((c) => {
        try { c.destroy(); } catch { /* noop */ }
      });
      instances.current = [];
    };
  }, [chartData, theme, expanded, thresholds]);

  return (
    <>
      <div className="cf-charts-row">
        <div className="cf-chart-card">
          <div className="cf-chart-title flex items-center justify-between">
            <span className="text-foreground">Cash Balance & Liquidity</span>
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
          <div ref={chart1WrapRef} style={{ height: 220, position: 'relative' }}>
            <canvas ref={chart1Ref} style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>
        </div>
        <div className="cf-chart-card">
          <div className="cf-chart-title flex items-center justify-between">
            <span className="text-foreground">Cash In vs Cash Out</span>
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
          <div ref={chart2WrapRef} style={{ height: 220, position: 'relative' }}>
            <canvas ref={chart2Ref} style={{ width: '100%', height: '100%', display: 'block' }} />
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
          <div
            ref={expanded === 'liquidity' ? chart1ModalWrapRef : chart2ModalWrapRef}
            style={{ height: 'min(70vh, 640px)', position: 'relative' }}
            className="w-full"
          >
            {expanded === 'liquidity' && (
              <canvas ref={chart1ModalRef} style={{ width: '100%', height: '100%', display: 'block' }} />
            )}
            {expanded === 'flow' && (
              <canvas ref={chart2ModalRef} style={{ width: '100%', height: '100%', display: 'block' }} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});
