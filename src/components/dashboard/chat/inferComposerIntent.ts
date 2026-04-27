/**
 * Lightweight, local intent classifier for the dashboard AI composer.
 *
 * The composer used to expose three explicit mode tabs (Ask / Task / Email).
 * Those have been removed in favor of a single input that infers intent from
 * the prompt itself, with optional context hints. We keep this purely
 * client-side and rule-based so submission stays instantaneous — there is no
 * network round-trip before routing.
 *
 * Returns:
 *   - intent:     the best-guess action
 *   - confidence: 0–1 score; the composer treats <0.5 as ambiguous and shows
 *                 a clarification chip row instead of dispatching.
 *   - signals:    matched keywords / hints, useful for analytics + debugging
 */

export type ComposerIntent = 'ask' | 'task' | 'email';

export interface IntentContext {
  /** Active route (e.g. window.location.pathname). */
  pathname?: string;
  /** True if a deal/contact/lender entity is currently selected/open. */
  hasSelectedEntity?: boolean;
  /** True if an email composer / thread is open in the surrounding UI. */
  hasEmailContext?: boolean;
}

export interface IntentResult {
  intent: ComposerIntent;
  confidence: number;
  signals: string[];
}

const TASK_KEYWORDS = [
  'remind me',
  'remind ',
  'follow up with',
  'follow-up with',
  'add a task',
  'add task',
  'create a task',
  'create task',
  'todo',
  'to-do',
  'to do',
  'assign ',
  'schedule a call',
  'book a call',
  'note to self',
  'put on my list',
  'log a task',
  'log task',
  'set a reminder',
  'set reminder',
  'don\'t forget to',
  'dont forget to',
  'make sure i',
  'i need to',
  'we need to',
  'flag for ',
];

const EMAIL_KEYWORDS = [
  'draft an email',
  'draft email',
  'write an email',
  'write email',
  'compose an email',
  'compose email',
  'send an email',
  'send email',
  'reply to',
  'respond to',
  'follow up email',
  'follow-up email',
  'outreach to',
  'reach out to',
  'email ',
  'message ',
  'ping ',
  'introduce me to',
  'intro email',
];

const ASK_KEYWORDS = [
  'what ',
  'why ',
  'how ',
  'who ',
  'when ',
  'where ',
  'which ',
  'show me',
  'list ',
  'tell me',
  'summarize',
  'summary of',
  'analyze',
  'analysis of',
  'compare',
  'research ',
  'find ',
  'look up',
  'explain',
  'overview of',
  'status of',
  'recap',
];

function matchAny(haystack: string, needles: string[]): string[] {
  return needles.filter((n) => haystack.includes(n));
}

/**
 * Slash commands keep their explicit routing — `/email` always goes to email,
 * etc. We short-circuit on these.
 */
function slashCommandIntent(text: string): IntentResult | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  const cmd = trimmed.split(/\s+/)[0].toLowerCase();
  if (cmd === '/email') return { intent: 'email', confidence: 1, signals: ['/email'] };
  if (cmd === '/tasks' || cmd === '/task') return { intent: 'task', confidence: 1, signals: [cmd] };
  // Other slash commands all behave like asks.
  return { intent: 'ask', confidence: 1, signals: [cmd] };
}

export function inferComposerIntent(
  text: string,
  ctx: IntentContext = {},
): IntentResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { intent: 'ask', confidence: 0, signals: [] };
  }

  const slash = slashCommandIntent(trimmed);
  if (slash) return slash;

  const lower = trimmed.toLowerCase();
  const endsWithQuestion = lower.endsWith('?');
  const taskHits = matchAny(lower, TASK_KEYWORDS);
  const emailHits = matchAny(lower, EMAIL_KEYWORDS);
  const askHits = matchAny(lower, ASK_KEYWORDS);

  // Score per intent. Each keyword match is worth 0.3, capped per-intent.
  // Question marks and contextual hints add small boosts.
  let askScore = Math.min(0.6, askHits.length * 0.3);
  let taskScore = Math.min(0.9, taskHits.length * 0.45);
  let emailScore = Math.min(0.9, emailHits.length * 0.45);

  if (endsWithQuestion) askScore += 0.4;

  // Imperative-leading verbs that strongly imply task creation when paired
  // with a person/time reference.
  if (/^(remind|create|add|schedule|book|set|log|flag)\b/.test(lower)) {
    taskScore += 0.25;
  }

  // Imperative drafting verbs at the start.
  if (/^(draft|write|compose|send|reply|respond|email|ping|message|outreach)\b/.test(lower)) {
    emailScore += 0.35;
  }

  // Context boosts.
  if (ctx.hasEmailContext) emailScore += 0.15;
  if (ctx.pathname?.startsWith('/tasks')) taskScore += 0.1;

  // Pick the winner.
  const scores: Array<[ComposerIntent, number, string[]]> = [
    ['ask', askScore, askHits],
    ['task', taskScore, taskHits],
    ['email', emailScore, emailHits],
  ];
  scores.sort((a, b) => b[1] - a[1]);

  const [topIntent, topScore, topHits] = scores[0];
  const [, secondScore] = scores[1];

  // Confidence = top score, dampened when the runner-up is close.
  const margin = topScore - secondScore;
  const confidence = Math.max(0, Math.min(1, topScore - Math.max(0, 0.2 - margin)));

  // Default fallback when nothing matched: treat as ask with low confidence
  // (which the caller still treats as a high-confidence ask because ambiguous
  // ask is the safest default — sending text to a chat assistant).
  if (topScore === 0) {
    return { intent: 'ask', confidence: 0.7, signals: [] };
  }

  return { intent: topIntent, confidence, signals: topHits };
}

export const AMBIGUITY_THRESHOLD = 0.5;