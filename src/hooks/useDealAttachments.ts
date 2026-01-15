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
  position: number;
  url?: string;
}

export interface UploadProgress {
  id: string;
  fileName: string;
  fileSize: number;
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  error?: string;
}

export type UploadProgressCallback = (progress: UploadProgress[]) => void;

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
        .order('category')
        .order('position', { ascending: true })
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
            category: att.category as DealAttachmentCategory,
            position: att.position ?? 0,
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

  const uploadMultipleAttachments = async (
    files: File[], 
    category: DealAttachmentCategory = 'materials',
    onProgress?: UploadProgressCallback
  ) => {
    if (!user || !dealId) {
      toast.error('Please log in to upload attachments');
      return [];
    }

    // Initialize progress tracking
    const progressMap: Map<string, UploadProgress> = new Map();
    files.forEach((file, index) => {
      const id = `upload-${Date.now()}-${index}`;
      progressMap.set(id, {
        id,
        fileName: file.name,
        fileSize: file.size,
        progress: 0,
        status: 'pending',
      });
    });

    const notifyProgress = () => {
      if (onProgress) {
        onProgress(Array.from(progressMap.values()));
      }
    };

    notifyProgress();

    const results: DealAttachment[] = [];
    const fileArray = Array.from(files);
    const progressIds = Array.from(progressMap.keys());

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      const progressId = progressIds[i];
      const progress = progressMap.get(progressId)!;

      try {
        // Update to uploading status
        progress.status = 'uploading';
        progress.progress = 10;
        notifyProgress();

        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${user.id}/${dealId}/${fileName}`;

        // Simulate progress during upload
        progress.progress = 30;
        notifyProgress();

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('deal-attachments')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        progress.progress = 70;
        notifyProgress();

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

        progress.status = 'complete';
        progress.progress = 100;
        notifyProgress();

        if (data) results.push(data as DealAttachment);
      } catch (error) {
        console.error('Error uploading attachment:', error);
        progress.status = 'error';
        progress.error = error instanceof Error ? error.message : 'Upload failed';
        notifyProgress();
      }
    }

    const successCount = results.length;
    const errorCount = fileArray.length - successCount;

    if (errorCount > 0 && successCount === 0) {
      toast.error('All uploads failed');
    } else if (errorCount > 0) {
      toast.warning(`${successCount} uploaded, ${errorCount} failed`);
    } else if (successCount > 0) {
      toast.success(`${successCount} attachment${successCount > 1 ? 's' : ''} uploaded`);
    }

    if (results.length > 0) {
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

  const updateAttachmentCategory = async (attachmentId: string, newCategory: DealAttachmentCategory, newPosition?: number) => {
    if (!user) return false;

    try {
      const updateData: { category: DealAttachmentCategory; position?: number } = { category: newCategory };
      if (newPosition !== undefined) {
        updateData.position = newPosition;
      }

      const { error } = await supabase
        .from('deal_attachments')
        .update(updateData)
        .eq('id', attachmentId);

      if (error) throw error;

      // Update local state optimistically
      setAttachments(prev => 
        prev.map(att => 
          att.id === attachmentId 
            ? { ...att, category: newCategory, position: newPosition ?? att.position } 
            : att
        )
      );

      toast.success('Attachment moved');
      return true;
    } catch (error) {
      console.error('Error updating attachment category:', error);
      toast.error('Failed to move attachment');
      return false;
    }
  };

  const reorderAttachments = async (reorderedIds: string[], category: DealAttachmentCategory) => {
    if (!user) return false;

    try {
      // Update positions in batch
      const updates = reorderedIds.map((id, index) => 
        supabase
          .from('deal_attachments')
          .update({ position: index })
          .eq('id', id)
      );

      await Promise.all(updates);

      // Update local state
      setAttachments(prev => {
        const updated = [...prev];
        reorderedIds.forEach((id, index) => {
          const att = updated.find(a => a.id === id);
          if (att) {
            att.position = index;
          }
        });
        // Sort by position within each category
        return updated.sort((a, b) => {
          if (a.category !== b.category) return a.category.localeCompare(b.category);
          return a.position - b.position;
        });
      });

      return true;
    } catch (error) {
      console.error('Error reordering attachments:', error);
      toast.error('Failed to save order');
      return false;
    }
  };

  return {
    attachments,
    isLoading,
    uploadAttachment,
    uploadMultipleAttachments,
    deleteAttachment,
    updateAttachmentCategory,
    reorderAttachments,
    refetch: fetchAttachments,
    formatFileSize,
  };
}
