import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface FlagNote {
  id: string;
  deal_id: string;
  note: string;
  user_id: string | null;
  created_at: string;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
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
        .from('deal_flag_notes')
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

  const activeFlags = flagNotes.filter(n => !n.resolved);
  const resolvedFlags = flagNotes.filter(n => n.resolved);

  const addFlagNote = useCallback(async (note: string) => {
    if (!dealId || !note.trim() || !user) return;

    try {
      const { error } = await supabase
        .from('deal_flag_notes' as any)
        .insert({
          deal_id: dealId,
          note: note.trim(),
          user_id: user.id,
          resolved: false,
        });

      if (error) throw error;
      await fetchFlagNotes();
    } catch (error) {
      console.error('Error adding flag note:', error);
    }
  }, [dealId, user, fetchFlagNotes]);

  const resolveFlagNote = useCallback(async (noteId: string) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('deal_flag_notes' as any)
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
        })
        .eq('id', noteId);

      if (error) throw error;
      setFlagNotes(prev => prev.map(n => n.id === noteId ? { ...n, resolved: true, resolved_at: new Date().toISOString(), resolved_by: user.id } : n));
    } catch (error) {
      console.error('Error resolving flag note:', error);
    }
  }, [user]);

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
    activeFlags,
    resolvedFlags,
    isLoading,
    addFlagNote,
    resolveFlagNote,
    deleteFlagNote,
    refetch: fetchFlagNotes,
  };
}
