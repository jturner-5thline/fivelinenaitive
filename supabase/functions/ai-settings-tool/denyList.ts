// Hard-coded deny patterns. Match → refusal{reason:'deny_listed'}.
// Never reach the LLM, never write to a settings table.

export const DENY_PATTERNS: RegExp[] = [
  /\bpass(word|wd)\b/i,
  /\b(mfa|2fa|totp|recovery\s*code)\b/i,
  /\bapi[\s_-]?(key|token)\b/i,
  /\b(secret|bearer|client[\s_-]?secret)\b/i,
  /\boauth\b/i,
  /\b(refresh|access)[\s_-]?token\b/i,
  /\bservice[\s_-]?role\b/i,
  /\b(billing|invoice|stripe|payment\s*method|subscription|credit\s*card)\b/i,
  /\b(rls|policy|grant|revoke)\b/i,
  /\brole[\s_-]?assign/i,
  /\bmake\s+\S+\s+(an?\s+)?admin\b/i,
  /\b(promote|demote)\s+\S+/i,
  /\b(webhook|signing)\s*secret\b/i,
  /\b(hmac|private\s*key|certificate)\b/i,
];

export const DENY_COLUMN_PREFIXES = [
  "auth.",
  "vault.",
  "pgsodium.",
  "secrets.",
  "storage.policies",
];

export function matchDeny(prompt: string): { denied: boolean; pattern?: string } {
  for (const re of DENY_PATTERNS) {
    if (re.test(prompt)) return { denied: true, pattern: re.source };
  }
  return { denied: false };
}

export function denyExplainer(prompt: string): string {
  return "That kind of change isn't editable from the AI bar for security reasons. Open Settings to make it manually.";
}