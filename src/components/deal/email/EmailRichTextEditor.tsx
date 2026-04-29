import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import FontSize from '@tiptap/extension-font-size';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import {
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  Link as LinkIcon, Palette, Highlighter, Indent, Outdent, Eraser,
  ChevronDown, Strikethrough, Database,
} from 'lucide-react';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface Props {
  content: string;
  onChange: (html: string) => void;
  className?: string;
  minHeight?: number;
  /**
   * Optional FLEx data-room URL. When provided, a "Data Room" shortcut
   * appears in the link popover that inserts an `View Data Room` link.
   */
  dataRoomUrl?: string | null;
}

const FONT_COLORS = [
  '#000000', '#374151', '#6B7280', '#DC2626', '#EA580C',
  '#D97706', '#16A34A', '#0EA5E9', '#2563EB', '#7C3AED',
];

const HIGHLIGHT_COLORS = [
  '#FEF08A', '#FED7AA', '#FECACA', '#BBF7D0', '#BFDBFE',
  '#DDD6FE', '#FBCFE8', '#E5E7EB',
];

const FONT_SIZES = [
  { label: 'Small', value: '12px' },
  { label: 'Normal', value: '14px' },
  { label: 'Medium', value: '16px' },
  { label: 'Large', value: '18px' },
  { label: 'X-Large', value: '22px' },
];

export function EmailRichTextEditor({ content, onChange, className, minHeight = 240, dataRoomUrl }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-primary underline' },
      }),
      TextStyle,
      Color,
      FontSize,
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({ placeholder: 'Compose your email…' }),
    ],
    content: content || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none px-3 py-2 text-sm leading-relaxed',
        style: `min-height: ${minHeight}px;`,
      },
      transformPastedHTML: (html) => {
        return html
          .replace(/<meta[^>]*>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/ class="[^"]*"/gi, '')
          .replace(/ style="[^"]*"/gi, '')
          .replace(/<o:p[^>]*>[\s\S]*?<\/o:p>/gi, '')
          .replace(/<\/?(?:o:p|w:[^>]*|font|span)\b[^>]*>/gi, (m) =>
            m.startsWith('</') ? '' : ''
          );
      },
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || '', { emitUpdate: false });
    }
  }, [content, editor]);

  if (!editor) return null;

  return (
    <div className={cn('border rounded-md overflow-hidden bg-background flex flex-col', className)}>
      <Toolbar editor={editor} dataRoomUrl={dataRoomUrl} />
      <div className="flex-1 overflow-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function Toolbar({ editor, dataRoomUrl }: { editor: any; dataRoomUrl?: string | null }) {
  const [linkUrl, setLinkUrl] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);

  const setLink = () => {
    if (linkUrl) {
      const href = /^https?:\/\//i.test(linkUrl) ? linkUrl : `https://${linkUrl}`;
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    } else {
      editor.chain().focus().unsetLink().run();
    }
    setLinkOpen(false);
    setLinkUrl('');
  };

  const insertDataRoomLink = () => {
    if (!dataRoomUrl) return;
    const href = /^https?:\/\//i.test(dataRoomUrl) ? dataRoomUrl : `https://${dataRoomUrl}`;
    // Insert a fresh link with display text "View Data Room" at the caret.
    editor
      .chain()
      .focus()
      .insertContent(
        `<a href="${href}" target="_blank" rel="noopener noreferrer">View Data Room</a>`,
      )
      .run();
    setLinkOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 px-1.5 py-1 border-b bg-muted/30">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
            Size <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[8rem]">
          {FONT_SIZES.map((s) => (
            <DropdownMenuItem
              key={s.value}
              className="text-xs"
              onClick={() => editor.chain().focus().setFontSize(s.value).run()}
            >
              <span style={{ fontSize: s.value }}>{s.label}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem
            className="text-xs text-muted-foreground"
            onClick={() => editor.chain().focus().unsetFontSize().run()}
          >
            Reset size
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" className="h-5 mx-0.5" />

      <Toggle
        size="sm"
        pressed={editor.isActive('bold')}
        onPressedChange={() => editor.chain().focus().toggleBold().run()}
        className="h-7 w-7 p-0"
        aria-label="Bold"
      >
        <Bold className="h-3.5 w-3.5" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive('italic')}
        onPressedChange={() => editor.chain().focus().toggleItalic().run()}
        className="h-7 w-7 p-0"
        aria-label="Italic"
      >
        <Italic className="h-3.5 w-3.5" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive('underline')}
        onPressedChange={() => editor.chain().focus().toggleUnderline().run()}
        className="h-7 w-7 p-0"
        aria-label="Underline"
      >
        <UnderlineIcon className="h-3.5 w-3.5" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive('strike')}
        onPressedChange={() => editor.chain().focus().toggleStrike().run()}
        className="h-7 w-7 p-0"
        aria-label="Strikethrough"
      >
        <Strikethrough className="h-3.5 w-3.5" />
      </Toggle>

      <Separator orientation="vertical" className="h-5 mx-0.5" />

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Text color">
            <Palette className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2">
          <div className="grid grid-cols-5 gap-1">
            {FONT_COLORS.map((c) => (
              <button
                key={c}
                className="w-6 h-6 rounded border hover:scale-110 transition-transform"
                style={{ backgroundColor: c }}
                onClick={() => editor.chain().focus().setColor(c).run()}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
          <button
            className="mt-2 text-[11px] text-muted-foreground hover:text-foreground w-full text-left"
            onClick={() => editor.chain().focus().unsetColor().run()}
          >
            Reset color
          </button>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Highlight">
            <Highlighter className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2">
          <div className="grid grid-cols-4 gap-1">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c}
                className="w-6 h-6 rounded border hover:scale-110 transition-transform"
                style={{ backgroundColor: c }}
                onClick={() => editor.chain().focus().setHighlight({ color: c }).run()}
                aria-label={`Highlight ${c}`}
              />
            ))}
          </div>
          <button
            className="mt-2 text-[11px] text-muted-foreground hover:text-foreground w-full text-left"
            onClick={() => editor.chain().focus().unsetHighlight().run()}
          >
            Remove highlight
          </button>
        </PopoverContent>
      </Popover>

      <Separator orientation="vertical" className="h-5 mx-0.5" />

      <Toggle
        size="sm"
        pressed={editor.isActive('bulletList')}
        onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
        className="h-7 w-7 p-0"
        aria-label="Bullet list"
      >
        <List className="h-3.5 w-3.5" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive('orderedList')}
        onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
        className="h-7 w-7 p-0"
        aria-label="Ordered list"
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </Toggle>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        aria-label="Indent"
        onClick={() => {
          if (editor.isActive('bulletList') || editor.isActive('orderedList')) {
            editor.chain().focus().sinkListItem('listItem').run();
          }
        }}
      >
        <Indent className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        aria-label="Outdent"
        onClick={() => {
          if (editor.isActive('bulletList') || editor.isActive('orderedList')) {
            editor.chain().focus().liftListItem('listItem').run();
          }
        }}
      >
        <Outdent className="h-3.5 w-3.5" />
      </Button>

      <Separator orientation="vertical" className="h-5 mx-0.5" />

      <Popover open={linkOpen} onOpenChange={setLinkOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Insert link">
            <LinkIcon className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3 space-y-2">
          <Input
            placeholder="https://…"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            className="h-7 text-xs"
            onKeyDown={(e) => e.key === 'Enter' && setLink()}
            autoFocus
          />
          <div className="flex gap-1">
            <Button size="sm" className="h-6 text-xs flex-1" onClick={setLink}>Apply</Button>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs"
              onClick={() => {
                editor.chain().focus().unsetLink().run();
                setLinkOpen(false);
              }}
            >
              Remove
            </Button>
          </div>
          {dataRoomUrl && (
            <>
              <div className="border-t pt-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 w-full text-xs gap-1.5 justify-start"
                  onClick={insertDataRoomLink}
                >
                  <Database className="h-3 w-3" />
                  Insert Data Room link
                </Button>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Inserts <span className="font-medium">View Data Room</span> at the cursor.
                </p>
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>

      <Separator orientation="vertical" className="h-5 mx-0.5" />

      {/* Data Room shortcut — one-click insert of the FLEx URL as "View Data Room". */}
      {dataRoomUrl && (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1 text-primary hover:text-primary"
            aria-label="Insert Data Room link"
            title="Insert View Data Room link"
            onClick={insertDataRoomLink}
          >
            <Database className="h-3.5 w-3.5" />
            Data Room
          </Button>
          <Separator orientation="vertical" className="h-5 mx-0.5" />
        </>
      )}

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        aria-label="Clear formatting"
        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
      >
        <Eraser className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
