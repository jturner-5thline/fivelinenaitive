import { useCallback } from 'react';
import { useDealsContext } from '@/contexts/DealsContext';
import {
  extractCompanyFromSubject,
  fuzzyNameScore,
  normalizeDomain,
} from '@/lib/detectDraftEmails';
import type { Deal } from '@/types/deal';

export interface ResolvedDealCandidate {
  deal: Deal;
  score: number;
  domainMatch: boolean;
  nameMatch: boolean;
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

/**
 * Resolve the deal that an email draft is most likely associated with.
 *
 * Hybrid match:
 *   • Subject-derived company token vs deal.company / deal.name (fuzzy).
 *   • Detected/sender domain vs deal.companyUrl host (exact).
 *   • Prefers candidates that satisfy both.
 */
export function useResolveDealForEmail() {
  const { deals } = useDealsContext();

  return useCallback((args: {
    subject: string;
    senderEmail?: string;
    detectedEmail?: string;
  }): ResolvedDealCandidate[] => {
    const subjectCompany = extractCompanyFromSubject(args.subject || '');
    const senderDomain = normalizeDomain(args.senderEmail?.split('@')[1] || '');
    const detectedDomain = normalizeDomain(args.detectedEmail?.split('@')[1] || '');
    const candidateDomains = [senderDomain, detectedDomain].filter(Boolean);

    const scored: ResolvedDealCandidate[] = (deals || []).map(deal => {
      const dDomain = dealDomain(deal);
      const domainMatch = !!dDomain && candidateDomains.some(d => d === dDomain || dDomain.endsWith(`.${d}`) || d.endsWith(`.${dDomain}`));
      const nameScore = Math.max(
        fuzzyNameScore(subjectCompany, deal.company || ''),
        fuzzyNameScore(subjectCompany, deal.name || ''),
      );
      const nameMatch = nameScore >= 0.5;
      let score = 0;
      if (domainMatch) score += 100;
      score += nameScore * 60;
      if (domainMatch && nameMatch) score += 30;
      return { deal, score, domainMatch, nameMatch };
    });

    return scored
      .filter(c => c.score >= 30)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [deals]);
}