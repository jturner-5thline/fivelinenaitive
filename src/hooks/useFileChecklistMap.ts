import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface FileChecklistMapping {
  id: string;
  file_id: string;
  checklist_item_id: string;
  deal_id: string;
  mapped_by: string;
  mapped_at: string;
  mapping_source: 'auto_suggest' | 'manual_drag' | 'manual_picker';
}

export function useFileChecklistMap(dealId: string | null) {
  const { user } = useAuth();
  const [mappings, setMappings] = useState<FileChecklistMapping[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMappings = useCallback(async () => {
    if (!user || !dealId) {
      setMappings([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('file_checklist_map')
        .select('*')
        .eq('deal_id', dealId);

      if (error) throw error;
      setMappings((data || []) as FileChecklistMapping[]);
    } catch (err) {
      console.error('Error fetching file mappings:', err);
    } finally {
      setLoading(false);
    }
  }, [user, dealId]);

  useEffect(() => {
    fetchMappings();
  }, [fetchMappings]);

  // Real-time subscription
  useEffect(() => {
    if (!dealId) return;
    const channel = supabase
      .channel(`file-checklist-map-${dealId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'file_checklist_map',
        filter: `deal_id=eq.${dealId}`,
      }, () => { fetchMappings(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [dealId, fetchMappings]);

  const mapFileToItem = async (
    fileId: string,
    checklistItemId: string,
    source: FileChecklistMapping['mapping_source'] = 'manual_picker'
  ): Promise<boolean> => {
    if (!user || !dealId) return false;
    try {
      const { error } = await supabase
        .from('file_checklist_map')
        .insert({
          file_id: fileId,
          checklist_item_id: checklistItemId,
          deal_id: dealId,
          mapped_by: user.id,
          mapping_source: source,
        });
      if (error) {
        if (error.code === '23505') return true; // Already mapped
        throw error;
      }
      await fetchMappings();
      return true;
    } catch (err) {
      console.error('Error mapping file:', err);
      toast.error('Failed to map file to checklist item');
      return false;
    }
  };

  const mapFilesToItem = async (
    fileIds: string[],
    checklistItemId: string,
    source: FileChecklistMapping['mapping_source'] = 'manual_picker'
  ): Promise<number> => {
    if (!user || !dealId) return 0;
    let count = 0;
    for (const fileId of fileIds) {
      const ok = await mapFileToItem(fileId, checklistItemId, source);
      if (ok) count++;
    }
    return count;
  };

  const mapFileToItems = async (
    fileId: string,
    checklistItemIds: string[],
    source: FileChecklistMapping['mapping_source'] = 'manual_picker'
  ): Promise<number> => {
    if (!user || !dealId) return 0;
    let count = 0;
    for (const itemId of checklistItemIds) {
      const ok = await mapFileToItem(fileId, itemId, source);
      if (ok) count++;
    }
    return count;
  };

  const unmapFile = async (fileId: string, checklistItemId: string): Promise<boolean> => {
    if (!user || !dealId) return false;
    try {
      const { error } = await supabase
        .from('file_checklist_map')
        .delete()
        .eq('file_id', fileId)
        .eq('checklist_item_id', checklistItemId)
        .eq('deal_id', dealId);
      if (error) throw error;
      await fetchMappings();
      return true;
    } catch (err) {
      console.error('Error unmapping file:', err);
      toast.error('Failed to unmap file');
      return false;
    }
  };

  const unmapAllForFile = async (fileId: string): Promise<boolean> => {
    if (!user || !dealId) return false;
    try {
      const { error } = await supabase
        .from('file_checklist_map')
        .delete()
        .eq('file_id', fileId)
        .eq('deal_id', dealId);
      if (error) throw error;
      await fetchMappings();
      return true;
    } catch (err) {
      console.error('Error unmapping file:', err);
      return false;
    }
  };

  // Helpers
  const getFilesForItem = useCallback((checklistItemId: string) => {
    return mappings.filter(m => m.checklist_item_id === checklistItemId);
  }, [mappings]);

  const getItemsForFile = useCallback((fileId: string) => {
    return mappings.filter(m => m.file_id === fileId);
  }, [mappings]);

  const getUnmappedFileIds = useCallback((allFileIds: string[]) => {
    const mappedIds = new Set(mappings.map(m => m.file_id));
    return allFileIds.filter(id => !mappedIds.has(id));
  }, [mappings]);

  return {
    mappings,
    loading,
    fetchMappings,
    mapFileToItem,
    mapFilesToItem,
    mapFileToItems,
    unmapFile,
    unmapAllForFile,
    getFilesForItem,
    getItemsForFile,
    getUnmappedFileIds,
  };
}
