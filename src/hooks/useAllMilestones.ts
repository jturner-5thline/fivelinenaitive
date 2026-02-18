import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DealMilestone } from '@/types/deal';

export interface MilestoneWithDeal {
  id: string;
  title: string;
  deal_id: string;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
  deal_company: string;
  deal_owner: string | null;
}

export function useAllMilestones(dealIds?: string[]) {
  const { user } = useAuth();
  const [milestones, setMilestones] = useState<MilestoneWithDeal[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMilestones = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      // First get the user's company_id
      const { data: membership } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      const companyId = membership?.company_id;

      let query = supabase
        .from('deal_milestones')
        .select(`
          id,
          title,
          deal_id,
          due_date,
          completed,
          completed_at,
          deals!inner(company, user_id, company_id, manager)
        `)
        .order('due_date', { ascending: true, nullsFirst: false });

      if (companyId) {
        // Show milestones for all deals in the company
        query = query.eq('deals.company_id', companyId);
      } else {
        // Fallback: only show own deals
        query = query.eq('deals.user_id', user.id);
      }

      const { data, error } = await query;

      if (error) throw error;

      const milestonesWithDeal: MilestoneWithDeal[] = (data || []).map((m: any) => ({
        id: m.id,
        title: m.title,
        deal_id: m.deal_id,
        due_date: m.due_date,
        completed: m.completed,
        completed_at: m.completed_at,
        deal_company: m.deals.company,
        deal_owner: m.deals.manager || null,
      }));

      setMilestones(milestonesWithDeal);
    } catch (error) {
      console.error('Error fetching milestones:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchMilestones();
  }, [fetchMilestones]);

  // Create a map of deal_id -> milestones for easy lookup
  const milestonesMap = useMemo(() => {
    const map: Record<string, DealMilestone[]> = {};
    
    milestones.forEach(m => {
      if (!map[m.deal_id]) {
        map[m.deal_id] = [];
      }
      map[m.deal_id].push({
        id: m.id,
        title: m.title,
        completed: m.completed,
        completedAt: m.completed_at || undefined,
        dueDate: m.due_date || undefined,
      });
    });

    return map;
  }, [milestones]);

  return {
    milestones,
    milestonesMap,
    isLoading,
    refetch: fetchMilestones,
  };
}
