import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, ListTodo, Loader2, Sparkles, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { useUiPreference } from '@/hooks/useUiPreference';
import { createTaskFromDraft, type TaskDraft } from '@/hooks/useNaitiveTaskParse';
import { getAsanaSyncContext, syncTaskToAsana } from '@/hooks/useAsanaTaskSync';
import type { WorkflowAnalysis } from '@/hooks/useThreadWorkflowAnalysis';

type Suggestion = NonNullable<WorkflowAnalysis['suggested_tasks']>[number];

/**
 * Preview state passed via react-router `location.state`. Kept in-memory
 * only — refreshing the page re-routes the user back to the source thread
 * because the suggestion is generated client-side and isn't persisted.
 */
export interface SuggestedTaskPreviewState {
  suggestion: Suggestion;
  dealId: string | null;
  dealName: string | null;
  threadId: string | null;
  /** Where to send the user back to (typically the deal email tab URL). */
  returnTo?: string;
}

function nextBusinessDayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function resolveDueDate(hint: string): string {
  if (!hint) return nextBusinessDayISO();
  if (/^\d{4}-\d{2}-\d{2}$/.test(hint)) return hint;
  return nextBusinessDayISO();
}

function formatDue(iso: string): string {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
      weekday: 'long', month: 'short', day: 'numeric',
    });
  } catch { return iso; }
}

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

/**
 * Read-only preview for an AI-suggested follow-up task. Reached from the
 * "Preview" link in the post-link confirmation panel. Renders all fields
 * the system would use, plus a single Create Task CTA that reuses the
 * exact same flow as `SuggestedTaskCards`.
 */
export default function SuggestedTaskPreview() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { company } = useCompany();
  const [defaultAsanaSync] = useUiPreference<boolean>('default_asana_sync', true);

  const state = (location.state || null) as SuggestedTaskPreviewState | null;
  const suggestion = state?.suggestion;
  const dealId = state?.dealId ?? null;
  const dealName = state?.dealName ?? null;
  const threadId = state?.threadId ?? null;
  const returnTo = state?.returnTo;

  const dueDate = useMemo(
    () => (suggestion ? resolveDueDate(suggestion.due_date_hint) : ''),
    [suggestion],
  );

  const [syncToAsana, setSyncToAsana] = useState<boolean>(defaultAsanaSync);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ id: string } | null>(null);

  if (!suggestion) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="rounded-lg border border-border bg-card/40 p-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            No task suggestion available to preview. Open a thread and link a deal to see suggested follow-ups.
          </p>
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back
          </Button>
        </div>
      </div>
    );
  }

  const handleCreate = async () => {
    if (!user?.id) {
      toast.error('Sign in required to create tasks');
      return;
    }
    setBusy(true);
    try {
      let ownerId: string | null = user.id;
      let ownerLabel: string | null = 'You';
      if (dealId && (!suggestion.assignee_hint || suggestion.assignee_hint === 'deal_manager')) {
        const resolved = await resolveManagerUserId(dealId);
        if (resolved.userId) {
          ownerId = resolved.userId;
          ownerLabel = resolved.label;
        } else if (resolved.label) {
          ownerLabel = `${resolved.label} (unresolved — assigned to you)`;
        }
      }

      const draft: TaskDraft = {
        title: suggestion.title,
        description: suggestion.why || null,
        due_date: dueDate,
        due_time: null,
        priority: suggestion.priority || 'normal',
        type: suggestion.task_type || 'follow_up',
        is_recurring: false,
        recurrence_rule: null,
        confidence: 1,
        owner_id: ownerId,
        owner_label: ownerLabel,
        owner_ambiguous: null,
        deal_id: dealId,
        deal_label: dealName,
        lender_id: null,
        lender_label: null,
        contact_id: null,
        contact_label: null,
        source_thread_id: threadId,
        hints: { owner: null, deal: null, lender: null, contact: null },
      };

      const result = await createTaskFromDraft(draft, user.id, company?.id || null, {
        syncSource: 'naitive_email_assist_workflow_preview',
        sourceThreadId: threadId,
      });

      if (result?.id) {
        if (syncToAsana) {
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
            console.warn('[SuggestedTaskPreview] Asana sync failed:', e);
          }
        }
        setCreated({ id: result.id });
        toast.success('Task created', { description: `${draft.title} • due ${formatDue(dueDate)}` });
      }
    } catch (e: any) {
      console.error('[SuggestedTaskPreview] create failed', e);
      toast.error(e?.message || 'Failed to create task');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => (returnTo ? navigate(returnTo) : navigate(-1))}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back
        </Button>
        <div className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Sparkles className="h-3 w-3 text-primary" />
          AI-suggested follow-up
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Task</p>
          <h1 className="text-lg font-semibold text-foreground mt-1 leading-snug break-words">
            {suggestion.title}
          </h1>
        </div>

        {suggestion.why && (
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Why</p>
            <p className="text-sm text-foreground/90 mt-1 leading-relaxed break-words">{suggestion.why}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-start gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Due</p>
              <p className="text-sm text-foreground">{formatDue(dueDate)}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <UserIcon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Assignee</p>
              <p className="text-sm text-foreground capitalize">
                {suggestion.assignee_hint === 'deal_manager' ? 'Deal manager' : (suggestion.assignee_hint || 'You')}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <ListTodo className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Type</p>
              <p className="text-sm text-foreground capitalize">{(suggestion.task_type || 'follow up').replace(/_/g, ' ')}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Badge variant="outline" className="capitalize">{suggestion.priority || 'normal'}</Badge>
            <Badge variant="outline" className="capitalize">{suggestion.confidence || 'medium'} confidence</Badge>
          </div>
        </div>

        {dealName && (
          <div className="rounded border border-border bg-background/40 p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Deal</p>
            {dealId ? (
              <Link to={`/deals/${dealId}`} className="text-sm font-medium text-foreground hover:text-primary">
                {dealName}
              </Link>
            ) : (
              <p className="text-sm text-foreground">{dealName}</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            <Switch id="preview-asana-sync" checked={syncToAsana} onCheckedChange={setSyncToAsana} disabled={busy || !!created} />
            <Label htmlFor="preview-asana-sync" className="text-[12px] text-muted-foreground cursor-pointer">
              Sync to Asana
            </Label>
          </div>
          {created ? (
            <Button size="sm" variant="outline" onClick={() => navigate(`/tasks/${created.id}`)}>
              View task
            </Button>
          ) : (
            <Button size="sm" onClick={handleCreate} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ListTodo className="h-3.5 w-3.5 mr-1.5" />}
              Create task
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}