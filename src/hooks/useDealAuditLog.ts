import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface DealAuditEntry {
  id: string;
  deal_id: string;
  user_id: string;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  metadata: Record<string, any>;
  created_at: string;
  // joined
  user_display_name?: string;
  user_avatar_url?: string;
}

const PAGE_SIZE = 50;

export function useDealAuditLog(dealId: string | undefined) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<DealAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  const fetchEntries = useCallback(async (pageNum: number, append = false) => {
    if (!dealId || !user) return;
    setLoading(true);
    try {
      const from = pageNum * PAGE_SIZE;
      const { data, error } = await (supabase as any)
        .from('deal_audit_log')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;
      const rows = (data || []) as DealAuditEntry[];

      // Fetch user profiles for display names
      const userIds = [...new Set(rows.map(r => r.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', userIds);

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
      const enriched = rows.map(r => ({
        ...r,
        user_display_name: profileMap.get(r.user_id)?.display_name || 'Unknown',
        user_avatar_url: profileMap.get(r.user_id)?.avatar_url || null,
      }));

      if (append) {
        setEntries(prev => [...prev, ...enriched]);
      } else {
        setEntries(enriched);
      }
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err) {
      console.error('Error fetching audit log:', err);
    } finally {
      setLoading(false);
    }
  }, [dealId, user]);

  useEffect(() => {
    setPage(0);
    setEntries([]);
    fetchEntries(0);
  }, [fetchEntries]);

  const loadMore = useCallback(() => {
    const next = page + 1;
    setPage(next);
    fetchEntries(next, true);
  }, [page, fetchEntries]);

  const logAuditAction = useCallback(async (
    actionType: string,
    entityType: string,
    entityId?: string,
    entityName?: string,
    metadata?: Record<string, any>,
  ) => {
    if (!user || !dealId) return;
    try {
      await (supabase as any).from('deal_audit_log').insert({
        deal_id: dealId,
        user_id: user.id,
        action_type: actionType,
        entity_type: entityType,
        entity_id: entityId || null,
        entity_name: entityName || null,
        metadata: metadata || {},
      });
    } catch (err) {
      console.error('Error logging audit action:', err);
    }
  }, [user, dealId]);

  // Realtime subscription for new entries
  useEffect(() => {
    if (!dealId) return;
    const channel = supabase
      .channel(`deal-audit-${dealId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'deal_audit_log',
        filter: `deal_id=eq.${dealId}`,
      }, async (payload) => {
        const newEntry = payload.new as DealAuditEntry;
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, avatar_url')
          .eq('user_id', newEntry.user_id)
          .single();
        setEntries(prev => [{
          ...newEntry,
          user_display_name: profile?.display_name || 'Unknown',
          user_avatar_url: profile?.avatar_url || null,
        }, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [dealId]);

  return { entries, loading, hasMore, loadMore, logAuditAction, refetch: () => fetchEntries(0) };
}
