import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface DealCustomFolder {
  id: string;
  deal_id: string;
  name: string;
  position: number;
  icon: string;
  color: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Per-deal custom Data Room folders. These appear in the Data Room column of
 * the deal workspace alongside the company-wide checklist categories, but are
 * scoped to a single deal so they don't affect the company taxonomy.
 * Visible to all members of the deal's company (RLS enforced).
 */
export function useDealCustomFolders(dealId: string | undefined) {
  const [folders, setFolders] = useState<DealCustomFolder[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFolders = useCallback(async () => {
    if (!dealId) {
      setFolders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('deal_data_room_custom_folders')
      .select('*')
      .eq('deal_id', dealId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) {
      console.error('Failed to load deal custom folders', error);
      setFolders([]);
    } else {
      setFolders((data || []) as DealCustomFolder[]);
    }
    setLoading(false);
  }, [dealId]);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  // Realtime sync so all viewers of the deal see folder changes immediately.
  useEffect(() => {
    if (!dealId) return;
    const channel = supabase
      .channel(`deal_custom_folders_${dealId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deal_data_room_custom_folders',
          filter: `deal_id=eq.${dealId}`,
        },
        () => { fetchFolders(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [dealId, fetchFolders]);

  const createFolder = useCallback(
    async (name: string): Promise<DealCustomFolder | null> => {
      const trimmed = name.trim();
      if (!dealId || !trimmed) return null;
      // Optimistic insert
      const { data: userData } = await supabase.auth.getUser();
      const nextPosition = folders.length
        ? Math.max(...folders.map(f => f.position)) + 1
        : 0;
      const { data, error } = await (supabase as any)
        .from('deal_data_room_custom_folders')
        .insert({
          deal_id: dealId,
          name: trimmed,
          position: nextPosition,
          created_by: userData.user?.id ?? null,
        })
        .select()
        .single();
      if (error) {
        if ((error as any).code === '23505') {
          toast.error('A folder with this name already exists for this deal.');
        } else {
          toast.error('Failed to create folder', { description: (error as any).message });
        }
        return null;
      }
      const folder = data as DealCustomFolder;
      setFolders(prev => [...prev, folder]);
      return folder;
    },
    [dealId, folders],
  );

  const renameFolder = useCallback(async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const { error } = await (supabase as any)
      .from('deal_data_room_custom_folders')
      .update({ name: trimmed })
      .eq('id', id);
    if (error) {
      toast.error('Failed to rename folder');
      return false;
    }
    setFolders(prev => prev.map(f => (f.id === id ? { ...f, name: trimmed } : f)));
    return true;
  }, []);

  const deleteFolder = useCallback(async (id: string) => {
    const { error } = await (supabase as any)
      .from('deal_data_room_custom_folders')
      .delete()
      .eq('id', id);
    if (error) {
      toast.error('Failed to delete folder');
      return false;
    }
    setFolders(prev => prev.filter(f => f.id !== id));
    return true;
  }, []);

  return { folders, loading, createFolder, renameFolder, deleteFolder, refetch: fetchFolders };
}