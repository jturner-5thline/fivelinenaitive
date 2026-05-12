import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

export type ItemPriority = 'urgent' | 'high' | 'normal';

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
  notes?: string;
  eta?: string;
  priority: ItemPriority;
  assignedTo?: string;
  position: number;
}

interface DbOutstandingItem {
  id: string;
  deal_id: string;
  lender_id: string | null;
  description: string;
  status: string;
  due_date: string | null;
  notes: string | null;
  eta: string | null;
  created_at: string;
  updated_at: string;
  priority: string;
  assigned_to: string | null;
  position: number;
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
  const { user } = useAuth();
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
        .eq('is_archived', false)
        .order('position', { ascending: true });

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
          notes: dbItem.notes || undefined,
          eta: dbItem.eta || undefined,
          priority: (dbItem.priority as ItemPriority) || 'normal',
          assignedTo: dbItem.assigned_to || undefined,
          position: dbItem.position,
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
  const addItem = useCallback(async (text: string, requestedBy: string[], priority: ItemPriority = 'normal'): Promise<OutstandingItem | null> => {
    if (!dealId || !user) return null;

    try {
      const status = buildStatus({ received: false, approved: false, deliveredToLenders: [], requestedBy });
      const maxPosition = items.length > 0 ? Math.max(...items.map(i => i.position)) + 1 : 0;
      
      const { data, error } = await supabase
        .from('outstanding_items')
        .insert({
          deal_id: dealId,
          description: text,
          status,
          user_id: user.id,
          priority,
          position: maxPosition,
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
        priority,
        assignedTo: undefined,
        position: maxPosition,
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
  }, [dealId, user, items]);

  // Bulk add items
  const bulkAddItems = useCallback(async (texts: string[], requestedBy: string[]): Promise<void> => {
    if (!dealId || !user) return;

    try {
      const maxPosition = items.length > 0 ? Math.max(...items.map(i => i.position)) + 1 : 0;
      const status = buildStatus({ received: false, approved: false, deliveredToLenders: [], requestedBy });
      
      const inserts = texts.map((text, idx) => ({
        deal_id: dealId,
        description: text.trim(),
        status,
        user_id: user.id,
        priority: 'normal',
        position: maxPosition + idx,
      }));

      const { error } = await supabase
        .from('outstanding_items')
        .insert(inserts);

      if (error) throw error;

      await fetchItems();
      toast({
        title: "Items added",
        description: `${texts.length} items imported successfully`,
      });
    } catch (err) {
      console.error('Error bulk adding items:', err);
      toast({
        title: "Error",
        description: "Failed to import items",
        variant: "destructive",
      });
    }
  }, [dealId, user, items, fetchItems]);

  // Update an outstanding item
  const updateItem = useCallback(async (id: string, updates: Partial<OutstandingItem>) => {
    // Submitted implies Received: normalize the update so callers (single toggle,
    // bulk actions, row UIs) cannot produce the invalid state approved=true & received=false.
    // - Setting approved=true also sets received=true.
    // - Setting received=false also clears approved=false.
    const normalizedUpdates: Partial<OutstandingItem> = { ...updates };
    if (normalizedUpdates.approved === true) {
      normalizedUpdates.received = true;
    }
    if (normalizedUpdates.received === false) {
      normalizedUpdates.approved = false;
    }

    // Optimistic update
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updatedItem = { ...item, ...normalizedUpdates };
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
      const currentItem = items.find(i => i.id === id);
      if (!currentItem) return;

      const mergedItem = { ...currentItem, ...normalizedUpdates };
      const dbUpdates: Record<string, any> = {};
      
      if (normalizedUpdates.text !== undefined) dbUpdates.description = normalizedUpdates.text;
      if (normalizedUpdates.notes !== undefined) dbUpdates.notes = normalizedUpdates.notes;
      if (normalizedUpdates.eta !== undefined) dbUpdates.eta = normalizedUpdates.eta;
      if (normalizedUpdates.priority !== undefined) dbUpdates.priority = normalizedUpdates.priority;
      if (normalizedUpdates.assignedTo !== undefined) dbUpdates.assigned_to = normalizedUpdates.assignedTo || null;
      if (normalizedUpdates.position !== undefined) dbUpdates.position = normalizedUpdates.position;
      
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
      fetchItems();
      toast({
        title: "Error",
        description: "Failed to update item",
        variant: "destructive",
      });
    }
  }, [items, fetchItems]);

  // Reorder items
  const reorderItems = useCallback(async (reorderedItems: OutstandingItem[]) => {
    // Optimistic update
    setItems(reorderedItems.map((item, idx) => ({ ...item, position: idx })));

    try {
      const updates = reorderedItems.map((item, idx) => 
        supabase
          .from('outstanding_items')
          .update({ position: idx })
          .eq('id', item.id)
      );
      await Promise.all(updates);
    } catch (err) {
      console.error('Error reordering items:', err);
      fetchItems();
    }
  }, [fetchItems]);

  // Delete an outstanding item
  const deleteItem = useCallback(async (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));

    try {
      const { error } = await supabase
        .from('outstanding_items')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      console.error('Error deleting outstanding item:', err);
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
    bulkAddItems,
    updateItem,
    deleteItem,
    reorderItems,
    refreshItems: fetchItems,
  };
}
