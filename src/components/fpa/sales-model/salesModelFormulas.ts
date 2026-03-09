// Formula engine: computes TEAM from individual reps + rep build addons

export function rollingSum(arr: number[], idx: number, window: number): number | null {
  if (idx < window - 1) return null;
  let sum = 0;
  for (let i = idx - window + 1; i <= idx; i++) sum += arr[i] ?? 0;
  return sum;
}

export function ytdSum(arr: number[], idx: number): number {
  const startOfYear = Math.floor(idx / 12) * 12;
  let sum = 0;
  for (let i = startOfYear; i <= idx; i++) sum += arr[i] ?? 0;
  return sum;
}

export function allTimeSum(arr: number[], idx: number): number {
  let sum = 0;
  for (let i = 0; i <= idx; i++) sum += arr[i] ?? 0;
  return sum;
}

export function safeDiv(a: number | null, b: number | null): number | null {
  if (b === null || b === 0 || a === null) return null;
  return a / b;
}

export function sumArrays(...arrs: number[][]): number[] {
  const len = Math.max(...arrs.map(a => a.length));
  return Array.from({ length: len }, (_, i) =>
    arrs.reduce((s, a) => s + (a[i] ?? 0), 0)
  );
}

export function subtractArrays(a: number[], b: number[]): number[] {
  const len = Math.max(a.length, b.length);
  return Array.from({ length: len }, (_, i) => (a[i] ?? 0) - (b[i] ?? 0));
}

export function divideArrays(a: number[], b: number[]): number[] {
  const len = Math.max(a.length, b.length);
  return Array.from({ length: len }, (_, i) => {
    const denom = b[i] ?? 0;
    return denom === 0 ? 0 : (a[i] ?? 0) / denom;
  });
}

export function computeTTM(arr: number[]): number[] {
  return arr.map((_, i) => rollingSum(arr, i, 12) ?? 0);
}

export function computeYTD(arr: number[]): number[] {
  return arr.map((_, i) => ytdSum(arr, i));
}

export function computeAllTime(arr: number[]): number[] {
  return arr.map((_, i) => allTimeSum(arr, i));
}

export function zeros(n: number): number[] {
  return new Array(n).fill(0);
}
