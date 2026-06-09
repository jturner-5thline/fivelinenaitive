import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare } from 'lucide-react';
import {
  computeSelectionBubblePosition,
  getSelectionAnchorRect,
  getTrueScrollContainer,
} from '@/components/insights/comments/selectionBubblePosition';

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
  const [pos, setPos] = useState<{ left: number; top: number; target: HTMLElement; host: HTMLElement } | null>(null);
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
      const focusNode = range.endContainer;
      const focusEl = (focusNode && (focusNode.nodeType === 1 ? focusNode : focusNode.parentElement)) as HTMLElement | null;
      const { rect: rangeRect, source: rectSource, rectCount } = getSelectionAnchorRect(range, anchor);
      if (!rangeRect) { setPos(null); return; }
      const host = getTrueScrollContainer(focusEl || anchor, root);
      if (!host) { setPos(null); return; }
      if (window.getComputedStyle(host).position === 'static') host.style.position = 'relative';
      const { top, left, containerRect } = computeSelectionBubblePosition({
        host,
        rangeRect,
        bubbleHeight: 26,
        bubbleWidth: 120,
        offset: 8,
      });
      console.log('[SurfaceSelectionBubble] selection bubble position', {
        host: {
          tagName: host.tagName,
          className: host.className,
          clientHeight: host.clientHeight,
          scrollHeight: host.scrollHeight,
          clientWidth: host.clientWidth,
          scrollWidth: host.scrollWidth,
          offsetParentTag: (host.offsetParent as HTMLElement | null)?.tagName ?? null,
          offsetParentClassName: (host.offsetParent as HTMLElement | null)?.className ?? null,
        },
        rangeRect: { top: rangeRect.top, left: rangeRect.left, right: rangeRect.right, bottom: rangeRect.bottom, width: rangeRect.width, height: rangeRect.height },
        containerRect: { top: containerRect.top, left: containerRect.left, right: containerRect.right, bottom: containerRect.bottom, width: containerRect.width, height: containerRect.height },
        scrollTop: host.scrollTop,
        scrollLeft: host.scrollLeft,
        top,
        left,
        rectSource,
        rectCount,
        strategy: 'true-scroll-container-absolute',
      });
      setPos({ left, top, target: anchor, host });
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
    const onScroll = () => compute();

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

  return createPortal(
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
        let cx = pos.left;
        let cy = pos.top + 12;
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          const { rect } = getSelectionAnchorRect(range, pos.target);
          if (rect) {
            cx = rect.right;
            cy = rect.bottom;
          }
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
        position: 'absolute',
        left: pos.left,
        top: pos.top,
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
    </button>,
    pos.host,
  );
}