import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useAuth } from '@/contexts/AuthContext';

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
}

export function useQirComments(reportKey: string) {
  const { company, members } = useCompany();
  const { user } = useAuth();
  const [comments, setComments] = useState<QirComment[]>([]);
  const [loading, setLoading] = useState(true);

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
      // Email via send-transactional-email
      if (m.email) {
        supabase.functions.invoke('send-transactional-email', {
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
  }, [company?.id, user, members, reportKey]);

  const deleteComment = useCallback(async (id: string) => {
    const { error } = await supabase.from('qir_comments' as any).delete().eq('id', id);
    if (error) throw error;
    setComments(prev => prev.filter(c => c.id !== id));
  }, []);

  return { comments, loading, addComment, deleteComment };
}

/* ───────────────────── Section notes ───────────────────── */

export function useQirSectionNote(reportKey: string, sectionKey: string) {
  const { company } = useCompany();
  const { user } = useAuth();
  const [body, setBody] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
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
      if (data) setBody(((data as any).body as string) || '');
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
