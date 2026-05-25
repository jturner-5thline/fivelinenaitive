import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Loader2, Check, X, AlertTriangle, GitMerge, UserPlus, RefreshCw } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { LenderSyncRequest } from '@/hooks/useLenderSyncRequests';
import { LENDER_COMPARABLE_FIELDS } from '@/lib/lenderMatching';

type FieldAction = 'keep' | 'use_incoming' | 'fill_empty' | 'append' | 'mark_conflict';

interface FieldRow {
  field: string;
  existing: unknown;
  incoming: unknown;
  action: FieldAction;
  conflict: boolean;
  isArray: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  request: LenderSyncRequest | null;
  onApprove: (id: string) => Promise<boolean>;
  onReject: (id: string) => Promise<boolean>;
  onMerge: (id: string, data: Record<string, unknown>) => Promise<boolean>;
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    const sa = [...a].map(String).sort().join('|');
    const sb = [...b].map(String).sort().join('|');
    return sa === sb;
  }
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (Array.isArray(v)) return v.length === 0 ? '—' : v.join(', ');
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  const s = String(v);
  return s.length === 0 ? '—' : s;
}

function defaultActionFor(existing: unknown, incoming: unknown, mode: 'add' | 'merge'): FieldAction {
  if (mode === 'add') return 'use_incoming';
  if (isEmpty(incoming)) return 'keep';
  if (isEmpty(existing)) return 'fill_empty';
  if (valuesEqual(existing, incoming)) return 'keep';
  return 'mark_conflict';
}

const ACTION_LABEL: Record<FieldAction, string> = {
  keep: 'Keep existing',
  use_incoming: 'Use incoming',
  fill_empty: 'Fill if empty',
  append: 'Append',
  mark_conflict: 'Mark conflict',
};

export function LenderSyncReviewDrawer({ open, onOpenChange, request, onApprove, onReject, onMerge }: Props) {
  const [existingLender, setExistingLender] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rows, setRows] = useState<FieldRow[]>([]);
  const [notes, setNotes] = useState('');

  const incoming = (request?.incoming_data ?? {}) as Record<string, unknown>;
  const lenderName = (incoming.name as string) || '(unnamed)';

  // Determine review mode: add = no existing match; merge/update = has existing candidate.
  const candidateId = useMemo(() => {
    if (request?.existing_lender_id) return request.existing_lender_id;
    const top = request?.match_candidates?.[0];
    return top?.lender_id || null;
  }, [request]);

  const mode: 'add' | 'merge' = candidateId ? 'merge' : 'add';

  useEffect(() => {
    if (!open || !request) return;
    setNotes('');
    if (!candidateId) {
      setExistingLender(null);
      const built: FieldRow[] = LENDER_COMPARABLE_FIELDS.map((f) => ({
        field: f,
        existing: null,
        incoming: incoming[f] ?? null,
        action: defaultActionFor(null, incoming[f], 'add'),
        conflict: false,
        isArray: Array.isArray(incoming[f]),
      })).filter((r) => !isEmpty(r.incoming));
      setRows(built);
      return;
    }
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('master_lenders')
        .select('*')
        .eq('id', candidateId)
        .maybeSingle();
      if (error) {
        toast({ title: 'Failed to load candidate', description: error.message, variant: 'destructive' });
        setLoading(false);
        return;
      }
      const existing = (data || {}) as Record<string, unknown>;
      setExistingLender(existing);
      const built: FieldRow[] = LENDER_COMPARABLE_FIELDS.map((f) => {
        const ev = existing[f] ?? null;
        const iv = incoming[f] ?? null;
        const conflict = !isEmpty(ev) && !isEmpty(iv) && !valuesEqual(ev, iv);
        return {
          field: f,
          existing: ev,
          incoming: iv,
          action: defaultActionFor(ev, iv, 'merge'),
          conflict,
          isArray: Array.isArray(ev) || Array.isArray(iv),
        };
      }).filter((r) => !isEmpty(r.existing) || !isEmpty(r.incoming));
      setRows(built);
      setLoading(false);
    })();
  }, [open, request, candidateId, incoming]);

  const summary = useMemo(() => {
    let fillEmpty = 0, override = 0, conflicts = 0, kept = 0, appended = 0;
    for (const r of rows) {
      if (r.action === 'fill_empty') fillEmpty++;
      else if (r.action === 'use_incoming') override++;
      else if (r.action === 'mark_conflict') conflicts++;
      else if (r.action === 'append') appended++;
      else kept++;
    }
    return { fillEmpty, override, conflicts, kept, appended };
  }, [rows]);

  const setAction = (idx: number, action: FieldAction) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, action } : r)));
  };

  const buildMergedPayload = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const r of rows) {
      switch (r.action) {
        case 'use_incoming':
          out[r.field] = r.incoming;
          break;
        case 'fill_empty':
          if (isEmpty(r.existing) && !isEmpty(r.incoming)) out[r.field] = r.incoming;
          break;
        case 'append': {
          if (r.isArray) {
            const ex = Array.isArray(r.existing) ? r.existing as unknown[] : [];
            const inc = Array.isArray(r.incoming) ? r.incoming as unknown[] : [];
            out[r.field] = Array.from(new Set([...ex, ...inc].map(String)));
          } else {
            const exS = r.existing == null ? '' : String(r.existing);
            const inS = r.incoming == null ? '' : String(r.incoming);
            out[r.field] = exS && inS ? `${exS}\n${inS}` : (exS || inS);
          }
          break;
        }
        case 'keep':
        case 'mark_conflict':
        default:
          // leave existing untouched
          break;
      }
    }
    return out;
  };

  const writeAudit = async (action: 'add' | 'update' | 'merge' | 'reject') => {
    if (!request) return;
    const { data: u } = await supabase.auth.getUser();
    const decidedBy = u.user?.id ?? null;
    const audit = rows.map((r) => ({
      request_id: request.id,
      field_name: r.field,
      scope: 'lender',
      existing_value: r.existing as never,
      incoming_value: r.incoming as never,
      action: r.action,
      decided_by: decidedBy,
      notes: notes || null,
    }));
    if (audit.length > 0) {
      const { error } = await supabase.from('lender_sync_request_decisions').insert(audit);
      if (error) console.warn('audit insert failed', error);
    }
    // top-level summary row
    await supabase.from('lender_sync_request_decisions').insert({
      request_id: request.id,
      field_name: '__summary__',
      scope: 'lender',
      existing_value: null,
      incoming_value: { action, summary } as never,
      action: action === 'reject' ? 'mark_conflict' : 'use_incoming',
      decided_by: decidedBy,
      notes: notes || null,
    });
  };

  const handleConfirm = async () => {
    if (!request) return;
    setSubmitting(true);
    let ok = false;
    try {
      if (mode === 'add') {
        ok = await onApprove(request.id);
      } else {
        const merged = buildMergedPayload();
        // Force the request handler to update the chosen canonical record even if
        // the original request was missing existing_lender_id.
        if (candidateId && !request.existing_lender_id) {
          await supabase
            .from('lender_sync_requests')
            .update({ existing_lender_id: candidateId })
            .eq('id', request.id);
        }
        ok = await onMerge(request.id, merged);
      }
      if (ok) await writeAudit(mode === 'add' ? 'add' : 'merge');
      if (ok) {
        toast({ title: 'Decision applied', description: `${lenderName} processed (${mode}).` });
        onOpenChange(false);
      } else {
        toast({ title: 'Failed to apply', description: 'Check console for details.', variant: 'destructive' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!request) return;
    setSubmitting(true);
    const ok = await onReject(request.id);
    if (ok) {
      await writeAudit('reject');
      toast({ title: 'Rejected', description: `${lenderName} rejected.` });
      onOpenChange(false);
    } else {
      toast({ title: 'Failed to reject', variant: 'destructive' });
    }
    setSubmitting(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-[920px] w-full p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6">
          <div className="flex items-center gap-2">
            {mode === 'add' ? <UserPlus className="h-4 w-4 text-green-500" /> : <GitMerge className="h-4 w-4 text-amber-500" />}
            <SheetTitle className="truncate">{lenderName}</SheetTitle>
            <Badge variant="outline" className="text-[10px]">
              {mode === 'add' ? 'Add new' : 'Merge into existing'}
            </Badge>
            {request?.confidence && request.confidence !== 'none' && (
              <Badge variant="outline" className="text-[10px] capitalize">{request.confidence.replace('_',' ')}</Badge>
            )}
          </div>
          <SheetDescription>
            {mode === 'merge' && existingLender
              ? <>Will update <span className="font-medium text-foreground">{String(existingLender.name || '—')}</span>. Deals, notes, and history on the canonical record are preserved.</>
              : <>Will create a new funding source from this Flex record.</>}
          </SheetDescription>
        </SheetHeader>

        {/* Summary strip */}
        <div className="px-6 pt-3 pb-2 border-b bg-muted/30">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
              <Check className="h-3 w-3 mr-1" />{summary.kept} kept
            </Badge>
            <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30">
              {summary.fillEmpty} fill empty
            </Badge>
            <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30">
              {summary.override} override
            </Badge>
            <Badge variant="outline" className="bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/30">
              {summary.appended} appended
            </Badge>
            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
              <AlertTriangle className="h-3 w-3 mr-1" />{summary.conflicts} conflicts
            </Badge>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="px-6 py-3">
              <div className="grid grid-cols-12 gap-2 text-[11px] uppercase text-muted-foreground border-b pb-2 mb-2 sticky top-0 bg-background z-10">
                <div className="col-span-3">Field</div>
                <div className="col-span-3">Existing</div>
                <div className="col-span-3">Incoming</div>
                <div className="col-span-3">Decision</div>
              </div>
              <div className="divide-y">
                {rows.length === 0 && (
                  <p className="text-sm text-muted-foreground py-6 text-center">No comparable fields populated.</p>
                )}
                {rows.map((r, idx) => {
                  const eqEmpty = isEmpty(r.existing);
                  const inEmpty = isEmpty(r.incoming);
                  return (
                    <div key={r.field} className={`grid grid-cols-12 gap-2 py-2 items-start text-sm ${r.conflict ? 'bg-destructive/5' : ''}`}>
                      <div className="col-span-3">
                        <div className="font-medium capitalize">{r.field.replace(/_/g, ' ')}</div>
                        {r.conflict && (
                          <span className="text-[10px] text-destructive flex items-center gap-1 mt-0.5">
                            <AlertTriangle className="h-3 w-3" />conflict
                          </span>
                        )}
                      </div>
                      <div className={`col-span-3 break-words whitespace-pre-wrap ${eqEmpty ? 'text-muted-foreground italic' : ''}`}>
                        {formatValue(r.existing)}
                      </div>
                      <div className={`col-span-3 break-words whitespace-pre-wrap ${inEmpty ? 'text-muted-foreground italic' : ''}`}>
                        {formatValue(r.incoming)}
                      </div>
                      <div className="col-span-3 flex flex-wrap gap-1">
                        {(['keep','use_incoming','fill_empty','append','mark_conflict'] as FieldAction[])
                          .filter((a) => {
                            if (a === 'append' && !r.isArray && !(typeof r.existing === 'string' || typeof r.incoming === 'string')) return false;
                            if (a === 'fill_empty' && !eqEmpty) return false;
                            return true;
                          })
                          .map((a) => (
                            <button
                              key={a}
                              type="button"
                              onClick={() => setAction(idx, a)}
                              className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                                r.action === a
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-muted/40 hover:bg-muted text-muted-foreground border-transparent'
                              }`}
                            >
                              {ACTION_LABEL[a]}
                            </button>
                          ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </ScrollArea>
        )}

        <Separator />
        <div className="px-6 py-3 flex items-center justify-between gap-2">
          <textarea
            className="flex-1 text-xs border rounded px-2 py-1 bg-background h-8 resize-none"
            placeholder="Reviewer notes (optional, saved to audit log)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" size="sm" onClick={handleReject} disabled={submitting}>
              <X className="h-3 w-3 mr-1" /> Reject
            </Button>
            <Button size="sm" onClick={handleConfirm} disabled={submitting || (mode === 'merge' && rows.length === 0)}>
              {submitting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : mode === 'add'
                ? <UserPlus className="h-3 w-3 mr-1" />
                : <GitMerge className="h-3 w-3 mr-1" />}
              {mode === 'add' ? 'Confirm add' : `Confirm merge (${summary.fillEmpty + summary.override + summary.appended} changes)`}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default LenderSyncReviewDrawer;