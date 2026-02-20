import { Upload, Link2, Download, Eye, Trash2, MoreHorizontal, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { FileIcon } from './FileIcon';
import { formatBytes, formatRelativeTime } from './helpers';
import type { DealAttachment } from '@/hooks/useDealAttachments';
import type { DataRoomContextValue, UnifiedChecklistItem } from './types';

interface FileListPaneProps {
  selectedItem: UnifiedChecklistItem | null;
  selectedItemFiles: DealAttachment[];
  attachments: DealAttachment[];
  selectedFiles: Set<string>;
  setSelectedFiles: React.Dispatch<React.SetStateAction<Set<string>>>;
  getItemsForFile: DataRoomContextValue['getItemsForFile'];
  getFilesForItem: DataRoomContextValue['getFilesForItem'];
  handleDownloadFile: DataRoomContextValue['handleDownloadFile'];
  handleUploadFiles: DataRoomContextValue['handleUploadFiles'];
  deleteAttachment: DataRoomContextValue['deleteAttachment'];
  setSelectedItemId: (id: string | null) => void;
  setPreviewFile: (f: DealAttachment | null) => void;
  onOpenMappingDialog: (files: DealAttachment[]) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  allItems: UnifiedChecklistItem[];
}

export function FileListPane({
  selectedItem, selectedItemFiles, attachments, selectedFiles, setSelectedFiles,
  getItemsForFile, getFilesForItem, handleDownloadFile, handleUploadFiles, deleteAttachment,
  setSelectedItemId, setPreviewFile, onOpenMappingDialog, fileInputRef, allItems,
}: FileListPaneProps) {
  const displayFiles = selectedItem ? selectedItemFiles : attachments;

  // Detect file "versions" — files with similar names mapped to same item
  const getVersionInfo = (att: DealAttachment) => {
    if (!selectedItem) return null;
    const siblings = selectedItemFiles.filter(f => f.id !== att.id);
    const baseName = att.name.replace(/\.[^.]+$/, '').replace(/[-_\s]*(v?\d+|final|draft|revised|updated)$/i, '');
    const versions = siblings.filter(s => {
      const sBase = s.name.replace(/\.[^.]+$/, '').replace(/[-_\s]*(v?\d+|final|draft|revised|updated)$/i, '');
      return sBase.toLowerCase() === baseName.toLowerCase();
    });
    if (versions.length === 0) return null;
    // Sort by date to determine version number
    const allVersions = [att, ...versions].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const idx = allVersions.findIndex(v => v.id === att.id);
    return { version: idx + 1, total: allVersions.length };
  };

  // Drag start handler for file → checklist mapping
  const handleDragStart = (e: React.DragEvent, att: DealAttachment) => {
    e.dataTransfer.setData('application/x-file-id', att.id);
    e.dataTransfer.effectAllowed = 'link';
  };

  return (
    <div className="col-span-4 border rounded-lg overflow-hidden flex flex-col">
      <div className="p-2 border-b bg-muted/30 flex items-center justify-between">
        <span className="text-xs font-semibold">
          {selectedItem ? `Files for: ${selectedItem.name}` : `All Files (${attachments.length})`}
        </span>
        <div className="flex items-center gap-1">
          {selectedItem && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setSelectedItemId(null)}>
              Show All
            </Button>
          )}
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {displayFiles.length === 0 ? (
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
            displayFiles.map(att => {
              const itemMappings = getItemsForFile(att.id);
              const isSelected = selectedFiles.has(att.id);
              const versionInfo = getVersionInfo(att);

              return (
                <div
                  key={att.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, att)}
                  className={cn(
                    "flex items-center gap-2 px-2.5 py-2 rounded-md border transition-colors hover:bg-muted/30 cursor-grab active:cursor-grabbing",
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
                  <div className="cursor-grab shrink-0 text-muted-foreground/50">
                    <GripVertical className="h-3.5 w-3.5" />
                  </div>
                  <FileIcon name={att.name} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium truncate">{att.name}</p>
                      {versionInfo && (
                        <Badge variant="outline" className="h-4 px-1 text-[9px] shrink-0 bg-blue-500/10 text-blue-600 border-blue-500/20">
                          v{versionInfo.version}/{versionInfo.total}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {formatBytes(att.size_bytes)} · {formatRelativeTime(att.created_at)}
                    </p>
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
                        <DropdownMenuItem onClick={() => setPreviewFile(att)}>
                          <Eye className="h-3.5 w-3.5 mr-2" /> Preview
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDownloadFile(att)}>
                          <Download className="h-3.5 w-3.5 mr-2" /> Download
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onOpenMappingDialog([att])}>
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
            onOpenMappingDialog(files);
          }}>
            <Link2 className="h-3 w-3" /> Map to Items
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedFiles(new Set())}>
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}
