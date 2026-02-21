import { useState } from 'react';
import { Upload, Download, Link2, Unlink, Paperclip, AlertCircle, FileDown, Eye, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { FileIcon } from './FileIcon';
import { formatBytes, formatRelativeTime } from './helpers';
import { CommentsThread } from './CommentsThread';
import { DueDatePicker, DueDateBadge } from './DueDatePicker';
import type { DealAttachment } from '@/hooks/useDealAttachments';
import type { DataRoomComment } from '@/hooks/useDataRoomComments';
import type { UnifiedChecklistItem, ProgressData, DataRoomContextValue } from './types';

interface ContextPaneProps {
  selectedItem: UnifiedChecklistItem | null;
  selectedItemFiles: DealAttachment[];
  statusMap: Map<string, { isComplete: boolean; attachmentId: string | null }>;
  progressData: ProgressData;
  categories: string[];
  allItems: UnifiedChecklistItem[];
  attachments: DealAttachment[];
  unmappedFiles: DealAttachment[];
  getFilesForItem: DataRoomContextValue['getFilesForItem'];
  mapFileToItem: DataRoomContextValue['mapFileToItem'];
  unmapFile: DataRoomContextValue['unmapFile'];
  handleUploadFiles: DataRoomContextValue['handleUploadFiles'];
  handleDownloadFile: DataRoomContextValue['handleDownloadFile'];
  setSelectedItemId: (id: string | null) => void;
  setPreviewFile: (f: DealAttachment | null) => void;
  onExportIndex: () => void;
  onDownloadSection: (category: string) => void;
  onDownloadAll: () => void;
  // New props for comments
  comments?: DataRoomComment[];
  onAddComment?: (itemId: string, content: string, parentId?: string) => Promise<boolean>;
  onDeleteComment?: (commentId: string) => Promise<boolean>;
  getCommentsForItem?: (itemId: string) => DataRoomComment[];
  currentUserId?: string;
}

export function ContextPane({
  selectedItem, selectedItemFiles, statusMap, progressData,
  categories, allItems, attachments, unmappedFiles,
  getFilesForItem, mapFileToItem, unmapFile,
  handleUploadFiles, handleDownloadFile, setSelectedItemId,
  setPreviewFile, onExportIndex, onDownloadSection, onDownloadAll,
  comments, onAddComment, onDeleteComment, getCommentsForItem, currentUserId,
}: ContextPaneProps) {

  return (
    <div className="h-full flex flex-col">
      <div className="p-2 border-b bg-muted/30 flex items-center justify-between">
        <span className="text-xs font-semibold">
          {selectedItem ? 'Item Details' : 'Room Summary'}
        </span>
        {!selectedItem && (
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onExportIndex}>
                  <FileDown className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export checklist index (CSV)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onDownloadAll}>
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download all files (ZIP)</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3">
          {selectedItem ? (
            <ItemDetailView
              item={selectedItem}
              files={selectedItemFiles}
              statusMap={statusMap}
              unmappedFiles={unmappedFiles}
              mapFileToItem={mapFileToItem}
              unmapFile={unmapFile}
              handleUploadFiles={handleUploadFiles}
              handleDownloadFile={handleDownloadFile}
              setPreviewFile={setPreviewFile}
              comments={comments || []}
              onAddComment={onAddComment}
              onDeleteComment={onDeleteComment}
              currentUserId={currentUserId}
            />
          ) : (
            <RoomSummaryView
              progressData={progressData}
              categories={categories}
              allItems={allItems}
              attachments={attachments}
              unmappedFiles={unmappedFiles}
              statusMap={statusMap}
              getFilesForItem={getFilesForItem}
              setSelectedItemId={setSelectedItemId}
              onDownloadSection={onDownloadSection}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function ItemDetailView({
  item, files, statusMap, unmappedFiles,
  mapFileToItem, unmapFile, handleUploadFiles, handleDownloadFile, setPreviewFile,
  comments, onAddComment, onDeleteComment, currentUserId,
}: {
  item: UnifiedChecklistItem;
  files: DealAttachment[];
  statusMap: Map<string, { isComplete: boolean; attachmentId: string | null }>;
  unmappedFiles: DealAttachment[];
  mapFileToItem: DataRoomContextValue['mapFileToItem'];
  unmapFile: DataRoomContextValue['unmapFile'];
  handleUploadFiles: DataRoomContextValue['handleUploadFiles'];
  handleDownloadFile: DataRoomContextValue['handleDownloadFile'];
  setPreviewFile: (f: DealAttachment | null) => void;
  comments: DataRoomComment[];
  onAddComment?: (itemId: string, content: string, parentId?: string) => Promise<boolean>;
  onDeleteComment?: (commentId: string) => Promise<boolean>;
  currentUserId?: string;
}) {
  const isComplete = statusMap.get(item.id)?.isComplete || files.length > 0;
  const itemComments = comments.filter(c => c.checklist_item_id === item.id);

  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-semibold text-sm">{item.name}</h4>
        {item.description && (
          <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
        )}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {item.is_required && <Badge variant="secondary" className="text-xs">Required</Badge>}
          {(item as any).is_deal_specific && <Badge variant="outline" className="text-xs">Custom</Badge>}
          {isComplete ? (
            <Badge className="text-xs bg-green-500/10 text-green-600 border-green-500/20">Complete</Badge>
          ) : (
            <Badge variant="destructive" className="text-xs">Missing</Badge>
          )}
          <DueDateBadge dueDate={(item as any).due_date} />
        </div>
      </div>

      <Separator />

      {/* Attached files */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold">Attached Files ({files.length})</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs gap-1"
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.multiple = true;
              input.onchange = (ev) => {
                const f = Array.from((ev.target as HTMLInputElement).files || []);
                if (f.length > 0) handleUploadFiles(f, item.id);
              };
              input.click();
            }}
          >
            <Upload className="h-3 w-3" /> Add
          </Button>
        </div>
        {files.length === 0 ? (
          <div
            className="text-center py-4 border-2 border-dashed rounded-lg text-xs text-muted-foreground cursor-pointer hover:bg-muted/10 transition-colors"
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
            onDrop={(e) => {
              e.preventDefault();
              const droppedFiles = Array.from(e.dataTransfer.files);
              if (droppedFiles.length > 0) handleUploadFiles(droppedFiles, item.id);
            }}
          >
            <Paperclip className="h-5 w-5 mx-auto mb-1 opacity-50" />
            Drop files here or click Add
          </div>
        ) : (
          <div className="space-y-1">
            {files.map(file => (
              <div key={file.id} className="flex items-center gap-2 p-2 rounded-md border text-xs group">
                <FileIcon name={file.name} />
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium">{file.name}</p>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    {formatBytes(file.size_bytes)}
                    <span>·</span>
                    <Clock className="h-2.5 w-2.5" />
                    {formatRelativeTime(file.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPreviewFile(file)}>
                        <Eye className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Preview</TooltipContent>
                  </Tooltip>
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
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => unmapFile(file.id, item.id)}>
                        <Unlink className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Unlink</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick map unmapped files */}
      {unmappedFiles.length > 0 && (
        <>
          <Separator />
          <div>
            <span className="text-xs font-semibold">Quick Map Unmapped Files</span>
            <div className="mt-1 space-y-px">
              {unmappedFiles.slice(0, 5).map(file => (
                <div key={file.id} className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-muted/30 rounded-md cursor-pointer"
                  onClick={() => mapFileToItem(file.id, item.id, 'manual_picker')}
                >
                  <FileIcon name={file.name} className="h-3.5 w-3.5" />
                  <span className="truncate flex-1">{file.name}</span>
                  <Link2 className="h-3 w-3 text-primary shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Comments */}
      {onAddComment && onDeleteComment && (
        <>
          <Separator />
          <CommentsThread
            comments={comments}
            checklistItemId={item.id}
            onAddComment={onAddComment}
            onDeleteComment={onDeleteComment}
            currentUserId={currentUserId}
          />
        </>
      )}
    </div>
  );
}

function RoomSummaryView({
  progressData, categories, allItems, attachments, unmappedFiles,
  statusMap, getFilesForItem, setSelectedItemId, onDownloadSection,
}: {
  progressData: ProgressData;
  categories: string[];
  allItems: UnifiedChecklistItem[];
  attachments: DealAttachment[];
  unmappedFiles: DealAttachment[];
  statusMap: Map<string, { isComplete: boolean; attachmentId: string | null }>;
  getFilesForItem: DataRoomContextValue['getFilesForItem'];
  setSelectedItemId: (id: string | null) => void;
  onDownloadSection: (category: string) => void;
}) {
  // Calculate readiness
  const requiredPct = progressData.requiredTotal > 0
    ? Math.round((progressData.requiredCompleted / progressData.requiredTotal) * 100)
    : 100;
  const readinessLabel = requiredPct === 100 ? 'Ready' : requiredPct >= 75 ? 'Almost Ready' : requiredPct >= 50 ? 'In Progress' : 'Needs Attention';
  const readinessColor = requiredPct === 100 ? 'text-green-600' : requiredPct >= 75 ? 'text-blue-600' : requiredPct >= 50 ? 'text-amber-600' : 'text-destructive';

  return (
    <div className="space-y-4">
      {/* Readiness Score */}
      <div className="p-3 rounded-lg border bg-muted/20 text-center">
        <p className={cn("text-3xl font-bold", readinessColor)}>{requiredPct}%</p>
        <p className={cn("text-xs font-semibold", readinessColor)}>{readinessLabel}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {progressData.requiredCompleted}/{progressData.requiredTotal} required items complete
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="p-2.5 rounded-lg bg-muted/30 text-center">
          <p className="text-xl font-bold">{attachments.length}</p>
          <p className="text-[10px] text-muted-foreground">Total Files</p>
        </div>
        <div className="p-2.5 rounded-lg bg-muted/30 text-center">
          <p className={cn("text-xl font-bold", unmappedFiles.length > 0 ? "text-amber-600" : "text-green-600")}>{unmappedFiles.length}</p>
          <p className="text-[10px] text-muted-foreground">Unmapped</p>
        </div>
        <div className="p-2.5 rounded-lg bg-muted/30 text-center">
          <p className="text-xl font-bold text-green-600">{progressData.completedItems}</p>
          <p className="text-[10px] text-muted-foreground">Satisfied</p>
        </div>
        <div className="p-2.5 rounded-lg bg-muted/30 text-center">
          <p className="text-xl font-bold text-amber-600">{progressData.totalItems - progressData.completedItems}</p>
          <p className="text-[10px] text-muted-foreground">Pending</p>
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
              <div key={cat} className="group">
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="text-muted-foreground">{cat}</span>
                  <div className="flex items-center gap-1.5">
                    <span className={cn("font-medium", pct === 100 ? "text-green-600" : "text-foreground")}>{sp?.completed}/{sp?.total}</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => onDownloadSection(cat)}>
                          <Download className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Download section files</TooltipContent>
                    </Tooltip>
                  </div>
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
              Missing Required Items ({progressData.requiredTotal - progressData.requiredCompleted})
            </span>
            <div className="space-y-0.5">
              {allItems
                .filter(i => i.is_required && !statusMap.get(i.id)?.isComplete && getFilesForItem(i.id).length === 0)
                .slice(0, 10)
                .map(item => (
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
  );
}
