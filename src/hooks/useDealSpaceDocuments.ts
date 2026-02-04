import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface DealSpaceDocument {
  id: string;
  deal_id: string;
  name: string;
  file_path: string;
  content_type: string | null;
  size_bytes: number;
  created_at: string;
  user_id: string | null;
  source?: 'deal_space' | 'data_room'; // Track where the document came from
  storage_bucket?: string; // Track which bucket to use for downloads
}

export function useDealSpaceDocuments(dealId: string | undefined) {
  const [documents, setDocuments] = useState<DealSpaceDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  // Fetch documents from both deal_space_documents and deal_attachments
  const fetchDocuments = useCallback(async () => {
    if (!dealId) return;
    
    try {
      // Fetch from deal_space_documents
      const { data: dealSpaceDocs, error: dealSpaceError } = await supabase
        .from('deal_space_documents')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false });

      if (dealSpaceError) throw dealSpaceError;

      // Fetch from deal_attachments (Data Room files)
      const { data: dataRoomDocs, error: dataRoomError } = await supabase
        .from('deal_attachments')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false });

      if (dataRoomError) throw dataRoomError;

      // Transform and combine documents
      const dealSpaceDocuments: DealSpaceDocument[] = (dealSpaceDocs || []).map(doc => ({
        ...doc,
        source: 'deal_space' as const,
        storage_bucket: 'deal-space',
      }));

      const dataRoomDocuments: DealSpaceDocument[] = (dataRoomDocs || []).map(doc => ({
        id: doc.id,
        deal_id: doc.deal_id,
        name: doc.name,
        file_path: doc.file_path,
        content_type: doc.content_type,
        size_bytes: doc.size_bytes,
        created_at: doc.created_at,
        user_id: doc.user_id,
        source: 'data_room' as const,
        storage_bucket: 'deal-attachments',
      }));

      // Combine and sort by created_at descending
      const allDocuments = [...dealSpaceDocuments, ...dataRoomDocuments].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setDocuments(allDocuments);
    } catch (error) {
      console.error('Error fetching deal space documents:', error);
    } finally {
      setIsLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Upload document
  const uploadDocument = useCallback(async (file: File) => {
    if (!dealId) return null;
    
    setIsUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Upload file to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${dealId}/${crypto.randomUUID()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('deal-space')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Create database record
      const { data, error: dbError } = await supabase
        .from('deal_space_documents' as any)
        .insert({
          deal_id: dealId,
          name: file.name,
          file_path: fileName,
          content_type: file.type,
          size_bytes: file.size,
          user_id: user.id,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      const newDoc = data as unknown as DealSpaceDocument;
      setDocuments(prev => [newDoc, ...prev]);
      toast({ title: 'Document uploaded', description: `${file.name} added to Deal Space` });
      return newDoc;
    } catch (error) {
      console.error('Error uploading document:', error);
      toast({ 
        title: 'Upload failed', 
        description: error instanceof Error ? error.message : 'Failed to upload document',
        variant: 'destructive' 
      });
      return null;
    } finally {
      setIsUploading(false);
    }
  }, [dealId]);

  // Delete document
  const deleteDocument = useCallback(async (doc: DealSpaceDocument) => {
    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('deal-space')
        .remove([doc.file_path]);

      if (storageError) console.error('Storage deletion error:', storageError);

      // Delete from database
      const { error: dbError } = await supabase
        .from('deal_space_documents' as any)
        .delete()
        .eq('id', doc.id);

      if (dbError) throw dbError;

      setDocuments(prev => prev.filter(d => d.id !== doc.id));
      toast({ title: 'Document deleted', description: `${doc.name} removed from Deal Space` });
    } catch (error) {
      console.error('Error deleting document:', error);
      toast({ 
        title: 'Delete failed', 
        description: error instanceof Error ? error.message : 'Failed to delete document',
        variant: 'destructive' 
      });
    }
  }, []);

  // Get signed URL for download - uses the correct bucket based on source
  const getDownloadUrl = useCallback(async (doc: DealSpaceDocument) => {
    try {
      const bucket = doc.storage_bucket || 'deal-space';
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(doc.file_path, 3600);

      if (error) throw error;
      return data.signedUrl;
    } catch (error) {
      console.error('Error getting download URL:', error);
      return null;
    }
  }, []);

  return {
    documents,
    isLoading,
    isUploading,
    uploadDocument,
    deleteDocument,
    getDownloadUrl,
    refetch: fetchDocuments,
  };
}
