import { useEffect, useMemo, useState } from 'react';
import { Check, Edit3, Loader2, X, ListChecks, Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { useUiPreference } from '@/hooks/useUiPreference';
import { createTaskFromDraft, type TaskDraft } from '@/hooks/useNaitiveTaskParse';
import { getAsanaSyncContext, syncTaskToAsana } from '@/hooks/useAsanaTaskSync';
import { CreateTaskInlineCard } from './CreateTaskInlineCard';

/**
 * Shape mirrors `WorkflowAnalysis.suggested_tasks[i]` in
 * `useThreadWorkflowAnalysis`. Imported structurally to avoid a tight
 * cross-import.
 */
export interface FollowupSuggestionInput {
  title: string;
  why?: string;
  description?: string;
  task_type?: 'follow_up' | 'call' | 'email' | 'review' | 'send_doc' | 'meeting' | 'general';
  due_date_hint?: string;
  assignee_hint?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

interface Props {
  suggestions: FollowupSuggestionInput[];
  /** True while thread analysis is still in-flight. The card hides itself. */
  loading: boolean;
  /** Whether analysis has completed at least once for this thread. */
  hasAnalyzed: boolean;
  dealId?: string | null;
  dealName?: string | null;
  threadId?: string | null;
  subject?: string | null;
  senderEmail?: string | null;
  senderName?: string | null;
}

function nextBusinessDayIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function resolveDueIso(hint?: string): string {
  if (!hint || hint === 'next_business_day') return nextBusinessDayIso();
  return /^\d{4}-\d{2}-\d{2}$/.test(hint) ? hint : nextBusinessDayIso();
}

function stableId(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

function dismissalKey(threadId: string | null | undefined): string {
  return `naitive.followupSuggestions.dismissed.${threadId || 'none'}`;
}

function readDismissed(threadId: string | null | undefined): Set<string> {
  try {
    const raw = sessionStorage.getItem(dismissalKey(threadId));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function writeDismissed(threadId: string | null | undefined, set: Set<string>) {
  try {
    sessionStorage.setItem(dismissalKey(threadId), JSON.stringify(Array.from(set)));
  } catch {
    /* ignore */
  }
}

/**
 * SuggestedFollowupsCard
 * ----------------------
 * Renders AI-detected follow-up tasks as one-click Approve / Edit / Dismiss
 * cards inside the email AI Assist sidebar's Suggested Updates section.
 *
 * - Reuses the existing `workflowAnalysis.suggested_tasks` extracted by the
 *   smart-email-ai backend (no new edge function).
 * - Approve calls the same task-creation path the manual "Create Task"
 *   button uses (deal link, Asana sync, toast).
 * - Edit expands inline into `CreateTaskInlineCard` pre-filled with the
 *   suggestion title.
 * - Dismiss persists per-thread + per-suggestion in sessionStorage so the
 *   suggestion does not resurface on re-open of the same thread.
 *
 * Visibility rule:
 *   • Hidden while `loading` is true (matches the "Analyzing thread…" UX).
 *   • Hidden when analysis has not yet completed at least once.
 *   • When complete with zero remaining suggestions and a deal is in
 *     context, shows the documented empty state copy.
 */
export function SuggestedFollowupsCard({
  suggestions,
  loading,
  hasAnalyzed,
  dealId,
  dealName,
  threadId,
  subject,
  senderEmail,
  senderName,
}: Props) {
  const { user } = useAuth();
  const { company } = useCompany();
  const queryClient = useQueryClient();
  const [defaultAsanaSync] = useUiPreference<boolean>('default_asana_sync', true);

  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissed(threadId));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createdIds, setCreatedIds] = useState<Set<string>>(new Set());
  // Per-suggestion Asana sync toggle override (defaults to user preference).
  const [asanaOverrides, setAsanaOverrides] = useState<Record<string, boolean>>({});

  // Reset state when the thread changes — dismissals are per-thread.
  useEffect(() => {
    setDismissed(readDismissed(threadId));
    setEditingId(null);
    setBusyId(null);
    setCreatedIds(new Set());
    setAsanaOverrides({});
  }, [threadId]);

  const items = useMemo(() => {
    return suggestions.map((s, idx) => {
      const id = stableId(`${s.title}|${s.why || ''}|${idx}`);
      const dueIso = resolveDueIso(s.due_date_hint);
      return { id, raw: s, dueIso };
    }).filter((it) => !dismissed.has(it.id) && !createdIds.has(it.id));
  }, [suggestions, dismissed, createdIds]);

  // Hide entirely while analysis runs — prevents the empty state from
  // flashing during "Analyzing thread…".
  if (loading || !hasAnalyzed) return null;

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 flex items-center gap-2 text-[12px] text-muted-foreground">
        <ListChecks className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
        <span>No action items detected in this thread.</span>
      </div>
    );
  }

  const dismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    writeDismissed(threadId, next);
  };

  const approve = async (id: string, raw: FollowupSuggestionInput, dueIso: string) => {
    if (!user?.id) {
      toast.error('Sign in required to create tasks');
      return;
    }
    setBusyId(id);
    try {
      const draft: TaskDraft = {
        title: raw.title.trim(),
        description: raw.description || raw.why || (subject ? `Email: ${subject}` : null),
        due_date: dueIso,
        due_time: null,
        priority: raw.priority || 'normal',
        type: (raw.task_type as TaskDraft['type']) || 'follow_up',
        is_recurring: false,
        recurrence_rule: null,
        confidence: 1,
        owner_id: user.id,
        owner_label: 'You',
        owner_ambiguous: null,
        deal_id: dealId || null,
        deal_label: dealName || null,
        lender_id: null,
        lender_label: null,
        contact_id: null,
        contact_label: senderName || senderEmail || null,
        source_thread_id: threadId || null,
        hints: { owner: null, deal: null, lender: null, contact: null },
      };
      const result = await createTaskFromDraft(draft, user.id, company?.id || null, {
        syncSource: 'naitive_email_assist_followup_suggestion',
        sourceThreadId: threadId || null,
      });
      if (result?.id) {
        const wantsAsana = asanaOverrides[id] ?? defaultAsanaSync;
        if (wantsAsana) {
          try {
            const ctx = await getAsanaSyncContext(company?.id || null);
            if (ctx) {
              await syncTaskToAsana(ctx, {
                id: result.id,
                title: draft.title,
                description: draft.description,
                due_date: draft.due_date,
              });
            }
          } catch (e) {
            console.warn('[SuggestedFollowupsCard] Asana sync failed:', e);
          }
        }
        const created = new Set(createdIds);
        created.add(id);
        setCreatedIds(created);
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        toast.success(dealName ? `Task created and linked to ${dealName}` : 'Task created');
      }
    } catch (e) {
      console.error('[SuggestedFollowupsCard] approve failed', e);
      toast.error('Failed to create task — try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <ListChecks className="h-3 w-3 text-primary" />
        Suggested follow-ups
      </div>

      {items.map(({ id, raw, dueIso }) => {
        if (editingId === id) {
          return (
            <CreateTaskInlineCard
              key={id}
              dealId={dealId || null}
              dealName={dealName || null}
              threadId={threadId || null}
              subject={raw.title}
              senderEmail={senderEmail || null}
              senderName={senderName || null}
              defaultOpen
              onCancel={() => setEditingId(null)}
            />
          );
        }

        const wantsAsana = asanaOverrides[id] ?? defaultAsanaSync;
        const dueLabel = (() => {
          try { return format(new Date(dueIso), 'EEE MMM d'); } catch { return dueIso; }
        })();
        const isBusy = busyId === id;

        return (
          <div
            key={id}
            className="rounded-md border border-primary/20 bg-primary/[0.04] p-2.5 space-y-2"
          >
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                aria-label="Select suggestion"
                className="mt-[3px] h-3.5 w-3.5 accent-primary cursor-default"
                readOnly
                checked={false}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-foreground leading-snug break-words">
                  {raw.title}
                </div>
                {raw.why && (
                  <div className="text-[11px] text-muted-foreground leading-snug mt-0.5 break-words">
                    {raw.why}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground pl-[22px]">
              <span className="inline-flex items-center gap-1">
                <CalendarIcon className="h-3 w-3" />
                Due: <span className="text-foreground/80">{dueLabel}</span>
              </span>
              <span>Assign: <span className="text-foreground/80">You</span></span>
              <label className="inline-flex items-center gap-1.5 select-none">
                <Switch
                  checked={wantsAsana}
                  onCheckedChange={(v) => setAsanaOverrides((prev) => ({ ...prev, [id]: v }))}
                  className="scale-75 origin-left"
                />
                Sync to Asana
              </label>
            </div>

            <div className="flex items-center gap-1.5 pl-[22px]">
              <Button
                type="button"
                size="sm"
                className="h-7 px-2.5 text-[11px] gap-1.5"
                disabled={isBusy}
                onClick={() => approve(id, raw, dueIso)}
              >
                {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Approve
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-[11px] gap-1.5"
                disabled={isBusy}
                onClick={() => setEditingId(id)}
              >
                <Edit3 className="h-3 w-3" />
                Edit
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] gap-1.5 text-muted-foreground hover:text-foreground"
                disabled={isBusy}
                onClick={() => dismiss(id)}
              >
                <X className="h-3 w-3" />
                Dismiss
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}