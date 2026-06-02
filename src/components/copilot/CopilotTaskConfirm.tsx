import { useEffect, useState } from 'react';
import { Plus, Check, Loader2, Pencil, X, Sparkles, Building2, User as UserIcon, Calendar as CalendarIcon, AlignLeft, Tag, AlertTriangle, ExternalLink, Mail, FileText, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useCopilotStore } from '@/stores/copilotStore';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { syncTaskAfterCreate, retryAsanaSyncForTask } from '@/lib/asana/syncTaskAfterCreate';

// Module-level flag: run the orphan-copilot-task backfill once per browser
// session, the first time a CopilotTaskConfirm card is mounted.
let __copilotAsanaBackfillRan = false;
async function backfillOrphanCopilotTasks() {
  if (__copilotAsanaBackfillRan) return;
  __copilotAsanaBackfillRan = true;
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('tasks')
      .select('id')
      .eq('sync_source', 'copilot')
      .is('asana_task_gid', null)
      .gte('created_at', since)
      .limit(50);
    if (!data?.length) return;
    // eslint-disable-next-line no-console
    console.info(`[CopilotAsanaBackfill] retrying ${data.length} orphan copilot tasks`);
    for (const row of data) {
      try { await retryAsanaSyncForTask((row as any).id); } catch { /* logged inside */ }
    }
  } catch (e) {
    console.warn('[CopilotAsanaBackfill] failed:', e);
  }
}

interface DuplicateMatch {
  task_id?: string;
  title?: string;
  status?: string;
  priority?: string;
  due_date?: string | null;
  assignee_name?: string;
  deal_name?: string;
  completed_at?: string;
  why?: string;
  differences?: string;
}

interface DealCandidate {
  deal_id: string;
  name: string;
  stage?: string | null;
  last_activity?: string | null;
}

interface ConfirmAction {
  action: 'confirm';
  action_type: 'create_task';
  description: string;
  params: {
    title?: string;
    description?: string | null;
    deal_id?: string | null;
    deal_name?: string | null;
    assignee_user_id?: string | null;
    assignee_name?: string | null;
    due_date?: string | null;
    task_type?: 'task' | 'follow_up' | 'call' | 'email' | 'meeting';
    inferred?: string[];
    rationale?: string | null;
    duplicate_status?: 'none' | 'low' | 'possible' | 'high';
    duplicate_match?: DuplicateMatch | null;
    deal_candidates?: DealCandidate[] | null;
    confidences?: { deal?: number; assignee?: number; due_date?: number } | null;
  };
}

interface Props { action: ConfirmAction }

const TYPE_LABELS: Record<string, string> = {
  task: 'Task',
  follow_up: 'Follow-up',
  call: 'Call',
  email: 'Email',
  meeting: 'Meeting',
};

const quickActionStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  height: 26, padding: '0 9px', borderRadius: 6,
  background: 'var(--glass-surface)', color: 'hsl(var(--foreground))',
  border: '1px solid var(--glass-border)', fontSize: 11, cursor: 'pointer',
};
const primaryActionStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  height: 28, padding: '0 10px', borderRadius: 6,
  background: 'hsl(var(--primary))', color: 'white',
  border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer',
};
const secondaryActionStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  height: 28, padding: '0 10px', borderRadius: 6,
  background: 'transparent', color: 'hsl(var(--foreground))',
  border: '1px solid var(--glass-border)', fontSize: 12, cursor: 'pointer',
};

export function CopilotTaskConfirm({ action }: Props) {
  const queryClient = useQueryClient();
  const addMutation = useCopilotStore(s => s.addMutation);
  const initial = action.params || {};
  const auditId: string | null = (initial as any).audit_id || null;

  // Kick off the one-time backfill for orphan copilot-created tasks that
  // were inserted before the Asana fan-out was wired (bug #1215344941044849).
  useEffect(() => { void backfillOrphanCopilotTasks(); }, []);

  const [title, setTitle] = useState<string>(initial.title || '');
  const [description, setDescription] = useState<string>(initial.description || '');
  const [dueDate, setDueDate] = useState<string>(initial.due_date || '');
  const [taskType, setTaskType] = useState<string>(initial.task_type || 'task');
  const [dealLinked, setDealLinked] = useState<boolean>(!!initial.deal_id);
  const [assigneeMe, setAssigneeMe] = useState<boolean>(!initial.assignee_user_id);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<'pending' | 'loading' | 'done' | 'cancelled' | 'used_existing'>('pending');
  const [createdTaskId, setCreatedTaskId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const candidates: DealCandidate[] = Array.isArray(initial.deal_candidates) ? initial.deal_candidates! : [];
  const [candidatesDismissed, setCandidatesDismissed] = useState(false);
  const hasMultipleCandidates = candidates.length > 1 && !candidatesDismissed;
  const lowDealConfidence = typeof initial.confidences?.deal === 'number' && (initial.confidences!.deal as number) < 0.7;
  const [resolvedDealId, setResolvedDealId] = useState<string | null>(initial.deal_id || null);
  const [resolvedDealName, setResolvedDealName] = useState<string | null>(initial.deal_name || null);
  // Unresolved entity reference: AI returned multiple candidates and user hasn't picked,
  // OR confidence is low and candidates exist to choose from.
  const needsDisambiguation =
    (hasMultipleCandidates && !resolvedDealId) ||
    (lowDealConfidence && candidates.length > 0 && !resolvedDealId);

  const inferredSet = new Set(initial.inferred || []);
  const isInferred = (k: string) => inferredSet.has(k);
  const ambiguous = !title.trim();
  const blockConfirm = ambiguous || needsDisambiguation;
  const rationale = (initial.rationale || '').trim();
  const dupStatus = initial.duplicate_status || 'none';
  const dup = initial.duplicate_match || null;
  const showDupCompare = (dupStatus === 'high' || dupStatus === 'possible') && !!dup;
  const showDupLowHint = dupStatus === 'low' && !!dup;
  const dueIsInferredToday = isInferred('due_date') && !!dueDate && dueDate === new Date().toISOString().slice(0, 10);
  const entityInferred = isInferred('deal_id') && !!resolvedDealId;
  const entityLabel = resolvedDealName || '';

  const userTz = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'America/New_York'; }
  })();
  const formatDueLabel = () => {
    if (!dueDate) return 'No due date';
    try {
      // Render date-only — never a time-of-day (tasks.due_date is date-only).
      const [y, m, d] = dueDate.split('-').map(Number);
      const dt = new Date(y, (m || 1) - 1, d || 1);
      return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    } catch {
      return dueDate;
    }
  };

  async function handleConfirm() {
    if (ambiguous) {
      toast.error('Title is required before creating the task');
      return;
    }
    setStatus('loading');
    setSubmitError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const params: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || null,
        deal_id: dealLinked ? (resolvedDealId || null) : null,
        deal_name: dealLinked ? (resolvedDealName || null) : null,
        assignee_user_id: assigneeMe ? null : initial.assignee_user_id || null,
        assignee_name: assigneeMe ? null : initial.assignee_name || null,
        // due_date is DATE ONLY — strip any 'T...' that slipped through.
        due_date: dueDate ? dueDate.split('T')[0] : null,
        task_type: taskType,
        tz: userTz,
      };

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/copilot-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirmAction: { ...action, params } }),
      });
      const result = await resp.json().catch(() => ({}));
      if (!resp.ok || !result?.success) {
        const reason = result?.error || `HTTP ${resp.status}`;
        console.error('[CopilotTaskConfirm] create_task failed', { status: resp.status, result });
        throw new Error(reason);
      }

      setStatus('done');
      setCreatedTaskId(result?.params?.task_id || null);
      toast.success(result.message || 'Task created');
      // ─── Asana fan-out (fire-and-forget, soft-success) ───
      // The copilot-chat edge function only writes the local `tasks` row.
      // Mirror the same task to Asana from the client so we reuse the user
      // session, the existing asana-proxy integration lookup, retry logic,
      // and the asana_sync_log surfaced in the dev sync panel.
      const createdId: string | null = result?.params?.task_id || null;
      if (createdId) {
        const assignedTo = (result?.params?.assigned_to as string) || null;
        const dealId = (params.deal_id as string) || null;
        void (async () => {
          try {
            const t0 = performance.now();
            const out = await syncTaskAfterCreate({
              taskId: createdId,
              title: title.trim(),
              description: description.trim() || null,
              dueDate: (params.due_date as string) || null,
              assignedTo,
            });
            const latency = Math.round(performance.now() - t0);
            // eslint-disable-next-line no-console
            console.info('[CopilotTaskAsana]', {
              task_id: createdId,
              deal_id: dealId,
              ok: out.ok,
              gid: out.gid,
              skipped: out.skipped || false,
              reason: out.reason || null,
              error: out.error || null,
              latency_ms: latency,
            });
            if (!out.ok && !out.skipped) {
              toast.message('Created locally. Asana sync retried in background.');
            }
          } catch (e) {
            console.warn('[CopilotTaskAsana] unexpected sync error:', e);
          }
        })();
      }
      addMutation({
        type: 'create_task',
        deal: (params.deal_id as string) || undefined,
        dealId: (params.deal_id as string) || undefined,
        detail: result.message || `Created task "${title}"`,
        timestamp: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      if (params.deal_id) queryClient.invalidateQueries({ queryKey: ['deal', params.deal_id] });
      window.dispatchEvent(new CustomEvent('copilot-action-completed', { detail: { actionType: 'create_task', params } }));
    } catch (err: any) {
      setStatus('pending');
      const msg = err?.message || 'Failed to create task';
      setSubmitError(msg);
      toast.error(`Couldn't create task: ${msg}`);
    }
  }

  function goto(path: string) {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  function handleUseExisting() {
    setStatus('used_existing');
    toast.success('Using the existing task — nothing new was created.');
  }

  if (status === 'done') {
    const linkedSummary: string[] = [];
    if (resolvedDealName && dealLinked) linkedSummary.push(resolvedDealName);
    if (!assigneeMe && initial.assignee_name) linkedSummary.push(`assigned to ${initial.assignee_name}`);
    else linkedSummary.push('assigned to you');
    if (dueDate) linkedSummary.push(`due ${formatDueLabel()}`);
    // (calendar add removed — not a task field)
    return (
      <div
        style={{
          display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px',
          borderRadius: 8, background: 'rgba(34, 197, 94, 0.08)',
          border: '1px solid rgba(34, 197, 94, 0.25)', marginTop: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Check size={16} style={{ color: 'rgb(34, 197, 94)' }} />
          <span style={{ fontSize: 13, color: 'rgb(34, 197, 94)', fontWeight: 600 }}>
            Task created — "{title}"
          </span>
        </div>
        {linkedSummary.length > 0 && (
          <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
            {linkedSummary.join(' · ')}
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
          {createdTaskId && (
            <button onClick={() => goto(`/tasks?task=${createdTaskId}`)} style={quickActionStyle}>
              <ExternalLink size={11} /> Open task
            </button>
          )}
          {resolvedDealId && dealLinked && (
            <button onClick={() => goto(`/deals?deal=${resolvedDealId}`)} style={quickActionStyle}>
              <Building2 size={11} /> Open linked deal
            </button>
          )}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('copilot-send-message', { detail: { text: `Draft an email related to "${title}"${resolvedDealName ? ` on ${resolvedDealName}` : ''}.` } }))}
            style={quickActionStyle}
          >
            <Mail size={11} /> Draft email
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('copilot-send-message', { detail: { text: `Add a note related to "${title}"${resolvedDealName ? ` on ${resolvedDealName}` : ''}.` } }))}
            style={quickActionStyle}
          >
            <FileText size={11} /> Add note
          </button>
        </div>
      </div>
    );
  }
  if (status === 'used_existing') {
    return (
      <div style={{ marginTop: 8, padding: '10px 14px', borderRadius: 8, background: 'var(--glass-surface)', border: '1px solid var(--glass-border)', fontSize: 13, color: 'hsl(var(--foreground))', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Check size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
        Using existing task — "{dup?.title}". No new task was created.
        {dup?.task_id && (
          <button onClick={() => goto(`/tasks?task=${dup.task_id}`)} style={{ ...quickActionStyle, marginLeft: 'auto' }}>
            <ExternalLink size={11} /> Open existing
          </button>
        )}
      </div>
    );
  }
  if (status === 'cancelled') {
    return (
      <div style={{ marginTop: 8, fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
        Cancelled — no task was created.
      </div>
    );
  }

  // Disambiguation-first: AI returned multiple candidate deals. Hide the
  // approval card entirely until the user picks one so they can't Confirm a
  // card with an unresolved entity reference.
  if (needsDisambiguation) {
    const headline = initial.deal_name
      ? `Multiple deals match "${initial.deal_name}" — which one did you mean?`
      : 'Multiple matching deals — pick one to continue';
    return (
      <div
        style={{
          background: 'rgba(245,158,11,0.06)',
          border: '1px solid rgba(245,158,11,0.30)',
          borderRadius: 10,
          padding: '12px 14px',
          marginTop: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <AlertTriangle size={14} style={{ color: 'rgb(217, 119, 6)' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'hsl(var(--foreground))', letterSpacing: 0.3 }}>
            {headline}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginBottom: 10 }}>
          I won't create the task until you select the right deal.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {candidates.map(c => (
            <button
              key={c.deal_id}
              onClick={() => {
                setResolvedDealId(c.deal_id);
                setResolvedDealName(c.name);
                setDealLinked(true);
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 8,
                background: 'var(--glass-surface)',
                border: '1px solid var(--glass-border)',
                color: 'hsl(var(--foreground))',
                fontSize: 12, textAlign: 'left', cursor: 'pointer',
              }}
            >
              <Building2 size={13} style={{ color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
              <span style={{ fontWeight: 600 }}>{c.name}</span>
              {c.stage && (
                <span style={{ color: 'hsl(var(--muted-foreground))' }}>· {c.stage}</span>
              )}
              {c.last_activity && (
                <span style={{ color: 'hsl(var(--muted-foreground))', marginLeft: 'auto', fontSize: 11 }}>
                  Last activity {c.last_activity}
                </span>
              )}
            </button>
          ))}
          <button
            onClick={() => {
              setResolvedDealId(null);
              setResolvedDealName(null);
              setDealLinked(false);
              setCandidatesDismissed(true);
            }}
            style={{
              ...secondaryActionStyle,
              marginTop: 4, alignSelf: 'flex-start',
            }}
          >
            None of these — create without a deal
          </button>
        </div>
      </div>
    );
  }

  const InferredTag = () => (
    <span
      title="Inferred by AI — review before confirming"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        fontSize: 9, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase',
        padding: '1px 5px', borderRadius: 4,
        background: 'rgba(126,184,247,0.14)', color: 'hsl(var(--primary))',
        border: '1px solid rgba(126,184,247,0.30)',
      }}
    >
      <Sparkles size={8} /> AI
    </span>
  );

  const Row = ({ icon: Icon, label, value, inferred, children }: any) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 0' }}>
      <Icon size={13} style={{ color: 'hsl(var(--muted-foreground))', marginTop: 2, flexShrink: 0 }} />
      <div style={{ minWidth: 78, fontSize: 11, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600, marginTop: 2 }}>
        {label}
      </div>
      <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {children ?? <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{value || <em style={{ color: 'hsl(var(--muted-foreground))' }}>—</em>}</span>}
        {inferred && <InferredTag />}
      </div>
    </div>
  );

  return (
    <div
      style={{
        background: 'rgba(126,184,247,0.06)',
        border: '1px solid rgba(126,184,247,0.22)',
        borderRadius: 10,
        padding: '12px 14px',
        marginTop: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={14} style={{ color: 'hsl(var(--primary))' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'hsl(var(--foreground))', letterSpacing: 0.3 }}>
            {showDupCompare ? 'I found a possible duplicate' : "I've prepared a task — not yet created"}
          </span>
        </div>
        <button
          onClick={() => setEditing(e => !e)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'transparent', border: '1px solid var(--glass-border)',
            color: 'hsl(var(--muted-foreground))', borderRadius: 6,
            padding: '3px 8px', fontSize: 11, cursor: 'pointer',
          }}
        >
          <Pencil size={11} />
          {editing ? 'Done editing' : 'Edit'}
        </button>
      </div>

      {(dueIsInferredToday || entityInferred || rationale || showDupLowHint) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10, padding: '8px 10px', borderRadius: 6, background: 'rgba(126,184,247,0.07)', border: '1px solid rgba(126,184,247,0.18)' }}>
          {dueIsInferredToday && (
            <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', display: 'flex', alignItems: 'center', gap: 6 }}>
              <CalendarIcon size={10} /> No due date was specified, so I set this for today.
            </div>
          )}
          {entityInferred && entityLabel && (
            <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={10} /> I linked this to <strong style={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}>{entityLabel}</strong> based on the current conversation/context.
            </div>
          )}
          {rationale && !entityInferred && (
            <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <Sparkles size={10} style={{ marginTop: 2 }} /> {rationale}
            </div>
          )}
          {showDupLowHint && dup && (
            <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={10} /> Heads up — this looks similar to "{dup.title}"{dup.due_date ? ` (due ${dup.due_date})` : ''}.
            </div>
          )}
        </div>
      )}

      {showDupCompare && dup && (
        <div style={{ marginBottom: 10, padding: 10, borderRadius: 8, background: dupStatus === 'high' ? 'rgba(245,158,11,0.08)' : 'rgba(126,184,247,0.07)', border: `1px solid ${dupStatus === 'high' ? 'rgba(245,158,11,0.30)' : 'rgba(126,184,247,0.25)'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, color: dupStatus === 'high' ? 'rgb(217, 119, 6)' : 'hsl(var(--primary))' }}>
            <AlertTriangle size={12} />
            {dupStatus === 'high' ? 'Likely duplicate — recommend reuse' : 'Possible duplicate — please review'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
            <div style={{ padding: 8, borderRadius: 6, background: 'var(--glass-surface)', border: '1px solid var(--glass-border)' }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}>Proposed (new)</div>
              <div style={{ fontWeight: 500, color: 'hsl(var(--foreground))' }}>{title || <em>Untitled</em>}</div>
              <div style={{ marginTop: 4, color: 'hsl(var(--muted-foreground))', fontSize: 11 }}>
                {dueDate ? `Due ${dueDate}` : 'No due date'}
              </div>
              <div style={{ color: 'hsl(var(--muted-foreground))', fontSize: 11 }}>
                {initial.deal_name ? `Deal: ${initial.deal_name}` : 'No deal'} · {assigneeMe || !initial.assignee_name ? 'You' : initial.assignee_name}
              </div>
            </div>
            <div style={{ padding: 8, borderRadius: 6, background: 'var(--glass-surface)', border: '1px solid var(--glass-border)' }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, color: 'hsl(var(--muted-foreground))', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                Existing
                {dup.task_id && (
                  <button onClick={() => goto(`/tasks?task=${dup.task_id}`)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'hsl(var(--primary))', fontSize: 10, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                    Open <ExternalLink size={9} />
                  </button>
                )}
              </div>
              <div style={{ fontWeight: 500, color: 'hsl(var(--foreground))' }}>{dup.title || <em>Untitled</em>}</div>
              <div style={{ marginTop: 4, color: 'hsl(var(--muted-foreground))', fontSize: 11 }}>
                {dup.due_date ? `Due ${dup.due_date}` : 'No due date'}{dup.status ? ` · ${dup.status}` : ''}{dup.priority ? ` · ${dup.priority}` : ''}
              </div>
              <div style={{ color: 'hsl(var(--muted-foreground))', fontSize: 11 }}>
                {dup.deal_name ? `Deal: ${dup.deal_name}` : 'No deal'}{dup.assignee_name ? ` · ${dup.assignee_name}` : ''}
              </div>
            </div>
          </div>
          {(dup.why || dup.differences) && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'hsl(var(--muted-foreground))', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {dup.why && <div><strong style={{ color: 'hsl(var(--foreground))' }}>Why:</strong> {dup.why}</div>}
              {dup.differences && <div><strong style={{ color: 'hsl(var(--foreground))' }}>Differences:</strong> {dup.differences}</div>}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            <button onClick={handleUseExisting} style={dupStatus === 'high' ? primaryActionStyle : secondaryActionStyle}>
              <ArrowRight size={12} /> Use existing task
            </button>
            <button onClick={handleConfirm} disabled={status === 'loading' || blockConfirm} style={dupStatus === 'high' ? secondaryActionStyle : primaryActionStyle}>
              <Plus size={12} /> Create new task anyway
            </button>
            <button onClick={() => setEditing(true)} style={secondaryActionStyle}>
              <Pencil size={12} /> Edit proposed
            </button>
          </div>
        </div>
      )}

      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <label style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>Title{isInferred('title') && ' '} {isInferred('title') && <InferredTag />}</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title" style={{ marginTop: 4, height: 32, fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>Due {isInferred('due_date') && <InferredTag />}</label>
            <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ marginTop: 4, height: 32, fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>Type {isInferred('task_type') && <InferredTag />}</label>
            <Select value={taskType} onValueChange={setTaskType}>
              <SelectTrigger style={{ marginTop: 4, height: 32, fontSize: 13 }}><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>Notes {isInferred('description') && <InferredTag />}</label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional context" rows={2} style={{ marginTop: 4, fontSize: 13 }} />
          </div>
          {initial.deal_id && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <Building2 size={12} style={{ color: 'hsl(var(--muted-foreground))' }} />
              <span style={{ color: 'var(--foreground)' }}>Linked to {initial.deal_name || 'deal'}</span>
              {isInferred('deal_id') && <InferredTag />}
              <button
                onClick={() => setDealLinked(d => !d)}
                style={{ marginLeft: 'auto', fontSize: 11, color: 'hsl(var(--primary))', background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                {dealLinked ? 'Unlink' : 'Re-link'}
              </button>
            </div>
          )}
          {initial.assignee_user_id && initial.assignee_name && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <UserIcon size={12} style={{ color: 'hsl(var(--muted-foreground))' }} />
              <span style={{ color: 'var(--foreground)' }}>{assigneeMe ? 'You' : initial.assignee_name}</span>
              {isInferred('assignee_user_id') && !assigneeMe && <InferredTag />}
              <button
                onClick={() => setAssigneeMe(m => !m)}
                style={{ marginLeft: 'auto', fontSize: 11, color: 'hsl(var(--primary))', background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                {assigneeMe ? `Assign to ${initial.assignee_name}` : 'Assign to me'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <Row icon={Plus} label="Title" value={title} inferred={isInferred('title')} />
          <Row icon={UserIcon} label="Owner" value={assigneeMe || !initial.assignee_name ? 'You' : initial.assignee_name} inferred={isInferred('assignee_user_id') && !assigneeMe} />
          <Row icon={CalendarIcon} label="Due" value={formatDueLabel()} inferred={isInferred('due_date')} />
          {resolvedDealId && dealLinked && (
            <Row icon={Building2} label="Deal" value={resolvedDealName || initial.deal_name || 'Linked deal'} inferred={isInferred('deal_id')} />
          )}
          <Row icon={Tag} label="Type" value={TYPE_LABELS[taskType] || taskType} inferred={isInferred('task_type')} />
          {description && <Row icon={AlignLeft} label="Notes" value={description} inferred={isInferred('description')} />}
        </div>
      )}

      {ambiguous && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'hsl(var(--destructive))' }}>
          A title is required before this task can be created. Click Edit to add one.
        </div>
      )}

      {submitError && (
        <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.30)', fontSize: 12, color: 'hsl(var(--destructive))', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <AlertTriangle size={12} style={{ marginTop: 2, flexShrink: 0 }} />
          <span><strong>Couldn't create task:</strong> {submitError}</span>
        </div>
      )}

      {needsDisambiguation && (
        <div
          style={{
            marginTop: 8, padding: '8px 10px', borderRadius: 6,
            background: 'rgba(245,158,11,0.10)',
            border: '1px solid rgba(245,158,11,0.35)',
            fontSize: 11, color: 'rgb(217, 119, 6)',
            display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600,
          }}
        >
          <AlertTriangle size={12} /> Select a deal below before confirming.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          onClick={handleConfirm}
          disabled={status === 'loading' || blockConfirm}
          style={{
            height: 32, padding: '0 14px', borderRadius: 8,
            background: blockConfirm ? 'hsl(var(--muted))' : 'hsl(var(--primary))',
            color: blockConfirm ? 'hsl(var(--muted-foreground))' : 'white',
            border: 'none', fontSize: 13, fontWeight: 500,
            cursor: status === 'loading' || blockConfirm ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          {status === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Confirm & create
        </button>
      <button
          onClick={async () => {
            setStatus('cancelled');
            if (auditId) {
              try {
                const { data: sessionData } = await supabase.auth.getSession();
                const token = sessionData?.session?.access_token;
                if (token) {
                  await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/copilot-chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ cancelAction: { audit_id: auditId, reason: 'user_cancelled' } }),
                  });
                }
              } catch { /* audit best-effort */ }
            }
          }}
          disabled={status === 'loading'}
          style={{
            height: 32, padding: '0 12px', borderRadius: 8,
            background: 'transparent', color: 'hsl(var(--muted-foreground))',
            border: '1px solid var(--glass-border)', fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <X size={13} /> Cancel
        </button>
      </div>
    </div>
  );
}