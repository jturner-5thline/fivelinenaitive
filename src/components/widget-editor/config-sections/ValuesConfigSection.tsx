import { ValueConfig, getField } from '../widgetTypes';
import { DropZone } from '../DropZone';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X } from 'lucide-react';

interface Props {
  configs: ValueConfig[];
  onChange: (configs: ValueConfig[]) => void;
}

const AGGS = [
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Avg' },
  { value: 'count', label: 'Count' },
] as const;

const FORMATS = [
  { value: 'currency', label: 'Currency' },
  { value: 'percent', label: 'Percent' },
  { value: 'number', label: 'Number' },
] as const;

export function ValuesConfigSection({ configs, onChange }: Props) {
  const update = (idx: number, patch: Partial<ValueConfig>) => {
    const next = configs.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    onChange(next);
  };

  const remove = (idx: number) => {
    onChange(configs.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      {configs.map((vc, idx) => {
        const field = getField(vc.fieldId);
        return (
          <div key={idx} className="rounded-lg border border-border bg-secondary/30 p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">{field?.name ?? 'Unknown'}</span>
              <button onClick={() => remove(idx)} className="text-muted-foreground hover:text-destructive">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select value={vc.agg} onValueChange={(v) => update(idx, { agg: v as ValueConfig['agg'] })}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AGGS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={vc.format} onValueChange={(v) => update(idx, { format: v as ValueConfig['format'] })}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMATS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      })}
      <DropZone id="drop-values" label="Values" accepts="numeric" isEmpty={configs.length === 0 || true} />
    </div>
  );
}
