export function formatUSD(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(Number(value))) return '—';
  const num = Number(value);
  const abs = Math.abs(num);
  let formatted: string;
  if (abs >= 1_000_000) {
    // $XX.XXMM with two decimals
    formatted = `$${(abs / 1_000_000).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}MM`;
  } else {
    // $XXX,XXXK with comma separators, no decimals
    formatted = `$${Math.round(abs).toLocaleString('en-US')}K`;
  }
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
