import { useState, useRef } from 'react';
import { Plus, FileText, Trash2, Download, Upload, Pin, PinOff, FolderOpen, Tag, Star, Filter, ChevronDown, GripVertical, LayoutTemplate, Settings, BookmarkPlus, X, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DealSpaceNote } from '@/hooks/useDealSpaceNotes';
import { NOTE_TEMPLATES } from './NoteTemplates';
import { TemplatePickerDialog, ManageTemplatesDialog, SaveAsTemplateDialog } from './NoteTemplateDialogs';
import { MeetingsSection } from './MeetingsSection';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface NotesSidebarProps {
  notes: DealSpaceNote[];
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
  onCreateNote: (title?: string, content?: string) => Promise<any>;
  onDeleteNote: (id: string) => void;
  onUpdateNote: (id: string, updates: any) => Promise<void>;
  onDownload: (note: DealSpaceNote) => void;
  onUpload: () => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  commentCounts?: Record<string, number>;
  dealId?: string;
}

export function NotesSidebar({
  notes, selectedNoteId, onSelectNote, onCreateNote, onDeleteNote, onUpdateNote, onDownload, onUpload, fileInputRef, commentCounts = {}, dealId,
}: NotesSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFolder, setFilterFolder] = useState<string | null>(null);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [showTagInput, setShowTagInput] = useState<string | null>(null);
  const [newTag, setNewTag] = useState('');
  const [showFolderInput, setShowFolderInput] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState('');
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showManageTemplates, setShowManageTemplates] = useState(false);
  const [saveAsTemplateNote, setSaveAsTemplateNote] = useState<DealSpaceNote | null>(null);

  // Derive unique folders and tags
  const allFolders = [...new Set(notes.map(n => n.folder).filter(Boolean))] as string[];
  const allTags = [...new Set(notes.flatMap(n => n.tags || []))];

  // Filter & sort notes
  const filteredNotes = notes.filter(n => {
    if (searchQuery && !n.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterFolder && n.folder !== filterFolder) return false;
    if (filterTag && !(n.tags || []).includes(filterTag)) return false;
    return true;
  });

  // Group: pinned first, then by folder
  const pinnedNotes = filteredNotes.filter(n => n.is_pinned);
  const unpinnedNotes = filteredNotes.filter(n => !n.is_pinned);

  const handleAddTag = async (noteId: string) => {
    if (!newTag.trim()) return;
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    const tags = [...(note.tags || []), newTag.trim()];
    await onUpdateNote(noteId, { tags });
    setNewTag('');
    setShowTagInput(null);
  };

  const handleRemoveTag = async (noteId: string, tag: string) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    const tags = (note.tags || []).filter(t => t !== tag);
    await onUpdateNote(noteId, { tags });
  };

  const handleRenameTagGlobally = async (oldTag: string) => {
    const next = window.prompt(`Rename tag "${oldTag}" (applies to all notes):`, oldTag);
    if (next == null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === oldTag) return;
    const affected = notes.filter(n => (n.tags || []).includes(oldTag));
    await Promise.all(affected.map(n => {
      const tags = Array.from(new Set((n.tags || []).map(t => t === oldTag ? trimmed : t)));
      return onUpdateNote(n.id, { tags });
    }));
    if (filterTag === oldTag) setFilterTag(trimmed);
  };

  const handleDeleteTagGlobally = async (tag: string) => {
    const affected = notes.filter(n => (n.tags || []).includes(tag));
    await Promise.all(affected.map(n => {
      const tags = (n.tags || []).filter(t => t !== tag);
      return onUpdateNote(n.id, { tags });
    }));
    if (filterTag === tag) setFilterTag(null);
  };

  const handleSetFolder = async (noteId: string, folder: string | null) => {
    await onUpdateNote(noteId, { folder });
  };

  const renderNote = (note: DealSpaceNote) => (
    <div
      key={note.id}
      className={cn(
        "group flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors",
        selectedNoteId === note.id && "bg-muted"
      )}
      onClick={() => onSelectNote(note.id)}
    >
      <FileText className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <p className="text-sm font-medium truncate flex-1">{note.title || 'Untitled'}</p>
          {note.is_pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
          {commentCounts[note.id] > 0 && (
            <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 gap-0.5 shrink-0" title={`${commentCounts[note.id]} unresolved comment(s)`}>
              💬 {commentCounts[note.id]}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{format(new Date(note.updated_at), 'MMM d, yyyy')}</p>
        {note.folder && (
          <div className="flex items-center gap-1 mt-0.5">
            <FolderOpen className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">{note.folder}</span>
          </div>
        )}
        {(note.tags || []).length > 0 && (
          <div className="flex flex-wrap gap-0.5 mt-0.5">
            {note.tags.map(tag => (
              <Badge
                key={tag}
                variant={filterTag === tag ? 'default' : 'secondary'}
                className="group/tag text-[9px] px-1 py-0 h-4 gap-0.5 cursor-pointer inline-flex items-center"
                onClick={(e) => { e.stopPropagation(); setFilterTag(filterTag === tag ? null : tag); }}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); handleRenameTagGlobally(tag); }}
                title="Click to filter • Right-click to rename globally"
              >
                <span>{tag}</span>
                <button
                  type="button"
                  className="opacity-0 group-hover/tag:opacity-100 hover:text-foreground transition-opacity"
                  onClick={(e) => { e.stopPropagation(); handleRenameTagGlobally(tag); }}
                  title="Rename tag globally"
                >
                  <Pencil className="h-2.5 w-2.5" />
                </button>
                <button
                  type="button"
                  className="opacity-0 group-hover/tag:opacity-100 hover:text-destructive transition-opacity"
                  onClick={(e) => { e.stopPropagation(); handleRemoveTag(note.id, tag); }}
                  title="Remove tag from this note"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        {!note.is_shared && (
          <span className="text-[10px] text-muted-foreground italic">Private</span>
        )}
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mr-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={e => e.stopPropagation()}>
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[160px]">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onUpdateNote(note.id, { is_pinned: !note.is_pinned }); }}>
              {note.is_pinned ? <PinOff className="h-3.5 w-3.5 mr-2" /> : <Pin className="h-3.5 w-3.5 mr-2" />}
              {note.is_pinned ? 'Unpin' : 'Pin to top'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onUpdateNote(note.id, { is_shared: !note.is_shared }); }}>
              {note.is_shared ? '🔒 Make private' : '👁 Make shared'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger><FolderOpen className="h-3.5 w-3.5 mr-2" /> Move to folder</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleSetFolder(note.id, null); }}>
                  None
                </DropdownMenuItem>
                {allFolders.map(f => (
                  <DropdownMenuItem key={f} onClick={(e) => { e.stopPropagation(); handleSetFolder(note.id, f); }}>
                    {f}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setShowFolderInput(note.id); }}>
                  + New folder
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem
              onClick={(e) => { e.stopPropagation(); setShowTagInput(note.id); }}
              title="Tags help you categorize and filter notes. Click to add a tag."
            >
              <Tag className="h-3.5 w-3.5 mr-2" /> Add tag
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDownload(note); }}>
              <Download className="h-3.5 w-3.5 mr-2" /> Download .docx
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSaveAsTemplateNote(note); }}>
              <BookmarkPlus className="h-3.5 w-3.5 mr-2" /> Save as template
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" onClick={e => e.stopPropagation()}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Note</AlertDialogTitle>
              <AlertDialogDescription>Are you sure you want to delete "{note.title}"? This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => { if (selectedNoteId === note.id) onSelectNote(''); onDeleteNote(note.id); }}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );

  return (
    <div className="w-[304px] min-w-[304px] border-r flex flex-col shrink-0">
      {/* Actions */}
      <div className="p-2 border-b flex flex-col gap-1.5">
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="default" className="flex-1 gap-1.5">
                <Plus className="h-3.5 w-3.5" /> New Note <ChevronDown className="h-3 w-3 ml-auto opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[200px]">
              <DropdownMenuItem onClick={() => onCreateNote()}>
                <FileText className="h-3.5 w-3.5 mr-2" /> Blank note
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowTemplatePicker(true)}>
                <LayoutTemplate className="h-3.5 w-3.5 mr-2" /> From template…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowManageTemplates(true)}>
                <Settings className="h-3.5 w-3.5 mr-2" /> Manage templates
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={onUpload}>
            <Upload className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Input
          placeholder="Search notes…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="h-7 text-xs"
        />
        {/* Filter row */}
        {(allFolders.length > 0 || allTags.length > 0) && (
          <div className="flex items-center gap-1 flex-wrap">
            {filterFolder && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 cursor-pointer" onClick={() => setFilterFolder(null)}>
                📁 {filterFolder} ×
              </Badge>
            )}
            {filterTag && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 cursor-pointer" onClick={() => setFilterTag(null)}>
                🏷 {filterTag} ×
              </Badge>
            )}
            {!filterFolder && !filterTag && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5 gap-1 text-muted-foreground">
                    <Filter className="h-3 w-3" /> Filter
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {allFolders.length > 0 && (
                    <>
                      <p className="px-2 py-1 text-[10px] text-muted-foreground font-medium">FOLDERS</p>
                      {allFolders.map(f => (
                        <DropdownMenuItem key={f} onClick={() => setFilterFolder(f)}>📁 {f}</DropdownMenuItem>
                      ))}
                    </>
                  )}
                  {allTags.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <p className="px-2 py-1 text-[10px] text-muted-foreground font-medium">TAGS</p>
                      {allTags.map(t => (
                        <DropdownMenuItem key={t} className="flex items-center gap-1 group/mt" onSelect={(e) => e.preventDefault()}>
                          <span className="flex-1 cursor-pointer" onClick={() => setFilterTag(t)}>🏷 {t}</span>
                          <button
                            type="button"
                            className="opacity-0 group-hover/mt:opacity-100 p-0.5 hover:text-foreground"
                            onClick={(e) => { e.stopPropagation(); handleRenameTagGlobally(t); }}
                            title="Rename tag globally"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            className="opacity-0 group-hover/mt:opacity-100 p-0.5 hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); handleDeleteTagGlobally(t); }}
                            title="Delete tag globally"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>

      {/* Tag/Folder inline input */}
      {showTagInput && (
        <div className="px-2 py-1.5 border-b flex items-center gap-1">
          <Input
            autoFocus
            placeholder="Tag name…"
            value={newTag}
            onChange={e => setNewTag(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddTag(showTagInput); if (e.key === 'Escape') setShowTagInput(null); }}
            className="h-6 text-xs flex-1"
          />
          <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => handleAddTag(showTagInput)}>Add</Button>
          <Button size="sm" variant="ghost" className="h-6 text-xs px-1" onClick={() => setShowTagInput(null)}>×</Button>
        </div>
      )}
      {showFolderInput && (
        <div className="px-2 py-1.5 border-b flex items-center gap-1">
          <Input
            autoFocus
            placeholder="Folder name…"
            value={newFolder}
            onChange={e => setNewFolder(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && newFolder.trim()) {
                handleSetFolder(showFolderInput, newFolder.trim());
                setNewFolder('');
                setShowFolderInput(null);
              }
              if (e.key === 'Escape') setShowFolderInput(null);
            }}
            className="h-6 text-xs flex-1"
          />
        </div>
      )}

      {/* Notes list */}
      <ScrollArea
        className="flex-1"
        viewportClassName="pr-3 [scrollbar-gutter:stable]"
      >
        {dealId && <MeetingsSection dealId={dealId} />}
        {filteredNotes.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No notes yet</p>
            <p className="text-xs mt-1">Create a note to get started</p>
          </div>
        ) : (
          <div className="py-1">
            {pinnedNotes.length > 0 && (
              <>
                <p className="px-3 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Pinned</p>
                {pinnedNotes.map(renderNote)}
                {unpinnedNotes.length > 0 && <div className="border-b border-border/30 my-1" />}
              </>
            )}
            {unpinnedNotes.length > 0 && (
              <>
                {pinnedNotes.length > 0 && (
                  <p className="px-3 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">All Notes</p>
                )}
                {unpinnedNotes.map(renderNote)}
              </>
            )}
          </div>
        )}
      </ScrollArea>

      <TemplatePickerDialog
        open={showTemplatePicker}
        onOpenChange={setShowTemplatePicker}
        onPick={(title, content) => onCreateNote(title, content)}
      />
      <ManageTemplatesDialog open={showManageTemplates} onOpenChange={setShowManageTemplates} />
      {saveAsTemplateNote && (
        <SaveAsTemplateDialog
          open={!!saveAsTemplateNote}
          onOpenChange={(v) => { if (!v) setSaveAsTemplateNote(null); }}
          defaultName={saveAsTemplateNote.title || 'Untitled Template'}
          content={saveAsTemplateNote.content || ''}
        />
      )}
    </div>
  );
}
