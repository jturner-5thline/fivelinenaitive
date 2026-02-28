import { useState, useRef, useCallback } from 'react';
import { Upload, FileSpreadsheet, FileText, Loader2, CheckCircle2, AlertCircle, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { IngestedFile, FileStatus } from './types';

interface IngestionPanelProps {
  files: IngestedFile[];
  isUploading: boolean;
  onUpload: (files: FileList) => void;
  onRemoveFile: (fileId: string) => void;
  onSelectFile: (fileId: string) => void;
  selectedFileId: string | null;
  className?: string;
}

const STATUS_CONFIG: Record<FileStatus, { label: string; color: string; icon: React.ReactNode }> = {
  uploading: { label: 'Uploading', color: 'text-blue-400', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  parsing: { label: 'Parsing formulas…', color: 'text-amber-400', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  mapping: { label: 'Mapping statements…', color: 'text-purple-400', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  ready: { label: 'Ready', color: 'text-emerald-400', icon: <CheckCircle2 className="h-3 w-3" /> },
  error: { label: 'Error', color: 'text-red-400', icon: <AlertCircle className="h-3 w-3" /> },
};

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const getFileIcon = (type: string, name: string) => {
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm' || ext === 'csv') {
    return <FileSpreadsheet className="h-4 w-4 text-emerald-400" />;
  }
  return <FileText className="h-4 w-4 text-blue-400" />;
};

export function IngestionPanel({
  files,
  isUploading,
  onUpload,
  onRemoveFile,
  onSelectFile,
  selectedFileId,
  className,
}: IngestionPanelProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      onUpload(e.dataTransfer.files);
    }
  }, [onUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const activeFiles = files.filter(f => f.status !== 'error');
  const processingCount = files.filter(f => ['uploading', 'parsing', 'mapping'].includes(f.status)).length;

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer",
          isDragging
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-border/40 hover:border-primary/50 hover:bg-muted/30",
          isUploading && "opacity-50 pointer-events-none"
        )}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && onUpload(e.target.files)}
          accept=".pdf,.xlsx,.xls,.xlsm,.csv,.doc,.docx,.txt"
        />
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Upload className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">
              Drop VDR files here or <span className="text-primary">browse</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Excel, CSV, PDF, Word • Handles 10+ workbooks with nested formulas
            </p>
          </div>
        </div>
        {isDragging && (
          <div className="absolute inset-0 rounded-xl bg-primary/10 flex items-center justify-center">
            <p className="text-sm font-medium text-primary">Release to upload</p>
          </div>
        )}
      </div>

      {/* File List */}
      {files.length > 0 && (
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-4">
          <CollapsibleTrigger asChild>
            <button className="flex items-center justify-between w-full px-1 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
              <span>
                {activeFiles.length} file{activeFiles.length !== 1 ? 's' : ''} ingested
                {processingCount > 0 && (
                  <span className="text-amber-400 ml-2">
                    ({processingCount} processing)
                  </span>
                )}
              </span>
              <ChevronDown className={cn("h-3 w-3 transition-transform", isOpen && "rotate-180")} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-1">
                {files.map(file => {
                  const status = STATUS_CONFIG[file.status];
                  return (
                    <div
                      key={file.id}
                      onClick={() => file.status === 'ready' && onSelectFile(file.id)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group",
                        file.status === 'ready' && "cursor-pointer hover:bg-muted/60",
                        selectedFileId === file.id && "bg-primary/10 ring-1 ring-primary/20"
                      )}
                    >
                      {getFileIcon(file.type, file.name)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium truncate">{file.name}</span>
                          <span className={cn("flex items-center gap-1 text-[10px]", status.color)}>
                            {status.icon}
                            {status.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                          <span>{formatSize(file.size)}</span>
                          {file.sheetCount && (
                            <>
                              <span>•</span>
                              <span>{file.sheetCount} sheets</span>
                            </>
                          )}
                          {file.dateRange && (
                            <>
                              <span>•</span>
                              <span>{file.dateRange}</span>
                            </>
                          )}
                          {file.detectedStatements && file.detectedStatements.length > 0 && (
                            <>
                              <span>•</span>
                              <span>
                                {file.detectedStatements.map(s =>
                                  s.type === 'income_statement' ? 'P&L' :
                                  s.type === 'balance_sheet' ? 'BS' :
                                  s.type === 'cash_flow' ? 'CF' :
                                  s.type === 'debt_schedule' ? 'Debt' : s.type
                                ).join(', ')} detected
                              </span>
                            </>
                          )}
                        </div>
                        {(file.status === 'uploading' || file.status === 'parsing') && (
                          <Progress value={file.progress} className="h-1 mt-1.5" />
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => { e.stopPropagation(); onRemoveFile(file.id); }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
