import { useEffect, useState } from 'react';

/**
 * Returns true whenever any Radix Dialog / AlertDialog / Sheet is open in the
 * document. Used by floating bottom-corner launchers (naitive orb, AI search
 * blob, copilot drawer trigger, etc.) to hide while a dashboard widget pop-up
 * is open so they don't overlap or steal taps.
 */
export function useAnyDialogOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const check = () => {
      const el = document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'
      );
      setOpen(!!el);
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state', 'role'],
    });
    return () => observer.disconnect();
  }, []);

  return open;
}