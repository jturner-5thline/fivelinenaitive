/**
 * Compare an incoming Q&A suggestion against the existing Q&A note for the
 * same source thread. Powers the "Merge / Update" mode in the AI Assist
 * sidebar — only changed or net-new pairs are written back, so re-saving a
 * thread that grew by one answer doesn't duplicate the prior block.
 *
 * Pairing rules:
 *  - Existing entries for the thread are flattened into a question-keyed map
 *    (most-recent answer wins).
 *  - Question keys are normalized: lowercased, whitespace collapsed, trailing
 *    punctuation removed. This tolerates "Q1." / numbering / "?" variants.
 *  - A pair is `unchanged` when the normalized answer is byte-equal to the
 *    stored one, `changed` when the question matches but the answer differs,
 *    and `new` when the question key is not present.
 */

import type { QAPair } from './detectThreadQAndA';

export interface ParsedQAEntry {
  /** Map of normalized question → most recent answer text seen for this thread. */
  byQuestion: Map<string, string>;
  /** Number of distinct prior entries (### headings) found for this thread. */
  entryCount: number;
}

export interface QADiffResult {
  unchanged: QAPair[];
  changed: { previous: string; next: QAPair }[];
  added: QAPair[];
  /** True when `existing.entryCount > 0`. */
  hasPrior: boolean;
}

function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/^\s*q\s*\d*[.):\]]\s*/i, '')
    .replace(/\*\*/g, '')
    .replace(/[?:.,;\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAnswer(a: string): string {
  return a
    .replace(/\*\*/g, '')
    .replace(/^\s*a\s*[.):\]]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse the Client Q&A note's markdown to find every Q→A pair previously
 * captured against `threadId`. Format we wrote (see `buildQANoteEntry`):
 *
 *   ### Client Q&A — <date>
 *   _From **Name** <email> · Re: subject_
 *
 *   **Q1.** question
 *   **A.** answer
 *   ...
 *   _Source thread: <threadId>_
 */
export function parseExistingQAForThread(
  noteContent: string | undefined | null,
  threadId: string,
): ParsedQAEntry {
  const empty: ParsedQAEntry = { byQuestion: new Map(), entryCount: 0 };
  if (!noteContent || !threadId) return empty;

  // Split on the heading marker we always emit. Each block represents one
  // captured entry.
  const blocks = noteContent.split(/^### Client Q&A/m);
  const matchingBlocks: string[] = [];
  for (const b of blocks) {
    if (b.includes(`_Source thread: ${threadId}_`) || b.includes(`Source thread: ${threadId}`)) {
      matchingBlocks.push(b);
    }
  }
  if (matchingBlocks.length === 0) return empty;

  const byQuestion = new Map<string, string>();
  // Process oldest → newest so the latest answer wins on collision.
  for (const block of matchingBlocks) {
    const lines = block.split(/\r?\n/);
    let pendingQ: string | null = null;
    for (const raw of lines) {
      const line = raw.trim();
      const qMatch = line.match(/^\*\*Q\d*\.\*\*\s*(.+)$/i);
      const aMatch = line.match(/^\*\*A\.\*\*\s*(.+)$/i);
      if (qMatch) {
        pendingQ = normalizeQuestion(qMatch[1]);
      } else if (aMatch && pendingQ) {
        byQuestion.set(pendingQ, normalizeAnswer(aMatch[1]));
        pendingQ = null;
      }
    }
  }

  return { byQuestion, entryCount: matchingBlocks.length };
}

/** Diff incoming pairs against the parsed prior entries. */
export function diffQAPairs(incoming: QAPair[], existing: ParsedQAEntry): QADiffResult {
  const unchanged: QAPair[] = [];
  const changed: { previous: string; next: QAPair }[] = [];
  const added: QAPair[] = [];

  for (const pair of incoming) {
    const key = normalizeQuestion(pair.question);
    const incomingAns = normalizeAnswer(pair.answer);
    if (existing.byQuestion.has(key)) {
      const prev = existing.byQuestion.get(key) || '';
      if (prev === incomingAns) {
        unchanged.push(pair);
      } else {
        changed.push({ previous: prev, next: pair });
      }
    } else {
      added.push(pair);
    }
  }

  return { unchanged, changed, added, hasPrior: existing.entryCount > 0 };
}

/** Per-pair status used by the UI to render badges. */
export type QAPairStatus = 'unchanged' | 'changed' | 'new';

export function classifyPair(pair: QAPair, existing: ParsedQAEntry): QAPairStatus {
  if (existing.entryCount === 0) return 'new';
  const key = normalizeQuestion(pair.question);
  if (!existing.byQuestion.has(key)) return 'new';
  const prev = existing.byQuestion.get(key) || '';
  return prev === normalizeAnswer(pair.answer) ? 'unchanged' : 'changed';
}