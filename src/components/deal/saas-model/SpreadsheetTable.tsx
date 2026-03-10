import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { fmtCurrency, fmtPct, isNegative } from './formatters';
import { MonthEntry } from './types';
import { Grid3X3, Calendar, Download, ChevronDown, ChevronRight } from 'lucide-react';

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
  formula?: string; // e.g. "SUM(B2:B5)"
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
  /** For annual view: 'sum' adds months, 'last' takes last month of year (balance sheet style) */
  annualAggregation?: 'sum' | 'last';
  actualThruDate?: string;
}

export function SpreadsheetTable({
  title,
  rows,
  months,
  viewMode,
  onViewModeChange,
  annualAggregation = 'sum',
  actualThruDate,
}: SpreadsheetTableProps) {
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const tableRef = useRef<HTMLDivElement>(null);

  const years = useMemo(() => [...new Set(months.map(m => m.year))], [months]);

  // Find the index where forecast starts
  const forecastStartIdx = useMemo(() => {
    if (!actualThruDate) return months.length;
    const thruDate = new Date(actualThruDate);
    return months.findIndex(m => new Date(m.date) > thruDate);
  }, [months, actualThruDate]);

  // Toggle section collapse
  const toggleSection = useCallback((sectionKey: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionKey)) next.delete(sectionKey);
      else next.add(sectionKey);
      return next;
    });
  }, []);

  // Determine which rows are visible (respect collapsed sections)
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

  // Get annual values
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

  // Formula bar content
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

    const formatted = row.isPct ? fmtPct(value) : fmtCurrency(value);
    const formula = row.formula || (row.isTotal ? `SUM(${row.label})` : '');

    return { cellRef, value: formatted, formula, rowLabel: row.label };
  }, [selectedCell, visibleRows, viewMode, getAnnualValue]);

  // Click outside to deselect
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tableRef.current && !tableRef.current.contains(e.target as Node)) {
        setSelectedCell(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Export CSV
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
    <Card className="border-border/30">
      <CardContent className="p-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/20">
          <h3 className="text-sm font-semibold">{title}</h3>
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5 bg-muted/30 rounded-sm p-0.5">
              <Button
                variant={viewMode === 'monthly' ? 'default' : 'ghost'}
                size="sm"
                className="h-6 text-[11px] px-2.5 rounded-sm"
                onClick={() => onViewModeChange('monthly')}
              >
                <Calendar className="h-3 w-3 mr-1" /> Monthly
              </Button>
              <Button
                variant={viewMode === 'annual' ? 'default' : 'ghost'}
                size="sm"
                className="h-6 text-[11px] px-2.5 rounded-sm"
                onClick={() => onViewModeChange('annual')}
              >
                <Grid3X3 className="h-3 w-3 mr-1" /> Annual
              </Button>
            </div>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleExport}>
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Formula Bar */}
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border/15 bg-muted/10 min-h-[32px]">
          {selectedCell ? (
            <>
              <Badge variant="outline" className="h-5 text-[10px] font-mono px-1.5 rounded-sm bg-muted/30">
                {formulaBarContent.cellRef}
              </Badge>
              <span className="text-xs text-muted-foreground truncate">
                {formulaBarContent.rowLabel}
              </span>
              <span className="text-xs font-mono ml-auto">
                {formulaBarContent.formula ? (
                  <span className="text-primary/70">ƒ {formulaBarContent.formula} = </span>
                ) : null}
                {formulaBarContent.value}
              </span>
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground/50 italic">
              Click a cell to inspect
            </span>
          )}
        </div>

        {/* Actual/Forecast Legend */}
        {viewMode === 'monthly' && forecastStartIdx < months.length && (
          <div className="flex items-center gap-3 px-4 py-1 border-b border-border/10">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-primary/60" />
              <span className="text-[10px] text-muted-foreground">Actual</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-muted-foreground/30 border border-dashed border-muted-foreground/40" />
              <span className="text-[10px] text-muted-foreground">Forecast</span>
            </div>
          </div>
        )}

        {/* Table */}
        <div ref={tableRef} className="overflow-x-auto max-h-[68vh]">
          <table className="w-full text-xs border-collapse select-none">
            <thead className="sticky top-0 z-10 bg-card">
              {/* Column number row */}
              <tr className="border-b border-border/20">
                <th className="sticky left-0 bg-card z-20 min-w-[200px] py-0.5 px-3">
                  <span className="text-[9px] text-muted-foreground/40 font-normal">#</span>
                </th>
                {columns.map((c, i) => (
                  <th key={i} className={cn(
                    "py-0.5 px-2 min-w-[80px]",
                    "text-[9px] text-muted-foreground/40 font-normal text-right"
                  )}>
                    {String.fromCharCode(65 + i)}
                  </th>
                ))}
              </tr>
              {/* Header row */}
              <tr className="border-b border-border/40">
                <th className="text-left py-2 px-3 font-medium text-muted-foreground sticky left-0 bg-card z-20 min-w-[200px]">
                  Line Item
                </th>
                {columns.map((c, i) => (
                  <th key={i} className={cn(
                    "text-right py-2 px-2 font-medium text-muted-foreground min-w-[80px] whitespace-nowrap",
                    c.isForecast && "text-muted-foreground/50"
                  )}>
                    <span className={cn(c.isForecast && "border-b border-dashed border-muted-foreground/30")}>
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
                      className="bg-muted/20 cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => toggleSection(row.key)}
                    >
                      <td
                        colSpan={columns.length + 1}
                        className="pt-2.5 pb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sticky left-0"
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

                return (
                  <tr
                    key={row.key}
                    className={cn(
                      "border-b border-border/10 transition-colors",
                      (row.isTotal || row.isSubtotal) && "border-t border-border/30 bg-muted/5",
                      row.isCheck && "bg-muted/10"
                    )}
                  >
                    <td className={cn(
                      "py-1.5 px-3 sticky left-0 bg-card z-10",
                      (row.isTotal || row.isSubtotal) && "font-semibold",
                      row.isCheck && "text-muted-foreground italic",
                      row.indent && `pl-${3 + row.indent * 3}`
                    )}>
                      <span className="flex items-center gap-1.5">
                        {row.label}
                        {row.formula && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-[9px] text-primary/40 font-mono">ƒ</span>
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

                      return (
                        <td
                          key={ci}
                          className={cn(
                            "py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap cursor-cell",
                            (row.isTotal || row.isSubtotal) && "font-semibold",
                            isNegative(v) && "text-destructive",
                            row.isCheck && v !== 0 && "text-destructive font-bold",
                            c.isForecast && "text-foreground/60",
                            isSelected && "ring-2 ring-primary/50 ring-inset bg-primary/5 rounded-sm",
                            !isSelected && "hover:bg-muted/20"
                          )}
                          onClick={() => setSelectedCell({ rowIdx: visIdx, colIdx: ci })}
                        >
                          {row.isPct ? fmtPct(v) : fmtCurrency(v)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-1.5 border-t border-border/15 bg-muted/5">
          <span className="text-[10px] text-muted-foreground/50">
            {rows.filter(r => !r.isSection).length} rows × {columns.length} columns
          </span>
          {selectedCell && (
            <span className="text-[10px] text-muted-foreground/50 font-mono">
              {formulaBarContent.value}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
