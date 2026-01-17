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
}

export function useAllMilestones(dealIds?: string[]) {
  const { user } = useAuth();
  const [milestones, setMilestones] = useState<MilestoneWithDeal[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMilestones = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('deal_milestones')
        .select(`
          id,
          title,
          deal_id,
          due_date,
          completed,
          completed_at,
          deals!inner(company, user_id)
        `)
        .eq('deals.user_id', user.id)
        .order('due_date', { ascending: true, nullsFirst: false });

      if (error) throw error;

      const milestonesWithDeal: MilestoneWithDeal[] = (data || []).map((m: any) => ({
        id: m.id,
        title: m.title,
        deal_id: m.deal_id,
        due_date: m.due_date,
        completed: m.completed,
        completed_at: m.completed_at,
        deal_company: m.deals.company,
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
