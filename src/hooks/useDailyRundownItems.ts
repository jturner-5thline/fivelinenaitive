import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export const DAILY_RUNDOWN_ALLOWED_EMAIL = 'jturner@5thline.co';

export interface DailyRundownItem {
  id: string;
  title: string;
  content: string | null;
  status: 'pending' | 'complete';
  sort_order: number;
  source: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export function canUseDailyRundown(email: string | null | undefined) {
  return (email ?? '').trim().toLowerCase() === DAILY_RUNDOWN_ALLOWED_EMAIL;
}

/**
 * Reads the current user's daily rundown items and subscribes to Postgres
 * realtime so agent (OpenClaw / MCP) writes appear on the dashboard
 * automatically. All access is additionally enforced by RLS on the
 * `daily_rundown_items` table.
 */
export function useDailyRundownItems() {
  const { user } = useAuth();
  const enabled = canUseDailyRundown(user?.email);
  const qc = useQueryClient();
  const queryKey = ['daily_rundown_items', user?.id] as const;

  const query = useQuery({
    queryKey,
    enabled: !!user?.id && enabled,
    staleTime: 15_000,
    queryFn: async (): Promise<DailyRundownItem[]> => {
      const { data, error } = await supabase
        .from('daily_rundown_items')
        .select('id, title, content, status, sort_order, source, completed_at, created_at, updated_at')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DailyRundownItem[];
    },
  });

  useEffect(() => {
    if (!enabled || !user?.id) return;
    const channel = supabase
      .channel(`daily-rundown-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_rundown_items', filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [enabled, user?.id, qc]);

  const addItem = async (title: string) => {
    if (!user) return;
    const tail = (query.data ?? []).reduce((m, i) => Math.max(m, i.sort_order), 0);
    const { error } = await supabase.from('daily_rundown_items').insert({
      user_id: user.id,
      user_email: DAILY_RUNDOWN_ALLOWED_EMAIL,
      title,
      sort_order: tail + 10,
      source: 'user',
      created_by: user.id,
      updated_by: user.id,
    });
    if (error) throw error;
    qc.invalidateQueries({ queryKey });
  };

  const toggleComplete = async (item: DailyRundownItem) => {
    if (!user) return;
    const { error } = await supabase
      .from('daily_rundown_items')
      .update({
        status: item.status === 'complete' ? 'pending' : 'complete',
        updated_by: user.id,
      })
      .eq('id', item.id);
    if (error) throw error;
    qc.invalidateQueries({ queryKey });
  };

  const deleteItem = async (id: string) => {
    const { error } = await supabase.from('daily_rundown_items').delete().eq('id', id);
    if (error) throw error;
    qc.invalidateQueries({ queryKey });
  };

  return { ...query, canUse: enabled, addItem, toggleComplete, deleteItem };
}