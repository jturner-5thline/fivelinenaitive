import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useAuth } from '@/contexts/AuthContext';
import type { VdrDocument } from '@/components/vdr/types';
import { VDR_DEFAULT_FOLDERS } from '@/components/vdr/types';
import { toast } from 'sonner';

export function useVdrDocuments(dealId: string) {
  const { user } = useAuth();
  const { company } = useCompany();
  const [documents, setDocuments] = useState<VdrDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDocuments = useCallback(async () => {
    if (!dealId || !company?.id) return;
    const { data, error } = await (supabase as any)
      .from('vdr_documents')
      .select('*')
      .eq('deal_id', dealId)
      .eq('company_id', company.id)
      .order('sort_order', { ascending: true })
      .order('filename', { ascending: true });

    if (error) {
      console.error('Error fetching VDR documents:', error);
      return;
    }
    setDocuments(data || []);
    setLoading(false);
  }, [dealId, company?.id]);

  // Seed default folders if none exist
  const seedDefaultFolders = useCallback(async () => {
    if (!dealId || !company?.id) return;

    const { count } = await (supabase as any)
      .from('vdr_documents')
      .select('id', { count: 'exact', head: true })
      .eq('deal_id', dealId)
      .eq('is_folder', true);

    if ((count ?? 0) > 0) return;

    const folders = VDR_DEFAULT_FOLDERS.map((name, i) => ({
      deal_id: dealId,
      company_id: company.id,
      filename: name,
      folder_path: '/',
      is_folder: true,
      source: name === 'Team Communications' ? 'team_comms' : 'dataroom',
      uploaded_by: user?.id,
      sort_order: i,
    }));

    await (supabase as any).from('vdr_documents').insert(folders);
    await fetchDocuments();
  }, [dealId, company?.id, user?.id, fetchDocuments]);

  useEffect(() => {
    if (dealId && company?.id) {
      fetchDocuments().then(() => seedDefaultFolders());
    }
  }, [dealId, company?.id]);

  // Trigger ingestion for newly uploaded documents
  const triggerIngestion = useCallback(async (documentIds: string[]) => {
    if (!documentIds.length) return;
    try {
      const { error } = await supabase.functions.invoke('vdr-ingest', {
        body: { document_ids: documentIds, deal_id: dealId },
      });
      if (error) {
        console.error('Ingestion error:', error);
      } else {
        // Poll for completion
        const poll = async (attempts = 0) => {
          if (attempts > 30) return;
          await new Promise(r => setTimeout(r, 3000));
          await fetchDocuments();
          const updated = documents.filter(d => documentIds.includes(d.id));
          const allDone = updated.every(d => (d as any).ingestion_status === 'complete' || (d as any).ingestion_status === 'failed');
          if (!allDone) await poll(attempts + 1);
        };
        poll();
      }
    } catch (e) {
      console.error('Ingestion invoke error:', e);
    }
  }, [dealId, fetchDocuments, documents]);

  const uploadFile = useCallback(async (file: File, folderPath: string, source: VdrDocument['source'] = 'dataroom') => {
    if (!dealId || !company?.id || !user?.id) return;

    const storagePath = `${dealId}${folderPath}${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from('vdr-files')
      .upload(storagePath, file, { upsert: true });

    if (uploadError) {
      toast.error(`Failed to upload ${file.name}`);
      console.error(uploadError);
      return;
    }

    const { data: inserted } = await (supabase as any).from('vdr_documents').insert({
      deal_id: dealId,
      company_id: company.id,
      filename: file.name,
      file_path: storagePath,
      file_size: file.size,
      file_type: file.type || file.name.split('.').pop(),
      folder_path: folderPath,
      is_folder: false,
      source,
      uploaded_by: user.id,
      ingestion_status: 'pending',
    }).select('id').single();

    await fetchDocuments();
    toast.success(`Uploaded ${file.name}`);

    // Fire-and-forget ingestion
    if (inserted?.id) {
      triggerIngestion([inserted.id]);
    }
  }, [dealId, company?.id, user?.id, fetchDocuments, triggerIngestion]);

  const createFolder = useCallback(async (name: string, parentPath: string) => {
    if (!dealId || !company?.id || !user?.id) return;

    await (supabase as any).from('vdr_documents').insert({
      deal_id: dealId,
      company_id: company.id,
      filename: name,
      folder_path: parentPath,
      is_folder: true,
      source: 'dataroom',
      uploaded_by: user.id,
    });

    await fetchDocuments();
    toast.success(`Created folder "${name}"`);
  }, [dealId, company?.id, user?.id, fetchDocuments]);

  const deleteDocument = useCallback(async (doc: VdrDocument) => {
    if (doc.file_path) {
      await supabase.storage.from('vdr-files').remove([doc.file_path]);
    }
    await (supabase as any).from('vdr_documents').delete().eq('id', doc.id);
    await fetchDocuments();
    toast.success(`Deleted "${doc.filename}"`);
  }, [fetchDocuments]);

  const renameDocument = useCallback(async (id: string, newName: string) => {
    await (supabase as any).from('vdr_documents').update({ filename: newName }).eq('id', id);
    await fetchDocuments();
  }, [fetchDocuments]);

  const moveDocument = useCallback(async (id: string, newFolderPath: string) => {
    await (supabase as any).from('vdr_documents').update({ folder_path: newFolderPath }).eq('id', id);
    await fetchDocuments();
  }, [fetchDocuments]);

  const getDownloadUrl = useCallback(async (filePath: string) => {
    const { data } = await supabase.storage.from('vdr-files').createSignedUrl(filePath, 3600);
    return data?.signedUrl || null;
  }, []);

  const fileCount = documents.filter(d => !d.is_folder).length;

  // Ingestion stats
  const ingestionStats = {
    pending: documents.filter(d => !d.is_folder && (d as any).ingestion_status === 'pending').length,
    processing: documents.filter(d => !d.is_folder && (d as any).ingestion_status === 'processing').length,
    complete: documents.filter(d => !d.is_folder && (d as any).ingestion_status === 'complete').length,
    failed: documents.filter(d => !d.is_folder && (d as any).ingestion_status === 'failed').length,
  };

  return {
    documents,
    loading,
    fileCount,
    ingestionStats,
    uploadFile,
    createFolder,
    deleteDocument,
    renameDocument,
    moveDocument,
    getDownloadUrl,
    triggerIngestion,
    refetch: fetchDocuments,
  };
}
