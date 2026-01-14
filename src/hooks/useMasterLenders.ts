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

export function useMasterLenders() {
  const { user } = useAuth();
  const [lenders, setLenders] = useState<MasterLender[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLenders = useCallback(async () => {
    if (!user) {
      setLenders([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // First, fetch initial batch quickly (first 100 lenders for fast UI)
      const initialPageSize = 100;
      const { data: initialData, error: initialError } = await supabase
        .from('master_lenders')
        .select('*')
        .order('name', { ascending: true })
        .range(0, initialPageSize - 1);

      if (initialError) throw initialError;
      
      // Show initial batch immediately for responsive UI
      setLenders(initialData || []);
      setLoading(false);
      
      // Then fetch remaining lenders in background without blocking UI
      if (initialData && initialData.length === initialPageSize) {
        setLoadingMore(true);
        
        // Use requestIdleCallback or setTimeout to not block main thread
        const loadRemaining = async () => {
          const remainingLenders: MasterLender[] = [];
          const pageSize = 1000;
          let page = 1; // Start from page 1 since we already have page 0
          let hasMore = true;
          
          // Collect all remaining lenders first without updating state
          while (hasMore) {
            const from = page * pageSize;
            const to = from + pageSize - 1;
            
            const { data, error: fetchError } = await supabase
              .from('master_lenders')
              .select('*')
              .order('name', { ascending: true })
              .range(from, to);

            if (fetchError) {
              console.error('Error fetching additional lenders:', fetchError);
              break;
            }
            
            if (data && data.length > 0) {
              remainingLenders.push(...data);
              hasMore = data.length === pageSize;
              page++;
            } else {
              hasMore = false;
            }
          }
          
          // Single state update with all lenders to prevent flickering
          if (remainingLenders.length > 0) {
            setLenders(prev => [...prev, ...remainingLenders]);
          }
          
          setLoadingMore(false);
        };
        
        // Defer background loading to not block initial render
        if ('requestIdleCallback' in window) {
          (window as any).requestIdleCallback(loadRemaining, { timeout: 1000 });
        } else {
          setTimeout(loadRemaining, 50);
        }
      }
      
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch lenders';
      setError(message);
      console.error('Error fetching master lenders:', err);
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchLenders();
  }, [fetchLenders]);

  const importLenders = async (lendersToImport: MasterLenderInsert[]): Promise<{ success: number; failed: number; errors: string[] }> => {
    if (!user) {
      return { success: 0, failed: lendersToImport.length, errors: ['Not authenticated'] };
    }

    const results = { success: 0, failed: 0, errors: [] as string[] };
    const batchSize = 100;

    for (let i = 0; i < lendersToImport.length; i += batchSize) {
      const batch = lendersToImport.slice(i, i + batchSize).map(lender => ({
        ...lender,
        user_id: user.id,
      }));

      const { error: insertError, data } = await supabase
        .from('master_lenders')
        .insert(batch)
        .select();

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
      
      setLenders(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add lender';
      toast.error(message);
      return null;
    }
  };

  const updateLender = async (id: string, updates: Partial<MasterLenderInsert>): Promise<boolean> => {
    try {
      const { error: updateError } = await supabase
        .from('master_lenders')
        .update(updates)
        .eq('id', id);

      if (updateError) throw updateError;

      setLenders(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update lender';
      toast.error(message);
      return false;
    }
  };

  const deleteLender = async (id: string): Promise<boolean> => {
    try {
      const { error: deleteError } = await supabase
        .from('master_lenders')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      setLenders(prev => prev.filter(l => l.id !== id));
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
      const { error: deleteError } = await supabase
        .from('master_lenders')
        .delete()
        .eq('user_id', user.id);

      if (deleteError) throw deleteError;

      setLenders([]);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to clear lenders';
      toast.error(message);
      return false;
    }
  };

  const mergeLenders = async (
    keepId: string, 
    mergeIds: string[], 
    mergedData: Partial<MasterLenderInsert>
  ): Promise<boolean> => {
    try {
      // Update the primary lender with merged data
      const { error: updateError } = await supabase
        .from('master_lenders')
        .update(mergedData)
        .eq('id', keepId);

      if (updateError) throw updateError;

      // Delete the duplicate lenders
      const { error: deleteError } = await supabase
        .from('master_lenders')
        .delete()
        .in('id', mergeIds);

      if (deleteError) throw deleteError;

      // Update local state
      setLenders(prev => {
        const updatedPrimary = prev.find(l => l.id === keepId);
        if (updatedPrimary) {
          Object.assign(updatedPrimary, mergedData);
        }
        return prev.filter(l => !mergeIds.includes(l.id));
      });

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
    error,
    fetchLenders,
    importLenders,
    addLender,
    updateLender,
    deleteLender,
    clearAllLenders,
    mergeLenders,
  };
}
