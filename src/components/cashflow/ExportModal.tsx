import { useState, memo, useCallback, useMemo } from 'react';
import type { WeeklyData, ExportFlag } from './types';
import { fmtAbbrev } from './formatters';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Format a YYYY-MM-DD week-start date as "MMM D" in en-US, parsed in UTC
 * so dates don't drift across timezones (matches Insights bucketing fix).
 */
function formatWeekStartLabel(dateKey: string): string {
  const [y, m, d] = dateKey.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return dateKey;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(dt);
}

/**
 * Shared cell color logic — mirrors `.cf-val-pos` / `.cf-val-neg` from
 * cashflow.css so the PDF and on-screen table stay in sync. Returns a hex
 * for the table preview and an RGB triple for jsPDF.
 */
const CF_POSITIVE_HEX = '#16a34a';
const CF_NEGATIVE_HEX = '#dc2626';
const CF_NEUTRAL_HEX = '#334155';
const CF_MUTED_HEX = '#94a3b8';

function cellTextColor(val: number, opts?: { muted?: boolean }): string {
  if (val > 0) return CF_POSITIVE_HEX;
  if (val < 0) return CF_NEGATIVE_HEX;
  return opts?.muted ? CF_MUTED_HEX : CF_NEUTRAL_HEX;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

const PRESET_FLAGS: ExportFlag[] = [
  { label: 'Cash Alert', color: '#ef4444' },
  { label: 'Needs Review', color: '#f59e0b' },
  { label: 'On Track', color: '#22c55e' },
  { label: 'Action Required', color: '#3b82f6' },
];

interface ExportModalProps {
  open: boolean;
  weeklyData: WeeklyData;
  /** Current viewport: weeks before the current week visible in the table. */
  weeksPast?: number;
  /** Current viewport: weeks after the current week visible in the table. */
  weeksFuture?: number;
  onClose: () => void;
  onArchive: (entry: { title: string; flags: ExportFlag[]; notes: string; weekCount: number; dateRange: string }) => void;
}

// Mirror of the on-screen Weekly Report row layout. Headers are non-data
// section breaks; line-item rows look up `key` on each week's row object.
// `section` mirrors the in-app WEEKLY_ROW_ORDER classification so disbursement
// rows can be sign-flipped + red-colored to match the live table.
type RowSection = 'position' | 'receipts' | 'disbursements';
type ExportRow =
  | { type: 'header'; label: string; section: RowSection }
  | { type: 'line'; key: string; label: string; section: RowSection; bold?: boolean };

const BASE_EXPORT_ROWS: ExportRow[] = [
  { type: 'line', key: 'BEGINNING CASH', label: 'BEGINNING CASH', section: 'position', bold: true },
  { type: 'line', key: 'ENDING CASH', label: 'ENDING CASH', section: 'position', bold: true },
  { type: 'line', key: 'NET CHANGE', label: 'NET CHANGE', section: 'position', bold: true },
  { type: 'line', key: "Add'l Liquidity (Delayed Draw)", label: "Add'l Liquidity (Delayed Draw)", section: 'position' },
  { type: 'line', key: 'TOTAL CASH ON HAND', label: 'TOTAL CASH ON HAND', section: 'position', bold: true },
  { type: 'header', label: '( + ) CASH RECEIPTS', section: 'receipts' },
  { type: 'line', key: 'Retainers', label: '  Retainers', section: 'receipts' },
  { type: 'line', key: 'Milestones', label: '  Milestones', section: 'receipts' },
  { type: 'line', key: 'Closing Fees', label: '  Closing Fees', section: 'receipts' },
  { type: 'line', key: 'Referral Fees', label: '  Referral Fees', section: 'receipts' },
  { type: 'line', key: 'FinServ Revenue', label: 'FinServ Revenue', section: 'receipts' },
  { type: 'line', key: 'Technology Revenue', label: 'Technology Revenue', section: 'receipts' },
  { type: 'line', key: 'Loan Proceeds', label: 'Loan Proceeds', section: 'receipts' },
  { type: 'line', key: 'Other Receipts', label: 'Other Receipts', section: 'receipts' },
  { type: 'line', key: 'TOTAL RECEIPTS', label: 'TOTAL RECEIPTS', section: 'receipts', bold: true },
  { type: 'header', label: '( – ) CASH DISBURSEMENTS', section: 'disbursements' },
  { type: 'line', key: 'Advertising & Marketing', label: 'Advertising & Marketing', section: 'disbursements' },
  { type: 'line', key: 'Insurance', label: 'Insurance', section: 'disbursements' },
  { type: 'line', key: 'Payroll - Salaries', label: 'Payroll - Salaries', section: 'disbursements' },
  { type: 'line', key: 'Payroll - Taxes & Benefits', label: 'Payroll - Taxes & Benefits', section: 'disbursements' },
  { type: 'line', key: 'Contractors & Consultants', label: 'Contractors & Consultants', section: 'disbursements' },
  { type: 'line', key: 'Rent & Occupancy', label: 'Rent & Occupancy', section: 'disbursements' },
  { type: 'line', key: 'Software & Technology', label: 'Software & Technology', section: 'disbursements' },
  { type: 'line', key: 'Legal & Professional', label: 'Legal & Professional', section: 'disbursements' },
  { type: 'line', key: 'Travel & Entertainment', label: 'Travel & Entertainment', section: 'disbursements' },
  { type: 'line', key: 'Office & Admin', label: 'Office & Admin', section: 'disbursements' },
  { type: 'line', key: 'Loan Payments', label: 'Loan Payments', section: 'disbursements' },
  { type: 'line', key: 'Other Disbursements', label: 'Other Disbursements', section: 'disbursements' },
  { type: 'line', key: 'TOTAL DISBURSEMENTS', label: 'TOTAL DISBURSEMENTS', section: 'disbursements', bold: true },
];

/**
 * Mirror WeeklyReportTab's display-sign rule: raw disbursement values are
 * stored as positive magnitudes; the live table negates them so they render
 * red with parentheses. Position rows (NET CHANGE, etc.) keep their raw sign.
 */
function toDisplayValue(raw: number, section: RowSection): number {
  if (section === 'disbursements' && raw > 0) return -raw;
  return raw;
}

export const ExportModal = memo(function ExportModal({
  open,
  weeklyData,
  weeksPast = 4,
  weeksFuture = 12,
  onClose,
  onArchive,
}: ExportModalProps) {
  const [title, setTitle] = useState('5th Line Capital — Weekly Cash Flow Report');
  const [flags, setFlags] = useState<ExportFlag[]>([]);
  const [notes, setNotes] = useState('');
  const [customFlag, setCustomFlag] = useState('');

  // Compute the viewport slice the user is actually looking at — same logic
  // as WeeklyReportTab so the PDF matches the on-screen Weeks Past/Future.
  const visibleWeeks = useMemo(() => {
    const sorted = Object.entries(weeklyData || {}).sort(([a], [b]) => a.localeCompare(b));
    if (sorted.length === 0) return sorted;
    const today = new Date().toISOString().split('T')[0];
    let currentIdx = sorted.findIndex(([dateKey, entry]) => {
      const we = typeof entry.week_ending === 'string' ? entry.week_ending : dateKey;
      return we >= today;
    });
    if (currentIdx < 0) currentIdx = sorted.length - 1;
    const startIdx = Math.max(0, currentIdx - Math.max(0, weeksPast));
    const endIdx = Math.min(sorted.length, currentIdx + 1 + Math.max(0, weeksFuture));
    return sorted.slice(startIdx, endIdx);
  }, [weeklyData, weeksPast, weeksFuture]);

  const weeks = visibleWeeks;
  const dateRange = weeks.length > 0
    ? `${new Date(weeks[0][0]).toLocaleDateString()} — ${new Date(weeks[weeks.length - 1][1].week_ending).toLocaleDateString()}`
    : '';

  const generatePDF = useCallback(() => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text(title, 40, 40);
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Generated: ${new Date().toLocaleString()} | ${dateRange} | ${weeks.length} weeks (Past ${weeksPast} / Future ${weeksFuture})`,
      40,
      58,
    );
    if (flags.length > 0) {
      let x = 40;
      flags.forEach(flag => {
        doc.setFillColor(flag.color);
        doc.circle(x + 4, 76, 4, 'F');
        doc.setTextColor(30, 41, 59);
        doc.text(flag.label, x + 12, 79);
        x += doc.getTextWidth(flag.label) + 24;
      });
    }
    const headers = ['Line Item', ...weeks.map(([dateKey]) => formatWeekStartLabel(dateKey))];
    const body: any[] = [];
    const rowStyles: Record<number, any> = {};
    // Parallel grid of raw numeric values keyed by [bodyRowIndex][columnIndex].
    // Column 0 is the label (no value); columns 1..N correspond to week cells.
    const cellValues: Record<number, Record<number, number>> = {};
    EXPORT_ROWS.forEach((row, idx) => {
      if (row.type === 'header') {
        const headerRow = [
          { content: row.label, colSpan: weeks.length + 1, styles: { fontStyle: 'bold', fillColor: [226, 232, 240], textColor: [15, 23, 42] } },
        ];
        body.push(headerRow);
      } else {
        const rawVals = weeks.map(([, v]) => (v[row.key] as number) || 0);
        const cells = [row.label, ...rawVals.map((n) => fmtAbbrev(n))];
        body.push(cells);
        const bodyIdx = body.length - 1;
        const colMap: Record<number, number> = {};
        rawVals.forEach((n, i) => { colMap[i + 1] = n; });
        cellValues[bodyIdx] = colMap;
        if (row.bold) rowStyles[body.length - 1] = { fontStyle: 'bold', fillColor: [241, 245, 249] };
      }
    });
    autoTable(doc, {
      startY: flags.length > 0 ? 95 : 70,
      head: [headers],
      body,
      styles: { fontSize: 7, cellPadding: 2.5, textColor: [51, 65, 85] },
      headStyles: { fillColor: [232, 237, 243], textColor: [30, 41, 59], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 130, halign: 'left' } },
      didParseCell: (data) => {
        const styles = rowStyles[data.row.index];
        if (styles && data.section === 'body') {
          Object.assign(data.cell.styles, styles);
        }
        // Right-align numeric value cells and apply pos/neg coloring that
        // mirrors the in-app cf-val-pos / cf-val-neg classes.
        if (data.section === 'body' && data.column.index > 0) {
          data.cell.styles.halign = 'right';
          const val = cellValues[data.row.index]?.[data.column.index];
          if (typeof val === 'number' && val !== 0) {
            data.cell.styles.textColor = hexToRgb(cellTextColor(val));
          }
        }
      },
      theme: 'grid',
    });
    if (notes.trim()) {
      const finalY = (doc as any).lastAutoTable?.finalY || 200;
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);
      doc.text('Notes:', 40, finalY + 25);
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      const noteLines = doc.splitTextToSize(notes, 700);
      doc.text(noteLines, 40, finalY + 40);
    }
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('Confidential — 5th Line Capital Advisors, LLC', 40, doc.internal.pageSize.getHeight() - 20);
    doc.text(`Page 1`, doc.internal.pageSize.getWidth() - 60, doc.internal.pageSize.getHeight() - 20);
    doc.save(`Advisory_CashFlow_Report.pdf`);
    onArchive({ title, flags: [...flags], notes, weekCount: weeks.length, dateRange });
    onClose();
  }, [title, flags, notes, weeks, dateRange, weeksPast, weeksFuture, onArchive, onClose]);

  if (!open) return null;

  const addFlag = (flag: ExportFlag) => {
    if (!flags.find(f => f.label === flag.label)) {
      setFlags([...flags, flag]);
    }
  };

  const removeFlag = (label: string) => {
    setFlags(flags.filter(f => f.label !== label));
  };

  const addCustomFlag = () => {
    if (customFlag.trim()) {
      addFlag({ label: customFlag.trim(), color: '#8b5cf6' });
      setCustomFlag('');
    }
  };


  return (
    <div className="cf-overlay" onClick={onClose}>
      <div className="cf-dialog cf-export-modal" onClick={e => e.stopPropagation()}>
        {/* Left: Controls */}
        <div>
          <div className="cf-dialog-title">Export Report</div>
          <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
            Report Title
          </label>
          <input className="cf-input" value={title} onChange={e => setTitle(e.target.value)} />

          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 12 }}>
            Date Range: {dateRange}
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 6 }}>Flags</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {PRESET_FLAGS.map(f => (
                <button
                  key={f.label}
                  className="cf-btn cf-btn-secondary"
                  style={{ fontSize: '10px', padding: '3px 8px' }}
                  onClick={() => addFlag(f)}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: f.color, display: 'inline-block' }} />
                  {f.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                className="cf-input"
                placeholder="Custom flag..."
                value={customFlag}
                onChange={e => setCustomFlag(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCustomFlag()}
                style={{ flex: 1, fontSize: 'var(--text-xs)' }}
              />
              <button className="cf-btn cf-btn-secondary" onClick={addCustomFlag} style={{ fontSize: '10px' }}>Add</button>
            </div>
            {flags.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                {flags.map(f => (
                  <span key={f.label} className="cf-flag" style={{ background: f.color + '20', color: f.color }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: f.color, display: 'inline-block' }} />
                    {f.label}
                    <span className="cf-flag-remove" onClick={() => removeFlag(f.label)}>×</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'block', marginTop: 16, marginBottom: 4 }}>
            Notes
          </label>
          <textarea
            className="cf-textarea"
            rows={6}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add notes for this export..."
          />

          <div className="cf-dialog-actions">
            <button className="cf-btn cf-btn-ghost" onClick={onClose}>Cancel</button>
            <button className="cf-btn cf-btn-primary" onClick={generatePDF}>Download PDF</button>
          </div>
        </div>

        {/* Right: Preview */}
        <div className="cf-export-preview">
          <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 14, marginBottom: 8, color: '#1e293b' }}>
            {title}
          </div>
          <div style={{ fontSize: 9, color: '#64748b', marginBottom: 6, textAlign: 'center' }}>
            {dateRange} | Generated: {new Date().toLocaleDateString()}
          </div>
          {flags.length > 0 && (
            <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginBottom: 8 }}>
              {flags.map(f => (
                <span key={f.label} style={{ fontSize: 8, padding: '1px 6px', borderRadius: 999, background: f.color + '20', color: f.color }}>
                  ● {f.label}
                </span>
              ))}
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 8 }}>
            <thead>
              <tr>
                <th style={{ background: '#e8edf3', padding: 3, border: '1px solid #cbd5e1', textAlign: 'left', color: '#1e293b' }}>Line Item</th>
                {weeks.slice(0, 8).map(([dateKey, v]) => (
                  <th key={v.week_num} style={{ background: '#e8edf3', padding: 3, border: '1px solid #cbd5e1', textAlign: 'center', color: '#1e293b' }}>
                    {formatWeekStartLabel(dateKey)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {['BEGINNING CASH', 'TOTAL RECEIPTS', 'TOTAL DISBURSEMENTS', 'NET CHANGE', 'ENDING CASH'].map(key => (
                <tr key={key}>
                  <td style={{ padding: 3, border: '1px solid #cbd5e1', fontWeight: 600, color: '#334155' }}>{key}</td>
                  {weeks.slice(0, 8).map(([wk, v]) => {
                    const val = (v[key] as number) || 0;
                    return (
                      <td key={wk} style={{
                        padding: 3, border: '1px solid #cbd5e1', textAlign: 'center',
                        color: cellTextColor(val, { muted: true }),
                      }}>
                        {fmtAbbrev(val)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {notes && (
            <div style={{ marginTop: 8, fontSize: 8, color: '#64748b' }}>
              <strong style={{ color: '#334155' }}>Notes:</strong> {notes.slice(0, 200)}
            </div>
          )}
          <div style={{ marginTop: 12, fontSize: 7, color: '#94a3b8', borderTop: '1px solid #e2e8f0', paddingTop: 4 }}>
            Confidential — 5th Line Capital Advisors, LLC
          </div>
        </div>
      </div>
    </div>
  );
});
