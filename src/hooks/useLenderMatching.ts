import { useEffect, useMemo, useState } from 'react';
import { MasterLender } from './useMasterLenders';
import { supabase } from '@/integrations/supabase/client';
import { LenderPassPattern } from './useLenderDisqualifications';
import type { LenderOutcomeStats } from '@/lib/lenderMatchScore';
import { useLenderMatchCalibration } from '@/hooks/useLenderMatchCalibration';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DealCriteria {
  industry?: string;
  industryNormalized?: string;
  dealValue?: number;
  dealTypes?: string[];
  capitalAsk?: string;
  capitalAskAmount?: number;
  geo?: string;
  cashBurnOk?: boolean;
  b2bB2c?: string;
  companyRequirements?: string;
  revenue?: number;
  ebitda?: number;
  ttmRevenue?: number;
  ttmEbitda?: number;
  grossMarginPct?: number;
  sponsorship?: string;
  // Enriched fields for semantic matching
  companyDescription?: string;
  dealNotes?: string[];
  existingLenderFeedback?: string[];
  useOfFunds?: string;
  existingDebt?: string;
  grossMargins?: string;
  profitability?: string;
}

export type MatchTier = 'top' | 'strong' | 'possible' | 'weak';

export interface LenderMatch {
  lender: MasterLender;
  score: number;                // Rule-based score (0-100)
  semanticBonus: number;        // AI bonus (0-30)
  combinedScore: number;        // score + semanticBonus
  matchPercent: number;         // combinedScore / 130 * 100
  tier: MatchTier;
  matchReasons: string[];
  warnings: string[];
  learningWarnings: LenderPassPattern[];
  semanticReason?: string;      // AI-generated one-line reason
  semanticLoading?: boolean;    // True while AI is scoring
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeString(str: string): string {
  return str.toLowerCase().replace(/[-_]/g, ' ').trim();
}

function matchesGeography(dealGeo: string | undefined, lender: MasterLender): boolean {
  if (!dealGeo) return false;
  const normalizedDeal = normalizeString(dealGeo);
  const lenderGeographies = [...(lender.geographies || []), lender.geo || '']
    .map(normalizeString)
    .filter(Boolean);
  const excludedGeographies = (lender.geographies_excluded || []).map(normalizeString);
  if (excludedGeographies.some((geo) => geo === normalizedDeal || geo.includes(normalizedDeal) || normalizedDeal.includes(geo))) {
    return false;
  }
  const broad = ['us', 'usa', 'united states', 'global', 'nationwide', 'north america'];
  return lenderGeographies.some((geo) => broad.some((value) => geo.includes(value)) || geo.includes(normalizedDeal) || normalizedDeal.includes(geo));
}

function matchesIndustry(dealIndustry: string | undefined, lenderIndustries: string[] | null): boolean {
  if (!dealIndustry || !lenderIndustries || lenderIndustries.length === 0) return false;
  const normalized = normalizeString(dealIndustry);
  if (lenderIndustries.some(i => normalizeString(i) === 'agnostic')) return true;
  return lenderIndustries.some(li => {
    const n = normalizeString(li);
    return n.includes(normalized) || normalized.includes(n) || n === normalized;
  });
}

function isIndustriesAvoided(dealIndustry: string | undefined, avoidIndustries: string[] | null): boolean {
  if (!dealIndustry || !avoidIndustries || avoidIndustries.length === 0) return false;
  const normalized = normalizeString(dealIndustry);
  return avoidIndustries.some(ai => {
    const n = normalizeString(ai);
    return n.includes(normalized) || normalized.includes(n);
  });
}

function parseCapitalAsk(capitalAsk: string | undefined): number | null {
  if (!capitalAsk) return null;
  const cleaned = capitalAsk.replace(/[$,\s]/g, '').toLowerCase();
  if (cleaned.includes('m')) { const n = parseFloat(cleaned.replace('m', '')); return isNaN(n) ? null : n * 1000000; }
  if (cleaned.includes('k')) { const n = parseFloat(cleaned.replace('k', '')); return isNaN(n) ? null : n * 1000; }
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

// ─── Weights (total = 100) ────────────────────────────────────────────────────

const W = {
  DEAL_SIZE: 27,
  INDUSTRY: 22,
  LOAN_TYPE: 14,
  REVENUE: 9,
  SPONSORSHIP: 4,
  CASH_BURN: 4,
  GEO: 4,
  B2B_B2C: 3,
  REFINANCING: 3,
  TRACK_RECORD: 10,
} as const;

const MAX_RULE_SCORE = 100;
const MAX_SEMANTIC_BONUS = 30;
const MAX_COMBINED = MAX_RULE_SCORE + MAX_SEMANTIC_BONUS;

// ─── Tier thresholds (based on combined score) ────────────────────────────────

function getTier(combined: number): MatchTier {
  if (combined >= 90) return 'top';
  if (combined >= 70) return 'strong';
  if (combined >= 50) return 'possible';
  return 'weak';
}

// ─── Main scoring function ────────────────────────────────────────────────────

export function calculateLenderMatch(
  lender: MasterLender,
  criteria: DealCriteria,
  learningPatterns?: LenderPassPattern[],
  outcomeStats?: LenderOutcomeStats,
): Omit<LenderMatch, 'semanticBonus' | 'combinedScore' | 'matchPercent' | 'tier' | 'semanticReason' | 'semanticLoading'> | null {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const learningWarnings: LenderPassPattern[] = [];
  let score = 0;

  const dealTypes = (criteria.dealTypes || []).map(normalizeString);
  const lenderTypes = (lender.loan_types || []).map(normalizeString);
  const hasProductMismatch = dealTypes.length > 0 && lenderTypes.length > 0 && !dealTypes.some((dealType) =>
    lenderTypes.some((lenderType) => lenderType.includes(dealType) || dealType.includes(lenderType)),
  );
  const capitalValue = criteria.capitalAskAmount ?? parseCapitalAsk(criteria.capitalAsk) ?? criteria.dealValue;
  const belowMaterialMin = capitalValue != null && lender.min_deal != null && capitalValue < lender.min_deal * 0.5;
  const aboveMaterialMax = capitalValue != null && lender.max_deal != null && capitalValue > lender.max_deal * 2;
  const hasExcludedGeography = !!criteria.geo && (lender.geographies_excluded || []).some((geo) => {
    const dealGeo = normalizeString(criteria.geo || '');
    const excluded = normalizeString(geo);
    return excluded === dealGeo || excluded.includes(dealGeo) || dealGeo.includes(excluded);
  });
  const refinancingConflict = criteria.dealTypes?.some((type) => normalizeString(type).includes('refinanc')) &&
    !!lender.refinancing && /don't like|dont like|do not like/i.test(lender.refinancing);

  // Non-negotiable gates are applied before ranking so an ineligible source
  // cannot appear as a high-scoring recommendation.
  if (lender.active === false || lender.appetite_status === 'paused' || hasProductMismatch ||
      belowMaterialMin || aboveMaterialMax || hasExcludedGeography || refinancingConflict) {
    return null;
  }

  // ── Industry (25 pts) — check avoid first as hard disqualify ──
  const dealIndustry = criteria.industryNormalized || criteria.industry;
  if (dealIndustry) {
    if (isIndustriesAvoided(dealIndustry, lender.industries_to_avoid)) {
      return null; // Hard disqualify
    }
    if (matchesIndustry(dealIndustry, lender.industries)) {
      reasons.push(`${criteria.industry || dealIndustry} industry`);
      score += W.INDUSTRY;
    } else if (lender.industries?.some(i => normalizeString(i) === 'agnostic')) {
      reasons.push('Industry agnostic');
      score += Math.round(W.INDUSTRY * 0.6);
    }
  }

  // ── Deal Size (27 pts) ──
  if (capitalValue) {
    const min = lender.sweet_spot_min ?? lender.min_deal;
    const max = lender.sweet_spot_max ?? lender.max_deal;
    const belowMin = min != null && capitalValue < min;
    const aboveMax = max != null && capitalValue > max;

    if (!belowMin && !aboveMax && (min != null || max != null)) {
      const range: string[] = [];
      if (min != null) range.push(`$${(min / 1000000).toFixed(1)}M`);
      if (max != null) range.push(`$${(max / 1000000).toFixed(1)}M`);
      reasons.push(`Deal size fits${range.length ? `: ${range.join(' - ')}` : ''}`);
      score += W.DEAL_SIZE;
    } else if (belowMin || aboveMax) {
      const boundary = belowMin ? min : max;
      if (boundary != null) {
        const pctOff = Math.abs(capitalValue - boundary) / Math.max(1, boundary);
        if (pctOff <= 0.2) {
          reasons.push(`Deal size near ${belowMin ? 'minimum' : 'maximum'}`);
          score += Math.round(W.DEAL_SIZE * 0.5);
        } else {
          warnings.push(belowMin
            ? `Below min ($${(boundary / 1000000).toFixed(1)}M)`
            : `Above max ($${(boundary / 1000000).toFixed(1)}M)`);
          score -= 15;
        }
      }
    }
  }

  // ── Loan Type (15 pts) ──
  if (criteria.dealTypes && criteria.dealTypes.length > 0 && lender.loan_types && lender.loan_types.length > 0) {
    const normalizedDeal = criteria.dealTypes.map(t => normalizeString(t));
    const normalizedLender = lender.loan_types.map(t => normalizeString(t));
    const hasOverlap = normalizedDeal.some(dt =>
      normalizedLender.some(lt => lt.includes(dt) || dt.includes(lt))
    );

    if (hasOverlap) {
      reasons.push('Matching loan types');
      score += W.LOAN_TYPE;
    }

    // Growth Capital special handling
    const isGrowthCapital = normalizedDeal.some(dt => dt.includes('growth capital') || dt === 'growth');
    if (isGrowthCapital && !normalizedLender.some(lt => lt.includes('growth capital') || lt === 'growth')) {
      warnings.push('Does not offer Growth Capital');
      score -= 100;
    }
  }

  // ── Revenue / EBITDA / gross margin / leverage (10 pts) ──
  const revenue = criteria.ttmRevenue ?? criteria.revenue;
  const ebitda = criteria.ttmEbitda ?? criteria.ebitda;
  const hasFinancials = (revenue != null && revenue > 0) || (ebitda != null && ebitda > 0) || (criteria.grossMarginPct != null);
  if (hasFinancials) {
    const meetsMinRevenue = revenue == null || !lender.min_revenue || revenue >= lender.min_revenue;
    const meetsEbitda = ebitda == null || !lender.ebitda_min || ebitda >= lender.ebitda_min;
    const meetsGrossMargin = criteria.grossMarginPct == null || lender.min_gross_margin_pct == null || criteria.grossMarginPct >= lender.min_gross_margin_pct;
    if (meetsMinRevenue && meetsEbitda && meetsGrossMargin) {
      reasons.push('Revenue/EBITDA/margin fit');
      score += W.REVENUE;
    } else {
      if (!meetsMinRevenue) warnings.push(`Below min revenue ($${((lender.min_revenue || 0) / 1000000).toFixed(1)}M)`);
      if (!meetsEbitda) warnings.push(`Below min EBITDA ($${((lender.ebitda_min || 0) / 1000000).toFixed(1)}M)`);
      if (!meetsGrossMargin) warnings.push(`Below min gross margin (${lender.min_gross_margin_pct}%)`);
    }
  }

  // ── Sponsorship (5 pts) ──
  const lenderSponsorship = lender.sponsor_requirement || lender.sponsorship;
  if (criteria.sponsorship && lenderSponsorship) {
    const nd = normalizeString(criteria.sponsorship);
    const nl = normalizeString(lenderSponsorship);
    const lenderBoth = nl.includes('both') || nl.includes('either') || nl.includes('agnostic') || nl.includes('no preference');
    const dealSponsored = nd.includes('sponsor') && !nd.includes('non');
    const dealNon = nd.includes('non');
    const lenderSponsored = nl.includes('sponsor') && !nl.includes('non');
    const lenderNon = nl.includes('non');

    if (lenderBoth || (dealSponsored && lenderSponsored) || (dealNon && lenderNon)) {
      reasons.push(`${criteria.sponsorship} deals`);
      score += W.SPONSORSHIP;
    } else if ((dealSponsored && lenderNon) || (dealNon && lenderSponsored)) {
      warnings.push('Sponsorship mismatch');
      score -= 10;
    }
  }

  // ── Cash Burn (5 pts) ──
  if (criteria.cashBurnOk !== undefined && lender.cash_burn) {
    const nl = normalizeString(lender.cash_burn);
    const lenderOk = nl.includes('yes') || nl.includes('ok') || nl === 'y';
    if (lenderOk) {
      reasons.push('Cash burn OK');
      score += W.CASH_BURN;
    } else if (criteria.cashBurnOk) {
      warnings.push('May not accept cash burn');
      score -= 10;
    }
  }

  // ── Geography (5 pts) ──
  if (criteria.geo) {
    if (matchesGeography(criteria.geo, lender)) {
      reasons.push('Geographic coverage');
      score += W.GEO;
    } else if (lender.geographies_excluded?.length) {
      warnings.push('Geography excluded');
    }
  }

  // ── B2B/B2C (3 pts) ──
  if (criteria.b2bB2c && lender.b2b_b2c) {
    const nd = normalizeString(criteria.b2bB2c);
    const nl = normalizeString(lender.b2b_b2c);
    if (nl.includes('both') || (nl.includes('b2b') && nl.includes('b2c')) || nl.includes(nd) || nd.includes(nl)) {
      reasons.push(`${criteria.b2bB2c} focus`);
      score += W.B2B_B2C;
    }
  }

  // ── Refinancing (2 pts) ──
  if (criteria.dealTypes?.some(dt => normalizeString(dt).includes('refinanc')) && lender.refinancing) {
    const rn = normalizeString(lender.refinancing);
    if (rn.includes("don't like") || rn.includes('dont like') || rn.includes('do not like')) {
      warnings.push('Does not like refinancing');
      score -= 100;
    } else {
      score += W.REFINANCING;
    }
  }

  // ── Bonus for active / contact info ──
  if (lender.active === true && lender.appetite_status !== 'paused') score += 2;
  if (lender.email && lender.contact_name) score += 1;

  // ── Learning patterns ──
  if (learningPatterns?.length) {
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
        const pv = parseFloat(pattern.pattern_value);
        if (!isNaN(pv)) isRelevant = Math.abs(capitalValue - pv) <= capitalValue * 0.3;
      } else if (pattern.occurrence_count >= 2) {
        isRelevant = true;
      }
      if (isRelevant) {
        learningWarnings.push(pattern);
        score += Math.round(-15 * pattern.confidence_score);
      }
    }
  }

  // ── Historical track record (10 pts) ──
  if (outcomeStats?.engagements) {
    const engagements = Math.max(0, outcomeStats.engagements);
    const positive = Math.min(engagements, Math.max(0, outcomeStats.terms_count ?? 0) + Math.max(0, outcomeStats.funded_count ?? 0));
    const confidence = Math.min(1, engagements / 5);
    const successRate = positive / engagements;
    score += Math.round(W.TRACK_RECORD * (0.35 * confidence + 0.65 * successRate));
    reasons.push(`Track record: ${outcomeStats.funded_count ?? 0} funded, ${outcomeStats.terms_count ?? 0} terms`);
  }

  // Clamp rule score to 0-100 range for tier calculation
  const clampedScore = Math.max(0, Math.min(MAX_RULE_SCORE, score));

  return {
    lender,
    score: clampedScore,
    matchReasons: reasons,
    warnings,
    learningWarnings,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

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
  const { minScore = 30, maxResults = 100, excludeNames = [], enableLearning = true } = options;
  useLenderMatchCalibration(enableLearning);
  const [learningPatterns, setLearningPatterns] = useState<LenderPassPattern[]>([]);
  const [outcomeStats, setOutcomeStats] = useState<LenderOutcomeStats[]>([]);

  useEffect(() => {
    if (!enableLearning) {
      setLearningPatterns([]);
      setOutcomeStats([]);
      return;
    }
    const fetchLearningData = async () => {
      try {
        const [{ data: patterns, error: patternsError }, { data: stats, error: statsError }] = await Promise.all([
          supabase
            .from('lender_pass_patterns')
            .select('*')
            .gte('confidence_score', 0.4)
            .order('confidence_score', { ascending: false }),
          supabase.from('lender_outcome_stats').select('*'),
        ]);
        if (patternsError) throw patternsError;
        if (statsError) throw statsError;
        setLearningPatterns((patterns || []) as LenderPassPattern[]);
        setOutcomeStats((stats || []) as LenderOutcomeStats[]);
      } catch (e) {
        console.error('Error fetching lender learning data:', e);
      }
    };
    void fetchLearningData();
  }, [enableLearning]);

  const matches = useMemo(() => {
    if (!masterLenders.length) return [];

    const excludeSet = new Set(excludeNames.map(n => n.toLowerCase().trim()));
    const filtered = masterLenders
      .filter(l => l.active !== false && l.appetite_status !== 'paused')
      .filter(l => excludeSet.size === 0 || !excludeSet.has(l.name.toLowerCase().trim()));

    const statsByLenderId = new Map(
      outcomeStats.filter((stats) => stats.master_lender_id).map((stats) => [stats.master_lender_id as string, stats]),
    );
    const scored: LenderMatch[] = [];
    for (const lender of filtered) {
      const result = calculateLenderMatch(
        lender,
        criteria,
        enableLearning ? learningPatterns : undefined,
        statsByLenderId.get(lender.id),
      );
      if (!result) continue; // Hard disqualified

      const combinedScore = result.score; // Semantic bonus added later
      const matchPercent = Math.round((combinedScore / MAX_COMBINED) * 100);
      const tier = getTier(combinedScore);

      if (combinedScore < minScore) continue;

      scored.push({
        ...result,
        semanticBonus: 0,
        combinedScore,
        matchPercent,
        tier,
        semanticLoading: result.score >= 30, // Will be enhanced by semantic hook
      });
    }

    scored.sort((a, b) => b.combinedScore - a.combinedScore);
    return scored.slice(0, maxResults);
  }, [masterLenders, criteria, minScore, maxResults, excludeNames, enableLearning, learningPatterns, outcomeStats]);

  return {
    matches,
    hasMatches: matches.length > 0,
    topMatch: matches[0] || null,
    learningEnabled: enableLearning && (learningPatterns.length > 0 || outcomeStats.length > 0),
    outcomeStats,
    MAX_COMBINED,
  };
}
