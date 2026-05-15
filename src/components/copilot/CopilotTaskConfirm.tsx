import { useState } from 'react';
import { Plus, Check, Loader2, Pencil, X, Sparkles, Building2, User as UserIcon, Calendar as CalendarIcon, AlignLeft, Tag, Flag } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useCopilotStore } from '@/stores/copilotStore';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ConfirmAction {
  action: 'confirm';
  action_type: 'create_task';
  description: string;
  params: {
    title?: string;
    description?: string | null;
    deal_id?: string | null;
    deal_name?: string | null;
    contact_id?: string | null;
    assignee_user_id?: string | null;
    assignee_name?: string | null;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    due_date?: string | null;
    task_type?: 'task' | 'follow_up' | 'call' | 'email' | 'meeting';
    inferred?: string[];
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

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export function CopilotTaskConfirm({ action }: Props) {
  const queryClient = useQueryClient();
  const addMutation = useCopilotStore(s => s.addMutation);
  const initial = action.params || {};

  const [title, setTitle] = useState<string>(initial.title || '');
  const [description, setDescription] = useState<string>(initial.description || '');
  const [dueDate, setDueDate] = useState<string>(initial.due_date || '');
  const [priority, setPriority] = useState<string>(initial.priority || 'medium');
  const [taskType, setTaskType] = useState<string>(initial.task_type || 'task');
  const [dealLinked, setDealLinked] = useState<boolean>(!!initial.deal_id);
  const [assigneeMe, setAssigneeMe] = useState<boolean>(!initial.assignee_user_id);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<'pending' | 'loading' | 'done' | 'cancelled'>('pending');

  const inferredSet = new Set(initial.inferred || []);
  const isInferred = (k: string) => inferredSet.has(k);
  const ambiguous = !title.trim();

  async function handleConfirm() {
    if (ambiguous) {
      toast.error('Title is required before creating the task');
      return;
    }
    setStatus('loading');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const params: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || null,
        deal_id: dealLinked ? initial.deal_id || null : null,
        contact_id: initial.contact_id || null,
        assignee_user_id: assigneeMe ? null : initial.assignee_user_id || null,
        assignee_name: assigneeMe ? null : initial.assignee_name || null,
        priority,
        due_date: dueDate || null,
        task_type: taskType,
      };

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/copilot-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirmAction: { ...action, params } }),
      });
      const result = await resp.json();
      if (!result.success) throw new Error(result.error || 'Failed to create task');

      setStatus('done');
      toast.success(result.message || 'Task created');
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
      toast.error(err.message || 'Failed to create task');
    }
  }

  if (status === 'done') {
    return (
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
          borderRadius: 8, background: 'rgba(34, 197, 94, 0.08)',
          border: '1px solid rgba(34, 197, 94, 0.25)', marginTop: 8,
        }}
      >
        <Check size={16} style={{ color: 'rgb(34, 197, 94)' }} />
        <span style={{ fontSize: 13, color: 'rgb(34, 197, 94)' }}>
          Task created — "{title}"{!assigneeMe && initial.assignee_name ? ` for ${initial.assignee_name}` : ''}
        </span>
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
            Proposed task — not yet created
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

      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <label style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>Title{isInferred('title') && ' '} {isInferred('title') && <InferredTag />}</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title" style={{ marginTop: 4, height: 32, fontSize: 13 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>Due {isInferred('due_date') && <InferredTag />}</label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ marginTop: 4, height: 32, fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>Priority {isInferred('priority') && <InferredTag />}</label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger style={{ marginTop: 4, height: 32, fontSize: 13 }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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
          <Row icon={CalendarIcon} label="Due" value={dueDate ? new Date(dueDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'No due date'} inferred={isInferred('due_date')} />
          {initial.deal_id && dealLinked && (
            <Row icon={Building2} label="Deal" value={initial.deal_name || 'Linked deal'} inferred={isInferred('deal_id')} />
          )}
          <Row icon={Tag} label="Type" value={TYPE_LABELS[taskType] || taskType} inferred={isInferred('task_type')} />
          <Row icon={Flag} label="Priority" value={PRIORITY_LABELS[priority] || priority} inferred={isInferred('priority')} />
          {description && <Row icon={AlignLeft} label="Notes" value={description} inferred={isInferred('description')} />}
        </div>
      )}

      {ambiguous && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'hsl(var(--destructive))' }}>
          A title is required before this task can be created. Click Edit to add one.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          onClick={handleConfirm}
          disabled={status === 'loading' || ambiguous}
          style={{
            height: 32, padding: '0 14px', borderRadius: 8,
            background: ambiguous ? 'hsl(var(--muted))' : 'hsl(var(--primary))',
            color: ambiguous ? 'hsl(var(--muted-foreground))' : 'white',
            border: 'none', fontSize: 13, fontWeight: 500,
            cursor: status === 'loading' || ambiguous ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          {status === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Confirm & create
        </button>
        <button
          onClick={() => setStatus('cancelled')}
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