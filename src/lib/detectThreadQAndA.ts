/**
 * Detection: Q&A-style replies in an email thread.
 *
 * Heuristics:
 *   1. A prior outbound message in the thread contained a question list
 *      (numbered/bulleted items, or lines ending in "?", optionally
 *      preceded by the word "questions").
 *   2. The latest inbound reply contains matching numbered/bulleted answers
 *      OR inline answers (Q:/A: pairs, "see below", "responses inline",
 *      "answers to your questions").
 *
 * The extractor returns a normalized list of { question, answer } pairs
 * plus the raw inbound source so the caller can render a clean preview.
 */

import { htmlToPlainText } from './htmlToPlainText';

export interface QAPair {
  question: string;
  answer: string;
}

export interface DetectedThreadQA {
  pairs: QAPair[];
  /** Index in `messages` of the outbound message that asked the questions. */
  outboundIndex: number;
  /** Index of the inbound reply that contains the answers. */
  inboundIndex: number;
  /** Why we matched (debug-friendly). */
  reasons: string[];
  /** Detection confidence bucket. */
  confidence: 'high' | 'medium' | 'low';
  /** Raw 0..1 score that produced the bucket; useful for tooltips. */
  confidenceScore: number;
  /** Per-signal contributions, for the tooltip breakdown. */
  confidenceSignals: { label: string; weight: number; hit: boolean }[];
}

export interface ThreadMessageLite {
  /** True when this message was sent by us (folder === 'sent' or from === 'You'). */
  isOutbound: boolean;
  /** Raw text/preview of the message body. HTML allowed; will be normalized. */
  body: string;
  fromEmail?: string;
  fromName?: string;
  subject?: string;
  receivedAt?: string;
}

const ANSWER_KEYWORDS = [
  /answers?\s+to\s+your\s+questions?/i,
  /see\s+(below|inline)/i,
  /responses?\s+(inline|below)/i,
  /re:\s+your\s+questions?/i,
  /my\s+answers?\s+(below|inline)/i,
];

const NUMBERED_LINE = /^\s*(?:\(?(\d{1,2})[.)\]]|\[(\d{1,2})\])\s+(.+)$/;
const BULLET_LINE = /^\s*(?:[-*•·●▪◦]|\u2022|\u25E6|\u25AA)\s+(.+)$/;
const QA_PREFIX_LINE = /^\s*(?:Q\s*[:.\)]\s*(.+)|A\s*[:.\)]\s*(.+))$/i;

/**
 * A positional block plus a flag indicating whether the source paragraph
 * started with an explicit list marker (number, bullet, or "A:"). Markers
 * mark the START of a new answer; unmarked paragraphs are continuations of
 * the previous answer.
 */
export interface PositionalBlock {
  text: string;
  hasMarker: boolean;
}

const SIGNATURE_CUE = /^(thanks|thank you|cheers|best|regards|sincerely|sent from my)/i;

/**
 * Positional fallback: split text into paragraph-style blocks separated by
 * blank lines. Used when numbering is missing or inconsistent so we can still
 * align answers to questions by ORDER.
 */
export function extractPositionalBlocksDetailed(text: string): PositionalBlock[] {
  if (!text) return [];
  const paragraphs = text
    .split(/\n{2,}/)
    .map(p => p.replace(/\r/g, '').trim())
    .filter(Boolean);

  const blocks: PositionalBlock[] = [];
  for (const p of paragraphs) {
    const firstLine = p.split(/\n/, 1)[0] || '';
    const hasMarker =
      NUMBERED_LINE.test(firstLine) ||
      BULLET_LINE.test(firstLine) ||
      /^\s*A\s*[:.\)]\s+/i.test(firstLine);

    const collapsed = p
      .split(/\n/)
      .map(l => l.trim())
      .filter(Boolean)
      .join(' ')
      .replace(NUMBERED_LINE, (_m, _n1, _n2, rest) => rest)
      .replace(BULLET_LINE, (_m, rest) => rest)
      .replace(/^A\s*[:.\)]\s*/i, '')
      .trim();
    if (collapsed.length < 3) continue;
    if (SIGNATURE_CUE.test(collapsed) && collapsed.length < 60) continue;
    blocks.push({ text: collapsed, hasMarker });
  }
  return blocks;
}

/** Back-compat: returns just the text of each block. */
export function extractPositionalBlocks(text: string): string[] {
  return extractPositionalBlocksDetailed(text).map(b => b.text);
}

/**
 * Merge adjacent blocks that belong to the same answer.
 *
 * Strategy:
 *   1. If ANY block has an explicit list marker, treat marker-starting blocks
 *      as answer boundaries and append unmarked blocks to the previous answer.
 *      This handles "1. ...\n\nMore detail.\n\n2. ..." cleanly.
 *   2. Otherwise (no markers anywhere), if there are MORE blocks than
 *      questions, distribute blocks evenly across the questions, joining
 *      adjacent blocks into the same answer.
 */
export function mergeBlocksToAnswers(
  blocks: PositionalBlock[],
  questionCount: number,
): string[] {
  if (blocks.length === 0) return [];
  if (questionCount <= 0) return blocks.map(b => b.text);

  const anyMarker = blocks.some(b => b.hasMarker);

  if (anyMarker) {
    const grouped: string[] = [];
    for (const b of blocks) {
      if (b.hasMarker || grouped.length === 0) {
        grouped.push(b.text);
      } else {
        grouped[grouped.length - 1] += '\n\n' + b.text;
      }
    }
    return grouped;
  }

  // No markers at all: distribute blocks proportionally across questions.
  if (blocks.length <= questionCount) {
    return blocks.map(b => b.text);
  }
  const perQuestion = blocks.length / questionCount;
  const grouped: string[] = [];
  for (let q = 0; q < questionCount; q++) {
    const start = Math.floor(q * perQuestion);
    const end = q === questionCount - 1 ? blocks.length : Math.floor((q + 1) * perQuestion);
    const slice = blocks.slice(start, Math.max(end, start + 1));
    grouped.push(slice.map(b => b.text).join('\n\n'));
  }
  return grouped;
}

function normalizeBody(body: string): string {
  if (!body) return '';
  // If it looks like HTML, strip tags first.
  if (/<[a-z][\s\S]*>/i.test(body)) return htmlToPlainText(body);
  return body;
}

/** Strip the quoted-reply tail so we only analyze the new content. */
function stripQuoted(body: string): string {
  const cutPatterns = [
    /\n\s*On\s.+\swrote:\s*/i,
    /\n\s*-{3,}\s*Original Message\s*-{3,}/i,
    /\n\s*From:\s.+\n/i,
    /\n\s*>\s/, // first quoted line
  ];
  let cut = body.length;
  for (const p of cutPatterns) {
    const m = body.match(p);
    if (m && m.index !== undefined && m.index < cut) cut = m.index;
  }
  return body.slice(0, cut).trimEnd();
}

/** Extract numbered/bulleted question items from text. */
export function extractQuestions(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let buffer: string | null = null;

  const flush = () => {
    if (buffer) {
      const trimmed = buffer.trim();
      if (trimmed.length > 3) out.push(trimmed);
    }
    buffer = null;
  };

  for (const raw of lines) {
    const num = raw.match(NUMBERED_LINE);
    const bul = raw.match(BULLET_LINE);
    if (num || bul) {
      flush();
      buffer = (num ? num[3] : bul![1]).trim();
    } else if (buffer && raw.trim()) {
      // Continuation of the previous item.
      buffer += ' ' + raw.trim();
    } else if (!raw.trim()) {
      flush();
    }
  }
  flush();

  // Also treat standalone lines ending in "?" as questions if we found < 2 items above.
  if (out.length < 2) {
    for (const raw of lines) {
      const t = raw.trim();
      if (t.endsWith('?') && t.length > 8 && !out.includes(t)) out.push(t);
    }
  }

  // Filter out things that don't look like questions (no "?" and no interrogative cue).
  const looksInterrogative = (s: string) =>
    s.includes('?') ||
    /^(what|when|where|who|why|how|can|could|would|should|do|does|did|is|are|please\s+(share|provide|confirm|send))/i.test(s);
  return out.filter(q => looksInterrogative(q) || q.length > 25);
}

/** Extract answers from the inbound reply, attempting to align to the questions list. */
export function extractAnswers(text: string, expectedCount: number): string[] {
  const lines = text.split(/\r?\n/);
  const numbered: { num: number; content: string }[] = [];
  const bulleted: string[] = [];
  const aPrefixed: string[] = [];

  let bufferKind: 'num' | 'bul' | 'a' | null = null;
  let bufferIdx = -1;

  const pushBuffer = (line: string) => {
    if (bufferKind === 'num' && bufferIdx >= 0 && numbered[bufferIdx]) {
      numbered[bufferIdx].content += ' ' + line.trim();
    } else if (bufferKind === 'bul' && bufferIdx >= 0) {
      bulleted[bufferIdx] += ' ' + line.trim();
    } else if (bufferKind === 'a' && bufferIdx >= 0) {
      aPrefixed[bufferIdx] += ' ' + line.trim();
    }
  };

  for (const raw of lines) {
    const num = raw.match(NUMBERED_LINE);
    const bul = raw.match(BULLET_LINE);
    const qa = raw.match(QA_PREFIX_LINE);

    if (num) {
      const n = parseInt(num[1] || num[2], 10);
      const content = num[3].trim();
      bufferIdx = numbered.push({ num: n, content }) - 1;
      bufferKind = 'num';
    } else if (bul) {
      bufferIdx = bulleted.push(bul[1].trim()) - 1;
      bufferKind = 'bul';
    } else if (qa && qa[2] !== undefined) {
      bufferIdx = aPrefixed.push(qa[2].trim()) - 1;
      bufferKind = 'a';
    } else if (qa && qa[1] !== undefined) {
      // Q: line in the reply — skip; we already have the questions from outbound.
      bufferKind = null;
      bufferIdx = -1;
    } else if (raw.trim() && bufferKind) {
      pushBuffer(raw);
    } else if (!raw.trim()) {
      bufferKind = null;
      bufferIdx = -1;
    }
  }

  // Prefer numbered (and order by number) since they map cleanly to a numbered question list.
  if (numbered.length >= Math.max(2, Math.min(expectedCount, 2))) {
    return numbered
      .sort((a, b) => a.num - b.num)
      .map(n => n.content.trim())
      .filter(Boolean);
  }
  if (bulleted.length >= Math.max(2, Math.min(expectedCount, 2))) {
    return bulleted.map(b => b.trim()).filter(Boolean);
  }
  if (aPrefixed.length >= Math.max(2, Math.min(expectedCount, 2))) {
    return aPrefixed.map(a => a.trim()).filter(Boolean);
  }
  return [];
}

export function detectThreadQAndA(messages: ThreadMessageLite[]): DetectedThreadQA | null {
  if (!messages || messages.length < 2) return null;

  // Latest message must be inbound.
  const inboundIndex = messages.length - 1;
  const inbound = messages[inboundIndex];
  if (!inbound || inbound.isOutbound) return null;

  const inboundText = stripQuoted(normalizeBody(inbound.body || ''));
  if (inboundText.length < 30) return null;

  // Find the most recent outbound message before the inbound.
  let outboundIndex = -1;
  for (let i = inboundIndex - 1; i >= 0; i--) {
    if (messages[i].isOutbound) { outboundIndex = i; break; }
  }
  if (outboundIndex < 0) return null;

  const outbound = messages[outboundIndex];
  const outboundText = stripQuoted(normalizeBody(outbound.body || ''));

  const reasons: string[] = [];
  const keywordHit = ANSWER_KEYWORDS.some(rx => rx.test(inboundText));
  if (keywordHit) reasons.push('answer-keyword');

  const questions = extractQuestions(outboundText);
  if (questions.length >= 2) reasons.push(`outbound-questions=${questions.length}`);

  // Soft signal: outbound mentions "questions" near a list.
  const outboundMentionsQuestions = /questions?\b[\s\S]{0,160}(\n\s*(?:\d{1,2}[.)]|[-*•])\s)/i.test(outboundText);
  if (outboundMentionsQuestions) reasons.push('outbound-list-after-questions');

  if (questions.length < 2 && !keywordHit) return null;

  const answers = extractAnswers(inboundText, Math.max(questions.length, 2));
  let usedAnswers = answers;
  let pairingMode: 'structured' | 'positional' | 'positional-merged' = 'structured';

  // Fallback: when structured extraction yields too few answers (no/inconsistent
  // numbering, no bullets, no Q:/A: prefixes) but we DO have a known question
  // list from the outbound, align by paragraph position instead. Adjacent blocks
  // are merged when an answer spans multiple paragraphs.
  if (usedAnswers.length < 2 && questions.length >= 2) {
    const detailed = extractPositionalBlocksDetailed(inboundText);
    if (detailed.length >= 2) {
      const merged = mergeBlocksToAnswers(detailed, questions.length);
      if (merged.length >= 2) {
        usedAnswers = merged.slice(0, questions.length);
        pairingMode =
          merged.length < detailed.length ? 'positional-merged' : 'positional';
      }
    }
  }

  if (usedAnswers.length < 2) return null;
  reasons.push(`inbound-answers=${usedAnswers.length}`);
  reasons.push(`pairing=${pairingMode}`);

  // Pair questions to answers by index. Trim to the smaller of the two.
  const pairCount = Math.min(questions.length, usedAnswers.length);
  if (pairCount < 2) {
    // If we have lots of answers but few extracted questions, still surface
    // the answers under a generic "Question N" label so the user can edit.
    if (usedAnswers.length >= 2 && questions.length === 0) {
      const pairs: QAPair[] = usedAnswers.map((a, i) => ({
        question: `Question ${i + 1}`,
        answer: a,
      }));
      const conf = computeQAConfidence({
        pairs,
        questionCount: questions.length,
        answerCount: usedAnswers.length,
        pairingMode,
        keywordHit,
        outboundMentionsQuestions,
      });
      reasons.push(`confidence=${conf.confidence}(${conf.score.toFixed(2)})`);
      return {
        pairs,
        outboundIndex,
        inboundIndex,
        reasons,
        confidence: conf.confidence,
        confidenceScore: conf.score,
        confidenceSignals: conf.signals,
      };
    }
    return null;
  }

  const pairs: QAPair[] = [];
  for (let i = 0; i < pairCount; i++) {
    pairs.push({
      question: questions[i].replace(/[?:]+\s*$/, '').trim() + '?',
      answer: usedAnswers[i].trim(),
    });
  }
  const conf = computeQAConfidence({
    pairs,
    questionCount: questions.length,
    answerCount: usedAnswers.length,
    pairingMode,
    keywordHit,
    outboundMentionsQuestions,
  });
  reasons.push(`confidence=${conf.confidence}(${conf.score.toFixed(2)})`);
  return {
    pairs,
    outboundIndex,
    inboundIndex,
    reasons,
    confidence: conf.confidence,
    confidenceScore: conf.score,
    confidenceSignals: conf.signals,
  };
}

/** Stable dedup key: thread + count of pairs + first-answer fingerprint. */
export function buildQADedupKey(threadId: string, pairs: QAPair[]): string {
  const fp = (pairs[0]?.answer || '').slice(0, 40).replace(/\s+/g, ' ').trim();
  return `qa-from-thread::${threadId}::${pairs.length}::${fp}`;
}

/**
 * Score a detected Q&A set using a weighted-signal model. Each signal
 * contributes up to its weight; the sum is normalized to 0..1 and then
 * bucketed into high (≥0.75), medium (≥0.5), low (<0.5).
 */
function computeQAConfidence(args: {
  pairs: QAPair[];
  questionCount: number;
  answerCount: number;
  pairingMode: 'structured' | 'positional' | 'positional-merged';
  keywordHit: boolean;
  outboundMentionsQuestions: boolean;
}): { confidence: 'high' | 'medium' | 'low'; score: number; signals: { label: string; weight: number; hit: boolean }[] } {
  const { pairs, questionCount, answerCount, pairingMode, keywordHit, outboundMentionsQuestions } = args;

  // Quality of pair contents.
  const meaningfulAnswers = pairs.filter(p => p.answer.replace(/\s+/g, ' ').trim().length >= 12).length;
  const meaningfulRatio = pairs.length > 0 ? meaningfulAnswers / pairs.length : 0;
  const allMeaningful = pairs.length > 0 && meaningfulAnswers === pairs.length;

  // Did we keep every outbound question (counts line up exactly)?
  const countsAlign = questionCount > 0 && answerCount === questionCount;

  // 3+ pairs is a much stronger signal than the 2-pair minimum.
  const richPairCount = pairs.length >= 3;

  const signals: { label: string; weight: number; hit: boolean }[] = [
    { label: 'Inbound contains "answers to your questions" / "see below" cue', weight: 0.20, hit: keywordHit },
    { label: 'Outbound list followed a "questions" cue', weight: 0.10, hit: outboundMentionsQuestions },
    { label: 'Structured pairing (numbered / bulleted / Q:A)', weight: 0.25, hit: pairingMode === 'structured' },
    { label: 'Positional pairing with merged paragraphs', weight: 0.10, hit: pairingMode === 'positional-merged' },
    { label: 'Question and answer counts line up exactly', weight: 0.15, hit: countsAlign },
    { label: '3 or more Q&A pairs detected', weight: 0.10, hit: richPairCount },
    { label: 'Every answer has substantive content (≥12 chars)', weight: 0.15, hit: allMeaningful },
    { label: 'Most answers have substantive content (≥60%)', weight: 0.05, hit: meaningfulRatio >= 0.6 && !allMeaningful },
  ];

  const totalWeight = signals.reduce((s, x) => s + x.weight, 0);
  const earned = signals.reduce((s, x) => s + (x.hit ? x.weight : 0), 0);
  const score = totalWeight > 0 ? earned / totalWeight : 0;

  // Floor: a positional-only pairing with no keyword hit and no count alignment
  // can never be "high" — the user should review more carefully.
  const cap = !keywordHit && pairingMode !== 'structured' && !countsAlign ? 'medium' : null;
  let confidence: 'high' | 'medium' | 'low' = score >= 0.75 ? 'high' : score >= 0.5 ? 'medium' : 'low';
  if (cap === 'medium' && confidence === 'high') confidence = 'medium';

  return { confidence, score, signals };
}