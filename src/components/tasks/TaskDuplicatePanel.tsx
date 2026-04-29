import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, GitMerge, Loader2, Sparkles, X } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTaskDuplicateCandidates, type DupCandidateRow, type CompareTaskRef } from '@/hooks/useTaskDuplicateCandidates';
import { cn } from '@/lib/utils';

interface Props {
  taskId: string;
  /** Hide the manual "Re-check" button when caller already triggers checks (e.g. on save). */
  hideRecheck?: boolean;
  className?: string;
}

const RESULT_TONES: Record<DupCandidateRow['result'], { tone: string; label: string }> = {
  duplicate:    { tone: '#e57373', label: 'Likely duplicate' },
  needs_review: { tone: '#e89b6c', label: 'Needs review' },
  related:      { tone: '#7eb8f7', label: 'Related' },
  distinct:     { tone: '#7fc89a', label: 'Distinct' },
};

function CompactTaskCard({ task, label, accent }: { task: CompareTaskRef | undefined; label: string; accent?: boolean }) {
  if (!task) {
    return (
      <div className="rounded-md border px-2.5 py-2 text-[11px]" style={{ borderColor: 'rgba(255,255,255,0.06)', color: '#7a8194' }}>
        {label}: <span className="italic">unavailable</span>
      </div>
    );
  }
  return (
    <div
      className={cn('rounded-md border px-2.5 py-2 space-y-1', accent && 'ring-1')}
      style={{
        borderColor: accent ? 'rgba(126,184,247,0.45)' : 'rgba(255,255,255,0.06)',
        backgroundColor: accent ? 'rgba(126,184,247,0.06)' : 'rgba(20,24,32,0.55)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide font-medium" style={{ color: accent ? '#cfe3ff' : '#7a8194' }}>
          {label}
        </span>
        <span className="text-[10px]" style={{ color: '#7a8194' }}>
          {format(new Date(task.updated_at), 'MMM d')}
        </span>
      </div>
      <div className="text-[12px] font-medium truncate" style={{ color: '#eef1f6' }}>{task.title}</div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge variant="outline" className="text-[9px] py-0 px-1.5 border-[rgba(255,255,255,0.08)]" style={{ color: '#9aa3b6' }}>
          {task.status}
        </Badge>
        <Badge variant="outline" className="text-[9px] py-0 px-1.5 border-[rgba(255,255,255,0.08)]" style={{ color: '#9aa3b6' }}>
          {task.priority}
        </Badge>
        {task.due_date && (
          <span className="text-[10px]" style={{ color: '#9aa3b6' }}>due {format(new Date(task.due_date), 'MMM d')}</span>
        )}
      </div>
    </div>
  );
}

function DupRowCard({ row, candidateId, comparedMap, onMerge, onMarkRelated, onKeepSeparate, onDismiss, busy }: {
  row: DupCandidateRow;
  candidateId: string;
  comparedMap: Record<string, CompareTaskRef>;
  onMerge: (canonicalId: string) => void;
  onMarkRelated: () => void;
  onKeepSeparate: () => void;
  onDismiss: () => void;
  busy: boolean;
}) {
  const candidate = comparedMap[candidateId];
  // Pick canonical: AI's pick if valid, else the most recent peer.
  const peers = (row.compared_task_ids || []).filter(id => id !== candidateId);
  const inferredCanonical = row.canonical_task_id && row.canonical_task_id !== candidateId
    ? row.canonical_task_id
    : peers[0];
  const canonical = inferredCanonical ? comparedMap[inferredCanonical] : undefined;
  const tone = RESULT_TONES[row.result];
  const showMerge = row.result === 'duplicate' || row.result === 'needs_review';

  return (
    <div
      className="rounded-lg border p-3 space-y-3"
      style={{ borderColor: 'rgba(255,255,255,0.07)', backgroundColor: 'rgba(15,18,22,0.55)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border"
            style={{ color: tone.tone, borderColor: `${tone.tone}55`, backgroundColor: `${tone.tone}1a` }}
          >
            <AlertTriangle className="h-2.5 w-2.5" />
            {tone.label}
          </span>
          <span className="text-[10px]" style={{ color: '#7a8194' }}>
            {Math.round(row.confidence * 100)}% confidence
          </span>
        </div>
        <button
          onClick={onDismiss}
          disabled={busy}
          className="p-1 rounded hover:bg-[rgba(255,255,255,0.04)] transition-colors disabled:opacity-50"
          title="Dismiss"
        >
          <X className="h-3 w-3" style={{ color: '#7a8194' }} />
        </button>
      </div>

      {row.user_explanation && (
        <p className="text-[11px] leading-snug" style={{ color: '#cbd1de' }}>{row.user_explanation}</p>
      )}

      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
        <CompactTaskCard task={candidate} label="This task" />
        <ArrowRight className="h-3.5 w-3.5" style={{ color: '#5b6173' }} />
        <CompactTaskCard task={canonical} label="Canonical pick" accent />
      </div>

      {row.reasons?.length > 0 && (
        <ul className="space-y-0.5 pl-3.5 text-[10.5px] list-disc" style={{ color: '#9aa3b6' }}>
          {row.reasons.slice(0, 4).map((r, i) => (<li key={i}>{r}</li>))}
        </ul>
      )}

      <div className="flex items-center gap-1.5 flex-wrap pt-1">
        {showMerge && canonical && (
          <Button
            size="sm"
            className="h-7 text-[11px] gap-1 border"
            style={{
              background: 'linear-gradient(180deg, rgba(229,115,115,0.22) 0%, rgba(180,90,90,0.22) 100%)',
              color: '#ffe5e5',
              borderColor: 'rgba(229,115,115,0.4)',
            }}
            onClick={() => onMerge(canonical.id)}
            disabled={busy}
          >
            <GitMerge className="h-3 w-3" /> Consolidate
          </Button>
        )}
        <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={onMarkRelated} disabled={busy}>
          Mark related
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={onKeepSeparate} disabled={busy}>
          <Check className="h-3 w-3" /> Keep separate
        </Button>
      </div>
    </div>
  );
}

export function TaskDuplicatePanel({ taskId, hideRecheck, className }: Props) {
  const { rows, comparedMap, isLoading, runCheck, decide, consolidate } = useTaskDuplicateCandidates(taskId);
  const [confirmMerge, setConfirmMerge] = useState<{ rowId: string; canonicalId: string } | null>(null);

  const busy = decide.isPending || consolidate.isPending;
  const hasRows = rows.length > 0;

  const summary = useMemo(() => {
    if (!hasRows) return null;
    const dup = rows.filter(r => r.result === 'duplicate').length;
    const review = rows.filter(r => r.result === 'needs_review').length;
    const rel = rows.filter(r => r.result === 'related').length;
    const parts: string[] = [];
    if (dup) parts.push(`${dup} likely duplicate${dup === 1 ? '' : 's'}`);
    if (review) parts.push(`${review} to review`);
    if (rel) parts.push(`${rel} related`);
    return parts.join(' · ');
  }, [rows, hasRows]);

  if (!taskId) return null;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3" style={{ color: '#e89b6c' }} />
          <span className="text-xs font-medium" style={{ color: '#8b92a5' }}>
            Possible duplicates
          </span>
          {summary && (
            <span className="text-[10px]" style={{ color: '#7a8194' }}>· {summary}</span>
          )}
        </div>
        {!hideRecheck && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px] gap-1"
            onClick={() => runCheck.mutate(taskId)}
            disabled={runCheck.isPending}
            style={{ color: '#8b92a5' }}
            title="Run duplicate check now"
          >
            {runCheck.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            Re-check
          </Button>
        )}
      </div>

      {isLoading && !hasRows && (
        <div className="text-[11px]" style={{ color: '#7a8194' }}>Checking…</div>
      )}

      {!isLoading && !hasRows && (
        <div
          className="rounded-md border px-3 py-2 text-[11px]"
          style={{ borderColor: 'rgba(255,255,255,0.06)', backgroundColor: 'rgba(20,24,32,0.45)', color: '#7a8194' }}
        >
          No duplicate candidates pending.{!hideRecheck && ' Use Re-check to scan now.'}
        </div>
      )}

      <div className="space-y-2">
        {rows.map(row => (
          <DupRowCard
            key={row.id}
            row={row}
            candidateId={taskId}
            comparedMap={comparedMap}
            busy={busy}
            onMerge={(canonicalId) => setConfirmMerge({ rowId: row.id, canonicalId })}
            onMarkRelated={() => decide.mutate({ rowId: row.id, action: 'mark_related' })}
            onKeepSeparate={() => decide.mutate({ rowId: row.id, action: 'keep_separate' })}
            onDismiss={() => decide.mutate({ rowId: row.id, action: 'dismiss' })}
          />
        ))}
      </div>

      <AlertDialog open={!!confirmMerge} onOpenChange={(o) => !o && setConfirmMerge(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Consolidate this task?</AlertDialogTitle>
            <AlertDialogDescription>
              This task will be merged into the canonical pick. Non-empty fields, comments,
              attachments, subtasks, and collaborators will be copied if missing on the canonical
              task. This task will then be archived. This action can be reversed by un-archiving.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmMerge) return;
                consolidate.mutate({
                  rowId: confirmMerge.rowId,
                  candidateId: taskId,
                  canonicalId: confirmMerge.canonicalId,
                });
                setConfirmMerge(null);
              }}
            >
              Consolidate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}