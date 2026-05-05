import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  AdvanceReason,
  AdvanceReasonCategory,
} from '@/types/deal';
import { toast } from 'sonner';

interface DbRow {
  id: string;
  deal_id: string;
  reason_category: AdvanceReasonCategory;
  reason_notes: string | null;
  created_at: string;
  created_by: string | null;
}

function mapRow(r: DbRow): AdvanceReason {
  return {
    id: r.id,
    dealId: r.deal_id,
    category: r.reason_category,
    notes: r.reason_notes,
    createdAt: r.created_at,
    createdBy: r.created_by,
  };
}

/**
 * Mirrors the (planned) useBlockerReasons hook. Fetches "Why Moving Forward"
 * advance reasons for a deal, plus a workspace-wide fetch helper used by the
 * Weekly Execution Pulse dashboard card.
 */
export function useAdvanceReasons(dealId?: string) {
  const [reasons, setReasons] = useState<AdvanceReason[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchForDeal = useCallback(async () => {
    if (!dealId) {
      setReasons([]);
      return;
    }
    setIsLoading(true);
    const { data, error } = await supabase
      .from('deal_advance_reasons' as any)
      .select('*')
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[useAdvanceReasons] fetch error', error);
      toast.error('Failed to load advance reasons');
    } else {
      setReasons(((data as unknown) as DbRow[]).map(mapRow));
    }
    setIsLoading(false);
  }, [dealId]);

  useEffect(() => {
    fetchForDeal();
  }, [fetchForDeal]);

  const addReason = useCallback(
    async (input: { category: AdvanceReasonCategory; notes?: string }) => {
      if (!dealId) return null;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Sign in required');
        return null;
      }
      const { data, error } = await supabase
        .from('deal_advance_reasons' as any)
        .insert({
          deal_id: dealId,
          reason_category: input.category,
          reason_notes: input.notes?.trim() || null,
          created_by: user.id,
        })
        .select()
        .single();
      if (error) {
        console.error('[useAdvanceReasons] insert error', error);
        toast.error('Failed to log advance reason');
        return null;
      }
      const mapped = mapRow((data as unknown) as DbRow);
      setReasons((prev) => [mapped, ...prev]);
      toast.success('Advance reason logged');
      return mapped;
    },
    [dealId],
  );

  const deleteReason = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('deal_advance_reasons' as any)
      .delete()
      .eq('id', id);
    if (error) {
      toast.error('Failed to remove advance reason');
      return;
    }
    setReasons((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return {
    reasons,
    isLoading,
    addReason,
    deleteReason,
    refetch: fetchForDeal,
  };
}

/**
 * Workspace-wide list (used by the Weekly Execution Pulse dashboard card).
 * Returns rows from the last 14 days so the card can compute current vs
 * prior-week deltas without an extra round-trip.
 */
export function useWorkspaceAdvanceReasons() {
  const [rows, setRows] = useState<AdvanceReason[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('deal_advance_reasons' as any)
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false });
    if (!error && data) {
      setRows(((data as unknown) as DbRow[]).map(mapRow));
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { rows, isLoading, refetch: fetchAll };
}