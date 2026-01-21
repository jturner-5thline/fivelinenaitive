import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface StatusNote {
  id: string;
  deal_id: string;
  note: string;
  created_at: string;
}

export function useStatusNotes(dealId: string | undefined) {
  const { user } = useAuth();
  const [statusNotes, setStatusNotes] = useState<StatusNote[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch status notes for the deal
  const fetchStatusNotes = useCallback(async () => {
    if (!dealId || !user) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('deal_status_notes')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setStatusNotes(data || []);
    } catch (error) {
      console.error('Error fetching status notes:', error);
    } finally {
      setIsLoading(false);
    }
  }, [dealId, user]);

  // Add a new status note
  const addStatusNote = useCallback(async (note: string) => {
    if (!dealId || !user || !note.trim()) return null;
    
    try {
      const { data, error } = await supabase
        .from('deal_status_notes')
        .insert({
          deal_id: dealId,
          user_id: user.id,
          note: note.trim(),
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Add to local state
      setStatusNotes(prev => [data, ...prev]);
      return data;
    } catch (error) {
      console.error('Error adding status note:', error);
      return null;
    }
  }, [dealId, user]);

  // Delete a status note
  const deleteStatusNote = useCallback(async (noteId: string) => {
    try {
      const { error } = await supabase
        .from('deal_status_notes')
        .delete()
        .eq('id', noteId);
      
      if (error) throw error;
      
      // Remove from local state
      setStatusNotes(prev => prev.filter(n => n.id !== noteId));
      return true;
    } catch (error) {
      console.error('Error deleting status note:', error);
      return false;
    }
  }, []);

  // Fetch on mount and subscribe to realtime changes
  useEffect(() => {
    fetchStatusNotes();

    // Subscribe to realtime changes for this deal's status notes
    if (dealId) {
      const channel = supabase
        .channel(`deal-status-notes-${dealId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'deal_status_notes',
            filter: `deal_id=eq.${dealId}`,
          },
          (payload) => {
            console.log('[Realtime] Status note change for deal:', dealId, payload.eventType);
            fetchStatusNotes();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [fetchStatusNotes, dealId]);

  return {
    statusNotes,
    isLoading,
    addStatusNote,
    deleteStatusNote,
    refetch: fetchStatusNotes,
  };
}
