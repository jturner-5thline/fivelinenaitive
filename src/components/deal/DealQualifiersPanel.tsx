import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Loader2, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { agreementSchema, type QualifierAgreement } from '@/lib/agreementTerms';
import { diffQualifiers, hasChanges, type DraftQualifier, type Qualifier } from '@/lib/qualifierDraft';
import { useNaitivePipelineAccess } from '@/hooks/useNaitivePipelineAccess';

const emptyAgreement = { executed_qualifies: false, match_rule: 'all' as const, criteria: [], source_file_id: null, source_file_url: null, agreement_signed_date: null, notes: null };

/**
 * Qualifiers: agreement requirements that trigger the milestone fee.
 * All edits are staged locally; Save asks for confirmation. Clicking
 * outside the widget with unsaved edits discards them.
 */
export function DealQualifiersPanel({ dealId }: { dealId: string }) {
  const { hasAccess, isLoading } = useNaitivePipelineAccess();
  if (isLoading || !hasAccess) return null;
  return <DealQualifiersEditor key={dealId} dealId={dealId} />;
}

function DealQualifiersEditor({ dealId }: { dealId: string }) {
  const [savedAgreement, setSavedAgreement] = useState<QualifierAgreement>(emptyAgreement);
  const [agreement, setAgreement] = useState<QualifierAgreement>(emptyAgreement);
  const [saved, setSaved] = useState<Qualifier[]>([]);
  const [draft, setDraft] = useState<DraftQualifier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_deal_qualifiers_record', { p_deal_id: dealId });
    if (error) { toast.error('Could not load qualifiers'); setLoading(false); return; }
    const parsed = agreementSchema.safeParse(data ?? emptyAgreement);
    if (!parsed.success) { toast.error('Could not read qualifier agreement'); setLoading(false); return; }
    const stamp = data && typeof data === 'object' && !Array.isArray(data) && typeof data.updated_at === 'string' ? data.updated_at : undefined;
    const loaded = { ...parsed.data, updated_at: stamp };
    setSavedAgreement(loaded); setAgreement(loaded);
    const rows = loaded.criteria.map((q) => ({ ...q, id: q.id ?? crypto.randomUUID(), text: q.text ?? '', position: q.position ?? 0, is_met: q.is_met ?? false }));
    setSaved(rows); setDraft(rows);
    setLoading(false);
  }, [dealId]);

  useEffect(() => { setLoading(true); void load(); }, [load]);

  const changes = useMemo(() => diffQualifiers(saved, draft), [saved, draft]);
  const dirty = hasChanges(changes) || draft.some((q) => q.isNew) || JSON.stringify(agreement) !== JSON.stringify(savedAgreement);

  const discard = useCallback(() => { setDraft(saved); setAgreement(savedAgreement); setFocusId(null); }, [saved, savedAgreement]);

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
      const parsed = agreementSchema.safeParse({ ...agreement, criteria: draft.filter((q) => q.text.trim()).map((q, position) => ({ ...q, id: q.isNew ? undefined : q.id, position })) });
      if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? 'Check agreement fields'); return; }
      const { data, error } = await supabase.rpc('upsert_deal_qualifiers_record', { p_deal_id: dealId, p_record: parsed.data, p_source: 'app', p_change_reason: 'Confirmed qualifier edits', p_expected_updated_at: savedAgreement.updated_at, p_dry_run: false });
      if (error) throw error;
      if (data && typeof data === 'object' && !Array.isArray(data) && data.conflict === true) { toast.error('Qualifiers changed elsewhere. Reload before saving.'); return; }
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
        <Button variant="ghost" size="icon"
          type="button"
          onClick={() => addRow()}
          className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-muted/40"
          aria-label="Add qualifier"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {!loading && <div className="space-y-2 mb-3 text-xs">
        <label className="flex items-center justify-between gap-2">
          <span>Signed by company counts</span>
          <span className="flex items-center gap-2"><Checkbox aria-label="Signed by company counts" checked={agreement.executed_qualifies} onCheckedChange={(v) => setAgreement((a) => ({ ...a, executed_qualifies: v === true }))} />{agreement.executed_qualifies ? 'Yes' : 'No'}</span>
        </label>
        <Select value={agreement.match_rule} onValueChange={(v) => setAgreement((a) => ({ ...a, match_rule: v === 'any' ? 'any' : 'all' }))}>
          <SelectTrigger aria-label="Qualifier match rule" className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All criteria required</SelectItem><SelectItem value="any">Any criterion required</SelectItem></SelectContent>
        </Select>
        {agreement.source_file_url?.startsWith('https://') && <a className="inline-flex items-center gap-1 text-primary" href={agreement.source_file_url} target="_blank" rel="noopener noreferrer">Source agreement <ExternalLink className="h-3 w-3" /></a>}
        <details className="space-y-2">
          <summary className="cursor-pointer text-muted-foreground">Agreement details</summary>
          <Input aria-label="Source agreement URL" placeholder="Source agreement URL" value={agreement.source_file_url ?? ''} onChange={(e) => setAgreement((a) => ({ ...a, source_file_url: e.target.value || null }))} className="h-7 text-xs" />
          <Input aria-label="Source agreement file ID" placeholder="Source agreement file ID" value={agreement.source_file_id ?? ''} onChange={(e) => setAgreement((a) => ({ ...a, source_file_id: e.target.value || null }))} className="h-7 text-xs" />
          <Input aria-label="Agreement signed date" type="date" value={agreement.agreement_signed_date ?? ''} onChange={(e) => setAgreement((a) => ({ ...a, agreement_signed_date: e.target.value || null }))} className="h-7 text-xs" />
          <Input aria-label="Agreement notes" placeholder="Agreement notes" value={agreement.notes ?? ''} onChange={(e) => setAgreement((a) => ({ ...a, notes: e.target.value || null }))} className="h-7 text-xs" />
        </details>
      </div>}
      {loading ? (
        <div className="py-3 flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <ul className="flex flex-col">
          {draft.length === 0 && (
            <li>
              <Button variant="ghost" type="button" onClick={() => addRow()} className="w-full text-left text-xs text-muted-foreground py-2 hover:text-foreground">
                No qualifiers yet — add the term sheet requirements that trigger the milestone fee.
              </Button>
            </li>
          )}
          {draft.map((q, i) => (
            <li key={q.id} className="group flex items-start gap-2 py-1 border-b border-border/40 last:border-b-0">
              <span className="mt-1 text-xs text-muted-foreground tabular-nums">{i + 1}.</span>
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
              <Button variant="ghost" size="icon"
                type="button"
                onClick={() => setDraft((d) => d.filter((x) => x.id !== q.id))}
                className="mt-0.5 h-6 w-6 shrink-0 inline-flex items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-destructive"
                aria-label="Delete qualifier"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {dirty && (
        <div className="mt-2 flex items-center justify-end gap-2">
          <span className="mr-auto text-[11px] text-muted-foreground">Unsaved changes</span>
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
              ].filter(Boolean).join(', ') || 'Agreement settings updated'}
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
