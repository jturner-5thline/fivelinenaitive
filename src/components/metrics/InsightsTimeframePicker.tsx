import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, ChevronDown, Loader2 } from 'lucide-react';
import { useIsFetching } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  useInsightsTimeframe,
  type InsightsTimeframeId,
} from '@/contexts/InsightsTimeframeContext';

const PRESETS: { id: InsightsTimeframeId; label: string; short: string }[] = [
  { id: '7d',  label: 'Last 7 days',  short: '7D'  },
  { id: '30d', label: 'Last 30 days', short: '30D' },
  { id: '90d', label: 'Last 90 days', short: '90D' },
  { id: 'mtd', label: 'Month to date', short: 'MTD' },
  { id: 'qtd', label: 'Quarter to date', short: 'QTD' },
  { id: 'ytd', label: 'Year to date', short: 'YTD' },
];

export function InsightsTimeframePicker({ className }: { className?: string }) {
  const { timeframe, setTimeframe } = useInsightsTimeframe();
  const [open, setOpen] = useState(false);

  const fetchingCount = useIsFetching({
    predicate: (q) => {
      const key = q.queryKey;
      if (!Array.isArray(key)) return false;
      const prefix = String(key[0] ?? '');
      return (
        prefix.startsWith('qb-') ||
        prefix.startsWith('stage-entry') ||
        prefix.startsWith('pipeline-') ||
        prefix.startsWith('entity-profit') ||
        prefix.startsWith('executive-dashboard')
      );
    },
  });
  const isRefreshing = fetchingCount > 0;

  const [customStart, setCustomStart] = useState<Date | undefined>(
    timeframe.id === 'custom' ? new Date(timeframe.start + 'T00:00:00') : undefined,
  );
  const [customEnd, setCustomEnd] = useState<Date | undefined>(
    timeframe.id === 'custom' ? new Date(timeframe.end + 'T00:00:00') : undefined,
  );

  const fmtY = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const applyCustom = () => {
    if (!customStart || !customEnd) return;
    const [s, e] = customStart <= customEnd ? [customStart, customEnd] : [customEnd, customStart];
    setTimeframe('custom', { start: fmtY(s), end: fmtY(e) });
    setOpen(false);
  };

  const triggerLabel = useMemo(() => {
    if (timeframe.id === 'custom') return timeframe.label;
    const p = PRESETS.find(p => p.id === timeframe.id);
    return p?.label ?? timeframe.label;
  }, [timeframe]);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {isRefreshing ? (
        <Loader2 className="h-4 w-4 text-primary animate-spin" aria-label="Refreshing dashboards" />
      ) : (
        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'h-9 text-xs justify-between min-w-[180px] transition-colors',
              isRefreshing && 'border-primary/40 text-primary',
            )}
            aria-busy={isRefreshing}
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronDown className="h-3.5 w-3.5 ml-2 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3 pointer-events-auto" align="end">
          <div className="w-[320px] space-y-3">
            <div className="grid grid-cols-3 gap-1.5">
              {PRESETS.map(p => {
                const active = timeframe.id === p.id;
                return (
                  <Button
                    key={p.id}
                    variant={active ? 'default' : 'outline'}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => { setTimeframe(p.id); setOpen(false); }}
                  >
                    {p.short}
                  </Button>
                );
              })}
            </div>
            <div className="border-t border-border pt-3 space-y-2">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Custom range
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Calendar
                  mode="single"
                  selected={customStart}
                  onSelect={setCustomStart}
                  className="p-2 pointer-events-auto rounded-md border"
                />
                <Calendar
                  mode="single"
                  selected={customEnd}
                  onSelect={setCustomEnd}
                  className="p-2 pointer-events-auto rounded-md border"
                />
              </div>
              <div className="flex items-center justify-between pt-1">
                <div className="text-[11px] text-muted-foreground">
                  {customStart && customEnd
                    ? `${format(customStart, 'MMM d, yyyy')} – ${format(customEnd, 'MMM d, yyyy')}`
                    : 'Pick a start and end date'}
                </div>
                <Button size="sm" className="h-7 text-xs" disabled={!customStart || !customEnd} onClick={applyCustom}>
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
