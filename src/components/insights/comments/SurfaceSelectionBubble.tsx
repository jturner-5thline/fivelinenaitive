import { useEffect, useRef, useState } from 'react';
import { MessageSquare } from 'lucide-react';

/**
 * DOM-level "Comment" bubble that appears whenever the user highlights
 * text inside an Insights tab (Dashboard, Forecasts, Key Metrics, JT,
 * JM, SW). On click it synthesises a `contextmenu` event at the end of
 * the selection so the existing `QirContextualComments` right-click
 * handler — which already captures the live selection as the snippet
 * and opens the composer — runs unchanged.
 *
 * Skipped inside form inputs, contenteditable surfaces, and the TipTap
 * Agenda editor (which has its own `SelectionCommentAction`), so the
 * two systems never both render on the same selection.
 */
export function SurfaceSelectionBubble({
  rootRef,
}: {
  rootRef: React.RefObject<HTMLElement>;
}) {
  const [pos, setPos] = useState<{ x: number; y: number; target: HTMLElement } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const compute = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setPos(null); return; }
      const text = sel.toString().trim();
      if (!text) { setPos(null); return; }
      const range = sel.getRangeAt(0);
      const anchor = (range.commonAncestorContainer.nodeType === 1
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement) as HTMLElement | null;
      if (!anchor) { setPos(null); return; }
      if (!root.contains(anchor)) { setPos(null); return; }
      // Skip native-input surfaces and the TipTap Agenda editor.
      if (anchor.closest('input, textarea, select, [contenteditable="true"], .ProseMirror')) {
        setPos(null);
        return;
      }
      // Don't interfere with our own composer/bubble.
      if (anchor.closest('[data-qir-comments-ui], [data-surface-selection-bubble]')) {
        return;
      }
      const rect = range.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) { setPos(null); return; }
      // Anchor just above the selection, left-aligned to it, clamped to
      // the viewport. Drop below when there's no room above.
      const BTN_H = 26;
      const OFFSET = 6;
      let y = rect.top - BTN_H - OFFSET;
      if (y < 8) y = rect.bottom + OFFSET;
      const x = Math.max(8, Math.min(rect.left, window.innerWidth - 120));
      setPos({ x, y, target: anchor });
    };

    const onSelChange = () => {
      // Only react to selections inside our surface.
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) { setPos(null); return; }
      const node = sel.anchorNode;
      const el = (node && (node.nodeType === 1 ? node : node.parentElement)) as HTMLElement | null;
      if (!el || !root.contains(el)) { setPos(null); return; }
      // Defer to mouseup for the final position; collapse-only events clear.
      if (sel.isCollapsed) setPos(null);
    };
    const onMouseUp = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest('[data-surface-selection-bubble]')) return;
      // Let the selection settle before measuring.
      setTimeout(compute, 0);
    };
    const onScroll = () => setPos(null);

    document.addEventListener('selectionchange', onSelChange);
    document.addEventListener('mouseup', onMouseUp, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('selectionchange', onSelChange);
      document.removeEventListener('mouseup', onMouseUp, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [rootRef]);

  if (!pos) return null;

  return (
    <button
      ref={btnRef}
      type="button"
      data-surface-selection-bubble
      onMouseDown={(e) => {
        // Preserve the live selection — don't let the button steal focus.
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const target = pos.target;
        const sel = window.getSelection();
        let cx = pos.x;
        let cy = pos.y + 12;
        if (sel && sel.rangeCount > 0) {
          const r = sel.getRangeAt(0).getBoundingClientRect();
          cx = r.right;
          cy = r.bottom;
        }
        // Synthesise a right-click on the selection so the existing
        // QirContextualComments contextmenu handler captures the snippet
        // and opens the composer with no duplicate logic.
        const evt = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: cx,
          clientY: cy,
          button: 2,
        });
        target.dispatchEvent(evt);
        setPos(null);
      }}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 1600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 8px',
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 500,
        background: 'rgba(16,28,52,0.92)',
        color: 'rgba(220,235,255,0.92)',
        border: '0.5px solid rgba(80,140,255,0.28)',
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,0.28)',
        whiteSpace: 'nowrap',
      }}
    >
      <MessageSquare size={11} /> Comment
    </button>
  );
}