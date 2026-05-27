import { MessageSquare } from 'lucide-react';
import type { CellComment } from './types';
import { htmlToPlainText } from './sanitize';
import { formatAbsoluteTime, authorDisplay } from './formatAuthor';

interface CellCommentIndicatorProps {
  comments: CellComment[];
  onOpen: (e: React.MouseEvent) => void;
}

/**
 * Subtle comment marker in the top-right of a cash-flow cell. Uses a small
 * MessageSquare icon in muted color (not the bright primary blue) so it does
 * not dominate the cell. Hovering shows a native tooltip with each comment's
 * text + author + timestamp; clicking opens the same popover used by the
 * right-click "View comments" flow.
 */
export function CellCommentIndicator({ comments, onOpen }: CellCommentIndicatorProps) {
  if (!comments || comments.length === 0) return null;
  const tip = comments
    .slice(0, 3)
    .map((c) => {
      const text = (c.content_text || htmlToPlainText(c.content_html || '') || '').trim();
      const who = authorDisplay(c);
      const when = formatAbsoluteTime(c.created_at);
      const head = text.length > 140 ? text.slice(0, 140) + '…' : text;
      return `${head}\n— ${who} • ${when}`;
    })
    .join('\n\n');
  const more = comments.length > 3 ? `\n\n+${comments.length - 3} more…` : '';
  const title = `${comments.length} comment${comments.length > 1 ? 's' : ''}\n\n${tip}${more}`;
  return (
    <button
      type="button"
      className={`cf-cell-comment-indicator${comments.length > 1 ? ' has-multiple' : ''}`}
      title={title}
      aria-label={`${comments.length} comment${comments.length > 1 ? 's' : ''} on this cell`}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(e);
      }}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <MessageSquare size={10} strokeWidth={2} />
    </button>
  );
}