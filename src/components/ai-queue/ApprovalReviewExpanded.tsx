import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { formatEditableDate, parseEditableDateToIso, isIsoDateLike, isDateFieldName } from './editableDate';
import { Loader2, Check, X, MessageSquare, ExternalLink, Pencil } from 'lucide-react';
import {
  QueuedAiAction,
  useApproveAiAction,
  useRejectAiAction,
  useRequestMoreContext,
} from '@/hooks/useAiActionQueue';
import {
  buildOutcomeSentence,
  approveButtonLabel,
  targetSummary,
  toSingleSentence,
} from './approvalCopy';
import { TaskListEditor, type EditorTask } from './TaskListEditor';
import { ClientReminderPreview } from './ClientReminderPreview';

/**
 * Decision-first expanded review for an Approval Queue item.
 *
 * Top of card: a single bold sentence that answers "what will happen if I
 * approve". Below: old → new diff (inline editable), rationale, evidence,
 * and the reviewer action bar.
 */

interface Props {
  item: QueuedAiAction;
  onDone?: () => void;
}

export function ApprovalReviewExpanded({ item, onDone }: Props) {
  const approve = useApproveAiAction();
  const reject = useRejectAiAction();
  const askMore = useRequestMoreContext();

  const [busy, setBusy] = useState<null | 'approve' | 'reject' | 'more'>(null);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showMoreInput, setShowMoreInput] = useState(false);
  const [moreNotes, setMoreNotes] = useState('');
  const [edits, setEdits] = useState<Record<string, any>>({});

  const outcome = useMemo(() => buildOutcomeSentence(item), [item]);
  const target = useMemo(() => targetSummary(item), [item]);
  const oldValues = item.old_values || {};
  const newValues = item.new_values || {};
  const isUpdateTasksPrompt =
    item.action_type === 'create_followup_task' &&
    (newValues as any)?._synthetic === 'update_tasks';
  const fieldKeys = useMemo(() => {
    if (isUpdateTasksPrompt) return [] as string[];
    const norm = (v: any) =>
      v == null || (typeof v === 'string' && v.trim() === '') ? '' : String(v).trim();
    const keys = new Set<string>([
      ...Object.keys(oldValues),
      ...Object.keys(newValues),
    ]);
    // Only surface fields that actually have a proposed change: the new
    // value must be non-empty AND different from the current value.
    return Array.from(keys).filter((k) => {
      const proposed = norm((newValues as any)[k]);
      if (!proposed) return false;
      return proposed !== norm((oldValues as any)[k]);
    });
  }, [oldValues, newValues, isUpdateTasksPrompt]);

  const editedCount = Object.keys(edits).length;

  const handleApprove = async () => {
    setBusy('approve');
    await approve(item, editedCount > 0 ? { editedValues: edits } : undefined);
    setBusy(null);
    onDone?.();
  };

  const handleReject = async () => {
    setBusy('reject');
    await reject(item.id, rejectReason || undefined);
    setBusy(null);
    onDone?.();
  };

  const handleMore = async () => {
    if (!moreNotes.trim()) return;
    setBusy('more');
    await askMore(item.id, moreNotes.trim());
    setBusy(null);
    onDone?.();
  };

  const isDraftEmail = item.action_type === 'draft_email';
  const evidence = Array.isArray(item.evidence) ? item.evidence : [];

  const initialTasks: EditorTask[] = useMemo(() => {
    if (!isUpdateTasksPrompt) return [];
    const seeded = Array.isArray((newValues as any)?.tasks)
      ? (newValues as any).tasks
      : [];
    if (seeded.length > 0) {
      return seeded.map((t: any) => ({
        title: String(t?.title ?? ''),
        due_date: t?.due_date ?? null,
        assigned_to: t?.assigned_to ?? null,
        description: t?.description ?? null,
      }));
    }
    return [{
      title: '',
      due_date: (newValues as any)?.due_date ?? null,
      assigned_to: (newValues as any)?.assigned_to ?? null,
    }];
  }, [isUpdateTasksPrompt, newValues]);

  return (
    <div className="mt-2 space-y-3 rounded-md border border-white/10 bg-background/60 p-3 text-[12px]">
      {/* Decision-first headline */}
      <div className="space-y-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Proposed action
        </p>
        <p className="font-semibold text-foreground leading-snug">{outcome}</p>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
          <Badge variant="outline" className="h-4 px-1.5 text-[10px] border-white/15">
            Target: {target}
          </Badge>
          {item.risk_level && (
            <Badge
              variant="outline"
              className={
                item.risk_level === 'high'
                  ? 'border-red-500/40 text-red-400 text-[10px]'
                  : item.risk_level === 'medium'
                  ? 'border-amber-500/40 text-amber-400 text-[10px]'
                  : 'border-emerald-500/40 text-emerald-400 text-[10px]'
              }
            >
              {item.risk_level} risk
            </Badge>
          )}
          {item.priority && item.priority !== 'normal' && (
            <Badge variant="outline" className="h-4 px-1.5 text-[10px] border-primary/40 text-primary capitalize">
              {item.priority}
            </Badge>
          )}
        </div>
      </div>

      {/* Task-list creator for the synthetic "Needs Tasks" prompt */}
      {isUpdateTasksPrompt && (
        <TaskListEditor
          dealName={item.deal_name || 'this deal'}
          initialTasks={initialTasks}
          onChange={(tasks) => setEdits((p) => ({ ...p, tasks }))}
        />
      )}

      {/* Client-reminder email preview (Rules D-1 & D-2) */}
      {!isUpdateTasksPrompt && <ClientReminderPreview item={item} />}

      {/* Old → New diff */}
      {!isUpdateTasksPrompt && fieldKeys.length > 0 && (
        <div className="rounded border border-white/10">
          <div className="grid grid-cols-[110px_1fr_1fr] gap-0 text-[11px]">
            <div className="px-2 py-1 bg-white/[0.03] font-medium text-muted-foreground border-b border-white/10">Field</div>
            <div className="px-2 py-1 bg-white/[0.03] font-medium text-muted-foreground border-b border-white/10">Current</div>
            <div className="px-2 py-1 bg-white/[0.03] font-medium text-muted-foreground border-b border-white/10">Proposed</div>
            {fieldKeys.map((k) => {
              const oldV = (oldValues as any)[k];
              const proposed = edits[k] ?? (newValues as any)[k];
              const proposedStr = proposed == null ? '' : String(proposed);
              const isDateField = isDateFieldName(k) || isIsoDateLike(proposed) || isIsoDateLike(oldV);
              const editableValue = isDateField ? formatEditableDate(proposed) : proposedStr;
              const oldDisplay = oldV == null
                ? '—'
                : isDateField
                  ? (formatEditableDate(oldV) || String(oldV))
                  : String(oldV);
              return (
                <div key={k} className="contents">
                  <div className="px-2 py-1.5 border-b border-white/5 text-foreground">{k}</div>
                  <div className="px-2 py-1.5 border-b border-white/5 text-muted-foreground line-through">
                    {oldDisplay}
                  </div>
                  <div className="px-2 py-1.5 border-b border-white/5">
                    <Input
                      type="text"
                      placeholder={isDateField ? 'MM-DD-YYYY' : undefined}
                      value={isDateField ? editableValue : proposedStr}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (isDateField) {
                          const parsed = parseEditableDateToIso(v, (newValues as any)[k] ?? oldV);
                          setEdits((p) => ({ ...p, [k]: parsed ?? '' }));
                        } else {
                          setEdits((p) => ({ ...p, [k]: v }));
                        }
                      }}
                      className="h-6 text-[11px] px-1.5"
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {editedCount > 0 && (
            <div className="px-2 py-1 bg-amber-500/5 text-[10px] text-amber-400 border-t border-amber-500/20">
              <Pencil className="inline h-2.5 w-2.5 mr-1" />
              {editedCount} field{editedCount !== 1 ? 's' : ''} edited — Approve will save changes.
            </div>
          )}
        </div>
      )}

      {/* Draft email preview */}
      {isDraftEmail && (
        <div className="rounded border border-white/10 p-2 text-[11px] space-y-1">
          <div><span className="text-muted-foreground">To:</span> {JSON.stringify((item.new_values as any)?.to ?? (item.payload as any)?.to ?? [])}</div>
          <div><span className="text-muted-foreground">Subject:</span> {(item.new_values as any)?.subject ?? (item.payload as any)?.subject ?? '—'}</div>
          <div
            className="prose prose-invert prose-sm max-w-none border-t border-white/10 pt-1 mt-1"
            dangerouslySetInnerHTML={{
              __html: (item.new_values as any)?.body_html ?? (item.payload as any)?.body_html ?? (item.description ?? '')
            }}
          />
          <p className="text-[10px] text-amber-400 italic">Approve stages this for manual send — it will not auto-send.</p>
        </div>
      )}

      {/* Rationale */}
      {!isUpdateTasksPrompt && item.rationale && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Rationale</p>
          <p className="text-[13px] text-white">{toSingleSentence(item.rationale)}</p>
        </div>
      )}

      {/* Evidence */}
      {evidence.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Evidence</p>
          <ul className="space-y-1">
            {evidence.map((e, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px]">
                <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0">{e.kind}</Badge>
                {e.url ? (
                  <a href={e.url} target="_blank" rel="noreferrer"
                     className="text-primary hover:underline truncate flex items-center gap-1">
                    {e.label} <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                ) : (
                  <span className="text-foreground/80">{e.label}</span>
                )}
                {e.snippet && (
                  <span className="text-muted-foreground italic line-clamp-1">— {e.snippet}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Reject reason input */}
      {showRejectInput && (
        <Textarea
          placeholder="Optional reason for rejection…"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          className="min-h-[44px] text-[11px]"
        />
      )}

      {/* More context input */}
      {showMoreInput && (
        <Textarea
          placeholder="What additional context do you need before approving?"
          value={moreNotes}
          onChange={(e) => setMoreNotes(e.target.value)}
          className="min-h-[44px] text-[11px]"
        />
      )}

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/10">
        <Button
          size="sm"
          className="h-7 px-2.5 gap-1 bg-gradient-to-r from-primary to-primary/70 text-primary-foreground hover:from-primary/90 hover:to-primary/60"
          disabled={busy !== null}
          onClick={handleApprove}
        >
          {busy === 'approve' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          {approveButtonLabel(item, editedCount > 0)}
        </Button>
        {!showRejectInput ? (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]"
                  onClick={() => setShowRejectInput(true)}>
            <X className="h-3 w-3 mr-1" /> Reject
          </Button>
        ) : (
          <Button size="sm" variant="destructive" className="h-7 px-2 text-[11px]"
                  disabled={busy !== null}
                  onClick={handleReject}>
            {busy === 'reject' ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3 mr-1" />}
            Confirm reject
          </Button>
        )}
        {!showMoreInput ? (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]"
                  onClick={() => setShowMoreInput(true)}>
            <MessageSquare className="h-3 w-3 mr-1" /> Request context
          </Button>
        ) : (
          <Button size="sm" variant="secondary" className="h-7 px-2 text-[11px]"
                  disabled={busy !== null || !moreNotes.trim()}
                  onClick={handleMore}>
            {busy === 'more' ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquare className="h-3 w-3 mr-1" />}
            Send to agent
          </Button>
        )}
        {item.deal_id && (
          <a
            href={`/deals/${item.deal_id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline ml-auto"
          >
            Open record <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>

      {item.execution_error && (
        <p className="text-[11px] text-red-400">
          Last execution failed: {item.execution_error}
        </p>
      )}
    </div>
  );
}