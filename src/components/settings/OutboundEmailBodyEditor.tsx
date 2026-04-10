import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { Separator } from '@/components/ui/separator';
import {
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Link as LinkIcon, Undo, Redo,
  Palette,
} from 'lucide-react';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { useState } from 'react';

interface Props {
  content: string;
  onChange: (html: string) => void;
  disabled?: boolean;
}

const FONT_COLORS = [
  '#000000', '#374151', '#6B7280', '#DC2626', '#EA580C',
  '#D97706', '#16A34A', '#2563EB', '#7C3AED', '#DB2777',
];

export function OutboundEmailBodyEditor({ content, onChange, disabled }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-primary underline' },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      Placeholder.configure({ placeholder: 'Compose your email body here...' }),
    ],
    content: content || '',
    editable: !disabled,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[240px] px-3 py-2 text-sm',
      },
    },
  });

  // Sync external content changes (e.g. when switching templates)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || '', false);
    }
  }, [content, editor]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [disabled, editor]);

  if (!editor) return null;

  return (
    <div className="border rounded-lg overflow-hidden bg-background">
      {!disabled && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: any }) {
  const [linkUrl, setLinkUrl] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);

  const setLink = () => {
    if (linkUrl) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
    } else {
      editor.chain().focus().unsetLink().run();
    }
    setLinkOpen(false);
    setLinkUrl('');
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 px-1.5 py-1 border-b bg-muted/30">
      <Toggle
        size="sm"
        pressed={editor.isActive('bold')}
        onPressedChange={() => editor.chain().focus().toggleBold().run()}
        className="h-7 w-7 p-0"
      >
        <Bold className="h-3.5 w-3.5" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive('italic')}
        onPressedChange={() => editor.chain().focus().toggleItalic().run()}
        className="h-7 w-7 p-0"
      >
        <Italic className="h-3.5 w-3.5" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive('underline')}
        onPressedChange={() => editor.chain().focus().toggleUnderline().run()}
        className="h-7 w-7 p-0"
      >
        <UnderlineIcon className="h-3.5 w-3.5" />
      </Toggle>

      <Separator orientation="vertical" className="h-5 mx-0.5" />

      <Toggle
        size="sm"
        pressed={editor.isActive('bulletList')}
        onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
        className="h-7 w-7 p-0"
      >
        <List className="h-3.5 w-3.5" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive('orderedList')}
        onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
        className="h-7 w-7 p-0"
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </Toggle>

      <Separator orientation="vertical" className="h-5 mx-0.5" />

      <Toggle
        size="sm"
        pressed={editor.isActive({ textAlign: 'left' })}
        onPressedChange={() => editor.chain().focus().setTextAlign('left').run()}
        className="h-7 w-7 p-0"
      >
        <AlignLeft className="h-3.5 w-3.5" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive({ textAlign: 'center' })}
        onPressedChange={() => editor.chain().focus().setTextAlign('center').run()}
        className="h-7 w-7 p-0"
      >
        <AlignCenter className="h-3.5 w-3.5" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive({ textAlign: 'right' })}
        onPressedChange={() => editor.chain().focus().setTextAlign('right').run()}
        className="h-7 w-7 p-0"
      >
        <AlignRight className="h-3.5 w-3.5" />
      </Toggle>

      <Separator orientation="vertical" className="h-5 mx-0.5" />

      {/* Font color */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Palette className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2">
          <div className="grid grid-cols-5 gap-1">
            {FONT_COLORS.map(c => (
              <button
                key={c}
                className="w-6 h-6 rounded border hover:scale-110 transition-transform"
                style={{ backgroundColor: c }}
                onClick={() => editor.chain().focus().setColor(c).run()}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Link */}
      <Popover open={linkOpen} onOpenChange={setLinkOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <LinkIcon className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3 space-y-2">
          <Input
            placeholder="https://..."
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            className="h-7 text-xs"
            onKeyDown={e => e.key === 'Enter' && setLink()}
          />
          <div className="flex gap-1">
            <Button size="sm" className="h-6 text-xs flex-1" onClick={setLink}>Apply</Button>
            <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => {
              editor.chain().focus().unsetLink().run();
              setLinkOpen(false);
            }}>Remove</Button>
          </div>
        </PopoverContent>
      </Popover>

      <Separator orientation="vertical" className="h-5 mx-0.5" />

      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
        <Undo className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
        <Redo className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
