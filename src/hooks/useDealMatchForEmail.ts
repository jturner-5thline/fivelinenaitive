import { useMemo } from 'react';
import { useDealsContext } from '@/contexts/DealsContext';
import type { Deal, DealStatus } from '@/types/deal';
import {
  rankDealsForThread,
  type EvidenceMessage,
  type EvidenceReason,
  type ConfidenceBand,
} from '@/lib/dealEvidenceMatcher';

export interface DealMatch {
  deal: Deal;
  /** Confidence score 0-100 */
  score: number;
  confidence: ConfidenceBand;
  /** Legacy compact reason label kept for backward compatibility with older UI. */
  reason: 'domain' | 'name' | 'domain+name' | 'thread';
  /** Top weighted reasons explaining the match (new evidence model). */
  reasons: EvidenceReason[];
  /** True when the engine recommends auto-linking the thread to this deal. */
  shouldAutoLink: boolean;
  /** True when the UI should render this as "Likely: …" with a confirm action. */
  shouldSuggest: boolean;
  /** Lender row on this deal whose contact email/name matched the sender, if any */
  matchedLenderId?: string;
  matchedLenderName?: string;
}

export interface EmailMatchInput {
  subject?: string;
  fromEmail?: string;
  fromName?: string;
  /** Optional richer thread context — newest message first. */
  messages?: EvidenceMessage[];
}

/**
 * Resolve the most likely deal for a single inbox email using a hybrid of:
 *   • Subject-derived company token vs deal.company / deal.name (fuzzy)
 *   • Sender domain vs deal.companyUrl host (exact / sub-domain)
 *   • Sender email/name vs any deal_lender contact on the deal
 *
 * When `messages` is supplied this delegates to the weighted-evidence engine
 * which also considers recipient domains, repeated body mentions, and
 * affiliated participants. Returns null when no candidate clears the
 * medium-confidence threshold so unmatched emails render with no badge.
 */
export function useDealMatchForEmail(input: EmailMatchInput): DealMatch | null {
  const { deals } = useDealsContext();

  return useMemo(() => {
    if (!deals?.length) return null;

    // If caller didn't provide a richer message list, synthesize a single
    // "latest message" from the legacy fields so the engine still gets
    // sender-domain + subject signals.
    const messages: EvidenceMessage[] = input.messages && input.messages.length
      ? input.messages
      : [{
          subject: input.subject,
          fromEmail: input.fromEmail,
          fromName: input.fromName,
          isLatest: true,
        }];

    const ranked = rankDealsForThread(deals, {
      subject: input.subject,
      messages,
    });

    const best = ranked.best;
    if (!best || best.confidence === 'low') return null;

    const hasDomain = best.reasons.some(r => r.kind === 'sender_domain' || r.kind === 'recipient_domain');
    const hasName = best.reasons.some(r => r.kind === 'subject_company' || r.kind === 'subject_partial');
    const hasThreadOnly = !hasDomain && !hasName && best.reasons.length > 0;
    const reason: DealMatch['reason'] = hasThreadOnly
      ? 'thread'
      : hasDomain && hasName ? 'domain+name'
      : hasDomain ? 'domain' : 'name';

    return {
      deal: best.deal,
      score: best.score,
      confidence: best.confidence,
      reason,
      reasons: best.reasons,
      shouldAutoLink: ranked.shouldAutoLink,
      shouldSuggest: ranked.shouldSuggest,
      matchedLenderId: best.matchedLenderId,
      matchedLenderName: best.matchedLenderName,
    };
  }, [deals, input.subject, input.fromEmail, input.fromName, input.messages]);
}

/** Map deal.status -> short label + tone for the badge. */
export function dealStatusBadgeMeta(status: DealStatus | string | undefined): {
  label: string;
  className: string;
} {
  switch (status) {
    case 'on-track':
      return { label: 'On Track', className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' };
    case 'at-risk':
      return { label: 'At Risk', className: 'bg-amber-500/10 text-amber-500 border-amber-500/30' };
    case 'off-track':
      return { label: 'Off Track', className: 'bg-red-500/10 text-red-500 border-red-500/30' };
    case 'on-hold':
      return { label: 'On Hold', className: 'bg-muted text-muted-foreground border-border' };
    case 'archived':
      return { label: 'Archived', className: 'bg-muted text-muted-foreground border-border' };
    default:
      return { label: 'Active', className: 'bg-primary/10 text-primary border-primary/30' };
  }
}