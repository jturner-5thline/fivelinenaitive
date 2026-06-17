import { useCallback, useEffect, useRef } from 'react';
import { markOverlayJustClosed } from '@/lib/overlayClickSuppression';

/**
 * Returns a function that installs document-level capture-phase event
 * suppressors for `durationMs` to swallow pointerdown/mousedown/click
 * events. This prevents a closing overlay's click from "falling through"
 * to underlying elements (e.g. Radix triggers that listen on pointerdown
 * at the capture phase in separate DOM subtrees / portals).
 *
 * Usage:
 *   const swallowClicks = useSwallowClickThrough();
 *   const handleClose = () => {
 *     swallowClicks(250, () => onClose());
 *   };
 */
export function useSwallowClickThrough(defaultDuration = 250) {
  const activeRef = useRef(false);

  useEffect(() => {
    return () => {
      activeRef.current = false;
    };
  }, []);

  return useCallback(
    (durationOrCallback?: number | (() => void), maybeCallback?: () => void) => {
      const duration =
        typeof durationOrCallback === 'number' ? durationOrCallback : defaultDuration;
      const callback =
        typeof durationOrCallback === 'function' ? durationOrCallback : maybeCallback;

      markOverlayJustClosed(duration + 150);

      const swallow = (e: Event) => {
        e.stopPropagation();
        if ((e as Event).type !== 'click') {
          e.preventDefault();
        }
      };
      const opts: AddEventListenerOptions = { capture: true };
      document.addEventListener('pointerdown', swallow, opts);
      document.addEventListener('mousedown', swallow, opts);
      document.addEventListener('click', swallow, opts);
      activeRef.current = true;
      window.setTimeout(() => {
        document.removeEventListener('pointerdown', swallow, opts);
        document.removeEventListener('mousedown', swallow, opts);
        document.removeEventListener('click', swallow, opts);
        activeRef.current = false;
        callback?.();
      }, duration);
    },
    [defaultDuration],
  );
}
