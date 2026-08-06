import { useState, useRef } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { useDealSpaceNotes, DealSpaceNote } from '@/hooks/useDealSpaceNotes';
import { useNoteCommentCounts } from '@/hooks/useNoteCommentCounts';
import { DealSpaceNoteEditor } from './DealSpaceNoteEditor';
import { NotesSidebar } from './notes/NotesSidebar';
import { NoteComments } from './notes/NoteComments';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { toast } from '@/hooks/use-toast';
import { useFinancialComments } from '@/hooks/useFinancialComments';
import { FinancialCommentsSection } from './saas-model/FinancialCommentsSection';
import { Separator } from '@/components/ui/separator';
import { HighlightCalendarMenu } from '@/components/calendar/HighlightCalendarMenu';
import { ClaapRecordingDetailsPanel } from '@/components/claap/ClaapRecordingDetailsPanel';

interface DealSpaceNotesTabProps {
  dealId: string;
}

export function DealSpaceNotesTab({ dealId }: DealSpaceNotesTabProps) {
  const {
    notes, isLoading, createNote, updateNote, deleteNote,
    fetchVersions, restoreVersion,
    fetchComments, addComment, resolveComment, deleteComment,
  } = useDealSpaceNotes(dealId);
  const { comments: financialComments, deleteComment: deleteFinancialComment } = useFinancialComments(dealId);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [showComments, setShowComments] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pendingQuote, setPendingQuote] = useState<string | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<{ recordingId: string; title: string; url?: string | null } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedNote = notes.find(n => n.id === selectedNoteId);
  const { data: commentCounts = {} } = useNoteCommentCounts(dealId, notes.map(n => n.id));

  const handleCreateNote = async (title?: string, content?: string) => {
    const note = await createNote(title, content);
    if (note) setSelectedNoteId(note.id);
  };

  const handleDownloadDocx = async (note: DealSpaceNote) => {
    try {
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
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(arrayBuffer);
      const docXml = await zip.file('word/document.xml')?.async('string');

      if (!docXml) {
        toast({ title: 'Could not read document', variant: 'destructive' });
        return;
      }

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
        if (paraText) htmlParts.push(`<p>${paraText}</p>`);
      }

      const title = file.name.replace(/\.docx?$/i, '');
      const content = htmlParts.join('');

      const note = await createNote(title, content);
      if (note) {
        setSelectedNoteId(note.id);
        toast({ title: 'Document imported', description: `"${title}" has been imported as a note` });
      }
    } catch (error) {
      console.error('Error importing document:', error);
      toast({ title: 'Import failed', description: 'Could not parse the document', variant: 'destructive' });
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const containerClass = isFullscreen
    ? "fixed inset-0 z-50 flex bg-background"
    : "flex h-[calc(100vh-280px)] min-h-[400px] rounded-lg overflow-hidden bg-transparent";

  return (
    <div className="space-y-4">
      <div className={containerClass}>
        {/* Hidden file input for upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".docx,.doc"
          className="hidden"
          onChange={handleUploadDocx}
        />

        {/* Sidebar */}
        <NotesSidebar
          notes={notes}
          selectedNoteId={selectedNoteId}
          onSelectNote={(id) => { setSelectedMeeting(null); setSelectedNoteId(id || null); }}
          onCreateNote={handleCreateNote}
          onDeleteNote={(id) => { if (selectedNoteId === id) setSelectedNoteId(null); deleteNote(id); }}
          onUpdateNote={updateNote}
          onDownload={handleDownloadDocx}
          onUpload={() => fileInputRef.current?.click()}
          fileInputRef={fileInputRef}
          commentCounts={commentCounts}
          dealId={dealId}
          selectedMeetingId={selectedMeeting?.recordingId ?? null}
          onSelectMeeting={(m) => { setSelectedNoteId(null); setSelectedMeeting(m); }}
        />

        {/* Main editor */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {selectedMeeting ? (
            <ClaapRecordingDetailsPanel
              recordingId={selectedMeeting.recordingId}
              recordingTitle={selectedMeeting.title}
              recordingUrl={selectedMeeting.url}
              dealId={dealId}
              onClose={() => setSelectedMeeting(null)}
            />
          ) : selectedNote ? (
            <HighlightCalendarMenu
              editableMode
              className="flex-1 flex flex-col min-w-0 min-h-0"
              sourceCtx={{
                module: 'deal_memo',
                recordId: selectedNote.id,
                sourceTimestamp: selectedNote.updated_at || selectedNote.created_at || new Date().toISOString(),
                dealId,
                label: selectedNote.title,
              }}
            >
              <DealSpaceNoteEditor
              note={selectedNote}
              onUpdate={updateNote}
              onDownload={handleDownloadDocx}
              dealId={dealId}
              isFullscreen={isFullscreen}
              onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
              showComments={showComments}
              onToggleComments={() => setShowComments(!showComments)}
              fetchVersions={fetchVersions}
              restoreVersion={restoreVersion}
              onRequestComment={(text) => { setPendingQuote(text); setShowComments(true); }}
              />
            </HighlightCalendarMenu>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <FileText className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">Select a note or create a new one</p>
            </div>
          )}
        </div>

        {/* Comments panel */}
        {selectedNote && showComments && (
          <NoteComments
            noteId={selectedNote.id}
            dealId={dealId}
            noteTitle={selectedNote.title}
            fetchComments={fetchComments}
            addComment={addComment}
            resolveComment={resolveComment}
            deleteComment={deleteComment}
            pendingQuote={pendingQuote}
            onPendingQuoteConsumed={() => setPendingQuote(null)}
          />
        )}
      </div>

      {/* Financial Comments Section */}
      {financialComments.length > 0 && (
        <>
          <Separator />
          <FinancialCommentsSection
            comments={financialComments}
            onDelete={deleteFinancialComment}
          />
        </>
      )}
    </div>
  );
}
