import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import { useEffect, useRef, useCallback, useState } from 'react';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Heading1, Heading2, Heading3, Download, Undo, Redo, Save,
  Table as TableIcon, Image as ImageIcon, Link as LinkIcon,
  CheckSquare, Quote, Minus, IndentIncrease, IndentDecrease,
  Search, Type, Highlighter, Palette, X, Replace,
  TableCellsMerge, Plus, Trash2, Keyboard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { DealSpaceNote } from '@/hooks/useDealSpaceNotes';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

// ─── Toolbar Button ───
function ToolbarButton({
  onClick, isActive, icon: Icon, label, disabled,
}: {
  onClick: () => void; isActive?: boolean; icon: React.ElementType; label: string; disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant={isActive ? 'secondary' : 'ghost'}
          className="h-7 w-7"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
          disabled={disabled}
        >
          <Icon className="h-3.5 w-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}

// ─── Color Picker ───
const COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#cccccc',
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6',
  '#8b5cf6', '#ec4899', '#dc2626', '#ea580c', '#ca8a04',
  '#16a34a', '#2563eb', '#7c3aed', '#db2777', '#991b1b',
];

function ColorPicker({
  currentColor, onColorChange, icon: Icon, label,
}: {
  currentColor?: string; onColorChange: (color: string) => void; icon: React.ElementType; label: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7 relative" onMouseDown={(e) => e.preventDefault()}>
          <Icon className="h-3.5 w-3.5" />
          {currentColor && (
            <div className="absolute bottom-0.5 left-1 right-1 h-0.5 rounded-full" style={{ backgroundColor: currentColor }} />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <p className="text-xs text-muted-foreground mb-1.5">{label}</p>
        <div className="grid grid-cols-5 gap-1">
          {COLORS.map(color => (
            <button
              key={color}
              className={cn("h-6 w-6 rounded border border-border hover:scale-110 transition-transform", currentColor === color && "ring-2 ring-primary")}
              style={{ backgroundColor: color }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onColorChange(color)}
            />
          ))}
        </div>
        <Button variant="ghost" size="sm" className="w-full mt-1 text-xs" onMouseDown={(e) => e.preventDefault()} onClick={() => onColorChange('')}>
          Remove color
        </Button>
      </PopoverContent>
    </Popover>
  );
}

// ─── Font Size Extension (custom) ───
const FONT_SIZES = ['10', '12', '14', '16', '18', '20', '24', '28', '32', '36', '48'];

// ─── Main Editor ───
interface DealSpaceNoteEditorProps {
  note: DealSpaceNote;
  onUpdate: (noteId: string, updates: { title?: string; content?: string }) => Promise<void>;
  onDownload: (note: DealSpaceNote) => void;
}

export function DealSpaceNoteEditor({ note, onUpdate, onDownload }: DealSpaceNoteEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [isSaving, setIsSaving] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedContentRef = useRef(note.content);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Image.configure({ inline: true, allowBase64: true }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-primary underline cursor-pointer' } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({ placeholder: 'Start typing your note...' }),
      CharacterCount,
    ],
    content: note.content || '',
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[300px] px-8 py-6',
          '[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1',
          '[&_table]:border-collapse [&_table]:w-full [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:p-2 [&_th]:bg-muted [&_th]:font-semibold',
          '[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0',
          '[&_ul[data-type=taskList]_li]:flex [&_ul[data-type=taskList]_li]:items-start [&_ul[data-type=taskList]_li]:gap-2',
          '[&_ul[data-type=taskList]_li_label]:mt-0.5',
          '[&_ul[data-type=taskList]_li_div]:flex-1',
          '[&_blockquote]:border-l-4 [&_blockquote]:border-primary/30 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground',
          '[&_hr]:my-6 [&_hr]:border-border',
          '[&_img]:max-w-full [&_img]:rounded-md [&_img]:my-2',
          '[&_a]:text-primary [&_a]:underline',
        ),
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (files?.length) {
          event.preventDefault();
          Array.from(files).forEach(file => {
            if (file.type.startsWith('image/')) {
              handleImageUpload(file);
            }
          });
          return true;
        }
        return false;
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (items) {
          for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
              event.preventDefault();
              const file = item.getAsFile();
              if (file) handleImageUpload(file);
              return true;
            }
          }
        }
        return false;
      },
    },
  }, [note.id]);

  // Image upload to storage
  const handleImageUpload = async (file: File) => {
    if (!editor) return;
    try {
      const ext = file.name.split('.').pop();
      const path = `${note.deal_id}/notes/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('deal-space').upload(path, file);
      if (error) throw error;
      const { data } = await supabase.storage.from('deal-space').createSignedUrl(path, 31536000); // 1 year
      if (data?.signedUrl) {
        editor.chain().focus().setImage({ src: data.signedUrl }).run();
      }
    } catch (err) {
      console.error('Image upload error:', err);
    }
  };

  const debouncedSave = useCallback((content: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setIsSaving(true);
      await onUpdate(note.id, { content });
      lastSavedContentRef.current = content;
      setIsSaving(false);
    }, 1000);
  }, [note.id, onUpdate]);

  // Attach onUpdate handler
  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      const html = editor.getHTML();
      if (html !== lastSavedContentRef.current) {
        debouncedSave(html);
      }
    };
    editor.on('update', handler);
    return () => { editor.off('update', handler); };
  }, [editor, debouncedSave]);

  const handleTitleBlur = useCallback(() => {
    if (title !== note.title) onUpdate(note.id, { title });
  }, [title, note.id, note.title, onUpdate]);

  useEffect(() => { setTitle(note.title); }, [note.id, note.title]);
  useEffect(() => { return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }; }, []);

  // Keyboard shortcut: Ctrl+F for find
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowFindReplace(true);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Find & Replace
  const handleFind = () => {
    if (!editor || !findText) return;
    // Use window.find for basic browser-level find
    try {
      (window as any).find(findText);
    } catch {
      // fallback: no-op
    }
  };

  const handleReplace = () => {
    if (!editor || !findText) return;
    const html = editor.getHTML();
    const newHtml = html.replace(findText, replaceText);
    editor.commands.setContent(newHtml);
    debouncedSave(newHtml);
  };

  const handleReplaceAll = () => {
    if (!editor || !findText) return;
    const html = editor.getHTML();
    const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const newHtml = html.replace(regex, replaceText);
    editor.commands.setContent(newHtml);
    debouncedSave(newHtml);
  };

  // Link dialog
  const handleInsertLink = () => {
    if (!editor) return;
    if (linkUrl) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
    }
    setShowLinkDialog(false);
    setLinkUrl('');
  };

  const handleRemoveLink = () => {
    if (!editor) return;
    editor.chain().focus().unsetLink().run();
    setShowLinkDialog(false);
  };

  if (!editor) return null;

  const wordCount = editor.storage.characterCount?.words() ?? 0;
  const charCount = editor.storage.characterCount?.characters() ?? 0;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Find & Replace Bar */}
      {showFindReplace && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Input
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            placeholder="Find..."
            className="h-7 text-xs w-40"
            onKeyDown={(e) => e.key === 'Enter' && handleFind()}
          />
          <Replace className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Input
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            placeholder="Replace..."
            className="h-7 text-xs w-40"
          />
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleFind}>Find</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleReplace}>Replace</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleReplaceAll}>All</Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShowFindReplace(false)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Toolbar Row 1: History, Headings, Font Controls */}
      <div className="flex items-center gap-0.5 px-2 py-1 border-b flex-wrap">
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} icon={Undo} label="Undo (Ctrl+Z)" />
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} icon={Redo} label="Redo (Ctrl+Y)" />
        <Separator orientation="vertical" className="h-5 mx-1" />

        {/* Headings */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} isActive={editor.isActive('heading', { level: 1 })} icon={Heading1} label="Heading 1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive('heading', { level: 2 })} icon={Heading2} label="Heading 2" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} isActive={editor.isActive('heading', { level: 3 })} icon={Heading3} label="Heading 3" />
        <Separator orientation="vertical" className="h-5 mx-1" />

        {/* Text formatting */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} icon={Bold} label="Bold (Ctrl+B)" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} icon={Italic} label="Italic (Ctrl+I)" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive('underline')} icon={UnderlineIcon} label="Underline (Ctrl+U)" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} icon={Strikethrough} label="Strikethrough" />
        <Separator orientation="vertical" className="h-5 mx-1" />

        {/* Colors */}
        <ColorPicker
          currentColor={editor.getAttributes('textStyle').color}
          onColorChange={(color) => color ? editor.chain().focus().setColor(color).run() : editor.chain().focus().unsetColor().run()}
          icon={Palette}
          label="Text Color"
        />
        <ColorPicker
          currentColor={editor.getAttributes('highlight').color}
          onColorChange={(color) => color ? editor.chain().focus().toggleHighlight({ color }).run() : editor.chain().focus().unsetHighlight().run()}
          icon={Highlighter}
          label="Highlight Color"
        />
        <Separator orientation="vertical" className="h-5 mx-1" />

        {/* Alignment */}
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} isActive={editor.isActive({ textAlign: 'left' })} icon={AlignLeft} label="Align Left" />
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} isActive={editor.isActive({ textAlign: 'center' })} icon={AlignCenter} label="Center" />
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} isActive={editor.isActive({ textAlign: 'right' })} icon={AlignRight} label="Align Right" />
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('justify').run()} isActive={editor.isActive({ textAlign: 'justify' })} icon={AlignJustify} label="Justify" />

        <div className="flex-1" />
        <div className="flex items-center gap-1">
          {isSaving && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Save className="h-3 w-3 animate-pulse" /> Saving...
            </span>
          )}
          <ToolbarButton onClick={() => setShowFindReplace(!showFindReplace)} isActive={showFindReplace} icon={Search} label="Find & Replace (Ctrl+F)" />
          <ToolbarButton onClick={() => setShowShortcuts(true)} icon={Keyboard} label="Keyboard Shortcuts" />
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onMouseDown={(e) => e.preventDefault()} onClick={() => onDownload(note)}>
            <Download className="h-3 w-3" />
            Export
          </Button>
        </div>
      </div>

      {/* Toolbar Row 2: Lists, Tables, Insert */}
      <div className="flex items-center gap-0.5 px-2 py-1 border-b flex-wrap">
        {/* Lists */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} icon={List} label="Bullet List" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} icon={ListOrdered} label="Numbered List" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleTaskList().run()} isActive={editor.isActive('taskList')} icon={CheckSquare} label="Task List" />
        <Separator orientation="vertical" className="h-5 mx-1" />

        {/* Indent */}
        <ToolbarButton
          onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
          disabled={!editor.can().sinkListItem('listItem')}
          icon={IndentIncrease} label="Indent"
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().liftListItem('listItem').run()}
          disabled={!editor.can().liftListItem('listItem')}
          icon={IndentDecrease} label="Outdent"
        />
        <Separator orientation="vertical" className="h-5 mx-1" />

        {/* Block elements */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} isActive={editor.isActive('blockquote')} icon={Quote} label="Block Quote" />
        <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} icon={Minus} label="Horizontal Rule" />
        <Separator orientation="vertical" className="h-5 mx-1" />

        {/* Table */}
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" size="icon" variant={editor.isActive('table') ? 'secondary' : 'ghost'} className="h-7 w-7" onMouseDown={(e) => e.preventDefault()}>
              <TableIcon className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <p className="text-xs text-muted-foreground mb-2">Table</p>
            <div className="flex flex-col gap-1">
              <Button size="sm" variant="outline" className="text-xs justify-start gap-2" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
                <Plus className="h-3 w-3" /> Insert 3×3 Table
              </Button>
              {editor.isActive('table') && (
                <>
                  <Button size="sm" variant="outline" className="text-xs justify-start gap-2" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().addColumnAfter().run()}>Add Column</Button>
                  <Button size="sm" variant="outline" className="text-xs justify-start gap-2" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().addRowAfter().run()}>Add Row</Button>
                  <Button size="sm" variant="outline" className="text-xs justify-start gap-2" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().deleteColumn().run()}>Delete Column</Button>
                  <Button size="sm" variant="outline" className="text-xs justify-start gap-2" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().deleteRow().run()}>Delete Row</Button>
                  <Button size="sm" variant="outline" className="text-xs justify-start gap-2" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().mergeCells().run()}>Merge Cells</Button>
                  <Button size="sm" variant="outline" className="text-xs justify-start gap-2" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().splitCell().run()}>Split Cell</Button>
                  <Button size="sm" variant="destructive" className="text-xs justify-start gap-2" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().deleteTable().run()}>
                    <Trash2 className="h-3 w-3" /> Delete Table
                  </Button>
                </>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Link */}
        <ToolbarButton
          onClick={() => {
            const attrs = editor.getAttributes('link');
            setLinkUrl(attrs.href || '');
            setShowLinkDialog(true);
          }}
          isActive={editor.isActive('link')}
          icon={LinkIcon} label="Link (Ctrl+K)"
        />

        {/* Image */}
        <ToolbarButton onClick={() => fileInputRef.current?.click()} icon={ImageIcon} label="Insert Image" />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImageUpload(file);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
        />
      </div>

      {/* Title */}
      <div className="px-8 pt-4">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); editor?.commands.focus('start'); } }}
          placeholder="Note title..."
          className="border-none text-xl font-semibold px-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-auto">
        <EditorContent editor={editor} className="h-full" />
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 py-1 border-t text-xs text-muted-foreground bg-muted/20">
        <span>{wordCount} words · {charCount} characters</span>
        <span>
          {isSaving ? 'Saving...' : 'Saved'}
        </span>
      </div>

      {/* Link Dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Insert Link</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>URL</Label>
              <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." />
            </div>
          </div>
          <DialogFooter className="gap-2">
            {editor.isActive('link') && (
              <Button variant="destructive" size="sm" onClick={handleRemoveLink}>Remove Link</Button>
            )}
            <Button variant="outline" onClick={() => setShowLinkDialog(false)}>Cancel</Button>
            <Button onClick={handleInsertLink}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Keyboard Shortcuts Dialog */}
      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            {[
              ['Ctrl+B', 'Bold'],
              ['Ctrl+I', 'Italic'],
              ['Ctrl+U', 'Underline'],
              ['Ctrl+Z', 'Undo'],
              ['Ctrl+Y', 'Redo'],
              ['Ctrl+F', 'Find & Replace'],
              ['Ctrl+Shift+7', 'Numbered List'],
              ['Ctrl+Shift+8', 'Bullet List'],
              ['Ctrl+Shift+9', 'Task List'],
              ['Tab', 'Indent'],
              ['Shift+Tab', 'Outdent'],
              ['Ctrl+Shift+B', 'Block Quote'],
              ['---', 'Horizontal Rule'],
              ['Enter', 'New Paragraph'],
            ].map(([key, desc]) => (
              <div key={key} className="contents">
                <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">{key}</kbd>
                <span className="text-muted-foreground">{desc}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
