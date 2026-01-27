import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

export interface DealMemo {
  id: string;
  deal_id: string;
  narrative: string | null;
  highlights: string | null;
  hurdles: string | null;
  lender_notes: string | null;
  analyst_notes: string | null;
  other_notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export function useDealMemo(dealId: string | undefined) {
  const { user } = useAuth();
  const [memo, setMemo] = useState<DealMemo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchMemo = useCallback(async () => {
    if (!dealId) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('deal_memos')
        .select('*')
        .eq('deal_id', dealId)
        .maybeSingle();

      if (error) throw error;
      setMemo(data);
    } catch (error) {
      console.error('Error fetching memo:', error);
    } finally {
      setIsLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    fetchMemo();
  }, [fetchMemo]);

  const saveMemo = useCallback(async (updates: Partial<Omit<DealMemo, 'id' | 'deal_id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'>>) => {
    if (!dealId || !user) return;

    setIsSaving(true);
    try {
      if (memo) {
        // Update existing memo
        const { error } = await supabase
          .from('deal_memos')
          .update({
            ...updates,
            updated_by: user.id,
          })
          .eq('id', memo.id);

        if (error) throw error;
      } else {
        // Create new memo
        const { error } = await supabase
          .from('deal_memos')
          .insert({
            deal_id: dealId,
            ...updates,
            created_by: user.id,
            updated_by: user.id,
          });

        if (error) throw error;
      }

      await fetchMemo();
      toast({ title: 'Saved', description: 'Memo updated successfully' });
    } catch (error) {
      console.error('Error saving memo:', error);
      toast({
        title: 'Error',
        description: 'Failed to save memo',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }, [dealId, user, memo, fetchMemo]);

  return {
    memo,
    isLoading,
    isSaving,
    saveMemo,
    refetch: fetchMemo,
  };
}
