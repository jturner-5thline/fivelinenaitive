import { useEffect, useMemo, useState } from 'react';
import { CalendarIcon, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  Granularity,
  TIME_RANGE_PRESETS,
  TimeRangePresetId,
  loadPersistedRange,
  resolveRange,
  savePersistedRange,
  defaultGranularityForRange,
  type ResolvedRange,
} from '@/lib/insightsTimeRange';

export interface InsightsTimeRangeValue {
  presetId: TimeRangePresetId;
  granularity: Granularity;
  custom?: { start: string; end: string };
  resolved: ResolvedRange;
}

interface Props {
  boardId: string;
  defaultPresetId?: TimeRangePresetId;
  defaultGranularity?: Granularity;
  onChange: (value: InsightsTimeRangeValue) => void;
}

const GRANULARITIES: { id: Granularity; label: string }[] = [
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'yearly', label: 'Yearly' },
];

export function InsightsTimeRangeSelector({
  boardId,
  defaultPresetId = 'ytd',
  defaultGranularity = 'monthly',
  onChange,
}: Props) {
  const persisted = useMemo(() => loadPersistedRange(boardId), [boardId]);
  const [presetId, setPresetId] = useState<TimeRangePresetId>(persisted?.presetId ?? defaultPresetId);
  const [granularity, setGranularity] = useState<Granularity>(persisted?.granularity ?? defaultGranularity);
  const [custom, setCustom] = useState<{ start: string; end: string } | undefined>(persisted?.custom);
  const [customOpen, setCustomOpen] = useState(false);
  const [customStart, setCustomStart] = useState<Date | undefined>(
    persisted?.custom?.start ? new Date(persisted.custom.start + 'T00:00:00') : undefined,
  );
  const [customEnd, setCustomEnd] = useState<Date | undefined>(
    persisted?.custom?.end ? new Date(persisted.custom.end + 'T00:00:00') : undefined,
  );

  const resolved = useMemo(() => resolveRange(presetId, custom), [presetId, custom]);

  useEffect(() => {
    onChange({ presetId, granularity, custom, resolved });
    savePersistedRange(boardId, { presetId, granularity, custom });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId, granularity, custom, resolved.start, resolved.end]);

  const handlePreset = (id: TimeRangePresetId) => {
    if (id === 'custom') {
      setCustomOpen(true);
      return;
    }
    setPresetId(id);
    const next = resolveRange(id);
    setGranularity(defaultGranularityForRange(next.start, next.end));
  };

  const applyCustom = () => {
    if (!customStart || !customEnd) return;
    const s = format(customStart, 'yyyy-MM-dd');
    const e = format(customEnd, 'yyyy-MM-dd');
    setCustom({ start: s, end: e });
    setPresetId('custom');
    setGranularity(defaultGranularityForRange(s, e));
    setCustomOpen(false);
  };

  const currentLabel = TIME_RANGE_PRESETS.find((p) => p.id === presetId)?.label ?? 'Range';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">{currentLabel}</span>
            <span className="text-xs text-muted-foreground">· {resolved.label}</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {TIME_RANGE_PRESETS.slice(0, -1).map((p) => (
            <DropdownMenuItem
              key={p.id}
              onSelect={() => handlePreset(p.id)}
              className={cn(presetId === p.id && 'bg-accent')}
            >
              {p.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setCustomOpen(true); }}>
            Custom range…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Popover open={customOpen} onOpenChange={setCustomOpen}>
        <PopoverTrigger asChild>
          <span className="sr-only">Custom range</span>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          <div className="flex flex-col gap-3">
            <div className="flex gap-4">
              <div>
                <p className="text-xs font-medium mb-1 text-muted-foreground">Start</p>
                <Calendar
                  mode="single"
                  selected={customStart}
                  onSelect={setCustomStart}
                  className={cn('p-2 pointer-events-auto rounded border')}
                />
              </div>
              <div>
                <p className="text-xs font-medium mb-1 text-muted-foreground">End</p>
                <Calendar
                  mode="single"
                  selected={customEnd}
                  onSelect={setCustomEnd}
                  className={cn('p-2 pointer-events-auto rounded border')}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCustomOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={applyCustom} disabled={!customStart || !customEnd}>Apply</Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <div className="flex rounded-md border border-border overflow-hidden">
        {GRANULARITIES.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setGranularity(g.id)}
            className={cn(
              'px-2.5 py-1 text-xs font-medium transition-colors',
              granularity === g.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:bg-muted',
            )}
          >
            {g.label}
          </button>
        ))}
      </div>
    </div>
  );
}