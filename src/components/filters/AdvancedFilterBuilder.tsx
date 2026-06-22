import { useCallback, useMemo } from 'react';
import { X, Plus, Filter, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { FilterField, FilterRule, MatchMode } from '@/lib/filterTypes';
import { OPERATORS_BY_TYPE, operatorNeedsValue, createEmptyRule } from '@/lib/filterTypes';
import { useState } from 'react';

interface AdvancedFilterBuilderProps {
  availableFields: FilterField[];
  filters: FilterRule[];
  onFiltersChange: (filters: FilterRule[]) => void;
  matchMode: MatchMode;
  onMatchModeChange: (mode: MatchMode) => void;
}

export function AdvancedFilterBuilder({
  availableFields,
  filters,
  onFiltersChange,
  matchMode,
  onMatchModeChange,
}: AdvancedFilterBuilderProps) {
  const [open, setOpen] = useState(false);
  const activeCount = filters.filter((r) => r.field && r.operator).length;

  const fieldMap = useMemo(() => {
    const m = new Map<string, FilterField>();
    availableFields.forEach((f) => m.set(f.name, f));
    return m;
  }, [availableFields]);

  const groupedFields = useMemo(() => {
    const groups = new Map<string, FilterField[]>();
    availableFields.forEach((f) => {
      const cat = f.category || 'Other';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(f);
    });
    return groups;
  }, [availableFields]);

  const addRule = useCallback(() => {
    onFiltersChange([...filters, createEmptyRule()]);
  }, [filters, onFiltersChange]);

  const removeRule = useCallback(
    (id: string) => {
      onFiltersChange(filters.filter((r) => r.id !== id));
    },
    [filters, onFiltersChange],
  );

  const updateRule = useCallback(
    (id: string, patch: Partial<FilterRule>) => {
      onFiltersChange(
        filters.map((r) => {
          if (r.id !== id) return r;
          const updated = { ...r, ...patch };
          // Reset operator + value when field changes
          if (patch.field && patch.field !== r.field) {
            updated.operator = '';
            updated.value = '';
          }
          // Reset value when operator changes
          if (patch.operator && patch.operator !== r.operator) {
            const needsVal = operatorNeedsValue(patch.operator);
            if (!needsVal) updated.value = '';
          }
          return updated;
        }),
      );
    },
    [filters, onFiltersChange],
  );

  const clearAll = useCallback(() => {
    onFiltersChange([]);
  }, [onFiltersChange]);

  return (
    <div className="space-y-2">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5" aria-label="Advanced Filters">
            <Filter className="h-3.5 w-3.5" />
            {activeCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5 text-xs">
                {activeCount}
              </Badge>
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            {/* Match mode toggle */}
            {filters.length > 1 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground pb-2 border-b border-border">
                <span>Match</span>
                <button
                  onClick={() => onMatchModeChange(matchMode === 'all' ? 'any' : 'all')}
                  className={cn(
                    'font-semibold px-2 py-0.5 rounded text-xs transition-colors',
                    matchMode === 'all'
                      ? 'bg-primary/20 text-primary'
                      : 'bg-accent text-accent-foreground',
                  )}
                >
                  {matchMode === 'all' ? 'ALL' : 'ANY'}
                </button>
                <span>of the following filters</span>
              </div>
            )}

            {/* Filter rows */}
            <div className="space-y-2">
              {filters.map((rule, idx) => (
                <FilterRow
                  key={rule.id}
                  rule={rule}
                  index={idx}
                  fieldMap={fieldMap}
                  groupedFields={groupedFields}
                  onUpdate={(patch) => updateRule(rule.id, patch)}
                  onRemove={() => removeRule(rule.id)}
                />
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={addRule} className="gap-1.5 text-xs">
                <Plus className="h-3 w-3" />
                Add filter
              </Button>
              {filters.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearAll} className="gap-1.5 text-xs text-muted-foreground">
                  <Trash2 className="h-3 w-3" />
                  Clear all
                </Button>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

/* ────── Single filter row ────── */

interface FilterRowProps {
  rule: FilterRule;
  index: number;
  fieldMap: Map<string, FilterField>;
  groupedFields: Map<string, FilterField[]>;
  onUpdate: (patch: Partial<FilterRule>) => void;
  onRemove: () => void;
}

function FilterRow({ rule, fieldMap, groupedFields, onUpdate, onRemove }: FilterRowProps) {
  const fieldDef = fieldMap.get(rule.field);
  const operators = fieldDef ? OPERATORS_BY_TYPE[fieldDef.type] : [];
  const showValue = rule.operator && operatorNeedsValue(rule.operator);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Field selector */}
      <Select value={rule.field} onValueChange={(v) => onUpdate({ field: v })}>
        <SelectTrigger className="w-[180px] h-8 text-xs">
          <SelectValue placeholder="Select field…" />
        </SelectTrigger>
        <SelectContent className="max-h-[300px]">
          {Array.from(groupedFields.entries()).map(([cat, fields]) => (
            <SelectGroup key={cat}>
              <SelectLabel className="text-xs text-muted-foreground">{cat}</SelectLabel>
              {fields.map((f) => (
                <SelectItem key={f.name} value={f.name} className="text-xs">
                  {f.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>

      {/* Operator selector */}
      {rule.field && (
        <Select value={rule.operator} onValueChange={(v) => onUpdate({ operator: v })}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="Select operator…" />
          </SelectTrigger>
          <SelectContent>
            {operators.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Value input */}
      {showValue && fieldDef && <ValueInput fieldDef={fieldDef} rule={rule} onUpdate={onUpdate} />}

      {/* Remove */}
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onRemove}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/* ────── Value input by type ────── */

interface ValueInputProps {
  fieldDef: FilterField;
  rule: FilterRule;
  onUpdate: (patch: Partial<FilterRule>) => void;
}

function ValueInput({ fieldDef, rule, onUpdate }: ValueInputProps) {
  const isMulti = rule.operator === 'is_any_of' || rule.operator === 'is_none_of';

  if (fieldDef.type === 'boolean') {
    return (
      <Switch
        checked={rule.value === true || rule.value === 'true'}
        onCheckedChange={(v) => onUpdate({ value: v })}
      />
    );
  }

  if (fieldDef.type === 'enum' && fieldDef.options?.length) {
    if (isMulti) {
      const selected = Array.isArray(rule.value) ? rule.value : rule.value ? [String(rule.value)] : [];
      return (
        <div className="flex flex-wrap gap-1 items-center">
          {fieldDef.options.map((opt) => {
            const active = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => {
                  const next = active ? selected.filter((s) => s !== opt.value) : [...selected, opt.value];
                  onUpdate({ value: next });
                }}
                className={cn(
                  'text-xs px-2 py-0.5 rounded-full border transition-colors',
                  active ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50',
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      );
    }
    return (
      <Select value={String(rule.value)} onValueChange={(v) => onUpdate({ value: v })}>
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {fieldDef.options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (fieldDef.type === 'date') {
    if (rule.operator === 'in_last_days' || rule.operator === 'in_next_days') {
      return (
        <Input
          type="number"
          placeholder="days"
          className="w-[100px] h-8 text-xs"
          value={String(rule.value || '')}
          onChange={(e) => onUpdate({ value: e.target.value ? Number(e.target.value) : '' })}
        />
      );
    }
    const dateVal = rule.value ? new Date(String(rule.value)) : undefined;
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs w-[140px] justify-start font-normal">
            {dateVal ? format(dateVal, 'MMM d, yyyy') : 'Pick date…'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={dateVal}
            onSelect={(d) => onUpdate({ value: d ? d.toISOString() : '' })}
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    );
  }

  if (fieldDef.type === 'number') {
    return (
      <Input
        type="number"
        placeholder="Value"
        className="w-[120px] h-8 text-xs"
        value={String(rule.value || '')}
        onChange={(e) => onUpdate({ value: e.target.value ? Number(e.target.value) : '' })}
      />
    );
  }

  // text
  return (
    <Input
      type="text"
      placeholder="Value"
      className="w-[180px] h-8 text-xs"
      value={String(rule.value || '')}
      onChange={(e) => onUpdate({ value: e.target.value })}
    />
  );
}
