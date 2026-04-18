import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { CellComment, NewCellCommentInput } from './types';
import { sanitizeRichText, htmlToPlainText } from './sanitize';

interface UseCellCommentsOptions {
  companyId: string | null | undefined;
  planId?: string | null;
}

export function cellCommentKey(line_item_key: string, week_key: string): string {
  return `${line_item_key}::${week_key}`;
}

export function useCellComments({ companyId, planId = null }: UseCellCommentsOptions) {
  const { user } = useAuth();
  const [comments, setComments] = useState<CellComment[]>([]);
  const [loading, setLoading] = useState(false);
  const profileCacheRef = useRef<Record<string, { display_name: string | null; avatar_url: string | null; email: string | null }>>({});

  const hydrateAuthors = useCallback(async (rows: CellComment[]): Promise<CellComment[]> => {
    const missing = Array.from(
      new Set(rows.map(r => r.created_by).filter(uid => !profileCacheRef.current[uid]))
    );
    if (missing.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, email')
        .in('user_id', missing);
      for (const p of profs || []) {
        profileCacheRef.current[(p as any).user_id] = {
          display_name: (p as any).display_name ?? null,
          avatar_url: (p as any).avatar_url ?? null,
          email: (p as any).email ?? null,
        };
      }
    }
    return rows.map(r => {
      const p = profileCacheRef.current[r.created_by];
      return {
        ...r,
        author_display_name: p?.display_name ?? null,
        author_avatar_url: p?.avatar_url ?? null,
        author_email: p?.email ?? null,
      };
    });
  }, []);

  const fetchAll = useCallback(async () => {
    if (!companyId) {
      setComments([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cell_comments' as any)
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true });
      if (error) {
        console.error('[cell_comments] fetch error', error);
        setComments([]);
        return;
      }
      const hydrated = await hydrateAuthors((data as any) || []);
      setComments(hydrated);
    } finally {
      setLoading(false);
    }
  }, [companyId, hydrateAuthors]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Realtime subscription
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`cell_comments:${companyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cell_comments', filter: `company_id=eq.${companyId}` },
        async (payload) => {
          if (payload.eventType === 'DELETE') {
            setComments(prev => prev.filter(c => c.id !== (payload.old as any).id));
            return;
          }
          const row = payload.new as any as CellComment;
          const [hydrated] = await hydrateAuthors([row]);
          setComments(prev => {
            const idx = prev.findIndex(c => c.id === row.id);
            if (idx === -1) return [...prev, hydrated].sort((a, b) => a.created_at.localeCompare(b.created_at));
            const copy = prev.slice();
            copy[idx] = hydrated;
            return copy;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, hydrateAuthors]);

  const addComment = useCallback(
    async (input: NewCellCommentInput): Promise<CellComment | null> => {
      if (!companyId || !user?.id) return null;
      const cleanHtml = sanitizeRichText(input.content_html);
      const plainText = input.content_text || htmlToPlainText(cleanHtml);
      const payload = {
        company_id: companyId,
        plan_id: input.plan_id ?? planId ?? null,
        line_item_key: input.line_item_key,
        line_item_label: input.line_item_label,
        week_key: input.week_key,
        week_num: input.week_num,
        week_ending: input.week_ending,
        cell_value_snapshot: input.cell_value_snapshot,
        content_html: cleanHtml,
        content_text: plainText,
        content_json: input.content_json ?? null,
        parent_comment_id: input.parent_comment_id ?? null,
        created_by: user.id,
      };
      const { data, error } = await supabase
        .from('cell_comments' as any)
        .insert(payload as any)
        .select('*')
        .single();
      if (error) {
        console.error('[cell_comments] insert error', error);
        return null;
      }
      const [hydrated] = await hydrateAuthors([data as any]);
      // Optimistic — realtime will reconcile but make sure UI updates immediately
      setComments(prev => {
        if (prev.some(c => c.id === hydrated.id)) return prev;
        return [...prev, hydrated].sort((a, b) => a.created_at.localeCompare(b.created_at));
      });
      return hydrated;
    },
    [companyId, planId, user?.id, hydrateAuthors],
  );

  const updateComment = useCallback(
    async (id: string, content_html: string): Promise<boolean> => {
      const cleanHtml = sanitizeRichText(content_html);
      const plainText = htmlToPlainText(cleanHtml);
      const { error } = await supabase
        .from('cell_comments' as any)
        .update({ content_html: cleanHtml, content_text: plainText } as any)
        .eq('id', id);
      if (error) {
        console.error('[cell_comments] update error', error);
        return false;
      }
      return true;
    },
    [],
  );

  const deleteComment = useCallback(async (id: string): Promise<boolean> => {
    const { error } = await supabase.from('cell_comments' as any).delete().eq('id', id);
    if (error) {
      console.error('[cell_comments] delete error', error);
      return false;
    }
    setComments(prev => prev.filter(c => c.id !== id && c.parent_comment_id !== id));
    return true;
  }, []);

  // Index by cell key (line_item_key::week_key)
  const byCell = useMemo(() => {
    const map: Record<string, CellComment[]> = {};
    for (const c of comments) {
      if (c.parent_comment_id) continue; // only top-level cell comments count toward indicator
      const k = cellCommentKey(c.line_item_key, c.week_key);
      if (!map[k]) map[k] = [];
      map[k].push(c);
    }
    return map;
  }, [comments]);

  return { comments, byCell, loading, addComment, updateComment, deleteComment, fetchAll };
}
