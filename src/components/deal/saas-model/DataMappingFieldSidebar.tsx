import { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { cn } from '@/lib/utils';
import { CheckCircle2, Circle, Sparkles, Check, X, Save, Loader2, Search, Trash2, Wand2 } from 'lucide-react';
import { IS_FIELDS, BS_FIELDS, type FieldMapping } from './types';
import { IS_SECTIONS, BS_SECTIONS, getConfidencePct, type AutoMapResult } from './dataMappingUtils';
import { formatUSD } from '@/lib/formatters/currency';
import type { MappingSuggestion } from '@/hooks/useMappingSuggestions';
import type { AnalyzedFile } from './dataMappingUtils';
import { Sparkline } from '@/components/finance/spreadsheet/Sparkline';

export interface FieldSidebarHandle {
  focusPanel: () => void;
  getFocusedField: () => string | null;
  navigateField: (direction: 'up' | 'down') => void;
}

interface Props {
  fieldMappings: Record<string, FieldMapping[]>;
  selectedRows: Set<number>;
  autoMapResults: AutoMapResult[];
  suggestions: MappingSuggestion[];
  mappedCount: number;
  lastSavedCount: number;
  hasUnsavedMappings: boolean;
  isSaving: boolean;
  selectedFile: AnalyzedFile | null;
  activeSheet: number;
  flashedFields: Set<string>;
  pendingAutoMaps: Record<string, { rowIdx: number; label: string; sheetName: string }>;
  draggingRowIdx: number | null;
  onAssignField: (field: string) => void;
  onRemoveMapping: (field: string, idx: number) => void;
  onAcceptSuggestion: (rowIdx: number) => void;
  onSaveProgress: () => void;
  onClearAllMappings: () => void;
  onDeselectRows: () => void;
  onAcceptAutoMap: (field: string) => void;
  onRejectAutoMap: (field: string) => void;
  onAcceptAllAutoMaps: () => void;
  onAutoMap: () => void;
  onDropAssign: (field: string, rowIdx: number) => void;
}

export const DataMappingFieldSidebar = forwardRef<FieldSidebarHandle, Props>(function DataMappingFieldSidebar({
  fieldMappings, selectedRows, autoMapResults, suggestions, mappedCount,
  lastSavedCount, hasUnsavedMappings, isSaving, selectedFile, activeSheet,
  flashedFields, pendingAutoMaps, draggingRowIdx, onAssignField, onRemoveMapping, onAcceptSuggestion,
  onSaveProgress, onClearAllMappings, onDeselectRows, onAcceptAutoMap, onRejectAutoMap,
  onAcceptAllAutoMaps, onAutoMap, onDropAssign,
}, ref) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'mapped' | 'unmapped'>('all');
  const [focusedFieldIdx, setFocusedFieldIdx] = useState<number>(-1);
  const [dragOverField, setDragOverField] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const totalFields = IS_FIELDS.length + BS_FIELDS.length;
  const pendingCount = Object.keys(pendingAutoMaps).length;
  const unmappedCount = totalFields - mappedCount;

  // Build a flat list of visible fields for keyboard navigation
  const allFields = [...IS_FIELDS, ...BS_FIELDS] as string[];
  const visibleFields = allFields.filter(field => {
    const matchesSearch = !searchQuery || field.toLowerCase().includes(searchQuery.toLowerCase());
    const isMapped = !!fieldMappings[field];
    if (filterMode === 'mapped') return matchesSearch && isMapped;
    if (filterMode === 'unmapped') return matchesSearch && !isMapped;
    return matchesSearch;
  });

  const focusedField = focusedFieldIdx >= 0 && focusedFieldIdx < visibleFields.length ? visibleFields[focusedFieldIdx] : null;

  useImperativeHandle(ref, () => ({
    focusPanel: () => {
      panelRef.current?.focus();
      if (focusedFieldIdx < 0 && visibleFields.length > 0) setFocusedFieldIdx(0);
    },
    getFocusedField: () => focusedField,
    navigateField: (direction: 'up' | 'down') => {
      setFocusedFieldIdx(prev => {
        if (direction === 'up') return Math.max(0, prev - 1);
        return Math.min(visibleFields.length - 1, prev + 1);
      });
    },
  }), [focusedField, focusedFieldIdx, visibleFields]);

  const handlePanelKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedFieldIdx(prev => Math.min(visibleFields.length - 1, prev + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedFieldIdx(prev => Math.max(0, prev - 1));
    } else if (e.key === 'Enter' && focusedField && selectedRows.size > 0) {
      e.preventDefault();
      onAssignField(focusedField);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onDeselectRows();
      setFocusedFieldIdx(-1);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && focusedField && fieldMappings[focusedField]) {
      e.preventDefault();
      // Remove last mapping from focused field
      const mappings = fieldMappings[focusedField];
      if (mappings.length > 0) {
        onRemoveMapping(focusedField, mappings.length - 1);
      }
    }
  }, [visibleFields.length, focusedField, selectedRows, onAssignField, onDeselectRows, fieldMappings, onRemoveMapping]);

  const getAutoMapConfidence = (fieldName: string): AutoMapResult | undefined => {
    return autoMapResults.find(r => r.fieldName === fieldName);
  };

  const getFieldSuggestion = (field: string): MappingSuggestion | undefined => {
    return suggestions.find(s => s.suggestedField === field && s.status === 'pending');
  };

  const getSampleValue = (fieldName: string): number | null => {
    const mappings = fieldMappings[fieldName];
    if (!mappings || !selectedFile) return null;
    let total = 0;
    mappings.forEach(m => {
      const sheet = selectedFile.sheets.find(s => s.name === m.sheet) || selectedFile.sheets[0];
      const row = sheet?.data[m.rowIdx];
      if (!row) return;
      for (let c = 1; c < row.length; c++) {
        const val = typeof row[c] === 'number' ? row[c] as number : parseFloat(String(row[c] || '').replace(/[,$]/g, ''));
        if (!isNaN(val)) { total += val; break; }
      }
    });
    return total;
  };

  // Get all numeric values from mapped rows for sparkline
  const getFieldTrendData = (fieldName: string): number[] => {
    const mappings = fieldMappings[fieldName];
    if (!mappings || !selectedFile) return [];
    // Sum values across all mapped rows per column
    const colValues: Record<number, number> = {};
    mappings.forEach(m => {
      const sheet = selectedFile.sheets.find(s => s.name === m.sheet) || selectedFile.sheets[0];
      const row = sheet?.data[m.rowIdx];
      if (!row) return;
      for (let c = 1; c < row.length; c++) {
        const val = typeof row[c] === 'number' ? row[c] as number : parseFloat(String(row[c] || '').replace(/[,$]/g, ''));
        if (!isNaN(val)) {
          colValues[c] = (colValues[c] || 0) + val;
        }
      }
    });
    const cols = Object.keys(colValues).map(Number).sort((a, b) => a - b);
    return cols.map(c => colValues[c]);
  };

  // Get info about selected rows for the banner
  const selectedRowInfo = (() => {
    if (selectedRows.size === 0 || !selectedFile) return null;
    const sheet = selectedFile.sheets[activeSheet];
    if (!sheet) return null;

    if (selectedRows.size === 1) {
      const firstRowIdx = Array.from(selectedRows)[0];
      if (!sheet.data[firstRowIdx]) return null;
      const row = sheet.data[firstRowIdx];
      const accountName = row[0] !== null && row[0] !== undefined ? String(row[0]) : `Row ${firstRowIdx + 1}`;
      let lastValue: number | null = null;
      for (let c = row.length - 1; c >= 1; c--) {
        const val = typeof row[c] === 'number' ? row[c] as number : parseFloat(String(row[c] || '').replace(/[,$]/g, ''));
        if (!isNaN(val)) { lastValue = val; break; }
      }
      return { accountName, lastValue, rowIdx: firstRowIdx, count: 1 };
    }

    // Multi-row: show count and sum
    const rowIndices = Array.from(selectedRows).sort((a, b) => a - b);
    let totalValue = 0;
    let hasValue = false;
    const names: string[] = [];
    rowIndices.forEach(idx => {
      const row = sheet.data[idx];
      if (!row) return;
      names.push(row[0] !== null && row[0] !== undefined ? String(row[0]) : `Row ${idx + 1}`);
      for (let c = row.length - 1; c >= 1; c--) {
        const val = typeof row[c] === 'number' ? row[c] as number : parseFloat(String(row[c] || '').replace(/[,$]/g, ''));
        if (!isNaN(val)) { totalValue += val; hasValue = true; break; }
      }
    });

    return {
      accountName: `${selectedRows.size} rows selected`,
      lastValue: hasValue ? totalValue : null,
      rowIdx: rowIndices[0],
      count: selectedRows.size,
      names,
    };
  })();

  const filterField = (field: string): boolean => {
    const matchesSearch = !searchQuery || field.toLowerCase().includes(searchQuery.toLowerCase());
    const isMapped = !!fieldMappings[field];
    if (filterMode === 'mapped') return matchesSearch && isMapped;
    if (filterMode === 'unmapped') return matchesSearch && !isMapped;
    return matchesSearch;
  };

  const renderFieldRow = (field: string) => {
    if (!filterField(field)) return null;
    const mapped = fieldMappings[field];
    const isMapped = Boolean(mapped);
    const sampleVal = isMapped ? getSampleValue(field) : null;
    const fieldSuggestion = getFieldSuggestion(field);
    const isFlashing = flashedFields.has(field);
    const pendingAuto = pendingAutoMaps[field];
    const hasPendingAuto = !!pendingAuto;
    const isFocused = focusedField === field;
    const isDragOver = dragOverField === field;
    const isDropTarget = draggingRowIdx !== null && !isMapped && !hasPendingAuto;

    const rowContent = (
      <div key={field} className={cn(
        "flex items-center justify-between py-1.5 px-2 rounded group transition-all duration-500",
        isFocused && "ring-1 ring-cyan-400/50 bg-cyan-500/10",
        isDragOver && "ring-2 ring-dashed ring-teal-400 bg-teal-500/10 shadow-[0_0_12px_-2px_hsl(170,60%,50%,0.3)]",
        isFlashing
          ? "bg-emerald-500/20 ring-1 ring-emerald-500/30"
          : isMapped ? "bg-emerald-500/5 hover:bg-emerald-500/10"
          : hasPendingAuto ? "bg-amber-500/[0.08] hover:bg-amber-500/[0.12] ring-1 ring-amber-500/20"
          : isDropTarget ? "border border-dashed border-teal-500/30 hover:border-teal-400/50 hover:bg-teal-500/5"
          : fieldSuggestion ? "bg-primary/5 hover:bg-primary/10 ring-1 ring-primary/15"
          : "hover:bg-muted/20"
      )}
      onClick={() => {
        const idx = visibleFields.indexOf(field);
        if (idx >= 0) setFocusedFieldIdx(idx);
        // If rows are selected and field is unmapped, assign immediately on click
        if (selectedRows.size > 0 && !isMapped && !hasPendingAuto) {
          onAssignField(field);
        }
      }}
      style={{ cursor: selectedRows.size > 0 && !isMapped && !hasPendingAuto ? 'pointer' : undefined }}
      onDragOver={e => {
        if (draggingRowIdx === null || isMapped) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverField(field);
      }}
      onDragEnter={e => {
        if (draggingRowIdx === null || isMapped) return;
        e.preventDefault();
        setDragOverField(field);
      }}
      onDragLeave={() => setDragOverField(prev => prev === field ? null : prev)}
      onDrop={e => {
        e.preventDefault();
        setDragOverField(null);
        if (draggingRowIdx === null || isMapped) return;
        onDropAssign(field, draggingRowIdx);
      }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isMapped ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
            : hasPendingAuto ? <Wand2 className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
            : fieldSuggestion ? <Sparkles className="h-3.5 w-3.5 text-primary flex-shrink-0" />
            : <Circle className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />}
          <span className={cn("text-xs truncate", isMapped && "font-medium")}>{field}</span>
          {/* Pending auto-map amber tag */}
          {hasPendingAuto && !isMapped && (
            <Badge variant="outline" className="text-[8px] h-4 px-1.5 shrink-0 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 gap-0.5">
              <Wand2 className="h-2 w-2" />
              {pendingAuto.label}
            </Badge>
          )}
          {isMapped && (() => {
            const autoMap = getAutoMapConfidence(field);
            if (autoMap) {
              const pct = getConfidencePct(autoMap.confidence);
              return (
                <Badge variant="outline" className={cn(
                  "text-[8px] h-4 px-1 shrink-0",
                  autoMap.confidence === 'high' ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" :
                  autoMap.confidence === 'medium' ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" :
                  "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20"
                )}>{pct}%</Badge>
              );
            }
            return null;
          })()}
          {fieldSuggestion && !isMapped && !hasPendingAuto && (
            <Badge variant="outline" className="text-[8px] h-4 px-1 bg-primary/5 text-primary border-primary/20 shrink-0">
              AI · Row {fieldSuggestion.rowIdx + 1}
            </Badge>
          )}
          {mapped && (
            <div className="flex gap-1 flex-shrink-0 flex-wrap">
              {mapped.map((m, i) => (
                <Badge key={i} variant="secondary" className="text-[9px] h-4 gap-1 max-w-[100px] truncate">
                  {m.label}
                  <X className="h-2.5 w-2.5 cursor-pointer flex-shrink-0" onClick={e => { e.stopPropagation(); onRemoveMapping(field, i); }} />
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {sampleVal !== null && (
            <span className="text-[10px] tabular-nums text-muted-foreground">{formatUSD(sampleVal)}</span>
          )}
          {/* Pending auto-map accept/reject buttons */}
          {hasPendingAuto && !isMapped && (
            <div className="flex items-center gap-0.5">
              <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10" onClick={() => onAcceptAutoMap(field)}>
                <Check className="h-3 w-3 mr-0.5" /> Accept
              </Button>
              <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive" onClick={() => onRejectAutoMap(field)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
          {fieldSuggestion && !isMapped && !hasPendingAuto && (
            <Button size="sm" variant="ghost" className="h-5 text-[10px] px-2 text-primary" onClick={() => onAcceptSuggestion(fieldSuggestion.rowIdx)}>
              <Check className="h-3 w-3 mr-0.5" /> Apply
            </Button>
          )}
          {selectedRows.size > 0 && !hasPendingAuto && !isMapped && (
            <span className="text-[10px] px-2 text-muted-foreground group-hover:text-primary transition-colors">Assign</span>
          )}
        </div>
      </div>
    );

    // Wrap mapped fields in HoverCard for data preview
    if (isMapped && mapped) {
      const trendData = getFieldTrendData(field);
      const min = trendData.length > 0 ? Math.min(...trendData) : 0;
      const max = trendData.length > 0 ? Math.max(...trendData) : 0;
      const avg = trendData.length > 0 ? trendData.reduce((a, b) => a + b, 0) / trendData.length : 0;
      return (
        <HoverCard key={field} openDelay={300} closeDelay={100}>
          <HoverCardTrigger asChild>
            {rowContent}
          </HoverCardTrigger>
          <HoverCardContent side="left" align="center" className="w-64 p-3 bg-popover border-border/[0.08] shadow-xl">
            <div className="space-y-2">
              <div>
                <p className="text-[10px] text-muted-foreground/70 mb-0.5">Source</p>
                <p className="text-xs font-medium">{mapped.map(m => m.label).join(' + ')}</p>
              </div>
              {trendData.length > 2 && (
                <div className="py-1">
                  <Sparkline data={trendData} type="area" width={220} height={36} color="hsl(var(--primary))" />
                </div>
              )}
              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border/20">
                <div>
                  <p className="text-[9px] text-muted-foreground/60">Min</p>
                  <p className="text-[10px] font-medium tabular-nums">{formatUSD(min)}</p>
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground/60">Avg</p>
                  <p className="text-[10px] font-medium tabular-nums">{formatUSD(avg)}</p>
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground/60">Max</p>
                  <p className="text-[10px] font-medium tabular-nums">{formatUSD(max)}</p>
                </div>
              </div>
              {trendData.length > 0 && (
                <p className="text-[9px] text-muted-foreground/50">{trendData.length} data points</p>
              )}
            </div>
          </HoverCardContent>
        </HoverCard>
      );
    }

    return rowContent;
  };

  const renderFieldSections = (sections: { label: string; fields: string[] }[]) => (
    <div className="space-y-1">
      {sections.map(section => {
        const visibleSectionFields = section.fields.filter(filterField);
        if (visibleSectionFields.length === 0) return null;
        const mapped = section.fields.filter(f => !!fieldMappings[f]).length;
        const total = section.fields.length;
        const pct = total > 0 ? (mapped / total) * 100 : 0;
        return (
          <div key={section.label}>
            <div className="px-2 py-2 bg-muted/30 rounded-sm mb-1 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{section.label}</span>
              <div className="flex items-center gap-2">
                <div className="h-1 w-16 rounded-full overflow-hidden bg-muted/20">
                  <div className="h-full rounded-full transition-all duration-500" style={{
                    width: `${pct}%`,
                    backgroundColor: pct === 100 ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.6)'
                  }} />
                </div>
                <span className="text-[9px] tabular-nums text-muted-foreground">{mapped}/{total}</span>
              </div>
            </div>
            {section.fields.map(field => renderFieldRow(field))}
          </div>
        );
      })}
    </div>
  );

  return (
    <Card className="border-border/30">
      <CardContent className="p-3">
        <div
          ref={panelRef}
          tabIndex={0}
          onKeyDown={handlePanelKeyDown}
          className="outline-none"
        >
          {/* Search + Filter */}
          <div className="mb-3 space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
              <Input
                className="h-7 text-xs pl-7"
                placeholder="Search fields..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Selected row banner */}
            {selectedRowInfo && (
              <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-card border border-cyan-500/30 border-l-[3px] border-l-cyan-400">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground/70 leading-none mb-0.5">
                    {selectedRowInfo.count > 1 ? 'Mapping (multi-row):' : 'Mapping:'}
                  </p>
                  <p className="text-xs font-medium truncate">
                    {selectedRowInfo.accountName}
                    {selectedRowInfo.lastValue !== null && (
                      <span className="text-muted-foreground font-normal">
                        {selectedRowInfo.count > 1 ? ` — Σ ${formatUSD(selectedRowInfo.lastValue)}` : ` — ${formatUSD(selectedRowInfo.lastValue)}`}
                      </span>
                    )}
                  </p>
                  {selectedRowInfo.count > 1 && (selectedRowInfo as any).names && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {((selectedRowInfo as any).names as string[]).slice(0, 5).map((n: string, i: number) => (
                        <Badge key={i} variant="outline" className="text-[8px] h-3.5 px-1">{n}</Badge>
                      ))}
                      {((selectedRowInfo as any).names as string[]).length > 5 && (
                        <span className="text-[8px] text-muted-foreground">+{((selectedRowInfo as any).names as string[]).length - 5}</span>
                      )}
                    </div>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground shrink-0" onClick={onDeselectRows}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}

            <div className="flex gap-1">
              {(['all', 'mapped', 'unmapped'] as const).map(mode => (
                <Button
                  key={mode}
                  variant={filterMode === mode ? 'default' : 'ghost'}
                  size="sm"
                  className="h-5 text-[10px] px-2 rounded-sm flex-1"
                  onClick={() => setFilterMode(mode)}
                >
                  {mode === 'all' ? 'All' : mode === 'mapped' ? `Mapped (${mappedCount})` : `Unmapped (${unmappedCount})`}
                </Button>
              ))}
            </div>
          </div>

          {/* Auto-Map All button — shown when unmapped fields remain and no pending suggestions */}
          {unmappedCount > 0 && pendingCount === 0 && (
            <div className="mb-3">
              <Button
                variant="outline"
                size="sm"
                className="w-full h-8 text-xs gap-2 border-amber-500/30 text-amber-500 hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/40"
                onClick={onAutoMap}
              >
                <Wand2 className="h-3.5 w-3.5" />
                Auto-Map All ({unmappedCount} unmapped)
              </Button>
            </div>
          )}

          {/* Pending auto-map review banner */}
          {pendingCount > 0 && (
            <div className="mb-3 p-2.5 rounded-lg bg-amber-500/[0.08] border border-amber-500/20 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wand2 className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-xs text-amber-500 font-medium">
                    Auto-mapped {pendingCount} of {unmappedCount + pendingCount} unmapped row{unmappedCount + pendingCount !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">Review suggestions below. Accept or reject each one.</p>
              <div className="flex items-center gap-2">
                <Button size="sm" className="h-6 text-[10px] px-3 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={onAcceptAllAutoMaps}>
                  <Check className="h-3 w-3" /> Accept All ({pendingCount})
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-muted-foreground hover:text-destructive" onClick={() => {
                  Object.keys(pendingAutoMaps).forEach(f => onRejectAutoMap(f));
                }}>
                  Dismiss All
                </Button>
              </div>
            </div>
          )}

          {/* Quick-assign for selected rows */}
          {selectedRows.size > 0 && (
            <div className="mb-3 p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 space-y-2">
              <div className="text-xs text-cyan-400 flex items-center gap-2">
                <Check className="h-3.5 w-3.5" />
                {selectedRows.size} row{selectedRows.size !== 1 ? 's' : ''} selected
              </div>
              <div className="flex flex-wrap gap-1">
                {[...IS_FIELDS, ...BS_FIELDS]
                  .filter(f => !fieldMappings[f])
                  .slice(0, 12)
                  .map(f => (
                    <button key={f} onClick={() => onAssignField(f)}
                      className="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[9px] font-medium bg-background/80 hover:bg-cyan-500/20 border border-border/30 hover:border-cyan-500/40 transition-colors text-foreground">
                      {f}
                    </button>
                  ))}
                {[...IS_FIELDS, ...BS_FIELDS].filter(f => !fieldMappings[f]).length > 12 && (
                  <span className="text-[9px] text-muted-foreground px-1 py-0.5">+{[...IS_FIELDS, ...BS_FIELDS].filter(f => !fieldMappings[f]).length - 12} more</span>
                )}
              </div>
            </div>
          )}

          {/* Save progress bar */}
          {mappedCount > 0 && (
            <div className="mb-3 p-2.5 rounded-lg border border-border/30 bg-muted/10 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                <span><span className="font-medium text-foreground">{mappedCount}</span> {mappedCount === 1 ? 'field' : 'fields'} mapped</span>
                {hasUnsavedMappings && (
                  <Badge variant="outline" className="text-[8px] h-4 px-1.5 bg-amber-500/10 text-amber-500 border-amber-500/20">Unsaved</Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5 text-destructive hover:text-destructive" onClick={onClearAllMappings}>
                  <Trash2 className="h-3 w-3" />
                </Button>
                <Button size="sm" variant={hasUnsavedMappings ? "default" : "outline"} className="h-6 text-[10px] px-2.5 gap-1"
                  onClick={onSaveProgress} disabled={!hasUnsavedMappings || isSaving}>
                  {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  {isSaving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          )}

          <ScrollArea className="h-[500px]">
            <div className="space-y-4">
              <div>
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-2">Income Statement</h4>
                {renderFieldSections(IS_SECTIONS)}
              </div>
              <div>
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-2">Balance Sheet</h4>
                {renderFieldSections(BS_SECTIONS)}
              </div>
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
});
