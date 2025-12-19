import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export const LENDER_ATTACHMENT_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'contracts', label: 'Contracts' },
  { value: 'presentations', label: 'Presentations' },
  { value: 'due_diligence', label: 'Due Diligence' },
  { value: 'term_sheets', label: 'Term Sheets' },
  { value: 'correspondence', label: 'Correspondence' },
] as const;

export type LenderAttachmentCategory = typeof LENDER_ATTACHMENT_CATEGORIES[number]['value'];

export interface LenderAttachment {
  id: string;
  lender_name: string;
  name: string;
  file_path: string;
  content_type: string | null;
  size_bytes: number;
  created_at: string;
  category: LenderAttachmentCategory;
  url?: string;
}

export function useLenderAttachments(lenderName: string | null) {
  const { user } = useAuth();
  const [attachments, setAttachments] = useState<LenderAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchAttachments = useCallback(async () => {
    if (!user || !lenderName) {
      setAttachments([]);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('lender_attachments')
        .select('*')
        .eq('user_id', user.id)
        .eq('lender_name', lenderName)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get public URLs for each attachment
      const attachmentsWithUrls = (data || []).map((att) => {
        const { data: urlData } = supabase.storage
          .from('lender-attachments')
          .getPublicUrl(att.file_path);
        return { 
          ...att, 
          url: urlData.publicUrl,
          category: att.category as LenderAttachmentCategory 
        };
      });

      setAttachments(attachmentsWithUrls);
    } catch (error) {
      console.error('Error fetching lender attachments:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, lenderName]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  const uploadAttachment = async (file: File, category: LenderAttachmentCategory = 'general') => {
    if (!user || !lenderName) {
      toast.error('Please log in to upload attachments');
      return null;
    }

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${user.id}/${lenderName}/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('lender-attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Create database record
      const { data, error: dbError } = await supabase
        .from('lender_attachments')
        .insert({
          user_id: user.id,
          lender_name: lenderName,
          name: file.name,
          file_path: filePath,
          content_type: file.type,
          size_bytes: file.size,
          category,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      toast.success('Attachment uploaded');
      await fetchAttachments();
      return data;
    } catch (error) {
      console.error('Error uploading attachment:', error);
      toast.error('Failed to upload attachment');
      return null;
    }
  };

  const deleteAttachment = async (attachment: LenderAttachment) => {
    if (!user) return false;

    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('lender-attachments')
        .remove([attachment.file_path]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from('lender_attachments')
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
    deleteAttachment,
    refetch: fetchAttachments,
  };
}
