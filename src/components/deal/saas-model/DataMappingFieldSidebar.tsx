import { useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { CheckCircle2, Circle, Sparkles, Check, X, Save, Loader2, Search, Trash2 } from 'lucide-react';
import { IS_FIELDS, BS_FIELDS, type FieldMapping } from './types';
import { IS_SECTIONS, BS_SECTIONS, getConfidencePct, type AutoMapResult } from './dataMappingUtils';
import { formatUSD } from '@/lib/formatters/currency';
import type { MappingSuggestion } from '@/hooks/useMappingSuggestions';
import type { AnalyzedFile } from './dataMappingUtils';

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
  onAssignField: (field: string) => void;
  onRemoveMapping: (field: string, idx: number) => void;
  onAcceptSuggestion: (rowIdx: number) => void;
  onSaveProgress: () => void;
  onClearAllMappings: () => void;
}

export function DataMappingFieldSidebar({
  fieldMappings, selectedRows, autoMapResults, suggestions, mappedCount,
  lastSavedCount, hasUnsavedMappings, isSaving, selectedFile,
  onAssignField, onRemoveMapping, onAcceptSuggestion, onSaveProgress, onClearAllMappings,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'mapped' | 'unmapped'>('all');

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

    return (
      <div key={field} className={cn(
        "flex items-center justify-between py-1.5 px-2 rounded group transition-colors",
        isMapped ? "bg-emerald-500/5 hover:bg-emerald-500/10"
          : fieldSuggestion ? "bg-primary/5 hover:bg-primary/10 ring-1 ring-primary/15"
          : "hover:bg-muted/20"
      )}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isMapped ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
            : fieldSuggestion ? <Sparkles className="h-3.5 w-3.5 text-primary flex-shrink-0" />
            : <Circle className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />}
          <span className={cn("text-xs truncate", isMapped && "font-medium")}>{field}</span>
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
          {fieldSuggestion && !isMapped && (
            <Badge variant="outline" className="text-[8px] h-4 px-1 bg-primary/5 text-primary border-primary/20 shrink-0">
              AI · Row {fieldSuggestion.rowIdx + 1}
            </Badge>
          )}
          {mapped && (
            <div className="flex gap-1 flex-shrink-0">
              {mapped.map((m, i) => (
                <Badge key={i} variant="secondary" className="text-[9px] h-4 gap-1 max-w-[100px] truncate">
                  {m.label}
                  <X className="h-2.5 w-2.5 cursor-pointer flex-shrink-0" onClick={e => { e.stopPropagation(); onRemoveMapping(field, i); }} />
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {sampleVal !== null && (
            <span className="text-[10px] tabular-nums text-muted-foreground">{formatUSD(sampleVal)}</span>
          )}
          {fieldSuggestion && !isMapped && (
            <Button size="sm" variant="ghost" className="h-5 text-[10px] px-2 text-primary" onClick={() => onAcceptSuggestion(fieldSuggestion.rowIdx)}>
              <Check className="h-3 w-3 mr-0.5" /> Apply
            </Button>
          )}
          {selectedRows.size > 0 && (
            <Button size="sm" variant="ghost" className="h-5 text-[10px] px-2 opacity-0 group-hover:opacity-100" onClick={() => onAssignField(field)}>Assign</Button>
          )}
        </div>
      </div>
    );
  };

  const renderFieldSections = (sections: { label: string; fields: string[] }[]) => (
    <div className="space-y-1">
      {sections.map(section => {
        const visibleFields = section.fields.filter(filterField);
        if (visibleFields.length === 0) return null;
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
          <div className="flex gap-1">
            {(['all', 'mapped', 'unmapped'] as const).map(mode => (
              <Button
                key={mode}
                variant={filterMode === mode ? 'default' : 'ghost'}
                size="sm"
                className="h-5 text-[10px] px-2 rounded-sm flex-1"
                onClick={() => setFilterMode(mode)}
              >
                {mode === 'all' ? 'All' : mode === 'mapped' ? `Mapped (${mappedCount})` : `Unmapped (${(IS_FIELDS.length + BS_FIELDS.length) - mappedCount})`}
              </Button>
            ))}
          </div>
        </div>

        {/* Quick-assign for selected rows */}
        {selectedRows.size > 0 && (
          <div className="mb-3 p-2.5 rounded-lg bg-primary/10 border border-primary/20 space-y-2">
            <div className="text-xs text-primary flex items-center gap-2">
              <Check className="h-3.5 w-3.5" />
              {selectedRows.size} row{selectedRows.size !== 1 ? 's' : ''} selected
            </div>
            <div className="flex flex-wrap gap-1">
              {[...IS_FIELDS, ...BS_FIELDS]
                .filter(f => !fieldMappings[f])
                .slice(0, 12)
                .map(f => (
                  <button key={f} onClick={() => onAssignField(f)}
                    className="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[9px] font-medium bg-background/80 hover:bg-primary/20 border border-border/30 hover:border-primary/40 transition-colors text-foreground">
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
      </CardContent>
    </Card>
  );
}
