export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(n, max));
}

function isUsableRect(rect: Pick<DOMRectReadOnly, 'top' | 'left' | 'width' | 'height'> | null | undefined) {
  return !!rect
    && Number.isFinite(rect.top)
    && Number.isFinite(rect.left)
    && (rect.width > 0 || rect.height > 0);
}

export function getTrueScrollContainer(start: HTMLElement | null, fallback: HTMLElement | null) {
  let node = start;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;
    const allowsScroll = /(auto|scroll|overlay)/.test(`${overflowY} ${overflowX}`);
    const hasScrollableContent = node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth;
    if (allowsScroll && hasScrollableContent) return node;
    node = node.parentElement;
  }
  return fallback || (document.scrollingElement as HTMLElement | null) || document.documentElement;
}

export function getSelectionAnchorRect(range: Range, fallbackElement?: HTMLElement | null) {
  const rects = Array.from(range.getClientRects())
    .filter(rect => isUsableRect(rect))
    .sort((a, b) => a.top - b.top || a.left - b.left);

  if (rects.length > 0) {
    return {
      rect: rects[0],
      source: 'clientRects:first-nonzero',
      rectCount: rects.length,
    } as const;
  }

  const fallbackRect = fallbackElement?.getBoundingClientRect();
  if (isUsableRect(fallbackRect)) {
    return {
      rect: fallbackRect,
      source: 'fallbackElement:getBoundingClientRect',
      rectCount: 0,
    } as const;
  }

  const boundingRect = range.getBoundingClientRect();
  if (isUsableRect(boundingRect)) {
    return {
      rect: boundingRect,
      source: 'boundingClientRect:fallback',
      rectCount: 0,
    } as const;
  }

  return {
    rect: null,
    source: 'no-usable-rect',
    rectCount: 0,
  } as const;
}

export function computeSelectionBubblePosition({
  host,
  rangeRect,
  bubbleHeight,
  bubbleWidth,
  offset = 8,
}: {
  host: HTMLElement;
  rangeRect: DOMRectReadOnly;
  bubbleHeight: number;
  bubbleWidth: number;
  offset?: number;
}) {
  const containerRect = host.getBoundingClientRect();
  let top = (rangeRect.top - containerRect.top) + host.scrollTop - bubbleHeight - offset;
  if (top < host.scrollTop + 8) {
    top = (rangeRect.bottom - containerRect.top) + host.scrollTop + offset;
  }
  const minTop = host.scrollTop + 8;
  const maxTop = Math.max(minTop, host.scrollTop + host.clientHeight - bubbleHeight - 8);
  top = clamp(top, minTop, maxTop);

  const minLeft = host.scrollLeft + 8;
  const maxLeft = Math.max(minLeft, host.scrollLeft + host.clientWidth - bubbleWidth - 8);
  const left = clamp((rangeRect.left - containerRect.left) + host.scrollLeft, minLeft, maxLeft);

  return { top, left, containerRect };
}