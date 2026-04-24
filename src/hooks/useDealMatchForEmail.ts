import { useMemo } from 'react';
import { useDealsContext } from '@/contexts/DealsContext';
import {
  extractCompanyFromSubject,
  fuzzyNameScore,
  normalizeDomain,
} from '@/lib/detectDraftEmails';
import type { Deal, DealStatus } from '@/types/deal';

export interface DealMatch {
  deal: Deal;
  /** Confidence score 0-100 */
  score: number;
  confidence: 'high' | 'medium' | 'low';
  /** Why we matched: domain match, name match, or both */
  reason: 'domain' | 'name' | 'domain+name';
  /** Lender row on this deal whose contact email/name matched the sender, if any */
  matchedLenderId?: string;
  matchedLenderName?: string;
}

export interface EmailMatchInput {
  subject?: string;
  fromEmail?: string;
  fromName?: string;
}

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

const HIGH_THRESHOLD = 95;
const MEDIUM_THRESHOLD = 55;

/**
 * Resolve the most likely deal for a single inbox email using a hybrid of:
 *   • Subject-derived company token vs deal.company / deal.name (fuzzy)
 *   • Sender domain vs deal.companyUrl host (exact / sub-domain)
 *   • Sender email/name vs any deal_lender contact on the deal
 *
 * Returns null when no candidate clears the medium-confidence threshold so
 * unmatched emails render with no badge.
 */
export function useDealMatchForEmail(input: EmailMatchInput): DealMatch | null {
  const { deals } = useDealsContext();

  return useMemo(() => {
    if (!deals?.length) return null;
    const subjectCompany = extractCompanyFromSubject(input.subject || '');
    const senderDomain = normalizeDomain((input.fromEmail || '').split('@')[1] || '');
    const senderEmail = (input.fromEmail || '').toLowerCase();
    const senderName = (input.fromName || '').toLowerCase();

    let best: DealMatch | null = null;

    for (const deal of deals) {
      const dDomain = dealDomain(deal);
      const domainMatch = !!dDomain && !!senderDomain && (
        senderDomain === dDomain
        || dDomain.endsWith(`.${senderDomain}`)
        || senderDomain.endsWith(`.${dDomain}`)
      );

      const nameScore = Math.max(
        fuzzyNameScore(subjectCompany, deal.company || ''),
        fuzzyNameScore(subjectCompany, deal.name || ''),
      );
      const nameMatch = nameScore >= 0.55;

      // Lender contact match on this deal
      let lenderHit: { id: string; name: string } | undefined;
      if (deal.lenders && (senderEmail || senderName)) {
        for (const l of deal.lenders) {
          const ln = (l.name || '').toLowerCase();
          if (!ln) continue;
          if (senderName && (ln === senderName || senderName.includes(ln) || ln.includes(senderName))) {
            lenderHit = { id: l.id, name: l.name };
            break;
          }
        }
      }

      let score = 0;
      if (domainMatch) score += 70;
      score += nameScore * 50;
      if (domainMatch && nameMatch) score += 25;
      if (lenderHit) score += 30;

      if (score < MEDIUM_THRESHOLD) continue;

      const reason: DealMatch['reason'] = domainMatch && nameMatch
        ? 'domain+name'
        : domainMatch ? 'domain' : 'name';
      const confidence: DealMatch['confidence'] = score >= HIGH_THRESHOLD
        ? 'high' : score >= MEDIUM_THRESHOLD ? 'medium' : 'low';

      const candidate: DealMatch = {
        deal,
        score,
        confidence,
        reason,
        matchedLenderId: lenderHit?.id,
        matchedLenderName: lenderHit?.name,
      };
      if (!best || candidate.score > best.score) best = candidate;
    }
    return best;
  }, [deals, input.subject, input.fromEmail, input.fromName]);
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