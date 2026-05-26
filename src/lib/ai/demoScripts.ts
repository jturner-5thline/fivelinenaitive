/**
 * Demo-only scripted responses for the naitive AI ("Ask naitive AI") bar.
 *
 * Gated strictly to the user with email === 'demo@5thline.co'. For any
 * other user OR any non-matching prompt, `matchDemoScript` returns null
 * and the caller MUST fall through to the normal AI pipeline.
 *
 * The matcher is pure and unit-testable. Add more scripted prompts by
 * extending DEMO_SCRIPTS — keys are normalized prompts (see `normalize`).
 */

export const DEMO_SCRIPT_EMAIL = 'demo@5thline.co';

export interface DemoScriptMatch {
  reply: string;
  /** Randomized "thinking" delay in ms before streaming the reply. */
  delayMs: number;
}

export interface MatchDemoScriptArgs {
  email?: string | null;
  prompt: string;
  /** Reserved for future per-deal scripted variants. */
  deal?: unknown;
}

/** Normalize: trim, collapse whitespace, lowercase, strip trailing punctuation. */
export function normalizeDemoPrompt(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s.?!,;:]+$/g, '');
}

/**
 * Map of normalized prompt → scripted reply. Keys MUST already be in the
 * normalized form returned by `normalizeDemoPrompt` (no trailing punctuation,
 * lowercased, single-spaced).
 */
const DEMO_SCRIPTS: Record<string, string> = {
  'how much of their pipeline is fully committed':
    'About 65% of their current pipeline is committed, with signed LOIs or contracts in place already.',
};

/** Fixed thinking delay applied to every scripted demo reply. */
const DEMO_SCRIPT_DELAY_MS = 3000;

export function matchDemoScript({ email, prompt }: MatchDemoScriptArgs): DemoScriptMatch | null {
  if (!email || email.toLowerCase() !== DEMO_SCRIPT_EMAIL) return null;
  if (!prompt) return null;
  const key = normalizeDemoPrompt(prompt);
  const reply = DEMO_SCRIPTS[key];
  if (!reply) return null;
  return { reply, delayMs: DEMO_SCRIPT_DELAY_MS };
}