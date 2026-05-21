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
export function dedupeParagraphs(input: string, threshold = 0.85): string {
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
      if (jaccard(tokens, prev) >= threshold) {
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
  return dedupeParagraphs(normalizeMoneyFormatting(input));
}