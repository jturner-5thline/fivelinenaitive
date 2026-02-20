import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface AuditEntry {
  id: string;
  deal_id: string;
  user_id: string;
  user_display_name: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  target_name: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export function useDataRoomAudit(dealId: string | null) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchEntries = useCallback(async () => {
    if (!user || !dealId) { setEntries([]); return; }
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('data_room_audit_log')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setEntries((data || []) as AuditEntry[]);
    } catch (err) {
      console.error('Error fetching audit log:', err);
    } finally {
      setLoading(false);
    }
  }, [user, dealId]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  // Realtime
  useEffect(() => {
    if (!dealId) return;
    const channel = supabase
      .channel(`data-room-audit-${dealId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'data_room_audit_log',
        filter: `deal_id=eq.${dealId}`,
      }, () => { fetchEntries(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [dealId, fetchEntries]);

  const logAction = useCallback(async (
    action: string,
    targetType: string,
    targetId?: string,
    targetName?: string,
    metadata?: Record<string, any>
  ) => {
    if (!user || !dealId) return;
    try {
      // Get display name
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', user.id)
        .single();

      await supabase.from('data_room_audit_log').insert({
        deal_id: dealId,
        user_id: user.id,
        user_display_name: profile?.display_name || null,
        action,
        target_type: targetType,
        target_id: targetId || null,
        target_name: targetName || null,
        metadata: metadata || {},
      });
    } catch (err) {
      console.error('Error logging audit action:', err);
    }
  }, [user, dealId]);

  return { entries, loading, logAction, refetch: fetchEntries };
}
