import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, List, ListOrdered, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useEffect } from 'react';

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  onSave: () => void;
  onCancel: () => void;
  className?: string;
}

export function RichTextEditor({
  content,
  onChange,
  onSave,
  onCancel,
  className,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[80px] px-3 py-2',
      },
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  useEffect(() => {
    editor?.commands.focus('end');
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-1 border-b border-border pb-2">
        <Button
          type="button"
          size="icon"
          variant={editor.isActive('bold') ? 'secondary' : 'ghost'}
          className="h-7 w-7"
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant={editor.isActive('italic') ? 'secondary' : 'ghost'}
          className="h-7 w-7"
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" />
        </Button>
        <div className="w-px h-4 bg-border mx-1" />
        <Button
          type="button"
          size="icon"
          variant={editor.isActive('bulletList') ? 'secondary' : 'ghost'}
          className="h-7 w-7"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant={editor.isActive('orderedList') ? 'secondary' : 'ghost'}
          className="h-7 w-7"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
        <div className="flex-1" />
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-success hover:text-success"
          onClick={onSave}
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={onCancel}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <EditorContent 
        editor={editor} 
        className="min-w-[600px] border border-input rounded-md bg-background focus-within:ring-1 focus-within:ring-ring"
      />
    </div>
  );
}
