// One self-contained card rendering the lifecycle of a single chained
// AI agent run inside the AICopilotPanel message list.
//
// States:
//   - planning              → spinner ("Planning steps…")
//   - awaiting_plan_approval→ ordered step list with "Approve & run" / "Cancel"
//   - running               → step list with per-step status badges
//   - awaiting_write_approval → inline Approve/Reject card on the gating step
//   - completed             → final summary (markdown)
//   - failed / cancelled    → error state

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles, Mail, Search, FolderOpen, FileText, ListChecks, MessageSquarePlus,
  CheckCircle2, XCircle, Loader2, AlertTriangle, Lock, ChevronDown, ChevronRight,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useAgentRun, AgentTool, AgentStep } from '@/hooks/useAgentRun';

interface Props {
  initialPrompt?: string;
  initialContext?: Record<string, any>;
  // If provided, hydrate an existing run (e.g. from chat history).
  runId?: string;
  // Called when run reaches a terminal state. Used by the panel to refresh
  // related queries (tasks, activity logs, etc).
  onTerminal?: (final_summary: string | null) => void;
}

const TOOL_ICONS: Record<AgentTool, React.ComponentType<{ size?: number }>> = {
  gmail_search: Mail,
  deal_lookup: Search,
  data_room_search: FolderOpen,
  gmail_draft_reply: MessageSquarePlus,
  task_create: ListChecks,
  activity_post: FileText,
};

const TOOL_LABEL: Record<AgentTool, string> = {
  gmail_search: 'Search Gmail',
  deal_lookup: 'Look up deals',
  data_room_search: 'Search Data Room',
  gmail_draft_reply: 'Draft email reply',
  task_create: 'Create naitive task',
  activity_post: 'Post note to deal Activity',
};

function StepStatusBadge({ status }: { status: AgentStep['status'] }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:  { label: 'Pending',  cls: 'bg-muted/40 text-muted-foreground' },
    approved: { label: 'Approved', cls: 'bg-primary/15 text-primary' },
    rejected: { label: 'Rejected', cls: 'bg-muted/40 text-muted-foreground' },
    running:  { label: 'Running',  cls: 'bg-amber-500/15 text-amber-500' },
    done:     { label: 'Done',     cls: 'bg-emerald-500/15 text-emerald-500' },
    failed:   { label: 'Failed',   cls: 'bg-destructive/15 text-destructive' },
    skipped:  { label: 'Skipped',  cls: 'bg-muted/40 text-muted-foreground' },
  };
  const v = map[status] || map.pending;
  return <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded ${v.cls}`}>{v.label}</span>;
}

function WriteApprovalCard({
  step, onApprove, onReject, busy,
}: {
  step: AgentStep;
  onApprove: (override?: Record<string, any>) => Promise<void>;
  onReject: () => Promise<void>;
  busy: boolean;
}) {
  // Editable surfaces: title and a free-form body/description for write tools
  // so the user can polish before approving.
  const initial = useMemo(() => {
    if (step.tool === 'gmail_draft_reply') {
      return {
        subject: String(step.args?.subject || ''),
        body: String(step.args?.body || ''),
        to: String(step.args?.to || ''),
      };
    }
    if (step.tool === 'task_create') {
      return {
        title: String(step.args?.title || ''),
        description: String(step.args?.description || ''),
        due_date: String(step.args?.due_date || ''),
      };
    }
    if (step.tool === 'activity_post') {
      return {
        title: String(step.args?.title || ''),
        body: String(step.args?.body || ''),
      };
    }
    return {};
  }, [step]);

  const [draft, setDraft] = useState<Record<string, string>>(initial as any);
  useEffect(() => { setDraft(initial as any); }, [initial]);

  return (
    <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-amber-500">
        <Lock size={12} /> Approval needed before this write
      </div>

      {step.tool === 'gmail_draft_reply' && (
        <div className="space-y-2">
          <Input value={draft.to || ''} onChange={(e) => setDraft(d => ({ ...d, to: e.target.value }))} placeholder="To" className="h-8 text-xs" />
          <Input value={draft.subject || ''} onChange={(e) => setDraft(d => ({ ...d, subject: e.target.value }))} placeholder="Subject" className="h-8 text-xs" />
          <Textarea value={draft.body || ''} onChange={(e) => setDraft(d => ({ ...d, body: e.target.value }))} rows={6} className="text-xs" />
          <p className="text-[10px] text-muted-foreground">
            This draft will appear in your inbox AI Drafts area — it will NOT auto-send.
          </p>
        </div>
      )}

      {step.tool === 'task_create' && (
        <div className="space-y-2">
          <Input value={draft.title || ''} onChange={(e) => setDraft(d => ({ ...d, title: e.target.value }))} placeholder="Task title" className="h-8 text-xs" />
          <Textarea value={draft.description || ''} onChange={(e) => setDraft(d => ({ ...d, description: e.target.value }))} rows={2} className="text-xs" />
          <Input value={draft.due_date || ''} onChange={(e) => setDraft(d => ({ ...d, due_date: e.target.value }))} placeholder="Due (YYYY-MM-DD or 'tomorrow')" className="h-8 text-xs" />
        </div>
      )}

      {step.tool === 'activity_post' && (
        <div className="space-y-2">
          <Input value={draft.title || ''} onChange={(e) => setDraft(d => ({ ...d, title: e.target.value }))} placeholder="Note title" className="h-8 text-xs" />
          <Textarea value={draft.body || ''} onChange={(e) => setDraft(d => ({ ...d, body: e.target.value }))} rows={4} className="text-xs" />
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="ghost" onClick={() => onReject()} disabled={busy}>
          <XCircle className="h-3.5 w-3.5 mr-1" /> Skip
        </Button>
        <Button size="sm" onClick={() => onApprove(draft)} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
          Approve & run
        </Button>
      </div>
    </div>
  );
}

function StepRow({
  step, onApprove, onReject, busy, expanded, onToggle,
}: {
  step: AgentStep;
  onApprove: (override?: Record<string, any>) => Promise<void>;
  onReject: () => Promise<void>;
  busy: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Icon = TOOL_ICONS[step.tool] || Sparkles;
  const needsApprovalNow = step.requires_approval && step.status === 'pending';

  return (
    <div className="rounded-md border border-border bg-card/40 p-2">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start gap-2 text-left"
      >
        <div className="mt-0.5 text-muted-foreground">
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </div>
        <div className="mt-0.5 text-primary"><Icon size={14} /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-foreground">{step.title}</span>
            <StepStatusBadge status={step.status} />
            <span className="text-[10px] text-muted-foreground">{TOOL_LABEL[step.tool]}</span>
          </div>
          {step.output_summary && (
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">→ {step.output_summary}</p>
          )}
          {step.error && (
            <p className="text-[11px] text-destructive mt-1 leading-snug">{step.error}</p>
          )}
        </div>
      </button>

      {expanded && (
        <div className="mt-2 pl-6 text-[11px] text-muted-foreground">
          <pre className="bg-muted/30 rounded p-2 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(step.args, null, 2)}
          </pre>
        </div>
      )}

      {needsApprovalNow && (
        <WriteApprovalCard step={step} onApprove={onApprove} onReject={onReject} busy={busy} />
      )}
    </div>
  );
}

export function AgentRunCard({ initialPrompt, initialContext, runId, onTerminal }: Props) {
  const agent = useAgentRun(runId);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const startedRef = useRef(false);

  // Auto-start if a prompt was given and no run yet exists.
  useEffect(() => {
    if (runId) return;
    if (startedRef.current) return;
    if (!initialPrompt) return;
    startedRef.current = true;
    agent.start(initialPrompt, initialContext || {}).catch(() => {/* surfaced via state.error */});
  }, [runId, initialPrompt, initialContext, agent]);

  // Notify parent when terminal.
  useEffect(() => {
    const status = agent.run?.status;
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      onTerminal?.(agent.run?.final_summary || null);
    }
  }, [agent.run?.status, agent.run?.final_summary, onTerminal]);

  const toggleExpanded = (id: string) =>
    setExpandedSteps(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const status = agent.run?.status;
  const gatingStep = agent.steps.find(s => s.requires_approval && s.status === 'pending');

  return (
    <div
      className="rounded-xl border border-primary/30 bg-card/60 p-3 space-y-3"
      style={{ background: 'var(--glass-surface)' }}
    >
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-primary" />
        <span className="text-xs font-semibold">Agent run</span>
        {status && (
          <Badge variant="outline" className="text-[10px] capitalize">
            {status.replaceAll('_', ' ')}
          </Badge>
        )}
      </div>

      {agent.run?.prompt && (
        <p className="text-[11px] text-muted-foreground italic line-clamp-2">"{agent.run.prompt}"</p>
      )}

      {/* PLAN SUMMARY */}
      {agent.run?.plan_summary && (
        <p className="text-xs text-foreground">{agent.run.plan_summary}</p>
      )}

      {/* PLANNING SPINNER */}
      {(!agent.run || status === 'planning') && agent.loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Planning steps…
        </div>
      )}

      {/* GLOBAL ERROR */}
      {agent.error && (
        <div className="flex items-start gap-2 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5" />
          <span>{agent.error}</span>
        </div>
      )}

      {/* STEP LIST */}
      {agent.steps.length > 0 && (
        <div className="space-y-1.5">
          {agent.steps.map((s) => (
            <StepRow
              key={s.id}
              step={s}
              expanded={expandedSteps.has(s.id)}
              onToggle={() => toggleExpanded(s.id)}
              busy={agent.loading}
              onApprove={(override) => agent.approveStep(s.id, override)}
              onReject={() => agent.rejectStep(s.id)}
            />
          ))}
        </div>
      )}

      {/* PLAN-LEVEL APPROVAL */}
      {status === 'awaiting_plan_approval' && (
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border">
          <p className="text-[11px] text-muted-foreground">
            Reads will run automatically. Each write will pause for individual approval.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => agent.cancel()} disabled={agent.loading}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => agent.approvePlan()} disabled={agent.loading}>
              {agent.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
              Approve & run
            </Button>
          </div>
        </div>
      )}

      {/* RUNNING (waiting on backend) */}
      {(status === 'running') && agent.loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Executing…
        </div>
      )}

      {/* AWAITING WRITE APPROVAL — surfaced inline on the step row above,
          here we just confirm the run is paused. */}
      {status === 'awaiting_write_approval' && gatingStep && (
        <p className="text-[11px] text-amber-500">
          Paused on step {gatingStep.step_index + 1}. Approve or skip the highlighted step above to continue.
        </p>
      )}

      {/* FINAL SUMMARY */}
      {status === 'completed' && agent.run?.final_summary && (
        <div className="rounded-md border border-emerald-500/25 bg-emerald-500/5 p-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-500 mb-1">
            <CheckCircle2 size={12} /> Run complete
          </div>
          <div className="prose prose-sm max-w-none text-foreground text-xs [&_p]:my-1 [&_ul]:my-1 [&_h3]:text-xs [&_h3]:font-semibold">
            <ReactMarkdown>{agent.run.final_summary}</ReactMarkdown>
          </div>
        </div>
      )}

      {status === 'cancelled' && (
        <p className="text-[11px] text-muted-foreground">Run cancelled.</p>
      )}
    </div>
  );
}
