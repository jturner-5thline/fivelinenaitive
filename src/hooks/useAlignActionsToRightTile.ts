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
      el.style.right = '';
      el.style.top = '';
      el.style.width = '';
      el.style.transform = '';
      buttons.forEach((b) => {
        b.style.marginLeft = ''; b.style.width = ''; b.style.minWidth = ''; b.style.gap = ''; b.style.paddingLeft = ''; b.style.paddingRight = ''; b.style.justifyContent = ''; b.style.borderRadius = ''; b.style.fontSize = '';
        b.querySelectorAll<SVGElement>('svg').forEach((svg) => { svg.style.display = ''; });
      });
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
        // Ignore tiles outside the viewport (e.g. off-screen pipeline columns),
        // otherwise the buttons get pushed off the right edge of the screen.
        .filter((r) => r.width > 50 && r.height > 0 && r.left >= 0 && r.right <= window.innerWidth);
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
      const gap = 8;
      // Buttons take half the tile width, anchored to the tile's right edge.
      const width = Math.round(tile.width / 2);
      const left = Math.round(tile.right - width);
      const each = Math.max(0, (width - gap * (buttons.length - 1)) / buttons.length);
      const key = `${left}|${width}|${buttons.length}`;
      if (key === last) return;
      last = key;
      el.style.position = 'fixed';
      el.style.top = '16px';
      el.style.left = `${left}px`;
      el.style.right = 'auto';
      el.style.width = `${width}px`;
      el.style.transform = 'none';
      el.style.gap = '0px';
      el.querySelectorAll<HTMLElement>('.flex').forEach((w) => (w.style.gap = '0px'));
      // Tiered sizing so labels always fit inside the button borders.
      const tier = each >= 96 ? 'wide' : each >= 76 ? 'medium' : 'compact';
      const pad = tier === 'wide' ? 10 : tier === 'medium' ? 6 : 4;
      const font = tier === 'wide' ? 12 : 11;
      buttons.forEach((b, i) => {
        b.style.marginLeft = i === 0 ? '0px' : `${gap}px`;
        b.style.width = `${each}px`;
        b.style.minWidth = '0px';
        b.style.height = '40px';
        b.style.paddingLeft = `${pad}px`;
        b.style.paddingRight = `${pad}px`;
        b.style.gap = tier === 'wide' ? '6px' : '4px';
        b.style.justifyContent = 'center';
        b.style.borderRadius = '8px';
        b.style.fontSize = `${font}px`;
        b.querySelectorAll<SVGElement>('svg').forEach((svg) => {
          const isChevron = svg.classList.contains('lucide-chevron-down');
          svg.style.flexShrink = '0';
          svg.style.display = isChevron && tier !== 'wide' ? 'none' : '';
        });
        b.querySelectorAll<HTMLElement>(':scope > span').forEach((s) => {
          if (s.classList.contains('notif-count')) return;
          s.style.display = 'inline-block';
          s.style.minWidth = '0px';
          s.style.overflow = 'hidden';
          s.style.textOverflow = 'ellipsis';
          s.style.whiteSpace = 'nowrap';
        });
      });
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
