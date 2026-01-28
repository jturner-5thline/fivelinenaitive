import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface DealSpaceFinancial {
  id: string;
  deal_id: string;
  name: string;
  file_path: string;
  content_type: string | null;
  size_bytes: number;
  user_id: string | null;
  notes: string | null;
  fiscal_year: number | null;
  fiscal_period: string | null;
  created_at: string;
  updated_at: string;
}

export function useDealSpaceFinancials(dealId: string | undefined) {
  const [financials, setFinancials] = useState<DealSpaceFinancial[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  // Fetch financials
  const fetchFinancials = useCallback(async () => {
    if (!dealId) return;
    
    try {
      const { data, error } = await supabase
        .from('deal_space_financials' as any)
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFinancials((data as unknown as DealSpaceFinancial[]) || []);
    } catch (error) {
      console.error('Error fetching deal space financials:', error);
    } finally {
      setIsLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    fetchFinancials();
  }, [fetchFinancials]);

  // Upload financial document
  const uploadFinancial = useCallback(async (
    file: File, 
    metadata?: { notes?: string; fiscal_year?: number; fiscal_period?: string }
  ) => {
    if (!dealId) return null;
    
    setIsUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Upload file to storage (using deal-space bucket with financials subfolder)
      const fileExt = file.name.split('.').pop();
      const fileName = `${dealId}/financials/${crypto.randomUUID()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('deal-space')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Create database record
      const { data, error: dbError } = await supabase
        .from('deal_space_financials' as any)
        .insert({
          deal_id: dealId,
          name: file.name,
          file_path: fileName,
          content_type: file.type,
          size_bytes: file.size,
          user_id: user.id,
          notes: metadata?.notes || null,
          fiscal_year: metadata?.fiscal_year || null,
          fiscal_period: metadata?.fiscal_period || null,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      const newFinancial = data as unknown as DealSpaceFinancial;
      setFinancials(prev => [newFinancial, ...prev]);
      toast({ title: 'Financial uploaded', description: `${file.name} added to Deal Space Financials` });
      return newFinancial;
    } catch (error) {
      console.error('Error uploading financial:', error);
      toast({ 
        title: 'Upload failed', 
        description: error instanceof Error ? error.message : 'Failed to upload financial',
        variant: 'destructive' 
      });
      return null;
    } finally {
      setIsUploading(false);
    }
  }, [dealId]);

  // Update financial metadata
  const updateFinancial = useCallback(async (
    id: string, 
    updates: { notes?: string; fiscal_year?: number; fiscal_period?: string }
  ) => {
    try {
      const { error } = await supabase
        .from('deal_space_financials' as any)
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      setFinancials(prev => prev.map(f => 
        f.id === id ? { ...f, ...updates } : f
      ));
      toast({ title: 'Financial updated' });
    } catch (error) {
      console.error('Error updating financial:', error);
      toast({ 
        title: 'Update failed', 
        description: error instanceof Error ? error.message : 'Failed to update financial',
        variant: 'destructive' 
      });
    }
  }, []);

  // Delete financial
  const deleteFinancial = useCallback(async (financial: DealSpaceFinancial) => {
    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('deal-space')
        .remove([financial.file_path]);

      if (storageError) console.error('Storage deletion error:', storageError);

      // Delete from database
      const { error: dbError } = await supabase
        .from('deal_space_financials' as any)
        .delete()
        .eq('id', financial.id);

      if (dbError) throw dbError;

      setFinancials(prev => prev.filter(f => f.id !== financial.id));
      toast({ title: 'Financial deleted', description: `${financial.name} removed` });
    } catch (error) {
      console.error('Error deleting financial:', error);
      toast({ 
        title: 'Delete failed', 
        description: error instanceof Error ? error.message : 'Failed to delete financial',
        variant: 'destructive' 
      });
    }
  }, []);

  // Get signed URL for download
  const getDownloadUrl = useCallback(async (financial: DealSpaceFinancial) => {
    try {
      const { data, error } = await supabase.storage
        .from('deal-space')
        .createSignedUrl(financial.file_path, 3600);

      if (error) throw error;
      return data.signedUrl;
    } catch (error) {
      console.error('Error getting download URL:', error);
      return null;
    }
  }, []);

  return {
    financials,
    isLoading,
    isUploading,
    uploadFinancial,
    updateFinancial,
    deleteFinancial,
    getDownloadUrl,
    refetch: fetchFinancials,
  };
}
