import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Bold, Italic, Strikethrough, List, ListOrdered, Heading1, Heading2, Quote, Undo2, Redo2 } from 'lucide-react';
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
      StarterKit,
      Placeholder.configure({ placeholder: 'Write your report here…' }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class:
          'prose prose-invert max-w-none min-h-[140px] px-4 py-3 focus:outline-none text-sm leading-relaxed',
      },
    },
  });

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
          {/* Rich text editor */}
          <div className="px-6 pt-4">
            <div
              className="rounded-lg border border-white/10 bg-white/[0.03]"
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
                  title="Strikethrough"
                  active={editor?.isActive('strike')}
                  onClick={() => editor?.chain().focus().toggleStrike().run()}
                >
                  <Strikethrough size={14} />
                </ToolbarBtn>
                <div className="w-px h-4 bg-white/10 mx-1" />
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
                <div className="w-px h-4 bg-white/10 mx-1" />
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
                <div className="w-px h-4 bg-white/10 mx-1" />
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