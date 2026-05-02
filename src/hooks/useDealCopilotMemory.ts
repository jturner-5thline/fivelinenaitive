import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface DealCopilotMessage {
  id: string;
  deal_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: Record<string, any>;
  cleared_at: string | null;
  created_at: string;
}

const RECENT_LIMIT = 20; // 10 exchanges (user+assistant)

export function useDealCopilotMemory(dealId: string | null | undefined) {
  const { user } = useAuth();
  const [recent, setRecent] = useState<DealCopilotMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!dealId || !user) {
      setRecent([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('copilot_deal_messages')
        .select('*')
        .eq('deal_id', dealId)
        .is('cleared_at', null)
        .order('created_at', { ascending: false })
        .limit(RECENT_LIMIT);
      if (!error) {
        setRecent(((data as any[]) || []).reverse() as DealCopilotMessage[]);
      }
    } finally {
      setLoading(false);
    }
  }, [dealId, user]);

  useEffect(() => { reload(); }, [reload]);

  const append = useCallback(async (
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata: Record<string, any> = {}
  ) => {
    if (!dealId || !user || !content.trim()) return null;
    const { data, error } = await supabase
      .from('copilot_deal_messages')
      .insert({ deal_id: dealId, user_id: user.id, role, content, metadata })
      .select()
      .single();
    if (error) {
      console.warn('[deal-memory] insert failed', error);
      return null;
    }
    setRecent((prev) => [...prev, data as DealCopilotMessage].slice(-RECENT_LIMIT));
    return data as DealCopilotMessage;
  }, [dealId, user]);

  const clear = useCallback(async () => {
    if (!dealId || !user) return;
    // Soft clear: only the user's own visible rows
    await supabase
      .from('copilot_deal_messages')
      .update({ cleared_at: new Date().toISOString() })
      .eq('deal_id', dealId)
      .eq('user_id', user.id)
      .is('cleared_at', null);
    setRecent([]);
  }, [dealId, user]);

  return { recent, loading, reload, append, clear };
}