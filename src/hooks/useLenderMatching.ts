import { useMemo } from 'react';
import { MasterLender } from './useMasterLenders';

export interface DealCriteria {
  industry?: string;
  dealValue?: number;
  dealTypes?: string[]; // e.g., ["ABL", "Term Loan", etc.]
  capitalAsk?: string;
  geo?: string;
}

export interface LenderMatch {
  lender: MasterLender;
  score: number;
  matchReasons: string[];
  warnings: string[];
}

// Normalize industry strings for comparison
function normalizeIndustry(industry: string): string {
  return industry.toLowerCase().trim();
}

// Check if deal industry matches lender industries
function matchesIndustry(dealIndustry: string | undefined, lenderIndustries: string[] | null): boolean {
  if (!dealIndustry || !lenderIndustries || lenderIndustries.length === 0) return false;
  
  const normalizedDealIndustry = normalizeIndustry(dealIndustry);
  
  // Check for "Agnostic" which means they accept all industries
  if (lenderIndustries.some(i => normalizeIndustry(i) === 'agnostic')) {
    return true;
  }
  
  return lenderIndustries.some(lenderIndustry => {
    const normalized = normalizeIndustry(lenderIndustry);
    // Fuzzy match: check if one contains the other or they're similar
    return normalized.includes(normalizedDealIndustry) || 
           normalizedDealIndustry.includes(normalized) ||
           normalized === normalizedDealIndustry;
  });
}

// Check if deal industry is in lender's avoid list
function isIndustriesAvoided(dealIndustry: string | undefined, avoidIndustries: string[] | null): boolean {
  if (!dealIndustry || !avoidIndustries || avoidIndustries.length === 0) return false;
  
  const normalizedDealIndustry = normalizeIndustry(dealIndustry);
  
  return avoidIndustries.some(avoidIndustry => {
    const normalized = normalizeIndustry(avoidIndustry);
    return normalized.includes(normalizedDealIndustry) || 
           normalizedDealIndustry.includes(normalized);
  });
}

// Check if deal value falls within lender's deal size range
function matchesDealSize(dealValue: number | undefined, minDeal: number | null, maxDeal: number | null): boolean {
  if (!dealValue) return false;
  
  // Convert to same units (assume database values in dollars, deal might be in dollars)
  const value = dealValue;
  
  const meetsMin = minDeal === null || value >= minDeal;
  const meetsMax = maxDeal === null || value <= maxDeal;
  
  return meetsMin && meetsMax;
}

// Check deal type matching (loan types)
function matchesLoanType(dealTypes: string[] | undefined, lenderLoanTypes: string[] | null): boolean {
  if (!dealTypes || dealTypes.length === 0 || !lenderLoanTypes || lenderLoanTypes.length === 0) {
    return false;
  }
  
  // Normalize and check for matches
  const normalizedDealTypes = dealTypes.map(t => t.toLowerCase().trim());
  const normalizedLenderTypes = lenderLoanTypes.map(t => t.toLowerCase().trim());
  
  return normalizedDealTypes.some(dealType => 
    normalizedLenderTypes.some(lenderType => 
      lenderType.includes(dealType) || dealType.includes(lenderType)
    )
  );
}

// Parse capital ask to numeric value
function parseCapitalAsk(capitalAsk: string | undefined): number | null {
  if (!capitalAsk) return null;
  
  // Remove $ and common characters, parse number
  const cleaned = capitalAsk.replace(/[$,\s]/g, '').toLowerCase();
  
  // Handle millions notation
  if (cleaned.includes('m')) {
    const num = parseFloat(cleaned.replace('m', ''));
    return isNaN(num) ? null : num * 1000000;
  }
  
  // Handle thousands notation
  if (cleaned.includes('k')) {
    const num = parseFloat(cleaned.replace('k', ''));
    return isNaN(num) ? null : num * 1000;
  }
  
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

export function calculateLenderMatch(
  lender: MasterLender,
  criteria: DealCriteria
): LenderMatch {
  const matchReasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;
  
  // 1. Industry match (high weight)
  if (criteria.industry) {
    if (isIndustriesAvoided(criteria.industry, lender.industries_to_avoid)) {
      warnings.push(`Avoids ${criteria.industry} industry`);
      score -= 30; // Penalty for avoided industry
    } else if (matchesIndustry(criteria.industry, lender.industries)) {
      matchReasons.push(`Matches industry: ${criteria.industry}`);
      score += 25;
    } else if (lender.industries?.some(i => normalizeIndustry(i) === 'agnostic')) {
      matchReasons.push('Industry agnostic');
      score += 15;
    }
  }
  
  // 2. Deal size match (high weight)
  const capitalValue = parseCapitalAsk(criteria.capitalAsk) || criteria.dealValue;
  if (capitalValue) {
    if (matchesDealSize(capitalValue, lender.min_deal, lender.max_deal)) {
      const range = [];
      if (lender.min_deal) range.push(`$${(lender.min_deal / 1000).toFixed(0)}K`);
      if (lender.max_deal) range.push(`$${(lender.max_deal / 1000000).toFixed(1)}M`);
      matchReasons.push(`Deal size in range${range.length > 0 ? `: ${range.join(' - ')}` : ''}`);
      score += 25;
    } else {
      if (lender.min_deal && capitalValue < lender.min_deal) {
        warnings.push(`Below min deal size ($${(lender.min_deal / 1000).toFixed(0)}K)`);
        score -= 10;
      }
      if (lender.max_deal && capitalValue > lender.max_deal) {
        warnings.push(`Above max deal size ($${(lender.max_deal / 1000000).toFixed(1)}M)`);
        score -= 10;
      }
    }
  }
  
  // 3. Loan type match (medium weight)
  if (criteria.dealTypes && criteria.dealTypes.length > 0) {
    if (matchesLoanType(criteria.dealTypes, lender.loan_types)) {
      matchReasons.push(`Offers matching loan types`);
      score += 20;
    }
  } else if (lender.loan_types && lender.loan_types.length > 0) {
    // Give some points for having defined loan types
    score += 5;
  }
  
  // 4. Geography match (medium weight)
  if (criteria.geo && lender.geo) {
    const dealGeo = criteria.geo.toLowerCase();
    const lenderGeo = lender.geo.toLowerCase();
    if (lenderGeo.includes('us') || lenderGeo.includes('united states') || 
        lenderGeo.includes(dealGeo) || dealGeo.includes(lenderGeo)) {
      matchReasons.push('Geographic coverage match');
      score += 10;
    }
  }
  
  // 5. Has contact information (bonus)
  if (lender.email && lender.contact_name) {
    score += 5;
  }
  
  // 6. Has one-pager (bonus)
  if (lender.lender_one_pager_url) {
    score += 3;
  }
  
  return {
    lender,
    score,
    matchReasons,
    warnings,
  };
}

export function useLenderMatching(
  masterLenders: MasterLender[],
  criteria: DealCriteria,
  options: {
    minScore?: number;
    maxResults?: number;
    excludeNames?: string[];
  } = {}
) {
  const { minScore = 0, maxResults = 20, excludeNames = [] } = options;
  
  const matches = useMemo(() => {
    if (!masterLenders.length) return [];
    
    // Filter out already-added lenders
    const normalizedExcludeNames = excludeNames.map(n => n.toLowerCase().trim());
    const eligibleLenders = masterLenders.filter(
      lender => !normalizedExcludeNames.includes(lender.name.toLowerCase().trim())
    );
    
    // Calculate match scores
    const scoredLenders = eligibleLenders.map(lender => 
      calculateLenderMatch(lender, criteria)
    );
    
    // Sort by score descending and filter by minimum score
    return scoredLenders
      .filter(match => match.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }, [masterLenders, criteria, minScore, maxResults, excludeNames]);
  
  return {
    matches,
    hasMatches: matches.length > 0,
    topMatch: matches[0] || null,
  };
}
