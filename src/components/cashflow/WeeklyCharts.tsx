import { useEffect, useRef, memo, useMemo } from 'react';
import { Chart, registerables } from 'chart.js';
import type { WeeklyData, ThemeMode } from './types';
import { LAST_HISTORICAL_WEEK_ENDING } from './weeklyHistoricalSeed';

Chart.register(...registerables);

interface WeeklyChartsProps {
  weeklyData: WeeklyData;
  theme: ThemeMode;
}

export const WeeklyCharts = memo(function WeeklyCharts({ weeklyData, theme }: WeeklyChartsProps) {
  const chart1Ref = useRef<HTMLCanvasElement>(null);
  const chart2Ref = useRef<HTMLCanvasElement>(null);
  const chart1Instance = useRef<Chart | null>(null);
  const chart2Instance = useRef<Chart | null>(null);

  // Memoize chart data to avoid recalculation
  const chartData = useMemo(() => {
    const entries = Object.entries(weeklyData || {}).sort(([a], [b]) => a.localeCompare(b));
    return {
      labels: entries.map(([, v]) => {
        const d = new Date(v.week_ending);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }),
      endingCash: entries.map(([, v]) => (v["ENDING CASH"] as number) / 1000),
      totalLiquidity: entries.map(([, v]) => (v["TOTAL CASH ON HAND"] as number) / 1000),
      cashIn: entries.map(([, v]) => ((v["TOTAL RECEIPTS"] as number) || 0) / 1000),
      cashOut: entries.map(([, v]) => ((v["TOTAL DISBURSEMENTS"] as number) || 0) / 1000),
    };
  }, [weeklyData]);

  useEffect(() => {
    const canvas1 = chart1Ref.current;
    const canvas2 = chart2Ref.current;
    if (!canvas1 || !canvas2) return;

    chart1Instance.current?.destroy();
    chart2Instance.current?.destroy();

    const { labels, endingCash, totalLiquidity, cashIn, cashOut } = chartData;

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
        x: { grid: { color: gridColor }, ticks: { font: { size: 9 }, color: textColor, maxTicksLimit: 20 } },
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
            label: 'Cash In',
            data: cashIn,
            borderColor: isDark ? '#22c55e' : '#16a34a',
            backgroundColor: isDark ? 'rgba(34,197,94,0.15)' : 'rgba(22,163,74,0.15)',
            fill: true,
            tension: 0.3,
            borderWidth: 1.5,
            pointRadius: labels.length > 50 ? 0 : 3,
          },
          {
            label: 'Cash Out',
            data: cashOut,
            borderColor: isDark ? '#ef4444' : '#dc2626',
            backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : 'rgba(220,38,38,0.15)',
            fill: true,
            tension: 0.3,
            borderWidth: 1.5,
            pointRadius: labels.length > 50 ? 0 : 3,
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

    // Chart 3 — Projected Ending Cash (roll-forward from configured rows)
    chart3Instance.current = new Chart(canvas3, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Actual Ending Cash',
            data: actualEndingCash,
            borderColor: isDark ? '#22c55e' : '#16a34a',
            backgroundColor: isDark ? 'rgba(34,197,94,0.1)' : 'rgba(22,163,74,0.1)',
            fill: true,
            tension: 0.25,
            spanGaps: false,
            borderWidth: 1.5,
            pointRadius: labels.length > 50 ? 0 : 2,
          },
          {
            label: 'Projected Ending Cash',
            data: projectedEndingCash,
            borderColor: isDark ? '#a78bfa' : '#7c3aed',
            backgroundColor: isDark ? 'rgba(167,139,250,0.12)' : 'rgba(124,58,237,0.10)',
            borderDash: [6, 4],
            fill: true,
            tension: 0.25,
            spanGaps: false,
            borderWidth: 1.5,
            pointRadius: labels.length > 50 ? 0 : 2,
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
        ],
      },
      options: {
        ...commonOptions,
        plugins: {
          ...commonOptions.plugins,
          tooltip: {
            callbacks: {
              label: (ctx) =>
                ctx.parsed.y == null
                  ? ''
                  : `${ctx.dataset.label}: $${ctx.parsed.y.toFixed(0)}K`,
            },
          },
        },
      },
    });

    return () => {
      chart1Instance.current?.destroy();
      chart2Instance.current?.destroy();
      chart3Instance.current?.destroy();
    };
  }, [chartData, theme]);

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
      <div className="cf-charts-row">
        <div className="cf-chart-card" style={{ flex: 1 }}>
          <div className="cf-chart-title">
            Projected Ending Cash
            <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.7, marginLeft: 8 }}>
              Roll-forward from beginning cash using configured weekly net cash
            </span>
          </div>
          <div style={{ height: 220 }}>
            <canvas ref={chart3Ref} />
          </div>
        </div>
      </div>
    </>
  );
});
