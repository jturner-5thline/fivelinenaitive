import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export const DEAL_ATTACHMENT_CATEGORIES = [
  { value: 'materials', label: 'Materials' },
  { value: 'financials', label: 'Financials' },
  { value: 'agreements', label: 'Agreements' },
  { value: 'other', label: 'Other' },
] as const;

export type DealAttachmentCategory = typeof DEAL_ATTACHMENT_CATEGORIES[number]['value'];

export interface DealAttachment {
  id: string;
  deal_id: string;
  name: string;
  file_path: string;
  content_type: string | null;
  size_bytes: number;
  created_at: string;
  category: DealAttachmentCategory;
  url?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function useDealAttachments(dealId: string | null) {
  const { user } = useAuth();
  const [attachments, setAttachments] = useState<DealAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchAttachments = useCallback(async () => {
    if (!user || !dealId) {
      setAttachments([]);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('deal_attachments')
        .select('*')
        .eq('user_id', user.id)
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get signed URLs for each attachment (1 hour expiry)
      const attachmentsWithUrls = await Promise.all(
        (data || []).map(async (att) => {
          const { data: urlData, error: urlError } = await supabase.storage
            .from('deal-attachments')
            .createSignedUrl(att.file_path, 3600); // 1 hour expiry
          
          return { 
            ...att, 
            url: urlError ? undefined : urlData?.signedUrl,
            category: att.category as DealAttachmentCategory 
          };
        })
      );

      setAttachments(attachmentsWithUrls);
    } catch (error) {
      console.error('Error fetching deal attachments:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, dealId]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  const uploadAttachment = async (file: File, category: DealAttachmentCategory = 'materials') => {
    if (!user || !dealId) {
      toast.error('Please log in to upload attachments');
      return null;
    }

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${user.id}/${dealId}/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('deal-attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Create database record
      const { data, error: dbError } = await supabase
        .from('deal_attachments')
        .insert({
          user_id: user.id,
          deal_id: dealId,
          name: file.name,
          file_path: filePath,
          content_type: file.type,
          size_bytes: file.size,
          category,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      return data;
    } catch (error) {
      console.error('Error uploading attachment:', error);
      throw error;
    }
  };

  const uploadMultipleAttachments = async (files: File[], category: DealAttachmentCategory = 'materials') => {
    if (!user || !dealId) {
      toast.error('Please log in to upload attachments');
      return [];
    }

    const results: DealAttachment[] = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        const result = await uploadAttachment(file, category);
        if (result) results.push(result as DealAttachment);
      } catch (error) {
        errors.push(file.name);
      }
    }

    if (errors.length > 0) {
      toast.error(`Failed to upload: ${errors.join(', ')}`);
    }
    
    if (results.length > 0) {
      toast.success(`${results.length} attachment${results.length > 1 ? 's' : ''} uploaded`);
      await fetchAttachments();
    }

    return results;
  };

  const deleteAttachment = async (attachment: DealAttachment) => {
    if (!user) return false;

    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('deal-attachments')
        .remove([attachment.file_path]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from('deal_attachments')
        .delete()
        .eq('id', attachment.id);

      if (dbError) throw dbError;

      toast.success('Attachment deleted');
      await fetchAttachments();
      return true;
    } catch (error) {
      console.error('Error deleting attachment:', error);
      toast.error('Failed to delete attachment');
      return false;
    }
  };

  return {
    attachments,
    isLoading,
    uploadAttachment,
    uploadMultipleAttachments,
    deleteAttachment,
    refetch: fetchAttachments,
    formatFileSize,
  };
}
