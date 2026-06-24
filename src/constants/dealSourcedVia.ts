/**
 * Default options for the "Sourced Via" field used on Deals.
 * The active list per workspace lives in `company_settings.deal_sourced_via_options`
 * and is exposed via `useDealSourcedViaOptions()`. This constant is used as the
 * fallback when a company has not customized the list yet.
 */
export const DEFAULT_DEAL_SOURCED_VIA_OPTIONS = [
  'Email Campaign',
  'LinkedIn Campaign',
  'Inbound',
  'Paid',
  'Outsourced Sales Group',
  'Internal',
  'Event',
  'Channel Partner',
  'Referral - Bank',
  'Referral - Lender',
  'Referral - Service Provider',
  'Referral - Client',
  'Referral - Personal Connection',
] as const;

/** @deprecated Use `useDealSourcedViaOptions()` for the workspace-configurable list. */
export const DEAL_SOURCED_VIA_OPTIONS = DEFAULT_DEAL_SOURCED_VIA_OPTIONS;

export type DealSourcedVia = (typeof DEFAULT_DEAL_SOURCED_VIA_OPTIONS)[number];