import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { isDemoEmail } from '@/lib/demoLenderContact';
import { buildDemoSeedNotes, isDemoSeedNoteId } from '@/lib/demoDealSeedContent';

export interface DealSpaceNote {
  id: string;
  deal_id: string;
  title: string;
  content: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  is_pinned: boolean;
  folder: string | null;
  tags: string[];
  position: number;
  linked_lender_id: string | null;
  is_shared: boolean;
  template_name: string | null;
}

export interface NoteVersion {
  id: string;
  note_id: string;
  content: string;
  title: string;
  user_id: string;
  created_at: string;
}

export interface NoteComment {
  id: string;
  note_id: string;
  user_id: string;
  content: string;
  quote_text: string | null;
  resolved: boolean;
  resolved_by: string | null;
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
        .order('is_pinned', { ascending: false })
        .order('updated_at', { ascending: false });
      if (error) throw error;
      const rows = (data as DealSpaceNote[]) || [];
      // Demo-only: when no real notes exist, render seeded synthetic
      // notes so the section never appears empty during demos. These
      // are visual placeholders only — never written to the database.
      if (rows.length === 0 && isDemoEmail(user.email)) {
        setNotes(buildDemoSeedNotes(dealId));
      } else {
        setNotes(rows);
      }
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

  const createNote = useCallback(async (title?: string, templateContent?: string) => {
    if (!dealId || !user) return null;
    try {
      const { data, error } = await supabase
        .from('deal_space_notes')
        .insert({
          deal_id: dealId,
          user_id: user.id,
          title: title || 'Untitled Note',
          content: templateContent || '',
        })
        .select()
        .single();
      if (error) throw error;
      const note = data as DealSpaceNote;
      // Drop seeded demo placeholders the moment a real note exists.
      setNotes(prev => [note, ...prev.filter(n => !isDemoSeedNoteId(n.id))]);
      return note;
    } catch (error) {
      console.error('Error creating note:', error);
      toast({ title: 'Failed to create note', variant: 'destructive' });
      return null;
    }
  }, [dealId, user]);

  const updateNote = useCallback(async (noteId: string, updates: Partial<Pick<DealSpaceNote, 'title' | 'content' | 'is_pinned' | 'folder' | 'tags' | 'position' | 'linked_lender_id' | 'is_shared'>>) => {
    // Seeded demo notes are visual-only — mutate local state, never DB.
    if (isDemoSeedNoteId(noteId)) {
      setNotes(prev => prev.map(n => n.id === noteId ? { ...n, ...updates, updated_at: new Date().toISOString() } : n));
      return;
    }
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
    if (isDemoSeedNoteId(noteId)) {
      setNotes(prev => prev.filter(n => n.id !== noteId));
      toast({ title: 'Note deleted' });
      return;
    }
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

  // Version history
  const fetchVersions = useCallback(async (noteId: string) => {
    const { data, error } = await supabase
      .from('deal_space_note_versions')
      .select('*')
      .eq('note_id', noteId)
      .order('created_at', { ascending: false });
    if (error) { console.error(error); return []; }
    return (data as NoteVersion[]) || [];
  }, []);

  const restoreVersion = useCallback(async (noteId: string, version: NoteVersion) => {
    await updateNote(noteId, { content: version.content, title: version.title });
    toast({ title: 'Version restored' });
  }, [updateNote]);

  // Comments
  const fetchComments = useCallback(async (noteId: string) => {
    const { data, error } = await supabase
      .from('deal_space_note_comments')
      .select('*')
      .eq('note_id', noteId)
      .order('created_at', { ascending: true });
    if (error) { console.error(error); return []; }
    return (data as NoteComment[]) || [];
  }, []);

  const addComment = useCallback(async (noteId: string, content: string, quoteText?: string) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from('deal_space_note_comments')
      .insert({ note_id: noteId, user_id: user.id, content, quote_text: quoteText || null })
      .select()
      .single();
    if (error) { console.error(error); toast({ title: 'Failed to add comment', variant: 'destructive' }); return null; }
    return data as NoteComment;
  }, [user]);

  const resolveComment = useCallback(async (commentId: string) => {
    if (!user) return;
    await supabase
      .from('deal_space_note_comments')
      .update({ resolved: true, resolved_by: user.id })
      .eq('id', commentId);
  }, [user]);

  const deleteComment = useCallback(async (commentId: string) => {
    await supabase.from('deal_space_note_comments').delete().eq('id', commentId);
  }, []);

  return {
    notes, isLoading, createNote, updateNote, deleteNote, refetch: fetchNotes,
    fetchVersions, restoreVersion,
    fetchComments, addComment, resolveComment, deleteComment,
  };
}
