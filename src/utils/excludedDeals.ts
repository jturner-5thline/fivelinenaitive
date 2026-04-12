/**
 * Globally excluded deal names.
 * These deals are filtered out of all metrics, dashboards, and reporting.
 */
const EXCLUDED_DEAL_NAMES = new Set([
  "test - niki's store",
  'example deal',
]);

/**
 * Returns true if a deal name should be excluded from metrics.
 */
export function isExcludedDealName(name: string | null | undefined): boolean {
  if (!name) return false;
  const normalized = name.toLowerCase().trim();
  if (EXCLUDED_DEAL_NAMES.has(normalized)) return true;
  if (normalized === 'test' || normalized.startsWith('test ')) return true;
  return false;
}
