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
  companyId: string | null
): Promise<{ id: string } | null> {
  // Map priority: tasks table uses 'low'|'medium'|'high'|'urgent'; we normalize 'normal' → 'medium'
  const priorityMap: Record<string, string> = { low: 'low', normal: 'medium', high: 'high', urgent: 'urgent' };
  const priority = draft.priority ? priorityMap[draft.priority] || 'medium' : 'medium';

  const insertRow: any = {
    title: draft.title,
    description: draft.description,
    due_date: draft.due_date,
    priority,
    status: 'not_started',
    user_id: userId,
    assigned_to: draft.owner_id || userId,
    assigned_by: userId,
    company_id: companyId,
    deal_id: draft.deal_id,
    lender_id: draft.lender_id,
    contact_id: draft.contact_id,
    task_type: draft.type === 'meeting' ? 'meeting' : draft.type === 'call' ? 'call' : 'task',
    sync_source: 'naitive_nl_input',
    is_recurring: draft.is_recurring,
    recurrence_rule: draft.recurrence_rule,
  };

  const { data, error } = await supabase.from('tasks').insert(insertRow).select('id').single();
  if (error) {
    console.error('[createTaskFromDraft]', error);
    return null;
  }
  return data as { id: string };
}