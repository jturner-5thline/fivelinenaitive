import { useState, useCallback, useRef } from 'react';
import { Upload, FileText, X, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface BulkUploadStepProps {
  onContinue: (files: File[]) => void;
  onCancel: () => void;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BulkUploadStep({ onContinue, onCancel }: BulkUploadStepProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((newFiles: File[]) => {
    setFiles(prev => {
      const existing = new Set(prev.map(f => `${f.name}-${f.size}`));
      const unique = newFiles.filter(f => !existing.has(`${f.name}-${f.size}`));
      return [...prev, ...unique];
    });
  }, []);

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  }, [addFiles]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 h-10 min-h-[2.5rem] border-b border-border/40">
        <h2 className="text-sm font-semibold">Upload Items</h2>
        <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={onCancel}>Cancel</Button>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-3">
        {/* Drop zone */}
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => { addFiles(Array.from(e.target.files || [])); if (fileInputRef.current) fileInputRef.current.value = ''; }} />
        <div
          onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors py-8',
            isDragOver ? 'border-primary bg-primary/10 text-primary' : 'border-border/50 text-muted-foreground hover:border-primary/40'
          )}
        >
          <Upload className="h-6 w-6" />
          <p className="text-xs font-medium">Drag & drop files or click to browse</p>
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{files.length} item{files.length !== 1 ? 's' : ''} added</p>
            <div className="space-y-0.5 max-h-[300px] overflow-auto">
              {files.map((file, idx) => (
                <div key={`${file.name}-${idx}`} className="flex items-center gap-2 py-1.5 px-2 rounded-md text-xs bg-secondary/30 group">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="truncate flex-1">{file.name}</span>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">{formatSize(file.size)}</span>
                  <button onClick={() => removeFile(idx)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-border/40">
        <Button
          size="sm"
          className="w-full gap-1.5 text-xs"
          disabled={files.length === 0}
          onClick={() => onContinue(files)}
        >
          Continue to Mapping
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
