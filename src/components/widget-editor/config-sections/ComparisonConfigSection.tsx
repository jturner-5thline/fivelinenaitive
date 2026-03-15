import { ComparisonConfig } from '../widgetTypes';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface Props {
  config?: ComparisonConfig;
  onChange: (config: ComparisonConfig) => void;
}

const DEFAULT: ComparisonConfig = {
  enabled: false,
  compareTo: 'previous',
  displayAs: '$',
  colorCode: true,
};

const COMPARE_OPTIONS = [
  { value: 'previous', label: 'Previous Period' },
  { value: 'yoy', label: 'Same Period Last Year' },
  { value: 'custom', label: 'Custom Range' },
] as const;

const DISPLAY_OPTIONS = [
  { value: '$', label: '$' },
  { value: '%', label: '%' },
  { value: 'both', label: 'Both' },
] as const;

export function ComparisonConfigSection({ config, onChange }: Props) {
  const c = config ?? DEFAULT;

  const update = (patch: Partial<ComparisonConfig>) => {
    onChange({ ...c, ...patch });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label htmlFor="show-variance" className="text-xs text-muted-foreground cursor-pointer">
          Show Variance
        </Label>
        <Switch
          id="show-variance"
          checked={c.enabled}
          onCheckedChange={(v) => update({ enabled: v })}
          className="scale-75 origin-right"
        />
      </div>

      {c.enabled && (
        <>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Compare To</Label>
            <Select value={c.compareTo} onValueChange={(v) => update({ compareTo: v as ComparisonConfig['compareTo'] })}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMPARE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Display As</Label>
            <div className="flex gap-1">
              {DISPLAY_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => update({ displayAs: o.value })}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                    c.displayAs === o.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="color-code-variance" className="text-xs text-muted-foreground cursor-pointer">
              Color Code Variance
            </Label>
            <Switch
              id="color-code-variance"
              checked={c.colorCode}
              onCheckedChange={(v) => update({ colorCode: v })}
              className="scale-75 origin-right"
            />
          </div>
        </>
      )}
    </div>
  );
}
