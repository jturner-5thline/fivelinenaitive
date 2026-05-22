import type { Deal } from '@/types/deal';

// Substring keywords (lowercased, hyphens/underscores stripped) that mark a
// deal as inactive. Stage values in the DB are inconsistent — some are slugs
// (`closed-won`, `fs-churned`, `on-hold`), others are human display strings
// (`Closed won`, `Do Not Contact / Dead Deal`, `Client Paused Deal`,
// `Closed Out / Not a Fit`, `Unqualified`, `dormant`). Match by normalized
// keyword so every variant is excluded.
const INACTIVE_STAGE_KEYWORDS = [
  'closed',          // closed-won, closed-lost, Closed Out / Not a Fit, fs-closed-*
  'lost',
  'won',
  'hold',            // on-hold, On Hold, Deal/Diligence Paused/On Hold
  'paused',          // Client Paused Deal
  'dead',            // Do Not Contact / Dead Deal
  'do not contact',
  'unqualified',
  'dormant',
  'churn',           // fs-churned
  'not a fit',
  'archived',
];
const INACTIVE_STATUSES = new Set(['archived', 'closed lost', 'on hold']);

const normalize = (s: unknown) =>
  String(s ?? '').toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Single source of truth for "Active Deal" — used by the /deals Active KPI,
 * task-deal pickers, and any other surface that needs to scope to deals
 * still in the working pipeline. Excludes Closed Won/Lost, On Hold,
 * Dead/Do Not Contact, Unqualified, Dormant, Churned, Archived.
 */
export function isActiveDeal(deal: Pick<Deal, 'stage' | 'status'>): boolean {
  const status = normalize(deal.status);
  if (INACTIVE_STATUSES.has(status)) return false;
  const stage = normalize(deal.stage);
  if (!stage) return true;
  return !INACTIVE_STAGE_KEYWORDS.some(k => stage.includes(k));
}