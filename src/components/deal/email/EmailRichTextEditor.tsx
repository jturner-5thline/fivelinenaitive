import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import FontSize from '@tiptap/extension-font-size';
import Image from '@tiptap/extension-image';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import {
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  Link as LinkIcon, Palette, Highlighter, Indent, Outdent, Eraser,
  ChevronDown, Strikethrough, Database, Image as ImageIcon, Minus, Upload,
} from 'lucide-react';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  /** Customize the placeholder shown when the editor is empty. */
  placeholder?: string;
  /** Enable image insertion (URL paste + upload). Defaults to true. */
  enableImages?: boolean;
  /** Storage bucket name for image uploads. Defaults to 'email-signatures'. */
  uploadBucket?: string;
  /**
   * Optional content rendered at the right edge of the editor's formatting
   * toolbar (e.g. a "Polish with AI" button). Kept inside the editor frame
   * so it stays visible while the user is typing.
   */
  toolbarTrailing?: React.ReactNode;
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

export function EmailRichTextEditor({
  content,
  onChange,
  className,
  minHeight = 240,
  dataRoomUrl,
  placeholder = 'Compose your email…',
  enableImages = true,
  uploadBucket = 'email-signatures',
  toolbarTrailing,
}: Props) {
  // Ref populated by the Toolbar component once mounted. Lets the editor
  // request the link popover open (e.g. from a Cmd/Ctrl+K shortcut)
  // without lifting the popover state out of the toolbar.
  const openLinkPopoverRef = useRef<(() => void) | null>(null);
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
      Placeholder.configure({ placeholder }),
      Image.configure({
        HTMLAttributes: { class: 'inline-block max-w-full h-auto rounded' },
        allowBase64: false,
      }),
    ],
    content: content || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'email-rte-content prose prose-sm prose-invert max-w-none focus:outline-none px-3 py-3 text-sm leading-relaxed text-foreground/90',
        style: `min-height: ${minHeight}px;`,
      },
      // Cmd/Ctrl+K opens the insert-link popover on the current selection.
      // Bold/Italic/Underline (Cmd/Ctrl+B/I/U) are already bound by Tiptap's
      // StarterKit + Underline extensions, so they work without extra wiring.
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k') {
          event.preventDefault();
          openLinkPopoverRef.current?.();
          return true;
        }
        return false;
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
    <div className={cn('compose-body border border-white/10 rounded-md overflow-hidden bg-card/40 flex flex-col w-full min-w-0', className)}>
      <Toolbar
        editor={editor}
        dataRoomUrl={dataRoomUrl}
        enableImages={enableImages}
        uploadBucket={uploadBucket}
        trailing={toolbarTrailing}
        openLinkPopoverRef={openLinkPopoverRef}
      />
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
        <EditorContent editor={editor} />
      </div>
      {/* Scoped reset for pasted/AI-injected signature HTML so heading and
          oversized inline elements render at body-text size and stay within
          the composer width. Targets only this composer's body. */}
      <style>{`
        .compose-body .ProseMirror { word-break: break-word; overflow-wrap: anywhere; max-width: 100%; color: hsl(var(--foreground) / 0.92); font-size: 14px; line-height: 1.55; }
        .compose-body .ProseMirror * { max-width: 100%; }
        .compose-body .ProseMirror p { font-size: 14px; }
        .compose-body .ProseMirror p.is-editor-empty:first-child::before { color: hsl(var(--foreground) / 0.35); content: attr(data-placeholder); float: left; height: 0; pointer-events: none; }
        .compose-body .ProseMirror img { height: auto; }
        .compose-body .ProseMirror h1,
        .compose-body .ProseMirror h2,
        .compose-body .ProseMirror h3,
        .compose-body .ProseMirror h4,
        .compose-body .ProseMirror h5,
        .compose-body .ProseMirror h6 {
          font-size: 0.95rem !important;
          font-weight: 600 !important;
          line-height: 1.4 !important;
          margin: 0 !important;
          color: hsl(var(--foreground)) !important;
        }
      `}</style>
    </div>
  );
}

function Toolbar({
  editor,
  dataRoomUrl,
  enableImages,
  uploadBucket,
  trailing,
  openLinkPopoverRef,
}: { editor: any; dataRoomUrl?: string | null; enableImages?: boolean; uploadBucket?: string; trailing?: React.ReactNode; openLinkPopoverRef?: React.MutableRefObject<(() => void) | null> }) {
  const [linkUrl, setLinkUrl] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const savedRangeRef = useRef<{ from: number; to: number } | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [imageOpen, setImageOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Expose a stable opener to the parent editor so Cmd/Ctrl+K can pop the
  // link dialog from inside the ProseMirror keymap. Captures the active
  // selection first so the popover applies the link to the right range.
  useEffect(() => {
    if (!openLinkPopoverRef) return;
    openLinkPopoverRef.current = () => {
      const { from, to } = editor.state.selection;
      savedRangeRef.current = { from, to };
      const existing = editor.getAttributes('link')?.href as string | undefined;
      setLinkUrl(existing || '');
      setLinkOpen(true);
    };
    return () => {
      if (openLinkPopoverRef.current) openLinkPopoverRef.current = null;
    };
  }, [editor, openLinkPopoverRef]);

  const insertImage = (src: string) => {
    if (!src) return;
    const safe = /^https?:\/\//i.test(src) ? src : `https://${src}`;
    editor.chain().focus().setImage({ src: safe }).run();
    setImageUrl('');
    setImageOpen(false);
  };

  const handleUpload = async (file: File) => {
    const ALLOWED = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (!ALLOWED.includes(file.type)) {
      toast.error('Unsupported image type. Use PNG, JPG, GIF, or WEBP.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2 MB.');
      return;
    }
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('You must be signed in to upload images.');
        return;
      }
      const ext = file.name.split('.').pop() || 'png';
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(uploadBucket || 'email-signatures')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage
        .from(uploadBucket || 'email-signatures')
        .getPublicUrl(path);
      if (pub?.publicUrl) {
        insertImage(pub.publicUrl);
        toast.success('Image uploaded');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const setLink = () => {
    const range = savedRangeRef.current;
    // Restore the user's pre-popover selection BEFORE applying the link, so
    // the link mark wraps the highlighted text instead of an empty caret.
    if (range) {
      // Run as a single transaction: select → focus → (extend) → setLink.
      if (linkUrl) {
        const href = /^https?:\/\//i.test(linkUrl) ? linkUrl : `https://${linkUrl}`;
        const hasSelection = range.to > range.from;
        if (hasSelection) {
          editor
            .chain()
            .setTextSelection(range)
            .extendMarkRange('link')
            .setLink({ href, target: '_blank' } as any)
            .run();
        } else {
          // No selection — insert the URL as linked text at the caret.
          editor
            .chain()
            .setTextSelection(range)
            .insertContent({
              type: 'text',
              text: linkUrl,
              marks: [{ type: 'link', attrs: { href, target: '_blank' } }],
            })
            .run();
        }
      } else {
        editor
          .chain()
          .setTextSelection(range)
          .extendMarkRange('link')
          .unsetLink()
          .run();
      }
    }
    setLinkOpen(false);
    setLinkUrl('');
    savedRangeRef.current = null;
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
    <div className="flex flex-wrap items-center gap-0.5 px-1.5 py-1 border-b border-white/10 bg-white/[0.04]">
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

      <Popover
        open={linkOpen}
        onOpenChange={(open) => {
          if (open) {
            const { from, to } = editor.state.selection;
            savedRangeRef.current = { from, to };
            const existing = editor.getAttributes('link')?.href as string | undefined;
            setLinkUrl(existing || '');
          } else {
            savedRangeRef.current = null;
          }
          setLinkOpen(open);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Insert link"
            // Capture the editor selection on pointerdown — before focus
            // shifts to the popover input and ProseMirror can update its
            // internal selection to a collapsed state.
            onPointerDown={() => {
              const { from, to } = editor.state.selection;
              savedRangeRef.current = { from, to };
            }}
          >
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
                const range = savedRangeRef.current;
                const chain = editor.chain();
                if (range) chain.setTextSelection(range);
                chain.extendMarkRange('link').unsetLink().run();
                savedRangeRef.current = null;
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

      {enableImages && (
        <>
          <Separator orientation="vertical" className="h-5 mx-0.5" />
          <Popover open={imageOpen} onOpenChange={setImageOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Insert image">
                <ImageIcon className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3 space-y-2">
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">Image URL</p>
                <Input
                  placeholder="https://…"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="h-7 text-xs"
                  onKeyDown={(e) => e.key === 'Enter' && insertImage(imageUrl)}
                />
                <Button size="sm" className="h-6 text-xs w-full" onClick={() => insertImage(imageUrl)}>
                  Insert
                </Button>
              </div>
              <div className="border-t pt-2 space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">Or upload</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-full text-xs gap-1.5"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-3 w-3" />
                  {uploading ? 'Uploading…' : 'Upload (PNG, JPG, GIF, WEBP, ≤2MB)'}
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Horizontal rule"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
      {trailing && (
        <>
          <div className="flex-1 min-w-2" />
          <div className="flex items-center gap-1">{trailing}</div>
        </>
      )}
    </div>
  );
}
