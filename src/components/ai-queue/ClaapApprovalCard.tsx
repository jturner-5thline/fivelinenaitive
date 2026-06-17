import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Check, X, Pencil, Loader2, Video, ListChecks, Clock, Users, ExternalLink,
  CheckCheck, AlertCircle,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import type { QueuedAiAction } from '@/hooks/useAiActionQueue';
import { syncTaskAfterCreate } from '@/lib/asana/syncTaskAfterCreate';

interface Props {
  item: QueuedAiAction;
  onDone?: () => void;
}

type DealSuggestion = {
  id: string;
  name: string | null;
  company_id: string | null;
  pre_selected?: boolean;
};

type ActionItem = {
  title: string;
  description: string;
  suggested_owner_name: string;
  suggested_owner_user_id: string | null;
  due_at: string; // 'YYYY-MM-DD' or ''
  source_quote: string;
  dedupe_key: string;
};

function confidenceColor(label?: string) {
  switch (label) {
    case 'high': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case 'medium': return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    default: return 'bg-muted text-muted-foreground border-border';
  }
}

/**
 * Renders an Approval Queue card for a Claap recording.
 * - claap_recording_review → Stage 1 relationship matching (deal/company link approval)
 * - claap_action_items     → Stage 2 task review (turn extracted next-steps into tasks)
 *
 * Approval is gated: nothing is written until the user clicks Approve and the
 * DB write returns success. On failure the queue card stays open with an error.
 */
export function ClaapApprovalCard({ item, onDone }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const payload = (item.payload || {}) as Record<string, any>;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (item.action_type === 'claap_recording_review') {
    return <MatchingCard
      item={item} payload={payload} user={user} qc={qc}
      busy={busy} setBusy={setBusy} error={error} setError={setError}
      onDone={onDone}
    />;
  }
  if (item.action_type === 'claap_action_items') {
    return <ActionItemsCard
      item={item} payload={payload} user={user} qc={qc}
      busy={busy} setBusy={setBusy} error={error} setError={setError}
      onDone={onDone}
    />;
  }
  return null;
}

// ─── Stage 1: matching card ─────────────────────────────────
function MatchingCard({
  item, payload, user, qc, busy, setBusy, error, setError, onDone,
}: any) {
  const deals: DealSuggestion[] = payload?.suggestions?.deals || [];
  const preselected = deals.find(d => d.pre_selected)?.id || deals[0]?.id || null;
  const [selectedDealId, setSelectedDealId] = useState<string | null>(preselected);
  const attendees: Array<{ name: string; email: string; is_internal: boolean }> = payload.attendees || [];
  const confidenceLabel: string = payload.confidence_label || 'low';
  const why: string = payload.why || '';
  const recordingTitle: string = payload.recording_title || item.title;
  const recordedAt: string | null = payload.recorded_at;
  const recordingUrl: string | null = payload.recording_url;

  const approve = async () => {
    if (!user) return;
    if (!selectedDealId) {
      toast.error('Pick a deal first or click Reject to skip linking.');
      return;
    }
    setBusy(true); setError(null);
    try {
      const dealId = selectedDealId;
      // 1. Link recording to deal
      const { error: linkErr } = await supabase
        .from('deal_claap_recordings')
        .upsert({
          deal_id: dealId,
          recording_id: payload.claap_id,
          recording_title: recordingTitle,
          recording_url: recordingUrl,
          duration_seconds: payload.duration_seconds || null,
          linked_by: user.id,
          notes: 'Approved via Approval Queue',
        }, { onConflict: 'deal_id,recording_id' });
      if (linkErr) throw linkErr;

      // 2. Log activity
      await supabase.from('activity_logs').insert({
        deal_id: dealId,
        activity_type: 'claap_recording_linked',
        description: `Claap recording linked via Approval Queue: ${recordingTitle}`,
        user_id: user.id,
        metadata: {
          claap_id: payload.claap_id,
          source: 'approval_queue',
          confidence: payload.confidence,
        },
      });

      // 3. Mark queue item approved
      const now = new Date().toISOString();
      await supabase.from('ai_action_queue').update({
        status: 'approved',
        approved_at: now,
        executed_at: now,
      }).eq('id', item.id);

      toast.success('Recording linked', { description: `Linked to ${deals.find(d => d.id === dealId)?.name || 'deal'}.` });
      qc.invalidateQueries({ queryKey: ['ai-action-queue'] });
      qc.invalidateQueries({ queryKey: ['ai-action-queue-count'] });
      onDone?.();
    } catch (e: any) {
      console.error('[ClaapApprovalCard] approve match error', e);
      setError(e?.message || 'Could not link recording.');
      toast.error('Failed to link recording', { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    setBusy(true); setError(null);
    try {
      await supabase.from('ai_action_queue').update({
        status: 'dismissed',
        dismissed_at: new Date().toISOString(),
      }).eq('id', item.id);
      qc.invalidateQueries({ queryKey: ['ai-action-queue'] });
      qc.invalidateQueries({ queryKey: ['ai-action-queue-count'] });
      onDone?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-fuchsia-500/30 bg-transparent p-3 space-y-3">
      <div className="flex items-start gap-2">
        <Video className="h-4 w-4 text-fuchsia-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium truncate">{recordingTitle}</p>
            <Badge variant="outline" className={confidenceColor(confidenceLabel)}>
              {confidenceLabel} confidence
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
            {recordedAt && <span>{format(new Date(recordedAt), 'EEE, MMM d · h:mm a')}</span>}
            {recordingUrl && (
              <a href={recordingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                <ExternalLink className="h-3 w-3" /> Open in Claap
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Attendees */}
      {attendees.length > 0 && (
        <div className="flex items-start gap-2">
          <Users className="h-3.5 w-3.5 text-muted-foreground mt-1 shrink-0" />
          <div className="flex flex-wrap gap-1">
            {attendees.slice(0, 8).map((a, i) => (
              <Badge key={i} variant="secondary" className={`text-[10px] ${a.is_internal ? 'opacity-60' : ''}`}>
                {a.name || a.email}
              </Badge>
            ))}
            {attendees.length > 8 && <span className="text-[10px] text-muted-foreground">+{attendees.length - 8}</span>}
          </div>
        </div>
      )}

      {/* Suggested deal picker */}
      <div className="space-y-1.5">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Suggested deal link</p>
        {deals.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No deal suggestion. Approve to dismiss or open the recording to link manually.</p>
        ) : (
          <div className="space-y-1">
            {deals.map(d => (
              <label key={d.id} className={`flex items-center gap-2 rounded border px-2 py-1.5 cursor-pointer text-xs ${selectedDealId === d.id ? 'border-fuchsia-500/60 bg-transparent' : 'border-border bg-transparent'}`}>
                <input type="radio" name={`deal-${item.id}`}
                  checked={selectedDealId === d.id}
                  onChange={() => setSelectedDealId(d.id)}
                  className="accent-fuchsia-500"
                />
                <span className="flex-1 truncate">{d.name || 'Untitled deal'}</span>
                {d.pre_selected && <Badge variant="outline" className="text-[9px]">AI pick</Badge>}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Why this match */}
      {why && (
        <div className="rounded border border-border/50 bg-transparent px-2 py-1.5 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">Why this match?</span> {why}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-1.5 text-[11px] text-destructive">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-1.5">
        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-muted-foreground" disabled={busy} onClick={reject}>
          <X className="h-3 w-3 mr-1" /> Reject
        </Button>
        <Button size="sm" variant="default" className="h-7 px-2 text-[11px]" disabled={busy || !selectedDealId} onClick={approve}>
          {busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
          Approve link
        </Button>
      </div>
    </div>
  );
}

// ─── Stage 2: action items card ─────────────────────────────
function ActionItemsCard({
  item, payload, user, qc, busy, setBusy, error, setError, onDone,
}: any) {
  const initialItems: ActionItem[] = (payload.action_items || []) as ActionItem[];
  const [items, setItems] = useState<ActionItem[]>(initialItems);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [discarded, setDiscarded] = useState<Set<number>>(new Set());

  const visible = useMemo(
    () => items.map((it, i) => ({ it, i })).filter(({ i }) => !discarded.has(i)),
    [items, discarded],
  );

  const dealId: string | null = item.deal_id || null;

  const persistApproved = async (toCreate: { idx: number; item: ActionItem }[]) => {
    if (!user) return { ok: 0, fail: 0 };
    let ok = 0; let fail = 0;
    for (const { item: ai } of toCreate) {
      const due_date = ai.due_at && /^\d{4}-\d{2}-\d{2}$/.test(ai.due_at) ? ai.due_at : null;
      const ownerId = ai.suggested_owner_user_id || user.id;
      try {
        const { data: created, error: insErr } = await supabase.from('tasks').insert({
          title: ai.title,
          description: ai.description || (ai.source_quote ? `"${ai.source_quote}"` : null),
          due_date,
          priority: 'medium',
          deal_id: dealId,
          assigned_to: ownerId,
          assigned_by: user.id,
        } as any).select('id').single();
        if (insErr) throw insErr;
        if (created?.id) {
          syncTaskAfterCreate({
            taskId: created.id,
            title: ai.title,
            description: ai.description ?? null,
            dueDate: due_date,
            assignedTo: ownerId,
          }).catch(() => {});
        }
        ok++;
      } catch (e) {
        console.error('[ClaapApprovalCard] task create error', e);
        fail++;
      }
    }
    return { ok, fail };
  };

  const approveOne = async (idx: number) => {
    setBusy(true); setError(null);
    const r = await persistApproved([{ idx, item: items[idx] }]);
    if (r.ok > 0) {
      setDiscarded(prev => new Set(prev).add(idx));
      toast.success('Task created');
      // If no more visible items, close the queue card
      if (visible.length - r.ok <= 0) {
        await finalizeApproved();
      }
    } else {
      setError('Could not create task. Try again.');
    }
    setBusy(false);
  };

  const approveAll = async () => {
    setBusy(true); setError(null);
    const toCreate = visible.map(({ it, i }) => ({ idx: i, item: it }));
    const r = await persistApproved(toCreate);
    if (r.ok > 0) toast.success(`Created ${r.ok} task${r.ok !== 1 ? 's' : ''}`);
    if (r.fail > 0) toast.error(`${r.fail} failed`);
    if (r.fail === 0) {
      await finalizeApproved();
    } else {
      setError(`${r.fail} task${r.fail !== 1 ? 's' : ''} failed — retry or discard.`);
    }
    setBusy(false);
  };

  const finalizeApproved = async () => {
    const now = new Date().toISOString();
    await supabase.from('ai_action_queue').update({
      status: 'approved', approved_at: now, executed_at: now,
    }).eq('id', item.id);
    if (dealId) {
      await supabase.from('activity_logs').insert({
        deal_id: dealId,
        activity_type: 'claap_action_items_approved',
        description: `Approved Claap action items from "${payload.recording_title || 'recording'}"`,
        user_id: user.id,
        metadata: { claap_meeting_id: payload.claap_meeting_id, source: 'approval_queue' },
      });
    }
    qc.invalidateQueries({ queryKey: ['ai-action-queue'] });
    qc.invalidateQueries({ queryKey: ['ai-action-queue-count'] });
    qc.invalidateQueries({ queryKey: ['tasks'] });
    onDone?.();
  };

  const discardAll = async () => {
    setBusy(true);
    await supabase.from('ai_action_queue').update({
      status: 'dismissed', dismissed_at: new Date().toISOString(),
    }).eq('id', item.id);
    qc.invalidateQueries({ queryKey: ['ai-action-queue'] });
    qc.invalidateQueries({ queryKey: ['ai-action-queue-count'] });
    setBusy(false);
    onDone?.();
  };

  const updateItem = (idx: number, patch: Partial<ActionItem>) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };

  return (
    <div className="rounded-md border border-cyan-500/30 bg-transparent p-3 space-y-2">
      <div className="flex items-start gap-2">
        <ListChecks className="h-4 w-4 text-cyan-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{item.title}</p>
          <p className="text-[11px] text-muted-foreground">
            From {payload.recording_title || 'meeting'}
            {payload.recorded_at && ` · ${formatDistanceToNow(new Date(payload.recorded_at), { addSuffix: true })}`}
          </p>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No action items remaining.</p>
      ) : (
        <ul className="space-y-2">
          {visible.map(({ it, i }) => (
            <li key={i} className="rounded border border-border/60 bg-transparent p-2 space-y-1.5">
              {editingIdx === i ? (
                <>
                  <Input value={it.title}
                    onChange={e => updateItem(i, { title: e.target.value })}
                    className="h-7 text-xs" />
                  <Textarea value={it.description}
                    onChange={e => updateItem(i, { description: e.target.value })}
                    className="min-h-[44px] text-xs" />
                  <div className="flex items-center gap-2">
                    <Input type="date" value={it.due_at || ''}
                      onChange={e => updateItem(i, { due_at: e.target.value })}
                      className="h-7 text-xs w-36" />
                    <Input placeholder="Owner name" value={it.suggested_owner_name}
                      onChange={e => updateItem(i, { suggested_owner_name: e.target.value })}
                      className="h-7 text-xs flex-1" />
                  </div>
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setEditingIdx(null)}>Done</Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs font-medium">{it.title}</p>
                  {it.description && <p className="text-[11px] text-muted-foreground">{it.description}</p>}
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    {it.suggested_owner_name && (
                      <Badge variant="secondary" className="text-[10px]">
                        {it.suggested_owner_name}
                        {!it.suggested_owner_user_id && ' (unmatched)'}
                      </Badge>
                    )}
                    {it.due_at && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" /> {it.due_at}
                      </span>
                    )}
                  </div>
                  {it.source_quote && (
                    <p className="text-[10px] italic text-muted-foreground truncate">"{it.source_quote}"</p>
                  )}
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]"
                      disabled={busy} onClick={() => setEditingIdx(i)}>
                      <Pencil className="h-3 w-3 mr-1" /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-muted-foreground hover:text-destructive"
                      disabled={busy} onClick={() => setDiscarded(prev => new Set(prev).add(i))}>
                      <X className="h-3 w-3 mr-1" /> Discard
                    </Button>
                    <Button size="sm" variant="default" className="h-6 px-2 text-[10px]"
                      disabled={busy} onClick={() => approveOne(i)}>
                      <Check className="h-3 w-3 mr-1" /> Create task
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="flex items-start gap-1.5 text-[11px] text-destructive">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-border/40">
        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-muted-foreground" disabled={busy} onClick={discardAll}>
          Discard all
        </Button>
        <Button size="sm" variant="default" className="h-7 px-2 text-[11px]"
          disabled={busy || visible.length === 0} onClick={approveAll}>
          {busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCheck className="h-3 w-3 mr-1" />}
          Approve all
        </Button>
      </div>
    </div>
  );
}