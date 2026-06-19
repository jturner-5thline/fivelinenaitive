/**
 * Weighted evidence-based deal matcher for inbound email threads.
 *
 * Combines multiple independent signals (subject, sender/recipient domains,
 * thread participants, repeated company mentions in body, lender/contact
 * affiliations) into a single confidence score with a human-readable
 * explanation payload.
 *
 * Designed so that no single rule can carry a thread on its own — domain
 * + name + participant agreement is what produces "high" confidence and
 * triggers auto-link. Single-signal hits land in the "medium" band and
 * surface as "Likely: …" with a confirm action upstream.
 */
import {
  extractCompanyFromSubject,
  fuzzyNameScore,
  normalizeDomain,
} from '@/lib/detectDraftEmails';
import type { Deal } from '@/types/deal';
import { rankActiveDuplicateFirst } from '@/lib/effectiveDealSelection';

/** Domains we never treat as primary borrower evidence (advisor/internal). */
const ADVISORY_DOMAINS = new Set<string>([
  '5thline.co',
  'naitive.co',
]);

/** Free email providers — useful as participant signals, useless as company-domain evidence. */
const FREE_EMAIL_DOMAINS = new Set<string>([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com', 'hotmail.com',
  'icloud.com', 'me.com', 'aol.com', 'protonmail.com', 'pm.me',
  'live.com', 'msn.com',
]);

export interface EvidenceMessage {
  subject?: string;
  body?: string;
  fromEmail?: string;
  fromName?: string;
  toEmails?: string[];
  ccEmails?: string[];
  /** Treat as the most recent / "active" message — gets full weight on body mentions. */
  isLatest?: boolean;
  /** Older quoted-history messages get a small discount on body weight. */
  isQuoted?: boolean;
}

export interface EvidenceInput {
  /** Top-level subject (usually thread.subject). Falls back to latest message subject. */
  subject?: string;
  /** All known messages in the thread, newest-first. */
  messages?: EvidenceMessage[];
}

export type ConfidenceBand = 'high' | 'medium' | 'low';

export interface EvidenceReason {
  kind:
    | 'subject_company'
    | 'sender_domain'
    | 'recipient_domain'
    | 'participant_affiliation'
    | 'body_mentions'
    | 'lender_contact'
    | 'subject_partial';
  weight: number;
  detail: string;
}

export interface DealEvidenceMatch {
  deal: Deal;
  score: number;
  confidence: ConfidenceBand;
  /** Top reasons sorted by weight desc — drives badge tooltip + "Likely" UI. */
  reasons: EvidenceReason[];
  /** Lender row on this deal whose contact email/name appeared on the thread. */
  matchedLenderId?: string;
  matchedLenderName?: string;
  /** Number of thread participants that matched a known affiliated contact. */
  matchedParticipantCount: number;
  /** Number of times the company name appeared in thread bodies. */
  bodyMentionCount: number;
  /** True when sender or recipient domain equaled the deal's company domain. */
  domainHit: boolean;
  /** Best fuzzy-name score against deal.company / deal.name (0..1). */
  bestNameScore: number;
}

/** Confidence thresholds. Tuned so domain+name+participant lands "high". */
export const HIGH_THRESHOLD = 110;
export const MEDIUM_THRESHOLD = 55;

function dealDomain(deal: Deal): string {
  if (!deal.companyUrl) return '';
  try {
    const url = deal.companyUrl.startsWith('http')
      ? deal.companyUrl
      : `https://${deal.companyUrl}`;
    return normalizeDomain(new URL(url).hostname);
  } catch {
    return normalizeDomain(deal.companyUrl);
  }
}

function domainOf(email?: string): string {
  if (!email) return '';
  return normalizeDomain((email.split('@')[1] || '').trim());
}

function isAdvisory(domain: string): boolean {
  return !!domain && ADVISORY_DOMAINS.has(domain);
}

function isFree(domain: string): boolean {
  return !!domain && FREE_EMAIL_DOMAINS.has(domain);
}

function domainsEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

/** Count case-insensitive occurrences of `needle` as a word inside `hay`. */
function countMentions(hay: string, needle: string): number {
  if (!hay || !needle || needle.length < 3) return 0;
  const re = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
  const m = hay.match(re);
  return m ? m.length : 0;
}

/** Build a list of company-name tokens worth searching for in the thread body. */
function companyNeedles(deal: Deal): string[] {
  const out = new Set<string>();
  const push = (s?: string) => {
    if (!s) return;
    const cleaned = s
      .replace(/\b(inc|llc|ltd|corp|co|company|technologies|tech|holdings|group|capital)\b\.?/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length >= 3) out.add(cleaned);
    const first = cleaned.split(/\s+/)[0];
    if (first && first.length >= 4) out.add(first);
  };
  push(deal.company);
  push(deal.name);
  return Array.from(out);
}

export function scoreDealAgainstThread(deal: Deal, input: EvidenceInput): DealEvidenceMatch | null {
  const messages = input.messages || [];
  const subject = input.subject || messages.find(m => m.isLatest)?.subject || messages[0]?.subject || '';
  const subjectCompany = extractCompanyFromSubject(subject);

  const dDomain = dealDomain(deal);
  const needles = companyNeedles(deal);

  const nameScoreCompany = fuzzyNameScore(subjectCompany, deal.company || '');
  const nameScoreName = fuzzyNameScore(subjectCompany, deal.name || '');
  const bestNameScore = Math.max(nameScoreCompany, nameScoreName);

  const senderDomains = new Set<string>();
  const recipientDomains = new Set<string>();
  const participantEmails = new Set<string>();
  const participantNames = new Set<string>();

  for (const msg of messages) {
    if (msg.fromEmail) {
      const d = domainOf(msg.fromEmail);
      if (d) senderDomains.add(d);
      participantEmails.add(msg.fromEmail.toLowerCase());
    }
    if (msg.fromName) participantNames.add(msg.fromName.toLowerCase());
    for (const e of msg.toEmails || []) {
      const d = domainOf(e);
      if (d) recipientDomains.add(d);
      participantEmails.add(e.toLowerCase());
    }
    for (const e of msg.ccEmails || []) {
      const d = domainOf(e);
      if (d) recipientDomains.add(d);
      participantEmails.add(e.toLowerCase());
    }
  }

  const senderCompanyDomains = Array.from(senderDomains).filter(d => !isAdvisory(d) && !isFree(d));
  const recipientCompanyDomains = Array.from(recipientDomains).filter(d => !isAdvisory(d) && !isFree(d));

  const senderDomainHit = !!dDomain && senderCompanyDomains.some(d => domainsEqual(d, dDomain));
  const recipientDomainHit = !!dDomain && recipientCompanyDomains.some(d => domainsEqual(d, dDomain));
  const domainHit = senderDomainHit || recipientDomainHit;

  let bodyMentionCount = 0;
  for (const msg of messages) {
    if (!msg.body) continue;
    const discount = msg.isQuoted ? 0.5 : 1;
    let perMsg = 0;
    for (const needle of needles) perMsg += countMentions(msg.body, needle);
    bodyMentionCount += Math.round(perMsg * discount);
  }

  let lenderHit: { id: string; name: string } | undefined;
  if (deal.lenders && (participantEmails.size || participantNames.size)) {
    for (const l of deal.lenders) {
      const ln = (l.name || '').toLowerCase();
      if (!ln) continue;
      let hit = false;
      for (const pn of participantNames) {
        if (pn && (pn === ln || pn.includes(ln) || ln.includes(pn))) { hit = true; break; }
      }
      if (hit) { lenderHit = { id: l.id, name: l.name }; break; }
    }
  }

  let matchedParticipantCount = 0;
  if (dDomain) {
    for (const email of participantEmails) {
      const d = domainOf(email);
      if (d && !isAdvisory(d) && !isFree(d) && domainsEqual(d, dDomain)) {
        matchedParticipantCount += 1;
      }
    }
  }

  const reasons: EvidenceReason[] = [];
  let score = 0;

  if (bestNameScore >= 0.85) {
    score += 60;
    reasons.push({ kind: 'subject_company', weight: 60, detail: `Subject matched "${deal.company || deal.name}"` });
  } else if (bestNameScore >= 0.55) {
    score += 35;
    reasons.push({ kind: 'subject_company', weight: 35, detail: `Subject closely matches "${deal.company || deal.name}"` });
  } else if (bestNameScore >= 0.3) {
    score += 15;
    reasons.push({ kind: 'subject_partial', weight: 15, detail: `Partial subject match for "${deal.company || deal.name}"` });
  }

  if (senderDomainHit) {
    score += 70;
    reasons.push({ kind: 'sender_domain', weight: 70, detail: `Sender domain matches ${dDomain}` });
  } else if (recipientDomainHit) {
    score += 45;
    reasons.push({ kind: 'recipient_domain', weight: 45, detail: `Recipient domain matches ${dDomain}` });
  }

  if (matchedParticipantCount > 0) {
    const w = Math.min(50, 20 + matchedParticipantCount * 10);
    score += w;
    reasons.push({
      kind: 'participant_affiliation',
      weight: w,
      detail: `${matchedParticipantCount} thread participant${matchedParticipantCount === 1 ? '' : 's'} affiliated with ${deal.company || deal.name}`,
    });
  }

  if (lenderHit) {
    score += 30;
    reasons.push({ kind: 'lender_contact', weight: 30, detail: `Sender matches lender contact "${lenderHit.name}"` });
  }

  if (bodyMentionCount > 0) {
    const w = Math.min(40, 5 + Math.floor(Math.log2(1 + bodyMentionCount) * 12));
    score += w;
    reasons.push({
      kind: 'body_mentions',
      weight: w,
      detail: `Company name appeared ${bodyMentionCount} time${bodyMentionCount === 1 ? '' : 's'} in the thread`,
    });
  }

  if (score <= 0) return null;

  const confidence: ConfidenceBand =
    score >= HIGH_THRESHOLD ? 'high'
    : score >= MEDIUM_THRESHOLD ? 'medium'
    : 'low';

  reasons.sort((a, b) => b.weight - a.weight);

  return {
    deal,
    score,
    confidence,
    reasons: reasons.slice(0, 4),
    matchedLenderId: lenderHit?.id,
    matchedLenderName: lenderHit?.name,
    matchedParticipantCount,
    bodyMentionCount,
    domainHit,
    bestNameScore,
  };
}

export interface RankResult {
  best: DealEvidenceMatch | null;
  /** Other candidates within 15 points of best — used to decide "tie / require manual confirm". */
  closeRunnersUp: DealEvidenceMatch[];
  /** True when the best match is unambiguous (no close runner-up) AND ≥ HIGH. */
  shouldAutoLink: boolean;
  /** True when there's a viable medium-confidence pick the UI should surface as "Likely: …". */
  shouldSuggest: boolean;
}

export function rankDealsForThread(deals: Deal[], input: EvidenceInput): RankResult {
  const scored: DealEvidenceMatch[] = [];
  for (const d of deals) {
    const r = scoreDealAgainstThread(d, input);
    if (r) scored.push(r);
  }
  const ranked = rankActiveDuplicateFirst(scored);
  const best = ranked[0] || null;
  const closeRunnersUp = best
    ? ranked.slice(1).filter(s => best.score - s.score < 15).slice(0, 3)
    : [];

  const isTie = closeRunnersUp.length > 0;
  const shouldAutoLink = !!best && best.confidence === 'high' && !isTie;
  const shouldSuggest = !!best && (best.confidence === 'medium' || (best.confidence === 'high' && isTie));

  return { best, closeRunnersUp, shouldAutoLink, shouldSuggest };
}
