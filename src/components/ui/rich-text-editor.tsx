import { useEditor, EditorContent, ReactRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, List, ListOrdered, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MentionList, matchesMentionQuery, type MentionUser } from '@/components/ui/mention-list';

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  onSave: () => void;
  onCancel: () => void;
  className?: string;
  mentionUsers?: MentionUser[];
  onBlurSave?: () => void;
}

export function RichTextEditor({
  content,
  onChange,
  onSave,
  onCancel,
  className,
  mentionUsers = [],
  onBlurSave,
}: RichTextEditorProps) {
  const mentionUsersRef = useRef(mentionUsers);
  mentionUsersRef.current = mentionUsers;
  const [MentionExt, setMentionExt] = useState<any>(null);

  useEffect(() => {
    import('@tiptap/extension-mention').then((mod) => {
      setMentionExt(() => mod.default || mod.Mention);
    });
  }, []);

  const extensions = useMemo(() => MentionExt
    ? [
        StarterKit,
        MentionExt.configure({
          HTMLAttributes: { class: 'mention' },
          suggestion: {
            items: ({ query }: { query: string }) => {
              return mentionUsersRef.current
                .filter((user) => matchesMentionQuery(user, query))
                .slice(0, 5);
            },
            render: () => {
              let component: ReactRenderer | null = null;
              let popup: HTMLDivElement | null = null;

              return {
                onStart: (props: any) => {
                  component = new ReactRenderer(MentionList, {
                    props,
                    editor: props.editor,
                  });
                  popup = document.createElement('div');
                  popup.classList.add('mention-list');
                  popup.style.position = 'absolute';
                  popup.style.zIndex = '9999';
                  document.body.appendChild(popup);
                  popup.appendChild(component.element);
                  const { clientRect } = props;
                  if (clientRect) {
                    const rect = clientRect();
                    if (rect) {
                      popup.style.left = `${rect.left}px`;
                      popup.style.top = `${rect.bottom + 4}px`;
                    }
                  }
                },
                onUpdate: (props: any) => {
                  component?.updateProps(props);
                  if (popup) {
                    const { clientRect } = props;
                    if (clientRect) {
                      const rect = clientRect();
                      if (rect) {
                        popup.style.left = `${rect.left}px`;
                        popup.style.top = `${rect.bottom + 4}px`;
                      }
                    }
                  }
                },
                onKeyDown: (props: any) => {
                  if (props.event.key === 'Escape') {
                    popup?.remove();
                    component?.destroy();
                    return true;
                  }
                  return (component?.ref as any)?.onKeyDown?.(props) ?? false;
                },
                onExit: () => {
                  popup?.remove();
                  component?.destroy();
                },
              };
            },
          },
        }),
      ]
    : null, [MentionExt]);

  const editor = useEditor({
    extensions: extensions || [StarterKit],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[80px] px-3 py-2',
      },
      handleKeyDown: (_view, event) => {
        // Enter without Shift saves (unless mention popup is active)
        if (event.key === 'Enter' && !event.shiftKey) {
          // Check if mention suggestion is active by looking for the popup
          const mentionPopup = document.querySelector('[data-tippy-root]') || document.querySelector('.mention-list');
          if (!mentionPopup) {
            event.preventDefault();
            onSave();
            return true;
          }
        }
        return false;
      },
    },
  }, [extensions]);

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
        className="w-[600px] max-w-[600px] border border-input rounded-md bg-background focus-within:ring-1 focus-within:ring-ring [&_.ProseMirror]:break-words [&_.ProseMirror]:whitespace-pre-wrap [&_.ProseMirror]:overflow-wrap-anywhere [&_.mention]:text-primary [&_.mention]:font-medium"
      />
    </div>
  );
}
