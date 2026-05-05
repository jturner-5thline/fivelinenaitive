/**
 * Demo account gating.
 *
 * The "demo" experience is scoped to the company that owns the
 * demo@5thline.co user. Every member of that company sees the demo
 * UI overrides (curated counts, hidden tabs, hidden Activity Timeline /
 * Benchmarks panels, no beta tags, no missing-doc / outstanding-item
 * alerts) AND triggers a UI-state reset on every login.
 *
 * We hard-code the company id here so the gate is decided synchronously
 * (no extra round-trip needed before rendering protected sections).
 * Production tenants are never affected.
 */

export const DEMO_COMPANY_ID = '6114fade-e101-4dfa-9159-9870135832df';
export const DEMO_PRIMARY_EMAIL = 'demo@5thline.co';

export const DEMO_STALE_LIMIT = 3;
export const DEMO_FLAGGED_LIMIT = 3;
export const DEMO_NOTIFICATION_LIMIT = 2;

export function isDemoCompanyId(companyId: string | null | undefined): boolean {
  return !!companyId && companyId === DEMO_COMPANY_ID;
}

/**
 * localStorage / sessionStorage keys that hold per-user dashboard, deal
 * and tasks UI state. Wiped on every login for the demo company so each
 * demo session starts from defaults.
 */
export const DEMO_RESET_LOCALSTORAGE_PREFIXES = [
  // Dashboard / widgets
  'dashboard-',
  'widgets-',
  'analytics-layout-mode',
  // Deals page
  'deals-view-mode',
  'dealsFilter',
  'deals-filters',
  'deals-sort',
  'deals-saved-view',
  'pipelineFilters',
  'pipeline-filters',
  'timeline-visible-deals',
  // Deal detail (per-deal panels / tab memory)
  'dealDetailViewPrefs',
  'deal-suggestions-panel-open',
  'deal-research-panel-open',
  'deal-assistant-panel-open',
  'deal-activity-summary-open',
  'data-mapping-panel-ratio',
  'data-mapping-zoom',
  // Tasks
  'tasks-filters',
  'tasks-grouping',
  'tasks-view-mode',
  'tasks-sort',
] as const;

const DEMO_RESET_FLAG = 'naitive_demo_reset_done';

/**
 * Reset persisted UI state for the demo account. Idempotent within a
 * single browser session — guarded by a sessionStorage flag so we don't
 * thrash storage on every render after login.
 */
export function resetDemoUiState(): void {
  try {
    if (sessionStorage.getItem(DEMO_RESET_FLAG) === 'true') return;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (DEMO_RESET_LOCALSTORAGE_PREFIXES.some(p => key.startsWith(p))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    sessionStorage.setItem(DEMO_RESET_FLAG, 'true');
  } catch {
    // sessionStorage / localStorage may be unavailable in some contexts.
  }
}

/** Clears the per-session "already reset" guard so the next login resets again. */
export function clearDemoResetFlag(): void {
  try {
    sessionStorage.removeItem(DEMO_RESET_FLAG);
  } catch {
    // ignore
  }
}