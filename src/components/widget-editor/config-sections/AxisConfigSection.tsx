import { AxisConfig, getField, Grain } from '../widgetTypes';
import { DropZone } from '../DropZone';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  config: AxisConfig;
  onChange: (c: AxisConfig) => void;
}

const GRAINS: { value: Grain; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
];

const WINDOWS = [
  { value: 'last3Months', label: 'Last 3 months' },
  { value: 'ytd', label: 'YTD' },
  { value: 'all', label: 'All' },
] as const;

export function AxisConfigSection({ config, onChange }: Props) {
  const field = getField(config.fieldId);

  return (
    <div className="space-y-2">
      <DropZone id="drop-xaxis" label="X-Axis" accepts="date / dimension" isEmpty={!field}>
        {field && (
          <div className="flex items-center justify-between w-full">
            <span className="text-sm font-medium text-foreground">{field.name}</span>
            <button onClick={() => onChange({ ...config, fieldId: null })} className="text-muted-foreground hover:text-destructive">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </DropZone>

      {field && (
        <div className="space-y-3 pl-1">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Grain</Label>
            <div className="flex gap-1">
              {GRAINS.map((g) => (
                <button
                  key={g.value}
                  onClick={() => onChange({ ...config, grain: g.value })}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                    config.grain === g.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  )}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Time window</Label>
            <Select value={config.window || 'all'} onValueChange={(v) => onChange({ ...config, window: v as AxisConfig['window'] })}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WINDOWS.map((w) => (
                  <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}
