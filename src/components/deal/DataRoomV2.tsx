import { useState, useMemo, useCallback, useRef } from 'react';
import {
  Check, ChevronDown, ChevronRight, Upload, FileText, Link2, Unlink, Download,
  Filter, X, AlertCircle, FolderOpen, FileCheck, Paperclip, Search,
  MoreHorizontal, Eye, Trash2, GripVertical, Archive,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useDataRoomChecklist, useDealChecklistStatus, type ChecklistItem } from '@/hooks/useDataRoomChecklist';
import { useDealChecklistItems, type DealChecklistItem } from '@/hooks/useDealChecklistItems';
import { useChecklistCategories, getCategoryColorClasses } from '@/hooks/useChecklistCategories';
import { useDealAttachments, type DealAttachment } from '@/hooks/useDealAttachments';
import { useFileChecklistMap } from '@/hooks/useFileChecklistMap';
import { useUploadJobs } from '@/hooks/useUploadJobs';
import { getCategoryIcon } from '@/components/settings/CategoryIconPicker';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

type UnifiedChecklistItem = (ChecklistItem & { is_deal_specific?: false }) | DealChecklistItem;

interface DataRoomV2Props {
  dealId: string;
}

// ─── Circular Progress ──────────────────────────────────────────────
function CircularProgress({ value, size = 40, strokeWidth = 3.5 }: { value: number; size?: number; strokeWidth?: number }) {
  const r = (size - strokeWidth) / 2;
  const c = r * 2 * Math.PI;
  const offset = c - (value / 100) * c;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-secondary" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={strokeWidth}
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          className={cn("transition-all duration-300", value === 100 ? "text-green-500" : "text-primary")} />
      </svg>
      <span className="absolute text-[10px] font-bold">{value}%</span>
    </div>
  );
}

// ─── File icon helper ──────────────────────────────────────────────
function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['pdf'].includes(ext || '')) return <FileText className="h-4 w-4 text-red-500" />;
  if (['xls', 'xlsx', 'csv'].includes(ext || '')) return <FileText className="h-4 w-4 text-green-600" />;
  if (['doc', 'docx'].includes(ext || '')) return <FileText className="h-4 w-4 text-blue-500" />;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || '')) return <Eye className="h-4 w-4 text-purple-500" />;
  return <FileText className="h-4 w-4 text-muted-foreground" />;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ═══════════════════════════════════════════════════════════════════
export function DataRoomV2({ dealId }: DataRoomV2Props) {
  const { user } = useAuth();

  // Data sources
  const { items: templateItems, loading: l1 } = useDataRoomChecklist();
  const { items: dealItems, loading: l2, addItem: addDealItem } = useDealChecklistItems(dealId);
  const { statuses, toggleItemStatus } = useDealChecklistStatus(dealId);
  const { categories: categoryConfigs, getCategoryByName } = useChecklistCategories();
  const { attachments, isLoading: l3, uploadAttachment, uploadMultipleAttachments, deleteAttachment, refetch: refetchAttachments } = useDealAttachments(dealId);
  const { mappings, mapFileToItem, mapFilesToItem, mapFileToItems, unmapFile, getFilesForItem, getItemsForFile, getUnmappedFileIds } = useFileChecklistMap(dealId);
  const { activeJob, createJob, completeJob } = useUploadJobs(dealId);

  // UI state
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMappingDialog, setShowMappingDialog] = useState(false);
  const [filesToMap, setFilesToMap] = useState<DealAttachment[]>([]);
  const [mappingSelections, setMappingSelections] = useState<Set<string>>(new Set());
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
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
  const progressData = useMemo(() => {
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

  // ─── Upload handlers ───────────────────────────────────────────
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
      // Auto-map to the target item
      for (const att of uploadedAttachments) {
        await mapFileToItem(att.id, targetItemId, 'manual_drag');
      }
      toast.success(`${uploadedAttachments.length} file(s) uploaded and mapped`);
    } else if (uploadedAttachments.length > 0) {
      // Open mapping dialog for unmapped files
      setFilesToMap(uploadedAttachments);
      setMappingSelections(new Set());
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

  // Item drop handler
  const handleItemDrop = useCallback((itemId: string, e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounterRef.current = 0; setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleUploadFiles(files, itemId);
  }, [handleUploadFiles]);

  // Mapping dialog confirm
  const handleConfirmMapping = async () => {
    if (filesToMap.length === 0) return;
    const itemIds = Array.from(mappingSelections);
    let totalMapped = 0;
    for (const file of filesToMap) {
      if (itemIds.length > 0) {
        totalMapped += await mapFileToItems(file.id, itemIds, 'manual_picker');
      }
    }
    if (totalMapped > 0) toast.success(`Mapped ${filesToMap.length} file(s) to ${itemIds.length} item(s)`);
    setShowMappingDialog(false);
    setFilesToMap([]);
    setMappingSelections(new Set());
  };

  // Download
  const handleDownloadFile = (att: DealAttachment) => {
    if (att.url) {
      const link = document.createElement('a');
      link.href = att.url;
      link.download = att.name;
      link.click();
    }
  };

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
        {/* LEFT PANE: Checklist Tree */}
        <div className="col-span-4 border rounded-lg overflow-hidden flex flex-col">
          <div className="p-2 border-b bg-muted/30">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-7 text-xs"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-1.5 space-y-1">
              {categories.map(cat => {
                const items = grouped[cat].filter(i =>
                  !searchQuery || i.name.toLowerCase().includes(searchQuery.toLowerCase())
                );
                if (items.length === 0) return null;

                const sp = progressData.sections[cat];
                const pct = sp ? Math.round((sp.completed / sp.total) * 100) : 0;
                const catData = getCategoryByName(cat);
                const colorClasses = catData ? getCategoryColorClasses(catData.color) : getCategoryColorClasses('gray');
                const IconComp = catData ? getCategoryIcon(catData.icon) : getCategoryIcon('folder');

                return (
                  <Collapsible key={cat} defaultOpen>
                    <CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors text-left group">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90 shrink-0" />
                        <IconComp className={cn("h-3.5 w-3.5 shrink-0", colorClasses.textClass)} />
                        <span className="text-xs font-semibold truncate">{cat}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] text-muted-foreground">{sp?.completed}/{sp?.total}</span>
                        <div className="w-12 h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-green-500" : "bg-primary")}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="ml-3 space-y-px">
                        {items.map(item => {
                          const fileCount = getFilesForItem(item.id).length;
                          const isComplete = statusMap.get(item.id)?.isComplete || fileCount > 0;
                          const isSelected = selectedItemId === item.id;

                          return (
                            <button
                              key={item.id}
                              onClick={() => setSelectedItemId(item.id)}
                              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                              onDrop={(e) => handleItemDrop(item.id, e)}
                              className={cn(
                                "flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left transition-colors text-xs",
                                isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted/50",
                              )}
                            >
                              {isComplete ? (
                                <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                              ) : (
                                <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/40 shrink-0" />
                              )}
                              <span className={cn("flex-1 truncate", isComplete && "text-muted-foreground")}>{item.name}</span>
                              {item.is_required && (
                                <span className="text-[9px] text-amber-600 font-medium shrink-0">REQ</span>
                              )}
                              {fileCount > 0 && (
                                <Badge variant="secondary" className="h-4 px-1 text-[10px]">{fileCount}</Badge>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}

              {/* Unmapped files bucket */}
              {unmappedFiles.length > 0 && (
                <>
                  <Separator className="my-2" />
                  <div className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-xs font-semibold text-amber-600">Unmapped Files ({unmappedFiles.length})</span>
                    </div>
                    <div className="space-y-px ml-1">
                      {unmappedFiles.slice(0, 10).map(file => (
                        <div key={file.id} className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
                          {getFileIcon(file.name)}
                          <span className="truncate">{file.name}</span>
                        </div>
                      ))}
                      {unmappedFiles.length > 10 && (
                        <span className="text-[10px] text-muted-foreground px-2">+{unmappedFiles.length - 10} more</span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* CENTER PANE: File list / upload area */}
        <div className="col-span-4 border rounded-lg overflow-hidden flex flex-col">
          <div className="p-2 border-b bg-muted/30 flex items-center justify-between">
            <span className="text-xs font-semibold">
              {selectedItem ? `Files for: ${selectedItem.name}` : `All Files (${attachments.length})`}
            </span>
            {selectedItem && (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setSelectedItemId(null)}>
                Show All
              </Button>
            )}
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {(selectedItem ? selectedItemFiles : attachments).length === 0 ? (
                <div
                  className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg bg-muted/10 cursor-pointer hover:bg-muted/20 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-8 w-8 text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {selectedItem ? 'Drop files here or click to upload' : 'No files uploaded yet'}
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Drag & drop or click to browse</p>
                </div>
              ) : (
                (selectedItem ? selectedItemFiles : attachments).map(att => {
                  const itemMappings = getItemsForFile(att.id);
                  const isSelected = selectedFiles.has(att.id);
                  return (
                    <div
                      key={att.id}
                      className={cn(
                        "flex items-center gap-2 px-2.5 py-2 rounded-md border transition-colors hover:bg-muted/30",
                        isSelected && "ring-1 ring-primary bg-primary/5"
                      )}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          setSelectedFiles(prev => {
                            const next = new Set(prev);
                            checked ? next.add(att.id) : next.delete(att.id);
                            return next;
                          });
                        }}
                        className="shrink-0"
                      />
                      {getFileIcon(att.name)}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{att.name}</p>
                        <p className="text-[10px] text-muted-foreground">{formatBytes(att.size_bytes)}</p>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {itemMappings.length > 0 && (
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] gap-0.5">
                                <Link2 className="h-2.5 w-2.5" />
                                {itemMappings.length}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">
                              Mapped to {itemMappings.length} checklist item(s)
                            </TooltipContent>
                          </Tooltip>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            {att.url && (
                              <DropdownMenuItem onClick={() => window.open(att.url, '_blank')}>
                                <Eye className="h-3.5 w-3.5 mr-2" /> View
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => handleDownloadFile(att)}>
                              <Download className="h-3.5 w-3.5 mr-2" /> Download
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                              setFilesToMap([att]);
                              setMappingSelections(new Set(getItemsForFile(att.id).map(m => m.checklist_item_id)));
                              setShowMappingDialog(true);
                            }}>
                              <Link2 className="h-3.5 w-3.5 mr-2" /> Map to Items
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => deleteAttachment(att)}>
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>

          {/* Bulk actions for selected files */}
          {selectedFiles.size > 0 && (
            <div className="p-2 border-t bg-muted/30 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{selectedFiles.size} selected</span>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => {
                const files = attachments.filter(a => selectedFiles.has(a.id));
                setFilesToMap(files);
                setMappingSelections(new Set());
                setShowMappingDialog(true);
              }}>
                <Link2 className="h-3 w-3" /> Map to Items
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedFiles(new Set())}>
                Clear
              </Button>
            </div>
          )}
        </div>

        {/* RIGHT PANE: Context / Details */}
        <div className="col-span-4 border rounded-lg overflow-hidden flex flex-col">
          <div className="p-2 border-b bg-muted/30">
            <span className="text-xs font-semibold">
              {selectedItem ? 'Item Details' : 'Room Summary'}
            </span>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3">
              {selectedItem ? (
                <div className="space-y-4">
                  {/* Item info */}
                  <div>
                    <h4 className="font-semibold text-sm">{selectedItem.name}</h4>
                    {selectedItem.description && (
                      <p className="text-xs text-muted-foreground mt-1">{selectedItem.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      {selectedItem.is_required && <Badge variant="secondary" className="text-xs">Required</Badge>}
                      {(selectedItem as any).is_deal_specific && <Badge variant="outline" className="text-xs">Custom</Badge>}
                      {statusMap.get(selectedItem.id)?.isComplete || selectedItemFiles.length > 0 ? (
                        <Badge className="text-xs bg-green-500/10 text-green-600 border-green-500/20">Complete</Badge>
                      ) : (
                        <Badge variant="destructive" className="text-xs">Missing</Badge>
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* Attached files */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold">Attached Files ({selectedItemFiles.length})</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs gap-1"
                        onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.multiple = true;
                          input.onchange = (ev) => {
                            const files = Array.from((ev.target as HTMLInputElement).files || []);
                            if (files.length > 0) handleUploadFiles(files, selectedItem.id);
                          };
                          input.click();
                        }}
                      >
                        <Upload className="h-3 w-3" /> Add
                      </Button>
                    </div>
                    {selectedItemFiles.length === 0 ? (
                      <div className="text-center py-4 border-2 border-dashed rounded-lg text-xs text-muted-foreground">
                        <Paperclip className="h-5 w-5 mx-auto mb-1 opacity-50" />
                        No files attached
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {selectedItemFiles.map(file => (
                          <div key={file.id} className="flex items-center gap-2 p-2 rounded-md border text-xs">
                            {getFileIcon(file.name)}
                            <div className="flex-1 min-w-0">
                              <p className="truncate font-medium">{file.name}</p>
                              <p className="text-[10px] text-muted-foreground">{formatBytes(file.size_bytes)}</p>
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDownloadFile(file)}>
                                    <Download className="h-3 w-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Download</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => unmapFile(file.id, selectedItem.id)}>
                                    <Unlink className="h-3 w-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Unlink from item</TooltipContent>
                              </Tooltip>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Map existing files */}
                  {unmappedFiles.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <span className="text-xs font-semibold">Quick Map Unmapped Files</span>
                        <div className="mt-1 space-y-px">
                          {unmappedFiles.slice(0, 5).map(file => (
                            <div key={file.id} className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-muted/30 rounded-md cursor-pointer"
                              onClick={() => mapFileToItem(file.id, selectedItem.id, 'manual_picker').then(() => toast.success(`Mapped "${file.name}"`))}
                            >
                              {getFileIcon(file.name)}
                              <span className="truncate flex-1">{file.name}</span>
                              <Link2 className="h-3 w-3 text-primary shrink-0" />
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                /* Room summary */
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-3 rounded-lg bg-muted/30 text-center">
                      <p className="text-2xl font-bold">{attachments.length}</p>
                      <p className="text-[10px] text-muted-foreground">Total Files</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30 text-center">
                      <p className="text-2xl font-bold">{unmappedFiles.length}</p>
                      <p className="text-[10px] text-muted-foreground">Unmapped</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30 text-center">
                      <p className="text-2xl font-bold text-green-600">{progressData.completedItems}</p>
                      <p className="text-[10px] text-muted-foreground">Items Satisfied</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30 text-center">
                      <p className="text-2xl font-bold text-amber-600">{progressData.totalItems - progressData.completedItems}</p>
                      <p className="text-[10px] text-muted-foreground">Items Pending</p>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <span className="text-xs font-semibold mb-2 block">Section Progress</span>
                    <div className="space-y-2">
                      {categories.map(cat => {
                        const sp = progressData.sections[cat];
                        const pct = sp ? Math.round((sp.completed / sp.total) * 100) : 0;
                        return (
                          <div key={cat}>
                            <div className="flex items-center justify-between text-xs mb-0.5">
                              <span className="text-muted-foreground">{cat}</span>
                              <span className={cn("font-medium", pct === 100 ? "text-green-600" : "text-foreground")}>{sp?.completed}/{sp?.total}</span>
                            </div>
                            <Progress value={pct} className={cn("h-1.5", pct === 100 && "[&>div]:bg-green-500")} />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Missing required items */}
                  {progressData.requiredTotal > progressData.requiredCompleted && (
                    <>
                      <Separator />
                      <div>
                        <span className="text-xs font-semibold text-amber-600 flex items-center gap-1 mb-1">
                          <AlertCircle className="h-3 w-3" />
                          Missing Required Items
                        </span>
                        <div className="space-y-0.5">
                          {allItems.filter(i => i.is_required && !statusMap.get(i.id)?.isComplete && getFilesForItem(i.id).length === 0).slice(0, 10).map(item => (
                            <button
                              key={item.id}
                              className="w-full text-left px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 rounded-md transition-colors"
                              onClick={() => setSelectedItemId(item.id)}
                            >
                              {item.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
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
      <Dialog open={showMappingDialog} onOpenChange={setShowMappingDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Map Files to Checklist Items</DialogTitle>
          </DialogHeader>
          <div className="text-xs text-muted-foreground mb-2">
            Select which checklist items these {filesToMap.length} file(s) should be linked to.
            A file can be mapped to multiple items.
          </div>
          <div className="flex-1 overflow-hidden">
            <div className="mb-3 space-y-1 max-h-20 overflow-y-auto">
              {filesToMap.map(f => (
                <div key={f.id} className="flex items-center gap-2 text-xs p-1 bg-muted/30 rounded-md">
                  {getFileIcon(f.name)}
                  <span className="truncate">{f.name}</span>
                </div>
              ))}
            </div>
            <Separator className="mb-2" />
            <ScrollArea className="h-[300px]">
              <div className="space-y-1 pr-2">
                {categories.map(cat => (
                  <div key={cat} className="mb-2">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{cat}</span>
                    <div className="mt-0.5 space-y-px">
                      {grouped[cat].map(item => (
                        <label
                          key={item.id}
                          className={cn(
                            "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors text-xs",
                            mappingSelections.has(item.id) ? "bg-primary/10" : "hover:bg-muted/50"
                          )}
                        >
                          <Checkbox
                            checked={mappingSelections.has(item.id)}
                            onCheckedChange={(checked) => {
                              setMappingSelections(prev => {
                                const next = new Set(prev);
                                checked ? next.add(item.id) : next.delete(item.id);
                                return next;
                              });
                            }}
                          />
                          <span className="truncate">{item.name}</span>
                          {item.is_required && <Badge variant="secondary" className="text-[9px] h-4 px-1">REQ</Badge>}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowMappingDialog(false)}>Skip</Button>
            <Button size="sm" onClick={handleConfirmMapping} disabled={mappingSelections.size === 0}>
              Map to {mappingSelections.size} Item(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
