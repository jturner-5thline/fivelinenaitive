/**
 * Email priority-signal detection.
 * ---------------------------------
 * Scans inbound email subject + body for high-priority deal signals like
 * "due diligence", "term sheet", "pass", "wire", "signed". Pure functions
 * — safe to import into hooks, components, and edge functions.
 */

export type EmailPrioritySignalType =
  | 'due_diligence'
  | 'term_sheet'
  | 'pass'
  | 'decline'
  | 'not_a_fit'
  | 'wire'
  | 'close'
  | 'funded'
  | 'agreement'
  | 'signed'
  | 'committed';

export interface PrioritySignalDef {
  type: EmailPrioritySignalType;
  label: string;
  /** Short description shown in user settings. */
  description: string;
  /** Word/phrase patterns. Matched case-insensitively as whole-word. */
  patterns: RegExp[];
}

/** \b-bounded regex builder so "passed" doesn't trigger on "compass". */
const wb = (...phrases: string[]) =>
  phrases.map(
    (p) =>
      new RegExp(
        `(^|[^a-zA-Z0-9])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-zA-Z0-9]|$)`,
        'i'
      )
  );

export const PRIORITY_SIGNAL_DEFS: PrioritySignalDef[] = [
  {
    type: 'due_diligence',
    label: 'Due Diligence',
    description: 'Lender entering or requesting due diligence.',
    patterns: wb('due diligence', 'diligence list', 'in diligence', 'DDQ'),
  },
  {
    type: 'term_sheet',
    label: 'Term Sheet',
    description: 'Term sheet issued, requested, or revised.',
    patterns: wb('term sheet', 'termsheet', 'LOI', 'letter of intent', 'indication of interest', 'IOI'),
  },
  {
    type: 'pass',
    label: 'Pass',
    description: 'Lender is passing on the deal.',
    patterns: wb('passing', 'going to pass', 'we\'ll pass', 'we will pass', 'have to pass'),
  },
  {
    type: 'decline',
    label: 'Decline',
    description: 'Lender declining the opportunity.',
    patterns: wb('decline', 'declining', 'declined'),
  },
  {
    type: 'not_a_fit',
    label: 'Not a Fit',
    description: 'Lender says the deal is outside mandate.',
    patterns: wb('not a fit', 'isn\'t a fit', 'doesn\'t fit', 'outside our mandate', 'outside mandate'),
  },
  {
    type: 'wire',
    label: 'Wire / Funding',
    description: 'Wire instructions or funding mechanics.',
    patterns: wb('wire', 'wire instructions', 'wire transfer', 'wired'),
  },
  {
    type: 'close',
    label: 'Close',
    description: 'Closing imminent or scheduled.',
    patterns: wb('closing', 'close date', 'ready to close', 'set to close'),
  },
  {
    type: 'funded',
    label: 'Funded',
    description: 'Deal has been funded.',
    patterns: wb('funded', 'has funded', 'funding complete'),
  },
  {
    type: 'agreement',
    label: 'Agreement',
    description: 'Definitive agreement, credit agreement, or contract referenced.',
    patterns: wb('agreement', 'credit agreement', 'definitive agreement', 'loan agreement'),
  },
  {
    type: 'signed',
    label: 'Signed',
    description: 'Document signed or executed.',
    patterns: wb('signed', 'fully executed', 'countersigned'),
  },
  {
    type: 'committed',
    label: 'Committed',
    description: 'Commitment given or capital committed.',
    patterns: wb('committed', 'we commit', 'commitment letter', 'firm commitment'),
  },
];

const DEF_MAP = new Map<EmailPrioritySignalType, PrioritySignalDef>(
  PRIORITY_SIGNAL_DEFS.map((d) => [d.type, d])
);

export const DEFAULT_ENABLED_SIGNALS: EmailPrioritySignalType[] =
  PRIORITY_SIGNAL_DEFS.map((d) => d.type);

export function getSignalDef(type: EmailPrioritySignalType): PrioritySignalDef | undefined {
  return DEF_MAP.get(type);
}

export interface DetectedSignal {
  type: EmailPrioritySignalType;
  label: string;
  /** First ~120 char excerpt from the email surrounding the match. */
  quote: string;
}

/**
 * Detect priority signals in a message. Returns at most one signal per type
 * (the first match wins). Order in the result follows PRIORITY_SIGNAL_DEFS so
 * the UI can show the most-important signal first.
 */
export function detectPrioritySignals(input: {
  subject?: string | null;
  body?: string | null;
}): DetectedSignal[] {
  const haystack = `${input.subject || ''}\n${input.body || ''}`;
  if (!haystack.trim()) return [];

  const out: DetectedSignal[] = [];
  for (const def of PRIORITY_SIGNAL_DEFS) {
    for (const re of def.patterns) {
      const m = re.exec(haystack);
      if (m) {
        const idx = m.index ?? 0;
        const start = Math.max(0, idx - 40);
        const end = Math.min(haystack.length, idx + (m[0]?.length || 0) + 80);
        const quote = haystack.slice(start, end).replace(/\s+/g, ' ').trim();
        out.push({ type: def.type, label: def.label, quote });
        break;
      }
    }
  }
  return out;
}
