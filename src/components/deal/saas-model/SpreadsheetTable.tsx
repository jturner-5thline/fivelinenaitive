import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { fmtCurrency, fmtPct, isNegative } from './formatters';
import { MonthEntry } from './types';
import { Calendar, Download, ChevronDown, ChevronRight, ArrowUpDown, Grid3X3, MessageSquare } from 'lucide-react';
import { FinancialComment, AddCommentParams } from '@/hooks/useFinancialComments';
import { FinancialCommentPopover } from './FinancialCommentPopover';
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger,
} from '@/components/ui/context-menu';

export interface RowDef {
  key: string;
  label: string;
  values: number[];
  isTotal?: boolean;
  isSubtotal?: boolean;
  isPct?: boolean;
  isSection?: boolean;
  isCheck?: boolean;
  indent?: number;
  formula?: string;
}

export type ViewMode = 'monthly' | 'annual';

interface SelectedCell {
  rowIdx: number;
  colIdx: number;
}

interface SpreadsheetTableProps {
  title: string;
  rows: RowDef[];
  months: MonthEntry[];
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  annualAggregation?: 'sum' | 'last';
  actualThruDate?: string;
  showVariance?: boolean;
  onToggleVariance?: () => void;
  conditionalFormatting?: boolean;
  compactCurrency?: boolean;
  // Financial commenting
  statementType?: 'income_statement' | 'balance_sheet';
  comments?: FinancialComment[];
  onAddComment?: (params: AddCommentParams) => Promise<FinancialComment | null>;
  onDeleteComment?: (id: string) => Promise<void>;
  getCommentsForAnchor?: (anchorKey: string) => FinancialComment[];
  getCommentCountForRow?: (lineItemKey: string) => number;
}

const VARIANCE_THRESHOLD = 20;

export function SpreadsheetTable({
  title,
  rows,
  months,
  viewMode,
  onViewModeChange,
  annualAggregation = 'sum',
  actualThruDate,
  showVariance,
  onToggleVariance,
  conditionalFormatting,
  compactCurrency = false,
  statementType,
  comments: _comments,
  onAddComment,
  onDeleteComment,
  getCommentsForAnchor,
  getCommentCountForRow,
}: SpreadsheetTableProps) {
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const tableRef = useRef<HTMLDivElement>(null);

  const years = useMemo(() => [...new Set(months.map(m => m.year))], [months]);

  const forecastStartIdx = useMemo(() => {
    if (!actualThruDate) return months.length;
    const thruDate = new Date(actualThruDate);
    return months.findIndex(m => new Date(m.date) > thruDate);
  }, [months, actualThruDate]);

  const toggleSection = useCallback((sectionKey: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionKey)) next.delete(sectionKey);
      else next.add(sectionKey);
      return next;
    });
  }, []);

  const visibleRows = useMemo(() => {
    const result: (RowDef & { originalIdx: number })[] = [];
    let currentSection: string | null = null;
    let sectionCollapsed = false;

    rows.forEach((row, idx) => {
      if (row.isSection) {
        currentSection = row.key;
        sectionCollapsed = collapsedSections.has(row.key);
        result.push({ ...row, originalIdx: idx });
      } else if (!sectionCollapsed) {
        result.push({ ...row, originalIdx: idx });
      }
    });
    return result;
  }, [rows, collapsedSections]);

  const getAnnualValue = useCallback((values: number[], yearIdx: number, isPct: boolean) => {
    const y = years[yearIdx];
    const indices = months.map((m, i) => m.year === y ? i : -1).filter(i => i >= 0);
    if (indices.length === 0) return 0;
    if (annualAggregation === 'last' || isPct) {
      if (isPct) return indices.reduce((s, i) => s + (values[i] || 0), 0) / indices.length;
      return values[indices[indices.length - 1]] ?? 0;
    }
    return indices.reduce((s, i) => s + (values[i] || 0), 0);
  }, [years, months, annualAggregation]);

  const getVariancePct = useCallback((values: number[], colIdx: number, isPct: boolean): number | null => {
    if (viewMode === 'annual') {
      if (colIdx === 0) return null;
      const curr = getAnnualValue(values, colIdx, isPct);
      const prev = getAnnualValue(values, colIdx - 1, isPct);
      if (isPct) return curr - prev;
      if (prev === 0) return null;
      return ((curr - prev) / Math.abs(prev)) * 100;
    }
    if (colIdx === 0) return null;
    const curr = values[colIdx] ?? 0;
    const prev = values[colIdx - 1] ?? 0;
    if (isPct) return curr - prev;
    if (prev === 0) return null;
    return ((curr - prev) / Math.abs(prev)) * 100;
  }, [viewMode, getAnnualValue]);

  const formulaBarContent = useMemo(() => {
    if (!selectedCell) return { cellRef: '', value: '', formula: '', rowLabel: '' };
    const row = visibleRows[selectedCell.rowIdx];
    if (!row || row.isSection) return { cellRef: '', value: '', formula: '', rowLabel: '' };

    const colLetter = String.fromCharCode(65 + selectedCell.colIdx);
    const cellRef = `${colLetter}${selectedCell.rowIdx + 1}`;

    let value: number;
    if (viewMode === 'monthly') {
      value = row.values[selectedCell.colIdx] ?? 0;
    } else {
      value = getAnnualValue(row.values, selectedCell.colIdx, !!row.isPct);
    }

    const formatted = row.isPct ? fmtPct(value) : fmtCurrency(value, compactCurrency);
    const formula = row.formula || (row.isTotal ? `SUM(${row.label})` : '');

    return { cellRef, value: formatted, formula, rowLabel: row.label };
  }, [selectedCell, visibleRows, viewMode, getAnnualValue]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tableRef.current && !tableRef.current.contains(e.target as Node)) {
        setSelectedCell(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleExport = useCallback(() => {
    const cols = viewMode === 'monthly'
      ? months.map(m => m.label)
      : years.map(String);

    const csvRows = [['Line Item', ...cols].join(',')];
    rows.forEach(row => {
      if (row.isSection) return;
      const vals = viewMode === 'monthly'
        ? row.values.map(v => v ?? 0)
        : years.map((_, yi) => getAnnualValue(row.values, yi, !!row.isPct));
      csvRows.push([`"${row.label}"`, ...vals.map(String)].join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/\s+/g, '_').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [viewMode, months, years, rows, getAnnualValue, title]);

  const columns = viewMode === 'monthly'
    ? months.map((m, i) => ({ label: m.label, index: i, isForecast: i >= forecastStartIdx }))
    : years.map((y, i) => ({ label: String(y), index: i, isForecast: false }));

  return (
    <div className="rounded-lg border overflow-hidden"
      style={{
        background: 'var(--map-bg, hsl(var(--card)))',
        borderColor: 'var(--map-border, hsl(var(--border) / 0.3))',
      }}
    >
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-4 py-2"
        style={{
          background: 'var(--map-surface, hsl(var(--card)))',
          borderBottom: '1px solid var(--map-border, hsl(var(--border) / 0.2))',
        }}
      >
        <h3 className="text-sm font-semibold" style={{ color: 'var(--map-text, hsl(var(--foreground)))' }}>{title}</h3>
        <div className="flex items-center gap-1.5">
          {/* Variance toggle */}
          {onToggleVariance && (
            <button
              className={cn(
                "map-toolbar-btn",
                showVariance && "map-toolbar-btn--primary"
              )}
              onClick={onToggleVariance}
            >
              <ArrowUpDown className="h-3 w-3" />
              Δ Variance
            </button>
          )}

          {/* View mode toggle group */}
          <div className="flex gap-px rounded p-px" style={{ background: 'var(--map-grid-soft, hsl(var(--muted) / 0.3))' }}>
            <button
              className={cn("map-toolbar-btn border-0", viewMode === 'monthly' && "map-toolbar-btn--primary")}
              onClick={() => onViewModeChange('monthly')}
            >
              <Calendar className="h-3 w-3" /> Monthly
            </button>
            <button
              className={cn("map-toolbar-btn border-0", viewMode === 'annual' && "map-toolbar-btn--primary")}
              onClick={() => onViewModeChange('annual')}
            >
              <Grid3X3 className="h-3 w-3" /> Annual
            </button>
          </div>

          <div className="map-toolbar-divider" />

          <button className="map-toolbar-btn !h-auto !w-auto p-1.5 flex items-center justify-center" onClick={handleExport} aria-label="Export CSV">
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── Formula Bar ── */}
      <div className="flex items-center gap-2 px-4 py-1.5 min-h-[30px]"
        style={{
          background: 'var(--map-surface-2, hsl(var(--muted) / 0.1))',
          borderBottom: '1px solid var(--map-border, hsl(var(--border) / 0.15))',
        }}
      >
        {selectedCell ? (
          <>
            <span className="inline-flex items-center h-5 text-[10px] font-mono px-1.5 rounded"
              style={{
                background: 'var(--map-grid-soft, hsl(var(--muted) / 0.3))',
                border: '1px solid var(--map-border, hsl(var(--border) / 0.3))',
                color: 'var(--map-text-secondary, hsl(var(--muted-foreground)))',
              }}
            >
              {formulaBarContent.cellRef}
            </span>
            <span className="text-xs truncate" style={{ color: 'var(--map-text-muted, hsl(var(--muted-foreground)))' }}>
              {formulaBarContent.rowLabel}
            </span>
            <span className="text-xs font-mono ml-auto tabular-nums" style={{ color: 'var(--map-text, hsl(var(--foreground)))' }}>
              {formulaBarContent.formula ? (
                <span style={{ color: 'var(--map-blue, hsl(var(--primary) / 0.7))' }}>ƒ {formulaBarContent.formula} = </span>
              ) : null}
              {formulaBarContent.value}
            </span>
          </>
        ) : (
          <span className="text-[11px] italic" style={{ color: 'var(--map-text-faint, hsl(var(--muted-foreground) / 0.5))' }}>
            Click a cell to inspect
          </span>
        )}
      </div>

      {/* Actual/Forecast Legend */}
      {viewMode === 'monthly' && forecastStartIdx < months.length && (
        <div className="flex items-center gap-3 px-4 py-1"
          style={{ borderBottom: '1px solid var(--map-border, hsl(var(--border) / 0.1))' }}
        >
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ background: 'var(--map-blue, hsl(var(--primary) / 0.6))' }} />
            <span className="text-[10px]" style={{ color: 'var(--map-text-muted)' }}>Actual</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full border border-dashed" style={{ borderColor: 'var(--map-text-faint)', background: 'var(--map-grid-soft)' }} />
            <span className="text-[10px]" style={{ color: 'var(--map-text-muted)' }}>Forecast</span>
          </div>
        </div>
      )}

      {/* ── Table ── */}
      <div ref={tableRef} className="overflow-x-auto max-h-[68vh]">
        <table className="w-full border-collapse select-none" style={{ fontFeatureSettings: "'tnum' 1", fontSize: '13px' }}>
          <thead className="sticky top-0 z-10" style={{ background: 'var(--map-header-bg, hsl(var(--card)))' }}>
            {/* Column letter row */}
            <tr style={{ borderBottom: '1px solid var(--map-border, hsl(var(--border) / 0.2))' }}>
              <th className="sticky left-0 z-20 min-w-[200px] py-0.5 px-3"
                style={{ background: 'var(--map-header-bg, hsl(var(--card)))' }}
              >
                <span className="text-[9px] font-normal" style={{ color: 'var(--map-text-faint)' }}>#</span>
              </th>
              {columns.map((c, i) => (
                <th key={i} className="py-0.5 px-2 min-w-[80px] text-right"
                  style={{ color: 'var(--map-text-faint)', fontSize: '9px', fontWeight: 400 }}
                >
                  {String.fromCharCode(65 + i)}
                </th>
              ))}
            </tr>
            {/* Header row */}
            <tr style={{ borderBottom: '2px solid var(--map-border, hsl(var(--border) / 0.4))' }}>
              <th className="text-left py-2 px-3 sticky left-0 z-20 min-w-[200px]"
                style={{
                  background: 'var(--map-header-bg, hsl(var(--card)))',
                  color: 'var(--map-text-secondary)',
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                Line Item
              </th>
              {columns.map((c, i) => (
                <th key={i} className="text-right py-2 px-2 min-w-[80px] whitespace-nowrap"
                  style={{
                    color: c.isForecast ? 'var(--map-text-faint)' : 'var(--map-text-secondary)',
                    fontSize: '11px',
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                  }}
                >
                  <span style={c.isForecast ? { borderBottom: '1px dashed var(--map-text-faint)' } : undefined}>
                    {c.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, visIdx) => {
              if (row.isSection) {
                const isCollapsed = collapsedSections.has(row.key);
                return (
                  <tr
                    key={row.key}
                    className="cursor-pointer transition-colors"
                    style={{ background: 'var(--map-grid-soft)' }}
                    onClick={() => toggleSection(row.key)}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--map-row-hover)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--map-grid-soft)'; }}
                  >
                    <td
                      colSpan={columns.length + 1}
                      className="pt-3 pb-1.5 px-3 sticky left-0"
                      style={{
                        color: 'var(--map-text-secondary)',
                        fontSize: '11px',
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        borderTop: '1px solid var(--map-border)',
                      }}
                    >
                      <span className="flex items-center gap-1.5">
                        {isCollapsed ? (
                          <ChevronRight className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                        {row.label}
                      </span>
                    </td>
                  </tr>
                );
              }

              const isHighlightRow = row.isTotal || row.isSubtotal;

              return (
                <tr
                  key={row.key}
                  className="transition-colors"
                  style={{
                    borderBottom: `1px solid ${isHighlightRow ? 'var(--map-border)' : 'var(--map-border, hsl(var(--border) / 0.1))'}`,
                    ...(isHighlightRow ? { background: 'rgba(255,255,255,0.02)' } : {}),
                    ...(row.isTotal ? { borderTop: '2px solid var(--map-border)' } : {}),
                  }}
                >
                  <td className="py-1.5 px-3 sticky left-0 z-10"
                    style={{
                      background: 'var(--map-bg, hsl(var(--card)))',
                      color: row.isPct
                        ? 'var(--map-text-faint)'
                        : isHighlightRow
                          ? 'var(--map-text)'
                          : 'var(--map-text-secondary)',
                      fontWeight: isHighlightRow ? 600 : 400,
                      fontStyle: row.isCheck ? 'italic' : undefined,
                      fontSize: row.isPct ? '12px' : '13px',
                      paddingLeft: row.indent ? `${12 + row.indent * 12}px` : undefined,
                    }}
                  >
                    <span className="flex items-center gap-1.5">
                      {row.label}
                      {row.formula && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-[9px] font-mono" style={{ color: 'var(--map-blue, hsl(var(--primary) / 0.4))' }}>ƒ</span>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="text-[10px] font-mono">
                              {row.formula}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </span>
                  </td>
                  {columns.map((c, ci) => {
                    const v = viewMode === 'monthly'
                      ? (row.values[c.index] ?? 0)
                      : getAnnualValue(row.values, ci, !!row.isPct);

                    const isSelected = selectedCell?.rowIdx === visIdx && selectedCell?.colIdx === ci;

                    const variancePct = showVariance ? getVariancePct(row.values, c.index, !!row.isPct) : null;
                    const hasLargeSwing = conditionalFormatting && variancePct !== null && Math.abs(variancePct) > VARIANCE_THRESHOLD;

                    return (
                      <td
                        key={ci}
                        className="py-1.5 px-2 text-right whitespace-nowrap cursor-cell tabular-nums"
                        style={{
                          fontFeatureSettings: "'tnum' 1",
                          fontWeight: isHighlightRow ? 600 : 400,
                          fontSize: '13px',
                          color: isNegative(v)
                            ? 'var(--map-red, hsl(var(--destructive)))'
                            : row.isCheck && v !== 0
                              ? 'var(--map-red)'
                              : c.isForecast
                                ? 'var(--map-text-faint)'
                                : isHighlightRow
                                  ? 'var(--map-text)'
                                  : 'var(--map-text-secondary)',
                          ...(isSelected ? {
                            boxShadow: 'inset 0 0 0 2px var(--map-blue, hsl(var(--primary) / 0.5))',
                            background: 'var(--map-selected, rgba(37, 99, 235, 0.08))',
                            borderRadius: '2px',
                          } : {}),
                          ...(hasLargeSwing && !isSelected ? {
                            background: variancePct! > 0 ? 'rgba(34, 197, 94, 0.06)' : 'rgba(220, 38, 38, 0.06)',
                          } : {}),
                        }}
                        onClick={() => setSelectedCell({ rowIdx: visIdx, colIdx: ci })}
                        onMouseEnter={(e) => {
                          if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--map-row-hover)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected && !hasLargeSwing) (e.currentTarget as HTMLElement).style.background = '';
                          else if (!isSelected && hasLargeSwing) {
                            (e.currentTarget as HTMLElement).style.background = variancePct! > 0 ? 'rgba(34, 197, 94, 0.06)' : 'rgba(220, 38, 38, 0.06)';
                          }
                        }}
                      >
                        <div className="flex flex-col items-end">
                          <span>{row.isPct ? fmtPct(v) : fmtCurrency(v, compactCurrency)}</span>
                          {showVariance && variancePct !== null && (
                            <span style={{
                              fontSize: '9px',
                              lineHeight: '1.2',
                              color: variancePct > 0 ? 'var(--map-green)' : variancePct < 0 ? 'var(--map-red)' : 'var(--map-text-faint)',
                            }}>
                              {variancePct > 0 ? '+' : ''}{variancePct.toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between px-4 py-1.5"
        style={{
          borderTop: '1px solid var(--map-border, hsl(var(--border) / 0.15))',
          background: 'var(--map-surface, hsl(var(--muted) / 0.05))',
        }}
      >
        <span className="text-[10px] tabular-nums" style={{ color: 'var(--map-text-faint)' }}>
          {rows.filter(r => !r.isSection).length} rows × {columns.length} columns
        </span>
        {selectedCell && (
          <span className="text-[10px] font-mono tabular-nums" style={{ color: 'var(--map-text-muted)' }}>
            {formulaBarContent.value}
          </span>
        )}
      </div>
    </div>
  );
}
