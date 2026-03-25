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
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { FolderOpen, FolderClosed, ChevronDown, FileText, Search } from 'lucide-react';
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
  const [uploadStep, setUploadStep] = useState<'folder' | 'mapping'>('folder');
  // Per-file checklist mappings: fileIndex -> Set of checklist item IDs
  const [fileMappings, setFileMappings] = useState<Map<number, Set<string>>>(new Map());
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

  // Reset state when dialog opens
  useEffect(() => {
    if (pendingFiles) {
      setUploadStep('folder');
      setSelectedFolder('/');
      setFileMappings(new Map());
      setMappingSearch('');
    }
  }, [pendingFiles]);

  const handleFilesDropped = useCallback((files: File[]) => {
    setPendingFiles(files);
  }, []);

  const toggleFileMapping = useCallback((fileIndex: number, checklistItemId: string) => {
    setFileMappings(prev => {
      const next = new Map(prev);
      const existing = next.get(fileIndex) ?? new Set<string>();
      const updated = new Set(existing);
      if (updated.has(checklistItemId)) updated.delete(checklistItemId);
      else updated.add(checklistItemId);
      next.set(fileIndex, updated);
      return next;
    });
  }, []);

  const applyChecklistItemToAll = useCallback((checklistItemId: string, checked: boolean) => {
    if (!pendingFiles) return;
    setFileMappings(prev => {
      const next = new Map(prev);
      for (let i = 0; i < pendingFiles.length; i++) {
        const existing = next.get(i) ?? new Set<string>();
        const updated = new Set(existing);
        if (checked) updated.add(checklistItemId);
        else updated.delete(checklistItemId);
        next.set(i, updated);
      }
      return next;
    });
  }, [pendingFiles]);

  const handleUploadConfirm = useCallback(async () => {
    if (!pendingFiles || !user) return;

    // Upload files to VDR
    for (const file of pendingFiles) {
      await vdrDocs.uploadFile(file, selectedFolder, 'dataroom');
    }

    // Create uploaded_items + mappings if any mappings were made
    const hasMappings = Array.from(fileMappings.values()).some(s => s.size > 0);
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
        insertedItems.forEach((item, idx) => {
          const itemMappings = fileMappings.get(idx);
          if (itemMappings) {
            for (const checklistId of itemMappings) {
              mappingRows.push({ uploaded_item_id: item.id, checklist_item_id: checklistId });
            }
          }
        });
        if (mappingRows.length > 0) {
          await supabase.from('uploaded_item_checklist_mapping').insert(mappingRows);
        }
      }
    }

    toast.success(`Uploaded ${pendingFiles.length} file(s)`, {
      description: hasMappings ? 'Files mapped to checklist items.' : undefined,
    });
    setPendingFiles(null);
  }, [pendingFiles, selectedFolder, fileMappings, vdrDocs, dealId, user]);

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

  const totalMappedCount = useMemo(() => {
    let count = 0;
    fileMappings.forEach(s => { if (s.size > 0) count++; });
    return count;
  }, [fileMappings]);

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

      {/* Upload Dialog - Two Steps */}
      <Dialog open={!!pendingFiles} onOpenChange={open => { if (!open) handleCancel(); }}>
        <DialogContent className={cn("max-w-md", uploadStep === 'mapping' && 'max-w-lg')}>
          {uploadStep === 'folder' ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-sm">Choose upload folder</DialogTitle>
              </DialogHeader>
              <p className="text-xs text-muted-foreground">
                Select a folder for {pendingFiles?.length === 1 ? `"${pendingFiles[0].name}"` : `${pendingFiles?.length} files`}:
              </p>
              <div className="space-y-1 max-h-[240px] overflow-auto">
                <button
                  onClick={() => setSelectedFolder('/')}
                  className={cn(
                    'flex items-center gap-2 w-full px-3 py-2 rounded-md text-xs font-medium transition-colors',
                    selectedFolder === '/'
                      ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                      : 'text-foreground hover:bg-secondary/50'
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
                      onClick={() => setSelectedFolder(path)}
                      className={cn(
                        'flex items-center gap-2 w-full px-3 py-2 rounded-md text-xs font-medium transition-colors',
                        selectedFolder === path
                          ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                          : 'text-foreground hover:bg-secondary/50'
                      )}
                    >
                      <FolderClosed className="h-4 w-4 flex-shrink-0" />
                      {folder.filename}
                    </button>
                  );
                })}
              </div>
              <DialogFooter className="flex justify-between sm:justify-between">
                <Button variant="ghost" size="sm" onClick={handleCancel}>Cancel</Button>
                <div className="flex gap-2">
                  {checklistItems.length > 0 && (
                    <Button variant="outline" size="sm" onClick={() => setUploadStep('mapping')} className="gap-1">
                      Map to checklist
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button size="sm" onClick={handleUploadConfirm}>Upload</Button>
                </div>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-sm flex items-center gap-2">
                  Map files to checklist items
                  {totalMappedCount > 0 && (
                    <Badge variant="secondary" className="text-[10px]">{totalMappedCount}/{pendingFiles?.length} mapped</Badge>
                  )}
                </DialogTitle>
              </DialogHeader>

              {/* File list with per-file mapping */}
              <div className="space-y-3 max-h-[400px] overflow-auto">
                {/* Search checklist items */}
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search checklist items..."
                    value={mappingSearch}
                    onChange={e => setMappingSearch(e.target.value)}
                    className="h-8 text-xs pl-7 bg-secondary/30"
                  />
                </div>

                {pendingFiles?.map((file, fileIdx) => {
                  const mapped = fileMappings.get(fileIdx);
                  const mappedCount = mapped?.size ?? 0;
                  return (
                    <div key={fileIdx} className="border border-border/50 rounded-lg overflow-hidden">
                      {/* File header */}
                      <div className="flex items-center gap-2 px-3 py-2 bg-secondary/30">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs font-medium truncate flex-1">{file.name}</span>
                        {mappedCount > 0 && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-primary/30 text-primary">
                            {mappedCount} mapped
                          </Badge>
                        )}
                      </div>
                      {/* Checklist items grouped by category */}
                      <div className="px-2 py-1.5 space-y-1.5">
                        {Array.from(groupedChecklistItems.entries()).map(([category, items]) => (
                          <div key={category}>
                            <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium px-1 mb-0.5">{category}</p>
                            <div className="space-y-0">
                              {items.map(item => (
                                <label
                                  key={item.id}
                                  className="flex items-center gap-2 px-1 py-1 rounded cursor-pointer text-xs hover:bg-secondary/50 transition-colors"
                                >
                                  <Checkbox
                                    checked={mapped?.has(item.id) ?? false}
                                    onCheckedChange={() => toggleFileMapping(fileIdx, item.id)}
                                    className="h-3 w-3"
                                  />
                                  <span className="truncate flex-1">{item.label}</span>
                                  {item.required && (
                                    <span className="text-[8px] text-destructive font-medium flex-shrink-0">Req</span>
                                  )}
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                        {groupedChecklistItems.size === 0 && (
                          <p className="text-[10px] text-muted-foreground/60 italic px-1 py-1">No matching items</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <DialogFooter className="flex justify-between sm:justify-between">
                <Button variant="ghost" size="sm" onClick={() => setUploadStep('folder')} className="gap-1">
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Back
                </Button>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={handleCancel}>Cancel</Button>
                  <Button size="sm" onClick={handleUploadConfirm}>
                    Upload{totalMappedCount > 0 ? ` & Map` : ''}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
