import { Mark, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    commentMark: {
      setCommentMark: (threadId: string) => ReturnType;
      unsetCommentMark: (threadId?: string) => ReturnType;
    };
  }
}

/**
 * Inline mark that anchors a comment thread to a span of text in the agenda
 * editor. Renders as <span class="agenda-comment" data-thread-id="..."> and
 * naturally follows surrounding edits via ProseMirror's mark mapping.
 */
export const CommentMark = Mark.create({
  name: 'commentMark',
  inclusive: false,
  excludes: '',
  addAttributes() {
    return {
      threadId: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-thread-id'),
        renderHTML: (attrs) =>
          attrs.threadId ? { 'data-thread-id': attrs.threadId } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span.agenda-comment' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { class: 'agenda-comment' }),
      0,
    ];
  },
  addCommands() {
    return {
      setCommentMark:
        (threadId: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { threadId }),
      unsetCommentMark:
        (threadId?: string) =>
        ({ tr, state, dispatch }) => {
          const type = state.schema.marks[this.name];
          if (!type) return false;
          let changed = false;
          state.doc.descendants((node, pos) => {
            if (!node.isText) return;
            node.marks.forEach((m) => {
              if (m.type === type && (!threadId || m.attrs.threadId === threadId)) {
                tr.removeMark(pos, pos + node.nodeSize, type);
                changed = true;
              }
            });
          });
          if (changed && dispatch) dispatch(tr);
          return changed;
        },
    };
  },
});

/** Walk the doc and return all comment-marked ranges in document order. */
export function findCommentRanges(doc: any): Array<{
  threadId: string;
  from: number;
  to: number;
  text: string;
}> {
  const out: Array<{ threadId: string; from: number; to: number; text: string }> = [];
  doc.descendants((node: any, pos: number) => {
    if (!node.isText) return;
    node.marks.forEach((m: any) => {
      if (m.type.name === 'commentMark' && m.attrs.threadId) {
        out.push({
          threadId: m.attrs.threadId,
          from: pos,
          to: pos + node.nodeSize,
          text: node.text || '',
        });
      }
    });
  });
  // Merge adjacent ranges with same threadId.
  const merged: typeof out = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && last.threadId === r.threadId && last.to === r.from) {
      last.to = r.to;
      last.text += r.text;
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}