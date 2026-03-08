// Currency formatting functions for the Cash Flow Manager

/**
 * Accounting format for daily grid
 * "$1,234.56" positive, "($1,234.56)" negative, blank for zero
 */
export function fmt(val: number | null | undefined): string {
  if (val === null || val === undefined || val === 0) return '';
  const abs = Math.abs(val);
  const formatted = '$' + abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return val < 0 ? `(${formatted})` : formatted;
}

/**
 * Abbreviated format for weekly grid
 * Always one decimal for K: "$100.0K", "($45.2K)"
 * Millions: "$1.5M". Under $1K: "$500"
 * Negative in parentheses. Blank for zero.
 */
export function fmtAbbrev(val: number | null | undefined): string {
  if (val === null || val === undefined || val === 0) return '';
  const abs = Math.abs(val);
  let formatted: string;
  if (abs >= 1_000_000) {
    formatted = '$' + (abs / 1_000_000).toFixed(1) + 'M';
  } else if (abs >= 1_000) {
    formatted = '$' + (abs / 1_000).toFixed(1) + 'K';
  } else {
    formatted = '$' + abs.toFixed(0);
  }
  return val < 0 ? `(${formatted})` : formatted;
}

/**
 * KPI format — "$293K" (no decimal), "$72K"
 */
export function fmtShort(val: number | null | undefined): string {
  if (val === null || val === undefined || val === 0) return '$0';
  const abs = Math.abs(val);
  let formatted: string;
  if (abs >= 1_000_000) {
    formatted = '$' + (abs / 1_000_000).toFixed(1) + 'M';
  } else if (abs >= 1_000) {
    formatted = '$' + Math.round(abs / 1_000) + 'K';
  } else {
    formatted = '$' + abs.toFixed(0);
  }
  return val < 0 ? `-${formatted}` : formatted;
}
