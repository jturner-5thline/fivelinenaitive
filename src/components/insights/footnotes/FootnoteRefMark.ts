import { Mark, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    footnoteRefMark: {
      setFootnoteRef: (footnoteId: string, refId: string) => ReturnType;
      unsetFootnoteRef: (refId?: string) => ReturnType;
    };
  }
}

/**
 * Inline mark anchoring a footnote reference (Decision / Note / Action Item)
 * to a span of text in the Agenda editor. Rendered as a <sup> tag; the visible
 * number is filled in at runtime by the numbering plugin via CSS counter
 * decoration so reordering body content never requires resaving attrs.
 */
export const FootnoteRefMark = Mark.create({
  name: 'footnoteRefMark',
  inclusive: false,
  excludes: '',
  addAttributes() {
    return {
      footnoteId: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-footnote-id'),
        renderHTML: (attrs) =>
          attrs.footnoteId ? { 'data-footnote-id': attrs.footnoteId } : {},
      },
      refId: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-ref-id'),
        renderHTML: (attrs) =>
          attrs.refId ? { 'data-ref-id': attrs.refId } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: 'sup.agenda-footnote-ref' }, { tag: 'span.agenda-footnote-ref' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'sup',
      mergeAttributes(HTMLAttributes, { class: 'agenda-footnote-ref' }),
      0,
    ];
  },
  addCommands() {
    return {
      setFootnoteRef:
        (footnoteId: string, refId: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { footnoteId, refId }),
      unsetFootnoteRef:
        (refId?: string) =>
        ({ tr, state, dispatch }) => {
          const type = state.schema.marks[this.name];
          if (!type) return false;
          let changed = false;
          state.doc.descendants((node, pos) => {
            if (!node.isText) return;
            node.marks.forEach((m) => {
              if (m.type === type && (!refId || m.attrs.refId === refId)) {
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

/** Returns all distinct footnoteIds in document order. */
export function getOrderedFootnoteIds(doc: any): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  doc.descendants((node: any) => {
    if (!node.isText) return;
    node.marks.forEach((m: any) => {
      if (m.type.name === 'footnoteRefMark' && m.attrs.footnoteId) {
        if (!seen.has(m.attrs.footnoteId)) {
          seen.add(m.attrs.footnoteId);
          order.push(m.attrs.footnoteId);
        }
      }
    });
  });
  return order;
}

/** Returns all (footnoteId, refId) pairs in document order, including dupes. */
export function getAllFootnoteRefs(doc: any): Array<{ footnoteId: string; refId: string | null }> {
  const refs: Array<{ footnoteId: string; refId: string | null }> = [];
  doc.descendants((node: any) => {
    if (!node.isText) return;
    node.marks.forEach((m: any) => {
      if (m.type.name === 'footnoteRefMark' && m.attrs.footnoteId) {
        const last = refs[refs.length - 1];
        if (last && last.footnoteId === m.attrs.footnoteId && last.refId === (m.attrs.refId ?? null)) return;
        refs.push({ footnoteId: m.attrs.footnoteId, refId: m.attrs.refId ?? null });
      }
    });
  });
  return refs;
}