/**
 * Deal-detail carousel navigation direction state.
 *
 * When the user navigates between sibling deals via the floating left/right
 * arrows (DealDetailSideNavigation), we stash the travel direction on
 * <html data-deal-carousel-dir> for the duration of the next mount so the
 * DealDetail page can play a directional slide-in animation.
 *
 * We also expose a short navigation lock to prevent rapid double-triggers
 * from queuing overlapping transitions.
 */

export type DealCarouselDir = 'left' | 'right';

const CLEAR_AFTER_MS = 360;
const LOCK_MS = 300;

let clearTimer: number | null = null;
let locked = false;
let lockTimer: number | null = null;

export function setDealCarouselDirection(dir: DealCarouselDir | null) {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  if (clearTimer) {
    window.clearTimeout(clearTimer);
    clearTimer = null;
  }
  if (!dir) {
    delete el.dataset.dealCarouselDir;
    return;
  }
  el.dataset.dealCarouselDir = dir;
  clearTimer = window.setTimeout(() => {
    delete el.dataset.dealCarouselDir;
    clearTimer = null;
  }, CLEAR_AFTER_MS);
}

export function getDealCarouselDirection(): DealCarouselDir | null {
  if (typeof document === 'undefined') return null;
  const v = document.documentElement.dataset.dealCarouselDir;
  return v === 'left' || v === 'right' ? v : null;
}

export function isDealCarouselLocked(): boolean {
  return locked;
}

export function lockDealCarousel() {
  locked = true;
  if (lockTimer) window.clearTimeout(lockTimer);
  lockTimer = window.setTimeout(() => {
    locked = false;
    lockTimer = null;
  }, LOCK_MS);
}
