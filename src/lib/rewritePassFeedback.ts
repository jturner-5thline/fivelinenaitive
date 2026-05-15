import { sendClaudeMessage } from '@/services/claude';

export interface PassFeedbackInput {
  /** Lender name — used as the lookup key in the returned map. */
  name: string;
  /** Structured pass reason (already client-safe). */
  reason: string;
  /** Raw lender notes / pass note (may include HTML, internal shorthand, etc.). */
  notes: string;
}

const MIN_NOTE_CHARS = 8;

/**
 * Translate raw internal lender pass notes into a short, client-friendly
 * "Key Feedback" line for the Status Report's Passed Lender Reasons table.
 *
 * - Returns an entry for every input item, even when the rewrite is skipped
 *   (in that case the value is an empty string). Callers should treat the
 *   absence of a key as "still loading" and an explicit empty string as
 *   "intentionally blank — notes too thin to support a rewrite".
 * - Never invents facts. Preserves substance, softens phrasing.
 */
export async function rewritePassedFeedback(
  items: PassFeedbackInput[],
  dealId?: string,
): Promise<Record<string, string>> {
  if (!items || items.length === 0) return {};

  const cleaned = items.map((it) => {
    const stripped = (it.notes || '')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return { ...it, cleanNotes: stripped };
  });

  // Pre-mark thin/empty entries as intentionally blank so they never fall
  // back to raw notes downstream.
  const result: Record<string, string> = {};
  const candidates: { idx: number; name: string; reason: string; notes: string }[] = [];
  cleaned.forEach((c, i) => {
    if (!c.cleanNotes || c.cleanNotes === '-' || c.cleanNotes.length < MIN_NOTE_CHARS) {
      result[c.name] = '';
    } else {
      candidates.push({ idx: i, name: c.name, reason: c.reason || '', notes: c.cleanNotes.slice(0, 500) });
    }
  });

  if (candidates.length === 0) return result;

  const prompt = `Rewrite each lender's internal pass notes into a SHORT, client-friendly "Key Feedback" line for a status report sent to a financing client.

Rules:
- 1 short sentence (2 max). ~30 words or less.
- Tone: respectful, neutral, professional, gentle but clear about the reason.
- Preserve the substance of the lender's reasoning. Do NOT invent new facts.
- Remove internal shorthand, blunt phrasing, fragmented notes, and overly negative language.
- Frame around fit, timing, credit criteria, sector appetite, leverage profile, growth profile, or current underwriting focus.
- If a note is too thin or ambiguous to support a polished rewrite, return an empty string for that id.
- No emoji. No markdown. No surrounding quotes.

Return STRICT JSON only with this shape (no commentary):
{ "items": [ { "id": <number>, "feedback": "<string>" } ] }

Lenders:
${JSON.stringify(
  candidates.map((c) => ({ id: c.idx, name: c.name, reason: c.reason, notes: c.notes })),
  null,
  2,
)}`;

  try {
    const res = await sendClaudeMessage({
      messages: [{ role: 'user', content: prompt }],
      system:
        'You translate internal lender pass notes into polished, client-safe feedback for a status report. Reply with valid JSON only.',
      temperature: 0.3,
      max_tokens: 900,
      context: 'deal-assistant',
      usage: { feature_subtype: 'status-report-pass-feedback', deal_id: dealId },
    });
    if (!res.success) return result;
    const match = res.response?.match?.(/\{[\s\S]*\}/);
    if (!match) return result;
    const parsed = JSON.parse(match[0]);
    const arr = Array.isArray(parsed?.items) ? parsed.items : [];
    for (const entry of arr) {
      const idx = Number(entry?.id);
      const text = typeof entry?.feedback === 'string' ? entry.feedback.trim() : '';
      if (!Number.isFinite(idx)) continue;
      const src = cleaned[idx];
      if (!src) continue;
      result[src.name] = text;
    }
    // Any candidate not echoed back gets an empty string fallback.
    for (const c of candidates) {
      if (!(c.name in result)) result[c.name] = '';
    }
    return result;
  } catch (e) {
    console.warn('rewritePassedFeedback failed', e);
    return result;
  }
}