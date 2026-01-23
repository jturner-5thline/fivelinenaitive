import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

export interface DealMatchingCriteria {
  cashBurnOk?: boolean;
  b2bB2c?: string;
  revenueType?: string;
  collateralAvailable?: string;
}

interface MatchingCriteriaRow {
  cash_burn_ok: boolean | null;
  b2b_b2c: string | null;
  revenue_type: string | null;
  collateral_available: string | null;
}

export function useDealMatchingCriteria(dealId: string | undefined) {
  const { user } = useAuth();
  const [criteria, setCriteria] = useState<DealMatchingCriteria>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchCriteria = useCallback(async () => {
    if (!dealId || !user) {
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('deal_writeups')
        .select('cash_burn_ok, b2b_b2c, revenue_type, collateral_available')
        .eq('deal_id', dealId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setCriteria({
          cashBurnOk: data.cash_burn_ok ?? undefined,
          b2bB2c: data.b2b_b2c ?? undefined,
          revenueType: data.revenue_type ?? undefined,
          collateralAvailable: data.collateral_available ?? undefined,
        });
      }
    } catch (error) {
      console.error('Error fetching deal matching criteria:', error);
    } finally {
      setIsLoading(false);
    }
  }, [dealId, user]);

  useEffect(() => {
    fetchCriteria();
  }, [fetchCriteria]);

  const saveCriteria = useCallback(async (newCriteria: DealMatchingCriteria): Promise<boolean> => {
    if (!dealId || !user) return false;

    setIsSaving(true);
    try {
      // First check if writeup exists
      const { data: existing } = await supabase
        .from('deal_writeups')
        .select('id')
        .eq('deal_id', dealId)
        .maybeSingle();

      const updateData: Partial<MatchingCriteriaRow> = {
        cash_burn_ok: newCriteria.cashBurnOk ?? null,
        b2b_b2c: newCriteria.b2bB2c ?? null,
        revenue_type: newCriteria.revenueType ?? null,
        collateral_available: newCriteria.collateralAvailable ?? null,
      };

      if (existing) {
        // Update existing writeup
        const { error } = await supabase
          .from('deal_writeups')
          .update(updateData)
          .eq('deal_id', dealId);

        if (error) throw error;
      } else {
        // Create new writeup with just criteria fields
        const { error } = await supabase
          .from('deal_writeups')
          .insert([{
            deal_id: dealId,
            user_id: user.id,
            company_name: '', // Required field, will be updated later
            ...updateData,
          }]);

        if (error) throw error;
      }

      setCriteria(newCriteria);
      
      toast({
        title: 'Criteria Saved',
        description: 'Lender matching criteria has been saved.',
      });
      
      return true;
    } catch (error) {
      console.error('Error saving deal matching criteria:', error);
      toast({
        title: 'Error',
        description: 'Failed to save criteria. Please try again.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [dealId, user]);

  return {
    criteria,
    isLoading,
    isSaving,
    saveCriteria,
    refetch: fetchCriteria,
  };
}
