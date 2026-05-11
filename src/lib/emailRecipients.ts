const EMAIL_REGEX = /^[A-Za-z0-9._%+\-!#$&'*/=?^`{|}~]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function isValidRecipientEmail(value: string): boolean {
  const v = value.trim();
  if (!v || v.length > 254) return false;
  if (/\s/.test(v)) return false;
  const at = v.indexOf('@');
  if (at < 1) return false;
  const local = v.slice(0, at);
  const domain = v.slice(at + 1);
  if (local.length > 64) return false;
  if (!domain.includes('.')) return false;
  return EMAIL_REGEX.test(v);
}

export function splitRecipientList(raw: string): string[] {
  const tokens: string[] = [];
  let buf = '';
  let inQuotes = false;
  let inAngle = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"' && !inAngle) {
      inQuotes = !inQuotes;
      buf += ch;
      continue;
    }
    if (ch === '<' && !inQuotes) { inAngle = true; buf += ch; continue; }
    if (ch === '>' && !inQuotes) { inAngle = false; buf += ch; continue; }
    const isSeparator = !inQuotes && !inAngle && (ch === ',' || ch === ';' || ch === '\n' || ch === '\r');
    if (isSeparator) {
      const t = buf.trim();
      if (t) tokens.push(t);
      buf = '';
    } else {
      buf += ch;
    }
  }
  const tail = buf.trim();
  if (tail) tokens.push(tail);
  return tokens;
}

export function extractEmailFromRecipientToken(token: string): { email: string; raw: string } {
  const raw = token.trim();
  const angle = raw.match(/<\s*([^<>\s]+)\s*>/);
  if (angle?.[1]) return { email: angle[1].trim(), raw };
  const parts = raw.split(/\s+/).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].includes('@')) {
      return { email: parts[i].replace(/^[<("']+|[>)"']+$/g, ''), raw };
    }
  }
  return { email: raw.replace(/^[<\[{("']+|[>\]})"']+$/g, ''), raw };
}

export function normalizeRecipientInput(input?: string[] | string | null): string[] {
  if (!input) return [];
  const values = Array.isArray(input) ? input : [input];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    const tokens = splitRecipientList(String(value));
    for (const token of tokens) {
      const { email } = extractEmailFromRecipientToken(token);
      const cleaned = email.trim().toLowerCase();
      if (!cleaned || seen.has(cleaned)) continue;
      seen.add(cleaned);
      out.push(cleaned);
    }
  }
  return out;
}

export function getInvalidRecipients(input?: string[] | string | null): string[] {
  if (!input) return [];
  const values = Array.isArray(input) ? input : [input];
  const invalid: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const tokens = splitRecipientList(String(value));
    for (const token of tokens) {
      const { email, raw } = extractEmailFromRecipientToken(token);
      const cleaned = email.trim().toLowerCase();
      if (!cleaned) continue;
      if (!isValidRecipientEmail(cleaned)) invalid.push(raw);
    }
  }
  return invalid;
}