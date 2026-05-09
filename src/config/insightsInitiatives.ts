/**
 * Configuration for the Insights Dashboard "Initiatives" section.
 *
 * The Initiatives section sources its data from an Asana Portfolio.
 * If the portfolio is renamed, deleted, or replaced, update
 * `INITIATIVES_DEFAULT_PORTFOLIO_GID` here — no other code change needed.
 *
 * Add prior/broken portfolio GIDs to `INITIATIVES_LEGACY_PORTFOLIO_GIDS`
 * so any stored user preferences pointing at them are auto-migrated to
 * the current default on next load.
 */

// "2026 Initiatives" portfolio in the 5th Line Asana workspace.
// Source: GET /portfolios?workspace=402875225691221&owner=me
export const INITIATIVES_DEFAULT_PORTFOLIO_GID = '1212153040575217';

// Previously-used GIDs that returned 404 / were deleted or renamed.
// Stored localStorage prefs matching any of these are reset to the default.
export const INITIATIVES_LEGACY_PORTFOLIO_GIDS = [
  '1212153276296112',
  '1212153276296114',
];

export const INITIATIVES_PORTFOLIO_PREF_KEY = 'qir.initiatives.portfolioGid';