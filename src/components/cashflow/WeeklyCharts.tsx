import { useEffect, useRef, memo, useMemo } from 'react';
import { Chart, registerables } from 'chart.js';
import type { WeeklyData, ThemeMode } from './types';

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
  /** When true, the low marker is rendered with a pulsing radius to draw attention. */
  lowWeekBelowCaution?: boolean;
}

export const WeeklyCharts = memo(function WeeklyCharts({
  weeklyData, theme, visibleWeekKeys,
  peakWeekKey = null, lowWeekKey = null, lowWeekBelowCaution = false,
}: WeeklyChartsProps) {
  const chart1Ref = useRef<HTMLCanvasElement>(null);
  const chart2Ref = useRef<HTMLCanvasElement>(null);
  const chart1Instance = useRef<Chart | null>(null);
  const chart2Instance = useRef<Chart | null>(null);
  const pulseFrame = useRef<number | null>(null);

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
    const canvas1 = chart1Ref.current;
    const canvas2 = chart2Ref.current;
    if (!canvas1 || !canvas2) return;

    chart1Instance.current?.destroy();
    chart2Instance.current?.destroy();

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

    chart1Instance.current = new Chart(canvas1, {
      type: 'line',
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

    chart2Instance.current = new Chart(canvas2, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Cash Out',
            data: cashOut,
            borderColor: isDark ? '#ef4444' : '#dc2626',
            backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : 'rgba(220,38,38,0.15)',
            fill: true,
            tension: 0.3,
            borderWidth: 1.5,
            pointRadius: labels.length > 50 ? 0 : 3,
            order: 2,
          },
          {
            label: 'Cash In',
            data: cashIn,
            borderColor: isDark ? '#22c55e' : '#16a34a',
            backgroundColor: isDark ? 'rgba(34,197,94,0.5)' : 'rgba(22,163,74,0.5)',
            fill: true,
            tension: 0.3,
            borderWidth: 1.5,
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

    // Pulse the Low Cash marker when it's below the caution threshold so the
    // user's eye is drawn to the at-risk week. We mutate the dataset's
    // pointRadius/pointHoverRadius on each animation frame and re-render
    // without animation transitions (cheap on a single point).
    if (lowWeekBelowCaution && chartData.lowIdx >= 0) {
      const chart = chart1Instance.current!;
      const lowDsIdx = chart.data.datasets.findIndex((d: any) => d.label === 'Low Cash');
      if (lowDsIdx >= 0) {
        const start = performance.now();
        const tick = (now: number) => {
          const t = (now - start) / 1000;
          // 9px → 14px sine pulse at ~1.4Hz
          const r = 9 + (Math.sin(t * Math.PI * 1.4) + 1) * 2.5;
          const ds: any = chart.data.datasets[lowDsIdx];
          ds.pointRadius = r;
          ds.pointHoverRadius = r + 2;
          chart.update('none');
          pulseFrame.current = requestAnimationFrame(tick);
        };
        pulseFrame.current = requestAnimationFrame(tick);
      }
    }

    return () => {
      if (pulseFrame.current !== null) {
        cancelAnimationFrame(pulseFrame.current);
        pulseFrame.current = null;
      }
      chart1Instance.current?.destroy();
      chart2Instance.current?.destroy();
    };
  }, [chartData, theme, lowWeekBelowCaution]);

  return (
    <>
      <div className="cf-charts-row">
        <div className="cf-chart-card">
          <div className="cf-chart-title">Cash Balance & Liquidity</div>
          <div style={{ height: 200 }}>
            <canvas ref={chart1Ref} />
          </div>
        </div>
        <div className="cf-chart-card">
          <div className="cf-chart-title">Cash In vs Cash Out</div>
          <div style={{ height: 200 }}>
            <canvas ref={chart2Ref} />
          </div>
        </div>
      </div>
    </>
  );
});
