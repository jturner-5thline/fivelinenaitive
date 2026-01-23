import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface DealChecklistItem {
  id: string;
  deal_id: string;
  name: string;
  category: string | null;
  description: string | null;
  is_required: boolean;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Flag to identify deal-specific items vs template items
  is_deal_specific: true;
}

export interface DealChecklistItemInsert {
  name: string;
  category?: string | null;
  description?: string | null;
  is_required?: boolean;
}

export function useDealChecklistItems(dealId: string | undefined) {
  const { user } = useAuth();
  const [items, setItems] = useState<DealChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    if (!user || !dealId) {
      setItems([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('deal_checklist_items')
        .select('*')
        .eq('deal_id', dealId)
        .order('position', { ascending: true });

      if (error) throw error;
      
      // Mark all items as deal-specific
      const markedItems = (data || []).map(item => ({
        ...item,
        is_deal_specific: true as const,
      }));
      
      setItems(markedItems);
    } catch (err) {
      console.error('Error fetching deal checklist items:', err);
    } finally {
      setLoading(false);
    }
  }, [user, dealId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const addItem = async (item: DealChecklistItemInsert): Promise<DealChecklistItem | null> => {
    if (!user || !dealId) return null;

    try {
      const position = items.length;
      const { data, error } = await supabase
        .from('deal_checklist_items')
        .insert({ 
          ...item, 
          deal_id: dealId,
          created_by: user.id,
          position 
        })
        .select()
        .single();

      if (error) throw error;
      
      const newItem = { ...data, is_deal_specific: true as const };
      setItems(prev => [...prev, newItem]);
      toast.success('Checklist item added');
      return newItem;
    } catch (err) {
      console.error('Error adding deal checklist item:', err);
      toast.error('Failed to add checklist item');
      return null;
    }
  };

  const updateItem = async (id: string, updates: Partial<DealChecklistItemInsert>): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('deal_checklist_items')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      
      setItems(prev => prev.map(item => 
        item.id === id ? { ...item, ...updates } : item
      ));
      return true;
    } catch (err) {
      console.error('Error updating deal checklist item:', err);
      toast.error('Failed to update checklist item');
      return false;
    }
  };

  const deleteItem = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('deal_checklist_items')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setItems(prev => prev.filter(item => item.id !== id));
      toast.success('Checklist item removed');
      return true;
    } catch (err) {
      console.error('Error deleting deal checklist item:', err);
      toast.error('Failed to delete checklist item');
      return false;
    }
  };

  return {
    items,
    loading,
    fetchItems,
    addItem,
    updateItem,
    deleteItem,
  };
}
