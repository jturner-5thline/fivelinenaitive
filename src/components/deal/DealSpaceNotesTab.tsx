import { useState, useRef } from 'react';
import { Plus, FileText, Trash2, Download, Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDealSpaceNotes, DealSpaceNote } from '@/hooks/useDealSpaceNotes';
import { DealSpaceNoteEditor } from './DealSpaceNoteEditor';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { toast } from '@/hooks/use-toast';

interface DealSpaceNotesTabProps {
  dealId: string;
}

export function DealSpaceNotesTab({ dealId }: DealSpaceNotesTabProps) {
  const { notes, isLoading, createNote, updateNote, deleteNote } = useDealSpaceNotes(dealId);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedNote = notes.find(n => n.id === selectedNoteId);

  const handleCreateNote = async () => {
    const note = await createNote();
    if (note) setSelectedNoteId(note.id);
  };

  const handleDownloadDocx = async (note: DealSpaceNote) => {
    try {
      // Parse HTML content to plain text paragraphs
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = note.content || '';
      const textBlocks = tempDiv.innerText.split('\n').filter(Boolean);

      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              children: [new TextRun({ text: note.title, bold: true, size: 32 })],
              heading: HeadingLevel.HEADING_1,
            }),
            ...textBlocks.map(text => new Paragraph({ children: [new TextRun({ text })] })),
          ],
        }],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${note.title || 'note'}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading note:', error);
      toast({ title: 'Download failed', variant: 'destructive' });
    }
  };

  const handleUploadDocx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      // Basic extraction: read as text for simple docs
      // For complex .docx, we'll extract the document.xml
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(arrayBuffer);
      const docXml = await zip.file('word/document.xml')?.async('string');
      
      if (!docXml) {
        toast({ title: 'Could not read document', variant: 'destructive' });
        return;
      }

      // Parse XML to extract text
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(docXml, 'application/xml');
      const paragraphs = xmlDoc.getElementsByTagName('w:p');
      const htmlParts: string[] = [];

      for (let i = 0; i < paragraphs.length; i++) {
        const runs = paragraphs[i].getElementsByTagName('w:r');
        let paraText = '';
        for (let j = 0; j < runs.length; j++) {
          const textNodes = runs[j].getElementsByTagName('w:t');
          for (let k = 0; k < textNodes.length; k++) {
            paraText += textNodes[k].textContent || '';
          }
        }
        if (paraText) {
          htmlParts.push(`<p>${paraText}</p>`);
        }
      }

      const title = file.name.replace(/\.docx?$/i, '');
      const content = htmlParts.join('');
      
      const note = await createNote(title);
      if (note) {
        await updateNote(note.id, { content });
        setSelectedNoteId(note.id);
        toast({ title: 'Document imported', description: `"${title}" has been imported as a note` });
      }
    } catch (error) {
      console.error('Error importing document:', error);
      toast({ title: 'Import failed', description: 'Could not parse the document', variant: 'destructive' });
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-280px)] min-h-[400px] border rounded-lg overflow-hidden bg-background">
      {/* Sidebar - note list */}
      <div className="w-64 border-r flex flex-col shrink-0">
        <div className="p-2 border-b flex items-center gap-1">
          <Button size="sm" variant="default" className="flex-1 gap-1.5" onClick={handleCreateNote}>
            <Plus className="h-3.5 w-3.5" />
            New Note
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,.doc"
            className="hidden"
            onChange={handleUploadDocx}
          />
        </div>
        <ScrollArea className="flex-1">
          {notes.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No notes yet</p>
              <p className="text-xs mt-1">Create a note to get started</p>
            </div>
          ) : (
            <div className="py-1">
              {notes.map(note => (
                <div
                  key={note.id}
                  className={cn(
                    "group flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors",
                    selectedNoteId === note.id && "bg-muted"
                  )}
                  onClick={() => setSelectedNoteId(note.id)}
                >
                  <FileText className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{note.title || 'Untitled'}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(note.updated_at), 'MMM d, yyyy')}</p>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={(e) => { e.stopPropagation(); handleDownloadDocx(note); }}
                    >
                      <Download className="h-3 w-3" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Note</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{note.title}"? This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => {
                              if (selectedNoteId === note.id) setSelectedNoteId(null);
                              deleteNote(note.id);
                            }}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Main editor area */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedNote ? (
          <DealSpaceNoteEditor
            note={selectedNote}
            onUpdate={updateNote}
            onDownload={handleDownloadDocx}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <FileText className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">Select a note or create a new one</p>
          </div>
        )}
      </div>
    </div>
  );
}
