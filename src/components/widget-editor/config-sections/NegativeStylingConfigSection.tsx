import { NegativeStylingConfig } from '../widgetTypes';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';

interface Props {
  config?: NegativeStylingConfig;
  onChange: (config: NegativeStylingConfig) => void;
}

const DEFAULT: NegativeStylingConfig = {
  enableNegativeStyling: false,
  negativeThreshold: 0,
  negativeColor: 'hsl(0, 72%, 51%)',
};

const PRESET_COLORS = [
  { label: 'Red', value: 'hsl(0, 72%, 51%)' },
  { label: 'Orange', value: 'hsl(25, 95%, 53%)' },
  { label: 'Rose', value: 'hsl(347, 77%, 50%)' },
  { label: 'Amber', value: 'hsl(45, 93%, 47%)' },
];

export function NegativeStylingConfigSection({ config, onChange }: Props) {
  const c = config ?? DEFAULT;

  const update = (patch: Partial<NegativeStylingConfig>) => {
    onChange({ ...c, ...patch });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label htmlFor="neg-styling" className="text-xs text-muted-foreground cursor-pointer">
          Below Zero is Red
        </Label>
        <Switch
          id="neg-styling"
          checked={c.enableNegativeStyling}
          onCheckedChange={(v) => update({ enableNegativeStyling: v })}
          className="scale-75 origin-right"
        />
      </div>

      {c.enableNegativeStyling && (
        <>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Threshold</Label>
            <Input
              type="number"
              value={c.negativeThreshold}
              onChange={(e) => update({ negativeThreshold: Number(e.target.value) })}
              className="h-7 text-xs"
              placeholder="0"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Negative Color</Label>
            <div className="flex gap-1.5">
              {PRESET_COLORS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => update({ negativeColor: p.value })}
                  className="w-6 h-6 rounded-full border-2 transition-all"
                  style={{
                    backgroundColor: p.value,
                    borderColor: c.negativeColor === p.value ? 'hsl(var(--foreground))' : 'transparent',
                  }}
                  title={p.label}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
