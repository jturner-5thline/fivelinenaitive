import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import DOMPurify from 'dompurify';
import { Bold, Italic, List, ListOrdered } from 'lucide-react';

/** Shared typography so view mode looks identical to edit mode. */
export const GOAL_RICH_CSS = `
  .qir-gp-rich { font-size: 13.5px; line-height: 1.55; color: inherit; white-space: pre-wrap; overflow-wrap: anywhere; }
  .qir-gp-rich p { margin: 0 0 6px; }
  .qir-gp-rich > *:last-child { margin-bottom: 0; }
  .qir-gp-rich ul { list-style: disc; padding-left: 20px; margin: 0 0 6px; }
  .qir-gp-rich ol { list-style: decimal; padding-left: 20px; margin: 0 0 6px; }
  .qir-gp-rich li { margin: 2px 0; }
  .qir-gp-rich li p { margin: 0; }
  .qir-gp-rich strong { font-weight: 700; }
  .qir-gp-rich em { font-style: italic; }
  .qir-gp-rich .ProseMirror { outline: none; min-height: 60px; }
  .qir-gp-tb { display: flex; gap: 2px; padding-bottom: 6px; margin-bottom: 6px; border-bottom: 1px solid rgba(120,170,255,0.12); }
  .qir-gp-tb button { height: 26px; width: 26px; display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; background: transparent; border: 0; color: rgba(200,215,235,0.7); cursor: pointer; }
  .qir-gp-tb button:hover { color: #fff; background: rgba(120,170,255,0.12); }
  .qir-gp-tb button[data-active="true"] { color: #fff; background: rgba(120,170,255,0.22); }
`;

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Legacy descriptions were plain text — convert line breaks to paragraphs. */
export function toGoalHtml(value: string): string {
  if (!value) return '';
  if (/<(p|ul|ol|li|strong|em|br)\b/i.test(value)) return value;
  return value.split(/\n/).map(l => `<p>${escapeHtml(l)}</p>`).join('');
}

export function goalHtmlIsEmpty(value: string): boolean {
  return !value || !value.replace(/<[^>]*>/g, '').trim();
}

export function goalPlainText(value: string): string {
  return (value || '').replace(/<\/(p|li)>/gi, ' ').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

export function GoalRichView({ html }: { html: string }) {
  return (
    <div
      className="qir-gp-rich"
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(toGoalHtml(html), { ALLOWED_TAGS: ['p', 'strong', 'em', 'ul', 'ol', 'li', 'br'], ALLOWED_ATTR: [] }) }}
    />
  );
}

export function GoalRichEditor({ value, onChange, placeholder, autoFocus }: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: false, codeBlock: false, blockquote: false, horizontalRule: false, code: false })],
    content: toGoalHtml(value),
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? '' : editor.getHTML()),
    editorProps: { attributes: { 'data-placeholder': placeholder ?? '' } },
  });
  useEffect(() => { if (editor && autoFocus) editor.commands.focus('end'); }, [editor, autoFocus]);
  if (!editor) return null;
  const btn = (active: boolean, onClick: () => void, Icon: typeof Bold, label: string) => (
    <button type="button" aria-label={label} data-active={active} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      <Icon size={14} />
    </button>
  );
  return (
    <div>
      <div className="qir-gp-tb">
        {btn(editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), Bold, 'Bold')}
        {btn(editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), Italic, 'Italic')}
        {btn(editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), List, 'Bulleted list')}
        {btn(editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), ListOrdered, 'Numbered list')}
      </div>
      <EditorContent editor={editor} className="qir-gp-rich" />
    </div>
  );
}
