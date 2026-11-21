import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { diffQualifiers, hasChanges, type DraftQualifier, type Qualifier } from '@/lib/qualifierDraft';

/**
 * Qualifiers: agreement requirements that trigger the milestone fee.
 * All edits are staged locally; Save asks for confirmation. Clicking
 * outside the widget with unsaved edits discards them.
 */
export function DealQualifiersPanel({ dealId }: { dealId: string }) {
  const [saved, setSaved] = useState<Qualifier[]>([]);
  const [draft, setDraft] = useState<DraftQualifier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('deal_qualifiers')
      .select('id, text, is_met, position')
      .eq('deal_id', dealId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) { toast.error('Could not load qualifiers'); setLoading(false); return; }
    setSaved(data ?? []);
    setDraft(data ?? []);
    setLoading(false);
  }, [dealId]);

  useEffect(() => { setLoading(true); void load(); }, [load]);

  const changes = useMemo(() => diffQualifiers(saved, draft), [saved, draft]);
  const dirty = hasChanges(changes) || draft.some((q) => q.isNew);

  const discard = useCallback(() => { setDraft(saved); setFocusId(null); }, [saved]);

  // Click outside (while not confirming) clears unsaved changes.
  useEffect(() => {
    if (!dirty || confirmOpen) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) discard();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [dirty, confirmOpen, discard]);

  const patch = (id: string, p: Partial<DraftQualifier>) =>
    setDraft((d) => d.map((q) => (q.id === id ? { ...q, ...p } : q)));

  const addRow = (afterIndex?: number) => {
    const id = `new-${crypto.randomUUID()}`;
    setDraft((d) => {
      const row: DraftQualifier = { id, text: '', is_met: false, position: d.length, isNew: true };
      const at = afterIndex === undefined ? d.length : afterIndex + 1;
      return [...d.slice(0, at), row, ...d.slice(at)];
    });
    setFocusId(id);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (changes.deletes.length) {
        const { error } = await supabase.from('deal_qualifiers').delete().in('id', changes.deletes);
        if (error) throw error;
      }
      for (const u of changes.updates) {
        const { error } = await supabase.from('deal_qualifiers')
          .update({ text: u.text, is_met: u.is_met, position: u.position }).eq('id', u.id);
        if (error) throw error;
      }
      if (changes.inserts.length) {
        const { error } = await supabase.from('deal_qualifiers')
          .insert(changes.inserts.map((i) => ({ ...i, deal_id: dealId })));
        if (error) throw error;
      }
      toast.success('Qualifiers saved');
      await load();
    } catch {
      toast.error('Could not save qualifiers. Your edits are still here.');
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  };

  const metCount = draft.filter((q) => q.text.trim() && q.is_met).length;
  const total = draft.filter((q) => q.text.trim()).length;

  return (
    <div ref={rootRef} className="deal-qualifiers-widget flex flex-col min-h-0 px-3 pt-2 pb-3">
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/90">Qualifiers</span>
          {total > 0 && <span className="text-[10px] font-mono text-muted-foreground">{metCount}/{total} met</span>}
        </div>
        <button
          type="button"
          onClick={() => addRow()}
          className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-muted/40"
          aria-label="Add qualifier"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {loading ? (
        <div className="py-3 flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <ul className="flex flex-col">
          {draft.length === 0 && (
            <li>
              <button type="button" onClick={() => addRow()} className="w-full text-left text-xs text-muted-foreground py-2 hover:text-foreground">
                No qualifiers yet — add the term sheet requirements that trigger the milestone fee.
              </button>
            </li>
          )}
          {draft.map((q, i) => (
            <li key={q.id} className="group flex items-start gap-2 py-1 border-b border-border/40 last:border-b-0">
              <Checkbox
                checked={q.is_met}
                onCheckedChange={(v) => patch(q.id, { is_met: v === true })}
                aria-label={q.is_met ? 'Mark qualifier not met' : 'Mark qualifier met'}
                className="mt-1"
              />
              <textarea
                rows={1}
                value={q.text}
                autoFocus={focusId === q.id}
                placeholder="Describe the requirement…"
                aria-label="Qualifier text"
                onChange={(e) => patch(q.id, { text: e.target.value })}
                onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px`; }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addRow(i); }
                  if (e.key === 'Escape') { e.preventDefault(); discard(); }
                }}
                className={cn(
                  'flex-1 min-w-0 resize-none bg-transparent text-sm leading-5 py-0.5 rounded-sm outline-none focus:bg-muted/30 px-1',
                  q.is_met && 'text-muted-foreground line-through',
                )}
              />
              <button
                type="button"
                onClick={() => setDraft((d) => d.filter((x) => x.id !== q.id))}
                className="mt-0.5 h-6 w-6 shrink-0 inline-flex items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-destructive"
                aria-label="Delete qualifier"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {dirty && (
        <div className="mt-2 flex items-center justify-end gap-2">
          <span className="mr-auto text-[11px] text-amber-400">Unsaved changes</span>
          <Button size="sm" variant="ghost" className="h-7" onClick={discard}>Cancel</Button>
          <Button size="sm" className="h-7" onClick={() => setConfirmOpen(true)}>Save</Button>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !saving && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save qualifier changes?</AlertDialogTitle>
            <AlertDialogDescription>
              {[
                changes.inserts.length && `${changes.inserts.length} added`,
                changes.updates.length && `${changes.updates.length} updated`,
                changes.deletes.length && `${changes.deletes.length} deleted`,
              ].filter(Boolean).join(', ') || 'No changes'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Keep editing</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={(e) => { e.preventDefault(); void save(); }}>
              {saving ? 'Saving…' : 'Save'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
