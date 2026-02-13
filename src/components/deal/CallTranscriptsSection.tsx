import { useState, useRef, useCallback } from 'react';
import { Upload, Trash2, Download, Loader2, FileAudio, Phone, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useDealCallTranscripts, DealCallTranscript } from '@/hooks/useDealCallTranscripts';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface CallTranscriptsSectionProps {
  dealId: string;
}

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export function CallTranscriptsSection({ dealId }: CallTranscriptsSectionProps) {
  const { transcripts, isLoading, isUploading, uploadTranscript, deleteTranscript, getDownloadUrl } = useDealCallTranscripts(dealId);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      await uploadTranscript(file);
    }
  }, [uploadTranscript]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFileUpload(e.dataTransfer.files);
  }, [handleFileUpload]);

  const handleDownload = useCallback(async (transcript: DealCallTranscript) => {
    const url = await getDownloadUrl(transcript);
    if (url) window.open(url, '_blank');
  }, [getDownloadUrl]);

  return (
    <div className="border border-border rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Call Transcripts</span>
          {transcripts.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {transcripts.length}
            </Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
          ) : (
            <Upload className="h-3.5 w-3.5 mr-1.5" />
          )}
          Upload
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFileUpload(e.target.files)}
        accept=".pdf,.doc,.docx,.txt,.md,.rtf,.csv,.vtt,.srt,.json,.mp3,.m4a,.wav"
      />

      {/* Drop zone + content */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
        className={cn(
          "transition-colors",
          isDragging && "bg-primary/5"
        )}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : transcripts.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <FileAudio className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No call transcripts yet</p>
            <p className="text-xs mt-1">
              Drag & drop or{' '}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-primary hover:underline"
              >
                browse
              </button>
              {' '}to upload
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[200px]">
            <div className="divide-y divide-border/50">
              {transcripts.map((transcript) => (
                <div
                  key={transcript.id}
                  className="flex items-center gap-3 px-4 py-2.5 group hover:bg-muted/50 transition-colors"
                >
                  <FileAudio className="h-4 w-4 text-primary/70 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate" title={transcript.name}>{transcript.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(transcript.size_bytes)} • {format(new Date(transcript.created_at), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleDownload(transcript)}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete transcript?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete "{transcript.name}".
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteTranscript(transcript)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
