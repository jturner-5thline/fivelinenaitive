import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { isDemoEmail } from '@/lib/demoLenderContact';
import { buildDemoSeedDocuments, isDemoSeedDocId } from '@/lib/demoDealSeedContent';

export interface DealSpaceDocument {
  id: string;
  deal_id: string;
  name: string;
  file_path: string;
  content_type: string | null;
  size_bytes: number;
  created_at: string;
  user_id: string | null;
  source?: 'deal_space' | 'data_room' | 'vdr_internal'; // Track where the document came from
  storage_bucket?: string; // Track which bucket to use for downloads
  /**
   * Display category derived from the source folder. For vdr_internal docs
   * this is the top-level folder name (Materials, Financials, Agreements,
   * Other, KPIs & Metrics, or "Uncategorized"). For deal_attachments it
   * mirrors the existing `category` column. Optional for legacy rows.
   */
  category?: string | null;
}

const VDR_UNCATEGORIZED = 'Uncategorized';

/** Derive the top-level folder bucket from a vdr_documents.folder_path. */
function deriveVdrCategory(folderPath: string | null | undefined): string {
  const fp = (folderPath || '/').replace(/^\/+|\/+$/g, '');
  if (!fp) return VDR_UNCATEGORIZED;
  return fp.split('/')[0] || VDR_UNCATEGORIZED;
}

/** Pretty label for a deal_attachments.category enum value. */
function prettyAttachmentCategory(c: string | null | undefined): string {
  if (!c) return VDR_UNCATEGORIZED;
  switch (c) {
    case 'materials': return 'Materials';
    case 'financials': return 'Financials';
    case 'agreements': return 'Agreements';
    case 'other': return 'Other';
    default: return c;
  }
}

export function useDealSpaceDocuments(dealId: string | undefined) {
  const [documents, setDocuments] = useState<DealSpaceDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  // Fetch documents from deal_space_documents, deal_attachments, AND
  // vdr_documents (Internal column only). Single source of truth — we
  // never duplicate file rows; the Deal Space view is purely a read
  // projection over the same underlying tables.
  const fetchDocuments = useCallback(async () => {
    if (!dealId) return;
    
    try {
      const [dsRes, daRes, vdrRes, exRes] = await Promise.all([
        supabase
          .from('deal_space_documents')
          .select('*')
          .eq('deal_id', dealId)
          .order('created_at', { ascending: false }),
        supabase
          .from('deal_attachments')
          .select('*')
          .eq('deal_id', dealId)
          .order('created_at', { ascending: false }),
        // Internal column of the Data Room: vdr_documents that are real
        // files (not folders) and have not been soft-deleted. Files that
        // have ALSO been shared to the external Data Room still live in
        // Internal (copy/share semantics) and are therefore included here.
        supabase
          .from('vdr_documents')
          .select('id, deal_id, filename, file_path, file_size, file_type, folder_path, uploaded_by, created_at, shared_to_dataroom, is_folder, deleted_at')
          .eq('deal_id', dealId)
          .eq('is_folder', false)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('deal_document_exclusions' as any)
          .select('document_source, document_id')
          .eq('deal_id', dealId),
      ]);

      if (dsRes.error) throw dsRes.error;
      if (daRes.error) throw daRes.error;
      if (vdrRes.error) throw vdrRes.error;

      const excludedKeys = new Set<string>(
        ((exRes.data as any[]) || []).map((r) => `${r.document_source}:${r.document_id}`)
      );
      const isExcluded = (source: DealSpaceDocument['source'], id: string) =>
        excludedKeys.has(`${source}:${id}`);

      // Transform and combine documents
      const dealSpaceDocuments: DealSpaceDocument[] = (dsRes.data || []).map((doc: any) => ({
        ...doc,
        source: 'deal_space' as const,
        storage_bucket: 'deal-space',
        category: null,
      })).filter(d => !isExcluded('deal_space', d.id));

      const dataRoomDocuments: DealSpaceDocument[] = (daRes.data || []).map((doc: any) => ({
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
        category: prettyAttachmentCategory(doc.category),
      })).filter(d => !isExcluded('data_room', d.id));

      // vdr_documents → Internal-origin files. Mirror, don't copy.
      const vdrInternalDocuments: DealSpaceDocument[] = (vdrRes.data || []).map((doc: any) => ({
        id: doc.id,
        deal_id: String(doc.deal_id),
        name: doc.filename,
        file_path: doc.file_path || '',
        content_type: doc.file_type ?? null,
        size_bytes: Number(doc.file_size ?? 0),
        created_at: doc.created_at,
        user_id: doc.uploaded_by ?? null,
        source: 'vdr_internal' as const,
        storage_bucket: 'vdr-files',
        category: deriveVdrCategory(doc.folder_path),
      })).filter(d => !isExcluded('vdr_internal', d.id));

      // Combine and sort by created_at descending
      const allDocuments = [
        ...dealSpaceDocuments,
        ...dataRoomDocuments,
        ...vdrInternalDocuments,
      ].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      // Demo-only: when no real files exist, render seeded synthetic
      // documents so the section never appears empty during demos.
      // These are visual placeholders only — never written to storage
      // or the database; downstream actions are short-circuited below.
      if (allDocuments.length === 0) {
        const { data: { user } } = await supabase.auth.getUser();
        if (isDemoEmail(user?.email)) {
          setDocuments(buildDemoSeedDocuments(dealId));
        } else {
          setDocuments(allDocuments);
        }
      } else {
        setDocuments(allDocuments);
      }
    } catch (error) {
      console.error('Error fetching deal space documents:', error);
    } finally {
      setIsLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Realtime: re-fetch whenever Internal-side files change (insert /
  // update / delete on vdr_documents for this deal). This satisfies the
  // requirement that Deal Space mirrors Internal in real time without
  // any manual sync step.
  useEffect(() => {
    if (!dealId) return;
    const channel = supabase
      .channel(`deal-space-docs-${dealId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vdr_documents', filter: `deal_id=eq.${dealId}` },
        () => { fetchDocuments(); },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'deal_attachments', filter: `deal_id=eq.${dealId}` },
        () => { fetchDocuments(); },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'deal_space_documents', filter: `deal_id=eq.${dealId}` },
        () => { fetchDocuments(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [dealId, fetchDocuments]);

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

      // Fire-and-forget text extraction so the AI can search this file's contents.
      // Status is tracked on the row (extraction_status); no UI block on the upload path.
      try {
        supabase.functions
          .invoke('deal-document-extract', {
            body: { documentId: newDoc.id, source: 'deal_space' },
          })
          .catch((err) => console.warn('[deal-space] extract trigger failed:', err));
      } catch (err) {
        console.warn('[deal-space] extract invoke error:', err);
      }

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
    // Seeded demo documents are visual-only — drop from local state.
    if (isDemoSeedDocId(doc.id)) {
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
      toast({ title: 'Document removed' });
      return true;
    }
    try {
      // Internal (vdr_documents) and Data Room (deal_attachments) files
      // are owned by their respective surfaces. Deletes in Deal Space
      // would otherwise cascade to those surfaces in surprising ways,
      // so we block here and tell the user to delete from the source.
      if (doc.source === 'vdr_internal') {
        toast({
          title: 'Open the Data Room to delete',
          description: 'This file lives in the Internal section of the Data Room. Delete it there and it will disappear from Deal Space automatically.',
        });
        return false;
      }
      if (doc.source === 'data_room') {
        toast({
          title: 'Open the Data Room to delete',
          description: 'This file lives in the Data Room. Delete it there to remove it from Deal Space.',
        });
        return false;
      }

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
      return true;
    } catch (error) {
      console.error('Error deleting document:', error);
      toast({ 
        title: 'Failed to delete. Please try again.',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive' 
      });
      return false;
    }
  }, []);

  // ── New two-path destructive actions ────────────────────────────────
  // "Remove from Deal Space": detach the document from this deal only.
  // For deal_space-native uploads we delete the row + storage object
  // (those rows are by definition deal-scoped). For data_room and
  // vdr_internal mirrors we record an exclusion so the file disappears
  // from this deal's Documents list and is excluded from Ask AI for
  // this deal, while leaving the canonical Data Room file intact.
  const removeFromDealSpace = useCallback(async (doc: DealSpaceDocument) => {
    if (!dealId) return false;
    if (isDemoSeedDocId(doc.id)) {
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
      toast({ title: 'Removed from Deal Space.' });
      return true;
    }
    try {
      if (doc.source === 'deal_space') {
        const { error: storageError } = await supabase.storage
          .from('deal-space')
          .remove([doc.file_path]);
        if (storageError) console.error('Storage deletion error:', storageError);
        const { error: dbError } = await supabase
          .from('deal_space_documents' as any)
          .delete()
          .eq('id', doc.id);
        if (dbError) throw dbError;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase
          .from('deal_document_exclusions' as any)
          .insert({
            deal_id: dealId,
            document_source: doc.source,
            document_id: doc.id,
            excluded_by: user?.id ?? null,
          });
        if (error && !String(error.message || '').includes('duplicate')) throw error;
      }
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
      toast({
        title: 'Removed from Deal Space.',
        description: 'This file no longer appears in Documents or feeds Ask AI for this deal.',
      });
      return true;
    } catch (error) {
      console.error('Error removing from Deal Space:', error);
      toast({
        title: 'Failed to remove from Deal Space. Please try again.',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
      return false;
    }
  }, [dealId]);

  // "Delete entirely from Data Room": permanently delete the canonical
  // file. Cascades naturally: deal_space rows are deleted; data_room
  // (deal_attachments) rows are deleted; vdr_documents rows are
  // soft-deleted (deleted_at), and any deal_document_exclusions for
  // the same id are cleaned up.
  const deleteEntirely = useCallback(async (doc: DealSpaceDocument) => {
    if (isDemoSeedDocId(doc.id)) {
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
      toast({ title: 'Deleted from Data Room.' });
      return true;
    }
    try {
      if (doc.source === 'deal_space') {
        const { error: storageError } = await supabase.storage
          .from('deal-space')
          .remove([doc.file_path]);
        if (storageError) console.error('Storage deletion error:', storageError);
        const { error: dbError } = await supabase
          .from('deal_space_documents' as any)
          .delete()
          .eq('id', doc.id);
        if (dbError) throw dbError;
      } else if (doc.source === 'data_room') {
        if (doc.file_path) {
          const { error: storageError } = await supabase.storage
            .from('deal-attachments')
            .remove([doc.file_path]);
          if (storageError) console.error('Storage deletion error:', storageError);
        }
        const { error: dbError } = await supabase
          .from('deal_attachments' as any)
          .delete()
          .eq('id', doc.id);
        if (dbError) throw dbError;
      } else if (doc.source === 'vdr_internal') {
        const { error: dbError } = await supabase
          .from('vdr_documents' as any)
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', doc.id);
        if (dbError) throw dbError;
      }

      // Clean up any prior exclusion row for the same id (best-effort)
      await supabase
        .from('deal_document_exclusions' as any)
        .delete()
        .eq('document_id', doc.id);

      setDocuments(prev => prev.filter(d => d.id !== doc.id));
      toast({
        title: 'Deleted from Data Room.',
        description: 'This file and its AI artifacts have been removed.',
      });
      return true;
    } catch (error) {
      console.error('Error deleting from Data Room:', error);
      toast({
        title: 'Failed to delete from Data Room. Please try again.',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
      return false;
    }
  }, []);

  // Get signed URL for download - uses the correct bucket based on source
  const getDownloadUrl = useCallback(async (doc: DealSpaceDocument) => {
    if (isDemoSeedDocId(doc.id)) {
      toast({
        title: 'Demo document',
        description: 'This is a seeded demo file with no underlying content.',
      });
      return null;
    }
    try {
      const bucket = doc.storage_bucket || 'deal-space';
      if (!doc.file_path) return null;
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
    removeFromDealSpace,
    deleteEntirely,
    getDownloadUrl,
    refetch: fetchDocuments,
  };
}
