// BD Budget — Number formatting utilities

export function formatBDCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(Number(value))) return '—';
  const num = Number(value);
  if (num === 0) return '—';
  const abs = Math.abs(num);
  const neg = num < 0;
  let formatted: string;
  if (abs >= 1_000_000) {
    formatted = `$${(abs / 1_000_000).toFixed(1)}M`;
  } else if (abs >= 1_000) {
    formatted = `$${(abs / 1_000).toFixed(1)}K`;
  } else {
    formatted = `$${Math.round(abs)}`;
  }
  return neg ? `(${formatted})` : formatted;
}

export function formatBDPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !isFinite(Number(value))) return '—';
  const v = Number(value);
  if (v === 0) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

export function formatBDMultiple(value: number | null | undefined): string {
  if (value === null || value === undefined || !isFinite(Number(value))) return '—';
  return `${Number(value).toFixed(1)}x`;
}

export function formatBDDelta(curr: number | null, prev: number | null): { text: string; color: string } {
  if (curr === null || prev === null || prev === 0) return { text: '—', color: '' };
  const change = ((curr - prev) / Math.abs(prev)) * 100;
  if (change > 0) return { text: `+${change.toFixed(1)}% ↑`, color: '#198754' };
  if (change < 0) return { text: `${change.toFixed(1)}% ↓`, color: '#DC3545' };
  return { text: '0.0%', color: '' };
}

export function formatBDNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(Number(value))) return '—';
  const num = Number(value);
  if (num === 0) return '—';
  return num.toLocaleString('en-US');
}

export function formatBDValue(value: number | null | undefined, format: string): string {
  switch (format) {
    case 'dollar': return formatBDCurrency(value);
    case 'percent': return formatBDPct(value);
    case 'multiple': return formatBDMultiple(value);
    case 'number': return formatBDNumber(value);
    default: return String(value ?? '—');
  }
}
