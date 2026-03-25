import { useState, useCallback, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useDealsContext } from '@/contexts/DealsContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';

import { useVdrDocuments } from '@/hooks/useVdrDocuments';
import { usePageAccessFlags } from '@/hooks/useFeatureFlags';
import { useDefaultChecklistConfig, findMatchingConfig } from '@/hooks/useDefaultChecklistConfig';
import { useDealTypes } from '@/contexts/DealTypesContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { VdrDocument } from './types';

import { VdrSidebar } from './VdrSidebar';
import { VdrCenterPanel } from './VdrCenterPanel';
import { VdrPreviewPanel } from './VdrPreviewPanel';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { FolderOpen, FolderClosed, FileText, Search, Lock } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface VdrShellProps {
  dealId: string;
  embedded?: boolean;
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
  const canPushToFlex = hasPageAccess('flex_push');
  const [isPushingToFlex, setIsPushingToFlex] = useState(false);

  // Upload dialog state
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string>('/');
  // Checklist mapping: Set of checklist item IDs applied to all files in this upload
  const [selectedChecklistIds, setSelectedChecklistIds] = useState<Set<string>>(new Set());
  // Counter to signal center panel to re-fetch mapped checklist IDs
  const [mappingRefreshKey, setMappingRefreshKey] = useState(0);
  
  const [mappingSearch, setMappingSearch] = useState('');

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

  // Group items by category for display
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

  // Derive auto-folder from selected checklist items' categories
  const autoFolderInfo = useMemo(() => {
    if (selectedChecklistIds.size === 0) return null;
    // Get unique categories from selected checklist items
    const categories = new Set<string>();
    for (const id of selectedChecklistIds) {
      const item = checklistItems.find(i => i.id === id);
      if (item) categories.add(item.category);
    }
    // Try to find a matching folder for the first category
    // Categories are round titles (e.g., "Initial Items", "Kick Off Items")
    // Folders may match by containing the category name or vice versa
    for (const category of categories) {
      const catLower = category.toLowerCase();
      const matchedFolder = availableFolders.find(f => {
        const fLower = f.filename.toLowerCase();
        return fLower.includes(catLower) || catLower.includes(fLower);
      });
      if (matchedFolder) {
        return { path: `/${matchedFolder.filename}/`, name: matchedFolder.filename };
      }
    }
    // If no folder matches the category, return null (user picks manually)
    return null;
  }, [selectedChecklistIds, checklistItems, availableFolders]);

  // Auto-update selectedFolder when checklist mapping auto-assigns a folder
  useEffect(() => {
    if (autoFolderInfo) {
      setSelectedFolder(autoFolderInfo.path);
    }
  }, [autoFolderInfo]);

  const folderLocked = !!autoFolderInfo;

  // Reset state when dialog opens
  useEffect(() => {
    if (pendingFiles) {
      setSelectedFolder('/');
      setSelectedChecklistIds(new Set());
      setMappingSearch('');
      
    }
  }, [pendingFiles]);

  const handleFilesDropped = useCallback((files: File[]) => {
    setPendingFiles(files);
  }, []);

  const toggleChecklistItem = useCallback((id: string) => {
    setSelectedChecklistIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleUploadConfirm = useCallback(async () => {
    if (!pendingFiles || !user) return;

    // Upload files to VDR
    for (const file of pendingFiles) {
      await vdrDocs.uploadFile(file, selectedFolder, 'dataroom');
    }

    // Create uploaded_items + mappings if any checklist items were selected
    const hasMappings = selectedChecklistIds.size > 0;
    if (hasMappings) {
      const batchId = crypto.randomUUID();
      const rows = pendingFiles.map(f => ({
        upload_batch_id: batchId,
        deal_id: dealId,
        name: f.name,
        metadata: { size: f.size, type: f.type } as Record<string, string | number>,
        uploaded_by: user.id,
        mapping_status: 'mapped' as const,
      }));

      const { data: insertedItems, error } = await supabase
        .from('uploaded_items')
        .insert(rows)
        .select('id');

      if (!error && insertedItems) {
        const mappingRows: { uploaded_item_id: string; checklist_item_id: string }[] = [];
        for (const item of insertedItems) {
          for (const checklistId of selectedChecklistIds) {
            mappingRows.push({ uploaded_item_id: item.id, checklist_item_id: checklistId });
          }
        }
        if (mappingRows.length > 0) {
          await supabase.from('uploaded_item_checklist_mapping').insert(mappingRows);
        }
      }
    }

    toast.success(`Uploaded ${pendingFiles.length} file(s)`, {
      description: hasMappings ? 'Files mapped to checklist items.' : undefined,
    });
    if (hasMappings) {
      setMappingRefreshKey(k => k + 1);
    }
    setPendingFiles(null);
  }, [pendingFiles, selectedFolder, selectedChecklistIds, vdrDocs, dealId, user]);

  const handleCancel = useCallback(() => {
    setPendingFiles(null);
  }, []);

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
      const { error } = await supabase.functions.invoke('push-to-flex', {
        body: {
          dealId,
          action: 'sync_data_room',
          dataRoomFiles: fileData.filter(f => f.url !== null),
        },
      });
      if (error) throw error;
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

  return (
    <div className={cn("flex overflow-hidden divide-x divide-border/50", embedded ? "h-full w-full bg-card" : "h-screen w-screen bg-background")}>
      <VdrSidebar
        dealId={dealId}
        deals={deals}
        currentDeal={currentDeal}
        onFilesDropped={handleFilesDropped}
      />

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

      {/* Upload Dialog - Two-column layout */}
      <Dialog open={!!pendingFiles} onOpenChange={open => { if (!open) handleCancel(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm">Upload files</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            {pendingFiles?.length === 1 ? `"${pendingFiles[0].name}"` : `${pendingFiles?.length} files`}
          </p>

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
                  <div className="max-h-[280px] overflow-auto space-y-1.5 pr-1">
                    {Array.from(groupedChecklistItems.entries()).map(([category, items]) => (
                      <div key={category}>
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium px-1 mb-0.5">{category}</p>
                        {items.map(item => (
                          <label
                            key={item.id}
                            className="flex items-center gap-2 px-1 py-1 rounded cursor-pointer text-xs hover:bg-secondary/50 transition-colors"
                          >
                            <Checkbox
                              checked={selectedChecklistIds.has(item.id)}
                              onCheckedChange={() => toggleChecklistItem(item.id)}
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
              <div className="max-h-[280px] overflow-auto space-y-1">
                <button
                  onClick={() => !folderLocked && setSelectedFolder('/')}
                  disabled={folderLocked}
                  className={cn(
                    'flex items-center gap-2 w-full px-3 py-2 rounded-md text-xs font-medium transition-colors',
                    selectedFolder === '/'
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
                      onClick={() => !folderLocked && setSelectedFolder(path)}
                      disabled={folderLocked}
                      className={cn(
                        'flex items-center gap-2 w-full px-3 py-2 rounded-md text-xs font-medium transition-colors',
                        selectedFolder === path
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

          <DialogFooter className="flex justify-between sm:justify-between">
            <Button variant="ghost" size="sm" onClick={handleCancel}>Cancel</Button>
            <Button size="sm" onClick={handleUploadConfirm}>
              Upload{selectedChecklistIds.size > 0 ? ` & Map` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
