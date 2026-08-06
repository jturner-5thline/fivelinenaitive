import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  BUILTIN_TOGGLEABLE_FIELDS, CustomContactField, CustomContactFieldType,
  useContactFieldConfig,
} from '@/hooks/useContactFieldConfig';

const TYPE_LABELS: Record<CustomContactFieldType, string> = {
  text: 'Text', number: 'Number', date: 'Date', checkbox: 'Checkbox',
  select: 'Single-select', url: 'URL', email: 'Email',
};

function slugify(label: string) {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || `field_${Date.now()}`;
}

interface Props { open: boolean; onOpenChange: (v: boolean) => void; }

/** Local editing row — `uid` is a stable React key so typing never remounts the input. */
type DraftField = CustomContactField & { uid: string };

let uidSeq = 0;
const nextUid = () => `cf_${Date.now().toString(36)}_${uidSeq++}`;

export function ManageContactFieldsDialog({ open, onOpenChange }: Props) {
  const { config, save } = useContactFieldConfig();
  const [disabled, setDisabled] = useState<Set<string>>(new Set());
  const [custom, setCustom] = useState<DraftField[]>([]);
  const [saving, setSaving] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const hydratedRef = useRef(false);

  // Hydrate once per open. Re-hydrating on every `config` change (realtime pushes
  // a new object) would wipe whatever the admin is currently typing.
  useEffect(() => {
    if (!open) { hydratedRef.current = false; return; }
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    setDisabled(new Set(config.disabled));
    setCustom(config.custom.map((f, i) => ({ ...f, order: i, uid: nextUid() })));
  }, [open, config]);

  const toggleBuiltin = (key: string, enabled: boolean) => {
    setDisabled(prev => {
      const next = new Set(prev);
      if (enabled) next.delete(key); else next.add(key);
      return next;
    });
  };

  const addCustom = () => {
    setCustom(prev => [...prev, {
      uid: nextUid(), key: '', label: '', type: 'text', order: prev.length,
    }]);
  };

  // Never derive `key` while typing — the key is only resolved on save, so the
  // input keeps a stable identity and backspace/delete behave normally.
  const updateCustom = (idx: number, patch: Partial<CustomContactField>) =>
    setCustom(prev => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)));

  const removeCustom = (idx: number) => setCustom(prev => prev.filter((_, i) => i !== idx));

  const reorder = (fromUid: string, toUid: string) => {
    if (fromUid === toUid) return;
    setCustom(prev => {
      const arr = [...prev];
      const fromIdx = arr.findIndex(f => f.uid === fromUid);
      const toIdx = arr.findIndex(f => f.uid === toUid);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      return arr.map((f, i) => ({ ...f, order: i }));
    });
  };

  const handleSave = async () => {
    // Validation
    const seen = new Set<string>();
    const resolved: CustomContactField[] = [];
    for (const f of custom) {
      if (!f.label.trim()) { toast.error('Every custom field needs a label'); return; }
      const key = f.key || slugify(f.label);
      if (seen.has(key)) { toast.error(`Duplicate field key "${key}"`); return; }
      seen.add(key);
      if (f.type === 'select' && (!f.options || f.options.filter(Boolean).length === 0)) {
        toast.error(`Add at least one option to "${f.label}"`); return;
      }
      resolved.push({
        key,
        label: f.label.trim(),
        type: f.type,
        order: resolved.length,
        options: f.type === 'select' ? (f.options || []).map(o => o.trim()).filter(Boolean) : undefined,
      });
    }
    setSaving(true);
    try {
      await save({ disabled: Array.from(disabled), custom: resolved });
      toast.success('Contact fields updated');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const lockedNote = useMemo(() => (
    'First name, Last name, Company, Owner, Work Email, Contact Type and Status are always visible.'
  ), []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Manage Contact Fields</DialogTitle>
          <DialogDescription>{lockedNote}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 pr-1">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Standard Fields</h3>
            <div className="rounded-md border border-border/60 divide-y divide-border/60">
              {BUILTIN_TOGGLEABLE_FIELDS.map(f => (
                <div key={f.key} className="flex items-center justify-between p-2 text-sm">
                  <span>{f.label}</span>
                  <Switch
                    checked={!disabled.has(f.key)}
                    onCheckedChange={(v) => toggleBuiltin(f.key, v)}
                    aria-label={`Toggle ${f.label}`}
                  />
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Custom Fields</h3>
              <Button size="sm" variant="outline" onClick={addCustom}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add field
              </Button>
            </div>

            {custom.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No custom fields yet.</p>
            ) : (
              <div className="space-y-2">
                {custom.map((f, idx) => (
                  <div
                    key={f.uid}
                    draggable
                    onDragStart={() => setDragKey(f.uid)}
                    onDragOver={(e) => { e.preventDefault(); }}
                    onDrop={(e) => { e.preventDefault(); if (dragKey) reorder(dragKey, f.uid); setDragKey(null); }}
                    onDragEnd={() => setDragKey(null)}
                    className="rounded-md border border-border/60 p-3 space-y-2 bg-card"
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="h-4 w-4 mt-2 text-muted-foreground cursor-grab" />
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase text-muted-foreground">Label</Label>
                          <Input
                            value={f.label}
                            placeholder="e.g. Referral Fee %"
                            onChange={(e) => updateCustom(idx, { label: e.target.value })}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase text-muted-foreground">Type</Label>
                          <Select value={f.type} onValueChange={(v) => updateCustom(idx, { type: v as CustomContactFieldType })}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(TYPE_LABELS).map(([v, l]) => (
                                <SelectItem key={v} value={v}>{l}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {f.type === 'select' && (
                          <div className="sm:col-span-2 space-y-1">
                            <Label className="text-[10px] uppercase text-muted-foreground">Options (one per line)</Label>
                            <textarea
                              value={(f.options || []).join('\n')}
                              onChange={(e) => updateCustom(idx, { options: e.target.value.split('\n') })}
                              rows={3}
                              className="w-full rounded-md border bg-background p-2 text-sm"
                            />
                          </div>
                        )}
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeCustom(idx)} aria-label="Remove field">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}