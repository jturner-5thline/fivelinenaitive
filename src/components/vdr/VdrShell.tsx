import { useState, useCallback, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useDealsContext } from '@/contexts/DealsContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';

import { useVdrDocuments } from '@/hooks/useVdrDocuments';
import { usePageAccessFlags } from '@/hooks/useFeatureFlags';
import { useDemoCapabilities } from '@/hooks/useDemoCapabilities';
import { useDefaultChecklistConfig, findMatchingConfig } from '@/hooks/useDefaultChecklistConfig';
import { useDealTypes } from '@/contexts/DealTypesContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { VdrDocument } from './types';
import { classifyFileToFolder } from '@/utils/vdrFileClassifier';

import { VdrSidebar, type VdrView } from './VdrSidebar';
import { VdrCenterPanel } from './VdrCenterPanel';
import { VdrPreviewPanel } from './VdrPreviewPanel';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { FolderOpen, FolderClosed, FileText, Search, Lock, Check, CheckCheck, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';

interface VdrShellProps {
  dealId: string;
  embedded?: boolean;
}

interface FileAssignment {
  folder: string;
  checklistIds: Set<string>;
}

function getFileIcon(name: string) {
  const safeName = typeof name === 'string' ? name : '';
  const ext = safeName.includes('.') ? safeName.split('.').pop()?.toLowerCase() : '';
  if (ext === 'pdf') return <FileText className="h-3.5 w-3.5 text-red-400" />;
  if (['xls', 'xlsx', 'csv'].includes(ext || '')) return <FileText className="h-3.5 w-3.5 text-green-400" />;
  if (['doc', 'docx'].includes(ext || '')) return <FileText className="h-3.5 w-3.5 text-blue-400" />;
  return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
}

export function VdrShell({ dealId, embedded = false }: VdrShellProps) {
  const [previewDoc, setPreviewDoc] = useState<VdrDocument | null>(null);
  const { deals } = useDealsContext();
  const { user } = useAuth();
  const { company } = useCompany();
  
  const navigate = useNavigate();

  const currentDeal = useMemo(() => deals.find(d => d.id === dealId), [deals, dealId]);

  const vdrDocs = useVdrDocuments(dealId);
  const { hasPageAccess } = usePageAccessFlags();
  const { canPushFlex: demoCanPushFlex } = useDemoCapabilities();
  const canPushToFlex = hasPageAccess('flex_push') && demoCanPushFlex;
  const [isPushingToFlex, setIsPushingToFlex] = useState(false);

  // Upload dialog state
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [mappingRefreshKey, setMappingRefreshKey] = useState(0);
  const [mappingSearch, setMappingSearch] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatuses, setUploadStatuses] = useState<Map<number, 'pending' | 'uploading' | 'done' | 'error'>>(new Map());

  // Per-file assignments: Map<fileIndex, FileAssignment>
  const [fileAssignments, setFileAssignments] = useState<Map<number, FileAssignment>>(new Map());
  const [activeFileIndex, setActiveFileIndex] = useState(0);

  // Checklist config for mapping step
  const { config: checklistConfig } = useDefaultChecklistConfig(company?.id ?? undefined);
  const { dealTypes: dealTypeOptions } = useDealTypes();

  const dealTypeLabel = useMemo(() => {
    const typeIds = currentDeal?.dealTypes;
    if (!typeIds || typeIds.length === 0) return '';
    const matched = dealTypeOptions.find(dt => typeIds.includes(dt.id));
    return matched?.label || typeIds[0] || '';
  }, [currentDeal?.dealTypes, dealTypeOptions]);

  const matchedConfig = useMemo(() => {
    if (!dealTypeLabel || !checklistConfig.configs.length) return null;
    return findMatchingConfig(checklistConfig.configs, dealTypeLabel);
  }, [dealTypeLabel, checklistConfig.configs]);

  const checklistItems = useMemo(() => {
    if (!matchedConfig) return [];
    const items: { id: string; label: string; category: string; required: boolean }[] = [];
    for (const round of matchedConfig.rounds) {
      for (const item of round.items) {
        items.push({ id: item.id, label: item.label, category: round.title, required: item.required });
      }
    }
    return items;
  }, [matchedConfig]);

  const filteredChecklistItems = useMemo(() => {
    if (!mappingSearch.trim()) return checklistItems;
    const q = mappingSearch.toLowerCase();
    return checklistItems.filter(i => i.label.toLowerCase().includes(q) || i.category.toLowerCase().includes(q));
  }, [checklistItems, mappingSearch]);

  const groupedChecklistItems = useMemo(() => {
    const groups = new Map<string, typeof checklistItems>();
    for (const item of filteredChecklistItems) {
      if (!groups.has(item.category)) groups.set(item.category, []);
      groups.get(item.category)!.push(item);
    }
    return groups;
  }, [filteredChecklistItems]);

  const availableFolders = useMemo(() => {
    return vdrDocs.documents
      .filter(d => d.is_folder && d.folder_path === '/')
      .sort((a, b) => a.sort_order - b.sort_order || a.filename.localeCompare(b.filename));
  }, [vdrDocs.documents]);

  // Get the active file's assignment
  const activeAssignment = useMemo(() => {
    return fileAssignments.get(activeFileIndex) || { folder: '/', checklistIds: new Set<string>() };
  }, [fileAssignments, activeFileIndex]);

  // Derive auto-folder from active file's checklist item labels using the classifier
  const autoFolderInfo = useMemo(() => {
    if (activeAssignment.checklistIds.size === 0) return null;
    // Try each selected checklist item's label as a "filename" for classification
    for (const id of activeAssignment.checklistIds) {
      const item = checklistItems.find(i => i.id === id);
      if (item) {
        const folderPath = classifyFileToFolder(item.label, vdrDocs.documents);
        if (folderPath !== '/') {
          const folderName = folderPath.replace(/^\/|\/$/g, '');
          return { path: folderPath, name: folderName };
        }
      }
    }
    return null;
  }, [activeAssignment.checklistIds, checklistItems, vdrDocs.documents]);

  const folderLocked = !!autoFolderInfo;

  // Auto-update folder when checklist auto-assigns
  useEffect(() => {
    if (autoFolderInfo) {
      setFileAssignments(prev => {
        const next = new Map(prev);
        const current = next.get(activeFileIndex) || { folder: '/', checklistIds: new Set<string>() };
        next.set(activeFileIndex, { ...current, folder: autoFolderInfo.path });
        return next;
      });
    }
  }, [autoFolderInfo, activeFileIndex]);

  // Reset state when dialog opens
  useEffect(() => {
    if (pendingFiles) {
      const initial = new Map<number, FileAssignment>();
      pendingFiles.forEach((_, i) => initial.set(i, { folder: '/', checklistIds: new Set() }));
      setFileAssignments(initial);
      setActiveFileIndex(0);
      setMappingSearch('');
    }
  }, [pendingFiles]);

  const handleFilesDropped = useCallback((files: File[]) => {
    setPendingFiles(files);
  }, []);

  const updateActiveFolder = useCallback((folder: string) => {
    setFileAssignments(prev => {
      const next = new Map(prev);
      const current = next.get(activeFileIndex) || { folder: '/', checklistIds: new Set<string>() };
      next.set(activeFileIndex, { ...current, folder });
      return next;
    });
  }, [activeFileIndex]);

  const toggleActiveChecklistItem = useCallback((id: string) => {
    setFileAssignments(prev => {
      const next = new Map(prev);
      const current = next.get(activeFileIndex) || { folder: '/', checklistIds: new Set<string>() };
      const newIds = new Set(current.checklistIds);
      if (newIds.has(id)) newIds.delete(id);
      else newIds.add(id);
      next.set(activeFileIndex, { ...current, checklistIds: newIds });
      return next;
    });
  }, [activeFileIndex]);

  // Check if a file has been assigned (has a folder selected or checklist mapping)
  const isFileAssigned = useCallback((index: number) => {
    const assignment = fileAssignments.get(index);
    if (!assignment) return false;
    return assignment.folder !== '/' || assignment.checklistIds.size > 0;
  }, [fileAssignments]);

  const allFilesAssigned = useMemo(() => {
    if (!pendingFiles) return false;
    return pendingFiles.every((_, i) => isFileAssigned(i));
  }, [pendingFiles, isFileAssigned]);

  // Apply current active file's settings to all files
  const applyToAll = useCallback(() => {
    if (!pendingFiles) return;
    const current = fileAssignments.get(activeFileIndex) || { folder: '/', checklistIds: new Set<string>() };
    setFileAssignments(prev => {
      const next = new Map(prev);
      pendingFiles.forEach((_, i) => {
        next.set(i, { folder: current.folder, checklistIds: new Set(current.checklistIds) });
      });
      return next;
    });
    toast.success('Applied to all files');
  }, [pendingFiles, fileAssignments, activeFileIndex]);

  const handleUploadConfirm = useCallback(async () => {
    if (!pendingFiles || !user) return;

    setIsUploading(true);
    const statuses = new Map<number, 'pending' | 'uploading' | 'done' | 'error'>();
    pendingFiles.forEach((_, i) => statuses.set(i, 'pending'));
    setUploadStatuses(new Map(statuses));

    const batchId = crypto.randomUUID();
    let anyMappings = false;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < pendingFiles.length; i++) {
      const file = pendingFiles[i];
      const assignment = fileAssignments.get(i) || { folder: '/', checklistIds: new Set<string>() };

      statuses.set(i, 'uploading');
      setUploadStatuses(new Map(statuses));

      try {
        // Upload file to VDR
        await vdrDocs.uploadFile(file, assignment.folder, 'dataroom');

        // Create uploaded_item + mappings if checklist items were selected
        if (assignment.checklistIds.size > 0) {
          anyMappings = true;
          const { data: insertedItems, error } = await supabase
            .from('uploaded_items')
            .insert({
              upload_batch_id: batchId,
              deal_id: dealId,
              name: file.name,
              metadata: { size: file.size, type: file.type } as Record<string, string | number>,
              uploaded_by: user.id,
              mapping_status: 'mapped' as const,
            })
            .select('id');

          if (!error && insertedItems?.length) {
            const mappingRows = Array.from(assignment.checklistIds).map(checklistId => ({
              uploaded_item_id: insertedItems[0].id,
              checklist_item_id: checklistId,
              created_by: user.id,
            }));
            const { error: mapError } = await supabase.from('uploaded_item_checklist_mapping').insert(mappingRows);
            if (mapError) {
              console.error('Failed to insert checklist mappings:', mapError);
            }
          }
        }

        statuses.set(i, 'done');
        setUploadStatuses(new Map(statuses));
        successCount++;
      } catch (err) {
        console.error(`Failed to upload ${file.name}:`, err);
        statuses.set(i, 'error');
        setUploadStatuses(new Map(statuses));
        failCount++;
      }
    }

    if (anyMappings) {
      setMappingRefreshKey(k => k + 1);
    }

    setIsUploading(false);

    if (failCount === 0) {
      toast.success(`${successCount} file${successCount > 1 ? 's' : ''} uploaded successfully`);
      setPendingFiles(null);
      setUploadStatuses(new Map());
    } else {
      toast.error(`${failCount} file${failCount > 1 ? 's' : ''} failed to upload`);
    }
  }, [pendingFiles, fileAssignments, vdrDocs, dealId, user]);

  const handleCancel = useCallback(() => {
    if (isUploading) return; // prevent closing during upload
    setPendingFiles(null);
    setUploadStatuses(new Map());
  }, [isUploading]);

  // --- existing handlers below ---

  const handlePushToFlex = useCallback(async () => {
    if (isPushingToFlex) return;
    setIsPushingToFlex(true);
    try {
      const files = vdrDocs.documents.filter(d => !d.is_folder && d.file_path);
      const fileData = await Promise.all(
        files.map(async (doc) => {
          const { data: signedData } = await supabase.storage
            .from('vdr-files')
            .createSignedUrl(doc.file_path!, 3600);
          return {
            name: doc.filename,
            category: doc.folder_path,
            url: signedData?.signedUrl || null,
            size_bytes: doc.file_size,
            content_type: doc.file_type,
          };
        })
      );
      const { data: result, error } = await supabase.functions.invoke('push-to-flex', {
        body: {
          dealId,
          action: 'sync_data_room',
          dataRoomFiles: fileData.filter(f => f.url !== null),
        },
      });
      // Edge function returned a non-2xx: prefer the server's error message.
      const serverError = (result as any)?.error || (result as any)?.details;
      if (error || serverError) {
        throw new Error(serverError || (error as any)?.message || 'Failed to push to FLEx');
      }
      toast.success('Data Room pushed to FLEx', {
        description: files.length > 0 ? `${files.length} file(s) synced successfully.` : 'Data room cleared on FLEx.',
      });
    } catch (error) {
      console.error('Error pushing data room to FLEx:', error);
      toast.error('Failed to push to FLEx', {
        description: error instanceof Error ? error.message : 'An error occurred',
      });
    } finally {
      setIsPushingToFlex(false);
    }
  }, [dealId, isPushingToFlex, vdrDocs.documents]);

  const handlePreview = useCallback((doc: VdrDocument) => {
    setPreviewDoc(doc);
  }, []);

  const handleClosePreview = useCallback(() => {
    setPreviewDoc(null);
  }, []);

  const isSingleFile = pendingFiles?.length === 1;

  return (
    <div className={cn("flex overflow-hidden divide-x divide-border/50", embedded ? "h-full w-full bg-card text-card-foreground" : "h-screen w-screen bg-background")}>
      <div className="flex-1 flex min-w-0 min-h-0">
        <ResizablePanelGroup direction="horizontal" className="flex-1">
          <ResizablePanel defaultSize={previewDoc ? 65 : 100} minSize={40}>
            <VdrCenterPanel
              dealId={dealId}
              documents={vdrDocs.documents}
              documentsLoading={vdrDocs.loading}
              onPreview={handlePreview}
              vdrDocs={vdrDocs}
              canPushToFlex={canPushToFlex}
              isPushingToFlex={isPushingToFlex}
              onPushToFlex={handlePushToFlex}
              dealType={currentDeal?.dealTypes?.[0] ?? null}
              companyId={company?.id ?? null}
              mappingRefreshKey={mappingRefreshKey}
              dealName={currentDeal?.name}
              companyName={company?.name}
            />
          </ResizablePanel>

          {previewDoc && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={35} minSize={20} maxSize={50}>
                <VdrPreviewPanel
                  document={previewDoc}
                  onClose={handleClosePreview}
                  getDownloadUrl={vdrDocs.getDownloadUrl}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>

      {/* Upload Dialog */}
      <Dialog open={!!pendingFiles} onOpenChange={open => { if (!open) handleCancel(); }}>
        <DialogContent className={cn("max-w-3xl", !isSingleFile && "max-w-4xl")}>
          <DialogHeader>
            <DialogTitle className="text-sm">
              Upload {pendingFiles?.length === 1 ? 'file' : `${pendingFiles?.length} files`}
            </DialogTitle>
          </DialogHeader>

          {isUploading ? (
            /* Upload progress view */
            <div className="min-h-[200px] space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>Uploading {pendingFiles?.length} file{(pendingFiles?.length || 0) > 1 ? 's' : ''}...</span>
              </div>
              <Progress value={pendingFiles ? Math.round(([...uploadStatuses.values()].filter(s => s === 'done' || s === 'error').length / pendingFiles.length) * 100) : 0} className="h-2" />
              <div className="space-y-1 max-h-[300px] overflow-auto">
                {pendingFiles?.map((file, i) => {
                  const status = uploadStatuses.get(i) || 'pending';
                  return (
                    <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs">
                      {status === 'done' ? (
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                      ) : status === 'error' ? (
                        <AlertCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                      ) : status === 'uploading' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary flex-shrink-0" />
                      ) : (
                        <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      )}
                      <span className={cn("truncate flex-1", status === 'error' && "text-destructive")}>{file.name}</span>
                      <span className="text-[10px] text-muted-foreground capitalize">{status}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
          <div className={cn("flex gap-4", !isSingleFile ? "min-h-[360px]" : "")}>
            {/* File list (left side, only for multi-file) */}
            {!isSingleFile && pendingFiles && (
              <div className="w-48 flex-shrink-0 border-r border-border pr-3 space-y-1">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Files</p>
                  <Badge variant="secondary" className="text-[9px] h-4 px-1">
                    {pendingFiles.filter((_, i) => isFileAssigned(i)).length}/{pendingFiles.length}
                  </Badge>
                </div>
                <div className="max-h-[320px] overflow-auto space-y-0.5">
                  {pendingFiles.map((file, i) => {
                    const assigned = isFileAssigned(i);
                    return (
                      <button
                        key={i}
                        onClick={() => setActiveFileIndex(i)}
                        className={cn(
                          'flex items-center gap-1.5 w-full px-2 py-1.5 rounded text-xs transition-colors text-left',
                          activeFileIndex === i
                            ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                            : 'text-foreground hover:bg-secondary/50',
                        )}
                      >
                        {assigned ? (
                          <Check className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                        ) : (
                          getFileIcon(file.name)
                        )}
                        <span className="truncate flex-1 min-w-0">{file.name}</span>
                      </button>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-[10px] h-7 mt-2"
                  onClick={applyToAll}
                  disabled={!isFileAssigned(activeFileIndex)}
                >
                  <CheckCheck className="h-3 w-3 mr-1" />
                  Apply to all
                </Button>
              </div>
            )}

            {/* Main area: checklist + folder columns */}
            <div className="flex-1 min-w-0">
              {/* Active file name for single file */}
              {isSingleFile && pendingFiles && (
                <p className="text-xs text-muted-foreground mb-2 truncate">
                  "{pendingFiles[0].name}"
                </p>
              )}
              {/* Active file indicator for multi-file */}
              {!isSingleFile && pendingFiles && (
                <p className="text-xs text-muted-foreground mb-2 truncate">
                  Configuring: <span className="font-medium text-foreground">{pendingFiles[activeFileIndex]?.name}</span>
                </p>
              )}

              <div className="grid grid-cols-2 gap-4">
                {/* Left column: Checklist items */}
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Map to checklist</p>
                  {checklistItems.length > 0 ? (
                    <>
                      <div className="relative mb-2">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Search..."
                          value={mappingSearch}
                          onChange={e => setMappingSearch(e.target.value)}
                          className="h-7 text-xs pl-7 bg-secondary/30"
                        />
                      </div>
                      <div className="max-h-[260px] overflow-auto space-y-1.5 pr-1">
                        {Array.from(groupedChecklistItems.entries()).map(([category, items]) => (
                          <div key={category}>
                            <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium px-1 mb-0.5">{category}</p>
                            {items.map(item => (
                              <label
                                key={item.id}
                                className="flex items-center gap-2 px-1 py-1 rounded cursor-pointer text-xs hover:bg-secondary/50 transition-colors"
                              >
                                <Checkbox
                                  checked={activeAssignment.checklistIds.has(item.id)}
                                  onCheckedChange={() => toggleActiveChecklistItem(item.id)}
                                  className="h-3 w-3"
                                />
                                <span className="truncate flex-1">{item.label}</span>
                                {item.required && (
                                  <span className="text-[8px] text-destructive font-medium flex-shrink-0">Req</span>
                                )}
                              </label>
                            ))}
                          </div>
                        ))}
                        {groupedChecklistItems.size === 0 && (
                          <p className="text-[10px] text-muted-foreground/60 italic px-1 py-1">No matching items</p>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-[10px] text-muted-foreground/60 italic px-1 py-4">No checklist items available for this deal type.</p>
                  )}
                </div>

                {/* Right column: Folder selection */}
                <div className={cn("space-y-1", folderLocked && "opacity-60 pointer-events-none")}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Destination folder</p>
                    {folderLocked && <Lock className="h-3 w-3 text-muted-foreground" />}
                  </div>
                  {folderLocked && (
                    <p className="text-[10px] text-primary italic px-1 -mt-0.5 mb-1">
                      Auto-assigned to <span className="font-semibold">{autoFolderInfo?.name}</span>
                    </p>
                  )}
                  <div className="max-h-[260px] overflow-auto space-y-1">
                    <button
                      onClick={() => !folderLocked && updateActiveFolder('/')}
                      disabled={folderLocked}
                      className={cn(
                        'flex items-center gap-2 w-full px-3 py-2 rounded-md text-xs font-medium transition-colors',
                        activeAssignment.folder === '/'
                          ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                          : 'text-foreground hover:bg-secondary/50',
                        folderLocked && 'cursor-not-allowed'
                      )}
                    >
                      <FolderOpen className="h-4 w-4 flex-shrink-0" />
                      Root (no folder)
                    </button>
                    {availableFolders.map(folder => {
                      const path = `/${folder.filename}/`;
                      return (
                        <button
                          key={folder.id}
                          onClick={() => !folderLocked && updateActiveFolder(path)}
                          disabled={folderLocked}
                          className={cn(
                            'flex items-center gap-2 w-full px-3 py-2 rounded-md text-xs font-medium transition-colors',
                            activeAssignment.folder === path
                              ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                              : 'text-foreground hover:bg-secondary/50',
                            folderLocked && 'cursor-not-allowed'
                          )}
                        >
                          <FolderClosed className="h-4 w-4 flex-shrink-0" />
                          {folder.filename}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
          )}

          {!isUploading && (
          <DialogFooter className="flex justify-between sm:justify-between">
            <Button variant="ghost" size="sm" onClick={handleCancel}>Cancel</Button>
            <Button size="sm" onClick={handleUploadConfirm} disabled={!isSingleFile && !allFilesAssigned}>
              Upload{pendingFiles && pendingFiles.length > 1 ? ` ${pendingFiles.length} files` : ''}
            </Button>
          </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
