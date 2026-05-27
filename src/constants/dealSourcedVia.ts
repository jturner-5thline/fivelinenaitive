/**
 * Single source of truth for the "Sourced Via" field used on Deals.
 * Consumed by the New Deal / Build a Deal form AND the Deals filter panel
 * so the option list stays in sync automatically.
 */
export const DEAL_SOURCED_VIA_OPTIONS = [
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

export type DealSourcedVia = (typeof DEAL_SOURCED_VIA_OPTIONS)[number];