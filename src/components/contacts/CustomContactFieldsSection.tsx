import { EditableField } from '@/components/crm/EditableField';
import { Checkbox } from '@/components/ui/checkbox';
import { CustomContactField } from '@/hooks/useContactFieldConfig';

interface Props {
  fields: CustomContactField[];
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
}

export function CustomContactFieldsSection({ fields, values, onChange }: Props) {
  if (fields.length === 0) return null;
  const update = (key: string, v: any) => {
    const next = { ...(values || {}), [key]: v };
    onChange(key, next);
  };

  return (
    <div className="space-y-2 pt-1 border-t border-border/40">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Custom Fields</p>
      {fields.map((f) => {
        const raw = values?.[f.key];
        if (f.type === 'checkbox') {
          return (
            <label key={f.key} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={!!raw} onCheckedChange={(v) => update(f.key, !!v)} />
              <span>{f.label}</span>
            </label>
          );
        }
        if (f.type === 'select') {
          const opts = (f.options || []).map((o) => ({ value: o, label: o }));
          return (
            <EditableField
              key={f.key}
              label={f.label}
              type="select"
              options={opts}
              value={raw == null ? '' : String(raw)}
              onSave={(v) => update(f.key, v)}
            />
          );
        }
        const type = f.type === 'date' ? 'text'
          : f.type === 'number' ? 'number'
          : f.type === 'url' ? 'url'
          : f.type === 'email' ? 'email'
          : 'text';
        return (
          <EditableField
            key={f.key}
            label={f.label}
            type={type as any}
            value={raw == null ? '' : String(raw)}
            onSave={(v) => update(f.key, v)}
            placeholder={f.type === 'date' ? 'YYYY-MM-DD' : undefined}
          />
        );
      })}
    </div>
  );
}