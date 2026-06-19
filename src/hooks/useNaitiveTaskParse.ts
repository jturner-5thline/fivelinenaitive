import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useDealsContext } from '@/contexts/DealsContext';
import { resolveDealFromTaskText } from '@/lib/resolveDealFromTaskText';

export interface TaskDraft {
  title: string;
  description: string | null;
  due_date: string | null;
  due_time: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent' | null;
  type: 'follow_up' | 'call' | 'email' | 'review' | 'send_doc' | 'meeting' | 'general';
  is_recurring: boolean;
  recurrence_rule: string | null;
  confidence: number;

  owner_id: string | null;
  owner_label: string | null;
  owner_ambiguous: { id: string; label: string }[] | null;

  deal_id: string | null;
  deal_label: string | null;

  lender_id: string | null;
  lender_label: string | null;

  contact_id: string | null;
  contact_label: string | null;

  source_thread_id: string | null;
  hints: { owner: string | null; deal: string | null; lender: string | null; contact: string | null };
}

export interface ParseContext {
  deal_id?: string | null;
  contact_id?: string | null;
  thread_id?: string | null;
}

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/naitive-task-parse`;

export function useNaitiveTaskParse(text: string, context: ParseContext = {}, debounceMs = 280) {
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);
  const { deals } = useDealsContext();

  // Instant client-side deal resolution — no network round-trip. When the
  // user mentions a known deal verbatim, surface the chip immediately and
  // (later) override the AI's pick if its match is unambiguous.
  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed.length < 4) return;
    const local = resolveDealFromTaskText(trimmed, deals);
    if (!local) return;
    setDraft((prev) => {
      // Already aligned — nothing to do.
      if (prev?.deal_id === local.id) return prev;
      // Skeleton draft so the chip appears before the AI returns.
      if (!prev) {
        return {
          title: trimmed,
          description: null,
          due_date: null,
          due_time: null,
          priority: null,
          type: 'general',
          is_recurring: false,
          recurrence_rule: null,
          confidence: 0.5,
          owner_id: null,
          owner_label: null,
          owner_ambiguous: null,
          deal_id: local.id,
          deal_label: local.label,
          lender_id: null,
          lender_label: null,
          contact_id: null,
          contact_label: null,
          source_thread_id: context.thread_id ?? null,
          hints: { owner: null, deal: local.label, lender: null, contact: null },
        };
      }
      // Override AI pick when local exact-mention disagrees.
      return { ...prev, deal_id: local.id, deal_label: local.label };
    });
  }, [text, deals, context.thread_id]);

  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed.length < 4) { setDraft(null); setError(null); setLoading(false); return; }

    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) { setError('Not authenticated'); setLoading(false); return; }
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
        const resp = await fetch(FN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text: trimmed, tz, context }),
        });
        if (id !== reqId.current) return;
        if (!resp.ok) {
          const j = await resp.json().catch(() => ({}));
          setError(j?.error || `Parse failed (${resp.status})`);
          setDraft(null);
        } else {
          const j = await resp.json();
          const d = j.draft as TaskDraft;
          // Honor explicit "no priority / leave blank / clear priority" intent.
          if (/\b(no|without|clear|blank|leave\s+blank|remove)\s+priority\b|priority\s+(should\s+be\s+)?(blank|none|null|clear|removed)/i.test(trimmed)) {
            d.priority = null;
          }
          // Prefer the instant local deal match over the AI's pick when the
          // user mentioned a deal verbatim — the AI sometimes resolves to a
          // stale duplicate.
          const local = resolveDealFromTaskText(trimmed, deals);
          if (local) {
            d.deal_id = local.id;
            d.deal_label = local.label;
            d.hints = { ...d.hints, deal: d.hints?.deal ?? local.label };
          }
          setDraft(d);
          setError(null);
        }
      } catch (e) {
        if (id !== reqId.current) return;
        setError(e instanceof Error ? e.message : 'Parse failed');
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, debounceMs);

    return () => clearTimeout(t);
  }, [text, context.deal_id, context.contact_id, context.thread_id, debounceMs]);

  const reparse = useCallback(() => { reqId.current++; }, []);

  return { draft, setDraft, loading, error, reparse };
}

// ─── Create task from draft ───
export async function createTaskFromDraft(
  draft: TaskDraft,
  userId: string,
  companyId: string | null,
  options?: {
    syncSource?: string;
    sourceThreadId?: string | null;
    initialAsanaSyncStatus?: string | null;
  }
): Promise<{ id: string; assigned_to: string } | { id: string; assigned_to: string; _error?: never } | null> {
  // tasks_priority_urgent_only_chk: priority must be NULL or 'urgent'.
  // Only flag explicitly urgent drafts; everything else leaves priority unset.
  const priority: string | null = draft.priority === 'urgent' ? 'urgent' : null;

  const insertRow: any = {
    title: draft.title,
    description: draft.description,
    due_date: draft.due_date,
    priority,
    status: 'not_started',
    assigned_to: draft.owner_id || userId,
    assigned_by: userId,
    company_id: companyId,
    deal_id: draft.deal_id,
    lender_id: draft.lender_id,
    contact_id: draft.contact_id,
    task_type: draft.type === 'meeting' ? 'meeting' : draft.type === 'call' ? 'call' : 'task',
    sync_source: options?.syncSource || 'naitive_nl_input',
    is_recurring: draft.is_recurring,
    recurrence_rule: draft.recurrence_rule,
  };

  // Strip null/undefined keys so DB defaults apply
  Object.keys(insertRow).forEach((k) => {
    if (insertRow[k] === undefined || insertRow[k] === null) delete insertRow[k];
  });
  // Always re-set required fields even if "null-stripped"
  insertRow.title = draft.title;
  insertRow.assigned_to = draft.owner_id || userId;
  insertRow.assigned_by = userId;
  insertRow.status = 'not_started';
  if (priority) {
    insertRow.priority = priority;
  } else {
    delete insertRow.priority;
  }
  insertRow.task_type = draft.type === 'meeting' ? 'meeting' : draft.type === 'call' ? 'call' : 'task';
  insertRow.sync_source = options?.syncSource || 'naitive_nl_input';
  insertRow.is_recurring = draft.is_recurring;
  if (options?.initialAsanaSyncStatus) {
    insertRow.asana_sync_status = options.initialAsanaSyncStatus;
  }
  // No source_thread_id column on tasks — append the reference to description
  const threadId = options?.sourceThreadId ?? draft.source_thread_id;
  if (threadId) {
    const ref = `\n\n[email thread: ${threadId}]`;
    insertRow.description = (insertRow.description ? String(insertRow.description) : '') + ref;
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert(insertRow)
    .select('id, assigned_to')
    .single();
  if (error) {
    console.error('[createTaskFromDraft]', error);
    throw error;
  }
  return data as { id: string; assigned_to: string };
}