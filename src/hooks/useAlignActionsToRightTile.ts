import { useEffect, type RefObject } from 'react';

/**
 * Spreads the Deals header action buttons evenly across the width of the
 * right-most deal tile in the first row: first button's left edge on the
 * tile's left border, last button's right edge on the tile's right border.
 * Falls back to the default right-aligned cluster when fewer than 3 tiles
 * share the top row.
 */
export function useAlignActionsToRightTile(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    let last = '';
    const reset = (el: HTMLElement, buttons: HTMLElement[]) => {
      el.style.position = '';
      el.style.left = '';
      el.style.top = '';
      el.style.width = '';
      el.style.transform = '';
      buttons.forEach((b) => (b.style.marginLeft = ''));
      el.querySelectorAll<HTMLElement>('.flex').forEach((w) => (w.style.gap = ''));
      el.style.gap = '';
    };
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      const buttons = Array.from(el.querySelectorAll<HTMLElement>('button')).filter(
        (b) => b.offsetWidth > 0 && !b.parentElement?.closest('button'),
      );
      const rects = Array.from(document.querySelectorAll('.deal-tile'))
        .map((t) => (t as HTMLElement).getBoundingClientRect())
        .filter((r) => r.width > 50 && r.height > 0);
      let tile: DOMRect | null = null;
      if (rects.length) {
        const top = Math.min(...rects.map((r) => r.top));
        const row = rects.filter((r) => Math.abs(r.top - top) < 4).sort((a, b) => a.left - b.left);
        if (row.length >= 3) tile = row[row.length - 1];
      }
      if (!tile || buttons.length < 2) {
        if (last !== 'none') { reset(el, buttons); last = 'none'; }
        return;
      }
      const left = Math.round(tile.left);
      const width = Math.round(tile.width);
      const total = buttons.reduce((s, b) => s + b.offsetWidth, 0);
      const gap = Math.max(4, (width - total) / (buttons.length - 1));
      const key = `${left}|${width}|${total}|${buttons.length}`;
      if (key === last) return;
      last = key;
      el.style.position = 'fixed';
      el.style.top = '16px';
      el.style.left = `${left}px`;
      el.style.width = `${width}px`;
      el.style.transform = 'none';
      el.style.gap = '0px';
      el.querySelectorAll<HTMLElement>('.flex').forEach((w) => (w.style.gap = '0px'));
      buttons.forEach((b, i) => (b.style.marginLeft = i === 0 ? '0px' : `${gap}px`));
    };
    measure();
    window.addEventListener('resize', measure);
    const id = window.setInterval(measure, 500);
    return () => {
      window.removeEventListener('resize', measure);
      window.clearInterval(id);
    };
  }, [ref]);
}
