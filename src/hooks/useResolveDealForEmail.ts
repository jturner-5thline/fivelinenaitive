import { useCallback } from 'react';
import { useDealsContext } from '@/contexts/DealsContext';
import type { Deal } from '@/types/deal';
import {
  rankDealsForThread,
  type EvidenceMessage,
  type EvidenceReason,
  type ConfidenceBand,
} from '@/lib/dealEvidenceMatcher';

export interface ResolvedDealCandidate {
  deal: Deal;
  score: number;
  domainMatch: boolean;
  nameMatch: boolean;
  /** Confidence band from the evidence engine. */
  confidence?: ConfidenceBand;
  /** Top weighted reasons explaining the match. */
  reasons?: EvidenceReason[];
}

/**
 * Resolve the deal that an email draft is most likely associated with.
 *
 * Delegates to the weighted-evidence matcher (subject, sender + recipient
 * domains, repeated body mentions, affiliated participants, lender contacts)
 * and returns up to 5 ranked candidates above the medium-confidence floor.
 */
export function useResolveDealForEmail() {
  const { deals } = useDealsContext();

  return useCallback((args: {
    subject: string;
    senderEmail?: string;
    detectedEmail?: string;
    /** Optional additional messages from the thread for richer scoring. */
    messages?: EvidenceMessage[];
  }): ResolvedDealCandidate[] => {
    // Synthesize an evidence-message list from the legacy args and merge with
    // any caller-provided thread messages.
    const synthetic: EvidenceMessage[] = [{
      subject: args.subject,
      fromEmail: args.senderEmail,
      isLatest: true,
      // Treat the detected email as a recipient signal so its domain
      // contributes weight (e.g. an email pulled from the body that points
      // back to the borrower).
      toEmails: args.detectedEmail ? [args.detectedEmail] : undefined,
    }];
    const messages = [...synthetic, ...(args.messages || [])];

    const ranked = rankDealsForThread(deals || [], {
      subject: args.subject,
      messages,
    });

    const all = ranked.best
      ? [ranked.best, ...ranked.closeRunnersUp]
      : [];

    return all
      .filter(m => m.confidence !== 'low')
      .slice(0, 5)
      .map(m => ({
        deal: m.deal,
        score: m.score,
        domainMatch: m.domainHit,
        nameMatch: m.bestNameScore >= 0.5,
        confidence: m.confidence,
        reasons: m.reasons,
      }));
  }, [deals]);
}