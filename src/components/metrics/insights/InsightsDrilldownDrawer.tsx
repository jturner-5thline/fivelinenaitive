import React, { useEffect } from 'react';
import { X, ExternalLink, Inbox } from 'lucide-react';

export interface DrilldownColumn<T = any> {
  key: string;
  label: string;
  width?: number | string;
  align?: 'left' | 'right' | 'center';
  render?: (row: T) => React.ReactNode;
}

export interface DrilldownContext {
  /** Stable id of the source widget (kpi:revenue, goal:row, initiative:row, …). */
  sourceId: string;
  /** Human-readable source label shown in the header (e.g. "Goals · Q2 2026"). */
  sourceLabel: string;
  /** The exact datapoint clicked (e.g. "Q1 2026", "On Track", goal title). */
  selection?: string;
  /** Active reporting period label (e.g. "April 2026"). */
  periodLabel?: string;
  /** Active filters, rendered as chips. */
  filters?: Array<{ label: string; value: string }>;
}

interface Props<T = any> {
  open: boolean;
  onClose: () => void;
  context: DrilldownContext | null;
  columns: DrilldownColumn<T>[];
  rows: T[];
  /** Optional hint shown when rows is empty. */
  emptyHint?: string;
  /** Optional click target per row (e.g. open original record). */
  rowHref?: (row: T) => string | null;
  /** Optional summary metrics rendered above the table. */
  summary?: React.ReactNode;
  /** Optional full body override. When provided, renders instead of the columns/rows table. */
  body?: React.ReactNode;
  /** Optional loading flag — when true, shows a spinner instead of the table/body. */
  loading?: boolean;
}

const PANEL_BG = 'rgba(10,18,36,0.97)';
const BORDER = 'rgba(120,170,255,0.2)';

/**
 * Universal right-side drilldown drawer for Insights dashboards.
 * Renders a contextual table of records that explain a clicked KPI / chart point.
 */
export function InsightsDrilldownDrawer<T = any>({
  open, onClose, context, columns, rows, emptyHint, rowHref, summary, body, loading,
}: Props<T>) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open || !context) return null;

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${context.sourceLabel} drilldown`}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
        zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, backdropFilter: 'blur(2px)',
      }}
      className="qir-no-print"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative', width: 880, maxWidth: '100%',
          maxHeight: 'calc(100vh - 48px)',
          background: PANEL_BG, border: `1px solid ${BORDER}`, borderRadius: 12,
          boxShadow: '0 24px 80px -12px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column', color: '#dde8f8',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.12em', color: 'rgba(160,200,255,0.6)' }}>
              Drilldown
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2, lineHeight: 1.2 }}>
              {context.sourceLabel}
            </div>
            {context.selection && (
              <div style={{ fontSize: 12, color: '#7cc8f0', marginTop: 4 }}>{context.selection}</div>
            )}
            {(context.periodLabel || (context.filters && context.filters.length > 0)) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {context.periodLabel && <Chip label="Period" value={context.periodLabel} />}
                {(context.filters || []).map((f) => (
                  <Chip key={`${f.label}:${f.value}`} label={f.label} value={f.value} />
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label="Close drilldown"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'rgba(200,225,245,0.75)', cursor: 'pointer', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Optional summary metrics */}
        {summary && (
          <div style={{ padding: '12px 18px', borderBottom: `1px solid ${BORDER}` }}>{summary}</div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: body ? 0 : (rows.length === 0 ? 0 : '8px 0') }}>
          {loading ? (
            <div style={{
              height: '100%', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: 32, color: 'rgba(180,200,230,0.65)', textAlign: 'center',
            }}>
              <div className="h-6 w-6 rounded-full border-2 border-current border-t-transparent animate-spin" style={{ opacity: 0.6 }} />
              <div style={{ fontSize: 12 }}>Loading details…</div>
            </div>
          ) : body ? (
            body
          ) : rows.length === 0 ? (
            <div style={{
              height: '100%', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: 32, color: 'rgba(180,200,230,0.65)', textAlign: 'center',
            }}>
              <Inbox size={28} style={{ opacity: 0.5 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: '#dde8f8' }}>No detail records</div>
              <div style={{ fontSize: 12, maxWidth: 360, lineHeight: 1.5 }}>
                {emptyHint || 'There are no underlying records to show for this datapoint.'}
              </div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c.key}
                      style={{
                        textAlign: c.align || 'left', padding: '10px 14px',
                        fontSize: 9, fontWeight: 700, letterSpacing: '.08em',
                        textTransform: 'uppercase', color: 'rgba(160,200,255,0.55)',
                        borderBottom: `1px solid ${BORDER}`,
                        position: 'sticky', top: 0, background: PANEL_BG,
                        width: c.width,
                      }}
                    >{c.label}</th>
                  ))}
                  {rowHref && <th style={{ width: 32, borderBottom: `1px solid ${BORDER}` }} />}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const href = rowHref?.(row) || null;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(120,170,255,0.08)' }}>
                      {columns.map((c) => (
                        <td key={c.key} style={{ padding: '10px 14px', textAlign: c.align || 'left', verticalAlign: 'top' }}>
                          {c.render ? c.render(row) : (row as any)[c.key] ?? '—'}
                        </td>
                      ))}
                      {rowHref && (
                        <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                          {href ? (
                            <a href={href} target="_blank" rel="noopener noreferrer"
                              style={{ color: 'rgba(180,200,230,0.7)' }} title="Open source">
                              <ExternalLink size={14} />
                            </a>
                          ) : null}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, padding: '2px 8px', borderRadius: 4,
      background: 'rgba(80,140,255,0.14)', color: 'rgba(200,225,255,0.95)',
      border: '1px solid rgba(120,170,255,0.28)',
    }}>
      <span style={{ opacity: 0.7, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </span>
  );
}