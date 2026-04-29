/**
 * Runtime guard for the composer's signature ghost text.
 *
 * The ghost is render-only (aria-hidden, non-editable) — it must never be
 * spliced into the composer body automatically. This helper centralizes the
 * "should we paint the ghost?" decision so both the live UI and tests share
 * one source of truth.
 *
 * Rules:
 *  1. No signature configured → never show.
 *  2. Signature is whitespace-only → never show.
 *  3. The body already contains the signature (or its first non-empty line —
 *     the typical "Best,\n<name>" sign-off the user may have typed manually)
 *     → suppress the ghost so we don't visually duplicate it.
 *  4. Otherwise → show.
 *
 * The function is **pure** and never mutates `body`. Callers must treat the
 * boolean as display-only and continue to render the user's body verbatim.
 */
export function shouldShowSignatureGhost(
  signature: string | null | undefined,
  body: string | null | undefined,
): boolean {
  if (!signature) return false;
  const sig = signature.trim();
  if (!sig) return false;

  const bodyText = (body ?? '').trim();
  if (!bodyText) return true;

  const normBody = normalize(bodyText);
  const normSig = normalize(sig);

  // Full signature already present anywhere in the body → suppress ghost.
  if (normBody.includes(normSig)) return false;

  // Common case: only the first line (e.g. "Best,") is duplicated. If the
  // *first non-empty line of the signature* already appears at the tail of
  // the body, treat that as a manual sign-off and suppress.
  const firstSigLine = sig
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (firstSigLine && firstSigLine.length >= 3) {
    const normFirst = normalize(firstSigLine);
    // require it to appear in the last ~120 chars of the body (i.e. at the end)
    const tail = normBody.slice(Math.max(0, normBody.length - 120));
    if (tail.includes(normFirst)) return false;
  }

  return true;
}

function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').toLowerCase();
}