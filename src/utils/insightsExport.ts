import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format as fmtDate } from 'date-fns';
import type { DeltaResult } from '@/hooks/useInsightsComparison';
import { formatDeltaValue } from '@/hooks/useInsightsComparison';

/**
 * Insights export utilities.
 *
 * Every export reflects the user's active Reporting period: the period token
 * appears in the filename, the human-readable label appears in the document
 * title/header, and the included rows/series are bounded by the period's
 * `start` / `end` ISO dates.
 */

export interface InsightsExportContext {
  /** Sanitized token suitable for filenames, e.g. `2026-04` or `2026-Q2`. */
  periodToken: string;
  /** Human label, e.g. `Apr 2026` or `Q2 2026`. */
  periodLabel: string;
  /** Inclusive YYYY-MM-DD range. */
  start: string;
  end: string;
  /** `month` | `quarter` | `range` (when no Reporting Period is set). */
  granularity: 'month' | 'quarter' | 'range';
}

function sanitize(s: string) {
  return s.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export function buildInsightsFilename(ctx: InsightsExportContext, ext: 'csv' | 'pdf') {
  const stamp = fmtDate(new Date(), 'yyyyMMdd-HHmm');
  return `insights_${sanitize(ctx.periodToken)}_${stamp}.${ext}`;
}

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * CSV: a single document scoped to the active Reporting period.
 * Boundary metadata is encoded as comment-style header rows so importers
 * (Excel, Sheets) preserve provenance alongside the metric rows.
 */
export function exportInsightsCsv(ctx: InsightsExportContext, deltas: DeltaResult[]) {
  const lines: string[] = [];
  lines.push(`Insights Export`);
  lines.push(`Reporting Period,${escapeCsv(ctx.periodLabel)}`);
  lines.push(`Granularity,${escapeCsv(ctx.granularity)}`);
  lines.push(`Period Start,${escapeCsv(ctx.start)}`);
  lines.push(`Period End,${escapeCsv(ctx.end)}`);
  lines.push(`Generated,${escapeCsv(fmtDate(new Date(), 'yyyy-MM-dd HH:mm'))}`);
  lines.push('');
  lines.push(['Group','Metric','Current','Prev Period','Prev Year','Δ MoM','% MoM','Δ YoY','% YoY','Sentiment MoM']
    .map(escapeCsv).join(','));
  for (const d of deltas) {
    lines.push([
      d.group ?? '',
      d.label,
      formatDeltaValue(d.current, d.format),
      formatDeltaValue(d.prevPeriod, d.format),
      formatDeltaValue(d.prevYear, d.format),
      formatDeltaValue(d.changeMoM, d.format),
      d.pctMoM == null ? 'n/a' : `${d.pctMoM.toFixed(1)}%`,
      formatDeltaValue(d.changeYoY, d.format),
      d.pctYoY == null ? 'n/a' : `${d.pctYoY.toFixed(1)}%`,
      d.sentimentMoM,
    ].map(escapeCsv).join(','));
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = buildInsightsFilename(ctx, 'csv');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** PDF: branded one-pager with period in the title and table data. */
export function exportInsightsPdf(ctx: InsightsExportContext, deltas: DeltaResult[]) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(18);
  doc.setTextColor(20, 28, 40);
  doc.text(`Insights — ${ctx.periodLabel}`, 40, 48);

  doc.setFontSize(10);
  doc.setTextColor(110, 118, 130);
  const rangeText = `Reporting period: ${ctx.start} → ${ctx.end} (${ctx.granularity})`;
  doc.text(rangeText, 40, 66);
  doc.text(`Generated: ${fmtDate(new Date(), 'MMM d, yyyy h:mm a')}`, pageWidth - 40, 66, { align: 'right' });

  doc.setDrawColor(220, 226, 234);
  doc.line(40, 76, pageWidth - 40, 76);

  autoTable(doc, {
    startY: 90,
    head: [['Group', 'Metric', 'Current', 'Prev Period', 'Δ MoM', '% MoM', 'Δ YoY', '% YoY']],
    body: deltas.map(d => [
      d.group ?? '',
      d.label,
      formatDeltaValue(d.current, d.format),
      formatDeltaValue(d.prevPeriod, d.format),
      formatDeltaValue(d.changeMoM, d.format),
      d.pctMoM == null ? '—' : `${d.pctMoM.toFixed(1)}%`,
      formatDeltaValue(d.changeYoY, d.format),
      d.pctYoY == null ? '—' : `${d.pctYoY.toFixed(1)}%`,
    ]),
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [40, 80, 160], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 248, 252] },
    margin: { left: 40, right: 40 },
  });

  doc.save(buildInsightsFilename(ctx, 'pdf'));
}
