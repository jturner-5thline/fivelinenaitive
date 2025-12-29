import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DealMilestone } from '@/types/deal';

export interface DbDealMilestone {
  id: string;
  deal_id: string;
  title: string;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// Convert DB format to app format
const dbToApp = (db: DbDealMilestone): DealMilestone => ({
  id: db.id,
  title: db.title,
  dueDate: db.due_date || undefined,
  completed: db.completed,
  completedAt: db.completed_at || undefined,
});

export function useDealMilestones(dealId: string | undefined) {
  const { user } = useAuth();
  const [milestones, setMilestones] = useState<DealMilestone[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch milestones for the deal
  const fetchMilestones = useCallback(async () => {
    if (!dealId || !user) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('deal_milestones')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      setMilestones((data || []).map(dbToApp));
    } catch (error) {
      console.error('Error fetching milestones:', error);
    } finally {
      setIsLoading(false);
    }
  }, [dealId, user]);

  // Add a new milestone
  const addMilestone = useCallback(async (milestone: Omit<DealMilestone, 'id'>) => {
    if (!dealId || !user) return null;
    
    try {
      const { data, error } = await supabase
        .from('deal_milestones')
        .insert({
          deal_id: dealId,
          user_id: user.id,
          title: milestone.title,
          due_date: milestone.dueDate || null,
          completed: milestone.completed,
          completed_at: milestone.completedAt || null,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      const newMilestone = dbToApp(data);
      setMilestones(prev => [...prev, newMilestone]);
      return newMilestone;
    } catch (error) {
      console.error('Error adding milestone:', error);
      return null;
    }
  }, [dealId, user]);

  // Update a milestone
  const updateMilestone = useCallback(async (id: string, updates: Partial<DealMilestone>) => {
    if (!user) return false;
    
    try {
      const updateData: Record<string, unknown> = {};
      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.dueDate !== undefined) updateData.due_date = updates.dueDate || null;
      if (updates.completed !== undefined) updateData.completed = updates.completed;
      if (updates.completedAt !== undefined) updateData.completed_at = updates.completedAt || null;
      
      const { error } = await supabase
        .from('deal_milestones')
        .update(updateData)
        .eq('id', id);
      
      if (error) throw error;
      
      // Update local state
      setMilestones(prev => prev.map(m => 
        m.id === id ? { ...m, ...updates } : m
      ));
      return true;
    } catch (error) {
      console.error('Error updating milestone:', error);
      return false;
    }
  }, [user]);

  // Delete a milestone
  const deleteMilestone = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('deal_milestones')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      // Remove from local state
      setMilestones(prev => prev.filter(m => m.id !== id));
      return true;
    } catch (error) {
      console.error('Error deleting milestone:', error);
      return false;
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchMilestones();
  }, [fetchMilestones]);

  return {
    milestones,
    isLoading,
    addMilestone,
    updateMilestone,
    deleteMilestone,
    refetch: fetchMilestones,
  };
}
