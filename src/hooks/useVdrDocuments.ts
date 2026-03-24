import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useAuth } from '@/contexts/AuthContext';
import type { VdrDocument } from '@/components/vdr/types';
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

  // Sync folders with data_room_checklist_categories from settings
  const syncFoldersWithCategories = useCallback(async () => {
    if (!dealId || !company?.id || !user?.id) return;

    // Fetch categories from settings
    const { data: categories } = await supabase
      .from('data_room_checklist_categories')
      .select('name, position')
      .order('position', { ascending: true });

    const categoryNames = (categories || []).map((c: any) => c.name as string);
    if (categoryNames.length === 0) return;

    // Fetch existing root-level folders for this deal
    const { data: existingFolders } = await (supabase as any)
      .from('vdr_documents')
      .select('id, filename, sort_order')
      .eq('deal_id', dealId)
      .eq('is_folder', true)
      .eq('folder_path', '/');

    const existingNames = new Set((existingFolders || []).map((f: any) => f.filename as string));

    // Insert any missing category folders
    const missingFolders = categoryNames
      .filter(name => !existingNames.has(name))
      .map((name, i) => ({
        deal_id: dealId,
        company_id: company.id,
        filename: name,
        folder_path: '/',
        is_folder: true,
        source: 'dataroom',
        uploaded_by: user.id,
        sort_order: (categories || []).find((c: any) => c.name === name)?.position ?? (existingFolders?.length || 0) + i,
      }));

    if (missingFolders.length > 0) {
      await (supabase as any).from('vdr_documents').insert(missingFolders);
    }

    // Update sort_order of existing folders to match category positions
    for (const cat of categories || []) {
      const existing = (existingFolders || []).find((f: any) => f.filename === (cat as any).name);
      if (existing && existing.sort_order !== (cat as any).position) {
        await (supabase as any)
          .from('vdr_documents')
          .update({ sort_order: (cat as any).position })
          .eq('id', existing.id);
      }
    }

    // Remove folders that are not in the categories list (e.g. legacy "Team Communications")
    const categoryNameSet = new Set(categoryNames);
    const foldersToRemove = (existingFolders || []).filter((f: any) => !categoryNameSet.has(f.filename));
    for (const folder of foldersToRemove) {
      // Only remove if the folder is empty (no children)
      const { count: childCount } = await (supabase as any)
        .from('vdr_documents')
        .select('id', { count: 'exact', head: true })
        .eq('deal_id', dealId)
        .eq('folder_path', `/${folder.filename}/`);
      if ((childCount ?? 0) === 0) {
        await (supabase as any).from('vdr_documents').delete().eq('id', folder.id);
      }
    }

    if (missingFolders.length > 0 || foldersToRemove.length > 0) {
      await fetchDocuments();
    }
  }, [dealId, company?.id, user?.id, fetchDocuments]);

  useEffect(() => {
    if (dealId && company?.id) {
      fetchDocuments().then(() => syncFoldersWithCategories());
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
