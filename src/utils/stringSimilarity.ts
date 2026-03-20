/**
 * Dice's coefficient for fuzzy string matching.
 * Returns a value between 0 (no similarity) and 1 (identical).
 */
export function diceCoefficient(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();

  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;

  const bigrams1 = new Map<string, number>();
  for (let i = 0; i < s1.length - 1; i++) {
    const bigram = s1.substring(i, i + 2);
    bigrams1.set(bigram, (bigrams1.get(bigram) || 0) + 1);
  }

  let intersectionSize = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const bigram = s2.substring(i, i + 2);
    const count = bigrams1.get(bigram) || 0;
    if (count > 0) {
      bigrams1.set(bigram, count - 1);
      intersectionSize++;
    }
  }

  return (2.0 * intersectionSize) / (s1.length - 1 + (s2.length - 1));
}

/**
 * Normalize a deal name for comparison by removing common suffixes/prefixes.
 */
export function normalizeDealName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*(inc\.?|llc|ltd\.?|corp\.?|co\.?|group|holdings?)\s*$/i, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
