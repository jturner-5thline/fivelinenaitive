import { useState, useCallback } from 'react';
import { Check, ChevronDown, AlertCircle, Link2, Filter, Download, Eye, Trash2, ArrowLeftRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getCategoryColorClasses } from '@/hooks/useChecklistCategories';
import { getCategoryIcon } from '@/components/settings/CategoryIconPicker';
import { cn } from '@/lib/utils';
import { FileIcon } from './FileIcon';
import { formatBytes, formatRelativeTime } from './helpers';
import type { UnifiedChecklistItem, StatusFilter, ProgressData, DataRoomContextValue } from './types';
import type { DealAttachment } from '@/hooks/useDealAttachments';

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All Items' },
  { value: 'complete', label: 'Complete' },
  { value: 'missing', label: 'Missing' },
  { value: 'required', label: 'Required' },
  { value: 'has_files', label: 'Has Files' },
];

interface ChecklistTreePaneProps {
  categories: string[];
  grouped: Record<string, UnifiedChecklistItem[]>;
  progressData: ProgressData;
  statusMap: Map<string, { isComplete: boolean; attachmentId: string | null }>;
  selectedItemId: string | null;
  setSelectedItemId: (id: string | null) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (f: StatusFilter) => void;
  getFilesForItem: DataRoomContextValue['getFilesForItem'];
  getCategoryByName: DataRoomContextValue['getCategoryByName'];
  unmappedFiles: DealAttachment[];
  handleUploadFiles: DataRoomContextValue['handleUploadFiles'];
  // New props for nested file display
  attachments?: DealAttachment[];
  getItemsForFile?: DataRoomContextValue['getItemsForFile'];
  setPreviewFile?: (f: DealAttachment | null) => void;
  handleDownloadFile?: DataRoomContextValue['handleDownloadFile'];
  onOpenMappingDialog?: (files: DealAttachment[]) => void;
  allItems?: UnifiedChecklistItem[];
  deleteAttachment?: DataRoomContextValue['deleteAttachment'];
  onToggleItemStatus?: (itemId: string, isComplete: boolean) => Promise<boolean>;
}

export function ChecklistTreePane({
  categories, grouped, progressData, statusMap, selectedItemId, setSelectedItemId,
  searchQuery, setSearchQuery, statusFilter, setStatusFilter,
  getFilesForItem, getCategoryByName, unmappedFiles, handleUploadFiles,
  attachments = [], getItemsForFile, setPreviewFile, handleDownloadFile, onOpenMappingDialog, allItems,
  deleteAttachment, onToggleItemStatus,
}: ChecklistTreePaneProps) {
  const [selectedUnmapped, setSelectedUnmapped] = useState<Set<string>>(new Set());
  const [fileToDelete, setFileToDelete] = useState<DealAttachment | null>(null);

  const filterItem = (item: UnifiedChecklistItem): boolean => {
    if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    const fileCount = getFilesForItem(item.id).length;
    const isComplete = statusMap.get(item.id)?.isComplete || fileCount > 0;
    switch (statusFilter) {
      case 'complete': return isComplete;
      case 'missing': return !isComplete;
      case 'required': return item.is_required;
      case 'has_files': return fileCount > 0;
      default: return true;
    }
  };

  // Get actual file objects for a checklist item
  const getFilesForItemResolved = (itemId: string): DealAttachment[] => {
    const mappings = getFilesForItem(itemId);
    return mappings
      .map(m => attachments.find(a => a.id === m.file_id))
      .filter(Boolean) as DealAttachment[];
  };

  return (
    <div className="h-full overflow-hidden flex flex-col">
      <div className="p-2 border-b bg-muted/30 space-y-1.5">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-7 text-xs"
          />
        </div>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant={statusFilter !== 'all' ? 'secondary' : 'ghost'} size="sm" className="h-6 px-2 text-[10px] gap-1">
                <Filter className="h-3 w-3" />
                {FILTER_OPTIONS.find(f => f.value === statusFilter)?.label}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {FILTER_OPTIONS.map(opt => (
                <DropdownMenuItem key={opt.value} onClick={() => setStatusFilter(opt.value)} className="text-xs">
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {statusFilter !== 'all' && (
            <Button variant="ghost" size="sm" className="h-6 px-1 text-[10px]" onClick={() => setStatusFilter('all')}>Clear</Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-1.5 space-y-1">
          {categories.map(cat => {
            const items = grouped[cat].filter(filterItem);
            if (items.length === 0 && statusFilter !== 'all') return null;
            if (items.length === 0 && searchQuery) return null;

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
                    {(items.length > 0 ? items : grouped[cat]).map(item => {
                      if (items.length > 0 && !items.includes(item)) return null;
                      const fileCount = getFilesForItem(item.id).length;
                      const isComplete = statusMap.get(item.id)?.isComplete || fileCount > 0;
                      const isSelected = selectedItemId === item.id;
                      const nestedFiles = getFilesForItemResolved(item.id);

                      return (
                        <div key={item.id}>
                          <button
                            onClick={() => setSelectedItemId(item.id)}
                            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                            onDrop={(e) => {
                              e.preventDefault(); e.stopPropagation();
                              const files = Array.from(e.dataTransfer.files);
                              if (files.length > 0) handleUploadFiles(files, item.id);
                            }}
                            className={cn(
                              "flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left transition-colors text-xs",
                              isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted/50",
                            )}
                          >
                            {isComplete ? (
                              <Check
                                className="h-3.5 w-3.5 text-green-500 shrink-0 cursor-pointer hover:text-green-700 transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleItemStatus?.(item.id, false);
                                }}
                              />
                            ) : (
                              <div
                                className="h-3.5 w-3.5 rounded-full border border-muted-foreground/40 shrink-0 cursor-pointer hover:border-green-500 hover:bg-green-500/10 transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleItemStatus?.(item.id, true);
                                }}
                              />
                            )}
                            <span className={cn("flex-1 truncate", isComplete && "text-muted-foreground")}>{item.name}</span>
                            {item.is_required && (
                              <span className="text-[9px] text-amber-600 font-medium shrink-0">REQ</span>
                            )}
                            {fileCount > 0 && (
                              <Badge variant="secondary" className="h-4 px-1 text-[10px]">{fileCount}</Badge>
                            )}
                          </button>
                          {/* Nested files under checklist item */}
                          {nestedFiles.length > 0 && (
                            <div className="ml-7 mb-1 space-y-px">
                              {nestedFiles.map(file => (
                                <div
                                  key={file.id}
                                  className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] text-muted-foreground hover:bg-muted/30 cursor-pointer group/file"
                                  onClick={() => setPreviewFile?.(file)}
                                >
                                  <FileIcon name={file.name} className="h-3 w-3 shrink-0" />
                                  <span className="truncate flex-1">{file.name}</span>
                                  <span className="text-[9px] shrink-0">{formatBytes(file.size_bytes)}</span>
                                  <div className="flex items-center gap-0.5 opacity-0 group-hover/file:opacity-100 shrink-0">
                                    {handleDownloadFile && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-4 w-4"
                                        onClick={(e) => { e.stopPropagation(); handleDownloadFile(file); }}
                                      >
                                        <Download className="h-2.5 w-2.5" />
                                      </Button>
                                    )}
                                    {deleteAttachment && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-4 w-4 text-destructive hover:text-destructive hover:bg-destructive/10"
                                        onClick={(e) => { e.stopPropagation(); setFileToDelete(file); }}
                                      >
                                        <Trash2 className="h-2.5 w-2.5" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
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
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-xs font-semibold text-amber-600">Unmapped Files ({unmappedFiles.length})</span>
                  </div>
                  {onOpenMappingDialog && unmappedFiles.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-5 px-2 text-[10px] gap-1"
                      onClick={() => onOpenMappingDialog(unmappedFiles)}
                    >
                      <Link2 className="h-2.5 w-2.5" /> Map All
                    </Button>
                  )}
                </div>
                <div className="space-y-px ml-1">
                  {unmappedFiles.slice(0, 10).map(file => {
                    const isChecked = selectedUnmapped.has(file.id);
                    return (
                      <div
                        key={file.id}
                        className={cn(
                          "flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground hover:bg-muted/30 rounded-md cursor-pointer",
                          isChecked && "ring-1 ring-primary bg-primary/5"
                        )}
                        onClick={() => setPreviewFile?.(file)}
                      >
                        <div onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              setSelectedUnmapped(prev => {
                                const next = new Set(prev);
                                checked ? next.add(file.id) : next.delete(file.id);
                                return next;
                              });
                            }}
                            className="shrink-0 h-3.5 w-3.5"
                          />
                        </div>
                        <FileIcon name={file.name} className="h-3.5 w-3.5" />
                        <span className="truncate">{file.name}</span>
                      </div>
                    );
                  })}
                  {unmappedFiles.length > 10 && (
                    <span className="text-[10px] text-muted-foreground px-2">+{unmappedFiles.length - 10} more</span>
                  )}
                </div>
                {selectedUnmapped.size > 0 && deleteAttachment && (
                  <div className="flex items-center gap-2 mt-1.5 px-2">
                    <span className="text-[10px] text-muted-foreground">{selectedUnmapped.size} selected</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-5 px-2 text-[10px] gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={async () => {
                        const filesToDelete = unmappedFiles.filter(f => selectedUnmapped.has(f.id));
                        const count = filesToDelete.length;
                        if (!window.confirm(`Delete ${count} file${count !== 1 ? 's' : ''}? This cannot be undone.`)) return;
                        for (const file of filesToDelete) {
                          await deleteAttachment(file);
                        }
                        setSelectedUnmapped(new Set());
                      }}
                    >
                      <Trash2 className="h-2.5 w-2.5" /> Delete
                    </Button>
                    <Button variant="ghost" size="sm" className="h-5 px-2 text-[10px]" onClick={() => setSelectedUnmapped(new Set())}>
                      Clear
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </ScrollArea>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!fileToDelete} onOpenChange={(open) => !open && setFileToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete file</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <span className="font-medium text-foreground">{fileToDelete?.name}</span>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (fileToDelete && deleteAttachment) {
                  await deleteAttachment(fileToDelete);
                }
                setFileToDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
