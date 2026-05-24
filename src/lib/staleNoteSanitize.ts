/**
 * Post-process AI suggested status updates to enforce the strict
 * 1–2 sentence / ≤280 char / plain prose contract.
 */

const MAX_CHARS = 280;

function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function stripLeading(s: string): string {
  return s
    .replace(/^\s*(topic|status|update|summary|recommendation)\s*:\s*/i, '')
    .replace(/^\s*[-*•·–—]+\s*/, '')
    .replace(/^["'`]+/, '')
    .replace(/["'`]+$/, '');
}

function stripSignatureAndQuotes(s: string): string {
  const lines = s.split(/\r?\n/);
  const cleaned: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    // Stop at common signature / quote markers
    if (/^--\s*$/.test(line)) break;
    if (/^(best|thanks|regards|cheers|sincerely)[\s,!.]/i.test(line)) break;
    if (line.startsWith('>')) continue;
    if (/^on\s.+wrote:/i.test(line)) break;
    cleaned.push(line);
  }
  return cleaned.join(' ');
}

function splitSentences(s: string): string[] {
  // Split on sentence terminators followed by whitespace or end.
  const parts = s.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g);
  if (!parts) return [s];
  return parts.map(p => p.trim()).filter(Boolean);
}

function truncateAtSentence(s: string, max: number): string {
  if (s.length <= max) return s;
  const sentences = splitSentences(s);
  let acc = '';
  for (const sent of sentences) {
    const candidate = acc ? `${acc} ${sent}` : sent;
    if (candidate.length > max) break;
    acc = candidate;
  }
  if (acc) return acc;
  // No full sentence fits — hard cut on word boundary
  const slice = s.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > 40 ? slice.slice(0, lastSpace) : slice).trimEnd() + '…';
}

export interface SanitizeResult {
  text: string;
  ok: boolean;
  sentenceCount: number;
}

export function sanitizeStatusSuggestion(raw: string): SanitizeResult {
  if (!raw || typeof raw !== 'string') {
    return { text: '', ok: false, sentenceCount: 0 };
  }
  let s = stripHtml(raw);
  s = stripSignatureAndQuotes(s);
  s = stripLeading(s);
  s = s.replace(/\s+/g, ' ').trim();
  // Keep first two sentences max
  const sentences = splitSentences(s);
  const limited = sentences.slice(0, 2).join(' ').trim();
  const truncated = truncateAtSentence(limited, MAX_CHARS);
  const finalSentences = splitSentences(truncated);
  const ok =
    truncated.length > 0 &&
    truncated.length <= MAX_CHARS &&
    finalSentences.length >= 1 &&
    finalSentences.length <= 2 &&
    !/\n/.test(truncated);
  return { text: truncated, ok, sentenceCount: finalSentences.length };
}