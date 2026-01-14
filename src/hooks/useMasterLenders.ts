import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface MasterLender {
  id: string;
  user_id: string;
  company_id?: string | null;
  email?: string | null;
  name: string;
  lender_type?: string | null;
  loan_types?: string[] | null;
  sub_debt?: string | null;
  cash_burn?: string | null;
  sponsorship?: string | null;
  min_revenue?: number | null;
  ebitda_min?: number | null;
  min_deal?: number | null;
  max_deal?: number | null;
  industries?: string[] | null;
  industries_to_avoid?: string[] | null;
  b2b_b2c?: string | null;
  refinancing?: string | null;
  company_requirements?: string | null;
  deal_structure_notes?: string | null;
  geo?: string | null;
  contact_name?: string | null;
  contact_title?: string | null;
  relationship_owners?: string | null;
  lender_one_pager_url?: string | null;
  referral_lender?: string | null;
  referral_fee_offered?: string | null;
  referral_agreement?: string | null;
  nda?: string | null;
  onboarded_to_flex?: string | null;
  upfront_checklist?: string | null;
  post_term_sheet_checklist?: string | null;
  gift_address?: string | null;
  external_created_by?: string | null;
  external_last_modified?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MasterLenderInsert {
  email?: string | null;
  name: string;
  lender_type?: string | null;
  loan_types?: string[] | null;
  sub_debt?: string | null;
  cash_burn?: string | null;
  sponsorship?: string | null;
  min_revenue?: number | null;
  ebitda_min?: number | null;
  min_deal?: number | null;
  max_deal?: number | null;
  industries?: string[] | null;
  industries_to_avoid?: string[] | null;
  b2b_b2c?: string | null;
  refinancing?: string | null;
  company_requirements?: string | null;
  deal_structure_notes?: string | null;
  geo?: string | null;
  contact_name?: string | null;
  contact_title?: string | null;
  relationship_owners?: string | null;
  lender_one_pager_url?: string | null;
  referral_lender?: string | null;
  referral_fee_offered?: string | null;
  referral_agreement?: string | null;
  nda?: string | null;
  onboarded_to_flex?: string | null;
  upfront_checklist?: string | null;
  post_term_sheet_checklist?: string | null;
  gift_address?: string | null;
  external_created_by?: string | null;
  external_last_modified?: string | null;
}

export type MasterLendersMode = 'all' | 'paged';

export interface UseMasterLendersOptions {
  /**
   * all: load everything (used in other parts of the app)
   * paged: load in pages and let the UI request more (used on /lenders to avoid jumping)
   */
  mode?: MasterLendersMode;
  /** Page size for initial + paged loading */
  pageSize?: number;
  /** Server-side ordering to keep paging stable */
  orderBy?: {
    column: 'name' | 'created_at' | 'updated_at';
    ascending: boolean;
  };
}

export function useMasterLenders(options: UseMasterLendersOptions = {}) {
  const { user } = useAuth();

  const mode = options.mode ?? 'all';
  const pageSize = options.pageSize ?? 100;
  const orderColumn = options.orderBy?.column ?? 'name';
  const orderAscending = options.orderBy?.ascending ?? true;

  const [lenders, setLenders] = useState<MasterLender[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (pageIndex: number, withCount = false) => {
      const from = pageIndex * pageSize;
      const to = from + pageSize - 1;

      const { data, error: fetchError, count } = await supabase
        .from('master_lenders')
        .select('*', withCount ? { count: 'exact' } : undefined)
        .order(orderColumn, { ascending: orderAscending })
        .range(from, to);

      return {
        data: (data as MasterLender[] | null) ?? null,
        error: fetchError,
        count: typeof count === 'number' ? count : null,
      };
    },
    [orderAscending, orderColumn, pageSize]
  );

  const fetchLenders = useCallback(async () => {
    if (!user) {
      setLenders([]);
      setLoading(false);
      setLoadingMore(false);
      setHasMore(false);
      setPage(0);
      setTotalCount(null);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setLoadingMore(false);
      setPage(0);
      setTotalCount(null);

      const { data: initialData, error: initialError, count } = await fetchPage(0, true);
      if (initialError) throw initialError;

      const firstPage = initialData ?? [];
      setLenders(firstPage);
      setTotalCount(count);
      setHasMore(count != null ? firstPage.length < count : firstPage.length === pageSize);
      setLoading(false);
      setError(null);

      // In "all" mode, continue loading the remainder in the background.
      if (mode === 'all' && (count == null ? firstPage.length === pageSize : firstPage.length < count)) {
        setLoadingMore(true);

        const loadRemaining = async () => {
          const remainingLenders: MasterLender[] = [];
          const backgroundPageSize = 1000;
          let offset = firstPage.length;
          let keepGoing = true;

          while (keepGoing) {
            const from = offset;
            const to = from + backgroundPageSize - 1;

            const { data, error: fetchError } = await supabase
              .from('master_lenders')
              .select('*')
              .order(orderColumn, { ascending: orderAscending })
              .range(from, to);

            if (fetchError) {
              console.error('Error fetching additional lenders:', fetchError);
              break;
            }

            const batch = (data as MasterLender[] | null) ?? [];
            if (batch.length > 0) {
              remainingLenders.push(...batch);
              offset += batch.length;
              keepGoing = batch.length === backgroundPageSize;
            } else {
              keepGoing = false;
            }
          }

          if (remainingLenders.length > 0) {
            setLenders((prev) => [...prev, ...remainingLenders]);
          }

          setLoadingMore(false);
          setHasMore(false);
        };

        // Defer background loading so we don't block interactions.
        if ('requestIdleCallback' in window) {
          (window as any).requestIdleCallback(loadRemaining, { timeout: 1000 });
        } else {
          setTimeout(loadRemaining, 50);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch lenders';
      setError(message);
      console.error('Error fetching master lenders:', err);
      setLoading(false);
      setLoadingMore(false);
      setHasMore(false);
    }
  }, [fetchPage, mode, pageSize, orderAscending, orderColumn, user]);

  useEffect(() => {
    fetchLenders();
  }, [fetchLenders]);

  const loadMore = useCallback(async () => {
    if (mode !== 'paged') return;
    if (!user) return;
    if (loadingMore || !hasMore) return;

    try {
      setLoadingMore(true);
      const nextPage = page + 1;

      const { data, error: moreError } = await fetchPage(nextPage, false);
      if (moreError) throw moreError;

      const batch = data ?? [];
      const nextLoaded = lenders.length + batch.length;

      setLenders((prev) => [...prev, ...batch]);
      setPage(nextPage);
      setHasMore(totalCount != null ? nextLoaded < totalCount : batch.length === pageSize);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load more lenders';
      setError(message);
      console.error('Error loading more lenders:', err);
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, hasMore, lenders.length, loadingMore, mode, page, pageSize, totalCount, user]);

  const importLenders = async (lendersToImport: MasterLenderInsert[]): Promise<{ success: number; failed: number; errors: string[] }> => {
    if (!user) {
      return { success: 0, failed: lendersToImport.length, errors: ['Not authenticated'] };
    }

    const results = { success: 0, failed: 0, errors: [] as string[] };
    const batchSize = 100;

    for (let i = 0; i < lendersToImport.length; i += batchSize) {
      const batch = lendersToImport.slice(i, i + batchSize).map((lender) => ({
        ...lender,
        user_id: user.id,
      }));

      const { error: insertError, data } = await supabase.from('master_lenders').insert(batch).select();

      if (insertError) {
        results.failed += batch.length;
        results.errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${insertError.message}`);
      } else {
        results.success += data?.length || 0;
      }
    }

    // Refresh the list after import
    await fetchLenders();
    return results;
  };

  const addLender = async (lender: MasterLenderInsert): Promise<MasterLender | null> => {
    if (!user) return null;

    try {
      const { data, error: insertError } = await supabase
        .from('master_lenders')
        .insert({ ...lender, user_id: user.id })
        .select()
        .single();

      if (insertError) throw insertError;

      setLenders((prev) => {
        const next = [...prev, data as MasterLender];
        // Keep paging order stable when we can.
        if (orderColumn === 'name') {
          next.sort((a, b) => (orderAscending ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)));
        }
        return next;
      });

      // If we know the total count, increment it.
      setTotalCount((prev) => (typeof prev === 'number' ? prev + 1 : prev));
      return data as MasterLender;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add lender';
      toast.error(message);
      return null;
    }
  };

  const updateLender = async (id: string, updates: Partial<MasterLenderInsert>): Promise<boolean> => {
    try {
      const { error: updateError } = await supabase.from('master_lenders').update(updates).eq('id', id);

      if (updateError) throw updateError;

      setLenders((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)));
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update lender';
      toast.error(message);
      return false;
    }
  };

  const deleteLender = async (id: string): Promise<boolean> => {
    try {
      const { error: deleteError } = await supabase.from('master_lenders').delete().eq('id', id);

      if (deleteError) throw deleteError;

      setLenders((prev) => prev.filter((l) => l.id !== id));
      setTotalCount((prev) => (typeof prev === 'number' ? Math.max(0, prev - 1) : prev));
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete lender';
      toast.error(message);
      return false;
    }
  };

  const clearAllLenders = async (): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error: deleteError } = await supabase.from('master_lenders').delete().eq('user_id', user.id);

      if (deleteError) throw deleteError;

      setLenders([]);
      setTotalCount(0);
      setHasMore(false);
      setPage(0);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to clear lenders';
      toast.error(message);
      return false;
    }
  };

  const mergeLenders = async (keepId: string, mergeIds: string[], mergedData: Partial<MasterLenderInsert>): Promise<boolean> => {
    try {
      // Update the primary lender with merged data
      const { error: updateError } = await supabase.from('master_lenders').update(mergedData).eq('id', keepId);

      if (updateError) throw updateError;

      // Delete the duplicate lenders
      const { error: deleteError } = await supabase.from('master_lenders').delete().in('id', mergeIds);

      if (deleteError) throw deleteError;

      // Update local state
      setLenders((prev) => {
        const updatedPrimary = prev.find((l) => l.id === keepId);
        if (updatedPrimary) {
          Object.assign(updatedPrimary, mergedData);
        }
        return prev.filter((l) => !mergeIds.includes(l.id));
      });

      setTotalCount((prev) => (typeof prev === 'number' ? Math.max(0, prev - mergeIds.length) : prev));
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to merge lenders';
      toast.error(message);
      return false;
    }
  };

  return {
    lenders,
    loading,
    loadingMore,
    hasMore,
    totalCount,
    error,
    fetchLenders,
    loadMore,
    importLenders,
    addLender,
    updateLender,
    deleteLender,
    clearAllLenders,
    mergeLenders,
  };
}
