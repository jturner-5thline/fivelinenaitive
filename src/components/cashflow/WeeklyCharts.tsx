import { useEffect, useRef, memo } from 'react';
import { Chart, registerables } from 'chart.js';
import type { WeeklyData, ThemeMode } from './types';

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

  useEffect(() => {
    const canvas1 = chart1Ref.current;
    const canvas2 = chart2Ref.current;
    if (!canvas1 || !canvas2) return;

    // Destroy existing
    chart1Instance.current?.destroy();
    chart2Instance.current?.destroy();

    const entries = Object.entries(weeklyData).sort(([a], [b]) => a.localeCompare(b));
    const labels = entries.map(([, v]) => {
      const d = new Date(v.week_ending);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const endingCash = entries.map(([, v]) => (v["ENDING CASH"] as number) / 1000);
    const totalLiquidity = entries.map(([, v]) => (v["TOTAL CASH ON HAND"] as number) / 1000);
    const cashIn = entries.map(([, v]) => ((v["TOTAL RECEIPTS"] as number) || 0) / 1000);
    const cashOut = entries.map(([, v]) => ((v["TOTAL DISBURSEMENTS"] as number) || 0) / 1000);

    const isDark = theme === 'dark';
    const gridColor = isDark ? 'rgba(42,51,72,0.5)' : 'rgba(209,213,219,0.5)';
    const textColor = isDark ? '#8892a8' : '#5a6070';

    // Chart 1: Cash Balance & Liquidity
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
            pointRadius: 3,
          },
          {
            label: 'Ending Cash',
            data: endingCash,
            borderColor: isDark ? '#22c55e' : '#16a34a',
            backgroundColor: isDark ? 'rgba(34,197,94,0.1)' : 'rgba(22,163,74,0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 3,
          },
          {
            label: 'Min Liquidity $250K',
            data: new Array(labels.length).fill(250),
            borderColor: isDark ? '#f59e0b' : '#d97706',
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false,
          },
          {
            label: 'Caution $100K',
            data: new Array(labels.length).fill(100),
            borderColor: isDark ? '#5a6580' : '#9ca3af',
            borderDash: [3, 3],
            pointRadius: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 10 }, color: textColor, boxWidth: 12 } },
          tooltip: {
            callbacks: { label: (ctx) => `${ctx.dataset.label}: $${ctx.parsed.y.toFixed(0)}K` },
          },
        },
        scales: {
          x: { grid: { color: gridColor }, ticks: { font: { size: 9 }, color: textColor } },
          y: {
            grid: { color: gridColor },
            ticks: {
              font: { size: 9 },
              color: textColor,
              callback: (v) => `$${Number(v) >= 1000 ? (Number(v)/1000).toFixed(0) + 'M' : v + 'K'}`,
            },
          },
        },
      },
    });

    // Chart 2: Cash In vs Cash Out
    chart2Instance.current = new Chart(chart2Ref.current, {
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
            pointRadius: 3,
          },
          {
            label: 'Cash Out',
            data: cashOut,
            borderColor: isDark ? '#ef4444' : '#dc2626',
            backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : 'rgba(220,38,38,0.15)',
            fill: true,
            tension: 0.3,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 10 }, color: textColor, boxWidth: 12 } },
          tooltip: {
            callbacks: { label: (ctx) => `${ctx.dataset.label}: $${ctx.parsed.y.toFixed(1)}K` },
          },
        },
        scales: {
          x: { grid: { color: gridColor }, ticks: { font: { size: 9 }, color: textColor } },
          y: {
            grid: { color: gridColor },
            ticks: {
              font: { size: 9 },
              color: textColor,
              callback: (v) => `$${v}K`,
            },
          },
        },
      },
    });

    return () => {
      chart1Instance.current?.destroy();
      chart2Instance.current?.destroy();
    };
  }, [weeklyData, theme]);

  return (
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
  );
});
