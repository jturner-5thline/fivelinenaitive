import {
  KPIDetailCardConfig,
  DEFAULT_KPI_DETAIL_CARD_CONFIG,
  KPIComparisonMode,
  SEED_FIELDS,
} from '../widgetTypes';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface Props {
  config?: KPIDetailCardConfig;
  onChange: (config: KPIDetailCardConfig) => void;
}

const COMPARISON_MODES: KPIComparisonMode[] = [
  'vs Previous Period',
  'vs Previous Year',
  'vs Plan/Budget',
];

const MEASURE_FIELDS = SEED_FIELDS.filter(f => f.isMeasure);

function FieldSelect({ value, onChange, placeholder }: { value: string | null; onChange: (v: string) => void; placeholder: string }) {
  return (
    <Select value={value ?? ''} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {MEASURE_FIELDS.map(f => (
          <SelectItem key={f.id} value={f.id} className="text-xs">{f.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function KPIDetailConfigSection({ config, onChange }: Props) {
  const c = config ?? DEFAULT_KPI_DETAIL_CARD_CONFIG;
  const update = (patch: Partial<KPIDetailCardConfig>) => onChange({ ...c, ...patch });

  return (
    <div className="space-y-3">
      {/* Card Title */}
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">Card Title</Label>
        <Input
          className="h-8 text-xs"
          value={c.cardTitle}
          onChange={e => update({ cardTitle: e.target.value })}
          placeholder="KPI Title"
        />
      </div>

      {/* Main Value */}
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">Main Value Field</Label>
        <FieldSelect value={c.mainValueField} onChange={v => update({ mainValueField: v })} placeholder="Select field" />
      </div>

      {/* Comparison Mode */}
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">Comparison Mode</Label>
        <Select value={c.comparisonMode} onValueChange={v => update({ comparisonMode: v as KPIComparisonMode })}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMPARISON_MODES.map(m => (
              <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Breakdown Columns Toggle */}
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">Breakdown Columns</Label>
        <div className="flex gap-1">
          {([1, 2] as const).map(n => (
            <button
              key={n}
              onClick={() => update({ breakdownColumns: n })}
              className={cn(
                'px-3 py-1 rounded text-xs font-medium transition-colors',
                c.breakdownColumns === n
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
              )}
            >
              {n} Column{n > 1 ? 's' : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Left Column */}
      <div className="space-y-2 rounded-md border border-border p-2">
        <Label className="text-xs font-semibold text-muted-foreground">{c.breakdownColumns === 1 ? 'Breakdown' : 'Left Column'}</Label>
        <Input className="h-7 text-xs" value={c.left.label} onChange={e => update({ left: { ...c.left, label: e.target.value } })} placeholder="Label" />
        <FieldSelect value={c.left.valueField} onChange={v => update({ left: { ...c.left, valueField: v } })} placeholder="Value field" />
      </div>

      {/* Right Column */}
      {c.breakdownColumns === 2 && (
        <div className="space-y-2 rounded-md border border-border p-2">
          <Label className="text-xs font-semibold text-muted-foreground">Right Column</Label>
          <Input className="h-7 text-xs" value={c.right.label} onChange={e => update({ right: { ...c.right, label: e.target.value } })} placeholder="Label" />
          <FieldSelect value={c.right.valueField} onChange={v => update({ right: { ...c.right, valueField: v } })} placeholder="Value field" />
        </div>
      )}
    </div>
  );
}
