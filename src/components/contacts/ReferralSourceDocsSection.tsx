import { useEffect, useMemo, useState } from 'react';
import { Settings2, Plus, Trash2, GripVertical } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { useCompany } from '@/hooks/useCompany';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { toast } from 'sonner';

export type ReferralDocFieldType = 'checkbox' | 'text';

export interface ReferralDocField {
  id: string;
  label: string;
  type: ReferralDocFieldType;
  placeholder?: string;
}

const DEFAULT_FIELDS: ReferralDocField[] = [
  { id: 'referral_agreement_on_file', label: 'Referral Agreement on file', type: 'checkbox' },
  { id: 'w9_on_file', label: 'W-9 on file', type: 'checkbox' },
  { id: 'referral_fee', label: 'Referral Fee', type: 'text', placeholder: 'e.g. 1%' },
  { id: 'lender_referred_pct', label: 'Lender Referred %', type: 'text', placeholder: 'e.g. 50%' },
];

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `field_${Date.now()}`;
}

interface Props {
  contact: any;
  onUpdate: (field: string, value: any) => void;
}

export function ReferralSourceDocsSection({ contact, onUpdate }: Props) {
  const { isAdmin } = useCompany();
  const { settings, updateSettings, refetch } = useCompanySettings();

  const fields: ReferralDocField[] = useMemo(() => {
    const raw = (settings as any)?.referral_source_doc_fields;
    if (Array.isArray(raw) && raw.length) return raw as ReferralDocField[];
    return DEFAULT_FIELDS;
  }, [settings]);

  // Merge legacy top-level columns as initial fallback values
  const values = useMemo(() => {
    const docs = (contact?.referral_source_docs || {}) as Record<string, any>;
    const merged: Record<string, any> = { ...docs };
    for (const legacy of ['referral_agreement_on_file', 'w9_on_file', 'referral_fee', 'lender_referred_pct']) {
      if (merged[legacy] === undefined && contact?.[legacy] !== undefined && contact?.[legacy] !== null) {
        merged[legacy] = contact[legacy];
      }
    }
    return merged;
  }, [contact]);

  const setValue = (fieldId: string, value: any) => {
    const next = { ...(contact?.referral_source_docs || {}), [fieldId]: value };
    onUpdate('referral_source_docs', next);
    // Keep legacy columns in sync so existing reports/queries still work
    if (['referral_agreement_on_file', 'w9_on_file', 'referral_fee', 'lender_referred_pct'].includes(fieldId)) {
      onUpdate(fieldId, value === '' ? null : value);
    }
  };

  return (
    <div className="mt-2 rounded-md border border-border/60 bg-muted/20 p-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground uppercase">Referral Source Docs</p>
        {isAdmin && (
          <ManageFieldsDialog
            fields={fields}
            onSave={async (next) => {
              try {
                await updateSettings({ referral_source_doc_fields: next as any });
                await refetch();
                toast.success('Referral source fields saved');
              } catch (e: any) {
                toast.error(e.message || 'Failed to save fields');
              }
            }}
          />
        )}
      </div>
      {fields.length === 0 && (
        <p className="text-[11px] text-muted-foreground">No fields configured.</p>
      )}
      {fields.map((f) => {
        if (f.type === 'checkbox') {
          const checked = Boolean(values[f.id]);
          return (
            <label key={f.id} className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setValue(f.id, e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border accent-primary"
              />
              {f.label}
            </label>
          );
        }
        return (
          <div key={f.id} className="pt-0.5">
            <p className="text-[10px] text-muted-foreground mb-0.5">{f.label}</p>
            <Input
              defaultValue={values[f.id] ?? ''}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (values[f.id] ?? '')) setValue(f.id, v || null);
              }}
              placeholder={f.placeholder || ''}
              className="h-7 text-xs"
            />
          </div>
        );
      })}
    </div>
  );
}

function ManageFieldsDialog({
  fields,
  onSave,
}: {
  fields: ReferralDocField[];
  onSave: (next: ReferralDocField[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ReferralDocField[]>(fields);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft(fields);
  }, [open, fields]);

  const addField = () => {
    setDraft((d) => [...d, { id: `field_${Date.now()}`, label: 'New field', type: 'checkbox' }]);
  };

  const remove = (idx: number) => setDraft((d) => d.filter((_, i) => i !== idx));

  const update = (idx: number, patch: Partial<ReferralDocField>) => {
    setDraft((d) => d.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  };

  const move = (idx: number, dir: -1 | 1) => {
    setDraft((d) => {
      const next = [...d];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return d;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const save = async () => {
    // Normalize ids: keep existing legacy ids, slugify labels for new items with placeholder ids
    const normalized = draft
      .filter((f) => f.label.trim())
      .map((f) => ({
        ...f,
        label: f.label.trim(),
        id: f.id.startsWith('field_') ? slugify(f.label) : f.id,
        placeholder: f.type === 'text' ? (f.placeholder || '') : undefined,
      }));
    // Deduplicate ids
    const seen = new Set<string>();
    const final = normalized.map((f) => {
      let id = f.id;
      while (seen.has(id)) id = `${id}_${Math.floor(Math.random() * 1000)}`;
      seen.add(id);
      return { ...f, id };
    });
    setSaving(true);
    try {
      await onSave(final);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          title="Manage referral source fields"
        >
          <Settings2 className="h-3 w-3" /> Manage
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage Referral Source Docs</DialogTitle>
          <DialogDescription>
            Configure which checkboxes and text fields appear for Referral Source contacts.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {draft.map((f, i) => (
            <div key={i} className="flex items-center gap-1.5 rounded-md border border-border/60 p-2">
              <div className="flex flex-col">
                <button type="button" onClick={() => move(i, -1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === 0}>
                  <GripVertical className="h-3 w-3" />
                </button>
              </div>
              <Input
                value={f.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="Field label"
                className="h-8 text-xs flex-1"
              />
              <Select value={f.type} onValueChange={(v) => update(i, { type: v as ReferralDocFieldType })}>
                <SelectTrigger className="h-8 w-[110px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="checkbox">Checkbox</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                </SelectContent>
              </Select>
              {f.type === 'text' && (
                <Input
                  value={f.placeholder || ''}
                  onChange={(e) => update(i, { placeholder: e.target.value })}
                  placeholder="Placeholder"
                  className="h-8 text-xs w-[130px]"
                />
              )}
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => remove(i)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addField} className="w-full">
            <Plus className="h-3.5 w-3.5 mr-1" /> Add field
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}