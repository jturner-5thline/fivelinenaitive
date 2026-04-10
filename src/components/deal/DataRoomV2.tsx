import { useState, useMemo, useCallback, useRef, useEffect } from 'react';

import { Upload, Download, Settings, Share2, History, Keyboard, Send, Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import JSZip from 'jszip';
import { supabase } from '@/integrations/supabase/client';
import { useDealSpaceFinancials } from '@/hooks/useDealSpaceFinancials';
import { usePageAccessFlags } from '@/hooks/useFeatureFlags';
import { useDemoCapabilities } from '@/hooks/useDemoCapabilities';

import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';

import { useDataRoomChecklist, useDealChecklistStatus } from '@/hooks/useDataRoomChecklist';
import { useDealChecklistItems } from '@/hooks/useDealChecklistItems';
import { useChecklistCategories } from '@/hooks/useChecklistCategories';
import { useDealAttachments, type DealAttachment } from '@/hooks/useDealAttachments';
import { suggestMappings } from './data-room/helpers';
import { useFileChecklistMap } from '@/hooks/useFileChecklistMap';
import { useUploadJobs } from '@/hooks/useUploadJobs';
import { useDataRoomComments } from '@/hooks/useDataRoomComments';
import { useDataRoomAudit } from '@/hooks/useDataRoomAudit';
import { useDataRoomShareLinks } from '@/hooks/useDataRoomShareLinks';
import { useAuth } from '@/contexts/AuthContext';

import { CircularProgress } from './data-room/CircularProgress';
import { ChecklistTreePane } from './data-room/ChecklistTreePane';
import { FileListPane } from './data-room/FileListPane';

import { MappingDialog } from './data-room/MappingDialog';
import { FilePreviewPanel } from './data-room/FilePreviewPanel';
import { BreadcrumbTrail } from './data-room/BreadcrumbTrail';
import { ChecklistEditor } from './data-room/ChecklistEditor';
import { ShareLinkManager } from './data-room/ShareLinkManager';
import { AuditLogPanel } from './data-room/AuditLogPanel';
import type { UnifiedChecklistItem, StatusFilter, ProgressData } from './data-room/types';

interface DataRoomV2Props {
  dealId: string;
}

export function DataRoomV2({ dealId }: DataRoomV2Props) {
  const { user } = useAuth();
  const { hasPageAccess } = usePageAccessFlags();
  const { canPushFlex: demoCanPushFlex } = useDemoCapabilities();
  const canPushToFlex = hasPageAccess('flex_push') && demoCanPushFlex;

  // Data sources
  const { items: templateItems, loading: l1, addItem: addTemplateItem, updateItem: updateTemplateItem, deleteItem: deleteTemplateItem } = useDataRoomChecklist();
  const { items: dealItems, loading: l2, addItem: addDealItem, updateItem: updateDealItem, deleteItem: deleteDealItem } = useDealChecklistItems(dealId);
  const { statuses, toggleItemStatus } = useDealChecklistStatus(dealId);
  const { getCategoryByName } = useChecklistCategories();
  const { attachments, isLoading: l3, uploadAttachment, deleteAttachment, renameAttachment, refetch: refetchAttachments } = useDealAttachments(dealId);
  const { mappings, mapFileToItem, mapFileToItems, unmapFile, getFilesForItem, getItemsForFile, getUnmappedFileIds } = useFileChecklistMap(dealId);
  const { activeJob, createJob, completeJob } = useUploadJobs(dealId);
  const { comments, addComment, deleteComment, getCommentsForItem } = useDataRoomComments(dealId);
  const { entries: auditEntries, loading: auditLoading, logAction } = useDataRoomAudit(dealId);
  const { links: shareLinks, createLink, deactivateLink, deleteLink } = useDataRoomShareLinks(dealId);
  const { uploadFinancial } = useDealSpaceFinancials(dealId);

  // UI state
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showMappingDialog, setShowMappingDialog] = useState(false);
  const [filesToMap, setFilesToMap] = useState<DealAttachment[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<DealAttachment | null>(null);
  const [showChecklistEditor, setShowChecklistEditor] = useState(false);
  const [showShareLinks, setShowShareLinks] = useState(false);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [isPushingToFlex, setIsPushingToFlex] = useState(false);

  const handlePushToFlex = useCallback(async () => {
    setIsPushingToFlex(true);
    try {
      const attachmentData = attachments && attachments.length > 0
        ? await Promise.all(
            attachments.map(async (att) => {
              const { data: signedData } = await supabase.storage
                .from('deal-attachments')
                .createSignedUrl(att.file_path, 3600);
              return {
                name: att.name,
                category: att.category,
                url: signedData?.signedUrl || null,
                size_bytes: att.size_bytes,
                content_type: att.content_type,
              };
            })
          )
        : [];
      const { error } = await supabase.functions.invoke('push-to-flex', {
        body: {
          dealId,
          action: 'sync_data_room',
          dataRoomFiles: attachmentData.filter(a => a.url !== null),
        },
      });
      if (error) throw error;
      const fileCount = attachments?.length || 0;
      toast.success('Data Room pushed to FLEx', { description: fileCount > 0 ? `${fileCount} file(s) synced successfully.` : 'Data room cleared on FLEx.' });
      logAction('push_to_flex', 'room', undefined, undefined, { file_count: fileCount });
    } catch (error) {
      console.error('Error pushing data room to FLEx:', error);
      toast.error('Failed to push to FLEx', { description: error instanceof Error ? error.message : 'An error occurred' });
    } finally {
      setIsPushingToFlex(false);
    }
  }, [dealId, attachments, logAction]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Merge checklist items
  const allItems: UnifiedChecklistItem[] = useMemo(() => {
    const t = templateItems.map(i => ({ ...i, is_deal_specific: false as const }));
    return [...t, ...dealItems];
  }, [templateItems, dealItems]);

  // Group by category
  const grouped = useMemo(() => {
    const map: Record<string, UnifiedChecklistItem[]> = {};
    for (const item of allItems) {
      const cat = item.category || 'Other';
      if (!map[cat]) map[cat] = [];
      map[cat].push(item);
    }
    return map;
  }, [allItems]);

  const categories = Object.keys(grouped).sort((a, b) => a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b));

  // Status helpers
  const statusMap = useMemo(() => {
    const m = new Map<string, { isComplete: boolean; attachmentId: string | null }>();
    statuses.forEach(s => {
      const id = s.checklist_item_id || (s as any).deal_checklist_item_id;
      if (id) m.set(id, { isComplete: s.is_complete, attachmentId: s.attachment_id });
    });
    return m;
  }, [statuses]);

  // Unmapped files
  const unmappedFileIds = useMemo(() => getUnmappedFileIds(attachments.map(a => a.id)), [attachments, getUnmappedFileIds]);
  const unmappedFiles = attachments.filter(a => unmappedFileIds.includes(a.id));

  // Selected checklist item
  const selectedItem = allItems.find(i => i.id === selectedItemId) || null;
  const selectedItemFiles = useMemo(() => {
    if (!selectedItemId) return [];
    const fileMappings = getFilesForItem(selectedItemId);
    return fileMappings.map(m => attachments.find(a => a.id === m.file_id)).filter(Boolean) as DealAttachment[];
  }, [selectedItemId, getFilesForItem, attachments]);

  // Progress calculations
  const progressData: ProgressData = useMemo(() => {
    const sectionProgress: Record<string, { total: number; completed: number; required: number; requiredCompleted: number }> = {};
    let totalItems = 0, completedItems = 0, requiredTotal = 0, requiredCompleted = 0;

    for (const [cat, items] of Object.entries(grouped)) {
      let catCompleted = 0, catReqTotal = 0, catReqCompleted = 0;
      for (const item of items) {
        const hasFiles = getFilesForItem(item.id).length > 0;
        const isComplete = statusMap.get(item.id)?.isComplete || hasFiles;
        if (isComplete) { catCompleted++; completedItems++; }
        if (item.is_required) { catReqTotal++; requiredTotal++; if (isComplete) { catReqCompleted++; requiredCompleted++; } }
        totalItems++;
      }
      sectionProgress[cat] = { total: items.length, completed: catCompleted, required: catReqTotal, requiredCompleted: catReqCompleted };
    }

    return {
      overall: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
      totalItems, completedItems, requiredTotal, requiredCompleted,
      sections: sectionProgress,
    };
  }, [grouped, statusMap, getFilesForItem]);

  // Upload handler with audit logging
  const handleUploadFiles = useCallback(async (files: File[], targetItemId?: string) => {
    if (!user || files.length === 0) return;

    const jobType = files.length === 1 ? 'single' : 'multi';
    const job = await createJob(jobType as any, files.length);

    let successCount = 0, failCount = 0;
    const uploadedAttachments: DealAttachment[] = [];

    for (const file of files) {
      try {
        const att = await uploadAttachment(file, 'materials');
        if (att) { successCount++; uploadedAttachments.push(att as DealAttachment); }
        else failCount++;
      } catch { failCount++; }
    }

    if (job) await completeJob(job.id, successCount, failCount);
    await refetchAttachments();

    // Audit log + auto-link Excel files to financials section
    for (const att of uploadedAttachments) {
      logAction('upload', 'file', att.id, att.name, { size: att.size_bytes });
      // Feature #7: Auto-link Excel files to deal space financials
      const ext = att.name.split('.').pop()?.toLowerCase();
      if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        try {
          // Find the original file from the files array to pass to uploadFinancial
          const originalFile = files.find(f => f.name === att.name);
          if (originalFile) {
            await uploadFinancial(originalFile);
          }
        } catch (err) {
          console.error('Failed to auto-link Excel to financials:', err);
        }
      }
    }

    if (targetItemId && uploadedAttachments.length > 0) {
      for (const att of uploadedAttachments) {
        await mapFileToItem(att.id, targetItemId, 'manual_drag');
      }
      // Mark the target checklist item as complete
      await toggleItemStatus(targetItemId, true);
      toast.success(`${uploadedAttachments.length} file(s) uploaded and mapped`);
    } else if (uploadedAttachments.length > 0) {
      // Auto-map files with high-confidence matches
      let autoMapped = 0;
      const autoMappedItemIds = new Set<string>();
      for (const att of uploadedAttachments) {
        const suggestions = suggestMappings(att.name, allItems, 1);
        if (suggestions.length > 0 && suggestions[0].score > 0.6) {
          await mapFileToItem(att.id, suggestions[0].item.id, 'auto_suggest');
          autoMappedItemIds.add(suggestions[0].item.id);
          autoMapped++;
        }
      }

      // Mark auto-mapped checklist items as complete
      for (const itemId of autoMappedItemIds) {
        await toggleItemStatus(itemId, true);
      }

      // Show mapping dialog for remaining files
      const unmappedUploads = autoMapped < uploadedAttachments.length
        ? uploadedAttachments
        : [];
      
      if (autoMapped > 0) {
        toast.success(`${autoMapped} file(s) auto-mapped based on name matching`);
      }
      if (unmappedUploads.length > 0) {
        setFilesToMap(unmappedUploads);
        setShowMappingDialog(true);
      }
    }
  }, [user, createJob, completeJob, uploadAttachment, refetchAttachments, mapFileToItem, logAction, toggleItemStatus]);

  // Global drag/drop
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault(); dragCounterRef.current++; setIsDragOver(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault(); dragCounterRef.current--;
    if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setIsDragOver(false); }
  }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
  }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); dragCounterRef.current = 0; setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleUploadFiles(files);
  }, [handleUploadFiles]);

  // Download helpers
  const handleDownloadFile = useCallback((att: DealAttachment) => {
    if (att.url) {
      const link = document.createElement('a');
      link.href = att.url;
      link.download = att.name;
      link.click();
      logAction('download', 'file', att.id, att.name);
    }
  }, [logAction]);

  const handleExportIndex = useCallback(() => {
    const rows = [['Category', 'Item', 'Required', 'Status', 'Files Attached', 'File Names', 'Due Date']];
    for (const cat of categories) {
      for (const item of grouped[cat]) {
        const fileCount = getFilesForItem(item.id).length;
        const isComplete = statusMap.get(item.id)?.isComplete || fileCount > 0;
        const fileNames = getFilesForItem(item.id)
          .map(m => attachments.find(a => a.id === m.file_id)?.name)
          .filter(Boolean)
          .join('; ');
        rows.push([
          cat, item.name, item.is_required ? 'Yes' : 'No',
          isComplete ? 'Complete' : 'Missing', String(fileCount), fileNames,
          (item as any).due_date || '',
        ]);
      }
    }
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'data-room-index.csv'; link.click();
    URL.revokeObjectURL(url);
    logAction('export', 'checklist', undefined, 'data-room-index.csv');
    toast.success('Checklist index exported');
  }, [categories, grouped, getFilesForItem, statusMap, attachments, logAction]);

  const handleDownloadSection = useCallback(async (category: string) => {
    const items = grouped[category] || [];
    const filesToDownload: DealAttachment[] = [];
    for (const item of items) {
      for (const m of getFilesForItem(item.id)) {
        const att = attachments.find(a => a.id === m.file_id);
        if (att && att.url && !filesToDownload.some(f => f.id === att.id)) filesToDownload.push(att);
      }
    }
    if (filesToDownload.length === 0) { toast.error('No files to download in this section'); return; }
    await downloadAsZip(filesToDownload, `${category}.zip`);
    logAction('download', 'section', undefined, category);
  }, [grouped, getFilesForItem, attachments, logAction]);

  const handleDownloadAll = useCallback(async () => {
    const filesWithUrls = attachments.filter(a => a.url);
    if (filesWithUrls.length === 0) { toast.error('No files to download'); return; }
    await downloadAsZip(filesWithUrls, 'data-room.zip');
    logAction('download', 'all', undefined, 'data-room.zip');
  }, [attachments, logAction]);

  const openMappingDialog = useCallback((files: DealAttachment[]) => {
    setFilesToMap(files);
    setShowMappingDialog(true);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const flatItems = categories.flatMap(cat => grouped[cat]);
        const currentIdx = flatItems.findIndex(i => i.id === selectedItemId);
        const nextIdx = e.key === 'ArrowDown'
          ? Math.min(currentIdx + 1, flatItems.length - 1)
          : Math.max(currentIdx - 1, 0);
        if (flatItems[nextIdx]) setSelectedItemId(flatItems[nextIdx].id);
      }
      if (e.key === 'Escape') {
        if (previewFile) setPreviewFile(null);
        else if (selectedItemId) setSelectedItemId(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
        e.preventDefault();
        fileInputRef.current?.click();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [categories, grouped, selectedItemId, previewFile]);

  // Handle preview with audit
  const handleSetPreviewFile = useCallback((file: DealAttachment | null) => {
    setPreviewFile(file);
    if (file) logAction('preview', 'file', file.id, file.name);
  }, [logAction]);

  const loading = l1 || l2 || l3;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Global drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/5 border-2 border-dashed border-primary rounded-lg pointer-events-none">
          <div className="text-center">
            <Upload className="h-10 w-10 text-primary mx-auto mb-2" />
            <p className="text-lg font-semibold text-primary">Drop files to upload to Data Room</p>
          </div>
        </div>
      )}

      {/* Header with progress + breadcrumb */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <CircularProgress value={progressData.overall} size={48} />
          <div className="min-w-0">
            <BreadcrumbTrail
              category={selectedItem?.category}
              itemName={selectedItem?.name}
              onNavigateHome={() => setSelectedItemId(null)}
              onNavigateCategory={() => setSelectedItemId(null)}
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {progressData.completedItems}/{progressData.totalItems} items
              {progressData.requiredTotal > 0 && ` · ${progressData.requiredCompleted}/${progressData.requiredTotal} required`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowAuditLog(!showAuditLog)}>
                <History className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Activity Log</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowShareLinks(true)}>
                <Share2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Share Links</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowChecklistEditor(true)}>
                <Settings className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit Checklist</TooltipContent>
          </Tooltip>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1.5 h-7 text-xs">
            <Upload className="h-3 w-3" />
            Upload
          </Button>
          {canPushToFlex && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePushToFlex}
                disabled={isPushingToFlex}
                className="gap-1.5 h-7 text-xs border-primary/40 text-primary hover:bg-primary/10"
              >
                {isPushingToFlex ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                Push to FLEx
              </Button>
            </TooltipTrigger>
            <TooltipContent>Push data room files to FLEx</TooltipContent>
          </Tooltip>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) handleUploadFiles(files);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {/* Audit log collapsible */}
      {showAuditLog && (
        <div className="mb-3 border rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold">Activity Log</span>
            <Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={() => setShowAuditLog(false)}>Hide</Button>
          </div>
          <AuditLogPanel entries={auditEntries} loading={auditLoading} />
        </div>
      )}

      {/* Full-width layout: Checklist with nested files */}
      <div className="h-[640px]">
        <div className="h-full min-w-0 rounded-lg border border-border/70 bg-gradient-to-br from-card via-card/90 to-background/40 dark:border-[hsl(263,45%,40%,0.6)] dark:shadow-[0_0_12px_hsl(263,60%,50%,0.1)] overflow-hidden">
          <ChecklistTreePane
            categories={categories}
            grouped={grouped}
            progressData={progressData}
            statusMap={statusMap}
            selectedItemId={selectedItemId}
            setSelectedItemId={setSelectedItemId}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            getFilesForItem={getFilesForItem}
            getCategoryByName={getCategoryByName}
            unmappedFiles={unmappedFiles}
            handleUploadFiles={handleUploadFiles}
            attachments={attachments}
            getItemsForFile={getItemsForFile}
            setPreviewFile={handleSetPreviewFile}
            handleDownloadFile={handleDownloadFile}
            onOpenMappingDialog={openMappingDialog}
            allItems={allItems}
            deleteAttachment={deleteAttachment}
            onToggleItemStatus={toggleItemStatus}
            mapFileToItem={mapFileToItem}
            unmapFile={unmapFile}
          />
        </div>
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><Keyboard className="h-3 w-3" /> Shortcuts:</span>
        <span>↑↓ Navigate</span>
        <span>Esc Back</span>
        <span>⌘U Upload</span>
        <span>Double-click filename to rename</span>
      </div>

      {/* Upload progress toast */}
      {activeJob && activeJob.status === 'running' && (
        <div className="fixed bottom-4 right-4 z-50 bg-card border rounded-lg shadow-lg p-3 w-72">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-xs font-medium">Uploading files...</span>
          </div>
          <Progress value={(activeJob.files_uploaded_successfully / Math.max(activeJob.total_files_detected, 1)) * 100} className="h-1.5" />
          <p className="text-[10px] text-muted-foreground mt-1">
            {activeJob.files_uploaded_successfully}/{activeJob.total_files_detected} complete
          </p>
        </div>
      )}

      {/* Dialogs */}
      <MappingDialog
        open={showMappingDialog}
        onOpenChange={setShowMappingDialog}
        filesToMap={filesToMap}
        categories={categories}
        grouped={grouped}
        allItems={allItems}
        getItemsForFile={getItemsForFile}
        mapFileToItems={mapFileToItems}
        unmapFile={unmapFile}
        onMarkItemsComplete={async (itemIds) => {
          for (const itemId of itemIds) {
            await toggleItemStatus(itemId, true);
          }
        }}
      />

      <ChecklistEditor
        open={showChecklistEditor}
        onOpenChange={setShowChecklistEditor}
        categories={categories}
        grouped={grouped}
        onAddItem={addDealItem}
        onUpdateItem={updateDealItem}
        onDeleteItem={deleteDealItem}
        isDealSpecific
      />

      <ShareLinkManager
        open={showShareLinks}
        onOpenChange={setShowShareLinks}
        links={shareLinks}
        onCreateLink={createLink}
        onDeactivateLink={deactivateLink}
        onDeleteLink={deleteLink}
      />

      {/* File Preview */}
      {previewFile && (
        <FilePreviewPanel
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          onDownload={handleDownloadFile}
        />
      )}
    </div>
  );
}

// ZIP download utility
async function downloadAsZip(files: DealAttachment[], zipName: string) {
  const loadingToast = toast.loading(`Preparing ${zipName}...`);
  try {
    const zip = new JSZip();
    const fetchPromises = files.map(async (file) => {
      if (!file.url) return;
      try {
        const response = await fetch(file.url);
        const blob = await response.blob();
        zip.file(file.name, blob);
      } catch (err) {
        console.error(`Failed to fetch ${file.name}:`, err);
      }
    });
    await Promise.all(fetchPromises);
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = url; link.download = zipName; link.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${zipName}`, { id: loadingToast });
  } catch (err) {
    console.error('ZIP download error:', err);
    toast.error('Failed to create download', { id: loadingToast });
  }
}
