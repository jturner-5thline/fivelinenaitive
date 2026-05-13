import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { NoteVersion } from '@/hooks/useDealSpaceNotes';
import { format } from 'date-fns';
import { History, RotateCcw } from 'lucide-react';
import DOMPurify from 'dompurify';

interface NoteVersionHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: string;
  fetchVersions: (noteId: string) => Promise<NoteVersion[]>;
  onRestore: (noteId: string, version: NoteVersion) => Promise<void>;
}

export function NoteVersionHistory({ open, onOpenChange, noteId, fetchVersions, onRestore }: NoteVersionHistoryProps) {
  const [versions, setVersions] = useState<NoteVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<NoteVersion | null>(null);

  useEffect(() => {
    if (open && noteId) {
      setLoading(true);
      fetchVersions(noteId).then(v => { setVersions(v); setLoading(false); });
    }
  }, [open, noteId, fetchVersions]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><History className="h-4 w-4" /> Version History</DialogTitle>
        </DialogHeader>
        <div className="flex flex-1 min-h-0 gap-3">
          {/* Version list */}
          <ScrollArea className="w-56 border-r pr-2 shrink-0">
            {loading ? (
              <p className="text-sm text-muted-foreground p-2">Loading…</p>
            ) : versions.length === 0 ? (
              <p className="text-sm text-muted-foreground p-2">No previous versions yet.</p>
            ) : (
              <div className="space-y-0.5">
                {versions.map(v => (
                  <button
                    key={v.id}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted/50 transition-colors ${selectedVersion?.id === v.id ? 'bg-muted' : ''}`}
                    onClick={() => setSelectedVersion(v)}
                  >
                    <p className="font-medium truncate">{v.title || 'Untitled'}</p>
                    <p className="text-muted-foreground text-[10px]">{format(new Date(v.created_at), 'MMM d, yyyy h:mm a')}</p>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
          {/* Preview */}
          <div className="flex-1 flex flex-col min-w-0">
            {selectedVersion ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">{selectedVersion.title}</p>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { onRestore(noteId, selectedVersion); onOpenChange(false); }}>
                    <RotateCcw className="h-3.5 w-3.5" /> Restore this version
                  </Button>
                </div>
                <ScrollArea className="flex-1 border rounded-md p-4">
                  <div className="prose prose-sm dark:prose-invert max-w-none text-xs" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedVersion.content || '', { USE_PROFILES: { html: true } }) }} />
                </ScrollArea>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                Select a version to preview
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
