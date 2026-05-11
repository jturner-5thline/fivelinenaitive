import { useMemo } from 'react';
import { Check, ChevronDown, X, Filter, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  NaitiveFilterKey,
  NaitiveFilterOption,
  NaitivePipelineFilterState,
  NaitiveDateRangePreset,
  NaitiveDateField,
} from '@/hooks/useNaitivePipelineFilters';

interface NaitivePipelineFilterBarProps {
  filters: NaitivePipelineFilterState;
  options: Record<'owner' | 'icp' | 'stage' | 'source' | 'outcome', NaitiveFilterOption[]>;
  activeCount: number;
  totalCount: number;
  matchedCount: number;
  onSetMulti: (key: NaitiveFilterKey, values: string[]) => void;
  onSetDateRange: (range: NaitiveDateRangePreset) => void;
  onSetDateField: (field: NaitiveDateField) => void;
  onClearAll: () => void;
  /** Show the date range filter (analytics dashboard only). */
  showDateRange?: boolean;
  /** When true, the bar is sticky just below the page header. */
  sticky?: boolean;
}

interface MultiPillProps {
  label: string;
  options: NaitiveFilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}

function MultiPill({ label, options, selected, onChange }: MultiPillProps) {
  const active = selected.length > 0;
  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 h-8 rounded-full border px-3 text-xs font-medium transition-all',
            active
              ? 'border-primary/50 bg-primary/15 text-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.25)]'
              : 'border-border/60 bg-background/40 text-foreground/80 hover:bg-background/70 hover:border-border',
          )}
        >
          <span>{label}</span>
          {active && (
            <Badge
              variant="secondary"
              className="h-4 min-w-4 px-1 rounded-full bg-primary text-[10px] text-primary-foreground tabular-nums"
            >
              {selected.length}
            </Badge>
          )}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput placeholder={`Search ${label.toLowerCase()}…`} className="h-9" />
          <CommandList>
            <CommandEmpty>No options.</CommandEmpty>
            <CommandGroup>
              {options.length === 0 && (
                <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                  No values yet
                </div>
              )}
              {options.map((opt) => {
                const checked = selected.includes(opt.value);
                return (
                  <CommandItem
                    key={opt.value}
                    onSelect={() => toggle(opt.value)}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <span
                      className={cn(
                        'inline-flex h-4 w-4 items-center justify-center rounded border',
                        checked
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border',
                      )}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className="text-sm truncate">{opt.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
          {selected.length > 0 && (
            <div className="border-t p-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 text-xs justify-center"
                onClick={() => onChange([])}
              >
                Clear {label}
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function NaitivePipelineFilterBar({
  filters,
  options,
  activeCount,
  totalCount,
  matchedCount,
  onSetMulti,
  onSetDateRange,
  onSetDateField,
  onClearAll,
  showDateRange = false,
  sticky = true,
}: NaitivePipelineFilterBarProps) {
  const multiConfigs = useMemo(
    () => [
      { key: 'owner' as const, label: 'Owner' },
      { key: 'icp' as const, label: 'ICP Category' },
      { key: 'stage' as const, label: 'Stage' },
      { key: 'source' as const, label: 'Source' },
      { key: 'outcome' as const, label: 'Outcome' },
    ],
    [],
  );

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 py-2 px-1',
        sticky && 'sticky top-0 z-20 -mx-1 px-1 bg-background/85 backdrop-blur-md',
      )}
    >
      <Filter className="h-3.5 w-3.5 text-muted-foreground hidden sm:inline-block ml-1" />

      {/* Desktop: inline pills. Mobile (sm:hidden) collapses to a single button. */}
      <div className="hidden sm:flex flex-wrap items-center gap-2">
        {multiConfigs.map((c) => (
          <MultiPill
            key={c.key}
            label={c.label}
            options={options[c.key]}
            selected={filters[c.key]}
            onChange={(vals) => onSetMulti(c.key, vals)}
          />
        ))}

        {showDateRange && (
          <div className="inline-flex items-center gap-1.5 h-8 rounded-full border border-border/60 bg-background/40 px-2 text-xs">
            <Calendar className="h-3 w-3 text-muted-foreground" />
            <Select value={filters.dateField} onValueChange={(v) => onSetDateField(v as NaitiveDateField)}>
              <SelectTrigger className="h-6 border-0 bg-transparent shadow-none px-1 text-xs gap-1 w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created">Created</SelectItem>
                <SelectItem value="closing">Close date</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-muted-foreground">·</span>
            <Select value={filters.dateRange} onValueChange={(v) => onSetDateRange(v as NaitiveDateRangePreset)}>
              <SelectTrigger
                className={cn(
                  'h-6 border-0 bg-transparent shadow-none px-1 text-xs gap-1 w-auto',
                  filters.dateRange !== 'all' && 'text-primary font-semibold',
                )}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="last30">Last 30 days</SelectItem>
                <SelectItem value="last90">Last 90 days</SelectItem>
                <SelectItem value="thisYear">This year</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Mobile collapsed trigger */}
      <div className="sm:hidden flex-1">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="w-full justify-between gap-2">
              <span className="inline-flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5" />
                Filters
                {activeCount > 0 && (
                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                    {activeCount}
                  </Badge>
                )}
              </span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[calc(100vw-2rem)] max-w-sm p-3 space-y-2">
            {multiConfigs.map((c) => (
              <div key={c.key}>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                  {c.label}
                </div>
                <MultiPill
                  label={c.label}
                  options={options[c.key]}
                  selected={filters[c.key]}
                  onChange={(vals) => onSetMulti(c.key, vals)}
                />
              </div>
            ))}
            {showDateRange && (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                  Date Range
                </div>
                <Select value={filters.dateRange} onValueChange={(v) => onSetDateRange(v as NaitiveDateRangePreset)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All time</SelectItem>
                    <SelectItem value="last30">Last 30 days</SelectItem>
                    <SelectItem value="last90">Last 90 days</SelectItem>
                    <SelectItem value="thisYear">This year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>

      {/* Right cluster: result count + clear */}
      <div className="ml-auto flex items-center gap-2">
        {activeCount > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            Showing <span className="font-semibold text-foreground">{matchedCount}</span> of{' '}
            <span className="font-semibold text-foreground">{totalCount}</span> deals
          </span>
        )}
        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={onClearAll}
          >
            <X className="h-3 w-3" />
            Clear all
          </Button>
        )}
      </div>
    </div>
  );
}
