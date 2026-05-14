import { useCallback, useState, useMemo, type CSSProperties } from 'react';

/**
 * Captures the DOM bounds of the element that triggered a popup so the
 * popup can be animated as if it expanded from (and collapses back into)
 * that exact element — matching the deal-tile open/close motion.
 *
 * Usage:
 *   const origin = useOriginAnimation();
 *   <button onClick={(e) => { origin.capture(e); setOpen(true); }} />
 *   <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) origin.reset(); }}>
 *     <DialogContent
 *       className={origin.contentClassName}
 *       style={origin.contentStyle}
 *     />
 *   </Dialog>
 */
export function useOriginAnimation() {
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);

  const capture = useCallback((eOrEl: React.MouseEvent | HTMLElement | null) => {
    if (!eOrEl) return;
    const el =
      eOrEl instanceof HTMLElement
        ? eOrEl
        : ((eOrEl as React.MouseEvent).currentTarget as HTMLElement);
    if (!el?.getBoundingClientRect) return;
    setOriginRect(el.getBoundingClientRect());
  }, []);

  const reset = useCallback(() => setOriginRect(null), []);

  const contentStyle = useMemo<CSSProperties>(() => {
    if (!originRect) return {};
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const iconCx = originRect.left + originRect.width / 2;
    const iconCy = originRect.top + originRect.height / 2;
    return {
      // Distance from the viewport center (where centered dialogs live) to
      // the icon, so keyframes can translate the dialog into / out of it.
      ['--origin-dx' as string]: `${iconCx - cx}px`,
      ['--origin-dy' as string]: `${iconCy - cy}px`,
    };
  }, [originRect]);

  // Override Radix/shadcn's default fade+zoom with our origin-anchored
  // keyframes. `!` keeps these from being clobbered by the dialog's
  // baked-in `animate-in / animate-out` utilities.
  const contentClassName =
    '!duration-300 ' +
    'data-[state=open]:!animate-[origin-zoom-in_320ms_cubic-bezier(0.22,_1,_0.36,_1)] ' +
    'data-[state=closed]:!animate-[origin-zoom-out_240ms_cubic-bezier(0.4,_0,_0.2,_1)]';

  return { originRect, capture, reset, contentStyle, contentClassName };
}