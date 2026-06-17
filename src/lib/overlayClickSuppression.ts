import type React from 'react';

const DEFAULT_SUPPRESSION_MS = 400;

let suppressUntil = 0;

const OVERLAY_OR_PORTAL_SELECTOR = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[data-radix-portal]',
  '[data-radix-dialog-overlay]',
  '[data-radix-dialog-content]',
  '[data-radix-dropdown-menu-content]',
  '[data-radix-popover-content]',
  '[data-overlay-root]',
].join(',');

export function markOverlayJustClosed(durationMs = DEFAULT_SUPPRESSION_MS) {
  suppressUntil = Math.max(suppressUntil, Date.now() + durationMs);
}

export function isOverlayClickSuppressed() {
  return Date.now() < suppressUntil;
}

export function shouldIgnoreOverlayOriginEvent(
  event: Event | React.SyntheticEvent,
  currentTarget?: HTMLElement | null,
) {
  if (isOverlayClickSuppressed()) return true;

  const target = 'target' in event ? event.target : null;
  if (!(target instanceof Element)) return false;

  const overlayAncestor = target.closest(OVERLAY_OR_PORTAL_SELECTOR);
  if (!overlayAncestor) return false;

  return !currentTarget || !currentTarget.contains(overlayAncestor);
}