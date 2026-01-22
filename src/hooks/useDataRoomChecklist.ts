import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface ChecklistItem {
  id: string;
  user_id: string;
  company_id: string | null;
  name: string;
  category: string | null;
  description: string | null;
  is_required: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface DealChecklistStatus {
  id: string;
  deal_id: string;
  checklist_item_id: string;
  is_complete: boolean;
  attachment_id: string | null;
  notes: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChecklistItemInsert {
  name: string;
  category?: string | null;
  description?: string | null;
  is_required?: boolean;
  position?: number;
}

export function useDataRoomChecklist() {
  const { user } = useAuth();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('data_room_checklist_items')
        .select('*')
        .order('position', { ascending: true });

      if (error) throw error;
      setItems((data as ChecklistItem[]) || []);
    } catch (err) {
      console.error('Error fetching checklist items:', err);
      toast.error('Failed to load checklist items');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const addItem = async (item: ChecklistItemInsert): Promise<ChecklistItem | null> => {
    if (!user) return null;

    try {
      const position = items.length;
      const { data, error } = await supabase
        .from('data_room_checklist_items')
        .insert({ ...item, user_id: user.id, position })
        .select()
        .single();

      if (error) throw error;
      
      const newItem = data as ChecklistItem;
      setItems(prev => [...prev, newItem]);
      return newItem;
    } catch (err) {
      console.error('Error adding checklist item:', err);
      toast.error('Failed to add checklist item');
      return null;
    }
  };

  const updateItem = async (id: string, updates: Partial<ChecklistItemInsert>): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('data_room_checklist_items')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      
      setItems(prev => prev.map(item => 
        item.id === id ? { ...item, ...updates } : item
      ));
      return true;
    } catch (err) {
      console.error('Error updating checklist item:', err);
      toast.error('Failed to update checklist item');
      return false;
    }
  };

  const deleteItem = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('data_room_checklist_items')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setItems(prev => prev.filter(item => item.id !== id));
      return true;
    } catch (err) {
      console.error('Error deleting checklist item:', err);
      toast.error('Failed to delete checklist item');
      return false;
    }
  };

  const reorderItems = async (reorderedItems: ChecklistItem[]): Promise<boolean> => {
    try {
      const updates = reorderedItems.map((item, index) => ({
        id: item.id,
        position: index,
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from('data_room_checklist_items')
          .update({ position: update.position })
          .eq('id', update.id);
        if (error) throw error;
      }

      setItems(reorderedItems.map((item, index) => ({ ...item, position: index })));
      return true;
    } catch (err) {
      console.error('Error reordering checklist items:', err);
      toast.error('Failed to reorder checklist items');
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
    reorderItems,
  };
}

export function useDealChecklistStatus(dealId: string | undefined) {
  const { user } = useAuth();
  const [statuses, setStatuses] = useState<DealChecklistStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStatuses = useCallback(async () => {
    if (!user || !dealId) {
      setStatuses([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('deal_checklist_status')
        .select('*')
        .eq('deal_id', dealId);

      if (error) throw error;
      setStatuses((data as DealChecklistStatus[]) || []);
    } catch (err) {
      console.error('Error fetching deal checklist statuses:', err);
    } finally {
      setLoading(false);
    }
  }, [user, dealId]);

  useEffect(() => {
    fetchStatuses();
  }, [fetchStatuses]);

  const toggleItemStatus = async (
    checklistItemId: string, 
    isComplete: boolean,
    attachmentId?: string | null
  ): Promise<boolean> => {
    if (!user || !dealId) return false;

    try {
      const existingStatus = statuses.find(s => s.checklist_item_id === checklistItemId);

      if (existingStatus) {
        const { error } = await supabase
          .from('deal_checklist_status')
          .update({
            is_complete: isComplete,
            attachment_id: attachmentId ?? existingStatus.attachment_id,
            completed_at: isComplete ? new Date().toISOString() : null,
            completed_by: isComplete ? user.id : null,
          })
          .eq('id', existingStatus.id);

        if (error) throw error;

        setStatuses(prev => prev.map(s => 
          s.id === existingStatus.id 
            ? { 
                ...s, 
                is_complete: isComplete, 
                attachment_id: attachmentId ?? s.attachment_id,
                completed_at: isComplete ? new Date().toISOString() : null,
                completed_by: isComplete ? user.id : null,
              } 
            : s
        ));
      } else {
        const { data, error } = await supabase
          .from('deal_checklist_status')
          .insert({
            deal_id: dealId,
            checklist_item_id: checklistItemId,
            is_complete: isComplete,
            attachment_id: attachmentId ?? null,
            completed_at: isComplete ? new Date().toISOString() : null,
            completed_by: isComplete ? user.id : null,
          })
          .select()
          .single();

        if (error) throw error;
        setStatuses(prev => [...prev, data as DealChecklistStatus]);
      }

      return true;
    } catch (err) {
      console.error('Error updating checklist status:', err);
      toast.error('Failed to update checklist status');
      return false;
    }
  };

  const linkAttachment = async (
    checklistItemId: string,
    attachmentId: string
  ): Promise<boolean> => {
    return toggleItemStatus(checklistItemId, true, attachmentId);
  };

  const unlinkAttachment = async (checklistItemId: string): Promise<boolean> => {
    if (!user || !dealId) return false;

    try {
      const existingStatus = statuses.find(s => s.checklist_item_id === checklistItemId);
      if (!existingStatus) return true;

      const { error } = await supabase
        .from('deal_checklist_status')
        .update({ attachment_id: null })
        .eq('id', existingStatus.id);

      if (error) throw error;

      setStatuses(prev => prev.map(s => 
        s.id === existingStatus.id ? { ...s, attachment_id: null } : s
      ));

      return true;
    } catch (err) {
      console.error('Error unlinking attachment:', err);
      toast.error('Failed to unlink attachment');
      return false;
    }
  };

  return {
    statuses,
    loading,
    fetchStatuses,
    toggleItemStatus,
    linkAttachment,
    unlinkAttachment,
  };
}
