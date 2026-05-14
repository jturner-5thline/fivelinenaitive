import { useEffect, useRef, useState } from 'react';
import { Trash2, Send, X } from 'lucide-react';
import DOMPurify from 'dompurify';
import { RichTextEditor, type RichTextEditorHandle } from './RichTextEditor';
import type { CellComment } from './types';
import { useAuth } from '@/contexts/AuthContext';
import { formatRelativeTime, formatAbsoluteTime, authorInitials, authorDisplay } from './formatAuthor';

interface CellCommentPopoverProps {
  anchor: { x: number; y: number };
  mode: 'compose' | 'view';
  comments: CellComment[];
  onSubmit: (html: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onClose: () => void;
}

export function CellCommentPopover({ anchor, mode, comments, onSubmit, onDelete, onClose }: CellCommentPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const editorRef = useRef<RichTextEditorHandle>(null);
  const { user } = useAuth();
  const [composing, setComposing] = useState(mode === 'compose');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setComposing(mode === 'compose');
  }, [mode]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleSubmit = async () => {
    const html = editorRef.current?.getHTML().trim() || '';
    if (!html || html === '<br>') return;
    setSubmitting(true);
    try {
      await onSubmit(html);
      editorRef.current?.clear();
      setComposing(false);
      // If there were no prior comments, we created the first one and can close.
      if (comments.length === 0) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  // Clamp position
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const POPOVER_W = 320;
  const POPOVER_H_EST = 320;
  const left = Math.max(8, Math.min(anchor.x, vw - POPOVER_W - 8));
  const top = Math.max(8, Math.min(anchor.y, vh - POPOVER_H_EST - 8));

  return (
    <div
      ref={ref}
      className="cc-popover"
      style={{ left, top, width: POPOVER_W }}
      role="dialog"
      aria-label="Cell comments"
    >
      <div className="cc-popover-header">
        <span className="cc-popover-title">
          {comments.length > 0 ? `Comments (${comments.length})` : 'Add comment'}
        </span>
        <button type="button" className="cc-popover-close" onClick={onClose} aria-label="Close">
          <X size={13} />
        </button>
      </div>

      {comments.length > 0 && (
        <div className="cc-popover-list">
          {comments.map((c) => {
            const canDelete = user?.id === c.created_by;
            return (
              <div key={c.id} className="cc-comment-item">
                <div className="cc-comment-avatar" aria-hidden>{authorInitials(c)}</div>
                <div className="cc-comment-body">
                  <div className="cc-comment-meta">
                    <span className="cc-comment-author">{authorDisplay(c)}</span>
                    <span className="cc-comment-time" title={formatAbsoluteTime(c.created_at)}>
                      {formatRelativeTime(c.created_at)}
                    </span>
                  </div>
                  <div
                    className="cc-comment-html"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(c.content_html || '', { USE_PROFILES: { html: true } }) }}
                  />
                </div>
                {canDelete && (
                  <button
                    type="button"
                    className="cc-comment-delete"
                    onClick={() => onDelete(c.id)}
                    aria-label="Delete comment"
                    title="Delete comment"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {composing ? (
        <div className="cc-popover-compose">
          <RichTextEditor
            ref={editorRef}
            placeholder="Write a comment… (⌘B / ⌘I / ⌘U)"
            onSubmit={handleSubmit}
            onCancel={onClose}
          />
          <div className="cc-popover-actions">
            <span className="cc-popover-hint">⌘+Enter to submit</span>
            <button
              type="button"
              className="cc-btn-submit"
              onClick={handleSubmit}
              disabled={submitting}
            >
              <Send size={11} />
              {submitting ? 'Saving…' : 'Submit'}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="cc-add-reply-btn" onClick={() => setComposing(true)}>
          + Add comment
        </button>
      )}
    </div>
  );
}
