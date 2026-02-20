import { useState, useMemo, useCallback, useRef } from 'react';
import { Upload, Download } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import JSZip from 'jszip';

import { useDataRoomChecklist, useDealChecklistStatus } from '@/hooks/useDataRoomChecklist';
import { useDealChecklistItems } from '@/hooks/useDealChecklistItems';
import { useChecklistCategories } from '@/hooks/useChecklistCategories';
import { useDealAttachments, type DealAttachment } from '@/hooks/useDealAttachments';
import { useFileChecklistMap } from '@/hooks/useFileChecklistMap';
import { useUploadJobs } from '@/hooks/useUploadJobs';
import { useAuth } from '@/contexts/AuthContext';

import { CircularProgress } from './data-room/CircularProgress';
import { ChecklistTreePane } from './data-room/ChecklistTreePane';
import { FileListPane } from './data-room/FileListPane';
import { ContextPane } from './data-room/ContextPane';
import { MappingDialog } from './data-room/MappingDialog';
import { FilePreviewPanel } from './data-room/FilePreviewPanel';
import type { UnifiedChecklistItem, StatusFilter, ProgressData } from './data-room/types';

interface DataRoomV2Props {
  dealId: string;
}

export function DataRoomV2({ dealId }: DataRoomV2Props) {
  const { user } = useAuth();

  // Data sources
  const { items: templateItems, loading: l1 } = useDataRoomChecklist();
  const { items: dealItems, loading: l2 } = useDealChecklistItems(dealId);
  const { statuses, toggleItemStatus } = useDealChecklistStatus(dealId);
  const { getCategoryByName } = useChecklistCategories();
  const { attachments, isLoading: l3, uploadAttachment, deleteAttachment, refetch: refetchAttachments } = useDealAttachments(dealId);
  const { mappings, mapFileToItem, mapFileToItems, unmapFile, getFilesForItem, getItemsForFile, getUnmappedFileIds } = useFileChecklistMap(dealId);
  const { activeJob, createJob, completeJob } = useUploadJobs(dealId);

  // UI state
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showMappingDialog, setShowMappingDialog] = useState(false);
  const [filesToMap, setFilesToMap] = useState<DealAttachment[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<DealAttachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

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

  // Upload handler
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

    if (targetItemId && uploadedAttachments.length > 0) {
      for (const att of uploadedAttachments) {
        await mapFileToItem(att.id, targetItemId, 'manual_drag');
      }
      toast.success(`${uploadedAttachments.length} file(s) uploaded and mapped`);
    } else if (uploadedAttachments.length > 0) {
      setFilesToMap(uploadedAttachments);
      setShowMappingDialog(true);
    }
  }, [user, createJob, completeJob, uploadAttachment, refetchAttachments, mapFileToItem]);

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
  const handleDownloadFile = (att: DealAttachment) => {
    if (att.url) {
      const link = document.createElement('a');
      link.href = att.url;
      link.download = att.name;
      link.click();
    }
  };

  const handleExportIndex = useCallback(() => {
    const rows = [['Category', 'Item', 'Required', 'Status', 'Files Attached', 'File Names']];
    for (const cat of categories) {
      for (const item of grouped[cat]) {
        const fileCount = getFilesForItem(item.id).length;
        const isComplete = statusMap.get(item.id)?.isComplete || fileCount > 0;
        const fileNames = getFilesForItem(item.id)
          .map(m => attachments.find(a => a.id === m.file_id)?.name)
          .filter(Boolean)
          .join('; ');
        rows.push([
          cat,
          item.name,
          item.is_required ? 'Yes' : 'No',
          isComplete ? 'Complete' : 'Missing',
          String(fileCount),
          fileNames,
        ]);
      }
    }
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'data-room-index.csv';
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Checklist index exported');
  }, [categories, grouped, getFilesForItem, statusMap, attachments]);

  const handleDownloadSection = useCallback(async (category: string) => {
    const items = grouped[category] || [];
    const filesToDownload: DealAttachment[] = [];
    for (const item of items) {
      const fileMappings = getFilesForItem(item.id);
      for (const m of fileMappings) {
        const att = attachments.find(a => a.id === m.file_id);
        if (att && att.url && !filesToDownload.some(f => f.id === att.id)) {
          filesToDownload.push(att);
        }
      }
    }
    if (filesToDownload.length === 0) {
      toast.error('No files to download in this section');
      return;
    }
    await downloadAsZip(filesToDownload, `${category}.zip`);
  }, [grouped, getFilesForItem, attachments]);

  const handleDownloadAll = useCallback(async () => {
    const filesWithUrls = attachments.filter(a => a.url);
    if (filesWithUrls.length === 0) {
      toast.error('No files to download');
      return;
    }
    await downloadAsZip(filesWithUrls, 'data-room.zip');
  }, [attachments]);

  const openMappingDialog = useCallback((files: DealAttachment[]) => {
    setFilesToMap(files);
    setShowMappingDialog(true);
  }, []);

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

      {/* Header with overall progress */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <CircularProgress value={progressData.overall} size={52} />
          <div>
            <h3 className="font-semibold text-sm">Data Room Progress</h3>
            <p className="text-xs text-muted-foreground">
              {progressData.completedItems}/{progressData.totalItems} items complete
              {progressData.requiredTotal > 0 && ` · ${progressData.requiredCompleted}/${progressData.requiredTotal} required`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1.5">
            <Upload className="h-3.5 w-3.5" />
            Upload Files
          </Button>
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

      {/* Three-pane layout */}
      <div className="grid grid-cols-12 gap-3 min-h-[500px]">
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
        />

        <FileListPane
          selectedItem={selectedItem}
          selectedItemFiles={selectedItemFiles}
          attachments={attachments}
          selectedFiles={selectedFiles}
          setSelectedFiles={setSelectedFiles}
          getItemsForFile={getItemsForFile}
          getFilesForItem={getFilesForItem}
          handleDownloadFile={handleDownloadFile}
          handleUploadFiles={handleUploadFiles}
          deleteAttachment={deleteAttachment}
          setSelectedItemId={setSelectedItemId}
          setPreviewFile={setPreviewFile}
          onOpenMappingDialog={openMappingDialog}
          fileInputRef={fileInputRef}
          allItems={allItems}
        />

        <ContextPane
          selectedItem={selectedItem}
          selectedItemFiles={selectedItemFiles}
          statusMap={statusMap}
          progressData={progressData}
          categories={categories}
          allItems={allItems}
          attachments={attachments}
          unmappedFiles={unmappedFiles}
          getFilesForItem={getFilesForItem}
          mapFileToItem={mapFileToItem}
          unmapFile={unmapFile}
          handleUploadFiles={handleUploadFiles}
          handleDownloadFile={handleDownloadFile}
          setSelectedItemId={setSelectedItemId}
          setPreviewFile={setPreviewFile}
          onExportIndex={handleExportIndex}
          onDownloadSection={handleDownloadSection}
          onDownloadAll={handleDownloadAll}
        />
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

      {/* Mapping Dialog */}
      <MappingDialog
        open={showMappingDialog}
        onOpenChange={setShowMappingDialog}
        filesToMap={filesToMap}
        categories={categories}
        grouped={grouped}
        allItems={allItems}
        getItemsForFile={getItemsForFile}
        mapFileToItems={mapFileToItems}
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
    link.href = url;
    link.download = zipName;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${zipName}`, { id: loadingToast });
  } catch (err) {
    console.error('ZIP download error:', err);
    toast.error('Failed to create download', { id: loadingToast });
  }
}
