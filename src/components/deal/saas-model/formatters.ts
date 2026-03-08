// Financial number formatters

export function fmtCurrency(val: number | null | undefined, compact = false): string {
  if (val === null || val === undefined || isNaN(val) || !isFinite(val)) return '—';
  
  const isNegative = val < 0;
  const abs = Math.abs(val);
  
  let formatted: string;
  if (compact) {
    if (abs >= 1_000_000_000) formatted = `$${(abs / 1_000_000_000).toFixed(1)}B`;
    else if (abs >= 1_000_000) formatted = `$${(abs / 1_000_000).toFixed(1)}M`;
    else if (abs >= 1_000) formatted = `$${(abs / 1_000).toFixed(0)}K`;
    else formatted = `$${abs.toFixed(0)}`;
  } else {
    formatted = `$${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }
  
  return isNegative ? `(${formatted})` : formatted;
}

export function fmtPct(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val) || !isFinite(val)) return '—';
  const isNegative = val < 0;
  const formatted = `${Math.abs(val).toFixed(1)}%`;
  return isNegative ? `(${formatted})` : formatted;
}

export function fmtNum(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val) || !isFinite(val)) return '—';
  return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtRatio(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val) || !isFinite(val)) return '—';
  return `${val.toFixed(1)}x`;
}

export function isNegative(val: number | null | undefined): boolean {
  return typeof val === 'number' && val < 0;
}
