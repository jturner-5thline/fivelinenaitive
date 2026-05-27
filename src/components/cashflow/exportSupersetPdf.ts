import jsPDF from 'jspdf';
import { Chart, registerables } from 'chart.js';
import type { WeeklyData, ExportFlag } from './types';
import { fmtShort } from './formatters';
import {
  buildExportRows,
  computeVisibleWeeks,
  renderCashFlowReport,
  CF_POSITIVE_HEX,
  CF_NEGATIVE_HEX,
  hexToRgb,
} from './ExportModal';

Chart.register(...registerables);

export interface SupersetKpis {
  cashIn: number;
  cashOut: number;
  netChange: number;
  kpiRangeLabel?: string;
  peakCash: { value: number; weekEnding: string; weekKey: string } | null;
  lowCash: { value: number; weekEnding: string; weekKey: string } | null;
}

export interface SupersetFilters {
  years: string[];
  quarters: string[];
  entities: string[];
  categories: string[];
  comparison?: string;
  timeRange?: string;
  cashInNext8WLabel?: string;
}

export interface SupersetExportOptions {
  title: string;
  flags?: ExportFlag[];
  notes?: string;
  weeklyData: WeeklyData;
  weeksPast: number;
  weeksFuture: number;
  customReceiptRows: string[];
  customDisbursementRows: string[];
  kpis: SupersetKpis;
  filters: SupersetFilters;
  /** Week keys (sorted) of the visible cash-flow window. */
  visibleWeekKeys: string[];
}

function fmtWeekOf(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d.getTime())) return '';
  return `Week of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function fmtRangeSubtitle(weeks: [string, any][]): string {
  if (weeks.length === 0) return '';
  const start = new Date(weeks[0][0] + 'T00:00:00');
  const end = new Date((weeks[weeks.length - 1][1].week_ending as string) + 'T00:00:00');
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)} (${weeks.length} week${weeks.length === 1 ? '' : 's'})`;
}

/**
 * Render a light-themed Chart.js chart into an off-screen canvas and return
 * a PNG data URL. Caller is responsible for destroying nothing — we clean up.
 */
function renderChartToDataUrl(
  buildConfig: () => any,
  width = 1100,
  height = 460,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  // Off-screen positioning so layout never sees it.
  canvas.style.position = 'fixed';
  canvas.style.left = '-99999px';
  canvas.style.top = '0';
  canvas.style.background = '#ffffff';
  document.body.appendChild(canvas);
  let dataUrl = '';
  try {
    const chart = new Chart(canvas, buildConfig());
    chart.update('none');
    dataUrl = chart.toBase64Image('image/png', 1.0);
    chart.destroy();
  } finally {
    document.body.removeChild(canvas);
  }
  return dataUrl;
}

function buildLiquidityConfig(
  weeks: [string, any][],
  peakWeekKey: string | null,
  lowWeekKey: string | null,
): any {
  const labels = weeks.map(([, v]) =>
    new Date(v.week_ending).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  );
  const endingCash = weeks.map(([, v]) => (v['ENDING CASH'] as number) / 1000);
  const totalLiquidity = weeks.map(([, v]) => (v['TOTAL CASH ON HAND'] as number) / 1000);
  const keys = weeks.map(([k]) => k);
  const peakIdx = peakWeekKey ? keys.indexOf(peakWeekKey) : -1;
  const lowIdx = lowWeekKey ? keys.indexOf(lowWeekKey) : -1;
  const peakPoints = peakIdx >= 0 ? labels.map((_, i) => (i === peakIdx ? endingCash[i] : null)) : [];
  const lowPoints = lowIdx >= 0 ? labels.map((_, i) => (i === lowIdx ? endingCash[i] : null)) : [];
  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Total Liquidity', data: totalLiquidity, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.1)', fill: true, tension: 0.3, borderWidth: 1.5, pointRadius: 3 },
        { label: 'Ending Cash', data: endingCash, borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,0.1)', fill: true, tension: 0.3, borderWidth: 1.5, pointRadius: 3 },
        { label: 'Min Liquidity $250K', data: new Array(labels.length).fill(250), borderColor: '#d97706', borderDash: [5, 5], borderWidth: 1.5, pointRadius: 0, fill: false },
        { label: 'Caution $100K', data: new Array(labels.length).fill(100), borderColor: '#9ca3af', borderDash: [3, 3], borderWidth: 1.5, pointRadius: 0, fill: false },
        ...(peakIdx >= 0 ? [{ label: 'Peak Cash', data: peakPoints, borderColor: '#16a34a', backgroundColor: '#16a34a', pointStyle: 'triangle', pointRadius: 9, pointBorderWidth: 2, pointBorderColor: '#ffffff', showLine: false, fill: false }] : []),
        ...(lowIdx >= 0 ? [{ label: 'Low Cash', data: lowPoints, borderColor: '#dc2626', backgroundColor: '#dc2626', pointStyle: 'triangle', pointRotation: 180, pointRadius: 9, pointBorderWidth: 2, pointBorderColor: '#ffffff', showLine: false, fill: false }] : []),
      ],
    },
    options: {
      responsive: false,
      animation: false,
      devicePixelRatio: 2,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, color: '#475569', boxWidth: 28, useLineStyle: true } },
        title: { display: true, text: 'Cash Balance & Liquidity', font: { size: 14, weight: 'bold' }, color: '#0f172a' },
      },
      scales: {
        x: { grid: { color: 'rgba(209,213,219,0.6)' }, ticks: { color: '#475569', font: { size: 10 } }, title: { display: true, text: 'Week Ending', color: '#475569', font: { size: 11 } } },
        y: { grid: { color: 'rgba(209,213,219,0.6)' }, ticks: { color: '#475569', font: { size: 10 }, callback: (v: any) => `$${Number(v) >= 1000 ? (Number(v) / 1000).toFixed(0) + 'M' : v + 'K'}` }, title: { display: true, text: 'Amount', color: '#475569', font: { size: 11 } } },
      },
    },
  };
}

function buildFlowConfig(weeks: [string, any][]): any {
  const labels = weeks.map(([, v]) =>
    new Date(v.week_ending).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  );
  const cashIn = weeks.map(([, v]) => ((v['TOTAL RECEIPTS'] as number) || 0) / 1000);
  const cashOut = weeks.map(([, v]) => ((v['TOTAL DISBURSEMENTS'] as number) || 0) / 1000);
  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Cash Out', data: cashOut, borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,0.1)', fill: true, tension: 0.3, borderWidth: 1.5, pointRadius: 3 },
        { label: 'Cash In', data: cashIn, borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,0.2)', fill: true, tension: 0.3, borderWidth: 2, pointRadius: 3 },
      ],
    },
    options: {
      responsive: false,
      animation: false,
      devicePixelRatio: 2,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, color: '#475569', boxWidth: 28, useLineStyle: true } },
        title: { display: true, text: 'Cash In vs Cash Out', font: { size: 14, weight: 'bold' }, color: '#0f172a' },
      },
      scales: {
        x: { grid: { color: 'rgba(209,213,219,0.6)' }, ticks: { color: '#475569', font: { size: 10 } }, title: { display: true, text: 'Week Ending', color: '#475569', font: { size: 11 } } },
        y: { grid: { color: 'rgba(209,213,219,0.6)' }, ticks: { color: '#475569', font: { size: 10 }, callback: (v: any) => `$${v}K` }, title: { display: true, text: 'Amount', color: '#475569', font: { size: 11 } } },
      },
    },
  };
}

/**
 * Generate the SUPERSET cash-flow PDF: prefixed KPI row + filters line + two
 * charts (light mode), then the standard weekly cash-flow table (with the
 * same disbursement coloring/parens formatting and week-date headers as the
 * existing in-table Export PDF — reused via renderCashFlowReport).
 */
export async function generateSupersetCashFlowPdf(opts: SupersetExportOptions): Promise<void> {
  const {
    title, flags = [], notes = '',
    weeklyData, weeksPast, weeksFuture,
    customReceiptRows, customDisbursementRows,
    kpis, filters, visibleWeekKeys,
  } = opts;

  const weeks = computeVisibleWeeks(weeklyData, weeksPast, weeksFuture);
  const exportRows = buildExportRows(customReceiptRows, customDisbursementRows);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 40;

  // --- Title + generated stamp (light, dark text) ---
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, pageH, 'F');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(title, M, 40);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  const rangeSubtitle = fmtRangeSubtitle(weeks);
  doc.text(
    `Generated: ${new Date().toLocaleString()} | ${rangeSubtitle} (Past ${weeksPast} / Future ${weeksFuture})`,
    M, 58,
  );

  // --- KPI summary row ---
  const kpiY = 78;
  const kpiH = 60;
  const cardGap = 10;
  const kpiCount = 5;
  const cardW = (pageW - M * 2 - cardGap * (kpiCount - 1)) / kpiCount;
  const kpiCards: Array<{
    label: string; value: string; valueHex: string; subtitle: string;
  }> = [
    {
      label: 'Cash In',
      value: fmtShort(kpis.cashIn),
      valueHex: CF_POSITIVE_HEX,
      subtitle: rangeSubtitle,
    },
    {
      label: 'Cash Out',
      value: `-${fmtShort(Math.abs(kpis.cashOut))}`,
      valueHex: CF_NEGATIVE_HEX,
      subtitle: rangeSubtitle,
    },
    {
      label: 'Net Change',
      value: fmtShort(kpis.netChange),
      valueHex: kpis.netChange >= 0 ? CF_POSITIVE_HEX : CF_NEGATIVE_HEX,
      subtitle: rangeSubtitle,
    },
    {
      label: 'Peak Cash',
      value: kpis.peakCash ? fmtShort(kpis.peakCash.value) : '—',
      valueHex: CF_POSITIVE_HEX,
      subtitle: kpis.peakCash ? fmtWeekOf(kpis.peakCash.weekEnding) : '',
    },
    {
      label: 'Low Cash',
      value: kpis.lowCash ? fmtShort(kpis.lowCash.value) : '—',
      valueHex: kpis.lowCash && kpis.lowCash.value < 100_000 ? CF_NEGATIVE_HEX : '#475569',
      subtitle: kpis.lowCash ? fmtWeekOf(kpis.lowCash.weekEnding) : '',
    },
  ];
  kpiCards.forEach((card, i) => {
    const x = M + i * (cardW + cardGap);
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, kpiY, cardW, kpiH, 4, 4, 'FD');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(card.label.toUpperCase(), x + 8, kpiY + 14);
    doc.setFontSize(15);
    const [r, g, b] = hexToRgb(card.valueHex);
    doc.setTextColor(r, g, b);
    doc.text(card.value, x + 8, kpiY + 34);
    if (card.subtitle) {
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(card.subtitle, x + 8, kpiY + 50);
    }
  });

  // --- Filters line ---
  const filtersY = kpiY + kpiH + 18;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const segs: string[] = [];
  const fOrAll = (arr: string[]) => (arr.length > 0 ? arr.join(', ') : 'All');
  segs.push(`Year: ${fOrAll(filters.years)}`);
  segs.push(`Quarter: ${fOrAll(filters.quarters)}`);
  segs.push(`Entity: ${fOrAll(filters.entities)}`);
  segs.push(`Category: ${fOrAll(filters.categories)}`);
  if (filters.comparison) segs.push(`Comparison: ${filters.comparison}`);
  if (filters.timeRange) segs.push(`Range: ${filters.timeRange}`);
  if (filters.cashInNext8WLabel) segs.push(`Cash-In Next 8W: ${filters.cashInNext8WLabel}`);
  doc.text(`Active Filters — ${segs.join('  |  ')}`, M, filtersY);

  // --- Charts (side-by-side) ---
  const chartsY = filtersY + 12;
  const chartGap = 14;
  const chartW = (pageW - M * 2 - chartGap) / 2;
  const chartH = 230;
  let liquidityUrl = '';
  let flowUrl = '';
  try {
    liquidityUrl = renderChartToDataUrl(
      () => buildLiquidityConfig(weeks, kpis.peakCash?.weekKey ?? null, kpis.lowCash?.weekKey ?? null),
      1100, 460,
    );
    flowUrl = renderChartToDataUrl(() => buildFlowConfig(weeks), 1100, 460);
  } catch (e) {
    console.error('Chart render for PDF failed', e);
  }
  if (liquidityUrl) {
    doc.addImage(liquidityUrl, 'PNG', M, chartsY, chartW, chartH, undefined, 'FAST');
  }
  if (flowUrl) {
    doc.addImage(flowUrl, 'PNG', M + chartW + chartGap, chartsY, chartW, chartH, undefined, 'FAST');
  }

  // --- Page break before the table so it lives on its own page ---
  doc.addPage();

  // --- Existing weekly table (reuses the same renderer as Export PDF) ---
  renderCashFlowReport(doc, {
    title,
    flags,
    notes,
    weeks,
    weeksPast,
    weeksFuture,
    exportRows,
    drawHeader: true,
    drawFooter: true,
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  doc.save(`Advisory_CashFlow_Report_Superset_${stamp}.pdf`);

  // Silence unused-var lint for visibleWeekKeys (kept for API symmetry with caller).
  void visibleWeekKeys;
}