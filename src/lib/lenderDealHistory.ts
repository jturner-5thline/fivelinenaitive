import { formatUSD } from '@/lib/formatters/currency';

export function formatOutsideDealAmount(amountUsd: number | null | undefined, amountText: string | null | undefined): string {
  if (amountUsd != null && !Number.isNaN(Number(amountUsd))) return formatUSD(Number(amountUsd));
  return amountText || '—';
}

/** URLs link directly; bare Gmail message ids open in Gmail. */
export function outsideDealSourceUrl(ref: string | null | undefined): string | null {
  if (!ref) return null;
  if (/^https?:\/\//i.test(ref)) return ref;
  if (/^[0-9a-f]{12,20}$/i.test(ref)) return `https://mail.google.com/mail/u/0/#all/${ref}`;
  return null;
}

export function isDuplicateError(e: { code?: string } | null | undefined): boolean {
  return e?.code === '23505';
}
