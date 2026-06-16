import { useState, useMemo } from 'react';
import { Check, X, Loader2, ListTodo, Calendar as CalendarIcon, User as UserIcon, Link2, MinusCircle, AlertTriangle, RefreshCw, Inbox as InboxIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { useQueryClient } from '@tanstack/react-query';
import { createTaskFromDraft, type TaskDraft } from '@/hooks/useNaitiveTaskParse';
import { getAsanaSyncContext, syncTaskToAsana } from '@/hooks/useAsanaTaskSync';
import { useUiPreference } from '@/hooks/useUiPreference';
import type { WorkflowAnalysis } from '@/hooks/useThreadWorkflowAnalysis';
import { useEnqueueAiAction } from '@/hooks/useAiActionQueue';
import { useApprovalQueueAccess } from '@/hooks/useApprovalQueueAccess';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type Suggestion = NonNullable<WorkflowAnalysis['suggested_tasks']>[number];

interface Props {
  suggestions: Suggestion[];
  dealId: string | null | undefined;
  dealName: string | null | undefined;
  threadId?: string | null;
}

/**
 * Compute the next business day in the user's local timezone, returning
 * an ISO 'YYYY-MM-DD' string. Skips Saturday and Sunday.
 */
function nextBusinessDayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function resolveDueDate(hint: string): string {
  if (!hint) return nextBusinessDayISO();
  if (/^\d{4}-\d{2}-\d{2}$/.test(hint)) return hint;
  return nextBusinessDayISO();
}

function formatDue(iso: string): string {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

/**
 * Normalize a suggested task into a stable dedup signature so the same
 * next-action sentence (e.g. "Send the due diligence list to Steven")
 * collapses to one card even when the AI re-emits it across multiple
 * messages in the same thread, or with trivial punctuation/casing
 * variations. We normalize the title + verb-ish task_type and treat the
 * due-date hint as part of the signature only when it's an explicit
 * date — otherwise "next_business_day" / empty all collapse together.
 */
function dedupSignature(s: Suggestion): string {
  const title = (s.title || '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d`'"]/g, '')
    .replace(/[^a-z0-9\s@.]/g, ' ')
    .replace(/\b(the|a|an|please|kindly|to|for|with|by|on|of|and)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const explicitDate = /^\d{4}-\d{2}-\d{2}$/.test(s.due_date_hint || '')
    ? s.due_date_hint
    : '';
  return `${s.task_type || 'general'}::${title}::${explicitDate}`;
}

/**
 * Resolve a deal-manager name string (e.g. deals.manager) into a profile
 * user_id by case-insensitive match against display_name / first_name.
 * Mirrors the resolution used by `receive-flex-activity`.
 */
async function resolveManagerUserId(dealId: string): Promise<{ userId: string | null; label: string | null }> {
  const { data: deal } = await supabase
    .from('deals')
    .select('manager, deal_owner')
    .eq('id', dealId)
    .maybeSingle();
  const name = (deal?.manager || deal?.deal_owner || '').trim();
  if (!name) return { userId: null, label: null };
  const safe = name.replace(/[,()]/g, ' ').trim();
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, first_name')
    .or(`display_name.ilike.%${safe}%,first_name.ilike.%${safe}%`)
    .limit(1)
    .maybeSingle();
  return { userId: profile?.id || null, label: name };
}

export function SuggestedTaskCards({ suggestions, dealId, dealName, threadId }: Props) {
  const { user } = useAuth();
  const { company } = useCompany();
  const queryClient = useQueryClient();
  const enqueueAiAction = useEnqueueAiAction();
  const { enabled: approvalQueueEnabled } = useApprovalQueueAccess();
  // Profile-level default for "Sync new tasks to Asana". Editable on the
  // Account page; per-card switches still override on a one-off basis.
  const [defaultAsanaSync] = useUiPreference<boolean>('default_asana_sync', true);
  // Tracks whether the user has already acknowledged the one-time
  // "tasks will only live in naitive" notice when turning Asana sync off.
  const [asanaOffAck, setAsanaOffAck] = useUiPreference<boolean>(
    'asana_off_confirmed',
    false,
  );
  const [pendingOffKey, setPendingOffKey] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [retryingKey, setRetryingKey] = useState<string | null>(null);
  type AsanaStatus = 'synced' | 'skipped' | 'failed';
  type CreatedRecord = {
    dueDate: string;
    assigneeLabel: string | null;
    asana: AsanaStatus;
    taskId: string;
    draft: { title: string; description: string | null; due_date: string };
  };
  const [createdKeys, setCreatedKeys] = useState<Record<string, CreatedRecord>>({});
  const [dismissedKeys, setDismissedKeys] = useState<Record<string, true>>({});
  // Per-card "Sync to Asana" toggle. Initialized from the user's
  // profile-level default (`default_asana_sync`); each card can still be
  // flipped individually before clicking Create.
  const [asanaSyncByKey, setAsanaSyncByKey] = useState<Record<string, boolean>>({});
  const isAsanaSyncOn = (key: string) =>
    asanaSyncByKey[key] !== undefined ? asanaSyncByKey[key] : defaultAsanaSync;

  /**
   * Intercept Asana toggle changes. The first time a user turns the
   * sync OFF, surface a lightweight confirmation explaining that the
   * task will only be created inside naitive. After they confirm once,
   * the preference is remembered and subsequent toggles are silent.
   */
  const handleAsanaToggle = (key: string, next: boolean) => {
    if (!next && !asanaOffAck) {
      setPendingOffKey(key);
      return;
    }
    setAsanaSyncByKey((prev) => ({ ...prev, [key]: next }));
  };

  const confirmAsanaOff = () => {
    if (pendingOffKey) {
      setAsanaSyncByKey((prev) => ({ ...prev, [pendingOffKey]: false }));
    }
    setAsanaOffAck(true);
    setPendingOffKey(null);
  };

  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: Suggestion[] = [];
    for (const s of suggestions || []) {
      if (!s || !s.title || s.title.trim().length === 0) continue;
      const sig = dedupSignature(s);
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push(s);
    }
    return out;
  }, [suggestions]);

  if (items.length === 0) return null;

  const handleCreate = async (s: Suggestion, key: string) => {
    const syncToAsana = isAsanaSyncOn(key);
    if (!user?.id) {
      toast.error('Sign in required to create tasks');
      return;
    }
    setBusyKey(key);
    try {
      const dueDate = resolveDueDate(s.due_date_hint);
      let ownerId: string | null = user.id;
      let ownerLabel: string | null = 'You';
      if (dealId && (!s.assignee_hint || s.assignee_hint === 'deal_manager')) {
        const resolved = await resolveManagerUserId(dealId);
        if (resolved.userId) {
          ownerId = resolved.userId;
          ownerLabel = resolved.label;
        } else if (resolved.label) {
          ownerLabel = `${resolved.label} (unresolved — assigned to you)`;
        }
      }

      const draft: TaskDraft = {
        title: s.title,
        // Prefer the richer `description` (used by call-commitment tasks
        // to carry call context + extracted Cell/Office/Email contact
        // details from the counterparty's signature). Fall back to the
        // shorter `why` trigger sentence when no description is provided.
        description: (s.description && s.description.trim().length > 0)
          ? s.description
          : (s.why || null),
        due_date: dueDate,
        due_time: null,
        priority: s.priority || 'normal',
        type: s.task_type || 'follow_up',
        is_recurring: false,
        recurrence_rule: null,
        confidence: 1,
        owner_id: ownerId,
        owner_label: ownerLabel,
        owner_ambiguous: null,
        deal_id: dealId || null,
        deal_label: dealName || null,
        lender_id: null,
        lender_label: null,
        contact_id: null,
        contact_label: null,
        source_thread_id: threadId || null,
        hints: { owner: null, deal: null, lender: null, contact: null },
      };

      const created = await createTaskFromDraft(draft, user.id, company?.id || null, {
        syncSource: 'naitive_email_assist_workflow',
        sourceThreadId: threadId || null,
      });

      if (created?.id) {
        // Best-effort Asana sync — non-fatal. Gated by the per-card toggle.
        // Track the outcome so the card can render an accurate indicator
        // ("Synced to Asana" / "Asana skipped" / "Asana failed").
        let asanaStatus: AsanaStatus = 'skipped';
        if (syncToAsana) {
          try {
            const ctx = await getAsanaSyncContext(company?.id || null);
            if (ctx) {
              await syncTaskToAsana(ctx, {
                id: created.id,
                title: draft.title,
                description: draft.description,
                due_date: draft.due_date,
              });
              asanaStatus = 'synced';
            } else {
              // Asana not configured for this workspace — treat as skipped.
              asanaStatus = 'skipped';
            }
          } catch (e) {
            console.warn('[SuggestedTaskCards] Asana sync failed:', e);
            asanaStatus = 'failed';
          }
        }

        setCreatedKeys((prev) => ({
          ...prev,
          [key]: {
            dueDate,
            assigneeLabel: ownerLabel,
            asana: asanaStatus,
            taskId: created.id,
            draft: {
              title: draft.title,
              description: draft.description,
              due_date: draft.due_date,
            },
          },
        }));
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        toast.success('Task created', {
          description: `${s.title} • due ${formatDue(dueDate)}`,
        });
      }
    } catch (e: any) {
      console.error('[SuggestedTaskCards] create failed', e);
      toast.error(e?.message || 'Failed to create task');
    } finally {
      setBusyKey(null);
    }
  };

  const handleRetryAsana = async (key: string) => {
    const rec = createdKeys[key];
    if (!rec) return;
    setRetryingKey(key);
    try {
      const ctx = await getAsanaSyncContext(company?.id || null);
      if (!ctx) {
        toast.error('Asana is not configured for this workspace');
        return;
      }
      await syncTaskToAsana(ctx, {
        id: rec.taskId,
        title: rec.draft.title,
        description: rec.draft.description,
        due_date: rec.draft.due_date,
      });
      setCreatedKeys((prev) => ({
        ...prev,
        [key]: { ...prev[key], asana: 'synced' },
      }));
      toast.success('Synced to Asana');
    } catch (e: any) {
      console.warn('[SuggestedTaskCards] Asana retry failed:', e);
      toast.error(e?.message || 'Asana sync failed — please try again');
    } finally {
      setRetryingKey(null);
    }
  };

  return (
    <div className="space-y-2">
      <AlertDialog
        open={pendingOffKey !== null}
        onOpenChange={(open) => {
          if (!open) setPendingOffKey(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn off Asana sync?</AlertDialogTitle>
            <AlertDialogDescription>
              This task will be created only in naitive and won't appear in
              Asana. You can flip the toggle back on at any time before
              creating the task. We'll remember your choice for next time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Asana sync on</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAsanaOff}>
              Turn off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {items.map((s, idx) => {
        const key = dedupSignature(s) || `${s.title}::${idx}`;
        if (dismissedKeys[key]) return null;
        const created = createdKeys[key];
        const previewDue = created
          ? created.dueDate
          : resolveDueDate(s.due_date_hint);
        const previewAssignee = created?.assigneeLabel
          || (s.assignee_hint && s.assignee_hint !== 'deal_manager'
            ? s.assignee_hint
            : 'Deal manager');

        return (
          <div
            key={key}
            className="rounded-md border border-primary/15 bg-primary/[0.03] p-2.5 space-y-2 max-w-full min-w-0"
          >
            <div className="flex items-start gap-1.5 min-w-0">
              <ListTodo className="h-3 w-3 text-primary shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p
                  className="text-[12px] text-foreground font-semibold leading-snug"
                  style={{ overflowWrap: 'anywhere', whiteSpace: 'normal' }}
                >
                  {created ? <span className="line-through opacity-70">{s.title}</span> : s.title}
                </p>
                {s.why && (
                  <p
                    className="text-[10px] text-muted-foreground mt-0.5 leading-snug"
                    style={{ overflowWrap: 'anywhere', whiteSpace: 'normal' }}
                  >
                    {s.why}
                  </p>
                )}
                {s.description && s.description.trim().length > 0 && (
                  <pre
                    className="text-[10.5px] text-foreground/75 mt-1 leading-snug font-sans whitespace-pre-wrap"
                    style={{ overflowWrap: 'anywhere' }}
                  >
                    {s.description}
                  </pre>
                )}
              </div>
              {created && (
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge
                    variant="outline"
                    className="text-[9px] h-4 px-1.5 border bg-emerald-500/10 text-emerald-400 border-emerald-500/30 gap-1"
                  >
                    <Check className="h-2.5 w-2.5" /> Created
                  </Badge>
                  {created.asana === 'synced' && (
                    <Badge
                      variant="outline"
                      className="text-[9px] h-4 px-1.5 border bg-sky-500/10 text-sky-400 border-sky-500/30 gap-1"
                      title="Also created in Asana"
                    >
                      <Link2 className="h-2.5 w-2.5" /> Asana synced
                    </Badge>
                  )}
                  {created.asana === 'skipped' && (
                    <Badge
                      variant="outline"
                      className="text-[9px] h-4 px-1.5 border bg-muted/40 text-muted-foreground border-muted-foreground/20 gap-1"
                      title="Asana sync was turned off for this task"
                    >
                      <MinusCircle className="h-2.5 w-2.5" /> Asana skipped
                    </Badge>
                  )}
                  {created.asana === 'failed' && (
                    <div className="flex items-center gap-1">
                      <Badge
                        variant="outline"
                        className="text-[9px] h-4 px-1.5 border bg-amber-500/10 text-amber-400 border-amber-500/30 gap-1"
                        title="Task created in naitive but Asana sync failed"
                      >
                        <AlertTriangle className="h-2.5 w-2.5" /> Asana failed
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-4 px-1.5 text-[9px] gap-1 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                        disabled={retryingKey === key}
                        onClick={() => handleRetryAsana(key)}
                        title="Retry syncing this task to Asana"
                      >
                        {retryingKey === key ? (
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-2.5 w-2.5" />
                        )}
                        Retry
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1 min-w-0 truncate">
                <CalendarIcon className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{formatDue(previewDue)}</span>
              </span>
              <span className="inline-flex items-center gap-1 min-w-0 truncate">
                <UserIcon className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{previewAssignee}</span>
              </span>
              {dealName && (
                <span className="inline-flex items-center gap-1 min-w-0 truncate ml-auto">
                  <span className="truncate">{dealName}</span>
                </span>
              )}
            </div>

            {!created && (
              <div className="flex items-center gap-2 min-w-0">
                <label
                  className="inline-flex items-center gap-1 text-[10px] text-muted-foreground select-none cursor-pointer shrink-0"
                  title="Also create this task in Asana"
                >
                  <Switch
                    checked={isAsanaSyncOn(key)}
                    onCheckedChange={(v) => handleAsanaToggle(key, v)}
                    className="h-3.5 w-6 data-[state=checked]:bg-primary"
                  />
                  <Link2 className="h-2.5 w-2.5" />
                  Asana
                </label>
                <Button
                  size="sm"
                  className="h-7 px-2 text-[11px] gap-1 flex-1 min-w-0"
                  disabled={busyKey === key}
                  onClick={() => handleCreate(s, key)}
                >
                  {busyKey === key ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                  Create task
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px] gap-1 shrink-0"
                  title="Add to Approval Queue for batch review"
                  onClick={async () => {
                    await enqueueAiAction({
                      action_type: 'create_task',
                      title: s.title || 'New task',
                      description: s.title || null,
                      deal_id: dealId || null,
                      deal_name: dealName || null,
                      payload: {
                        title: s.title,
                        due_date: resolveDueDate(s.due_date_hint || ''),
                        assigned_to: user?.id,
                        task_type: s.task_type || 'general',
                      },
                      source: { thread_id: threadId || null },
                    });
                    setDismissedKeys((prev) => ({ ...prev, [key]: true }));
                  }}
                >
                  <InboxIcon className="h-3 w-3" />
                  Add to Queue
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-6 p-0 text-muted-foreground"
                  onClick={() => setDismissedKeys((prev) => ({ ...prev, [key]: true }))}
                  title="Dismiss"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}