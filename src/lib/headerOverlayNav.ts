/**
 * Header pop-up swipe navigation — direction state.
 *
 * The floating header opens several overlays (Calendar, Mail, Approval Queue,
 * Tasks, Deal Rundown, optional Dashboard / Daily Rundown / Niki's Daily
 * Rundown). They're all separate components mounted via Radix Dialog, so
 * threading "which direction did the user move?" through every overlay
 * would be invasive. Instead we stamp `<html data-header-overlay-dir>`
 * with the travel direction for the duration of the swap, and a few CSS
 * rules in `index.css` translate that into a directional slide animation
 * on whichever Radix dialog is currently mounting / unmounting.
 *
 * The data attribute is auto-cleared after the slide window so subsequent
 * stand-alone opens (e.g. from the deals page) revert to the default
 * Radix zoom/fade.
 */

export type HeaderOverlayDir = 'left' | 'right';

const CLEAR_AFTER_MS = 360;

let clearTimer: number | null = null;

export function setHeaderOverlayDirection(dir: HeaderOverlayDir | null) {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  if (clearTimer) {
    window.clearTimeout(clearTimer);
    clearTimer = null;
  }
  if (!dir) {
    delete el.dataset.headerOverlayDir;
    return;
  }
  el.dataset.headerOverlayDir = dir;
  clearTimer = window.setTimeout(() => {
    delete el.dataset.headerOverlayDir;
    clearTimer = null;
  }, CLEAR_AFTER_MS);
}

export function getHeaderOverlayDirection(): HeaderOverlayDir | null {
  if (typeof document === 'undefined') return null;
  const v = document.documentElement.dataset.headerOverlayDir;
  return v === 'left' || v === 'right' ? v : null;
}