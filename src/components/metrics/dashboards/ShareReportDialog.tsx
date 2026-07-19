import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, Heading1, Heading2, Heading3, Quote,
  Undo2, Redo2, Link as LinkIcon, Unlink, Code, Highlighter,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, Minus, Eraser,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SalesDashboardV2 } from './SalesDashboardV2';

interface ShareReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ToolbarBtn({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={cn(
        'h-7 w-7 inline-flex items-center justify-center rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors',
        active && 'bg-white/15 text-white',
      )}
    >
      {children}
    </button>
  );
}

export function ShareReportDialog({ open, onOpenChange }: ShareReportDialogProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: 'Write your report here…' }),
      Underline,
      Highlight.configure({ multicolor: false }),
      HorizontalRule,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: { class: 'text-cyan-300 underline underline-offset-2' },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class:
          'prose prose-invert prose-sm max-w-none min-h-[220px] px-4 py-3 focus:outline-none text-sm leading-relaxed ' +
          '[&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:mt-2 [&_h1]:mb-2 ' +
          '[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-2 [&_h2]:mb-2 ' +
          '[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 ' +
          '[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 ' +
          '[&_blockquote]:border-l-2 [&_blockquote]:border-white/30 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-white/80 ' +
          '[&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[0.85em] ' +
          '[&_hr]:border-white/20 [&_hr]:my-3 ' +
          '[&_mark]:bg-yellow-300/40 [&_mark]:text-inherit [&_mark]:rounded-sm [&_mark]:px-0.5 ' +
          '[&_a]:text-cyan-300 [&_a]:underline',
      },
    },
  });

  const promptForLink = () => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Enter URL', prev ?? 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
  };

  const Sep = () => <div className="w-px h-4 bg-white/10 mx-1" />;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[96vw] w-[96vw] h-[92vh] p-0 overflow-hidden border-white/10"
        style={{ background: '#0b0b12' }}
      >
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-white/10">
          <DialogTitle className="text-white text-lg font-semibold">Share Report</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col h-full overflow-hidden">
          {/* Rich text editor — aligned exactly to the 3-widget KPI row */}
          <div style={{ maxWidth: 1240, margin: '0 auto', padding: '16px 26px 0' }} className="w-full">
            <div
              className="rounded-lg border border-white/10 bg-white/[0.03]"
              style={{
                // Width of 3 KPI cards + 2 gaps (gap-4 = 16px) inside a 3-col grid.
                // = (100% - 2*16px) * 3/3 = full inner width of the KPI row.
                width: '100%',
              }}
              onClick={() => editor?.chain().focus().run()}
            >
              <div className="flex items-center gap-1 px-2 py-1.5 border-b border-white/10">
                <ToolbarBtn
                  title="Bold"
                  active={editor?.isActive('bold')}
                  onClick={() => editor?.chain().focus().toggleBold().run()}
                >
                  <Bold size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Italic"
                  active={editor?.isActive('italic')}
                  onClick={() => editor?.chain().focus().toggleItalic().run()}
                >
                  <Italic size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Underline"
                  active={editor?.isActive('underline')}
                  onClick={() => editor?.chain().focus().toggleUnderline().run()}
                >
                  <UnderlineIcon size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Strikethrough"
                  active={editor?.isActive('strike')}
                  onClick={() => editor?.chain().focus().toggleStrike().run()}
                >
                  <Strikethrough size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Highlight"
                  active={editor?.isActive('highlight')}
                  onClick={() => editor?.chain().focus().toggleHighlight().run()}
                >
                  <Highlighter size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Inline code"
                  active={editor?.isActive('code')}
                  onClick={() => editor?.chain().focus().toggleCode().run()}
                >
                  <Code size={14} />
                </ToolbarBtn>
                <Sep />
                <ToolbarBtn
                  title="Heading 1"
                  active={editor?.isActive('heading', { level: 1 })}
                  onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
                >
                  <Heading1 size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Heading 2"
                  active={editor?.isActive('heading', { level: 2 })}
                  onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
                >
                  <Heading2 size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Heading 3"
                  active={editor?.isActive('heading', { level: 3 })}
                  onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
                >
                  <Heading3 size={14} />
                </ToolbarBtn>
                <Sep />
                <ToolbarBtn
                  title="Bullet list"
                  active={editor?.isActive('bulletList')}
                  onClick={() => editor?.chain().focus().toggleBulletList().run()}
                >
                  <List size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Numbered list"
                  active={editor?.isActive('orderedList')}
                  onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                >
                  <ListOrdered size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Quote"
                  active={editor?.isActive('blockquote')}
                  onClick={() => editor?.chain().focus().toggleBlockquote().run()}
                >
                  <Quote size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Horizontal rule"
                  onClick={() => editor?.chain().focus().setHorizontalRule().run()}
                >
                  <Minus size={14} />
                </ToolbarBtn>
                <Sep />
                <ToolbarBtn
                  title="Align left"
                  active={editor?.isActive({ textAlign: 'left' })}
                  onClick={() => editor?.chain().focus().setTextAlign('left').run()}
                >
                  <AlignLeft size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Align center"
                  active={editor?.isActive({ textAlign: 'center' })}
                  onClick={() => editor?.chain().focus().setTextAlign('center').run()}
                >
                  <AlignCenter size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Align right"
                  active={editor?.isActive({ textAlign: 'right' })}
                  onClick={() => editor?.chain().focus().setTextAlign('right').run()}
                >
                  <AlignRight size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Justify"
                  active={editor?.isActive({ textAlign: 'justify' })}
                  onClick={() => editor?.chain().focus().setTextAlign('justify').run()}
                >
                  <AlignJustify size={14} />
                </ToolbarBtn>
                <Sep />
                <ToolbarBtn
                  title="Add / edit link"
                  active={editor?.isActive('link')}
                  onClick={promptForLink}
                >
                  <LinkIcon size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Remove link"
                  onClick={() => editor?.chain().focus().extendMarkRange('link').unsetLink().run()}
                >
                  <Unlink size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Clear formatting"
                  onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}
                >
                  <Eraser size={14} />
                </ToolbarBtn>
                <Sep />
                <ToolbarBtn title="Undo" onClick={() => editor?.chain().focus().undo().run()}>
                  <Undo2 size={14} />
                </ToolbarBtn>
                <ToolbarBtn title="Redo" onClick={() => editor?.chain().focus().redo().run()}>
                  <Redo2 size={14} />
                </ToolbarBtn>
              </div>
              <EditorContent editor={editor} />
            </div>
          </div>

          {/* Dashboard snapshot (no Sales Model) */}
          <div className="flex-1 min-h-0 overflow-y-auto mt-4 border-t border-white/10">
            <SalesDashboardV2 reportMode />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}