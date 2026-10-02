/**
 * Global safety net for Radix overlays (Dialog, AlertDialog, Sheet, Popover,
 * DropdownMenu, Select). While open, Radix sets `pointer-events: none` on
 * <body> and a scroll lock. If an overlay unmounts mid-animation, is closed
 * from inside another overlay, or navigates away, that lock can survive and
 * the entire app looks frozen.
 *
 * This watcher clears a stale lock whenever nothing modal is actually open.
 */
const OPEN_MODAL_SELECTOR = [
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[role="menu"][data-state="open"]',
  '[role="listbox"][data-state="open"]',
  '[data-radix-popper-content-wrapper] [data-state="open"]',
].join(',');

function anyOverlayOpen() {
  return !!document.querySelector(OPEN_MODAL_SELECTOR);
}

function clearIfStale() {
  if (anyOverlayOpen()) return;
  const body = document.body;
  if (body.style.pointerEvents === 'none') body.style.pointerEvents = '';
  if (body.hasAttribute('data-scroll-locked')) {
    body.removeAttribute('data-scroll-locked');
    body.style.removeProperty('overflow');
    body.style.removeProperty('padding-right');
    body.style.removeProperty('margin-right');
  }
}

let timer: number | undefined;
function schedule() {
  window.clearTimeout(timer);
  // Wait for Radix close animations (~200ms) before judging the lock stale.
  timer = window.setTimeout(clearIfStale, 220);
}

export function installOverlayLockWatchdog() {
  if (typeof window === 'undefined' || (window as any).__overlayWatchdog) return;
  (window as any).__overlayWatchdog = true;
  const observer = new MutationObserver(schedule);
  const start = () => {
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['style', 'data-scroll-locked'],
      childList: true,
      subtree: true,
    });
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
  // Also recover on any user click/keypress in case a mutation was missed.
  document.addEventListener('pointerup', schedule, true);
  document.addEventListener('keyup', (e) => { if (e.key === 'Escape') schedule(); }, true);
}
