import { useState, useMemo, ReactNode } from 'react';
import { Filter, Check, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { Deal, STATUS_CONFIG, ENGAGEMENT_TYPE_CONFIG, DealStatus, EngagementType } from '@/types/deal';
import { useDealStages } from '@/contexts/DealStagesContext';
import { useDealTypes } from '@/contexts/DealTypesContext';
import type { DealListColumnId } from '@/hooks/useDealListColumnOrder';
import type { DealFilters } from '@/hooks/useDeals';

interface Props {
  column: DealListColumnId;
  deals: Deal[]; // unfiltered set, used to derive option lists
  filters: DealFilters;
  setFilters: (next: Partial<DealFilters>) => void;
  active: boolean;
}

/** Per-column filter funnel + popover. Renders nothing for columns
 *  that don't support filtering (e.g. lateMilestones uses a toggle below). */
export function DealsHeaderFilterPopover({ column, deals, filters, setFilters, active }: Props) {
  const [open, setOpen] = useState(false);
  const content = useFilterBody(column, deals, filters, setFilters);
  if (!content) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Filter column"
          onClick={(e) => { e.stopPropagation(); }}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            'p-0.5 rounded transition-colors',
            active ? 'text-primary' : 'text-muted-foreground/50 hover:text-muted-foreground',
          )}
        >
          <Filter className={cn('h-3 w-3', active && 'fill-current')} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-64 p-3"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {content}
      </PopoverContent>
    </Popover>
  );
}

function useFilterBody(
  column: DealListColumnId,
  deals: Deal[],
  filters: DealFilters,
  setFilters: (next: Partial<DealFilters>) => void,
): ReactNode {
  const { stages } = useDealStages();
  const { dealTypes } = useDealTypes();

  if (column === 'company') {
    return (
      <TextFilter
        label="Company contains"
        value={filters.companyContains || ''}
        onChange={(v) => setFilters({ companyContains: v })}
      />
    );
  }
  if (column === 'value') {
    return (
      <RangeFilter
        label="Deal value"
        min={filters.valueMin ?? null}
        max={filters.valueMax ?? null}
        onChange={(min, max) => setFilters({ valueMin: min, valueMax: max })}
      />
    );
  }
  if (column === 'totalFee') {
    return (
      <RangeFilter
        label="Total fee"
        min={filters.totalFeeMin ?? null}
        max={filters.totalFeeMax ?? null}
        onChange={(min, max) => setFilters({ totalFeeMin: min, totalFeeMax: max })}
      />
    );
  }
  if (column === 'totalHours') {
    return (
      <RangeFilter
        label="Total hours"
        min={filters.totalHoursMin ?? null}
        max={filters.totalHoursMax ?? null}
        onChange={(min, max) => setFilters({ totalHoursMin: min, totalHoursMax: max })}
      />
    );
  }
  if (column === 'revenuePerHour') {
    return (
      <RangeFilter
        label="Revenue / hour"
        min={filters.revenuePerHourMin ?? null}
        max={filters.revenuePerHourMax ?? null}
        onChange={(min, max) => setFilters({ revenuePerHourMin: min, revenuePerHourMax: max })}
      />
    );
  }
  if (column === 'status') {
    const options = Object.entries(STATUS_CONFIG).map(([id, c]) => ({ id, label: c.label }));
    return (
      <MultiSelectFilter
        label="Status"
        options={options}
        selected={filters.status as string[]}
        onChange={(next) => setFilters({ status: next as DealStatus[] })}
      />
    );
  }
  if (column === 'stage') {
    const options = stages.map((s) => ({ id: s.id, label: s.label }));
    return (
      <MultiSelectFilter
        label="Stage"
        options={options}
        selected={filters.stage as string[]}
        onChange={(next) => setFilters({ stage: next as any })}
      />
    );
  }
  if (column === 'type') {
    const options = Object.entries(ENGAGEMENT_TYPE_CONFIG).map(([id, c]) => ({ id, label: c.label }));
    return (
      <MultiSelectFilter
        label="Engagement"
        options={options}
        selected={filters.engagementType as string[]}
        onChange={(next) => setFilters({ engagementType: next as EngagementType[] })}
      />
    );
  }
  if (column === 'manager') {
    const options = useMemo(() => {
      const set = new Set<string>();
      deals.forEach((d) => { if (d.manager) set.add(d.manager); });
      return Array.from(set).sort().map((m) => ({ id: m, label: m }));
    }, [deals]);
    return (
      <MultiSelectFilter
        label="Manager"
        options={options}
        selected={filters.manager}
        onChange={(next) => setFilters({ manager: next })}
      />
    );
  }
  if (column === 'dealType') {
    const options = dealTypes.map((d) => ({ id: d.id, label: d.label }));
    return (
      <MultiSelectFilter
        label="Deal type"
        options={options}
        selected={filters.dealType}
        onChange={(next) => setFilters({ dealType: next })}
      />
    );
  }
  if (column === 'updated') {
    const opts: { id: number | null; label: string }[] = [
      { id: null, label: 'All time' },
      { id: 7, label: 'Last 7 days' },
      { id: 30, label: 'Last 30 days' },
      { id: 90, label: 'Last 90 days' },
    ];
    return (
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Updated</div>
        {opts.map((o) => {
          const sel = (filters.updatedWithinDays ?? null) === o.id;
          return (
            <button
              key={String(o.id)}
              type="button"
              onClick={() => setFilters({ updatedWithinDays: o.id })}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors',
                sel ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60',
              )}
            >
              <span className={cn('flex h-3.5 w-3.5 items-center justify-center rounded-full border shrink-0', sel ? 'bg-primary border-primary text-primary-foreground' : 'border-border')}>
                {sel && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
              </span>
              {o.label}
            </button>
          );
        })}
      </div>
    );
  }
  if (column === 'lateMilestones') {
    return (
      <label className="flex items-center gap-2 text-xs cursor-pointer">
        <Checkbox
          checked={!!filters.hasLateMilestonesOnly}
          onCheckedChange={(v) => setFilters({ hasLateMilestonesOnly: !!v })}
        />
        Only deals with late milestones
      </label>
    );
  }
  return null;
}

function TextFilter({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <Input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type to filter…"
        className="h-8 text-xs"
      />
      {value && (
        <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => onChange('')}>
          <X className="h-3 w-3 mr-1" /> Clear
        </Button>
      )}
    </div>
  );
}

function RangeFilter({
  label,
  min,
  max,
  onChange,
}: {
  label: string;
  min: number | null;
  max: number | null;
  onChange: (min: number | null, max: number | null) => void;
}) {
  const parse = (s: string): number | null => {
    const t = s.trim();
    if (!t) return null;
    const n = Number(t.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2">
        <Input
          inputMode="decimal"
          placeholder="Min"
          defaultValue={min ?? ''}
          onBlur={(e) => onChange(parse(e.target.value), max)}
          className="h-8 text-xs"
        />
        <span className="text-muted-foreground text-xs">–</span>
        <Input
          inputMode="decimal"
          placeholder="Max"
          defaultValue={max ?? ''}
          onBlur={(e) => onChange(min, parse(e.target.value))}
          className="h-8 text-xs"
        />
      </div>
      {(min != null || max != null) && (
        <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => onChange(null, null)}>
          <X className="h-3 w-3 mr-1" /> Clear
        </Button>
      )}
    </div>
  );
}

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        {selected.length > 0 && (
          <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground" onClick={() => onChange([])}>
            Clear
          </button>
        )}
      </div>
      <div className="max-h-[240px] overflow-y-auto -mx-1">
        {options.length === 0 ? (
          <div className="px-2 py-3 text-[11px] text-muted-foreground text-center">No options</div>
        ) : (
          options.map((opt) => {
            const sel = selected.includes(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => toggle(opt.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors',
                  sel ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60',
                )}
              >
                <span className={cn('flex h-3.5 w-3.5 items-center justify-center rounded-sm border shrink-0', sel ? 'bg-primary border-primary text-primary-foreground' : 'border-border')}>
                  {sel && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                </span>
                <span className="flex-1 truncate">{opt.label}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}