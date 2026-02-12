import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { useEffect, useRef, useCallback, useState } from 'react';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, AlignLeft, AlignCenter, AlignRight,
  Heading1, Heading2, Heading3, Download, Undo, Redo, Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DealSpaceNote } from '@/hooks/useDealSpaceNotes';
import { cn } from '@/lib/utils';

function ToolbarButton({ 
  onClick, isActive, icon: Icon, label 
}: { 
  onClick: () => void; isActive?: boolean; icon: React.ElementType; label: string 
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
        >
          <Icon className="h-3.5 w-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}

interface DealSpaceNoteEditorProps {
  note: DealSpaceNote;
  onUpdate: (noteId: string, updates: { title?: string; content?: string }) => Promise<void>;
  onDownload: (note: DealSpaceNote) => void;
}

export function DealSpaceNoteEditor({ note, onUpdate, onDownload }: DealSpaceNoteEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [isSaving, setIsSaving] = useState(false);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedContentRef = useRef(note.content);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: note.content || '<p></p>',
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[300px] px-8 py-6 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      if (html !== lastSavedContentRef.current) {
        debouncedSave(html);
      }
    },
  }, [note.id]);

  const debouncedSave = useCallback((content: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setIsSaving(true);
      await onUpdate(note.id, { content });
      lastSavedContentRef.current = content;
      setIsSaving(false);
    }, 1000);
  }, [note.id, onUpdate]);

  const handleTitleBlur = useCallback(() => {
    if (title !== note.title) {
      onUpdate(note.id, { title });
    }
  }, [title, note.id, note.title, onUpdate]);

  useEffect(() => {
    setTitle(note.title);
  }, [note.id, note.title]);

  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, []);

  if (!editor) return null;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b flex-wrap">
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} icon={Undo} label="Undo" />
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} icon={Redo} label="Redo" />
        <Separator orientation="vertical" className="h-5 mx-1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} isActive={editor.isActive('heading', { level: 1 })} icon={Heading1} label="Heading 1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive('heading', { level: 2 })} icon={Heading2} label="Heading 2" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} isActive={editor.isActive('heading', { level: 3 })} icon={Heading3} label="Heading 3" />
        <Separator orientation="vertical" className="h-5 mx-1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} icon={Bold} label="Bold" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} icon={Italic} label="Italic" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive('underline')} icon={UnderlineIcon} label="Underline" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} icon={Strikethrough} label="Strikethrough" />
        <Separator orientation="vertical" className="h-5 mx-1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} icon={List} label="Bullet List" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} icon={ListOrdered} label="Numbered List" />
        <Separator orientation="vertical" className="h-5 mx-1" />
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} isActive={editor.isActive({ textAlign: 'left' })} icon={AlignLeft} label="Align Left" />
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} isActive={editor.isActive({ textAlign: 'center' })} icon={AlignCenter} label="Align Center" />
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} isActive={editor.isActive({ textAlign: 'right' })} icon={AlignRight} label="Align Right" />
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          {isSaving && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Save className="h-3 w-3 animate-pulse" /> Saving...
            </span>
          )}
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => onDownload(note)}>
            <Download className="h-3 w-3" />
            Export .docx
          </Button>
        </div>
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
    </div>
  );
}
