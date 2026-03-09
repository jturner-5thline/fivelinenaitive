import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DealMilestone, MilestoneStatus } from '@/types/deal';
import { toast } from '@/hooks/use-toast';
import { addDays, isWeekend } from 'date-fns';

// Add business days to a date (skips weekends)
function addBusinessDays(start: Date, days: number): Date {
  let current = new Date(start);
  let added = 0;
  while (added < days) {
    current = addDays(current, 1);
    if (!isWeekend(current)) {
      added++;
    }
  }
  return current;
}

// Add calendar weeks, then snap to next business day if needed
function addWeeksBusinessDay(start: Date, weeks: number): Date {
  let target = addDays(start, weeks * 7);
  while (isWeekend(target)) {
    target = addDays(target, 1);
  }
  return target;
}

export interface DbDealMilestone {
  id: string;
  deal_id: string;
  title: string;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
  position: number;
  status: string | null;
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
  position: db.position,
  status: (db.status as MilestoneStatus) || null,
});

export function useDealMilestones(dealId: string | undefined) {
  const { user } = useAuth();
  const [milestones, setMilestones] = useState<DealMilestone[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingClosingDateSync, setPendingClosingDateSync] = useState<string | null>(null);

  // Fetch milestones for the deal
  const fetchMilestones = useCallback(async () => {
    if (!dealId || !user) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('deal_milestones')
        .select('*')
        .eq('deal_id', dealId)
        .order('position', { ascending: true });
      
      if (error) throw error;
      setMilestones((data || []).map(dbToApp));
    } catch (error) {
      console.error('Error fetching milestones:', error);
    } finally {
      setIsLoading(false);
    }
  }, [dealId, user]);

  // Listen for copilot action events to refresh milestones
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.actionType === 'update_milestone' && detail?.params?.deal_id === dealId) {
        fetchMilestones();
      }
    };
    window.addEventListener('copilot-action-completed', handler);
    return () => window.removeEventListener('copilot-action-completed', handler);
  }, [dealId, fetchMilestones]);

  const addMilestone = useCallback(async (milestone: Omit<DealMilestone, 'id'>) => {
    if (!dealId || !user) return null;
    
    try {
      // Get max position
      const maxPosition = milestones.length > 0 
        ? Math.max(...milestones.map(m => m.position ?? 0)) + 1 
        : 0;

      const { data, error } = await supabase
        .from('deal_milestones')
        .insert({
          deal_id: dealId,
          user_id: user.id,
          title: milestone.title,
          due_date: milestone.dueDate || null,
          completed: milestone.completed,
          completed_at: milestone.completedAt || null,
          position: maxPosition,
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
  }, [dealId, user, milestones]);

  // Update a milestone
  const updateMilestone = useCallback(async (id: string, updates: Partial<DealMilestone>) => {
    if (!user) return false;
    
    try {
      const updateData: Record<string, unknown> = {};
      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.dueDate !== undefined) updateData.due_date = updates.dueDate || null;
      if (updates.completed !== undefined) updateData.completed = updates.completed;
      if (updates.completedAt !== undefined) updateData.completed_at = updates.completedAt || null;
      if (updates.position !== undefined) updateData.position = updates.position;
      if ('status' in updates) updateData.status = updates.status || null;
      
      const { error } = await supabase
        .from('deal_milestones')
        .update(updateData)
        .eq('id', id);
      
      if (error) throw error;
      
      // Update local state
      setMilestones(prev => prev.map(m => 
        m.id === id ? { ...m, ...updates } : m
      ));
      
      // Check if "Closed & Funded" due date was changed
      if (updates.dueDate !== undefined) {
        const updatedMilestone = milestones.find(m => m.id === id);
        if (updatedMilestone?.title?.toLowerCase().trim() === 'closed & funded' && updates.dueDate) {
          setPendingClosingDateSync(updates.dueDate.split('T')[0]);
        }
      }
      
      // Auto-create follow-up milestones when specific milestones are completed
      if (updates.completed === true && dealId) {
        const completedMilestone = milestones.find(m => m.id === id);
        const title = completedMilestone?.title?.toLowerCase().trim() || '';
        
        if (title === 'terms received' || title === 'terms we receive') {
          // Check if "Terms Signed" already exists
          const exists = milestones.some(m => m.title.toLowerCase().trim() === 'terms signed');
          if (!exists) {
            const dueDate = addBusinessDays(new Date(), 15); // 3 weeks in business days = 15 business days
            await addMilestone({
              title: 'Terms Signed',
              dueDate: dueDate.toISOString().split('T')[0],
              completed: false,
              position: (milestones.length > 0 ? Math.max(...milestones.map(m => m.position ?? 0)) + 1 : 0),
            });
            toast({ title: "Milestone auto-created", description: `"Terms Signed" due ${dueDate.toLocaleDateString()}` });
          }
        } else if (title === 'terms signed') {
          // Check if "Closed & Funded" already exists
          const exists = milestones.some(m => m.title.toLowerCase().trim() === 'closed & funded');
          if (!exists) {
            const dueDate = addWeeksBusinessDay(new Date(), 8); // 8 weeks later, landing on a business day
            const dueDateStr = dueDate.toISOString().split('T')[0];
            await addMilestone({
              title: 'Closed & Funded',
              dueDate: dueDateStr,
              completed: false,
              position: (milestones.length > 0 ? Math.max(...milestones.map(m => m.position ?? 0)) + 2 : 0),
            });
            toast({ title: "Milestone auto-created", description: `"Closed & Funded" due ${dueDate.toLocaleDateString()}` });
            // Prompt user to sync closing date
            setPendingClosingDateSync(dueDateStr);
          }
        }
      }
      
      // Show success toast
      toast({
        title: "Milestone updated",
        description: updates.completed !== undefined 
          ? `Milestone ${updates.completed ? 'completed' : 'reopened'}`
          : "Milestone saved successfully",
      });
      
      return true;
    } catch (error) {
      console.error('Error updating milestone:', error);
      toast({
        title: "Error",
        description: "Failed to update milestone",
        variant: "destructive",
      });
      return false;
    }
  }, [user]);

  // Reorder milestones
  const reorderMilestones = useCallback(async (reorderedMilestones: DealMilestone[]) => {
    if (!user) return false;
    
    // Optimistically update local state
    setMilestones(reorderedMilestones);
    
    try {
      // Update positions in database
      const updates = reorderedMilestones.map((m, index) => 
        supabase
          .from('deal_milestones')
          .update({ position: index })
          .eq('id', m.id)
      );
      
      await Promise.all(updates);
      return true;
    } catch (error) {
      console.error('Error reordering milestones:', error);
      // Refetch on error to restore correct order
      fetchMilestones();
      return false;
    }
  }, [user, fetchMilestones]);

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

  // Fetch on mount and subscribe to realtime changes
  useEffect(() => {
    fetchMilestones();

    // Subscribe to realtime changes for this deal's milestones
    if (dealId) {
      const channel = supabase
        .channel(`deal-milestones-${dealId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'deal_milestones',
            filter: `deal_id=eq.${dealId}`,
          },
          (payload) => {
            console.log('[Realtime] Milestone change for deal:', dealId, payload.eventType);
            fetchMilestones();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [fetchMilestones, dealId]);

  return {
    milestones,
    isLoading,
    addMilestone,
    updateMilestone,
    deleteMilestone,
    reorderMilestones,
    refetch: fetchMilestones,
    pendingClosingDateSync,
    dismissClosingDateSync: () => setPendingClosingDateSync(null),
  };
}
