import { DataLabelsConfig } from '../widgetTypes';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface Props {
  config?: DataLabelsConfig;
  onChange: (config: DataLabelsConfig) => void;
}

const DEFAULT: DataLabelsConfig = {
  enabled: false,
  position: 'above',
  showPeriodTotals: false,
};

const POSITION_OPTIONS = [
  { value: 'above', label: 'Above' },
  { value: 'inside', label: 'Inside' },
  { value: 'below', label: 'Below' },
] as const;

export function DisplayConfigSection({ config, onChange }: Props) {
  const c = config ?? DEFAULT;

  const update = (patch: Partial<DataLabelsConfig>) => {
    onChange({ ...c, ...patch });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label htmlFor="show-data-labels" className="text-xs text-muted-foreground cursor-pointer">
          Show Data Labels
        </Label>
        <Switch
          id="show-data-labels"
          checked={c.enabled}
          onCheckedChange={(v) => update({ enabled: v })}
          className="scale-75 origin-right"
        />
      </div>

      {c.enabled && (
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Position</Label>
          <div className="flex gap-1">
            {POSITION_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => update({ position: o.value })}
                className={cn(
                  'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                  c.position === o.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <Label htmlFor="show-period-totals" className="text-xs text-muted-foreground cursor-pointer">
          Show Period Totals
        </Label>
        <Switch
          id="show-period-totals"
          checked={c.showPeriodTotals ?? false}
          onCheckedChange={(v) => update({ showPeriodTotals: v })}
          className="scale-75 origin-right"
        />
      </div>
    </div>
  );
}
