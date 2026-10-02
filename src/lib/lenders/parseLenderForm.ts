/** Parse form numbers like "$10,000,000" or "10MM" safely; returns null when empty/invalid. */
export function parseMoney(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;
  let mult = 1;
  if (/(mm|m)$/.test(raw)) mult = 1_000_000;
  else if (/b$/.test(raw)) mult = 1_000_000_000;
  else if (/k$/.test(raw)) mult = 1_000;
  const cleaned = raw.replace(/[^0-9.\-]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned) * mult;
  return Number.isFinite(n) ? n : null;
}

/** Accept comma strings or arrays and return a clean string list. */
export function toList(value: unknown): string[] {
  if (value == null) return [];
  const parts = Array.isArray(value) ? value : String(value).split(',');
  return parts.map((p) => String(p ?? '').trim()).filter(Boolean);
}
