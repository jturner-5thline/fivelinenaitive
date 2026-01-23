import { useMemo } from 'react';
import { MasterLender } from './useMasterLenders';

export interface DealCriteria {
  industry?: string;
  dealValue?: number;
  dealTypes?: string[]; // e.g., ["ABL", "Term Loan", etc.]
  capitalAsk?: string;
  geo?: string;
  cashBurnOk?: boolean;
  b2bB2c?: string; // "B2B", "B2C", "Both", etc.
  companyRequirements?: string;
  revenue?: number;
}

export interface LenderMatch {
  lender: MasterLender;
  score: number;
  matchReasons: string[];
  warnings: string[];
}

// Normalize strings for comparison
function normalizeString(str: string): string {
  return str.toLowerCase().trim();
}

// Check if deal industry matches lender industries
function matchesIndustry(dealIndustry: string | undefined, lenderIndustries: string[] | null): boolean {
  if (!dealIndustry || !lenderIndustries || lenderIndustries.length === 0) return false;
  
  const normalizedDealIndustry = normalizeString(dealIndustry);
  
  // Check for "Agnostic" which means they accept all industries
  if (lenderIndustries.some(i => normalizeString(i) === 'agnostic')) {
    return true;
  }
  
  return lenderIndustries.some(lenderIndustry => {
    const normalized = normalizeString(lenderIndustry);
    return normalized.includes(normalizedDealIndustry) || 
           normalizedDealIndustry.includes(normalized) ||
           normalized === normalizedDealIndustry;
  });
}

// Check if deal industry is in lender's avoid list
function isIndustriesAvoided(dealIndustry: string | undefined, avoidIndustries: string[] | null): boolean {
  if (!dealIndustry || !avoidIndustries || avoidIndustries.length === 0) return false;
  
  const normalizedDealIndustry = normalizeString(dealIndustry);
  
  return avoidIndustries.some(avoidIndustry => {
    const normalized = normalizeString(avoidIndustry);
    return normalized.includes(normalizedDealIndustry) || 
           normalizedDealIndustry.includes(normalized);
  });
}

// Check if deal value falls within lender's deal size range
function matchesDealSize(dealValue: number | undefined, minDeal: number | null, maxDeal: number | null): { matches: boolean; belowMin: boolean; aboveMax: boolean } {
  if (!dealValue) return { matches: false, belowMin: false, aboveMax: false };
  
  const value = dealValue;
  const belowMin = minDeal !== null && value < minDeal;
  const aboveMax = maxDeal !== null && value > maxDeal;
  
  return {
    matches: !belowMin && !aboveMax,
    belowMin,
    aboveMax,
  };
}

// Check deal type matching (loan types)
function matchesLoanType(dealTypes: string[] | undefined, lenderLoanTypes: string[] | null): boolean {
  if (!dealTypes || dealTypes.length === 0 || !lenderLoanTypes || lenderLoanTypes.length === 0) {
    return false;
  }
  
  const normalizedDealTypes = dealTypes.map(t => normalizeString(t));
  const normalizedLenderTypes = lenderLoanTypes.map(t => normalizeString(t));
  
  return normalizedDealTypes.some(dealType => 
    normalizedLenderTypes.some(lenderType => 
      lenderType.includes(dealType) || dealType.includes(lenderType)
    )
  );
}

// Check cash burn match
function matchesCashBurn(dealCashBurnOk: boolean | undefined, lenderCashBurn: string | null): { matches: boolean; warning: boolean } {
  // If deal needs cash burn ok
  if (dealCashBurnOk === true) {
    if (!lenderCashBurn) return { matches: false, warning: false };
    const normalized = normalizeString(lenderCashBurn);
    const matches = normalized.includes('yes') || normalized.includes('ok') || normalized === 'y';
    return { matches, warning: !matches };
  }
  return { matches: false, warning: false };
}

// Check geography match
function matchesGeography(dealGeo: string | undefined, lenderGeo: string | null): boolean {
  if (!dealGeo || !lenderGeo) return false;
  
  const normalizedDeal = normalizeString(dealGeo);
  const normalizedLender = normalizeString(lenderGeo);
  
  // Check for US/global coverage
  if (normalizedLender.includes('us') || normalizedLender.includes('united states') || 
      normalizedLender.includes('global') || normalizedLender.includes('nationwide')) {
    return true;
  }
  
  return normalizedLender.includes(normalizedDeal) || normalizedDeal.includes(normalizedLender);
}

// Check B2B/B2C match
function matchesB2bB2c(dealB2bB2c: string | undefined, lenderB2bB2c: string | null): { matches: boolean; partial: boolean } {
  if (!dealB2bB2c || !lenderB2bB2c) return { matches: false, partial: false };
  
  const normalizedDeal = normalizeString(dealB2bB2c);
  const normalizedLender = normalizeString(lenderB2bB2c);
  
  // Lender supports both
  if (normalizedLender.includes('both') || (normalizedLender.includes('b2b') && normalizedLender.includes('b2c'))) {
    return { matches: true, partial: false };
  }
  
  // Exact match
  if (normalizedLender.includes(normalizedDeal) || normalizedDeal.includes(normalizedLender)) {
    return { matches: true, partial: false };
  }
  
  return { matches: false, partial: false };
}

// Parse capital ask to numeric value
function parseCapitalAsk(capitalAsk: string | undefined): number | null {
  if (!capitalAsk) return null;
  
  const cleaned = capitalAsk.replace(/[$,\s]/g, '').toLowerCase();
  
  if (cleaned.includes('m')) {
    const num = parseFloat(cleaned.replace('m', ''));
    return isNaN(num) ? null : num * 1000000;
  }
  
  if (cleaned.includes('k')) {
    const num = parseFloat(cleaned.replace('k', ''));
    return isNaN(num) ? null : num * 1000;
  }
  
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// Scoring weights based on priority order
const WEIGHTS = {
  DEAL_SIZE: 30,        // Priority 1: Deal size range
  CASH_BURN: 25,        // Priority 2: Cash-burn OK
  LOAN_TYPE: 20,        // Priority 3: Loan Type
  GEOGRAPHY: 15,        // Priority 4: Geography
  INDUSTRY: 12,         // Priority 5: Industry
  B2B_B2C: 10,          // Priority 6: B2B vs B2C
  COMPANY_REQ: 8,       // Priority 7: Company requirements
  CONTACT_INFO: 3,      // Bonus: Contact info
  ONE_PAGER: 2,         // Bonus: One-pager available
};

const PENALTIES = {
  INDUSTRY_AVOIDED: -40,
  BELOW_MIN_DEAL: -20,
  ABOVE_MAX_DEAL: -20,
  CASH_BURN_MISMATCH: -15,
};

export function calculateLenderMatch(
  lender: MasterLender,
  criteria: DealCriteria
): LenderMatch {
  const matchReasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;
  
  // PRIORITY 1: Deal size match (highest weight)
  const capitalValue = parseCapitalAsk(criteria.capitalAsk) || criteria.dealValue;
  if (capitalValue) {
    const dealSizeResult = matchesDealSize(capitalValue, lender.min_deal, lender.max_deal);
    
    if (dealSizeResult.matches) {
      const range = [];
      if (lender.min_deal) range.push(`$${(lender.min_deal / 1000000).toFixed(1)}M`);
      if (lender.max_deal) range.push(`$${(lender.max_deal / 1000000).toFixed(1)}M`);
      matchReasons.push(`Deal size in range${range.length > 0 ? `: ${range.join(' - ')}` : ''}`);
      score += WEIGHTS.DEAL_SIZE;
    } else {
      if (dealSizeResult.belowMin) {
        warnings.push(`Below min ($${(lender.min_deal! / 1000000).toFixed(1)}M)`);
        score += PENALTIES.BELOW_MIN_DEAL;
      }
      if (dealSizeResult.aboveMax) {
        warnings.push(`Above max ($${(lender.max_deal! / 1000000).toFixed(1)}M)`);
        score += PENALTIES.ABOVE_MAX_DEAL;
      }
    }
  } else if (lender.min_deal || lender.max_deal) {
    // Partial credit for having deal range defined
    score += 5;
  }
  
  // PRIORITY 2: Cash-burn OK
  if (criteria.cashBurnOk !== undefined) {
    const cashBurnResult = matchesCashBurn(criteria.cashBurnOk, lender.cash_burn);
    if (cashBurnResult.matches) {
      matchReasons.push('Cash burn OK');
      score += WEIGHTS.CASH_BURN;
    } else if (criteria.cashBurnOk && cashBurnResult.warning) {
      warnings.push('May not accept cash burn');
      score += PENALTIES.CASH_BURN_MISMATCH;
    }
  }
  
  // PRIORITY 3: Loan type match
  if (criteria.dealTypes && criteria.dealTypes.length > 0) {
    if (matchesLoanType(criteria.dealTypes, lender.loan_types)) {
      matchReasons.push('Matching loan types');
      score += WEIGHTS.LOAN_TYPE;
    }
  } else if (lender.loan_types && lender.loan_types.length > 0) {
    score += 3;
  }
  
  // PRIORITY 4: Geography match
  if (criteria.geo) {
    if (matchesGeography(criteria.geo, lender.geo)) {
      matchReasons.push('Geographic coverage');
      score += WEIGHTS.GEOGRAPHY;
    }
  }
  
  // PRIORITY 5: Industry match
  if (criteria.industry) {
    if (isIndustriesAvoided(criteria.industry, lender.industries_to_avoid)) {
      warnings.push(`Avoids ${criteria.industry}`);
      score += PENALTIES.INDUSTRY_AVOIDED;
    } else if (matchesIndustry(criteria.industry, lender.industries)) {
      matchReasons.push(`${criteria.industry} industry`);
      score += WEIGHTS.INDUSTRY;
    } else if (lender.industries?.some(i => normalizeString(i) === 'agnostic')) {
      matchReasons.push('Industry agnostic');
      score += WEIGHTS.INDUSTRY * 0.6;
    }
  }
  
  // PRIORITY 6: B2B vs B2C match
  if (criteria.b2bB2c) {
    const b2bResult = matchesB2bB2c(criteria.b2bB2c, lender.b2b_b2c);
    if (b2bResult.matches) {
      matchReasons.push(`${criteria.b2bB2c} focus`);
      score += WEIGHTS.B2B_B2C;
    }
  }
  
  // PRIORITY 7: Company requirements (text match)
  if (criteria.companyRequirements && lender.company_requirements) {
    const dealReqs = normalizeString(criteria.companyRequirements);
    const lenderReqs = normalizeString(lender.company_requirements);
    
    // Simple keyword matching
    const keywords = dealReqs.split(/\s+/).filter(w => w.length > 3);
    const matchedKeywords = keywords.filter(kw => lenderReqs.includes(kw));
    
    if (matchedKeywords.length > 0) {
      matchReasons.push('Requirements match');
      score += WEIGHTS.COMPANY_REQ;
    }
  }
  
  // Bonus: Has contact information
  if (lender.email && lender.contact_name) {
    score += WEIGHTS.CONTACT_INFO;
  }
  
  // Bonus: Has one-pager
  if (lender.lender_one_pager_url) {
    score += WEIGHTS.ONE_PAGER;
  }
  
  // Bonus: Active lender
  if (lender.active === true) {
    score += 5;
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
  const { minScore = 0, maxResults = 100, excludeNames = [] } = options;
  
  const matches = useMemo(() => {
    if (!masterLenders.length) return [];
    
    // Filter out already-added lenders and inactive lenders
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
