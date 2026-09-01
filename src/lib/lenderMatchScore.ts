import type { MasterLender } from '@/hooks/useMasterLenders';
import type { DealCriteria } from '@/hooks/useLenderMatching';

// Component weights (sum = 100). Tune freely.
export const MATCH_WEIGHTS = {
  financingType: 25,
  checkSize: 25,
  vertical: 15,
  geography: 10,
  financialFit: 10,
  recency: 5,
  exclusion: 10,
} as const;

export type MatchComponentKey = keyof typeof MATCH_WEIGHTS;

export interface MatchComponent {
  key: MatchComponentKey;
  label: string;
  weight: number;        // configured weight
  earned: number;        // 0..weight, or 0 if n/a
  available: boolean;    // false when inputs missing — excluded from total
  detail: string;        // human explanation
}

export interface DeterministicMatchResult {
  score: number;         // 0–100 normalized over available components
  components: MatchComponent[];
  hardExcluded: boolean; // lender excludes this deal's industry/type
}

const DEAL_TYPE_SYNONYMS: Record<string, string[]> = {
  abl: ['abl', 'asset-based', 'asset based'],
  'growth-capital': ['growth', 'venture', 'mezz'],
  growth: ['growth', 'venture', 'mezz'],
  capex: ['capex', 'equipment'],
  acquisition: ['acquisition', 'buyout', 'lbo'],
};

function norm(s: string): string {
  return s.toLowerCase().replace(/[-_]/g, ' ').trim();
}

function parseAmount(raw: string | number | undefined | null): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return isFinite(raw) ? raw : null;
  const cleaned = String(raw).replace(/[$,\s]/gi, '').toLowerCase();
  if (!cleaned) return null;
  if (cleaned.endsWith('mm') || cleaned.endsWith('m')) {
    const n = parseFloat(cleaned.replace(/mm?$/, ''));
    return isFinite(n) ? n * 1_000_000 : null;
  }
  if (cleaned.endsWith('k')) {
    const n = parseFloat(cleaned.replace(/k$/, ''));
    return isFinite(n) ? n * 1_000 : null;
  }
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : null;
}

// ─── Components ─────────────────────────────────────────────────────────────

function scoreFinancingType(criteria: DealCriteria, lender: MasterLender): MatchComponent {
  const w = MATCH_WEIGHTS.financingType;
  const deal = (criteria.dealTypes || []).map(norm).filter(Boolean);
  const lender_lt = (lender.loan_types || []).map(norm).filter(Boolean);
  if (deal.length === 0 || lender_lt.length === 0) {
    return { key: 'financingType', label: 'Financing type', weight: w, earned: 0, available: false, detail: 'n/a — missing on ' + (deal.length === 0 ? 'deal' : 'lender') };
  }
  const expand = (t: string) => [t, ...(DEAL_TYPE_SYNONYMS[t] || [])];
  const dealExpanded = new Set(deal.flatMap(expand));
  const lenderExpanded = lender_lt.flatMap(expand);
  let hits = 0;
  for (const t of dealExpanded) {
    if (lenderExpanded.some(lt => lt.includes(t) || t.includes(lt))) hits++;
  }
  const ratio = Math.min(1, hits / Math.max(1, dealExpanded.size));
  const earned = Math.round(w * ratio);
  return {
    key: 'financingType', label: 'Financing type', weight: w, earned, available: true,
    detail: hits === 0 ? 'No overlap with lender loan types' : `${hits} of ${dealExpanded.size} deal type(s) supported`,
  };
}

function scoreCheckSize(criteria: DealCriteria, lender: MasterLender): MatchComponent {
  const w = MATCH_WEIGHTS.checkSize;
  const ask = parseAmount(criteria.capitalAsk) ?? criteria.capitalAskAmount ?? criteria.dealValue ?? null;
  const rangeMin = lender.min_deal ?? null;
  const rangeMax = lender.max_deal ?? null;
  const sweetMin = lender.sweet_spot_min ?? null;
  const sweetMax = lender.sweet_spot_max ?? null;
  if (ask == null || (rangeMin == null && rangeMax == null && sweetMin == null && sweetMax == null)) {
    return { key: 'checkSize', label: 'Check size', weight: w, earned: 0, available: false, detail: 'n/a — missing deal amount or lender range' };
  }
  const lo = rangeMin ?? 0;
  const hi = rangeMax ?? Number.MAX_SAFE_INTEGER;
  if (ask >= lo && ask <= hi) {
    const inSweetSpot = (sweetMin == null || ask >= sweetMin) && (sweetMax == null || ask <= sweetMax);
    return { key: 'checkSize', label: 'Check size', weight: w, earned: inSweetSpot ? w : Math.round(w * 0.8), available: true, detail: inSweetSpot ? 'Within lender sweet spot' : 'Within lender range, outside sweet spot' };
  }
  // Soft credit if within 25% of boundary
  const boundary = ask < lo ? lo : hi;
  const pctOff = Math.abs(ask - boundary) / Math.max(1, boundary);
  if (pctOff <= 0.25) {
    const earned = Math.round(w * (1 - pctOff / 0.25) * 0.6);
    return { key: 'checkSize', label: 'Check size', weight: w, earned, available: true, detail: `${Math.round(pctOff * 100)}% outside ${ask < lo ? 'min' : 'max'}` };
  }
  return { key: 'checkSize', label: 'Check size', weight: w, earned: 0, available: true, detail: `Outside range (${Math.round(pctOff * 100)}% off)` };
}

function scoreVertical(criteria: DealCriteria, lender: MasterLender): MatchComponent {
  const w = MATCH_WEIGHTS.vertical;
  const industry = criteria.industry?.trim();
  const inds = lender.industries || [];
  const normalizedIndustry = criteria.industryNormalized?.trim();
  if (!industry || inds.length === 0) {
    return { key: 'vertical', label: 'Vertical', weight: w, earned: 0, available: false, detail: 'n/a' };
  }
  const n = norm(normalizedIndustry || industry);
  if (inds.some(i => norm(i) === 'agnostic')) {
    return { key: 'vertical', label: 'Vertical', weight: w, earned: Math.round(w * 0.7), available: true, detail: 'Lender is industry-agnostic' };
  }
  const hit = inds.some(i => {
    const ni = norm(i);
    return ni === n || ni.includes(n) || n.includes(ni);
  });
  return { key: 'vertical', label: 'Vertical', weight: w, earned: hit ? w : 0, available: true, detail: hit ? `Covers ${industry}` : `No coverage for ${industry}` };
}

function scoreGeography(criteria: DealCriteria, lender: MasterLender): MatchComponent {
  const w = MATCH_WEIGHTS.geography;
  const dGeo = criteria.geo?.trim();
  const lGeo = lender.geo?.trim();
  const excluded = (lender.geographies_excluded || []).map(norm);
  if (dGeo && excluded.some((geo) => geo === norm(dGeo) || geo.includes(norm(dGeo)) || norm(dGeo).includes(geo))) {
    return { key: 'geography', label: 'Geography', weight: w, earned: 0, available: true, detail: `Lender excludes ${dGeo}` };
  }
  if (!dGeo || !lGeo) {
    return { key: 'geography', label: 'Geography', weight: w, earned: 0, available: false, detail: 'n/a' };
  }
  const nd = norm(dGeo);
  const nl = norm(lGeo);
  const lenderGeographies = [...(lender.geographies || []), lGeo].filter(Boolean).map(norm);
  const broad = ['us', 'usa', 'united states', 'global', 'nationwide', 'north america'];
  if (lenderGeographies.some((geo) => broad.some(b => geo.includes(b)) || geo.includes(nd) || nd.includes(geo))) {
    return { key: 'geography', label: 'Geography', weight: w, earned: w, available: true, detail: `Lender covers ${dGeo}` };
  }
  return { key: 'geography', label: 'Geography', weight: w, earned: 0, available: true, detail: `Lender focused on ${lGeo}` };
}

function scoreFinancialFit(criteria: DealCriteria, lender: MasterLender): MatchComponent {
  const w = MATCH_WEIGHTS.financialFit;
  const revenue = criteria.ttmRevenue ?? criteria.revenue ?? null;
  const ebitda = criteria.ttmEbitda ?? criteria.ebitda ?? null;
  const margin = criteria.grossMarginPct ?? null;
  const hasDealFinancials = revenue != null || ebitda != null || margin != null;
  const hasLenderCriteria = lender.min_revenue != null || lender.ebitda_min != null || lender.min_gross_margin_pct != null;

  if (!hasDealFinancials || !hasLenderCriteria) {
    return { key: 'financialFit', label: 'Financial fit', weight: w, earned: 0, available: false, detail: 'n/a — missing financial criteria' };
  }

  const checks = [
    revenue == null || lender.min_revenue == null || revenue >= lender.min_revenue,
    ebitda == null || lender.ebitda_min == null || ebitda >= lender.ebitda_min,
    margin == null || lender.min_gross_margin_pct == null || margin >= lender.min_gross_margin_pct,
  ];
  const passed = checks.filter(Boolean).length;
  const earned = Math.round(w * (passed / checks.length));
  return {
    key: 'financialFit', label: 'Financial fit', weight: w, earned, available: true,
    detail: `${passed} of ${checks.length} financial thresholds met`,
  };
}

function scoreRecency(lender: MasterLender): MatchComponent {
  const w = MATCH_WEIGHTS.recency;
  const raw = lender.last_synced_from_flex || lender.external_last_modified || lender.updated_at;
  if (!raw) {
    return { key: 'recency', label: 'Activity recency', weight: w, earned: 0, available: false, detail: 'n/a' };
  }
  const d = new Date(raw);
  if (isNaN(d.getTime())) {
    return { key: 'recency', label: 'Activity recency', weight: w, earned: 0, available: false, detail: 'n/a' };
  }
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  let earned = 0;
  let detail = '';
  if (days <= 30) { earned = w; detail = 'Active within 30 days'; }
  else if (days <= 90) { earned = Math.round(w * 0.75); detail = 'Active within 90 days'; }
  else if (days <= 180) { earned = Math.round(w * 0.4); detail = 'Active within 180 days'; }
  else { earned = 0; detail = `Last active ${Math.floor(days / 30)}mo ago`; }
  return { key: 'recency', label: 'Activity recency', weight: w, earned, available: true, detail };
}

function scoreExclusion(criteria: DealCriteria, lender: MasterLender): { component: MatchComponent; hardExcluded: boolean } {
  const w = MATCH_WEIGHTS.exclusion;
  const avoid = lender.industries_to_avoid || [];
  const industry = criteria.industry?.trim();
  if (industry && avoid.length > 0) {
    const n = norm(industry);
    const blocked = avoid.some(a => {
      const na = norm(a);
      return na === n || na.includes(n) || n.includes(na);
    });
    if (blocked) {
      return {
        component: { key: 'exclusion', label: 'Exclusions', weight: w, earned: 0, available: true, detail: `Avoids ${industry}` },
        hardExcluded: true,
      };
    }
  }
  return {
    component: { key: 'exclusion', label: 'Exclusions', weight: w, earned: w, available: true, detail: 'No exclusion conflict' },
    hardExcluded: false,
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

const cache = new Map<string, DeterministicMatchResult>();

function criteriaSignature(c: DealCriteria): string {
  return JSON.stringify({
    i: c.industryNormalized || c.industry || '',
    v: c.dealValue ?? null,
    a: c.capitalAskAmount ?? c.capitalAsk ?? '',
    r: c.ttmRevenue ?? c.revenue ?? null,
    e: c.ttmEbitda ?? c.ebitda ?? null,
    m: c.grossMarginPct ?? null,
    t: (c.dealTypes || []).map(norm).sort(),
    g: c.geo || '',
  });
}

export function computeMatchScore(lender: MasterLender, criteria: DealCriteria): DeterministicMatchResult {
  const key = `${lender.id}::${criteriaSignature(criteria)}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const components: MatchComponent[] = [];
  components.push(scoreFinancingType(criteria, lender));
  components.push(scoreCheckSize(criteria, lender));
  components.push(scoreVertical(criteria, lender));
  components.push(scoreGeography(criteria, lender));
  components.push(scoreFinancialFit(criteria, lender));
  components.push(scoreRecency(lender));
  const excl = scoreExclusion(criteria, lender);
  components.push(excl.component);

  // Normalize over available components — graceful degradation when data missing.
  const availableWeight = components.filter(c => c.available).reduce((s, c) => s + c.weight, 0);
  const earned = components.reduce((s, c) => s + c.earned, 0);
  let score = availableWeight > 0 ? Math.round((earned / availableWeight) * 100) : 0;
  if (excl.hardExcluded) score = 0;
  score = Math.max(0, Math.min(100, score));

  const result: DeterministicMatchResult = { score, components, hardExcluded: excl.hardExcluded };
  cache.set(key, result);
  return result;
}

export function clearMatchScoreCache() { cache.clear(); }