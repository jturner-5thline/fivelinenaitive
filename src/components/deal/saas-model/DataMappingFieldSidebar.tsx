import { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { CheckCircle2, Circle, Sparkles, Check, X, Save, Loader2, Search, Trash2, Wand2, ChevronDown, ArrowLeft, CornerDownRight } from 'lucide-react';
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

export type StatementTypeFilter = 'income-statement' | 'balance-sheet' | 'both';

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
  enabledFields?: Set<string>;
  linkedFieldFromRow?: string | null;
  linkedRowsFromField?: number[];
  hoveredRowIdx?: number | null;
  statementType?: StatementTypeFilter;
  onFieldHover?: (fieldId: string | null) => void;
  onFieldSelect?: (fieldId: string) => void;
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
  flashedFields, pendingAutoMaps, draggingRowIdx, enabledFields,
  linkedFieldFromRow, linkedRowsFromField, hoveredRowIdx,
  statementType = 'both',
  onFieldHover, onFieldSelect,
  onAssignField, onRemoveMapping, onAcceptSuggestion,
  onSaveProgress, onClearAllMappings, onDeselectRows, onAcceptAutoMap, onRejectAutoMap,
  onAcceptAllAutoMaps, onAutoMap, onDropAssign,
}, ref) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'mapped' | 'unmapped'>('all');
  const [focusedFieldIdx, setFocusedFieldIdx] = useState<number>(-1);
  const [dragOverField, setDragOverField] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const allFields = [...IS_FIELDS, ...BS_FIELDS].filter(f => !enabledFields || enabledFields.has(f)) as string[];
  const totalFields = allFields.length;
  const pendingCount = Object.keys(pendingAutoMaps).filter(f => !enabledFields || enabledFields.has(f)).length;
  const enabledMappedCount = Object.keys(fieldMappings).filter(f => !enabledFields || enabledFields.has(f)).length;
  const unmappedCount = totalFields - enabledMappedCount;

  const visibleFields = allFields.filter(field => {
    const matchesSearch = !searchQuery || field.toLowerCase().includes(searchQuery.toLowerCase());
    const isMapped = !!fieldMappings[field];
    if (filterMode === 'mapped') return matchesSearch && isMapped;
    if (filterMode === 'unmapped') return matchesSearch && !isMapped;
    return matchesSearch;
  });

  const focusedField = focusedFieldIdx >= 0 && focusedFieldIdx < visibleFields.length ? visibleFields[focusedFieldIdx] : null;

  // ── Row-selected mode info ──
  const isRowSelected = selectedRows.size > 0;

  const selectedRowInfo = useMemo(() => {
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
      // Get current mapping status
      const currentMapping = Object.entries(fieldMappings).find(([, maps]) =>
        maps.some(m => m.rowIdx === firstRowIdx && m.sheet === sheet.name)
      );
      // Get suggestion for this row
      const rowSuggestion = suggestions.find(s => s.rowIdx === firstRowIdx && s.status === 'pending');
      // Get pending auto-map for this row
      const pendingField = Object.entries(pendingAutoMaps).find(([, v]) => v.rowIdx === firstRowIdx);
      return { accountName, lastValue, rowIdx: firstRowIdx, count: 1, currentMapping, rowSuggestion, pendingField };
    }

    const rowIndices = Array.from(selectedRows).sort((a, b) => a - b);
    const names: string[] = [];
    rowIndices.forEach(idx => {
      const row = sheet.data[idx];
      if (!row) return;
      names.push(row[0] !== null && row[0] !== undefined ? String(row[0]) : `Row ${idx + 1}`);
    });
    return { accountName: `${selectedRows.size} rows selected`, lastValue: null, rowIdx: rowIndices[0], count: selectedRows.size, names, currentMapping: undefined, rowSuggestion: undefined, pendingField: undefined };
  }, [selectedRows, selectedFile, activeSheet, fieldMappings, suggestions, pendingAutoMaps]);

  // ── Ranked likely fields for row-selected mode ──
  const rankedFields = useMemo(() => {
    if (!isRowSelected || !selectedRowInfo) return [];
    const { rowSuggestion, pendingField, currentMapping } = selectedRowInfo;
    const suggested = rowSuggestion?.suggestedField;
    const pending = pendingField?.[0];
    const current = currentMapping?.[0];

    // Collect top candidates: suggestion, pending, then unmapped fields
    const candidates: { field: string; reason: string; priority: number }[] = [];
    if (suggested && (!enabledFields || enabledFields.has(suggested))) {
      candidates.push({ field: suggested, reason: 'Claude suggestion', priority: 0 });
    }
    if (pending && pending !== suggested && (!enabledFields || enabledFields.has(pending))) {
      candidates.push({ field: pending, reason: 'Auto-mapped', priority: 1 });
    }
    if (current && current !== suggested && current !== pending && (!enabledFields || enabledFields.has(current))) {
      candidates.push({ field: current, reason: 'Currently mapped', priority: -1 });
    }
    // Add a few unmapped fields from the same section area
    const unmapped = allFields.filter(f => !fieldMappings[f] && f !== suggested && f !== pending && f !== current);
    unmapped.slice(0, 4).forEach(f => candidates.push({ field: f, reason: 'Unmapped', priority: 2 }));

    return candidates.sort((a, b) => a.priority - b.priority).slice(0, 6);
  }, [isRowSelected, selectedRowInfo, allFields, fieldMappings, enabledFields]);

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

  // Reset expanded section when row selection changes
  useEffect(() => {
    setExpandedSection(null);
  }, [selectedRows]);

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
      const mappings = fieldMappings[focusedField];
      if (mappings.length > 0) onRemoveMapping(focusedField, mappings.length - 1);
    }
  }, [visibleFields.length, focusedField, selectedRows, onAssignField, onDeselectRows, fieldMappings, onRemoveMapping]);

  const getAutoMapConfidence = (fieldName: string): AutoMapResult | undefined =>
    autoMapResults.find(r => r.fieldName === fieldName);

  const getFieldSuggestion = (field: string): MappingSuggestion | undefined =>
    suggestions.find(s => s.suggestedField === field && s.status === 'pending');

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

  const getFieldTrendData = (fieldName: string): number[] => {
    const mappings = fieldMappings[fieldName];
    if (!mappings || !selectedFile) return [];
    const colValues: Record<number, number> = {};
    mappings.forEach(m => {
      const sheet = selectedFile.sheets.find(s => s.name === m.sheet) || selectedFile.sheets[0];
      const row = sheet?.data[m.rowIdx];
      if (!row) return;
      for (let c = 1; c < row.length; c++) {
        const val = typeof row[c] === 'number' ? row[c] as number : parseFloat(String(row[c] || '').replace(/[,$]/g, ''));
        if (!isNaN(val)) colValues[c] = (colValues[c] || 0) + val;
      }
    });
    const cols = Object.keys(colValues).map(Number).sort((a, b) => a - b);
    return cols.map(c => colValues[c]);
  };

  const filterField = (field: string): boolean => {
    if (enabledFields && !enabledFields.has(field)) return false;
    const matchesSearch = !searchQuery || field.toLowerCase().includes(searchQuery.toLowerCase());
    const isMapped = !!fieldMappings[field];
    if (filterMode === 'mapped') return matchesSearch && isMapped;
    if (filterMode === 'unmapped') return matchesSearch && !isMapped;
    return matchesSearch;
  };

  const renderFieldRow = (field: string, compact = false) => {
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
    const isLinkedFromRow = linkedFieldFromRow === field;

    const rowContent = (
      <div key={field} data-field-id={field} className={cn(
        "flex items-center justify-between py-1.5 px-2 rounded group transition-all duration-500",
        isFocused && "ring-1 ring-cyan-400/50 bg-cyan-500/10",
        isDragOver && "ring-2 ring-dashed ring-teal-400 bg-teal-500/10 shadow-[0_0_12px_-2px_hsl(170,60%,50%,0.3)]",
        isLinkedFromRow && !isFocused && !isFlashing && "map-sidebar-field--linked-hover",
        isFlashing
          ? "bg-emerald-500/20 ring-1 ring-emerald-500/30"
          : isMapped ? "bg-emerald-500/5 hover:bg-emerald-500/10"
          : hasPendingAuto ? "bg-amber-500/[0.08] hover:bg-amber-500/[0.12] ring-1 ring-amber-500/20"
          : isDropTarget ? "border border-dashed border-teal-500/30 hover:border-teal-400/50 hover:bg-teal-500/5"
          : fieldSuggestion ? "bg-primary/5 hover:bg-primary/10 ring-1 ring-primary/15"
          : "hover:bg-muted/20"
      )}
      onMouseEnter={() => onFieldHover?.(field)}
      onMouseLeave={() => onFieldHover?.(null)}
      onClick={() => {
        const idx = visibleFields.indexOf(field);
        if (idx >= 0) setFocusedFieldIdx(idx);
        onFieldSelect?.(field);
        if (selectedRows.size > 0 && !hasPendingAuto) {
          if (isMapped && mapped) {
            // Toggle: if all selected rows are already mapped to this field, unmap them
            const selectedArr = Array.from(selectedRows);
            const mappedRows = mapped.map(m => m.rowIdx);
            const allAlreadyMapped = selectedArr.every(r => mappedRows.includes(r));
            if (allAlreadyMapped) {
              // Unmap each selected row from this field (in reverse order to keep indices stable)
              const indicesToRemove = selectedArr
                .map(r => mapped.findIndex(m => m.rowIdx === r))
                .filter(i => i >= 0)
                .sort((a, b) => b - a);
              indicesToRemove.forEach(i => onRemoveMapping(field, i));
              return;
            }
          }
          if (!isMapped) onAssignField(field);
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
          {hasPendingAuto && !isMapped && !compact && (
            <Badge variant="outline" className="text-[8px] h-4 px-1.5 shrink-0 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 gap-0.5">
              <Wand2 className="h-2 w-2" />
              {pendingAuto.label}
            </Badge>
          )}
          {isMapped && !compact && (() => {
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
          {mapped && !compact && (
            <div className="flex gap-1 flex-shrink-0 flex-wrap mt-0.5">
              {mapped.map((m, i) => (
                <Tooltip key={i}>
                  <TooltipTrigger asChild>
                    <span
                      className="inline-flex items-center gap-0.5 rounded bg-muted/60 border border-border/40 px-1 py-px text-[9px] font-medium text-foreground max-w-[110px] group/chip hover:border-destructive/40 hover:bg-destructive/5 transition-colors cursor-default"
                    >
                      <span className="truncate" title={m.label}>{m.label}</span>
                      <button
                        className="flex-shrink-0 rounded-sm p-px text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                        onClick={e => { e.stopPropagation(); onRemoveMapping(field, i); }}
                        aria-label={`Remove mapping for ${m.label}`}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">Remove mapping</TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {sampleVal !== null && !compact && (
            <span className="text-[10px] tabular-nums text-muted-foreground">{formatUSD(sampleVal)}</span>
          )}
          {hasPendingAuto && !isMapped && (
            <div className="flex items-center gap-0.5">
              <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10" onClick={e => { e.stopPropagation(); onAcceptAutoMap(field); }}>
                <Check className="h-3 w-3 mr-0.5" /> Accept
              </Button>
              <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive" onClick={e => { e.stopPropagation(); onRejectAutoMap(field); }}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
          {fieldSuggestion && !isMapped && !hasPendingAuto && (
            <Button size="sm" variant="ghost" className="h-5 text-[10px] px-2 text-primary" onClick={e => { e.stopPropagation(); onAcceptSuggestion(fieldSuggestion.rowIdx); }}>
              <Check className="h-3 w-3 mr-0.5" /> Apply
            </Button>
          )}
          {selectedRows.size > 0 && !hasPendingAuto && !isMapped && !compact && (
            <span className="text-[10px] px-2 text-muted-foreground group-hover:text-primary transition-colors">Assign</span>
          )}
        </div>
      </div>
    );

    if (isMapped && mapped && !compact) {
      const trendData = getFieldTrendData(field);
      const min = trendData.length > 0 ? Math.min(...trendData) : 0;
      const max = trendData.length > 0 ? Math.max(...trendData) : 0;
      const avg = trendData.length > 0 ? trendData.reduce((a, b) => a + b, 0) / trendData.length : 0;
      return (
        <HoverCard key={field} openDelay={300} closeDelay={100}>
          <HoverCardTrigger asChild>{rowContent}</HoverCardTrigger>
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
              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border/[0.06]">
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

  const renderFieldSections = (sections: { label: string; fields: string[] }[], collapseByDefault = false) => (
    <div className="space-y-1">
      {sections.map(section => {
        const sectionEnabled = section.fields.filter(f => !enabledFields || enabledFields.has(f));
        const visibleSectionFields = sectionEnabled.filter(filterField);
        if (visibleSectionFields.length === 0) return null;
        const mapped = sectionEnabled.filter(f => !!fieldMappings[f]).length;
        const total = sectionEnabled.length;
        const pct = total > 0 ? (mapped / total) * 100 : 0;
        const isExpanded = collapseByDefault ? expandedSection === section.label : expandedSection !== null ? expandedSection === section.label : true;

        if (collapseByDefault) {
          return (
            <Collapsible key={section.label} open={isExpanded} onOpenChange={(open) => setExpandedSection(open ? section.label : null)}>
              <CollapsibleTrigger className="w-full">
                <div className="px-2 py-2 bg-secondary/30 rounded-md mb-1 flex items-center justify-between gap-2 hover:bg-secondary/40 transition-colors">
                  <div className="flex items-center gap-2">
                    <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", isExpanded && "rotate-0", !isExpanded && "-rotate-90")} />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{section.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1 w-12 rounded-full overflow-hidden bg-muted/20">
                      <div className="h-full rounded-full transition-all duration-500" style={{
                        width: `${pct}%`,
                        backgroundColor: pct === 100 ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.6)'
                      }} />
                    </div>
                    <span className="text-[9px] tabular-nums text-muted-foreground">{mapped}/{total}</span>
                  </div>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                {sectionEnabled.map(field => renderFieldRow(field))}
              </CollapsibleContent>
            </Collapsible>
          );
        }

        return (
          <div key={section.label}>
            <div className="px-2 py-2 bg-secondary/30 rounded-md mb-1 flex items-center justify-between gap-2">
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
            {sectionEnabled.map(field => renderFieldRow(field))}
          </div>
        );
      })}
    </div>
  );

  // ═══════════════════════════════════════════
  // ROW-SELECTED MODE
  // ═══════════════════════════════════════════
  const renderRowSelectedMode = () => {
    if (!selectedRowInfo) return null;
    const { accountName, lastValue, rowSuggestion, pendingField, currentMapping } = selectedRowInfo;
    const isSingle = selectedRowInfo.count === 1;

    return (
      <div className="space-y-3">
        {/* Back / deselect header */}
        <button
          onClick={onDeselectRows}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors w-full text-left"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to all fields
        </button>

        {/* Selected row summary card */}
        <div className="rounded-lg bg-secondary/50 border border-primary/10 p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Source Row</p>
              <p className="text-sm font-medium truncate">{accountName}</p>
            </div>
            {isSingle && lastValue !== null && (
              <span className="text-xs tabular-nums text-muted-foreground shrink-0">{formatUSD(lastValue)}</span>
            )}
          </div>

          {/* Current status */}
          {isSingle && currentMapping && (
            <div className="flex items-center gap-1.5 text-[10px]">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              <span className="text-muted-foreground">Mapped to</span>
              <span className="font-medium text-emerald-400">{currentMapping[0]}</span>
            </div>
          )}
          {isSingle && !currentMapping && !rowSuggestion && !pendingField && (
            <div className="flex items-center gap-1.5 text-[10px]">
              <Circle className="h-3 w-3 text-muted-foreground/40" />
              <span className="text-muted-foreground">Unmapped — select a field below</span>
            </div>
          )}

          {/* Multi-row names */}
          {!isSingle && (selectedRowInfo as any).names && (
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

        {/* Claude suggestion card */}
        {isSingle && rowSuggestion && (
          <div className="rounded-lg bg-primary/[0.06] border border-primary/15 p-3 space-y-2">
            <div className="flex items-center gap-1.5 mb-1">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-semibold text-primary">Claude Suggestion</span>
            </div>
            <div className="flex items-center gap-2">
              <CornerDownRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
              <span className="text-xs font-medium">{rowSuggestion.suggestedField}</span>
              {rowSuggestion.confidence && (
                <Badge variant="outline" className="text-[8px] h-4 px-1 bg-primary/5 text-primary border-primary/20">
                  {Math.round(rowSuggestion.confidence * 100)}%
                </Badge>
              )}
            </div>
            {rowSuggestion.reasoning && (
              <p className="text-[10px] text-muted-foreground/70 leading-relaxed">{rowSuggestion.reasoning}</p>
            )}
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" className="h-6 text-[10px] px-3 gap-1 bg-primary hover:bg-primary/90 text-primary-foreground" onClick={() => onAcceptSuggestion(rowSuggestion.rowIdx)}>
                <Check className="h-3 w-3" /> Accept
              </Button>
              <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-muted-foreground hover:text-destructive">
                <X className="h-3 w-3 mr-0.5" /> Reject
              </Button>
            </div>
          </div>
        )}

        {/* Pending auto-map card */}
        {isSingle && pendingField && !rowSuggestion && (
          <div className="rounded-lg bg-amber-500/[0.06] border border-amber-500/15 p-3 space-y-2">
            <div className="flex items-center gap-1.5 mb-1">
              <Wand2 className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-[10px] font-semibold text-amber-500">Auto-Map Suggestion</span>
            </div>
            <div className="flex items-center gap-2">
              <CornerDownRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
              <span className="text-xs font-medium">{pendingField[0]}</span>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" className="h-6 text-[10px] px-3 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => onAcceptAutoMap(pendingField[0])}>
                <Check className="h-3 w-3" /> Accept
              </Button>
              <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-muted-foreground hover:text-destructive" onClick={() => onRejectAutoMap(pendingField[0])}>
                <X className="h-3 w-3 mr-0.5" /> Reject
              </Button>
            </div>
          </div>
        )}

        {/* Ranked likely fields */}
        {rankedFields.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
              {currentMapping ? 'Remap to' : 'Assign to'}
            </p>
            {rankedFields.map(({ field, reason }) => (
              <div key={field}>
                {renderFieldRow(field, true)}
              </div>
            ))}
          </div>
        )}

        {/* Browse all fields — collapsed */}
        <Collapsible>
          <CollapsibleTrigger className="w-full">
            <div className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/20 transition-colors">
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Browse all fields</span>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-1.5">
              <div className="relative mb-2">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                <Input className="h-7 text-xs pl-7" placeholder="Search fields..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              </div>
              <ScrollArea className="h-[280px]">
                <div className="space-y-3">
                  {(statementType === 'income-statement' || statementType === 'both') && (
                    <div>
                      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-2">Income Statement</h4>
                      {renderFieldSections(IS_SECTIONS, true)}
                    </div>
                  )}
                  {(statementType === 'balance-sheet' || statementType === 'both') && (
                    <div>
                      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-2">Balance Sheet</h4>
                      {renderFieldSections(BS_SECTIONS, true)}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
  };

  // ═══════════════════════════════════════════
  // DEFAULT MODE (no row selected)
  // ═══════════════════════════════════════════
  const renderDefaultMode = () => (
    <>
      {/* Search + Filter */}
      <div className="mb-3 space-y-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <Input className="h-7 text-xs pl-7" placeholder="Search fields..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {(['all', 'mapped', 'unmapped'] as const).map(mode => (
            <Button
              key={mode}
              variant={filterMode === mode ? 'default' : 'ghost'}
              size="sm"
              className="h-5 text-[10px] px-2 rounded-sm flex-1"
              onClick={() => setFilterMode(mode)}
            >
              {mode === 'all' ? 'All' : mode === 'mapped' ? `Mapped (${enabledMappedCount})` : `Unmapped (${unmappedCount})`}
            </Button>
          ))}
        </div>
      </div>

      {/* Auto-Map All button */}
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
        <div className="mb-3 p-2.5 rounded-lg bg-warning/[0.05] border border-warning/[0.1] space-y-2">
          <div className="flex items-center gap-2">
            <Wand2 className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs text-amber-500 font-medium">
              Auto-mapped {pendingCount} of {unmappedCount + pendingCount} unmapped
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground">Review suggestions below.</p>
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

      {/* Save progress bar */}
      {mappedCount > 0 && (
        <div className="mb-3 p-2.5 rounded-lg border border-border/[0.06] bg-secondary/20 flex items-center justify-between">
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
          {(statementType === 'income-statement' || statementType === 'both') && (
            <div>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-2">Income Statement</h4>
              {renderFieldSections(IS_SECTIONS)}
            </div>
          )}
          {(statementType === 'balance-sheet' || statementType === 'both') && (
            <div>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-2">Balance Sheet</h4>
              {renderFieldSections(BS_SECTIONS)}
            </div>
          )}
        </div>
      </ScrollArea>
    </>
  );

  return (
    <Card className="border-border/[0.06] shadow-md">
      <CardContent className="p-3">
        <div
          ref={panelRef}
          tabIndex={0}
          onKeyDown={handlePanelKeyDown}
          className="outline-none"
        >
          {isRowSelected ? renderRowSelectedMode() : renderDefaultMode()}
        </div>
      </CardContent>
    </Card>
  );
});
