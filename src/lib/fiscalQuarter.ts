/**
 * Calendar-year fiscal year + quarter helpers used by the Rep Scorecard.
 * Mirrors the SQL helper `public.deal_fiscal_bucket(ts)` so client- and
 * server-side bucketing stay in sync.
 */

export type FiscalBucket = { fiscalYear: number; fiscalQuarter: 1 | 2 | 3 | 4 };

export function fiscalBucketFromDate(input: Date | string | null | undefined): FiscalBucket | null {
  if (input == null) return null;
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return null;
  const month = d.getUTCMonth(); // 0-11
  const q = (Math.floor(month / 3) + 1) as 1 | 2 | 3 | 4;
  return { fiscalYear: d.getUTCFullYear(), fiscalQuarter: q };
}

export function bucketMatches(
  bucket: FiscalBucket | null,
  filter: { fiscalYear: number; fiscalQuarter: 1 | 2 | 3 | 4 | 'year' },
): boolean {
  if (!bucket) return false;
  if (bucket.fiscalYear !== filter.fiscalYear) return false;
  if (filter.fiscalQuarter === 'year') return true;
  return bucket.fiscalQuarter === filter.fiscalQuarter;
}

export function currentFiscalYear(): number {
  return new Date().getUTCFullYear();
}

export function currentFiscalQuarter(): 1 | 2 | 3 | 4 {
  return (Math.floor(new Date().getUTCMonth() / 3) + 1) as 1 | 2 | 3 | 4;
}