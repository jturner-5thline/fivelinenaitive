import { FilterConfig, getField } from '../widgetTypes';
import { DropZone } from '../DropZone';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';

interface Props {
  configs: FilterConfig[];
  onChange: (configs: FilterConfig[]) => void;
}

const OPERATORS = [
  { value: 'eq', label: 'Equals' },
  { value: 'neq', label: 'Not Equals' },
  { value: 'in', label: 'In' },
  { value: 'gte', label: '≥' },
  { value: 'lte', label: '≤' },
] as const;

export function FiltersConfigSection({ configs, onChange }: Props) {
  const update = (idx: number, patch: Partial<FilterConfig>) => {
    onChange(configs.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const remove = (idx: number) => {
    onChange(configs.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      {configs.map((fc, idx) => {
        const field = getField(fc.fieldId);
        return (
          <div key={fc.id} className="rounded-lg border border-border bg-secondary/30 p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">{field?.name ?? 'Unknown'}</span>
              <button onClick={() => remove(idx)} className="text-muted-foreground hover:text-destructive">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select value={fc.operator} onValueChange={(v) => update(idx, { operator: v as FilterConfig['operator'] })}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OPERATORS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                className="h-7 text-xs"
                placeholder="value1, value2"
                value={fc.values.join(', ')}
                onChange={(e) => update(idx, { values: e.target.value.split(',').map((s) => s.trim()) })}
              />
            </div>
          </div>
        );
      })}
      <DropZone id="drop-filters" label="Filters" accepts="any" isEmpty={configs.length === 0 || true} />
    </div>
  );
}
