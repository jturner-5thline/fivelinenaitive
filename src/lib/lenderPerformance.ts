export type PerformanceDimension = { key: string; score: number | null; driver: string | null };

/** Turn the stored dimensions object into display rows, ignoring malformed entries. */
export function parsePerformanceDimensions(dimensions: unknown): PerformanceDimension[] {
  if (!dimensions || typeof dimensions !== 'object' || Array.isArray(dimensions)) return [];
  return Object.entries(dimensions as Record<string, unknown>).map(([key, v]) => {
    const o = (v && typeof v === 'object' ? v : {}) as { score?: unknown; driver?: unknown };
    const score = typeof o.score === 'number' && Number.isFinite(o.score) ? Math.max(0, Math.min(100, Math.round(o.score))) : null;
    return { key, score, driver: typeof o.driver === 'string' ? o.driver : null };
  });
}

export function dimensionLabel(key: string) {
  return key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
