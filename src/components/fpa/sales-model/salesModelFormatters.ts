export function formatDollar(v: number | null | undefined): string {
  if (v === null || v === undefined || v === 0) return '—';
  const abs = Math.abs(v);
  const neg = v < 0;
  let formatted: string;
  if (abs >= 1_000_000) {
    formatted = `$${(abs / 1_000_000).toFixed(1)}MM`;
  } else if (abs >= 1_000) {
    formatted = `$${Math.round(abs).toLocaleString()}`;
  } else {
    formatted = `$${Math.round(abs).toLocaleString()}`;
  }
  return neg ? `(${formatted})` : formatted;
}

export function formatDollarK(v: number | null | undefined): string {
  if (v === null || v === undefined || v === 0) return '—';
  const abs = Math.abs(v);
  const neg = v < 0;
  let formatted: string;
  if (abs >= 1_000_000) {
    formatted = `$${(abs / 1_000_000).toFixed(1)}MM`;
  } else if (abs >= 1_000) {
    formatted = `$${(abs / 1_000).toFixed(0)}K`;
  } else {
    formatted = `$${Math.round(abs)}`;
  }
  return neg ? `(${formatted})` : formatted;
}

export function formatCount(v: number | null | undefined): string {
  if (v === null || v === undefined || v === 0) return '—';
  return Math.round(v).toLocaleString();
}

export function formatPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  if (v === 0) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

export function formatMultiple(v: number | null | undefined): string {
  if (v === null || v === undefined || v === 0) return '—';
  return `${v.toFixed(2)}x`;
}

export function getMonthLabels(): string[] {
  const labels: string[] = [];
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  for (let y = 2025; y <= 2027; y++) {
    for (let m = 0; m < 12; m++) {
      labels.push(`${monthNames[m]} ${String(y).slice(2)}`);
    }
  }
  return labels;
}

export function getQuarterLabels(): string[] {
  const labels: string[] = [];
  for (let y = 2025; y <= 2027; y++) {
    labels.push(`Q1-${y}`, `Q2-${y}`, `Q3-${y}`, `Q4-${y}`, `FY ${y}`);
  }
  return labels;
}

export function getYears(): number[] {
  const years: number[] = [];
  for (let y = 2025; y <= 2027; y++) {
    for (let m = 0; m < 12; m++) years.push(y);
  }
  return years;
}

export function getQuarters(): string[] {
  const q: string[] = [];
  const qNames = ['Q1','Q2','Q3','Q4'];
  for (let y = 2025; y <= 2027; y++) {
    for (let m = 0; m < 12; m++) {
      q.push(`${qNames[Math.floor(m/3)]}-${y}`);
    }
  }
  return q;
}

export function getActualsForecast(cutoffMonth = 13): string[] {
  return Array.from({ length: 36 }, (_, i) => i < cutoffMonth ? 'Actuals' : 'Forecast');
}

export function aggregateToQuarterly(monthly: number[], method: 'sum' | 'last' = 'sum'): number[] {
  const result: number[] = [];
  for (let y = 0; y < 3; y++) {
    for (let q = 0; q < 4; q++) {
      const start = y * 12 + q * 3;
      const slice = monthly.slice(start, start + 3);
      if (method === 'sum') {
        result.push(slice.reduce((a, b) => a + b, 0));
      } else {
        result.push(slice[slice.length - 1] ?? 0);
      }
    }
    // Full Year
    const yearSlice = monthly.slice(y * 12, y * 12 + 12);
    result.push(method === 'sum' ? yearSlice.reduce((a, b) => a + b, 0) : yearSlice[yearSlice.length - 1] ?? 0);
  }
  return result;
}
