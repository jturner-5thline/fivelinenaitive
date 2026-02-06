import { MasterLender } from '@/hooks/useMasterLenders';

// ─── Types ────────────────────────────────────────────────────────────────────

/** The subset of deal properties used for eligibility filtering. */
export interface DealFilterInput {
  /** Numeric deal size in dollars (parsed from capital_ask). */
  dealSize?: number | null;
  /** Primary deal type (e.g. "Term Loan", "ABL", "Unitranche"). */
  dealType?: string | null;
  /** Additional deal types the deal may qualify for. */
  dealTypes?: string[];
  /** Whether the company is currently burning cash. */
  isCashBurn?: boolean;
  /** Primary industry of the company. */
  industry?: string | null;
  /** Optional sub-industry. */
  subIndustry?: string | null;
  /** Whether the deal is sponsor-backed. */
  isSponsorBacked?: boolean;
}

export type FilterName =
  | 'DEAL_SIZE'
  | 'DEAL_TYPE'
  | 'CASH_BURN'
  | 'INDUSTRY'
  | 'SPONSORSHIP';

export interface ExcludedLenderDebug {
  lenderId: string;
  lenderName: string;
  failedFilters: FilterName[];
}

export interface EligibilityFilterResult {
  /** Lenders that passed all five filters. */
  eligible: MasterLender[];
  /** Debug info for lenders that were excluded (only populated when debug=true). */
  excluded: ExcludedLenderDebug[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalize(str: string): string {
  return str.toLowerCase().trim();
}

/**
 * Parse a text-based sponsorship field into two booleans:
 * - `required`: lender ONLY works with sponsor-backed deals
 * - `allowed`: lender accepts sponsor-backed deals
 */
function parseLenderSponsorship(value: string | null | undefined): {
  required: boolean;
  allowed: boolean;
} {
  if (!value) return { required: false, allowed: true };

  const n = normalize(value);

  // Accepts both → not required, allowed
  if (n.includes('both') || n.includes('either') || n.includes('agnostic')) {
    return { required: false, allowed: true };
  }

  // Sponsored only / requires sponsorship
  const isSponsored =
    n === 'yes' ||
    n === 'required' ||
    n === 'sponsored only' ||
    n === 'sponsor-backed only' ||
    (n.includes('sponsor') && !n.includes('non'));

  if (isSponsored) {
    return { required: true, allowed: true };
  }

  // Non-sponsored only
  const isNonSponsored =
    n === 'no' ||
    n.includes('non-sponsor') ||
    n.includes('non sponsor') ||
    n === 'non-sponsored only';

  if (isNonSponsored) {
    return { required: false, allowed: false };
  }

  // Fallback: assume flexible
  return { required: false, allowed: true };
}

/**
 * Parse a text-based cash-burn field into a boolean.
 */
function parseLenderCashBurn(value: string | null | undefined): boolean {
  if (!value) return false;
  const n = normalize(value);
  return n.includes('yes') || n.includes('ok') || n === 'y' || n.includes('case by case');
}

/**
 * Check if a deal industry matches lender's allowed industries.
 * "Agnostic" means the lender accepts everything.
 */
function industryIsAllowed(
  dealIndustry: string,
  lenderIndustries: string[] | null | undefined
): boolean {
  if (!lenderIndustries || lenderIndustries.length === 0) {
    // No industries listed → treat as agnostic (include lender)
    return true;
  }

  const normalizedDeal = normalize(dealIndustry);

  if (lenderIndustries.some((i) => normalize(i) === 'agnostic')) {
    return true;
  }

  return lenderIndustries.some((li) => {
    const n = normalize(li);
    return n === normalizedDeal || n.includes(normalizedDeal) || normalizedDeal.includes(n);
  });
}

/**
 * Check if a deal industry is explicitly excluded by the lender.
 */
function industryIsExcluded(
  dealIndustry: string,
  excludedIndustries: string[] | null | undefined
): boolean {
  if (!excludedIndustries || excludedIndustries.length === 0) return false;

  const normalizedDeal = normalize(dealIndustry);

  return excludedIndustries.some((ei) => {
    const n = normalize(ei);
    return n === normalizedDeal || n.includes(normalizedDeal) || normalizedDeal.includes(n);
  });
}

/**
 * Check if a deal type matches any of the lender's allowed loan types.
 */
function dealTypeIsAllowed(
  dealTypes: string[],
  lenderLoanTypes: string[] | null | undefined
): boolean {
  if (!lenderLoanTypes || lenderLoanTypes.length === 0) return false;

  const normalizedLender = lenderLoanTypes.map(normalize);

  return dealTypes.some((dt) => {
    const n = normalize(dt);
    return normalizedLender.some(
      (lt) => lt === n || lt.includes(n) || n.includes(lt)
    );
  });
}

// ─── Filter pipeline ──────────────────────────────────────────────────────────

/** Individual filter functions. Each returns true if the lender PASSES. */
const FILTER_PIPELINE: Array<{
  name: FilterName;
  test: (deal: DealFilterInput, lender: MasterLender) => boolean;
}> = [
  {
    name: 'DEAL_SIZE',
    test: (deal, lender) => {
      if (deal.dealSize == null) return true; // no deal size → skip filter
      if (lender.min_deal != null && deal.dealSize < lender.min_deal) return false;
      if (lender.max_deal != null && deal.dealSize > lender.max_deal) return false;
      return true;
    },
  },
  {
    name: 'DEAL_TYPE',
    test: (deal, lender) => {
      // Collect all deal type values
      const allTypes: string[] = [];
      if (deal.dealType) allTypes.push(deal.dealType);
      if (deal.dealTypes) allTypes.push(...deal.dealTypes);
      if (allTypes.length === 0) return true; // no deal type → skip filter

      if (!lender.loan_types || lender.loan_types.length === 0) return false;

      return dealTypeIsAllowed(allTypes, lender.loan_types);
    },
  },
  {
    name: 'CASH_BURN',
    test: (deal, lender) => {
      // Only apply when the deal is cash-burning
      if (!deal.isCashBurn) return true;
      return parseLenderCashBurn(lender.cash_burn);
    },
  },
  {
    name: 'INDUSTRY',
    test: (deal, lender) => {
      const industry = deal.industry;
      if (!industry) return true; // no industry → skip filter

      // Check excluded first (hard reject)
      if (industryIsExcluded(industry, lender.industries_to_avoid)) return false;

      // Check allowed
      if (!industryIsAllowed(industry, lender.industries)) return false;

      // Also check sub-industry against exclusions if present
      if (deal.subIndustry && industryIsExcluded(deal.subIndustry, lender.industries_to_avoid)) {
        return false;
      }

      return true;
    },
  },
  {
    name: 'SPONSORSHIP',
    test: (deal, lender) => {
      const { required, allowed } = parseLenderSponsorship(lender.sponsorship);

      // If lender requires sponsorship, deal must be sponsor-backed
      if (required && !deal.isSponsorBacked) return false;

      // If lender doesn't allow sponsorship, sponsor-backed deals are excluded
      if (!allowed && deal.isSponsorBacked) return false;

      return true;
    },
  },
];

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Strict eligibility filter for lender matching.
 *
 * Applies five hard-gate filters in order:
 *   1. Deal Size
 *   2. Deal Type
 *   3. Cash-Burn OK
 *   4. Industry
 *   5. Sponsorship
 *
 * Returns only lenders that pass ALL filters. No scoring or ranking.
 *
 * @param deal   - The deal criteria to filter against.
 * @param lenders - The full list of lender objects.
 * @param debug  - When true, populate the `excluded` array with failure reasons.
 */
export function filterEligibleLenders(
  deal: DealFilterInput,
  lenders: MasterLender[],
  debug = false
): EligibilityFilterResult {
  const eligible: MasterLender[] = [];
  const excluded: ExcludedLenderDebug[] = [];

  for (const lender of lenders) {
    const failedFilters: FilterName[] = [];

    for (const filter of FILTER_PIPELINE) {
      if (!filter.test(deal, lender)) {
        failedFilters.push(filter.name);
        // In non-debug mode, short-circuit on first failure for performance
        if (!debug) break;
      }
    }

    if (failedFilters.length === 0) {
      eligible.push(lender);
    } else if (debug) {
      excluded.push({
        lenderId: lender.id,
        lenderName: lender.name,
        failedFilters,
      });
    }
  }

  return { eligible, excluded };
}

// ─── Adapter for DealCriteria ─────────────────────────────────────────────────

/**
 * Convert the existing DealCriteria shape (from useLenderMatching) into
 * the DealFilterInput shape used by filterEligibleLenders.
 *
 * This allows seamless integration without changing existing call sites.
 */
export function dealCriteriaToFilterInput(
  criteria: {
    industry?: string;
    dealValue?: number;
    dealTypes?: string[];
    capitalAsk?: string;
    cashBurnOk?: boolean;
    sponsorship?: string;
  },
  parseCapitalAskFn?: (v: string | undefined) => number | null
): DealFilterInput {
  const dealSize = parseCapitalAskFn
    ? parseCapitalAskFn(criteria.capitalAsk) ?? criteria.dealValue ?? null
    : criteria.dealValue ?? null;

  // Determine if deal is sponsor-backed from string
  let isSponsorBacked = false;
  if (criteria.sponsorship) {
    const n = normalize(criteria.sponsorship);
    isSponsorBacked =
      n.includes('sponsor') && !n.includes('non-sponsor') && !n.includes('non sponsor');
  }

  return {
    dealSize,
    dealType: criteria.dealTypes?.[0] ?? null,
    dealTypes: criteria.dealTypes,
    isCashBurn: criteria.cashBurnOk ?? false,
    industry: criteria.industry ?? null,
    isSponsorBacked,
  };
}
