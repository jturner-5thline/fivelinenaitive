import { TrendLineConfig } from '../widgetTypes';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface Props {
  config?: TrendLineConfig;
  onChange: (config: TrendLineConfig) => void;
}

const DEFAULT: TrendLineConfig = {
  enabled: false,
  type: 'linear',
  window: 3,
};

const TYPE_OPTIONS = [
  { value: 'linear', label: 'Linear' },
  { value: 'movingAvg', label: 'Moving Avg' },
  { value: 'polynomial', label: 'Polynomial' },
] as const;

export function TrendLineConfigSection({ config, onChange }: Props) {
  const c = config ?? DEFAULT;

  const update = (patch: Partial<TrendLineConfig>) => {
    onChange({ ...c, ...patch });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label htmlFor="show-trend-line" className="text-xs text-muted-foreground cursor-pointer">
          Show Trend Line
        </Label>
        <Switch
          id="show-trend-line"
          checked={c.enabled}
          onCheckedChange={(v) => update({ enabled: v })}
          className="scale-75 origin-right"
        />
      </div>

      {c.enabled && (
        <>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Type</Label>
            <div className="flex gap-1">
              {TYPE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => update({ type: o.value })}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                    c.type === o.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {c.type === 'movingAvg' && (
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Window</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={2}
                  max={12}
                  value={c.window}
                  onChange={(e) => update({ window: Math.max(2, parseInt(e.target.value) || 3) })}
                  className="h-7 w-16 text-xs"
                />
                <span className="text-xs text-muted-foreground">periods</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
