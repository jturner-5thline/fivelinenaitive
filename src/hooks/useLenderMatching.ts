import { useMemo, useEffect, useState } from 'react';
import { MasterLender } from './useMasterLenders';
import { supabase } from '@/integrations/supabase/client';
import { LenderPassPattern, LenderPassReasonCategory } from './useLenderDisqualifications';
import { filterEligibleLenders, dealCriteriaToFilterInput, countCriteriaMatches } from '@/utils/lenderEligibilityFilter';

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
  sponsorship?: string; // "Sponsored", "Non-Sponsored", "Both", etc.
}

export interface LenderMatch {
  lender: MasterLender;
  score: number;
  matchReasons: string[];
  warnings: string[];
  learningWarnings: LenderPassPattern[];
}

// Normalize strings for comparison (hyphens → spaces for ID-to-label matching)
function normalizeString(str: string): string {
  return str.toLowerCase().replace(/-/g, ' ').trim();
}

// Check if deal industry matches lender industries
function matchesIndustry(dealIndustry: string | undefined, lenderIndustries: string[] | null): boolean {
  if (!dealIndustry || !lenderIndustries || lenderIndustries.length === 0) return false;
  
  const normalizedDealIndustry = normalizeString(dealIndustry);
  
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

function isIndustriesAvoided(dealIndustry: string | undefined, avoidIndustries: string[] | null): boolean {
  if (!dealIndustry || !avoidIndustries || avoidIndustries.length === 0) return false;
  
  const normalizedDealIndustry = normalizeString(dealIndustry);
  
  return avoidIndustries.some(avoidIndustry => {
    const normalized = normalizeString(avoidIndustry);
    return normalized.includes(normalizedDealIndustry) || 
           normalizedDealIndustry.includes(normalized);
  });
}

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

function matchesCashBurn(dealCashBurnOk: boolean | undefined, lenderCashBurn: string | null): { matches: boolean; warning: boolean } {
  if (dealCashBurnOk === undefined) return { matches: false, warning: false };
  if (!lenderCashBurn) return { matches: false, warning: false };
  
  const normalized = normalizeString(lenderCashBurn);
  const lenderAcceptsCashBurn = normalized.includes('yes') || normalized.includes('ok') || normalized === 'y';
  
  if (lenderAcceptsCashBurn) {
    return { matches: true, warning: false };
  }
  
  if (dealCashBurnOk === true) {
    return { matches: false, warning: true };
  }
  
  return { matches: true, warning: false };
}

function matchesSponsorship(dealSponsorship: string | undefined, lenderSponsorship: string | null): { matches: boolean; warning: boolean } {
  if (!dealSponsorship || !lenderSponsorship) return { matches: false, warning: false };
  
  const normalizedDeal = normalizeString(dealSponsorship);
  const normalizedLender = normalizeString(lenderSponsorship);
  
  if (normalizedLender.includes('both') || normalizedLender.includes('either') || normalizedLender.includes('agnostic')) {
    return { matches: true, warning: false };
  }
  
  const dealIsSponsored = normalizedDeal.includes('sponsor') && !normalizedDeal.includes('non');
  const dealIsNonSponsored = normalizedDeal.includes('non-sponsor') || normalizedDeal.includes('non sponsor') || normalizedDeal === 'non-sponsored';
  
  const lenderWantsSponsored = normalizedLender.includes('sponsor') && !normalizedLender.includes('non');
  const lenderWantsNonSponsored = normalizedLender.includes('non-sponsor') || normalizedLender.includes('non sponsor');
  const lenderPrefersBoth = normalizedLender.includes('both') || normalizedLender.includes('either');
  
  if (lenderPrefersBoth) {
    return { matches: true, warning: false };
  }
  
  if (dealIsSponsored && lenderWantsSponsored) {
    return { matches: true, warning: false };
  }
  
  if (dealIsNonSponsored && lenderWantsNonSponsored) {
    return { matches: true, warning: false };
  }
  
  if ((dealIsSponsored && lenderWantsNonSponsored) || (dealIsNonSponsored && lenderWantsSponsored)) {
    return { matches: false, warning: true };
  }
  
  return { matches: false, warning: false };
}

function matchesGeography(dealGeo: string | undefined, lenderGeo: string | null): boolean {
  if (!dealGeo || !lenderGeo) return false;
  
  const normalizedDeal = normalizeString(dealGeo);
  const normalizedLender = normalizeString(lenderGeo);
  
  if (normalizedLender.includes('us') || normalizedLender.includes('united states') || 
      normalizedLender.includes('global') || normalizedLender.includes('nationwide')) {
    return true;
  }
  
  return normalizedLender.includes(normalizedDeal) || normalizedDeal.includes(normalizedLender);
}

function matchesB2bB2c(dealB2bB2c: string | undefined, lenderB2bB2c: string | null): { matches: boolean; partial: boolean } {
  if (!dealB2bB2c || !lenderB2bB2c) return { matches: false, partial: false };
  
  const normalizedDeal = normalizeString(dealB2bB2c);
  const normalizedLender = normalizeString(lenderB2bB2c);
  
  if (normalizedLender.includes('both') || (normalizedLender.includes('b2b') && normalizedLender.includes('b2c'))) {
    return { matches: true, partial: false };
  }
  
  if (normalizedLender.includes(normalizedDeal) || normalizedDeal.includes(normalizedLender)) {
    return { matches: true, partial: false };
  }
  
  return { matches: false, partial: false };
}

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

const WEIGHTS = {
  DEAL_SIZE: 50,
  LOAN_TYPE: 40,
  CASH_BURN: 30,
  INDUSTRY: 25,
  SPONSORSHIP: 20,
  GEOGRAPHY: 10,
  B2B_B2C: 8,
  COMPANY_REQ: 5,
  CONTACT_INFO: 3,
  ONE_PAGER: 2,
};

const PENALTIES = {
  INDUSTRY_AVOIDED: -50,
  BELOW_MIN_DEAL: -30,
  ABOVE_MAX_DEAL: -30,
  CASH_BURN_MISMATCH: -25,
  SPONSORSHIP_MISMATCH: -20,
};

export function calculateLenderMatch(
  lender: MasterLender,
  criteria: DealCriteria,
  learningPatterns?: LenderPassPattern[]
): LenderMatch | null {
  const matchReasons: string[] = [];
  const warnings: string[] = [];
  const learningWarnings: LenderPassPattern[] = [];
  let score = 0;
  
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
    score += 5;
  }
  
  if (criteria.dealTypes && criteria.dealTypes.length > 0) {
    const isGrowthCapital = criteria.dealTypes.some(dt => 
      normalizeString(dt).includes('growth capital') || 
      normalizeString(dt) === 'growth'
    );
    
    if (isGrowthCapital) {
      const lenderOffersGrowthCapital = lender.loan_types?.some(lt => 
        normalizeString(lt).includes('growth capital') || 
        normalizeString(lt) === 'growth'
      );
      
      if (!lenderOffersGrowthCapital) {
        warnings.push('Does not offer Growth Capital');
        score += -200;
      } else {
        matchReasons.push('Offers Growth Capital');
        score += WEIGHTS.LOAN_TYPE;
      }
    } else if (matchesLoanType(criteria.dealTypes, lender.loan_types)) {
      matchReasons.push('Matching loan types');
      score += WEIGHTS.LOAN_TYPE;
    }
  } else if (lender.loan_types && lender.loan_types.length > 0) {
    score += 3;
  }
  
  if (criteria.dealTypes && criteria.dealTypes.length > 0) {
    const dealIncludesRefinancing = criteria.dealTypes.some(dt =>
      normalizeString(dt).includes('refinanc')
    );
    if (dealIncludesRefinancing && lender.refinancing) {
      const refinancingNorm = normalizeString(lender.refinancing);
      if (refinancingNorm.includes("don't like") || refinancingNorm.includes('dont like') || refinancingNorm.includes('do not like')) {
        warnings.push('Does not like refinancing');
        score += -200;
      }
    }
  }

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
  
  if (criteria.industry) {
    if (isIndustriesAvoided(criteria.industry, lender.industries_to_avoid)) {
      return null;
    } else if (matchesIndustry(criteria.industry, lender.industries)) {
      matchReasons.push(`${criteria.industry} industry`);
      score += WEIGHTS.INDUSTRY;
    } else if (lender.industries?.some(i => normalizeString(i) === 'agnostic')) {
      matchReasons.push('Industry agnostic');
      score += WEIGHTS.INDUSTRY * 0.6;
    }
  }
  
  if (criteria.sponsorship) {
    const sponsorshipResult = matchesSponsorship(criteria.sponsorship, lender.sponsorship);
    if (sponsorshipResult.matches) {
      matchReasons.push(`${criteria.sponsorship} deals`);
      score += WEIGHTS.SPONSORSHIP;
    } else if (sponsorshipResult.warning) {
      warnings.push(`Sponsorship mismatch`);
      score += PENALTIES.SPONSORSHIP_MISMATCH;
    }
  }
  
  if (criteria.geo) {
    if (matchesGeography(criteria.geo, lender.geo)) {
      matchReasons.push('Geographic coverage');
      score += WEIGHTS.GEOGRAPHY;
    }
  }
  
  if (criteria.b2bB2c) {
    const b2bResult = matchesB2bB2c(criteria.b2bB2c, lender.b2b_b2c);
    if (b2bResult.matches) {
      matchReasons.push(`${criteria.b2bB2c} focus`);
      score += WEIGHTS.B2B_B2C;
    }
  }
  
  if (criteria.companyRequirements && lender.company_requirements) {
    const dealReqs = normalizeString(criteria.companyRequirements);
    const lenderReqs = normalizeString(lender.company_requirements);
    
    const keywords = dealReqs.split(/\s+/).filter(w => w.length > 3);
    const matchedKeywords = keywords.filter(kw => lenderReqs.includes(kw));
    
    if (matchedKeywords.length > 0) {
      matchReasons.push('Requirements match');
      score += WEIGHTS.COMPANY_REQ;
    }
  }
  
  if (lender.email && lender.contact_name) {
    score += WEIGHTS.CONTACT_INFO;
  }
  
  if (lender.lender_one_pager_url) {
    score += WEIGHTS.ONE_PAGER;
  }
  
  if (lender.active === true) {
    score += 5;
  }
  
  if (learningPatterns && learningPatterns.length > 0) {
    const lenderPatterns = learningPatterns.filter(p => 
      (p.master_lender_id && p.master_lender_id === lender.id) ||
      p.lender_name.toLowerCase() === lender.name.toLowerCase()
    );
    
    for (const pattern of lenderPatterns) {
      let isRelevant = false;
      
      if (pattern.pattern_type === 'excluded_industry' && criteria.industry) {
        isRelevant = pattern.pattern_value.toLowerCase() === criteria.industry.toLowerCase();
      } else if (pattern.pattern_type === 'excluded_geography' && criteria.geo) {
        isRelevant = pattern.pattern_value.toLowerCase().includes(criteria.geo.toLowerCase()) ||
                     criteria.geo.toLowerCase().includes(pattern.pattern_value.toLowerCase());
      } else if (pattern.pattern_type === 'deal_size_range' && capitalValue) {
        const patternValue = parseFloat(pattern.pattern_value);
        if (!isNaN(patternValue)) {
          const difference = Math.abs(capitalValue - patternValue);
          const threshold = capitalValue * 0.3;
          isRelevant = difference <= threshold;
        }
      } else if (pattern.occurrence_count >= 2) {
        isRelevant = true;
      }
      
      if (isRelevant) {
        learningWarnings.push(pattern);
        const penalty = Math.round(-15 * pattern.confidence_score);
        score += penalty;
      }
    }
  }
  
  return {
    lender,
    score,
    matchReasons,
    warnings,
    learningWarnings,
  };
}

export function useLenderMatching(
  masterLenders: MasterLender[],
  criteria: DealCriteria,
  options: {
    minScore?: number;
    maxResults?: number;
    excludeNames?: string[];
    enableLearning?: boolean;
  } = {}
) {
  const { minScore = 0, maxResults = 100, excludeNames = [], enableLearning = true } = options;
  const [learningPatterns, setLearningPatterns] = useState<LenderPassPattern[]>([]);
  
  // Fetch learning patterns if enabled
  useEffect(() => {
    if (!enableLearning) return;
    
    const fetchPatterns = async () => {
      try {
        const { data, error } = await supabase
          .from('lender_pass_patterns')
          .select('*')
          .gte('confidence_score', 0.4)
          .order('confidence_score', { ascending: false });
        
        if (error) throw error;
        setLearningPatterns((data || []) as LenderPassPattern[]);
      } catch (error) {
        console.error('Error fetching learning patterns:', error);
      }
    };
    
    fetchPatterns();
  }, [enableLearning]);
  
  const matches = useMemo(() => {
    if (!masterLenders.length) return [];
    
    // Fix #2: Actually filter out lenders whose names match excludeNames
    const excludeNamesSet = new Set(excludeNames.map(n => n.toLowerCase().trim()));
    const nameFilteredLenders = excludeNamesSet.size > 0
      ? masterLenders.filter(l => !excludeNamesSet.has(l.name.toLowerCase().trim()))
      : masterLenders;
    
    // Apply criteria matching
    const filterInput = dealCriteriaToFilterInput(criteria, parseCapitalAsk);
    
    // Fix #1: Use specifiedCount for the pre-filter gate
    const criteriaScored = nameFilteredLenders
      .map(lender => ({
        lender,
        criteriaMatch: countCriteriaMatches(filterInput, lender),
      }))
      .filter(({ criteriaMatch }) => {
        const gate = Math.min(3, criteriaMatch.specifiedCount);
        return criteriaMatch.passed >= gate;
      });
    
    // Calculate match scores with learning data
    const scoredLenders = criteriaScored
      .map(({ lender, criteriaMatch }) => {
        const match = calculateLenderMatch(lender, criteria, enableLearning ? learningPatterns : undefined);
        if (!match) return null;
        return { ...match, criteriaPassed: criteriaMatch.passed };
      })
      .filter((match): match is LenderMatch & { criteriaPassed: number } => match !== null);
    
    // Sort by criteria passed descending (5/5 first), then by score
    return scoredLenders
      .filter(match => match.score >= minScore)
      .sort((a, b) => b.criteriaPassed - a.criteriaPassed || b.score - a.score)
      .slice(0, maxResults);
  }, [masterLenders, criteria, minScore, maxResults, excludeNames, enableLearning, learningPatterns]);
  
  return {
    matches,
    hasMatches: matches.length > 0,
    topMatch: matches[0] || null,
    learningEnabled: enableLearning && learningPatterns.length > 0,
  };
}
