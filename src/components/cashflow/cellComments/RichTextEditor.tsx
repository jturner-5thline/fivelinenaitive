import { forwardRef, useImperativeHandle, useRef, useEffect, useCallback } from 'react';
import { Bold, Italic, Underline, List, ListOrdered } from 'lucide-react';

export interface RichTextEditorHandle {
  getHTML: () => string;
  clear: () => void;
  focus: () => void;
}

interface RichTextEditorProps {
  initialHTML?: string;
  placeholder?: string;
  onSubmit?: () => void;
  onCancel?: () => void;
  ariaLabel?: string;
}

/**
 * Lightweight contentEditable rich text editor.
 * - Bold (Ctrl/Cmd+B), Italic (Ctrl/Cmd+I), Underline (Ctrl/Cmd+U)
 * - Bulleted and numbered lists
 * - Cmd/Ctrl+Enter submits, Escape cancels.
 */
export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  function RichTextEditor({ initialHTML, placeholder = 'Add a comment…', onSubmit, onCancel, ariaLabel = 'Comment' }, ref) {
    const editorRef = useRef<HTMLDivElement | null>(null);

    useImperativeHandle(ref, () => ({
      getHTML: () => editorRef.current?.innerHTML ?? '',
      clear: () => {
        if (editorRef.current) editorRef.current.innerHTML = '';
      },
      focus: () => editorRef.current?.focus(),
    }));

    useEffect(() => {
      if (editorRef.current && initialHTML !== undefined) {
        editorRef.current.innerHTML = initialHTML;
      }
      // Auto-focus on mount
      requestAnimationFrame(() => editorRef.current?.focus());
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const exec = useCallback((command: string) => {
      // execCommand is deprecated but remains the simplest cross-browser way
      // to apply formatting in a contentEditable region without adding a heavy dep.
      document.execCommand(command, false);
      editorRef.current?.focus();
    }, []);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        const meta = e.metaKey || e.ctrlKey;
        if (meta && e.key === 'Enter') {
          e.preventDefault();
          onSubmit?.();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel?.();
          return;
        }
        if (meta && (e.key === 'b' || e.key === 'B')) {
          e.preventDefault();
          exec('bold');
        } else if (meta && (e.key === 'i' || e.key === 'I')) {
          e.preventDefault();
          exec('italic');
        } else if (meta && (e.key === 'u' || e.key === 'U')) {
          e.preventDefault();
          exec('underline');
        }
      },
      [exec, onSubmit, onCancel],
    );

    const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
      // Force plain text paste — we'll sanitize on save anyway, but this avoids
      // pulling in unwanted styles/markup mid-editing.
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
    }, []);

    return (
      <div className="cc-editor-wrap">
        <div className="cc-editor-toolbar" role="toolbar" aria-label="Formatting">
          <button type="button" className="cc-tb-btn" onMouseDown={(e) => { e.preventDefault(); exec('bold'); }} title="Bold (⌘B)" aria-label="Bold"><Bold size={12} /></button>
          <button type="button" className="cc-tb-btn" onMouseDown={(e) => { e.preventDefault(); exec('italic'); }} title="Italic (⌘I)" aria-label="Italic"><Italic size={12} /></button>
          <button type="button" className="cc-tb-btn" onMouseDown={(e) => { e.preventDefault(); exec('underline'); }} title="Underline (⌘U)" aria-label="Underline"><Underline size={12} /></button>
          <span className="cc-tb-sep" aria-hidden />
          <button type="button" className="cc-tb-btn" onMouseDown={(e) => { e.preventDefault(); exec('insertUnorderedList'); }} title="Bulleted list" aria-label="Bulleted list"><List size={12} /></button>
          <button type="button" className="cc-tb-btn" onMouseDown={(e) => { e.preventDefault(); exec('insertOrderedList'); }} title="Numbered list" aria-label="Numbered list"><ListOrdered size={12} /></button>
        </div>
        <div
          ref={editorRef}
          className="cc-editor"
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-label={ariaLabel}
          data-placeholder={placeholder}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          suppressContentEditableWarning
        />
      </div>
    );
  },
);
