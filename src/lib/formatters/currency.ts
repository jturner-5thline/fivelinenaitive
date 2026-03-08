export function formatUSD(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(Number(value))) return '—';
  const num = Number(value);
  const abs = Math.abs(num);
  const formatted = abs.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (num < 0) {
    return `(${formatted})`;
  }
  return formatted;
}

type TotalLike = number | { amount: number } | null | undefined;

export function extractAmount(value: TotalLike): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && 'amount' in value && typeof value.amount === 'number') {
    return value.amount;
  }
  return null;
}
