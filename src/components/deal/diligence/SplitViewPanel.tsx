import { useState, useEffect } from 'react';
import { Loader2, FileSpreadsheet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ExcelViewer } from '../ExcelViewer';
import { DealSpaceNoteEditor } from '../DealSpaceNoteEditor';
import { useDealSpaceNotes } from '@/hooks/useDealSpaceNotes';
import { NotesSidebar } from '../notes/NotesSidebar';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { IngestedFile } from './types';

interface SplitViewPanelProps {
  dealId: string;
  file: IngestedFile | null;
  onClose: () => void;
}

export function SplitViewPanel({ dealId, file, onClose }: SplitViewPanelProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { notes, isLoading: notesLoading, createNote, updateNote, deleteNote, fetchVersions, restoreVersion } = useDealSpaceNotes(dealId);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  const selectedNote = notes.find(n => n.id === selectedNoteId);

  useEffect(() => {
    if (!file?.storagePath) {
      setSignedUrl(null);
      return;
    }
    setIsLoading(true);
    supabase.storage
      .from('deal-space')
      .createSignedUrl(file.storagePath, 3600)
      .then(({ data, error }) => {
        if (!error && data) setSignedUrl(data.signedUrl);
      })
      .finally(() => setIsLoading(false));
  }, [file?.storagePath]);

  const handleCreateNote = async (title?: string, content?: string) => {
    const note = await createNote(title, content);
    if (note) setSelectedNoteId(note.id);
  };

  if (!file) {
    return (
      <div className="flex items-center justify-center h-[500px] text-muted-foreground">
        <div className="text-center">
          <FileSpreadsheet className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Select a file from the list to preview</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden h-[600px]">
      <ResizablePanelGroup direction="horizontal">
        {/* Left: Read-only file preview (60%) */}
        <ResizablePanel defaultSize={60} minSize={40}>
          <div className="h-full flex flex-col">
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
              <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
              <span className="text-xs font-medium truncate">{file.name}</span>
              <span className="text-[10px] text-muted-foreground ml-auto">Read-only preview</span>
            </div>
            <div className="flex-1 min-h-0">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : signedUrl ? (
                <ExcelViewer
                  fileUrl={signedUrl}
                  fileName={file.name}
                  readOnly={true}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Could not load file preview
                </div>
              )}
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right: Notes editor (40%) */}
        <ResizablePanel defaultSize={40} minSize={25}>
          <div className="h-full flex">
            {/* Mini notes sidebar */}
            <div className="w-48 border-r flex-shrink-0">
              <NotesSidebar
                notes={notes}
                selectedNoteId={selectedNoteId}
                onSelectNote={(id) => setSelectedNoteId(id || null)}
                onCreateNote={handleCreateNote}
                onDeleteNote={(id) => { if (selectedNoteId === id) setSelectedNoteId(null); deleteNote(id); }}
                onUpdateNote={updateNote}
              />
            </div>
            {/* Editor */}
            <div className="flex-1 min-w-0">
              {selectedNote ? (
                <DealSpaceNoteEditor
                  note={selectedNote}
                  onUpdate={updateNote}
                  dealId={dealId}
                  isFullscreen={false}
                  onToggleFullscreen={() => {}}
                  showComments={false}
                  onToggleComments={() => {}}
                  fetchVersions={fetchVersions}
                  restoreVersion={restoreVersion}
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground h-full">
                  <p className="text-xs">Select or create a note</p>
                </div>
              )}
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
