/**
 * Single source of truth for the DealDetail dynamic import.
 *
 * Centralizing the `import('@/pages/DealDetail')` call ensures Vite emits
 * exactly one chunk for the (very large) DealDetail page and that every
 * caller — the `/deal/:id` route, the kanban deal overlay, hover-preload
 * hooks, idle-time preloaders — shares the same in-flight promise.
 *
 * `preloadDealDetail()` is safe to call repeatedly; the second and later
 * invocations are no-ops once the chunk is loaded (or in-flight).
 */
let dealDetailPromise: Promise<typeof import('@/pages/DealDetail')> | null = null;

export function loadDealDetail() {
  if (!dealDetailPromise) {
    dealDetailPromise = import('@/pages/DealDetail');
  }
  return dealDetailPromise;
}

/** Fire-and-forget preload — never throws. Use on hover / idle. */
export function preloadDealDetail(): void {
  try {
    void loadDealDetail();
  } catch {
    /* preload failures are non-fatal */
  }
}