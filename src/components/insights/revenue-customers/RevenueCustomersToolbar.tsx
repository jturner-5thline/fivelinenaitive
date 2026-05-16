import { useState } from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, RefreshCcw, Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { CheckCircle2 } from 'lucide-react';
import { QBO_ENTITIES } from '@/config/qboEntities';
import { useRevenueFilters, type RangePreset, type Comparison, type Granularity } from './filterContext';

const PRESETS: RangePreset[] = ['MTD', 'QTD', 'YTD', 'TTM', 'custom'];
const COMPARISONS: { value: Comparison; label: string }[] = [
  { value: 'prior-year', label: 'vs Prior Year' },
  { value: 'prior-period', label: 'vs Prior Period' },
  { value: 'none', label: 'No Compare' },
];
const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: 'day', label: 'D' },
  { value: 'week', label: 'W' },
  { value: 'month', label: 'M' },
  { value: 'quarter', label: 'Q' },
];

export function RevenueCustomersToolbar() {
  const { filters, setEntities, setRange, setPreset, setComparison, setGranularity } = useRevenueFilters();
  const [entityOpen, setEntityOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);

  const { data: lastSync } = useQuery({
    queryKey: ['qb-last-sync-toolbar'],
    queryFn: async () => {
      const { data } = await (supabase.from('quickbooks_customers') as any)
        .select('synced_at').order('synced_at', { ascending: false }).limit(1);
      return data?.[0]?.synced_at as string | null;
    },
    refetchInterval: 60_000,
  });

  const allSelected = filters.entities.length === QBO_ENTITIES.length;
  const entityLabel = allSelected
    ? 'All entities'
    : filters.entities.length === 0
      ? 'No entities'
      : `${filters.entities.length} entities`;

  const toggleEntity = (realmId: string) => {
    const next = filters.entities.includes(realmId)
      ? filters.entities.filter(r => r !== realmId)
      : [...filters.entities, realmId];
    setEntities(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 px-1 py-2 mb-4 border-b border-border/60">
      <div className="flex-1 min-w-0">
        <h2 className="text-lg font-semibold tracking-tight leading-tight">Revenue &amp; Customers</h2>
        <p className="text-xs text-muted-foreground">
          QuickBooks · {filters.entities.length} of {QBO_ENTITIES.length} entities · {filters.range.preset === 'custom' ? `${format(new Date(filters.range.start), 'MMM d')} – ${format(new Date(filters.range.end), 'MMM d, yyyy')}` : filters.range.preset}
        </p>
      </div>

      {lastSync && (
        <Badge variant="outline" className="text-xs gap-1.5 font-normal h-7">
          <CheckCircle2 className="h-3 w-3 text-success" />
          synced {formatDistanceToNow(new Date(lastSync), { addSuffix: true })}
        </Badge>
      )}

      {/* Entity multi-select */}
      <Popover open={entityOpen} onOpenChange={setEntityOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
            {entityLabel}
            <ChevronsUpDown className="h-3 w-3 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="end">
          <div className="flex items-center justify-between px-1 pb-2 mb-1 border-b border-border/60">
            <span className="text-xs font-medium">Entities</span>
            <button
              type="button"
              onClick={() => setEntities(allSelected ? [] : QBO_ENTITIES.map(e => e.realmId))}
              className="text-[11px] text-primary hover:underline"
            >
              {allSelected ? 'Clear' : 'Select all'}
            </button>
          </div>
          <div className="space-y-1">
            {QBO_ENTITIES.map(e => {
              const checked = filters.entities.includes(e.realmId);
              return (
                <Label
                  key={e.realmId}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent cursor-pointer text-xs font-normal"
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggleEntity(e.realmId)} />
                  <span className="truncate">{e.fullName}</span>
                </Label>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {/* Date range presets */}
      <div className="flex items-center rounded-md border border-border/60 overflow-hidden h-7">
        {PRESETS.filter(p => p !== 'custom').map(p => (
          <button
            key={p}
            onClick={() => setPreset(p)}
            className={cn(
              'px-2.5 text-[11px] font-medium h-full transition-colors',
              filters.range.preset === p
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent',
            )}
          >
            {p}
          </button>
        ))}
        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <button
              className={cn(
                'px-2.5 text-[11px] font-medium h-full transition-colors flex items-center gap-1 border-l border-border/60',
                filters.range.preset === 'custom'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent',
              )}
            >
              <CalendarIcon className="h-3 w-3" />
              {filters.range.preset === 'custom' ? 'Custom' : '…'}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="range"
              selected={{ from: new Date(filters.range.start), to: new Date(filters.range.end) }}
              onSelect={(r: any) => {
                if (r?.from && r?.to) {
                  setRange({ preset: 'custom', start: r.from.toISOString(), end: r.to.toISOString() });
                }
              }}
              numberOfMonths={2}
              className={cn('p-3 pointer-events-auto')}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Comparison */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
            <RefreshCcw className="h-3 w-3" />
            {COMPARISONS.find(c => c.value === filters.comparison)?.label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-44 p-1" align="end">
          {COMPARISONS.map(c => (
            <button
              key={c.value}
              onClick={() => setComparison(c.value)}
              className={cn(
                'w-full text-left px-2 py-1.5 text-xs rounded-md hover:bg-accent flex items-center gap-2',
                filters.comparison === c.value && 'bg-accent',
              )}
            >
              {filters.comparison === c.value && <Check className="h-3 w-3" />}
              <span className={cn(filters.comparison !== c.value && 'pl-5')}>{c.label}</span>
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {/* Granularity */}
      <div className="flex items-center rounded-md border border-border/60 overflow-hidden h-7">
        {GRANULARITIES.map(g => (
          <button
            key={g.value}
            onClick={() => setGranularity(g.value)}
            className={cn(
              'px-2 text-[11px] font-medium h-full transition-colors',
              filters.granularity === g.value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent',
            )}
          >
            {g.label}
          </button>
        ))}
      </div>
    </div>
  );
}