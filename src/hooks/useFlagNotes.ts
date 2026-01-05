import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface FlagNote {
  id: string;
  deal_id: string;
  note: string;
  user_id: string | null;
  created_at: string;
}

export function useFlagNotes(dealId: string | null) {
  const [flagNotes, setFlagNotes] = useState<FlagNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  const fetchFlagNotes = useCallback(async () => {
    if (!dealId) {
      setFlagNotes([]);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('deal_flag_notes' as any)
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFlagNotes((data as unknown as FlagNote[]) || []);
    } catch (error) {
      console.error('Error fetching flag notes:', error);
    } finally {
      setIsLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    fetchFlagNotes();
  }, [fetchFlagNotes]);

  const addFlagNote = useCallback(async (note: string) => {
    if (!dealId || !note.trim() || !user) return;

    try {
      const { error } = await supabase
        .from('deal_flag_notes' as any)
        .insert({
          deal_id: dealId,
          note: note.trim(),
          user_id: user.id,
        });

      if (error) throw error;
      await fetchFlagNotes();
    } catch (error) {
      console.error('Error adding flag note:', error);
    }
  }, [dealId, user, fetchFlagNotes]);

  const deleteFlagNote = useCallback(async (noteId: string) => {
    try {
      const { error } = await supabase
        .from('deal_flag_notes' as any)
        .delete()
        .eq('id', noteId);

      if (error) throw error;
      setFlagNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (error) {
      console.error('Error deleting flag note:', error);
    }
  }, []);

  return {
    flagNotes,
    isLoading,
    addFlagNote,
    deleteFlagNote,
  };
}
