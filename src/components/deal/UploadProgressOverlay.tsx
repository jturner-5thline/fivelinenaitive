import { X, CheckCircle, AlertCircle, Loader2, File } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export interface UploadProgressItem {
  id: string;
  fileName: string;
  fileSize: number;
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  error?: string;
}

interface UploadProgressOverlayProps {
  uploads: UploadProgressItem[];
  onDismiss: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function UploadProgressOverlay({ uploads, onDismiss }: UploadProgressOverlayProps) {
  const completedCount = uploads.filter(u => u.status === 'complete').length;
  const errorCount = uploads.filter(u => u.status === 'error').length;
  const totalCount = uploads.length;
  const allDone = uploads.every(u => u.status === 'complete' || u.status === 'error');
  const overallProgress = totalCount > 0 
    ? Math.round(uploads.reduce((sum, u) => sum + u.progress, 0) / totalCount)
    : 0;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-background border border-border rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-2">
          {allDone ? (
            errorCount > 0 ? (
              <AlertCircle className="h-4 w-4 text-destructive" />
            ) : (
              <CheckCircle className="h-4 w-4 text-green-500" />
            )
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          )}
          <span className="text-sm font-medium">
            {allDone 
              ? `${completedCount} of ${totalCount} uploaded${errorCount > 0 ? ` (${errorCount} failed)` : ''}`
              : `Uploading ${totalCount} file${totalCount > 1 ? 's' : ''}...`
            }
          </span>
        </div>
        {allDone && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onDismiss}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Overall progress */}
      {!allDone && (
        <div className="px-3 py-2 border-b border-border">
          <Progress value={overallProgress} className="h-1.5" />
          <p className="text-xs text-muted-foreground mt-1 text-right">{overallProgress}%</p>
        </div>
      )}

      {/* File list */}
      <div className="max-h-48 overflow-y-auto">
        {uploads.map((upload) => (
          <UploadProgressItem key={upload.id} upload={upload} />
        ))}
      </div>
    </div>
  );
}

function UploadProgressItem({ upload }: { upload: UploadProgressItem }) {
  return (
    <div className={cn(
      "px-3 py-2 border-b border-border/50 last:border-b-0",
      upload.status === 'error' && "bg-destructive/5"
    )}>
      <div className="flex items-center gap-2">
        <div className="shrink-0">
          {upload.status === 'complete' ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : upload.status === 'error' ? (
            <AlertCircle className="h-4 w-4 text-destructive" />
          ) : upload.status === 'uploading' ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <File className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm truncate" title={upload.fileName}>{upload.fileName}</p>
          <p className="text-xs text-muted-foreground">
            {upload.status === 'error' 
              ? <span className="text-destructive">{upload.error || 'Upload failed'}</span>
              : formatFileSize(upload.fileSize)
            }
          </p>
        </div>
        {upload.status === 'uploading' && (
          <span className="text-xs font-medium text-primary shrink-0">{upload.progress}%</span>
        )}
      </div>
      {upload.status === 'uploading' && (
        <Progress value={upload.progress} className="h-1 mt-1.5" />
      )}
    </div>
  );
}
