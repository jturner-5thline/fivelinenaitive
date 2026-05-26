import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
          setDraft(j.draft as TaskDraft);
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
  options?: { syncSource?: string; sourceThreadId?: string | null }
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