import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useAuth } from '@/contexts/AuthContext';
import { useInsightsTimeframeOptional, reportingPeriodHelpers } from '@/contexts/InsightsTimeframeContext';

export interface QirComment {
  id: string;
  company_id: string;
  report_key: string;
  target_type: string;
  target_id: string;
  body: string;
  mentioned_user_ids: string[];
  author_user_id: string;
  author_name: string | null;
  created_at: string;
  updated_at?: string;
  comment_type?: 'note' | 'decision' | 'action_item';
  section_label?: string | null;
  snippet_text?: string | null;
}

export interface QirThreadState {
  target_type: string;
  target_id: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolved_by_name: string | null;
}

export interface QirThreadEvent {
  id: string;
  target_type: string;
  target_id: string;
  action: 'resolved' | 'reopened';
  actor_user_id: string;
  actor_name: string | null;
  created_at: string;
}

export function useQirComments(reportKey: string) {
  const { company, members } = useCompany();
  const { user } = useAuth();
  const tf = useInsightsTimeframeOptional();
  const period = tf?.reportingPeriod ?? reportingPeriodHelpers.defaultReportingPeriod('quarter');
  const [comments, setComments] = useState<QirComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [threads, setThreads] = useState<QirThreadState[]>([]);
  const [events, setEvents] = useState<QirThreadEvent[]>([]);

  // Initial fetch
  useEffect(() => {
    if (!company?.id) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('qir_comments' as any)
        .select('*')
        .eq('company_id', company.id)
        .eq('report_key', reportKey)
        .order('created_at', { ascending: true });
      if (!alive) return;
      if (!error && data) setComments(data as any as QirComment[]);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [company?.id, reportKey]);

  // Initial fetch — thread state
  useEffect(() => {
    if (!company?.id) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('qir_comment_threads' as any)
        .select('target_type,target_id,resolved_at,resolved_by,resolved_by_name')
        .eq('company_id', company.id)
        .eq('report_key', reportKey);
      if (!alive) return;
      if (data) setThreads(data as any as QirThreadState[]);
    })();
    return () => { alive = false; };
  }, [company?.id, reportKey]);

  // Initial fetch — thread events
  useEffect(() => {
    if (!company?.id) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('qir_thread_events' as any)
        .select('id,target_type,target_id,action,actor_user_id,actor_name,created_at')
        .eq('company_id', company.id)
        .eq('report_key', reportKey)
        .order('created_at', { ascending: true });
      if (!alive) return;
      if (data) setEvents(data as any as QirThreadEvent[]);
    })();
    return () => { alive = false; };
  }, [company?.id, reportKey]);

  // Realtime — thread events
  useEffect(() => {
    if (!company?.id) return;
    const ch = supabase
      .channel(`qir-thread-events-${reportKey}-${company.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'qir_thread_events', filter: `company_id=eq.${company.id}` }, (payload) => {
        const row = payload.new as any;
        if (!row || row.report_key !== reportKey) return;
        setEvents(prev => prev.find(e => e.id === row.id) ? prev : [...prev, row as QirThreadEvent]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [company?.id, reportKey]);

  // Realtime — thread state
  useEffect(() => {
    if (!company?.id) return;
    const ch = supabase
      .channel(`qir-threads-${reportKey}-${company.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qir_comment_threads', filter: `company_id=eq.${company.id}` }, (payload) => {
        const row = (payload.new || payload.old) as any;
        if (!row || row.report_key !== reportKey) return;
        if (payload.eventType === 'DELETE') {
          setThreads(prev => prev.filter(t => !(t.target_type === row.target_type && t.target_id === row.target_id)));
        } else {
          const next: QirThreadState = {
            target_type: row.target_type,
            target_id: row.target_id,
            resolved_at: row.resolved_at,
            resolved_by: row.resolved_by,
            resolved_by_name: row.resolved_by_name,
          };
          setThreads(prev => {
            const i = prev.findIndex(t => t.target_type === next.target_type && t.target_id === next.target_id);
            if (i === -1) return [...prev, next];
            const copy = prev.slice();
            copy[i] = next;
            return copy;
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [company?.id, reportKey]);

  // Realtime
  useEffect(() => {
    if (!company?.id) return;
    const ch = supabase
      .channel(`qir-comments-${reportKey}-${company.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qir_comments', filter: `company_id=eq.${company.id}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const row = payload.new as any as QirComment;
          if (row.report_key !== reportKey) return;
          setComments(prev => prev.find(c => c.id === row.id) ? prev : [...prev, row]);
        } else if (payload.eventType === 'DELETE') {
          const row = payload.old as any as QirComment;
          setComments(prev => prev.filter(c => c.id !== row.id));
        } else if (payload.eventType === 'UPDATE') {
          const row = payload.new as any as QirComment;
          setComments(prev => prev.map(c => c.id === row.id ? row : c));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [company?.id, reportKey]);

  const addComment = useCallback(async (
    target_type: string,
    target_id: string,
    body: string,
    mentionNames: string[],
    reportLabel: string,
    targetLabel: string,
    commentType: 'note' | 'decision' | 'action_item' = 'note',
    extras?: { sectionLabel?: string | null; snippetText?: string | null },
  ) => {
    if (!company?.id || !user?.id) return;
    const trimmed = body.trim();
    if (!trimmed) return;
    if (trimmed.length > 4000) {
      throw new Error('Comment too long (max 4000 chars)');
    }
    // Resolve mentioned names to user_ids via company members
    const lcMap = new Map<string, { user_id: string; email?: string; display_name?: string }>();
    for (const m of (members || [])) {
      const dn = (m.display_name || '').toLowerCase().trim();
      if (dn) lcMap.set(dn, m);
      // Also map by email local-part
      if (m.email) lcMap.set(m.email.toLowerCase(), m);
    }
    const mentionedMembers = mentionNames
      .map(n => lcMap.get(n.toLowerCase().trim()))
      .filter(Boolean) as Array<{ user_id: string; email?: string; display_name?: string }>;
    const mentionedIds = Array.from(new Set(mentionedMembers.map(m => m.user_id)));

    const authorName = (user.user_metadata as any)?.full_name
      || (user.user_metadata as any)?.name
      || user.email
      || null;

    const { data: inserted, error } = await supabase
      .from('qir_comments' as any)
      .insert({
        company_id: company.id,
        report_key: reportKey,
        target_type,
        target_id,
        body: trimmed,
        mentioned_user_ids: mentionedIds,
        author_user_id: user.id,
        author_name: authorName,
        // Tag with active reporting period so the queue / "Your comments"
        // dropdown can scope comments to the period they were made under.
        period_type: period.view,
        period_key: period.period,
        comment_type: commentType,
        section_label: extras?.sectionLabel ?? targetLabel ?? null,
        snippet_text: extras?.snippetText ? extras.snippetText.slice(0, 400) : null,
      })
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (inserted) {
      const row = inserted as any as QirComment;
      setComments(prev => prev.find(c => c.id === row.id) ? prev : [...prev, row]);
    }

    // Fire-and-forget mention notifications (in-app + email).
    // We deliberately don't await — UI shouldn't block on it.
    for (const m of mentionedMembers) {
      if (!m.user_id || m.user_id === user.id) continue;
      // In-app: rely on notification_instances if admin can insert; otherwise skip silently.
      // Email via send-app-email
      if (m.email) {
        supabase.functions.invoke('send-app-email', {
          body: {
            templateName: 'qir-mention',
            recipientEmail: m.email,
            templateData: {
              recipientName: m.display_name || '',
              authorName: authorName || 'A teammate',
              reportLabel,
              targetLabel,
              body: trimmed,
              url: typeof window !== 'undefined' ? `${window.location.origin}/insights` : undefined,
            },
          },
        }).catch(() => { /* swallow */ });
      }
    }
    return (inserted as any as QirComment) || null;
  }, [company?.id, user, members, reportKey, period.view, period.period]);

  const deleteComment = useCallback(async (id: string) => {
    const { error } = await supabase.from('qir_comments' as any).delete().eq('id', id);
    if (error) throw error;
    setComments(prev => prev.filter(c => c.id !== id));
  }, []);

  const updateComment = useCallback(async (id: string, body: string) => {
    const trimmed = body.trim();
    if (!trimmed) return;
    if (trimmed.length > 4000) throw new Error('Comment too long (max 4000 chars)');
    const mentions = (trimmed.match(/@"([^"]+)"|@([A-Za-z][A-Za-z0-9_.-]*)/g) || [])
      .map(s => s.replace(/^@"?|"?$/g, ''));
    const lcMap = new Map<string, string>();
    for (const m of (members || [])) {
      if (m.display_name) lcMap.set(m.display_name.toLowerCase().trim(), m.user_id);
      if (m.email) lcMap.set(m.email.toLowerCase(), m.user_id);
    }
    const mentionedIds = Array.from(new Set(
      mentions.map(n => lcMap.get(n.toLowerCase().trim())).filter(Boolean) as string[]
    ));
    const { data, error } = await supabase
      .from('qir_comments' as any)
      .update({ body: trimmed, mentioned_user_ids: mentionedIds })
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (data) {
      const row = data as any as QirComment;
      setComments(prev => prev.map(c => c.id === row.id ? row : c));
    }
  }, [members]);

  const setThreadResolved = useCallback(async (target_type: string, target_id: string, resolved: boolean) => {
    if (!company?.id || !user?.id) return;
    const authorName = (user.user_metadata as any)?.full_name
      || (user.user_metadata as any)?.name
      || user.email
      || null;
    const payload = {
      company_id: company.id,
      report_key: reportKey,
      target_type,
      target_id,
      resolved_at: resolved ? new Date().toISOString() : null,
      resolved_by: resolved ? user.id : null,
      resolved_by_name: resolved ? authorName : null,
    };
    // Optimistic update
    setThreads(prev => {
      const i = prev.findIndex(t => t.target_type === target_type && t.target_id === target_id);
      const next: QirThreadState = {
        target_type, target_id,
        resolved_at: payload.resolved_at,
        resolved_by: payload.resolved_by,
        resolved_by_name: payload.resolved_by_name,
      };
      if (i === -1) return [...prev, next];
      const copy = prev.slice(); copy[i] = next; return copy;
    });
    const { error } = await supabase
      .from('qir_comment_threads' as any)
      .upsert(payload, { onConflict: 'company_id,report_key,target_type,target_id' });
    if (error) throw error;
    // Append to audit log (best-effort).
    const eventRow = {
      company_id: company.id,
      report_key: reportKey,
      target_type,
      target_id,
      action: resolved ? 'resolved' : 'reopened',
      actor_user_id: user.id,
      actor_name: authorName,
    };
    const { data: insertedEvent } = await supabase
      .from('qir_thread_events' as any)
      .insert(eventRow)
      .select('*')
      .maybeSingle();
    if (insertedEvent) {
      const e = insertedEvent as any as QirThreadEvent;
      setEvents(prev => prev.find(x => x.id === e.id) ? prev : [...prev, e]);
    }
  }, [company?.id, user, reportKey]);

  const getThreadState = useCallback((target_type: string, target_id: string): QirThreadState | null => {
    return threads.find(t => t.target_type === target_type && t.target_id === target_id) || null;
  }, [threads]);

  const getThreadEvents = useCallback((target_type: string, target_id: string): QirThreadEvent[] => {
    return events
      .filter(e => e.target_type === target_type && e.target_id === target_id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }, [events]);

  return { comments, loading, addComment, deleteComment, updateComment, threads, getThreadState, setThreadResolved, getThreadEvents };
}

/* ───────────────────── Section notes ───────────────────── */

export function useQirSectionNote(reportKey: string, sectionKey: string) {
  const { company } = useCompany();
  const { user } = useAuth();
  const [body, setBody] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Reset state whenever the identity of this note changes so a previous
    // period's body never bleeds into the next period's mount. Without this
    // reset, switching (or the hook re-keying after a parent save/reload)
    // would leave stale `body`/`loaded` values in place until the next
    // fetch — which, if the new key has no row, would never overwrite them.
    setBody('');
    setLoaded(false);
    if (!company?.id) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('qir_section_notes' as any)
        .select('body')
        .eq('company_id', company.id)
        .eq('report_key', reportKey)
        .eq('section_key', sectionKey)
        .maybeSingle();
      if (!alive) return;
      // Always set body explicitly (empty string when no row) so the UI
      // reflects the persisted truth for THIS key deterministically.
      setBody(data ? (((data as any).body as string) || '') : '');
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, [company?.id, reportKey, sectionKey]);

  // Realtime: pick up edits from teammates
  useEffect(() => {
    if (!company?.id) return;
    const ch = supabase
      .channel(`qir-note-${reportKey}-${sectionKey}-${company.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qir_section_notes', filter: `company_id=eq.${company.id}` }, (payload) => {
        const row = (payload.new || payload.old) as any;
        if (!row || row.report_key !== reportKey || row.section_key !== sectionKey) return;
        setBody((payload.new as any)?.body || '');
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [company?.id, reportKey, sectionKey]);

  const save = useCallback(async (next: string) => {
    if (!company?.id) return;
    const trimmed = next.slice(0, 8000);
    setBody(trimmed);
    await supabase
      .from('qir_section_notes' as any)
      .upsert({
        company_id: company.id,
        report_key: reportKey,
        section_key: sectionKey,
        body: trimmed,
        updated_by: user?.id ?? null,
      }, { onConflict: 'company_id,report_key,section_key' });
  }, [company?.id, reportKey, sectionKey, user?.id]);

  return { body, setBody, save, loaded };
}
