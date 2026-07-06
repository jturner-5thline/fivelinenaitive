/**
 * Post-processing for assembled copilot streamed responses.
 *
 * Two concerns handled here:
 *
 * 1) The LLM occasionally re-states the same section twice in one message —
 *    e.g. "Pipeline Summary" followed by "Pipeline Breakdown by Stage" with
 *    identical bullets, or two near-identical "I've prepared the updates…"
 *    confirmation paragraphs back-to-back. We detect near-duplicate
 *    paragraphs by token-set Jaccard similarity > 0.85 and drop the later
 *    occurrence. The earlier section wins so headings stay near the top.
 *
 * 2) Money formatting drift. The model sometimes emits "$146.75M" and
 *    "$146.75MM" in the same answer. Project-wide convention is the
 *    double-M form for millions (see formatUSD). We normalize any
 *    `$<num>M` that isn't already followed by `M` (or a letter that would
 *    make it part of a different word) to `$<num>MM`.
 */

function tokenSet(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9$%.\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Replace bare "$N.NNM" / "$N M" with "$N.NNMM" for millions. */
export function normalizeMoneyFormatting(input: string): string {
  // Match $<digits with optional decimal> M, ensuring not already MM/letter.
  return input.replace(/(\$\d[\d,]*(?:\.\d+)?)M(?![a-zA-Z])/g, '$1MM');
}

/**
 * Remove later paragraphs that are near-duplicates of earlier ones.
 * "Paragraph" = run of lines separated by a blank line.
 * Threshold tuned conservatively (0.85) so we don't strip legitimate
 * follow-ups that merely repeat a deal/lender name.
 */
export function dedupeParagraphs(input: string, threshold = 0.7): string {
  const paragraphs = input.split(/\n\s*\n/);
  if (paragraphs.length < 2) return input;
  const kept: string[] = [];
  const keptTokens: Set<string>[] = [];
  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (!trimmed) {
      kept.push(p);
      keptTokens.push(new Set());
      continue;
    }
    const tokens = tokenSet(trimmed);
    // Skip very short paragraphs (likely headers or single-word lines) —
    // similarity scoring is noisy for them.
    if (tokens.size < 6) {
      kept.push(p);
      keptTokens.push(tokens);
      continue;
    }
    let isDup = false;
    for (const prev of keptTokens) {
      if (prev.size < 6) continue;
      // Use overlap coefficient (intersection / min size) — more forgiving
      // than Jaccard for the common LLM failure mode where the second
      // paragraph repeats the same data list under a different heading
      // (only the heading tokens differ, so Jaccard drops below 0.85
      // even though >90% of the data is duplicated). Threshold tuned
      // on real "Pipeline Summary" vs "Pipeline Breakdown" cases.
      let inter = 0;
      for (const t of tokens) if (prev.has(t)) inter++;
      const overlap = inter / Math.min(tokens.size, prev.size);
      if (overlap >= 0.85 || jaccard(tokens, prev) >= threshold) {
        isDup = true;
        break;
      }
    }
    if (!isDup) {
      kept.push(p);
      keptTokens.push(tokens);
    }
  }
  // Collapse runs of empty paragraphs left behind by removals.
  return kept.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function cleanupCopilotResponse(input: string): string {
  if (!input) return input;
  return stripContradictoryCounts(dedupeParagraphs(normalizeMoneyFormatting(input)));
}

/**
 * Safety net for the "how many deals does X manage/own" failure mode where
 * the model emits two sentences with different counts for the same person
 * in a single reply (e.g. "Niki manages 8 active deals" followed by
 * "Niki manages 0 active deals"). We detect matching subject+verb
 * statements with different numeric counts and keep only the LAST
 * occurrence — that matches the server-side authority block which is
 * injected last and is the verified figure.
 */
export function stripContradictoryCounts(input: string): string {
  if (!input) return input;
  // Capture: 1=name, 2=verb, 3=count. Allow "active" between.
  const re = /\b([A-Z][A-Za-z .'\-]{1,60}?)\s+(manages?|owns?|handles?|runs?)\s+(\d+)\s+(?:active\s+)?deals?\b/g;
  const hits: Array<{ start: number; end: number; key: string; count: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    const key = `${m[1].toLowerCase().trim()}|${m[2].toLowerCase().replace(/s$/, "")}`;
    hits.push({ start: m.index, end: m.index + m[0].length, key, count: m[3] });
  }
  if (hits.length < 2) return input;
  // Group by subject+verb; if counts differ, drop every occurrence except the last.
  const byKey = new Map<string, typeof hits>();
  for (const h of hits) {
    const arr = byKey.get(h.key) ?? [];
    arr.push(h);
    byKey.set(h.key, arr);
  }
  const toRemove: Array<{ start: number; end: number }> = [];
  for (const arr of byKey.values()) {
    if (arr.length < 2) continue;
    const counts = new Set(arr.map((x) => x.count));
    if (counts.size < 2) continue; // consistent — leave alone
    // Drop every occurrence except the last (authority-aligned).
    for (let i = 0; i < arr.length - 1; i++) {
      // Expand to the enclosing sentence for a clean removal.
      const h = arr[i];
      let s = h.start;
      while (s > 0 && !/[.!?\n]/.test(input[s - 1])) s--;
      let e = h.end;
      while (e < input.length && !/[.!?\n]/.test(input[e])) e++;
      if (e < input.length) e++; // consume the punctuation
      toRemove.push({ start: s, end: e });
    }
  }
  if (toRemove.length === 0) return input;
  toRemove.sort((a, b) => b.start - a.start);
  let out = input;
  for (const r of toRemove) out = out.slice(0, r.start) + out.slice(r.end);
  return out.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}