import { WidgetConfig, TimeWindow, Grain } from '../widgetTypes';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { Calendar } from 'lucide-react';

interface Props {
  config: WidgetConfig;
  onChange: (config: WidgetConfig) => void;
}

const GRAINS: { value: Grain; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
];

const WINDOW_GROUPS: { label: string; options: { value: TimeWindow; label: string }[] }[] = [
  {
    label: 'Current Period',
    options: [
      { value: 'mtd', label: 'Month to Date' },
      { value: 'qtd', label: 'Quarter to Date' },
      { value: 'ytd', label: 'Year to Date' },
    ],
  },
  {
    label: 'Prior Period',
    options: [
      { value: 'lastMonth', label: 'Last Month' },
      { value: 'lastQuarter', label: 'Last Quarter' },
      { value: 'lastYear', label: 'Last Year' },
    ],
  },
  {
    label: 'Rolling',
    options: [
      { value: 'last3Months', label: 'Last 3 Months' },
      { value: 'last6Months', label: 'Last 6 Months' },
      { value: 'ttm', label: 'Trailing 12 Months (TTM)' },
      { value: 'last12Months', label: 'Last 12 Months' },
    ],
  },
  {
    label: 'Other',
    options: [
      { value: 'all', label: 'All Time' },
      { value: 'custom', label: 'Custom Range…' },
    ],
  },
];

const WINDOW_LABEL_MAP: Record<string, string> = {};
for (const g of WINDOW_GROUPS) for (const o of g.options) WINDOW_LABEL_MAP[o.value] = o.label;

export function FiltersConfigSection({ config, onChange }: Props) {
  const currentWindow = config.xAxis.window || 'all';
  const currentGrain = config.xAxis.grain || 'month';
  const showZeroPeriods = config.xAxis.showZeroPeriods ?? true;

  const updateAxis = (patch: Partial<typeof config.xAxis>) => {
    onChange({ ...config, xAxis: { ...config.xAxis, ...patch } });
  };

  return (
    <div className="space-y-4">
      {/* Time Period */}
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          Time Period
        </Label>
        <Select value={currentWindow} onValueChange={(v) => updateAxis({ window: v as TimeWindow })}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WINDOW_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </div>
                {group.options.map((w) => (
                  <SelectItem key={w.value} value={w.value} className="text-xs">
                    {w.label}
                  </SelectItem>
                ))}
              </div>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Grain */}
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">Granularity</Label>
        <div className="flex gap-1">
          {GRAINS.map((g) => (
            <button
              key={g.value}
              onClick={() => updateAxis({ grain: g.value })}
              className={cn(
                'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                currentGrain === g.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* Show $0 Periods */}
      <div className="flex items-center justify-between">
        <Label htmlFor="show-zero-periods" className="text-xs text-muted-foreground cursor-pointer">
          Show $0 periods
        </Label>
        <Switch
          id="show-zero-periods"
          checked={showZeroPeriods}
          onCheckedChange={(v) => updateAxis({ showZeroPeriods: v })}
          className="scale-75 origin-right"
        />
      </div>
    </div>
  );
}
