import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface ShareLink {
  id: string;
  deal_id: string;
  created_by: string;
  token: string;
  label: string;
  target_checklist_items: string[];
  permissions: string;
  expires_at: string | null;
  max_uploads: number | null;
  uploads_used: number;
  is_active: boolean;
  created_at: string;
}

export function useDataRoomShareLinks(dealId: string | null) {
  const { user } = useAuth();
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLinks = useCallback(async () => {
    if (!user || !dealId) { setLinks([]); return; }
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('data_room_share_links')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setLinks((data || []) as ShareLink[]);
    } catch (err) {
      console.error('Error fetching share links:', err);
    } finally {
      setLoading(false);
    }
  }, [user, dealId]);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);

  const createLink = async (opts: {
    label?: string;
    targetItems?: string[];
    expiresAt?: string;
    maxUploads?: number;
  }): Promise<ShareLink | null> => {
    if (!user || !dealId) return null;
    try {
      const { data, error } = await supabase
        .from('data_room_share_links')
        .insert({
          deal_id: dealId,
          created_by: user.id,
          label: opts.label || 'External Upload Link',
          target_checklist_items: opts.targetItems || [],
          expires_at: opts.expiresAt || null,
          max_uploads: opts.maxUploads || null,
        })
        .select()
        .single();
      if (error) throw error;
      toast.success('Share link created');
      await fetchLinks();
      return data as ShareLink;
    } catch (err) {
      console.error('Error creating share link:', err);
      toast.error('Failed to create share link');
      return null;
    }
  };

  const deactivateLink = async (linkId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('data_room_share_links')
        .update({ is_active: false })
        .eq('id', linkId);
      if (error) throw error;
      toast.success('Share link deactivated');
      await fetchLinks();
      return true;
    } catch (err) {
      console.error('Error deactivating share link:', err);
      toast.error('Failed to deactivate link');
      return false;
    }
  };

  const deleteLink = async (linkId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('data_room_share_links')
        .delete()
        .eq('id', linkId);
      if (error) throw error;
      toast.success('Share link deleted');
      await fetchLinks();
      return true;
    } catch (err) {
      console.error('Error deleting share link:', err);
      toast.error('Failed to delete link');
      return false;
    }
  };

  return { links, loading, createLink, deactivateLink, deleteLink, refetch: fetchLinks };
}
