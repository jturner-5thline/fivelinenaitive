/**
 * Funding-source currency formatter.
 * Always renders in millions with 2 decimals, e.g. $1,000,000 → "$1.00MM",
 * $500,000 → "$0.50MM". Values ≥ 1B roll up to "$1.00B".
 */
export function formatLenderCurrency(value: number | null | undefined, fallback = ''): string {
  if (value == null || value === 0) return value === 0 ? '$0.00MM' : fallback;
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  return `${sign}$${(abs / 1_000_000).toFixed(2)}MM`;
}
