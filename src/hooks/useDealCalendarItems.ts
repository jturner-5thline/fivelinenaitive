import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type DealCalendarItemType = 'meeting' | 'deadline' | 'reminder' | 'note';

export interface DealCalendarItem {
  id: string;
  deal_id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM:SS
  notes: string | null;
  type: DealCalendarItemType;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const qk = (dealId: string) => ['deal-calendar-items', dealId];
const ck = (dealId: string) => ['deal-calendar-item-creators', dealId];

export interface DealCalendarCreator {
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

export function useDealCalendarItems(dealId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: qk(dealId || 'none'),
    enabled: !!dealId,
    staleTime: 30_000,
    queryFn: async (): Promise<DealCalendarItem[]> => {
      const { data, error } = await supabase
        .from('deal_calendar_items')
        .select('*')
        .eq('deal_id', dealId!)
        .order('date', { ascending: true });
      if (error) throw error;
      return (data || []) as DealCalendarItem[];
    },
  });

  // Fetch creator profiles for the items so the UI can show "added by" chips.
  const creatorIds = Array.from(new Set((query.data || []).map((i) => i.created_by).filter(Boolean)));
  const creatorsQuery = useQuery({
    queryKey: [...ck(dealId || 'none'), creatorIds.sort().join(',')],
    enabled: !!dealId && creatorIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, DealCalendarCreator>> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, display_name, first_name, last_name, avatar_url')
        .in('user_id', creatorIds);
      if (error) throw error;
      const map: Record<string, DealCalendarCreator> = {};
      for (const p of (data || []) as DealCalendarCreator[]) map[p.user_id] = p;
      return map;
    },
  });

  // Realtime
  useEffect(() => {
    if (!dealId) return;
    const channel = supabase
      .channel(`deal-calendar-items-${dealId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'deal_calendar_items', filter: `deal_id=eq.${dealId}` },
        () => queryClient.invalidateQueries({ queryKey: qk(dealId) }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [dealId, queryClient]);

  const addItem = useMutation({
    mutationFn: async (input: { title: string; date: string; time?: string | null; notes?: string | null; type: DealCalendarItemType }) => {
      if (!user || !dealId) throw new Error('Not ready');
      const { data, error } = await supabase
        .from('deal_calendar_items')
        .insert({
          deal_id: dealId,
          title: input.title,
          date: input.date,
          time: input.time || null,
          notes: input.notes || null,
          type: input.type,
          created_by: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data as DealCalendarItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk(dealId!) });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to add calendar item'),
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Pick<DealCalendarItem, 'title' | 'date' | 'time' | 'notes' | 'type'>> }) => {
      const { error } = await supabase.from('deal_calendar_items').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk(dealId!) }),
    onError: (e: any) => toast.error(e?.message || 'Failed to update item'),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('deal_calendar_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk(dealId!) }),
    onError: (e: any) => toast.error(e?.message || 'Failed to delete item'),
  });

  return {
    items: query.data || [],
    creators: creatorsQuery.data || {},
    isLoading: query.isLoading,
    addItem: addItem.mutateAsync,
    updateItem: updateItem.mutateAsync,
    deleteItem: deleteItem.mutateAsync,
  };
}