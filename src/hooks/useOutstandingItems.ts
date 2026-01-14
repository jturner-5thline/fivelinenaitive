import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface OutstandingItem {
  id: string;
  text: string;
  completed: boolean;
  received: boolean;
  approved: boolean;
  deliveredToLenders: string[];
  createdAt: string;
  completedAt?: string;
  requestedBy: string[];
  lenderId?: string;
}

interface DbOutstandingItem {
  id: string;
  deal_id: string;
  lender_id: string | null;
  description: string;
  status: string;
  due_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Parse status string to get received/approved/delivered state
function parseStatus(status: string): { received: boolean; approved: boolean; deliveredToLenders: string[]; requestedBy: string[] } {
  try {
    const parsed = JSON.parse(status);
    return {
      received: parsed.received ?? false,
      approved: parsed.approved ?? false,
      deliveredToLenders: parsed.deliveredToLenders ?? [],
      requestedBy: parsed.requestedBy ?? [],
    };
  } catch {
    // Legacy status format - just a simple string like 'pending', 'received', etc.
    return {
      received: status === 'received' || status === 'approved' || status === 'delivered',
      approved: status === 'approved' || status === 'delivered',
      deliveredToLenders: status === 'delivered' ? ['all'] : [],
      requestedBy: [],
    };
  }
}

// Build status string from state
function buildStatus(item: Partial<OutstandingItem>): string {
  return JSON.stringify({
    received: item.received ?? false,
    approved: item.approved ?? false,
    deliveredToLenders: item.deliveredToLenders ?? [],
    requestedBy: item.requestedBy ?? [],
  });
}

export function useOutstandingItems(dealId: string | undefined) {
  const [items, setItems] = useState<OutstandingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch outstanding items from database
  const fetchItems = useCallback(async () => {
    if (!dealId) {
      setItems([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('outstanding_items')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const mapped: OutstandingItem[] = (data || []).map((dbItem: DbOutstandingItem) => {
        const statusData = parseStatus(dbItem.status);
        const isCompleted = statusData.received && statusData.approved;
        return {
          id: dbItem.id,
          text: dbItem.description,
          completed: isCompleted,
          received: statusData.received,
          approved: statusData.approved,
          deliveredToLenders: statusData.deliveredToLenders,
          requestedBy: statusData.requestedBy,
          createdAt: dbItem.created_at,
          completedAt: isCompleted ? dbItem.updated_at : undefined,
          lenderId: dbItem.lender_id || undefined,
        };
      });

      setItems(mapped);
    } catch (err) {
      console.error('Error fetching outstanding items:', err);
    } finally {
      setIsLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Add a new outstanding item
  const addItem = useCallback(async (text: string, requestedBy: string[]): Promise<OutstandingItem | null> => {
    if (!dealId) return null;

    try {
      const status = buildStatus({ received: false, approved: false, deliveredToLenders: [], requestedBy });
      
      const { data, error } = await supabase
        .from('outstanding_items')
        .insert({
          deal_id: dealId,
          description: text,
          status,
        })
        .select()
        .single();

      if (error) throw error;

      const newItem: OutstandingItem = {
        id: data.id,
        text: data.description,
        completed: false,
        received: false,
        approved: false,
        deliveredToLenders: [],
        requestedBy,
        createdAt: data.created_at,
      };

      setItems(prev => [...prev, newItem]);
      return newItem;
    } catch (err) {
      console.error('Error adding outstanding item:', err);
      toast({
        title: "Error",
        description: "Failed to add item",
        variant: "destructive",
      });
      return null;
    }
  }, [dealId]);

  // Update an outstanding item
  const updateItem = useCallback(async (id: string, updates: Partial<OutstandingItem>) => {
    // Optimistic update
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updatedItem = { ...item, ...updates };
      // Set completedAt when both received and approved become true
      const wasCompleted = item.received && item.approved;
      const isNowCompleted = updatedItem.received && updatedItem.approved;
      if (!wasCompleted && isNowCompleted) {
        updatedItem.completedAt = new Date().toISOString();
        updatedItem.completed = true;
      } else if (wasCompleted && !isNowCompleted) {
        updatedItem.completedAt = undefined;
        updatedItem.completed = false;
      }
      return updatedItem;
    }));

    try {
      // Get the current item to merge with updates
      const currentItem = items.find(i => i.id === id);
      if (!currentItem) return;

      const mergedItem = { ...currentItem, ...updates };
      const dbUpdates: Record<string, any> = {};
      
      if (updates.text !== undefined) {
        dbUpdates.description = updates.text;
      }
      
      // Always rebuild status with all state
      dbUpdates.status = buildStatus({
        received: mergedItem.received,
        approved: mergedItem.approved,
        deliveredToLenders: mergedItem.deliveredToLenders,
        requestedBy: mergedItem.requestedBy,
      });

      const { error } = await supabase
        .from('outstanding_items')
        .update(dbUpdates)
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      console.error('Error updating outstanding item:', err);
      // Rollback on error
      fetchItems();
      toast({
        title: "Error",
        description: "Failed to update item",
        variant: "destructive",
      });
    }
  }, [items, fetchItems]);

  // Delete an outstanding item
  const deleteItem = useCallback(async (id: string) => {
    // Optimistic delete
    setItems(prev => prev.filter(item => item.id !== id));

    try {
      const { error } = await supabase
        .from('outstanding_items')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      console.error('Error deleting outstanding item:', err);
      // Rollback on error
      fetchItems();
      toast({
        title: "Error",
        description: "Failed to delete item",
        variant: "destructive",
      });
    }
  }, [fetchItems]);

  return {
    items,
    isLoading,
    addItem,
    updateItem,
    deleteItem,
    refreshItems: fetchItems,
  };
}
