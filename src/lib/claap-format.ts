import { stripClaapTimestamps } from '@/types/claap';

export interface ParsedClaapActionItem {
  text: string;
  assigneeName?: string;
}

// Leading assignee prefix: optionally bold/italic name (1-4 capitalized tokens),
// followed by `:`, em-dash, or hyphen.
const ASSIGNEE_PREFIX_RE =
  /^\s*[*_]{0,2}([A-Z][a-zA-Z'.\-]+(?:\s+[A-Z][a-zA-Z'.\-]+){0,3})[*_]{0,2}\s*[:\u2014\-]\s+/;

function stripInlineMarkdown(s: string): string {
  return s
    // bold **foo** or __foo__
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    // italics *foo* or _foo_
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, '$1$2');
}

function capitalizeFirst(s: string): string {
  if (!s) return s;
  const i = s.search(/\S/);
  if (i < 0) return s;
  return s.slice(0, i) + s.charAt(i).toUpperCase() + s.slice(i + 1);
}

/**
 * Parse a raw Claap action item text. Strips:
 *  - leading `**Assignee Name**:` / `Name —` / `Name -` prefix (returned as `assigneeName`)
 *  - inline markdown bold/italics
 *  - Claap inline timestamp citations like `%[16:03]()`
 * Capitalizes the first remaining character.
 */
export function parseClaapActionItemText(raw: string | null | undefined): ParsedClaapActionItem {
  if (!raw) return { text: '' };
  let s = String(raw);
  let assigneeName: string | undefined;
  const m = s.match(ASSIGNEE_PREFIX_RE);
  if (m) {
    assigneeName = m[1].trim();
    s = s.slice(m[0].length);
  }
  s = stripInlineMarkdown(s);
  s = stripClaapTimestamps(s);
  s = s.replace(/[ \t]+$/g, '').replace(/\s+\n/g, '\n').trimEnd();
  s = capitalizeFirst(s);
  return assigneeName ? { text: s, assigneeName } : { text: s };
}
