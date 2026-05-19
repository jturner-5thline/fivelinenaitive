import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isDemoEmail, withDemoLenderContact } from '@/lib/demoLenderContact';
import { toast } from 'sonner';
import { extractFlexSyncErrorPayload } from '@/utils/flexSyncError';

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
  contact_phone?: string | null;
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
  tier?: string | null;
  active?: boolean | null;
  flex_lender_id?: string | null;
  last_synced_from_flex?: string | null;
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
  contact_phone?: string | null;
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
  tier?: string | null;
  active?: boolean | null;
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
  /** Server-side search query (searches name, contact_name, email, lender_type, geo) */
  searchQuery?: string;

  /**
   * When mode='all' and there's no search query, load the remaining lenders immediately
   * (instead of waiting for requestIdleCallback). Useful for pages that must reliably
   * operate on the complete lender list (e.g., cross-referencing deal activity).
   */
  eagerAll?: boolean;
}

// Simple in-memory cache to avoid redundant fetches across components
let cachedLenders: MasterLender[] | null = null;
let cacheUserId: string | null = null;
let cachePromise: Promise<MasterLender[]> | null = null;

export function useMasterLenders(options: UseMasterLendersOptions = {}) {
  const { user } = useAuth();
  const isDemo = isDemoEmail(user?.email);

  const mode = options.mode ?? 'all';
  const pageSize = options.pageSize ?? 100;
  const orderColumn = options.orderBy?.column ?? 'name';
  const orderAscending = options.orderBy?.ascending ?? true;
  const searchQuery = options.searchQuery?.trim() ?? '';
  const eagerAll = options.eagerAll ?? false;

  const [lenders, setLenders] = useState<MasterLender[]>(() => {
    // Initialize from cache if available and same user
    if (mode === 'all' && !searchQuery && cachedLenders && cacheUserId === user?.id) {
      return cachedLenders;
    }
    return [];
  });
  const [loading, setLoading] = useState(() => {
    // Skip loading state if cache is warm
    if (mode === 'all' && !searchQuery && cachedLenders && cacheUserId === user?.id) {
      return false;
    }
    return true;
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const backgroundLoadIdRef = useRef(0);

  const fetchPage = useCallback(
    async (pageIndex: number, withCount = false, query = '') => {
      const from = pageIndex * pageSize;
      const to = from + pageSize - 1;

      // When there's a search query, use simple ilike filters
      if (query) {
        const pattern = `%${query}%`;
        let builder = supabase
          .from('master_lenders')
          .select('*', withCount ? { count: 'exact' } : { count: 'exact' })
          .or(`name.ilike.${pattern},contact_name.ilike.${pattern},email.ilike.${pattern},lender_type.ilike.${pattern},geo.ilike.${pattern},tier.ilike.${pattern},relationship_owners.ilike.${pattern}`)
          .order(orderColumn, { ascending: orderAscending })
          .range(from, to);

        const { data, error: fetchError, count } = await builder;

        return {
          data: ((data as MasterLender[] | null) ?? null)?.map((l) => withDemoLenderContact(l, isDemo)) ?? null,
          error: fetchError,
          count: typeof count === 'number' ? count : null,
        };
      }

      // No search query: standard paginated fetch
      let builder = supabase
        .from('master_lenders')
        .select('*', withCount ? { count: 'exact' } : undefined);

      builder = builder.order(orderColumn, { ascending: orderAscending }).range(from, to);

      const { data, error: fetchError, count } = await builder;

      return {
        data: ((data as MasterLender[] | null) ?? null)?.map((l) => withDemoLenderContact(l, isDemo)) ?? null,
        error: fetchError,
        count: typeof count === 'number' ? count : null,
      };
    },
    [orderAscending, orderColumn, pageSize, isDemo]
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

      // Cancel any in-flight background load from a previous fetch
      const loadId = ++backgroundLoadIdRef.current;

      const { data: initialData, error: initialError, count } = await fetchPage(0, true, searchQuery);
      if (initialError) throw initialError;

      // If another fetchLenders was triggered while we were awaiting, bail out
      if (loadId !== backgroundLoadIdRef.current) return;

      const firstPage = initialData ?? [];
      setLenders(firstPage);
      if (mode === 'all' && !searchQuery) {
        cachedLenders = firstPage;
        cacheUserId = user.id;
      }
      setTotalCount(count);
      setHasMore(count != null ? firstPage.length < count : firstPage.length === pageSize);
      setLoading(false);
      setError(null);

       // In "all" mode AND no search query, continue loading the remainder in the background.
      // When searching, we always stay in paged mode to avoid loading too much data.
      if (mode === 'all' && !searchQuery && (count == null ? firstPage.length === pageSize : firstPage.length < count)) {
        setLoadingMore(true);

        const loadRemaining = async () => {
          const remainingLenders: MasterLender[] = [];
          // Smaller background pages so the directory list grows visibly and
          // the UI thread gets to flush rows/handlers between fetches.
          const backgroundPageSize = 500;
          let offset = firstPage.length;
          let keepGoing = true;

          while (keepGoing) {
            // Check if this background load has been superseded
            if (loadId !== backgroundLoadIdRef.current) return;

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

            // Check again after await
            if (loadId !== backgroundLoadIdRef.current) return;

            const batch = (data as MasterLender[] | null) ?? [];
            if (batch.length > 0) {
              const mapped = batch.map((l) => withDemoLenderContact(l, isDemo));
              remainingLenders.push(...mapped);
              offset += batch.length;
              keepGoing = batch.length === backgroundPageSize;
              // Stream each batch into the visible list so users see rows
              // appear progressively instead of one giant jump at the end.
              setLenders((prev) => {
                const merged = [...prev, ...mapped];
                cachedLenders = merged;
                cacheUserId = user.id;
                return merged;
              });
            } else {
              keepGoing = false;
            }
          }

          // Final check before updating state
          if (loadId !== backgroundLoadIdRef.current) return;

          setLoadingMore(false);
          setHasMore(false);
        };

         // Defer background loading so we don't block interactions.
         // Some screens need the full dataset ASAP (e.g., filters that must include *all* lenders).
         if (eagerAll) {
           setTimeout(loadRemaining, 0);
         } else if ('requestIdleCallback' in window) {
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
  }, [eagerAll, fetchPage, mode, pageSize, orderAscending, orderColumn, searchQuery, user]);

  useEffect(() => {
    fetchLenders();
  }, [fetchLenders]);

  const loadMore = useCallback(async () => {
    // Allow loadMore even in 'all' mode when searching (search forces paged behavior)
    if (mode !== 'paged' && !searchQuery) return;
    if (!user) return;
    if (loadingMore || !hasMore) return;

    try {
      setLoadingMore(true);
      const nextPage = page + 1;

      const { data, error: moreError } = await fetchPage(nextPage, false, searchQuery);
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
  }, [fetchPage, hasMore, lenders.length, loadingMore, mode, page, pageSize, searchQuery, totalCount, user]);

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

  const syncLenderToFlex = async (lenderId: string): Promise<void> => {
    try {
      const { data, error } = await supabase.functions.invoke('sync-lender-to-flex', {
        body: { lender_id: lenderId },
      });

      // Normalize payload regardless of HTTP status (some expected business cases now return 200).
      const payload = extractFlexSyncErrorPayload({ data, error });
      if (payload?.code === 'LENDER_NOT_REGISTERED') {
        // Expected business case: don't surface as a runtime error.
        toast.warning(`${payload.lender_name || 'This lender'} is not registered in FLEx`, {
          description: payload.message || 'They need to create an account in FLEx before syncing.',
        });
        console.info('Skipped FLEx sync (lender not registered):', {
          lenderId,
          lenderName: payload.lender_name,
          lenderEmail: payload.lender_email,
        });
        return;
      }

      if (error) {
        console.error('Failed to sync lender to Flex:', error);
        return;
      }

      console.log(`Lender ${lenderId} synced to Flex`);
    } catch (err) {
      console.error('Error syncing lender to Flex:', err);
    }
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
        if (orderColumn === 'name') {
          next.sort((a, b) => (orderAscending ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)));
        }
        cachedLenders = next;
        return next;
      });

      // If we know the total count, increment it.
      setTotalCount((prev) => (typeof prev === 'number' ? prev + 1 : prev));

      // Auto-sync to Flex (fire and forget)
      syncLenderToFlex(data.id);

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

      // Auto-sync to Flex (fire and forget)
      syncLenderToFlex(id);

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

      // Update local state immutably - create new array with updated primary and without merged entries
      setLenders((prev) => {
        return prev
          .filter((l) => !mergeIds.includes(l.id))
          .map((l) => (l.id === keepId ? { ...l, ...mergedData, updated_at: new Date().toISOString() } : l));
      });

      setTotalCount((prev) => (typeof prev === 'number' ? Math.max(0, prev - mergeIds.length) : prev));
      
      // Force a refetch to ensure UI is fully in sync with database
      // Use setTimeout to allow state updates to settle first
      setTimeout(() => {
        fetchLenders();
      }, 100);
      
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
