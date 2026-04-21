import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type PendingSuggestionStatus = 'pending' | 'confirmed' | 'dismissed';

export interface PendingDealSuggestionPayload {
  email: string;
  domain: string;
  inferredName: string;
  contextSnippet: string;
  proposedNote: string;
  detectedAt: string;
  /** When confirming, the user may edit these fields. */
  contactName?: string;
}

export interface PendingDealSuggestion {
  id: string;
  deal_id: string;
  company_id: string;
  user_id: string;
  suggestion_type: string;
  status: PendingSuggestionStatus | string;
  payload: PendingDealSuggestionPayload;
  source_thread_id: string | null;
  source_thread_subject: string | null;
  confirmed_at: string | null;
  confirmed_note_id: string | null;
  dedup_key: string | null;
  created_at: string;
  updated_at: string;
}

interface CreateInput {
  dealId: string;
  companyId: string;
  payload: PendingDealSuggestionPayload;
  sourceThreadId: string | null;
  sourceThreadSubject: string | null;
  dedupKey: string;
}

/**
 * Pending suggestion queue for confirm-first deal-space writes.
 *
 * Filter is by deal so the AI Assist sidebar can render the cards
 * scoped to the email's resolved deal.
 */
export function usePendingDealSuggestions(dealId?: string) {
  const { user } = useAuth();
  const [suggestions, setSuggestions] = useState<PendingDealSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!user || !dealId) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('pending_deal_suggestions')
        .select('*')
        .eq('deal_id', dealId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setSuggestions((data || []) as PendingDealSuggestion[]);
    } catch (err) {
      console.error('[pending-suggestions] fetch error', err);
    } finally {
      setLoading(false);
    }
  }, [user, dealId]);

  useEffect(() => {
    fetchAll();
    if (!dealId) return;
    const channel = supabase
      .channel(`pending-deal-suggestions-${dealId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pending_deal_suggestions',
          filter: `deal_id=eq.${dealId}`,
        },
        () => fetchAll(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAll, dealId]);

  const create = useCallback(async (input: CreateInput): Promise<PendingDealSuggestion | null> => {
    if (!user) return null;
    try {
      const { data, error } = await (supabase as any)
        .from('pending_deal_suggestions')
        .insert({
          deal_id: input.dealId,
          company_id: input.companyId,
          user_id: user.id,
          suggestion_type: 'contact_email_from_draft',
          status: 'pending',
          payload: input.payload,
          source_thread_id: input.sourceThreadId,
          source_thread_subject: input.sourceThreadSubject,
          dedup_key: input.dedupKey,
        })
        .select()
        .single();
      if (error) {
        // Unique-violation on dedup_key → suggestion already pending; not an error.
        if ((error as any).code === '23505') return null;
        throw error;
      }
      return data as PendingDealSuggestion;
    } catch (err) {
      console.error('[pending-suggestions] create error', err);
      return null;
    }
  }, [user]);

  const dismiss = useCallback(async (id: string) => {
    const { error } = await (supabase as any)
      .from('pending_deal_suggestions')
      .update({ status: 'dismissed' })
      .eq('id', id);
    if (error) console.error('[pending-suggestions] dismiss error', error);
  }, []);

  const confirm = useCallback(async (id: string, confirmedNoteId: string | null) => {
    const { error } = await (supabase as any)
      .from('pending_deal_suggestions')
      .update({
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        confirmed_note_id: confirmedNoteId,
      })
      .eq('id', id);
    if (error) console.error('[pending-suggestions] confirm error', error);
  }, []);

  const updatePayload = useCallback(async (id: string, payload: PendingDealSuggestionPayload) => {
    const { error } = await (supabase as any)
      .from('pending_deal_suggestions')
      .update({ payload })
      .eq('id', id);
    if (error) console.error('[pending-suggestions] update error', error);
  }, []);

  return { suggestions, loading, create, dismiss, confirm, updatePayload, refetch: fetchAll };
}