import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { notifyDealFlagged } from '@/utils/notifyDealFlagged';
import { toast } from 'sonner';

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
      const trimmed = note.trim();
      const { error } = await supabase
        .from('deal_flag_notes')
        .insert({
          deal_id: dealId,
          note: trimmed,
          user_id: user.id,
          resolved: false,
        });

      if (error) {
        // RLS rejection is the most common failure here (flagging a deal the
        // user has no access to). Surface it so users don't get a silent no-op.
        const isRls = /row-level security|violates row-level|permission denied/i.test(error.message || '');
        toast.error(
          isRls
            ? "You don't have permission to flag this deal."
            : `Couldn't add flag: ${error.message}`,
        );
        throw error;
      }
      await fetchFlagNotes();

      // Fire the deal_flagged notification. Recipient resolution + dispatch
      // happens server-side in `notification-engine`. Best-effort — failure
      // here must not break the flag insert above.
      try {
        const { data: dealRow } = await supabase
          .from('deals')
          .select('company, company_id, is_flagged')
          .eq('id', dealId)
          .maybeSingle();

        // Keep legacy is_flagged column in sync so list/kanban surfaces show the flag too.
        if (dealRow && dealRow.is_flagged !== true) {
          await supabase
            .from('deals')
            .update({ is_flagged: true })
            .eq('id', dealId);
        }

        await notifyDealFlagged({
          dealId,
          dealName: dealRow?.company || 'this deal',
          actorUserId: user.id,
          flagNote: trimmed,
          companyId: (dealRow as any)?.company_id ?? null,
        });
      } catch (notifyErr) {
        console.error('Error sending deal_flagged notification:', notifyErr);
      }
    } catch (error) {
      console.error('Error adding flag note:', error);
    }
  }, [dealId, user, fetchFlagNotes]);

  // Clear the legacy `deals.is_flagged` boolean when no active flag notes
  // remain. Without this the pipeline tile keeps showing flagged even after
  // every flag has been resolved or deleted, because the tile still trusts
  // the boolean as a fallback seed.
  const syncLegacyFlagBoolean = useCallback(async () => {
    if (!dealId) return;
    try {
      await supabase
        .from('deals')
        .update({ is_flagged: false })
        .eq('id', dealId);
    } catch (err) {
      console.error('Error clearing legacy is_flagged:', err);
    }
  }, [dealId]);

  const resolveFlagNote = useCallback(async (noteId: string) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('deal_flag_notes')
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
        })
        .eq('id', noteId);

      if (error) throw error;
      const next = flagNotes.map(n => n.id === noteId ? { ...n, resolved: true, resolved_at: new Date().toISOString(), resolved_by: user.id } : n);
      setFlagNotes(next);
      if (next.filter(n => !n.resolved).length === 0) {
        await syncLegacyFlagBoolean();
      }
    } catch (error) {
      console.error('Error resolving flag note:', error);
    }
  }, [user, flagNotes, syncLegacyFlagBoolean]);

  const deleteFlagNote = useCallback(async (noteId: string) => {
    try {
      const { error } = await supabase
        .from('deal_flag_notes')
        .delete()
        .eq('id', noteId);

      if (error) throw error;
      const next = flagNotes.filter(n => n.id !== noteId);
      setFlagNotes(next);
      if (next.filter(n => !n.resolved).length === 0) {
        await syncLegacyFlagBoolean();
      }
    } catch (error) {
      console.error('Error deleting flag note:', error);
    }
  }, [flagNotes, syncLegacyFlagBoolean]);

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
