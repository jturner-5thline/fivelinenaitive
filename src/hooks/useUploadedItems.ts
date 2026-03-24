import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type MappingStatus = 'unmapped' | 'mapped' | 'ignored';

export interface UploadedItem {
  id: string;
  upload_batch_id: string;
  deal_id: string;
  name: string;
  metadata: Record<string, any>;
  mapping_status: MappingStatus;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UploadedItemMapping {
  id: string;
  uploaded_item_id: string;
  checklist_item_id: string;
  created_by: string | null;
  created_at: string;
}

export interface MappingRow {
  id: string;
  name: string;
  metadata: Record<string, any>;
  mappingStatus: MappingStatus;
  checklistItemIds: string[];
}

export function useUploadedItems(dealId: string | null, batchId: string | null) {
  const { user } = useAuth();
  const [items, setItems] = useState<UploadedItem[]>([]);
  const [mappings, setMappings] = useState<UploadedItemMapping[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!user || !dealId || !batchId) { setItems([]); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('uploaded_items')
        .select('*')
        .eq('deal_id', dealId)
        .eq('upload_batch_id', batchId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setItems((data || []) as UploadedItem[]);
    } catch (err) {
      console.error('Error fetching uploaded items:', err);
    } finally {
      setLoading(false);
    }
  }, [user, dealId, batchId]);

  const fetchMappings = useCallback(async () => {
    if (!user || !batchId) { setMappings([]); return; }
    try {
      // Get all mappings for items in this batch
      const { data: itemData } = await supabase
        .from('uploaded_items')
        .select('id')
        .eq('upload_batch_id', batchId);
      if (!itemData?.length) { setMappings([]); return; }
      const itemIds = itemData.map(i => i.id);
      const { data, error } = await supabase
        .from('uploaded_item_checklist_mapping')
        .select('*')
        .in('uploaded_item_id', itemIds);
      if (error) throw error;
      setMappings((data || []) as UploadedItemMapping[]);
    } catch (err) {
      console.error('Error fetching mappings:', err);
    }
  }, [user, batchId]);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => { fetchMappings(); }, [fetchMappings]);

  // Create items from files
  const createItems = useCallback(async (
    files: { name: string; metadata?: Record<string, any> }[]
  ): Promise<UploadedItem[]> => {
    if (!user || !dealId || !batchId) return [];
    try {
      const rows = files.map(f => ({
        upload_batch_id: batchId,
        deal_id: dealId,
        name: f.name,
        metadata: f.metadata || {},
        uploaded_by: user.id,
      }));
      const { data, error } = await supabase
        .from('uploaded_items')
        .insert(rows)
        .select();
      if (error) throw error;
      const created = (data || []) as UploadedItem[];
      setItems(prev => [...prev, ...created]);
      return created;
    } catch (err) {
      console.error('Error creating uploaded items:', err);
      toast.error('Failed to create uploaded items');
      return [];
    }
  }, [user, dealId, batchId]);

  // Update mappings for a single item (replace all)
  const setItemMappings = useCallback(async (
    uploadedItemId: string,
    checklistItemIds: string[]
  ): Promise<boolean> => {
    if (!user) return false;
    try {
      // Delete existing mappings
      await supabase
        .from('uploaded_item_checklist_mapping')
        .delete()
        .eq('uploaded_item_id', uploadedItemId);

      // Insert new mappings
      if (checklistItemIds.length > 0) {
        const rows = checklistItemIds.map(cid => ({
          uploaded_item_id: uploadedItemId,
          checklist_item_id: cid,
          created_by: user.id,
        }));
        const { error } = await supabase
          .from('uploaded_item_checklist_mapping')
          .insert(rows);
        if (error) throw error;
      }

      // Update mapping_status
      const newStatus: MappingStatus = checklistItemIds.length > 0 ? 'mapped' : 'unmapped';
      // Only update if not ignored
      const item = items.find(i => i.id === uploadedItemId);
      if (item && item.mapping_status !== 'ignored') {
        await supabase
          .from('uploaded_items')
          .update({ mapping_status: newStatus })
          .eq('id', uploadedItemId);
        setItems(prev => prev.map(i => i.id === uploadedItemId ? { ...i, mapping_status: newStatus } : i));
      }

      // Update local mappings state
      setMappings(prev => {
        const filtered = prev.filter(m => m.uploaded_item_id !== uploadedItemId);
        const newMappings: UploadedItemMapping[] = checklistItemIds.map(cid => ({
          id: crypto.randomUUID(),
          uploaded_item_id: uploadedItemId,
          checklist_item_id: cid,
          created_by: user.id,
          created_at: new Date().toISOString(),
        }));
        return [...filtered, ...newMappings];
      });

      return true;
    } catch (err) {
      console.error('Error setting mappings:', err);
      toast.error('Failed to update mappings');
      return false;
    }
  }, [user, items]);

  // Bulk set mappings for multiple items
  const bulkSetMappings = useCallback(async (
    uploadedItemIds: string[],
    checklistItemIds: string[]
  ): Promise<boolean> => {
    if (!user) return false;
    try {
      for (const itemId of uploadedItemIds) {
        await setItemMappings(itemId, checklistItemIds);
      }
      await fetchItems();
      await fetchMappings();
      return true;
    } catch (err) {
      console.error('Error bulk setting mappings:', err);
      return false;
    }
  }, [user, setItemMappings, fetchItems, fetchMappings]);

  // Ignore / un-ignore items
  const setIgnored = useCallback(async (
    uploadedItemIds: string[],
    ignored: boolean
  ): Promise<boolean> => {
    if (!user) return false;
    try {
      for (const itemId of uploadedItemIds) {
        const itemMappings = mappings.filter(m => m.uploaded_item_id === itemId);
        const newStatus: MappingStatus = ignored
          ? 'ignored'
          : (itemMappings.length > 0 ? 'mapped' : 'unmapped');
        await supabase
          .from('uploaded_items')
          .update({ mapping_status: newStatus })
          .eq('id', itemId);
      }
      setItems(prev => prev.map(item => {
        if (!uploadedItemIds.includes(item.id)) return item;
        const itemMappings = mappings.filter(m => m.uploaded_item_id === item.id);
        return {
          ...item,
          mapping_status: ignored ? 'ignored' : (itemMappings.length > 0 ? 'mapped' : 'unmapped'),
        };
      }));
      return true;
    } catch (err) {
      console.error('Error setting ignore status:', err);
      toast.error('Failed to update status');
      return false;
    }
  }, [user, mappings]);

  // Build mapping rows for the table
  const mappingRows: MappingRow[] = useMemo(() => {
    return items.map(item => ({
      id: item.id,
      name: item.name,
      metadata: item.metadata,
      mappingStatus: item.mapping_status as MappingStatus,
      checklistItemIds: mappings
        .filter(m => m.uploaded_item_id === item.id)
        .map(m => m.checklist_item_id),
    }));
  }, [items, mappings]);

  return {
    items,
    mappings,
    mappingRows,
    loading,
    createItems,
    setItemMappings,
    bulkSetMappings,
    setIgnored,
    fetchItems,
    fetchMappings,
  };
}
