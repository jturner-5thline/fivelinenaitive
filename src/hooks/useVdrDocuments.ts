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

  // Audit log helper — fire-and-forget
  const logAudit = useCallback((
    actionType: string, entityType: string, entityId?: string, entityName?: string, metadata?: Record<string, any>
  ) => {
    if (!user?.id || !dealId) return;
    (supabase as any).from('deal_audit_log').insert({
      deal_id: dealId, user_id: user.id,
      action_type: actionType, entity_type: entityType,
      entity_id: entityId || null, entity_name: entityName || null,
      metadata: metadata || {},
    }).then(({ error }: any) => { if (error) console.error('Audit log error:', error); });
  }, [dealId, user?.id]);

  const fetchDocuments = useCallback(async () => {
    if (!dealId || !company?.id) return;
    const { data, error } = await (supabase as any)
      .from('vdr_documents')
      .select('*')
      .eq('deal_id', dealId)
      .eq('company_id', company.id)
      .is('deleted_at', null)
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

    const { data: categories } = await supabase
      .from('data_room_checklist_categories')
      .select('name, position')
      .order('position', { ascending: true });

    const categoryNames = (categories || []).map((c: any) => c.name as string);
    if (categoryNames.length === 0) return;

    const { data: existingFolders } = await (supabase as any)
      .from('vdr_documents')
      .select('id, filename, sort_order')
      .eq('deal_id', dealId)
      .eq('is_folder', true)
      .eq('folder_path', '/')
      .is('deleted_at', null);

    const existingNames = new Set((existingFolders || []).map((f: any) => f.filename as string));

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

    for (const cat of categories || []) {
      const existing = (existingFolders || []).find((f: any) => f.filename === (cat as any).name);
      if (existing && existing.sort_order !== (cat as any).position) {
        await (supabase as any)
          .from('vdr_documents')
          .update({ sort_order: (cat as any).position })
          .eq('id', existing.id);
      }
    }

    const categoryNameSet = new Set(categoryNames);
    const foldersToRemove = (existingFolders || []).filter((f: any) => !categoryNameSet.has(f.filename));
    for (const folder of foldersToRemove) {
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

  // Re-mirror Settings categories into per-deal VDR folder rows whenever the
  // category taxonomy changes (add/rename/delete/reorder). This guarantees the
  // Data Room and Internal sections always reflect the Settings source of truth.
  useEffect(() => {
    if (!dealId || !company?.id) return;
    const channel = supabase
      .channel(`vdr-categories-sync-${dealId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'data_room_checklist_categories' },
        () => { syncFoldersWithCategories(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [dealId, company?.id, syncFoldersWithCategories]);

  // Realtime subscription for live sync across company users
  useEffect(() => {
    if (!dealId) return;
    const channel = supabase
      .channel(`vdr-docs-${dealId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'vdr_documents',
        filter: `deal_id=eq.${dealId}`,
      }, () => { fetchDocuments(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [dealId, fetchDocuments]);

  const triggerIngestion = useCallback(async (documentIds: string[]) => {
    if (!documentIds.length) return;
    try {
      const { error } = await supabase.functions.invoke('vdr-ingest', {
        body: { document_ids: documentIds, deal_id: dealId },
      });
      if (error) {
        console.error('Ingestion error:', error);
      } else {
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

    logAudit('file_uploaded', 'file', inserted?.id, file.name, {
      folder: folderPath, file_size: file.size, file_type: file.type,
    });

    if (inserted?.id) {
      triggerIngestion([inserted.id]);
      // Fire-and-forget AI classification — runs in background while UI loads file.
      // The classify-file edge function inserts a "processing" row immediately so the
      // UI can show an "Analyzing with AI…" pill via useFileAiClassifications.
      supabase.functions.invoke('classify-file', {
        body: { document_id: inserted.id },
      }).catch((e) => {
        // Failures show in the UI as a "Retry AI" badge — don't toast here.
        console.warn('classify-file invoke failed (will surface in UI):', e);
      });
    }
  }, [dealId, company?.id, user?.id, fetchDocuments, triggerIngestion, logAudit]);

  const createFolder = useCallback(async (name: string, parentPath: string) => {
    if (!dealId || !company?.id || !user?.id) return;

    const { data: inserted } = await (supabase as any).from('vdr_documents').insert({
      deal_id: dealId,
      company_id: company.id,
      filename: name,
      folder_path: parentPath,
      is_folder: true,
      source: 'dataroom',
      uploaded_by: user.id,
    }).select('id').single();

    await fetchDocuments();
    toast.success(`Created folder "${name}"`);
    logAudit('folder_created', 'folder', inserted?.id, name, { parent_path: parentPath });
  }, [dealId, company?.id, user?.id, fetchDocuments, logAudit]);

  // Soft delete
  const deleteDocument = useCallback(async (doc: VdrDocument) => {
    if (!user?.id) return;
    await (supabase as any).from('vdr_documents')
      .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
      .eq('id', doc.id);
    await fetchDocuments();
    toast.success(`Deleted "${doc.filename}" — recoverable for 14 days`);
    logAudit('file_deleted', doc.is_folder ? 'folder' : 'file', doc.id, doc.filename, {
      folder: doc.folder_path, file_size: doc.file_size,
    });
  }, [fetchDocuments, user?.id, logAudit]);

  // Soft delete multiple
  const deleteDocuments = useCallback(async (docs: VdrDocument[]) => {
    if (!user?.id) return;
    const ids = docs.map(d => d.id);
    await (supabase as any).from('vdr_documents')
      .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
      .in('id', ids);
    await fetchDocuments();
    toast.success(`Deleted ${docs.length} file(s) — recoverable for 14 days`);
    for (const doc of docs) {
      logAudit('file_deleted', doc.is_folder ? 'folder' : 'file', doc.id, doc.filename, {
        folder: doc.folder_path,
      });
    }
  }, [fetchDocuments, user?.id, logAudit]);

  // Restore soft-deleted file
  const restoreDocument = useCallback(async (docId: string, docName?: string) => {
    await (supabase as any).from('vdr_documents')
      .update({ deleted_at: null, deleted_by: null })
      .eq('id', docId);
    await fetchDocuments();
    toast.success(`Restored "${docName || 'file'}"`);
    logAudit('file_restored', 'file', docId, docName);
  }, [fetchDocuments, logAudit]);

  const renameDocument = useCallback(async (id: string, newName: string) => {
    const doc = documents.find(d => d.id === id);
    await (supabase as any).from('vdr_documents').update({ filename: newName }).eq('id', id);
    await fetchDocuments();
    logAudit(doc?.is_folder ? 'folder_renamed' : 'file_renamed', doc?.is_folder ? 'folder' : 'file', id, newName, {
      old_name: doc?.filename, new_name: newName,
    });
  }, [fetchDocuments, documents, logAudit]);

  const moveDocument = useCallback(async (id: string, newFolderPath: string) => {
    const doc = documents.find(d => d.id === id);
    await (supabase as any).from('vdr_documents').update({ folder_path: newFolderPath }).eq('id', id);
    await fetchDocuments();
    logAudit('file_moved', 'file', id, doc?.filename, {
      old_folder: doc?.folder_path, new_folder: newFolderPath,
    });
  }, [fetchDocuments, documents, logAudit]);

  const getDownloadUrl = useCallback(async (filePath: string) => {
    const { data } = await supabase.storage.from('vdr-files').createSignedUrl(filePath, 3600);
    return data?.signedUrl || null;
  }, []);

  const toggleShareToDataroom = useCallback(async (docId: string, shared: boolean) => {
    const doc = documents.find(d => d.id === docId);
    await (supabase as any).from('vdr_documents').update({ shared_to_dataroom: shared }).eq('id', docId);
    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, shared_to_dataroom: shared } : d));
    logAudit(
      shared ? 'file_shared_to_dataroom' : 'file_unshared_from_dataroom',
      'file', docId, doc?.filename,
    );
  }, [documents, logAudit]);

  const bulkShareToDataroom = useCallback(async (docIds: string[], shared: boolean) => {
    await (supabase as any).from('vdr_documents').update({ shared_to_dataroom: shared }).in('id', docIds);
    setDocuments(prev => prev.map(d => docIds.includes(d.id) ? { ...d, shared_to_dataroom: shared } : d));
    for (const docId of docIds) {
      const doc = documents.find(d => d.id === docId);
      logAudit(
        shared ? 'file_shared_to_dataroom' : 'file_unshared_from_dataroom',
        'file', docId, doc?.filename,
      );
    }
  }, [documents, logAudit]);

  const fileCount = documents.filter(d => !d.is_folder).length;

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
    deleteDocuments,
    restoreDocument,
    renameDocument,
    moveDocument,
    getDownloadUrl,
    toggleShareToDataroom,
    bulkShareToDataroom,
    triggerIngestion,
    refetch: fetchDocuments,
  };
}
