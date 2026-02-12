import { useEditor, EditorContent, ReactRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { MentionList, type MentionUser } from '@/components/ui/mention-list';

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  onKeyDown?: (e: KeyboardEvent) => void;
  placeholder?: string;
  className?: string;
  mentionUsers?: MentionUser[];
  autoFocus?: boolean;
}

export function MentionTextarea({
  value,
  onChange,
  onBlur,
  onKeyDown,
  placeholder,
  className,
  mentionUsers = [],
  autoFocus = true,
}: MentionTextareaProps) {
  const mentionUsersRef = useRef(mentionUsers);
  mentionUsersRef.current = mentionUsers;
  const isMentionOpenRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Mention.configure({
        HTMLAttributes: { class: 'mention' },
        suggestion: {
          items: ({ query }: { query: string }) =>
            mentionUsersRef.current
              .filter((u) => u.display_name.toLowerCase().includes(query.toLowerCase()))
              .slice(0, 5),
          render: () => {
            let component: ReactRenderer | null = null;
            let popup: HTMLDivElement | null = null;

            return {
              onStart: (props: any) => {
                isMentionOpenRef.current = true;
                component = new ReactRenderer(MentionList, {
                  props,
                  editor: props.editor,
                });
                popup = document.createElement('div');
                popup.style.position = 'absolute';
                popup.style.zIndex = '9999';
                document.body.appendChild(popup);
                popup.appendChild(component.element);
                const rect = props.clientRect?.();
                if (rect) {
                  popup.style.left = `${rect.left}px`;
                  popup.style.top = `${rect.bottom + 4}px`;
                }
              },
              onUpdate: (props: any) => {
                component?.updateProps(props);
                if (popup) {
                  const rect = props.clientRect?.();
                  if (rect) {
                    popup.style.left = `${rect.left}px`;
                    popup.style.top = `${rect.bottom + 4}px`;
                  }
                }
              },
              onKeyDown: (props: any) => {
                if (props.event.key === 'Escape') {
                  popup?.remove();
                  component?.destroy();
                  isMentionOpenRef.current = false;
                  return true;
                }
                return (component?.ref as any)?.onKeyDown?.(props) ?? false;
              },
              onExit: () => {
                popup?.remove();
                component?.destroy();
                isMentionOpenRef.current = false;
              },
            };
          },
        },
      }),
    ],
    content: value ? `<p>${value}</p>` : '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'focus:outline-none text-sm min-h-[3rem] px-2 py-1.5',
      },
      handleKeyDown: (_view, event) => {
        if (isMentionOpenRef.current) return false;
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          onKeyDown?.(event);
          return true;
        }
        if (event.key === 'Escape') {
          onKeyDown?.(event);
          return true;
        }
        return false;
      },
    },
  });

  useEffect(() => {
    if (autoFocus && editor) {
      editor.commands.focus('end');
    }
  }, [editor, autoFocus]);

  if (!editor) return null;

  return (
    <EditorContent
      editor={editor}
      onBlur={onBlur}
      className={cn(
        'w-full bg-muted/50 border border-border rounded-md resize-none focus-within:ring-2 focus-within:ring-ring text-foreground [&_.mention]:text-primary [&_.mention]:font-medium [&_.ProseMirror]:break-words [&_.ProseMirror]:whitespace-pre-wrap',
        className
      )}
    />
  );
}
