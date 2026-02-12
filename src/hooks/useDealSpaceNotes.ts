import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

export interface DealSpaceNote {
  id: string;
  deal_id: string;
  title: string;
  content: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export function useDealSpaceNotes(dealId: string | undefined) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<DealSpaceNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNotes = useCallback(async () => {
    if (!dealId || !user) return;
    try {
      const { data, error } = await supabase
        .from('deal_space_notes')
        .select('*')
        .eq('deal_id', dealId)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setNotes(data || []);
    } catch (error) {
      console.error('Error fetching notes:', error);
    } finally {
      setIsLoading(false);
    }
  }, [dealId, user]);

  useEffect(() => {
    fetchNotes();

    if (dealId) {
      const channel = supabase
        .channel(`deal-space-notes-${dealId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'deal_space_notes',
          filter: `deal_id=eq.${dealId}`,
        }, () => {
          fetchNotes();
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [fetchNotes, dealId]);

  const createNote = useCallback(async (title?: string) => {
    if (!dealId || !user) return null;
    try {
      const { data, error } = await supabase
        .from('deal_space_notes')
        .insert({
          deal_id: dealId,
          user_id: user.id,
          title: title || 'Untitled Note',
          content: '',
        })
        .select()
        .single();
      if (error) throw error;
      setNotes(prev => [data, ...prev]);
      return data;
    } catch (error) {
      console.error('Error creating note:', error);
      toast({ title: 'Failed to create note', variant: 'destructive' });
      return null;
    }
  }, [dealId, user]);

  const updateNote = useCallback(async (noteId: string, updates: { title?: string; content?: string }) => {
    try {
      const { error } = await supabase
        .from('deal_space_notes')
        .update(updates)
        .eq('id', noteId);
      if (error) throw error;
      setNotes(prev => prev.map(n => n.id === noteId ? { ...n, ...updates, updated_at: new Date().toISOString() } : n));
    } catch (error) {
      console.error('Error updating note:', error);
      toast({ title: 'Failed to save note', variant: 'destructive' });
    }
  }, []);

  const deleteNote = useCallback(async (noteId: string) => {
    try {
      const { error } = await supabase
        .from('deal_space_notes')
        .delete()
        .eq('id', noteId);
      if (error) throw error;
      setNotes(prev => prev.filter(n => n.id !== noteId));
      toast({ title: 'Note deleted' });
    } catch (error) {
      console.error('Error deleting note:', error);
      toast({ title: 'Failed to delete note', variant: 'destructive' });
    }
  }, []);

  return { notes, isLoading, createNote, updateNote, deleteNote, refetch: fetchNotes };
}
