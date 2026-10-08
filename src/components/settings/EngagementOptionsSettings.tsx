import { useEffect, useState } from 'react';
import { Plus, Trash2, Save, Loader2, RotateCcw, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  useDealEngagementOptions, DEFAULT_ENGAGEMENT_OPTIONS, slugifyEngagement, type EngagementOption,
} from '@/hooks/useDealEngagementOptions';

export function EngagementOptionsSettings({ isAdmin = true }: { isAdmin?: boolean }) {
  const { options, saveOptions } = useDealEngagementOptions();
  const [draft, setDraft] = useState<EngagementOption[]>(options);
  const [newLabel, setNewLabel] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(options); }, [options]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(options);

  const persist = async (next: EngagementOption[], msg: string) => {
    const prev = draft;
    setDraft(next);
    setSaving(true);
    try {
      await saveOptions(next.map(o => ({ ...o, label: o.label.trim() })));
      toast.success(msg);
    } catch (e: any) {
      setDraft(prev);
      toast.error(e?.message || 'Could not save options');
    } finally {
      setSaving(false);
    }
  };

  const add = () => {
    const label = newLabel.trim();
    if (!label) return;
    const id = slugifyEngagement(label);
    if (draft.some(o => o.id === id || o.label.toLowerCase() === label.toLowerCase())) {
      toast.error('That option already exists');
      return;
    }
    setNewLabel('');
    void persist([...draft, { id, label }], `Added "${label}"`);
  };

  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= draft.length) return;
    const next = [...draft];
    [next[i], next[j]] = [next[j], next[i]];
    void persist(next, 'Order saved');
  };

  const save = async () => {
    if (draft.some(o => !o.label.trim())) { toast.error('Option names cannot be empty'); return; }
    if (draft.length === 0) { toast.error('Keep at least one option'); return; }
    await persist(draft, 'Engagement options saved');
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Dropdown options for the Engagement field. Renaming keeps existing deals linked; removed options still display on deals that already use them.
      </p>
      {draft.map((o, i) => (
        <div key={o.id} className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5">
          <div className="flex flex-col">
            <button type="button" disabled={!isAdmin || i === 0} onClick={() => move(i, -1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Move up"><ArrowUp className="h-3 w-3" /></button>
            <button type="button" disabled={!isAdmin || i === draft.length - 1} onClick={() => move(i, 1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Move down"><ArrowDown className="h-3 w-3" /></button>
          </div>
          <Input
            value={o.label}
            disabled={!isAdmin}
            onChange={(e) => setDraft(draft.map((x, k) => k === i ? { ...x, label: e.target.value } : x))}
            className="h-8 text-sm"
          />
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={!isAdmin || draft.length <= 1}
            onClick={() => void persist(draft.filter((_, k) => k !== i), `Removed "${o.label}"`)} aria-label={`Remove ${o.label}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      {isAdmin && (
        <>
          <div className="flex items-center gap-2">
            <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Add an option…" className="h-8 text-sm"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
            <Button type="button" variant="outline" size="sm" onClick={add} className="gap-1.5 shrink-0"><Plus className="h-3.5 w-3.5" />Add</Button>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => setDraft(DEFAULT_ENGAGEMENT_OPTIONS)}>
              <RotateCcw className="h-3.5 w-3.5" />Defaults
            </Button>
            <Button type="button" size="sm" className="gap-1.5" disabled={!dirty || saving} onClick={save}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Save
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
