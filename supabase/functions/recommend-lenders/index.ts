import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { anthropicFetch } from "../_shared/anthropicUsage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─────────────────────────────────────────────────────────────────────────────
// recommend-lenders v2
// Deterministic weighted scoring (with hard filters) + AI narrative re-ranking.
// Evaluates the FULL deal + FULL lender profile across structured and
// unstructured signal (notes, tags, narrative, historical activity).
// ─────────────────────────────────────────────────────────────────────────────

interface ComponentScores {
  type: number;       // 0-100 — loan/deal type fit
  size: number;       // 0-100 — size, revenue, ebitda fit
  industry: number;   // 0-100 — industry / business model fit
  geography: number;  // 0-100 — geo fit
  structure: number;  // 0-100 — sponsorship / cash burn / collateral / b2b
  recency: number;    // 0-100 — recent activity & momentum
  evidence: number;   // 0-100 — qualitative notes/tags evidence (100=neutral, lower=negative, higher=positive)
  semantic: number;   // 0-100 — cosine similarity vs lender fit profile embedding
}

interface Recommendation {
  lenderId: string | null;
  lenderName: string;
  matchScore: number;          // 0-100, deterministic + AI blend
  confidence: number;          // 0-100
  rationale: string;
  hardFiltered?: false;
  components: ComponentScores & { ai: number };
  tier?: string | null;
  loanTypes?: string[];
  industries?: string[];
  minDeal?: number | null;
  maxDeal?: number | null;
  active?: boolean;
  recentActivity?: boolean;
  positiveFitSignals?: string[];
  negativeFitSignals?: string[];
  matchedExclusion?: string | null;
  fitSummary?: string | null;
  explanation?: WhyExplanation;
  pipelineTrace?: PipelineTrace;
}

// Transparent per-lender explanation surfaced to the UI.
interface FieldRow { label: string; deal: string; lender: string; verdict: 'match' | 'mismatch' | 'partial' | 'unknown'; }
interface WhyExplanation {
  fitReasons: string[];        // top 3 concrete fit reasons
  risks: string[];             // top 1-2 risks/caveats
  matchedFields: FieldRow[];
  unmatchedFields: FieldRow[];
  noteInsights: { positive: string[]; negative: string[]; tags: string[] };
  priorTeamKnowledge: {
    recentActivity: boolean;
    passReasons: string[];
    repeatPatterns: { reason: string; occurrences: number; confidence: number }[];
  };
  dominantDriver: 'structured' | 'notes' | 'history' | 'balanced';
  driverBreakdown: { structured: number; notes: number; history: number };
}

// Layered pipeline diagnostics surfaced to admins/5th Line users.
interface PipelineTrace {
  // Layer 1 — hard filters
  hardFilters: { passed: boolean; checks: { name: string; passed: boolean; reason?: string }[] };
  // Layer 2 — structured scoring
  structured: { score: number; components: { name: string; score: number; weight: number; reason: string }[] };
  // Layer 3 — unstructured AI / notes / embeddings
  unstructured: { score: number; components: { name: string; score: number; weight: number; reason: string }[] };
  // Layer 4 — penalties applied (negative history, exclusion tags, stale notes, mandate conflicts)
  penalties: { name: string; delta: number; reason: string }[];
  // Layer 5 — boosts from positive historical outcomes
  boosts: { name: string; delta: number; reason: string }[];
  // Layer 6 — final
  final: {
    deterministic: number;
    aiAdjustment: number;
    penaltyTotal: number;
    boostTotal: number;
    diversityDelta: number;
    matchScore: number;
    confidence: number;
  };
  weights: Record<string, number>;
  diversification?: { reason: string; demoted: boolean };
}

// ── helpers ──────────────────────────────────────────────────────────────────
const lc = (v: unknown) => String(v ?? "").trim().toLowerCase();
const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const arr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
const splitList = (v: unknown): string[] =>
  String(v ?? "")
    .split(/[,;|\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const EMBEDDING_DIM = 1536;

async function embedText(text: string): Promise<number[] | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY || !text.trim()) return null;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text.slice(0, 8000),
        dimensions: EMBEDDING_DIM,
      }),
    });
    if (!res.ok) {
      console.error("embed error", res.status, await res.text());
      return null;
    }
    const j = await res.json();
    const v = j?.data?.[0]?.embedding;
    return Array.isArray(v) ? v : null;
  } catch (e) {
    console.error("embed throw", e);
    return null;
  }
}

function cosineSim(a: number[] | null | undefined, b: number[] | null | undefined): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Parse pgvector embedding string ("[0.1,0.2,...]") into a number[].
function parseEmbedding(v: unknown): number[] | null {
  if (!v) return null;
  if (Array.isArray(v)) return v.map(Number);
  if (typeof v === "string") {
    try {
      const t = v.trim();
      if (t.startsWith("[")) return JSON.parse(t);
    } catch { /* noop */ }
  }
  return null;
}

function tokenOverlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b.map(lc));
  let hits = 0;
  for (const x of a) if (setB.has(lc(x))) hits++;
  return hits / Math.max(a.length, 1);
}

function fuzzyContains(haystack: string, needles: string[]): boolean {
  if (!haystack) return false;
  const h = lc(haystack);
  return needles.some((n) => n && h.includes(lc(n)));
}

function checkSufficiency(deal: any, writeup: any, dsDocs: any[], vdrDocs: any[]) {
  const missing: string[] = [];
  const dealTypes: string[] = (deal?.dealTypes && deal.dealTypes.length > 0)
    ? deal.dealTypes
    : (writeup?.deal_type ? splitList(writeup.deal_type) : []);
  if (dealTypes.length === 0) missing.push("Deal type");
  const dealSize: number | null = deal?.value ?? toNum(writeup?.capital_ask) ?? null;
  if (!dealSize || dealSize <= 0) missing.push("Deal size");
  const hasFinancials = !!(writeup?.this_year_revenue || writeup?.last_year_revenue || writeup?.financial_years);
  const hasNarrative = !!(writeup?.description || writeup?.company_highlights || writeup?.team || writeup?.key_items);
  const hasDocs = (dsDocs?.length || 0) + (vdrDocs?.length || 0) > 0;
  if (!hasFinancials && !hasNarrative && !hasDocs) {
    missing.push("Financials, narrative, or data room documents");
  }
  return { ok: missing.length === 0, missing, dealTypes, dealSize };
}

// Negative-evidence keyword scan for free-text lender intel.
const NEGATIVE_PATTERNS = [
  "passed", "pass on", "declined", "not a fit", "no fit", "avoid",
  "do not", "won't fund", "wont fund", "won't do", "wont do",
  "blacklist", "stay away", "burned", "lost confidence",
  "ghosted", "unresponsive", "slow", "difficult to work with",
  "renegotiated", "retraded", "killed the deal",
];
const POSITIVE_PATTERNS = [
  "great partner", "easy to work with", "responsive", "won the deal",
  "closed", "funded", "loves this space", "active in", "actively funding",
  "warm intro", "preferred", "fast close", "competitive terms",
];

function scanEvidence(text: string): { negative: number; positive: number; hits: string[] } {
  const h = lc(text);
  if (!h) return { negative: 0, positive: 0, hits: [] };
  let neg = 0, pos = 0;
  const hits: string[] = [];
  for (const p of NEGATIVE_PATTERNS) if (h.includes(p)) { neg++; hits.push(p); }
  for (const p of POSITIVE_PATTERNS) if (h.includes(p)) { pos++; hits.push(p); }
  return { negative: neg, positive: pos, hits };
}

// ── core scorers ─────────────────────────────────────────────────────────────
function scoreLoanType(deal: any, lender: any): { score: number; reason: string } {
  const dealTypes = (deal.dealTypes ?? []).map(lc);
  const lenderTypes = arr(lender.loan_types).map(lc);
  const lenderTypeStr = lc(lender.lender_type);
  const notes = lc(lender.deal_structure_notes) + " " + lc(lender.company_requirements);
  if (!dealTypes.length) return { score: 50, reason: "no deal type specified" };
  if (!lenderTypes.length && !lenderTypeStr && !notes) return { score: 40, reason: "lender loan types unknown" };

  const exactHits = dealTypes.filter((t) => lenderTypes.includes(t)).length;
  if (exactHits === dealTypes.length) return { score: 100, reason: `funds ${dealTypes.join("/")}` };
  if (exactHits > 0) return { score: 80, reason: `funds ${exactHits}/${dealTypes.length} of requested types` };

  // Partial substring match (e.g. "term loan" vs "term")
  const partial = dealTypes.some((t) => lenderTypes.some((lt) => lt.includes(t) || t.includes(lt)));
  if (partial) return { score: 65, reason: "partial loan-type alignment" };

  // Lender-type/notes substring hint
  if (dealTypes.some((t) => lenderTypeStr.includes(t) || notes.includes(t))) {
    return { score: 55, reason: "indirect deal-type reference in lender notes" };
  }
  return { score: 10, reason: `does not fund ${dealTypes.join("/")}` };
}

function scoreSize(deal: any, lender: any): { score: number; reason: string } {
  const v = toNum(deal.value);
  const min = toNum(lender.min_deal);
  const max = toNum(lender.max_deal);
  const rev = toNum(deal.revenue);
  const minRev = toNum(lender.min_revenue);
  const ebitda = toNum(deal.ebitda);
  const minEbitda = toNum(lender.ebitda_min);
  const sweetMin = toNum(lender.sweet_spot_min);
  const sweetMax = toNum(lender.sweet_spot_max);
  const grossMargin = toNum(deal.grossMarginPct);
  const minGrossMargin = toNum(lender.min_gross_margin_pct);

  let sub = 50;
  let reason = "size unknown";

  if (v && (min || max)) {
    if (min && v < min * 0.5) sub = 5, reason = `deal $${(v/1e6).toFixed(1)}M far below min $${(min/1e6).toFixed(1)}M`;
    else if (min && v < min) sub = 35, reason = `deal slightly below min $${(min/1e6).toFixed(1)}M`;
    else if (max && v > max * 2) sub = 5, reason = `deal $${(v/1e6).toFixed(1)}M far above max $${(max/1e6).toFixed(1)}M`;
    else if (max && v > max) sub = 40, reason = `deal slightly above max $${(max/1e6).toFixed(1)}M`;
    else {
      const inSweetSpot = (sweetMin == null || v >= sweetMin) && (sweetMax == null || v <= sweetMax);
      sub = inSweetSpot ? 100 : 85;
      reason = inSweetSpot && (sweetMin != null || sweetMax != null)
        ? `inside sweet spot ${sweetMin?`$${(sweetMin/1e6).toFixed(0)}M`:"–"}-${sweetMax?`$${(sweetMax/1e6).toFixed(0)}M`:"–"}`
        : `inside ${min?`$${(min/1e6).toFixed(0)}M`:"–"}-${max?`$${(max/1e6).toFixed(0)}M`:"–"} band`;
    }
  } else if (v && !min && !max) {
    sub = 60; reason = "no published size band";
  }

  // Revenue/ebitda gating (penalties)
  if (rev != null && minRev != null && rev < minRev * 0.7) sub = Math.min(sub, 25);
  else if (rev != null && minRev != null && rev < minRev) sub = Math.min(sub, 55);

  if (ebitda != null && minEbitda != null && ebitda < minEbitda) sub = Math.min(sub, 30);

  if (grossMargin != null && minGrossMargin != null && grossMargin < minGrossMargin) sub = Math.min(sub, 35);

  return { score: sub, reason };
}

function scoreIndustry(deal: any, lender: any): { score: number; reason: string; hardOut: boolean } {
  const dealInd = [
    deal.industry, deal.subIndustry, deal.businessModel, deal.customerBase,
    ...(deal.tags ?? []),
  ].filter(Boolean).map(String);
  const dealNarrative = lc(deal.narrative ?? "");
  const lenderInd = arr(lender.industries);
  const lenderAvoid = arr(lender.industries_to_avoid);

  // Hard exclude: any deal industry token is in lender's avoid list
  if (lenderAvoid.length && dealInd.some((d) => fuzzyContains(d, lenderAvoid))) {
    return { score: 0, reason: `industry on lender's avoid list`, hardOut: true };
  }
  if (lenderAvoid.length && lenderAvoid.some((a) => dealNarrative.includes(lc(a)))) {
    return { score: 0, reason: `avoided industry referenced in deal narrative`, hardOut: true };
  }

  if (!lenderInd.length) return { score: 55, reason: "lender industry appetite unspecified", hardOut: false };
  if (!dealInd.length) return { score: 50, reason: "deal industry unspecified", hardOut: false };

  // Direct token overlap
  const overlap = tokenOverlap(dealInd, lenderInd);
  if (overlap > 0.5) return { score: 100, reason: "industry directly matches lender appetite", hardOut: false };
  if (overlap > 0) return { score: 80, reason: "partial industry overlap", hardOut: false };

  // Substring match
  if (lenderInd.some((li) => dealInd.some((di) => lc(di).includes(lc(li)) || lc(li).includes(lc(di))))) {
    return { score: 65, reason: "industry referenced as substring", hardOut: false };
  }
  // B2B/B2C alignment as weak signal
  if (deal.b2bB2c && lender.b2b_b2c && lc(deal.b2bB2c) === lc(lender.b2b_b2c)) {
    return { score: 45, reason: "no industry match; B2B/B2C aligned", hardOut: false };
  }
  return { score: 20, reason: "no industry overlap", hardOut: false };
}

function scoreGeography(deal: any, lender: any): { score: number; reason: string; hardOut: boolean } {
  const dealGeo = lc(deal.location);
  const lenderGeo = lc(lender.geo);
  const excludedGeo = arr(lender.geographies_excluded).map(lc).filter(Boolean);
  if (dealGeo && excludedGeo.some((g) => dealGeo.includes(g) || g.includes(dealGeo))) {
    return { score: 0, reason: `deal geography on lender's excluded list`, hardOut: true };
  }
  if (!dealGeo || !lenderGeo) return { score: 70, reason: "geo unspecified", hardOut: false };
  if (lenderGeo.includes("global") || lenderGeo.includes("north america") || lenderGeo.includes("us/canada") || lenderGeo.includes("usa") || lenderGeo.includes("united states")) {
    // Generous national scope; US-based deals get full credit
    if (dealGeo.includes("us") || dealGeo.includes("united states") || /^[a-z\s]+,\s*[a-z]{2}/.test(dealGeo)) {
      return { score: 100, reason: "national lender, US-based deal", hardOut: false };
    }
    return { score: 75, reason: "lender national scope", hardOut: false };
  }
  if (dealGeo.includes(lenderGeo) || lenderGeo.includes(dealGeo)) {
    return { score: 100, reason: "geo aligned", hardOut: false };
  }
  // Token overlap on state codes / regions
  const dTok = dealGeo.split(/[,\s]+/);
  const lTok = lenderGeo.split(/[,\s]+/);
  if (dTok.some((t) => t && lTok.includes(t))) return { score: 70, reason: "partial geo overlap", hardOut: false };
  return { score: 25, reason: `lender geo "${lender.geo}" vs deal "${deal.location}"`, hardOut: false };
}

function scoreStructure(deal: any, lender: any): { score: number; reason: string } {
  let total = 0, parts = 0;
  const reasons: string[] = [];

  // Sponsorship
  if ((lender.sponsor_requirement || lender.sponsorship) && deal.sponsorship) {
    const ls = lc(lender.sponsor_requirement || lender.sponsorship), ds = lc(deal.sponsorship);
    const lenderNeedsSponsor = ls.includes("required") || ls.includes("sponsor-backed only") || ls.includes("yes only");
    const dealHasSponsor = /sponsor|pe[- ]backed|institutional/.test(ds) && !/no sponsor|non[- ]sponsor/.test(ds);
    if (lenderNeedsSponsor && !dealHasSponsor) { total += 5; reasons.push("requires sponsor"); }
    else if (lenderNeedsSponsor && dealHasSponsor) { total += 100; reasons.push("sponsor-backed match"); }
    else { total += 75; }
    parts++;
  }

  // Cash burn
  if (lender.cash_burn) {
    const lcb = lc(lender.cash_burn);
    const lenderOkBurn = /yes|ok|acceptable|tolerate/.test(lcb);
    const dealBurning = deal.cashBurnOk === false || /unprofitable|burn|loss/.test(lc(deal.profitability));
    if (dealBurning && !lenderOkBurn) { total += 10; reasons.push("does not tolerate cash burn"); }
    else if (dealBurning && lenderOkBurn) { total += 100; reasons.push("tolerates cash burn"); }
    else { total += 80; }
    parts++;
  }

  // Collateral
  if (lender.deal_structure_notes && deal.collateral) {
    const notes = lc(lender.deal_structure_notes);
    const coll = lc(deal.collateral);
    const types = ["ar", "inventory", "equipment", "real estate", "ip", "saas mrr", "recurring revenue"];
    const hits = types.filter((t) => notes.includes(t) && coll.includes(t)).length;
    if (hits > 0) { total += Math.min(100, 60 + hits * 20); reasons.push(`${hits} collateral type match`); }
    else { total += 50; }
    parts++;
  }

  // B2B/B2C
  if (lender.b2b_b2c && deal.b2bB2c) {
    const same = lc(lender.b2b_b2c) === lc(deal.b2bB2c) || lc(lender.b2b_b2c).includes("both");
    total += same ? 100 : 30;
    if (!same) reasons.push("B2B/B2C mismatch");
    parts++;
  }

  if (parts === 0) return { score: 70, reason: "structural signals unspecified" };
  return { score: Math.round(total / parts), reason: reasons.join(", ") || "structural alignment OK" };
}

function scoreRecency(lender: any, recentSet: Set<string>, passReasons: string[]): { score: number; reason: string } {
  const isRecent = recentSet.has(lc(lender.name));
  let base = isRecent ? 90 : 50;
  if (passReasons.length) {
    base -= Math.min(40, passReasons.length * 12);
    return { score: Math.max(0, base), reason: `${passReasons.length} recent pass(es)` };
  }
  return { score: base, reason: isRecent ? "active in last 90d" : "no recent activity" };
}

function scoreEvidence(
  lender: any,
  lenderNotes: string[],
  lenderTags: string[],
  dealEvidenceText: string,
): { score: number; reason: string; hardOut: boolean } {
  const combined = [
    lender.deal_structure_notes,
    lender.company_requirements,
    ...lenderNotes,
    ...lenderTags,
    dealEvidenceText,
  ].filter(Boolean).join(" \n ");
  const ev = scanEvidence(combined);
  // Hard out if multiple strong negative signals
  if (ev.negative >= 3) return { score: 10, reason: `${ev.negative} negative notes`, hardOut: true };
  // Bias 100 = neutral, range 30..130 then clipped
  const raw = 100 - ev.negative * 18 + ev.positive * 10;
  const score = Math.max(0, Math.min(100, raw));
  let reason = "no qualitative signal";
  if (ev.negative && ev.positive) reason = `${ev.negative} negative / ${ev.positive} positive notes`;
  else if (ev.negative) reason = `${ev.negative} negative note(s)`;
  else if (ev.positive) reason = `${ev.positive} positive note(s)`;
  return { score, reason, hardOut: false };
}

// ── explanation builder ──────────────────────────────────────────────────────
function fmtUsd(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

function buildExplanation(args: {
  lender: any;
  dealCtx: any;
  components: ComponentScores;
  aiAdj: number;
  aiRationale: string;
  posHits: { signal: string; confidence: number }[];
  negHits: { signal: string; confidence: number }[];
  lenderTags: string[];
  passReasons: string[];
  patterns: any[];
  fit: any;
  recentActivity: boolean;
  reasons: string[];
}): WhyExplanation {
  const { lender, dealCtx, components, aiAdj, aiRationale, posHits, negHits, lenderTags, passReasons, patterns, fit, recentActivity, reasons } = args;

  // Build matched / unmatched / partial structured field rows
  const rows: FieldRow[] = [];

  // Loan type
  const dealTypes = (dealCtx.dealTypes ?? []).join(', ') || '—';
  const lenderTypes = arr(lender.loan_types).join(', ') || lender.lender_type || '—';
  rows.push({
    label: 'Loan type',
    deal: dealTypes, lender: lenderTypes,
    verdict: components.type >= 80 ? 'match' : components.type >= 55 ? 'partial' : components.type >= 30 ? 'mismatch' : 'mismatch',
  });

  // Size band
  const dealSize = fmtUsd(dealCtx.value);
  const sizeBand = `${fmtUsd(toNum(lender.min_deal))} – ${fmtUsd(toNum(lender.max_deal))}`;
  rows.push({
    label: 'Deal size',
    deal: dealSize, lender: sizeBand,
    verdict: components.size >= 80 ? 'match' : components.size >= 50 ? 'partial' : 'mismatch',
  });

  // Industry
  rows.push({
    label: 'Industry',
    deal: String(dealCtx.industry ?? dealCtx.businessModel ?? '—'),
    lender: arr(lender.industries).slice(0, 4).join(', ') || '—',
    verdict: components.industry >= 80 ? 'match' : components.industry >= 55 ? 'partial' : components.industry >= 30 ? 'mismatch' : 'unknown',
  });

  // Geography
  rows.push({
    label: 'Geography',
    deal: String(dealCtx.location ?? '—'),
    lender: String(lender.geo ?? '—'),
    verdict: components.geography >= 85 ? 'match' : components.geography >= 60 ? 'partial' : 'mismatch',
  });

  // Sponsorship
  if (lender.sponsor_requirement || lender.sponsorship || dealCtx.sponsorship) {
    const ls = lc(lender.sponsor_requirement ?? lender.sponsorship ?? '');
    const ds = lc(dealCtx.sponsorship ?? '');
    const lenderNeedsSponsor = /required|sponsor-backed only|yes only/.test(ls);
    const dealHasSponsor = /sponsor|pe[- ]backed|institutional/.test(ds) && !/no sponsor|non[- ]sponsor/.test(ds);
    const verdict: FieldRow['verdict'] = lenderNeedsSponsor
      ? (dealHasSponsor ? 'match' : 'mismatch')
      : (ls && ds ? 'match' : 'unknown');
    rows.push({ label: 'Sponsorship', deal: dealCtx.sponsorship ?? '—', lender: lender.sponsor_requirement ?? lender.sponsorship ?? '—', verdict });
  }

  // Cash burn
  if (lender.cash_burn != null || dealCtx.cashBurnOk != null || dealCtx.profitability) {
    const lcb = lc(lender.cash_burn ?? '');
    const lenderOkBurn = /yes|ok|acceptable|tolerate/.test(lcb);
    const dealBurning = dealCtx.cashBurnOk === false || /unprofitable|burn|loss/.test(lc(dealCtx.profitability ?? ''));
    let verdict: FieldRow['verdict'] = 'unknown';
    if (dealBurning) verdict = lenderOkBurn ? 'match' : 'mismatch';
    else if (lcb) verdict = 'match';
    rows.push({
      label: 'Cash burn',
      deal: dealBurning ? 'Burning / unprofitable' : (dealCtx.profitability ?? '—'),
      lender: lender.cash_burn ?? '—',
      verdict,
    });
  }

  // Collateral
  if (lender.deal_structure_notes && dealCtx.collateral) {
    const notes = lc(lender.deal_structure_notes ?? '');
    const coll = lc(dealCtx.collateral ?? '');
    const types = ['ar', 'inventory', 'equipment', 'real estate', 'ip', 'saas mrr', 'recurring revenue'];
    const hits = types.filter((t) => notes.includes(t) && coll.includes(t));
    rows.push({
      label: 'Collateral',
      deal: String(dealCtx.collateral).slice(0, 60),
      lender: hits.length ? `Accepts ${hits.join(', ')}` : 'See structure notes',
      verdict: hits.length ? 'match' : 'partial',
    });
  }

  // Revenue
  if (dealCtx.revenue != null && lender.min_revenue != null) {
    const minRev = toNum(lender.min_revenue);
    const verdict: FieldRow['verdict'] = minRev != null && dealCtx.revenue >= minRev
      ? 'match'
      : minRev != null && dealCtx.revenue >= minRev * 0.7 ? 'partial' : 'mismatch';
    rows.push({
      label: 'Revenue floor',
      deal: fmtUsd(dealCtx.revenue),
      lender: `Min ${fmtUsd(minRev)}`,
      verdict,
    });
  }

  // EBITDA
  if (dealCtx.ebitda != null && lender.ebitda_min != null) {
    const minE = toNum(lender.ebitda_min);
    rows.push({
      label: 'EBITDA floor',
      deal: fmtUsd(dealCtx.ebitda),
      lender: `Min ${fmtUsd(minE)}`,
      verdict: minE != null && dealCtx.ebitda >= minE ? 'match' : 'mismatch',
    });
  }

  const matchedFields = rows.filter((r) => r.verdict === 'match' || r.verdict === 'partial');
  const unmatchedFields = rows.filter((r) => r.verdict === 'mismatch' || r.verdict === 'unknown');

  // Fit reasons (top 3) — combine AI rationale, positive signals, strong components, fit summary
  const fitReasons: string[] = [];
  if (aiRationale && aiAdj >= 0) fitReasons.push(aiRationale);
  for (const p of posHits.slice(0, 2)) fitReasons.push(`Note signal: ${p.signal}`);
  const strongRows = rows.filter((r) => r.verdict === 'match');
  for (const r of strongRows) {
    if (fitReasons.length >= 3) break;
    fitReasons.push(`${r.label}: deal ${r.deal} aligns with lender ${r.lender}`);
  }
  if (fit?.summary && fitReasons.length < 3) fitReasons.push(`Fit profile: ${String(fit.summary).slice(0, 160)}`);

  // Risks (top 1-2) — negative signals, weak components, repeat passes, AI negative rationale
  const risks: string[] = [];
  if (aiRationale && aiAdj < 0) risks.push(aiRationale);
  for (const n of negHits.slice(0, 2)) risks.push(`Note caveat: ${n.signal}`);
  for (const r of unmatchedFields) {
    if (risks.length >= 2) break;
    if (r.verdict === 'mismatch') risks.push(`${r.label} mismatch — deal ${r.deal} vs lender ${r.lender}`);
  }
  if (passReasons.length && risks.length < 2) {
    risks.push(`Recent pass on similar deals: "${passReasons[0]}"`);
  }
  if (!risks.length) {
    // surface weakest deterministic dimension as soft caveat
    const entries = Object.entries(components) as [string, number][];
    const weakest = entries.sort((a, b) => a[1] - b[1])[0];
    if (weakest && weakest[1] < 60) risks.push(`Weakest dimension: ${weakest[0]} (${weakest[1]}/100)`);
  }

  // Note insights
  const noteInsights = {
    positive: posHits.map((h) => h.signal).slice(0, 5),
    negative: negHits.map((h) => h.signal).slice(0, 5),
    tags: Array.from(new Set(lenderTags)).slice(0, 10),
  };

  // Prior team knowledge
  const priorTeamKnowledge = {
    recentActivity,
    passReasons: passReasons.slice(0, 4),
    repeatPatterns: patterns.slice(0, 3).map((p: any) => ({
      reason: String(p.pattern_value ?? p.reason_category ?? '').slice(0, 120),
      occurrences: Number(p.occurrence_count ?? 1),
      confidence: Number(p.confidence_score ?? 0),
    })),
  };

  // Dominant driver: weight each bucket by how far signals push scoring
  const structuredAvg = (components.type + components.size + components.industry + components.geography + components.structure) / 5;
  const structuredWeight = Math.max(0, structuredAvg - 50); // 0..50
  const notesWeight = Math.abs(components.evidence - 100) * 0.6
    + Math.max(0, components.semantic - 50) * 0.5
    + posHits.length * 6 + negHits.length * 8
    + (fit?.summary ? 8 : 0);
  const historyWeight = (recentActivity ? 18 : 0) + passReasons.length * 6 + patterns.length * 10;

  const ranked = [
    { key: 'structured' as const, w: structuredWeight },
    { key: 'notes' as const, w: notesWeight },
    { key: 'history' as const, w: historyWeight },
  ].sort((a, b) => b.w - a.w);
  const top = ranked[0];
  const second = ranked[1];
  const dominantDriver: WhyExplanation['dominantDriver'] =
    top.w === 0 ? 'balanced'
    : (second && top.w - second.w < 5) ? 'balanced'
    : top.key;

  return {
    fitReasons: fitReasons.slice(0, 3),
    risks: risks.slice(0, 2),
    matchedFields,
    unmatchedFields,
    noteInsights,
    priorTeamKnowledge,
    dominantDriver,
    driverBreakdown: {
      structured: Math.round(structuredWeight),
      notes: Math.round(notesWeight),
      history: Math.round(historyWeight),
    },
  };
}

// ── main ─────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { dealId, criteriaOverride, qaMode } = body || {};
    if (!dealId || typeof dealId !== "string") {
      return new Response(JSON.stringify({ error: "dealId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // QA mode is restricted to 5th Line / naitive internal users
    const userEmail = (userData.user.email ?? "").toLowerCase();
    const isInternal = userEmail.endsWith("@5thline.co") || userEmail.endsWith("@naitive.co");
    const qa = !!qaMode && isInternal;

    // Deal — pull rich, qualitative columns too
    const { data: deal, error: dealErr } = await supabase
      .from("deals")
      .select(
        "id, company, value, stage, status, company_id, user_id, business_model, deal_type, narrative, engagement_type, deal_class, notes, flag_notes, tags, key_signal, pain_points_confirmed, objections_raised, product_gap_flagged, why_not_moving_forward, opportunity_type, services_offered, next_step, mrr, one_time_revenue, icp_category, prospect_type",
      )
      .eq("id", dealId)
      .maybeSingle();
    if (dealErr || !deal) {
      return new Response(JSON.stringify({ error: "Deal not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: writeup } = await supabase
      .from("deal_writeups")
      .select(
        "deal_type, capital_ask, capital_ask_amount, ttm_revenue, ttm_ebitda, gross_margin_pct, industry_normalized, industry, location, this_year_revenue, last_year_revenue, financial_years, description, company_highlights, team, key_items, customer_base, sponsorship, billing_model, profitability, gross_margins, b2b_b2c, revenue_type, collateral_available, use_of_funds, existing_debt_items, cash_burn_ok, year_founded, headcount, total_equity_raised, financial_comments, narrative_summary, narrative_embedding, narrative_source_hash",
      )
      .eq("deal_id", dealId)
      .maybeSingle();

    const [{ data: dsDocs }, { data: vdrDocs }, { data: dealNotes }, { data: dealLendersOnThisDeal }] = await Promise.all([
      supabase.from("deal_space_documents").select("name, created_at").eq("deal_id", dealId).limit(50),
      supabase.from("vdr_documents").select("filename, updated_at").eq("deal_id", dealId).is("deleted_at", null).limit(50),
      supabase.from("deal_space_notes").select("title, content, tags, is_pinned, updated_at").eq("deal_id", dealId).order("updated_at", { ascending: false }).limit(30),
      supabase.from("deal_lenders").select("name, pass_reason, notes, tags, tracking_status, stage").eq("deal_id", dealId),
    ]);

    const dealTypesFromDeal = deal.deal_type ? splitList(deal.deal_type) : [];
    const overriddenDealTypes = Array.isArray(criteriaOverride?.dealTypes) && criteriaOverride.dealTypes.length > 0
      ? criteriaOverride.dealTypes.map((s: any) => String(s).trim()).filter(Boolean)
      : dealTypesFromDeal.length ? dealTypesFromDeal : (writeup?.deal_type ? splitList(writeup.deal_type) : []);
    const overriddenValue = typeof criteriaOverride?.dealValue === "number" && criteriaOverride.dealValue > 0
      ? criteriaOverride.dealValue
      : toNum(deal.value) ?? toNum((writeup as any)?.capital_ask_amount) ?? toNum(writeup?.capital_ask) ?? null;

    const sufficiency = checkSufficiency(
      { value: overriddenValue, dealTypes: overriddenDealTypes },
      writeup, dsDocs ?? [], vdrDocs ?? [],
    );
    if (!sufficiency.ok) {
      return new Response(
        JSON.stringify({ recommendations: [], sufficiency, generatedAt: new Date().toISOString() }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Exclusions: lenders already on this deal, plus explicit user exclusions
    const [{ data: exclusions }, { data: financialFiles }] = await Promise.all([
      supabase.from("deal_lender_recommendation_exclusions").select("lender_name").eq("deal_id", dealId),
      supabase.from("deal_space_financials").select("name, fiscal_period, fiscal_year, updated_at").eq("deal_id", dealId).limit(20),
    ]);
    const excludeSet = new Set<string>([
      ...(dealLendersOnThisDeal ?? []).map((l: any) => lc(l.name)),
      ...(exclusions ?? []).map((e: any) => lc(e.lender_name)),
    ]);

    // Master lender directory
    const { data: masterLenders } = await supabase
      .from("master_lenders")
      .select(
        "id, name, lender_type, loan_types, sub_debt, cash_burn, sponsorship, sponsor_requirement, appetite_status, min_revenue, ebitda_min, min_gross_margin_pct, max_leverage, min_deal, max_deal, sweet_spot_min, sweet_spot_max, industries, industries_to_avoid, b2b_b2c, refinancing, geo, geographies, geographies_excluded, tier, active, deal_structure_notes, company_requirements, tags, updated_at",
      )
      .limit(2000);

    const activeLenders = (masterLenders ?? []).filter(
      (l: any) => l.active !== false && lc(l.appetite_status) !== "paused" && !excludeSet.has(lc(l.name)),
    );

    // Recent activity in last 90 days across all deals
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentLenderRows } = await supabase
      .from("deal_lenders")
      .select("name, status, pass_reason, tracking_status, updated_at")
      .gte("updated_at", ninetyDaysAgo)
      .limit(3000);
    const recentSet = new Set((recentLenderRows ?? []).map((r: any) => lc(r.name)));

    // ── Admin match rules (do_not_match / penalize / boost) ─────────────────
    const { data: matchRules } = await supabase
      .from("lender_match_rules")
      .select("rule_type, lender_id, lender_name, applies_when, reason, delta")
      .eq("active", true)
      .limit(500);
    const matchRuleFor = (lenderId: string | null, lenderName: string) => {
      const lname = lc(lenderName);
      return (matchRules ?? []).filter((r: any) =>
        (r.lender_id && r.lender_id === lenderId) || (r.lender_name && lc(r.lender_name) === lname),
      );
    };

    // ── Explicit recommendation outcomes (team feedback loop) ───────────────
    const eighteenMo = new Date(Date.now() - 540 * 24 * 60 * 60 * 1000).toISOString();
    const { data: outcomeRows } = await supabase
      .from("lender_recommendation_outcomes")
      .select("lender_id, lender_name, status, fit_quality, decline_reason, reported_at, deal:deals(business_model, deal_type, value)")
      .gte("reported_at", eighteenMo)
      .limit(3000);
    const outcomesByLender = new Map<string, any[]>();
    (outcomeRows ?? []).forEach((r: any) => {
      const k = r.lender_id || lc(r.lender_name);
      if (!k) return;
      const list = outcomesByLender.get(k) ?? [];
      list.push(r);
      outcomesByLender.set(k, list);
    });
    const passReasonsByLender = new Map<string, string[]>();
    (recentLenderRows ?? []).forEach((r: any) => {
      if (!r?.pass_reason) return;
      const key = lc(r.name);
      if (!key) return;
      const list = passReasonsByLender.get(key) ?? [];
      if (list.length < 5) list.push(String(r.pass_reason).slice(0, 120));
      passReasonsByLender.set(key, list);
    });

    // ── Historical positive outcomes (last 18 months) ────────────────────────
    // Joined to deals so we can compare industry / deal_type to the current deal.
    const eighteenMoAgo = new Date(Date.now() - 540 * 24 * 60 * 60 * 1000).toISOString();
    const POSITIVE_STATUSES = ["funded", "closed", "closed-won", "won", "termsheet", "term sheet", "term-sheet", "io", "indication", "loi"];
    const { data: positiveOutcomes } = await supabase
      .from("deal_lenders")
      .select("name, master_lender_id, status, tracking_status, updated_at, deal:deals(id, business_model, deal_type, value)")
      .gte("updated_at", eighteenMoAgo)
      .limit(5000);
    const positiveByLender = new Map<string, { industry: string; dealType: string; value: number | null; status: string }[]>();
    (positiveOutcomes ?? []).forEach((r: any) => {
      const status = lc(r.tracking_status) + " " + lc(r.status);
      if (!POSITIVE_STATUSES.some((p) => status.includes(p))) return;
      const k = lc(r.name);
      if (!k) return;
      const deal = r.deal || {};
      const list = positiveByLender.get(k) ?? [];
      list.push({
        industry: lc(deal.business_model ?? ""),
        dealType: lc(deal.deal_type ?? ""),
        value: toNum(deal.value),
        status: status.trim(),
      });
      positiveByLender.set(k, list);
    });

    // Lender notes & pass patterns
    const lenderIds = activeLenders.map((l: any) => l.id).filter(Boolean);
    const lenderNames = activeLenders.map((l: any) => l.name).filter(Boolean);
    const [{ data: lenderNotesByIdRows }, { data: lenderNotesByNameRows }, { data: passPatternRows }] = await Promise.all([
      lenderIds.length
        ? supabase.from("lender_notes").select("master_lender_id, body, tags, is_flag").in("master_lender_id", lenderIds).limit(2000)
        : Promise.resolve({ data: [] as any[] } as any),
      lenderNames.length
        ? supabase.from("lender_notes").select("lender_name, body, tags, is_flag").in("lender_name", lenderNames).is("master_lender_id", null).limit(2000)
        : Promise.resolve({ data: [] as any[] } as any),
      lenderIds.length
        ? supabase.from("lender_pass_patterns").select("master_lender_id, lender_name, reason_category, pattern_value, confidence_score, occurrence_count").in("master_lender_id", lenderIds).limit(2000)
        : Promise.resolve({ data: [] as any[] } as any),
    ]);

    const notesById = new Map<string, { body: string; tags: string[]; flag: boolean }[]>();
    (lenderNotesByIdRows ?? []).forEach((n: any) => {
      const k = n.master_lender_id;
      const list = notesById.get(k) ?? [];
      list.push({ body: n.body ?? "", tags: arr(n.tags), flag: !!n.is_flag });
      notesById.set(k, list);
    });
    const notesByName = new Map<string, { body: string; tags: string[]; flag: boolean }[]>();
    (lenderNotesByNameRows ?? []).forEach((n: any) => {
      const k = lc(n.lender_name);
      const list = notesByName.get(k) ?? [];
      list.push({ body: n.body ?? "", tags: arr(n.tags), flag: !!n.is_flag });
      notesByName.set(k, list);
    });
    const patternsByLender = new Map<string, any[]>();
    (passPatternRows ?? []).forEach((p: any) => {
      const k = p.master_lender_id || lc(p.lender_name);
      const list = patternsByLender.get(k) ?? [];
      list.push(p);
      patternsByLender.set(k, list);
    });

    // ── AI-extracted lender fit attributes (reusable, embedding-backed) ──────
    const { data: fitRows } = lenderIds.length
      ? await supabase
          .from("lender_fit_attributes")
          .select("master_lender_id, lender_name, summary, positive_signals, negative_signals, exclusions, nuanced_preferences, embedding")
          .in("master_lender_id", lenderIds)
      : { data: [] as any[] };
    const fitById = new Map<string, any>();
    (fitRows ?? []).forEach((f: any) => fitById.set(f.master_lender_id, f));

    // Build deal evaluation context
    const overrideIndustry = (criteriaOverride?.industry && String(criteriaOverride.industry).trim()) || null;
    const overrideGeo = (criteriaOverride?.geo && String(criteriaOverride.geo).trim()) || null;
    const writeUpDebt = Array.isArray(writeup?.existing_debt_items) ? writeup!.existing_debt_items : [];
    const writeUpKeyItems = Array.isArray(writeup?.key_items) ? writeup!.key_items : [];
    const writeUpHighlights = Array.isArray(writeup?.company_highlights) ? writeup!.company_highlights : [];
    const writeUpTeam = Array.isArray(writeup?.team) ? writeup!.team : [];
    const revenue = toNum((writeup as any)?.ttm_revenue) ?? toNum(writeup?.this_year_revenue) ?? toNum(writeup?.last_year_revenue) ?? toNum(deal.mrr) ?? null;
    const ebitda = toNum((writeup as any)?.ttm_ebitda) ?? toNum((writeup as any)?.ebitda) ?? null;

    const dealNarrative = [
      deal.narrative, writeup?.description,
      typeof writeup?.team === "string" ? writeup.team : JSON.stringify(writeUpTeam).slice(0, 600),
      typeof writeup?.company_highlights === "string" ? writeup.company_highlights : JSON.stringify(writeUpHighlights).slice(0, 600),
      writeup?.customer_base, writeup?.use_of_funds,
      (writeup as any)?.existing_debt_details,
      deal.key_signal, deal.pain_points_confirmed, deal.objections_raised, deal.product_gap_flagged,
    ].filter(Boolean).join("\n\n").slice(0, 6000);

    // QA / simulation: allow appending synthetic narrative + notes text
    const narrativeAppend = typeof (criteriaOverride as any)?.narrativeAppend === "string"
      ? String((criteriaOverride as any).narrativeAppend).slice(0, 3000) : "";
    const notesAppend = typeof (criteriaOverride as any)?.notesAppend === "string"
      ? String((criteriaOverride as any).notesAppend).slice(0, 3000) : "";
    const simulatedNarrative = narrativeAppend
      ? (dealNarrative + "\n\n[SIMULATED]\n" + narrativeAppend).slice(0, 8000)
      : dealNarrative;

    const dealNoteText = (dealNotes ?? [])
      .map((n: any) => `${n.title}: ${(n.content ?? "").slice(0, 400)} [${arr(n.tags).join(",")}]`)
      .join("\n").slice(0, 4000);
    const simulatedNoteText = notesAppend
      ? (dealNoteText + "\n[SIMULATED]: " + notesAppend).slice(0, 5000)
      : dealNoteText;
    const dealLenderFeedback = (dealLendersOnThisDeal ?? [])
      .filter((dl: any) => dl?.pass_reason || dl?.notes)
      .map((dl: any) => `${dl.name}: ${dl.pass_reason || ""} ${dl.notes || ""}`.trim().slice(0, 300))
      .join("\n").slice(0, 3000);

    const dealEvidenceText = [simulatedNarrative, simulatedNoteText, dealLenderFeedback].join("\n");

    // ── Embed the deal narrative (cached on deal_writeups via source hash) ───
    const narrativeBundle = [
      `Company: ${deal.company ?? ""}`,
      `Industry: ${writeup?.industry ?? deal.business_model ?? ""}`,
      `Deal types: ${sufficiency.dealTypes.join(", ")}`,
      `Capital ask: ${overriddenValue ?? ""}`,
      `Sponsorship: ${writeup?.sponsorship ?? ""}`,
      `B2B/B2C: ${writeup?.b2b_b2c ?? ""}`,
      `Collateral: ${writeup?.collateral_available ?? ""}`,
      `Use of funds: ${writeup?.use_of_funds ?? ""}`,
      simulatedNarrative,
      simulatedNoteText,
    ].filter(Boolean).join("\n\n").slice(0, 8000);
    const narrativeHash = await sha256Hex(narrativeBundle);
    let dealEmbedding: number[] | null = parseEmbedding((writeup as any)?.narrative_embedding);
    const isSimulated = !!(narrativeAppend || notesAppend);
    if (!dealEmbedding || (writeup as any)?.narrative_source_hash !== narrativeHash) {
      dealEmbedding = await embedText(narrativeBundle);
      if (dealEmbedding && !isSimulated) {
        await supabase.from("deal_writeups").update({
          narrative_embedding: dealEmbedding as any,
          narrative_source_hash: narrativeHash,
          narrative_embedded_at: new Date().toISOString(),
        }).eq("deal_id", dealId);
      }
    }
    const dealNarrativeLc = lc(dealEvidenceText + " " + (writeup?.industry ?? "") + " " + (deal.business_model ?? "") + " " + (writeup?.sponsorship ?? "") + " " + (writeup?.profitability ?? ""));

    const dealCtx = {
      name: deal.company ?? null,
      value: overriddenValue,
      dealTypes: sufficiency.dealTypes,
      industry: overrideIndustry || (writeup as any)?.industry_normalized || writeup?.industry || deal.business_model || null,
      subIndustry: deal.opportunity_type || null,
      businessModel: deal.business_model || writeup?.billing_model || null,
      location: overrideGeo || writeup?.location || null,
      engagementType: deal.engagement_type || null,
      dealClass: deal.deal_class || null,
      sponsorship: writeup?.sponsorship || null,
      billingModel: writeup?.billing_model || null,
      b2bB2c: writeup?.b2b_b2c || null,
      revenueType: writeup?.revenue_type || null,
      revenue,
      ebitda,
      profitability: writeup?.profitability || null,
      grossMargins: writeup?.gross_margins || null,
      grossMarginPct: toNum((writeup as any)?.gross_margin_pct),
      collateral: writeup?.collateral_available || null,
      cashBurnOk: writeup?.cash_burn_ok ?? null,
      useOfFunds: writeup?.use_of_funds || null,
      existingDebt: writeUpDebt,
      keyItems: writeUpKeyItems,
      customerBase: writeup?.customer_base || null,
      tags: arr(deal.tags),
      narrative: simulatedNarrative,
      notes: simulatedNoteText,
      lenderFeedbackOnThisDeal: dealLenderFeedback,
      financialStatementsOnFile: (financialFiles ?? []).slice(0, 12).map((f: any) => ({
        name: f.name, period: f.fiscal_period, year: f.fiscal_year,
      })),
      dataroomDocCount: (dsDocs?.length || 0) + (vdrDocs?.length || 0),
    };

    // ── Deterministic scoring + hard filters ─────────────────────────────────
    const WEIGHTS = {
      type: 0.20, size: 0.16, industry: 0.16,
      geography: 0.07, structure: 0.12, recency: 0.07, evidence: 0.10, semantic: 0.12,
    };
    const STRUCTURED_KEYS = ["type", "size", "industry", "geography", "structure"] as const;
    const UNSTRUCTURED_KEYS = ["evidence", "semantic", "recency"] as const;

    type Scored = {
      lender: any;
      components: ComponentScores;
      detScore: number;
      reasons: string[];
      passReasons: string[];
      lenderNoteText: string;
      lenderTags: string[];
      hardFilterChecks: { name: string; passed: boolean; reason?: string }[];
      structuredReasons: Record<string, string>;
      unstructuredReasons: Record<string, string>;
      penalties: { name: string; delta: number; reason: string }[];
      boosts: { name: string; delta: number; reason: string }[];
    };
    const candidates: Scored[] = [];
    const filteredOut: { name: string; reason: string }[] = [];
    // QA mode: also keep full per-check trace + lender meta for filtered lenders
    const qaHardFiltered: any[] = [];

    for (const lender of activeLenders) {
      const noteRecords = [
        ...(notesById.get(lender.id) ?? []),
        ...(notesByName.get(lc(lender.name)) ?? []),
      ];
      const lenderNoteText = noteRecords.map((n) => n.body).join("\n").slice(0, 3000);
      const lenderTags = [
        ...arr(lender.tags),
        ...noteRecords.flatMap((n) => n.tags),
      ];
      const hasFlag = noteRecords.some((n) => n.flag);
      const passReasons = passReasonsByLender.get(lc(lender.name)) ?? [];
      const patterns = patternsByLender.get(lender.id) ?? patternsByLender.get(lc(lender.name)) ?? [];
      const fit = fitById.get(lender.id);
      const fitPositive: { signal: string; confidence: number }[] = Array.isArray(fit?.positive_signals) ? fit.positive_signals : [];
      const fitNegative: { signal: string; confidence: number }[] = Array.isArray(fit?.negative_signals) ? fit.negative_signals : [];
      const fitExclusions: { pattern: string; confidence: number }[] = Array.isArray(fit?.exclusions) ? fit.exclusions : [];
      const fitEmbedding = parseEmbedding(fit?.embedding);

      // AI-extracted hard exclusion match against the deal narrative/industry
      const matchedExclusion = fitExclusions.find((ex) => ex.confidence >= 0.7 && ex.pattern && dealNarrativeLc.includes(lc(ex.pattern)));

      const type = scoreLoanType(dealCtx, lender);
      const size = scoreSize(dealCtx, lender);
      const industry = scoreIndustry(dealCtx, lender);
      const geography = scoreGeography(dealCtx, lender);
      const structure = scoreStructure(dealCtx, lender);
      const recency = scoreRecency(lender, recentSet, passReasons);
      const evidence = scoreEvidence(lender, [lenderNoteText], lenderTags, "");

      // Semantic similarity: cosine vs lender fit embedding → 0..100
      let semantic = 50;
      let semanticReason = "no fit embedding cached yet";
      if (dealEmbedding && fitEmbedding) {
        const sim = cosineSim(dealEmbedding, fitEmbedding); // -1..1, typically 0..0.6
        semantic = Math.round(Math.max(0, Math.min(1, (sim + 0.1) / 0.7)) * 100);
        semanticReason = `cosine sim ${sim.toFixed(2)} vs lender narrative embedding`;
      }

      // Positive/negative signal nudges (string-contains against deal narrative)
      const posHits = fitPositive.filter((s) => s.signal && dealNarrativeLc.includes(lc(s.signal.split(" ").slice(0, 4).join(" "))));
      const negHits = fitNegative.filter((s) => s.signal && dealNarrativeLc.includes(lc(s.signal.split(" ").slice(0, 4).join(" "))));
      const evidenceAdj = posHits.reduce((a, s) => a + 8 * s.confidence, 0) - negHits.reduce((a, s) => a + 12 * s.confidence, 0);
      const evidenceScore = Math.max(0, Math.min(100, evidence.score + evidenceAdj));

      // ─── LAYER 1 — HARD FILTERS (non-negotiables) ──────────────────────────
      const blockingPatterns = patterns.filter((p: any) => Number(p.confidence_score ?? 0) >= 0.8 && Number(p.occurrence_count ?? 0) >= 2);
      // Admin do_not_match rules — scoped by applies_when (industry/dealType/size)
      const rulesForLender = matchRuleFor(lender.id, lender.name);
      const ruleApplies = (r: any) => {
        const w = r?.applies_when || {};
        if (Array.isArray(w.dealType) && w.dealType.length && !w.dealType.some((t: string) => (dealCtx.dealTypes ?? []).map(lc).includes(lc(t)))) return false;
        if (w.industry && lc(dealCtx.industry ?? "").indexOf(lc(w.industry)) < 0) return false;
        if (typeof w.minDealValue === "number" && (!dealCtx.value || dealCtx.value < w.minDealValue)) return false;
        if (typeof w.maxDealValue === "number" && dealCtx.value && dealCtx.value > w.maxDealValue) return false;
        return true;
      };
      const activeDoNotMatch = rulesForLender.find((r: any) => r.rule_type === "do_not_match" && ruleApplies(r));
      const hardChecks: { name: string; passed: boolean; reason?: string }[] = [
        { name: "Active mandate", passed: lender.active !== false, reason: lender.active === false ? "lender inactive" : undefined },
        { name: "Product type",   passed: !(type.score <= 10 && arr(lender.loan_types).length > 0), reason: type.score <= 10 ? type.reason : undefined },
        { name: "Facility size",  passed: size.score > 5, reason: size.score <= 5 ? size.reason : undefined },
        { name: "Industry avoid list", passed: !industry.hardOut, reason: industry.hardOut ? industry.reason : undefined },
        { name: "Geography exclusion", passed: !geography.hardOut, reason: geography.hardOut ? geography.reason : undefined },
        { name: "AI exclusion",   passed: !matchedExclusion, reason: matchedExclusion ? `narrative contains "${matchedExclusion.pattern}"` : undefined },
        { name: "Flagged in notes", passed: !hasFlag, reason: hasFlag ? "flagged in lender notes" : undefined },
        { name: "Negative-evidence threshold", passed: !evidence.hardOut, reason: evidence.hardOut ? evidence.reason : undefined },
        { name: "Repeat-pass patterns", passed: blockingPatterns.length < 2, reason: blockingPatterns.length >= 2 ? `${blockingPatterns.length} high-confidence repeat passes` : undefined },
        { name: "Admin do-not-match rule", passed: !activeDoNotMatch, reason: activeDoNotMatch ? activeDoNotMatch.reason : undefined },
      ];
      const failedHard = hardChecks.find((c) => !c.passed);
      if (failedHard) {
        filteredOut.push({ name: lender.name, reason: `${failedHard.name}: ${failedHard.reason ?? "blocked"}` });
        if (qa) {
          qaHardFiltered.push({
            lenderId: lender.id ?? null,
            lenderName: lender.name,
            tier: lender.tier ?? null,
            loanTypes: arr(lender.loan_types),
            industries: arr(lender.industries),
            minDeal: toNum(lender.min_deal),
            maxDeal: toNum(lender.max_deal),
            active: lender.active !== false,
            hardFiltered: true,
            failedCheck: failedHard.name,
            failedReason: failedHard.reason ?? "blocked",
            hardFilterChecks: hardChecks,
            components: {
              type: type.score, size: size.score, industry: industry.score,
              geography: geography.score, structure: structure.score,
              recency: recency.score, evidence: evidenceScore, semantic,
            },
          });
        }
        continue;
      }

      const components: ComponentScores = {
        type: type.score, size: size.score, industry: industry.score,
        geography: geography.score, structure: structure.score,
        recency: recency.score, evidence: evidenceScore, semantic,
      };

      // ─── LAYER 2 — STRUCTURED SCORING ──────────────────────────────────────
      const structuredScore =
        (components.type * WEIGHTS.type +
         components.size * WEIGHTS.size +
         components.industry * WEIGHTS.industry +
         components.geography * WEIGHTS.geography +
         components.structure * WEIGHTS.structure)
        / STRUCTURED_KEYS.reduce((s, k) => s + (WEIGHTS as any)[k], 0);

      // ─── LAYER 3 — UNSTRUCTURED / AI-DERIVED SCORING ──────────────────────
      const unstructuredScore =
        (components.evidence * WEIGHTS.evidence +
         components.semantic * WEIGHTS.semantic +
         components.recency * WEIGHTS.recency)
        / UNSTRUCTURED_KEYS.reduce((s, k) => s + (WEIGHTS as any)[k], 0);

      // Base deterministic blend = same weighted sum as before (sums to 1.0)
      const detScore =
        components.type * WEIGHTS.type +
        components.size * WEIGHTS.size +
        components.industry * WEIGHTS.industry +
        components.geography * WEIGHTS.geography +
        components.structure * WEIGHTS.structure +
        components.recency * WEIGHTS.recency +
        components.evidence * WEIGHTS.evidence +
        components.semantic * WEIGHTS.semantic;

      // ─── LAYER 4 — PENALTIES ──────────────────────────────────────────────
      const penalties: { name: string; delta: number; reason: string }[] = [];
      if (passReasons.length) {
        penalties.push({ name: "Recent passes", delta: -Math.min(15, passReasons.length * 5), reason: `${passReasons.length} pass(es) in last 90d: "${passReasons[0]}"` });
      }
      if (blockingPatterns.length === 1) {
        penalties.push({ name: "Repeat-pass pattern", delta: -8, reason: `pattern "${blockingPatterns[0].pattern_value ?? blockingPatterns[0].reason_category}"` });
      }
      if (negHits.length) {
        penalties.push({ name: "Negative note signals", delta: -Math.min(12, negHits.length * 4), reason: negHits.map((h) => h.signal).slice(0, 2).join("; ") });
      }
      // Mandate conflict: lender type or sponsorship clearly mismatched but didn't hit hard filter
      if (type.score > 10 && type.score < 40) {
        penalties.push({ name: "Soft mandate conflict", delta: -6, reason: type.reason });
      }
      // Stale lender — no recent activity and last note >180d (approximated via no recent activity)
      if (!recentSet.has(lc(lender.name)) && lenderNoteText.length === 0 && !fit) {
        penalties.push({ name: "Stale / no signal", delta: -3, reason: "no activity, notes, or AI fit profile" });
      }
      const exclusionTags = lenderTags.filter((t) => /avoid|exclude|do[- ]?not|blacklist/i.test(t));
      if (exclusionTags.length) {
        penalties.push({ name: "Exclusion tags", delta: -10, reason: exclusionTags.join(", ") });
      }

      // Outcome-based penalties — explicit team feedback from prior recommendations
      const explicitOutcomes = outcomesByLender.get(lender.id) ?? outcomesByLender.get(lc(lender.name)) ?? [];
      const negativeOutcomes = explicitOutcomes.filter((o: any) =>
        ["declined", "closed_lost", "dismissed"].includes(String(o.status)) || (typeof o.fit_quality === "number" && o.fit_quality <= 2),
      );
      if (negativeOutcomes.length) {
        const sample = negativeOutcomes[0];
        penalties.push({
          name: "Negative recommendation outcomes",
          delta: -Math.min(15, negativeOutcomes.length * 5),
          reason: `${negativeOutcomes.length} prior negative outcome(s) — e.g. ${sample.status}${sample.decline_reason ? `: "${String(sample.decline_reason).slice(0, 80)}"` : ""}`,
        });
      }
      // Admin penalize rule
      for (const r of rulesForLender) {
        if (r.rule_type === "penalize" && ruleApplies(r) && typeof r.delta === "number") {
          penalties.push({ name: "Admin penalize rule", delta: Math.max(-25, Math.min(0, r.delta)), reason: r.reason });
        }
      }

      // ─── LAYER 5 — BOOSTS (positive historical outcomes) ──────────────────
      const boosts: { name: string; delta: number; reason: string }[] = [];
      const historicalWins = positiveByLender.get(lc(lender.name)) ?? [];
      const dealIndLc = lc(dealCtx.industry ?? "");
      const dealTypesLc = (dealCtx.dealTypes ?? []).map(lc);
      const industryWins = historicalWins.filter((w) => w.industry && dealIndLc && (w.industry.includes(dealIndLc) || dealIndLc.includes(w.industry)));
      const typeWins = historicalWins.filter((w) => dealTypesLc.some((t) => t && w.dealType && (w.dealType.includes(t) || t.includes(w.dealType))));
      const sizeWins = dealCtx.value ? historicalWins.filter((w) => w.value && Math.abs((w.value - dealCtx.value) / dealCtx.value) < 0.5) : [];
      if (industryWins.length) {
        boosts.push({ name: "Industry track record", delta: Math.min(12, 4 + industryWins.length * 3), reason: `${industryWins.length} prior positive outcome(s) in same industry` });
      }
      if (typeWins.length) {
        boosts.push({ name: "Deal-type track record", delta: Math.min(10, 3 + typeWins.length * 3), reason: `${typeWins.length} prior positive outcome(s) on this deal type` });
      }
      if (sizeWins.length) {
        boosts.push({ name: "Comparable-size wins", delta: Math.min(6, sizeWins.length * 2), reason: `${sizeWins.length} positive outcome(s) within ±50% of this deal's size` });
      }
      if (posHits.length) {
        boosts.push({ name: "Positive note signals", delta: Math.min(10, posHits.length * 4), reason: posHits.map((h) => h.signal).slice(0, 2).join("; ") });
      }

      // Outcome-based boosts — explicit positive team feedback / closed wins
      const positiveOutcomes = explicitOutcomes.filter((o: any) =>
        ["closed_won", "terms_issued", "diligence", "engaged"].includes(String(o.status)) || (typeof o.fit_quality === "number" && o.fit_quality >= 4),
      );
      if (positiveOutcomes.length) {
        boosts.push({
          name: "Positive recommendation outcomes",
          delta: Math.min(12, 3 + positiveOutcomes.length * 3),
          reason: `${positiveOutcomes.length} prior positive team feedback / closed outcome(s)`,
        });
      }
      // Admin boost rule
      for (const r of rulesForLender) {
        if (r.rule_type === "boost" && ruleApplies(r) && typeof r.delta === "number") {
          boosts.push({ name: "Admin boost rule", delta: Math.max(0, Math.min(25, r.delta)), reason: r.reason });
        }
      }

      const reasons = [type.reason, size.reason, industry.reason, geography.reason, structure.reason, recency.reason, evidence.reason]
        .filter((r) => r && r.length);

      (candidates as any).push({
        lender, components, detScore, reasons, passReasons, lenderNoteText, lenderTags, fit, posHits, negHits,
        hardFilterChecks: hardChecks,
        structuredScore, unstructuredScore,
        structuredReasons: { type: type.reason, size: size.reason, industry: industry.reason, geography: geography.reason, structure: structure.reason },
        unstructuredReasons: { evidence: evidence.reason, semantic: semanticReason, recency: recency.reason },
        penalties, boosts,
      });
    }

    // Sort by deterministic score. AI re-rank is always capped to the top 25
    // for cost/latency; QA mode still receives the full scored set as
    // recommendations (the rest just have no AI adjustment).
    candidates.sort((a, b) => b.detScore - a.detScore);
    const topForAI = candidates.slice(0, 25);
    const allScored = qa ? candidates : topForAI;

    // ── AI narrative re-rank (Lovable AI Gateway / Claude / fallback) ────────
    let aiAdjustments = new Map<string, { adj: number; rationale: string }>();
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (topForAI.length && (ANTHROPIC_API_KEY || LOVABLE_API_KEY)) {
      const aiLenders = topForAI.map(({ lender, components, detScore, lenderNoteText, lenderTags, passReasons }) => ({
        id: lender.id,
        name: lender.name,
        type: lender.lender_type,
        loanTypes: arr(lender.loan_types),
        industries: arr(lender.industries),
        industriesAvoid: arr(lender.industries_to_avoid),
        minDeal: toNum(lender.min_deal), maxDeal: toNum(lender.max_deal),
        minRevenue: toNum(lender.min_revenue), ebitdaMin: toNum(lender.ebitda_min),
        geo: lender.geo, b2bB2c: lender.b2b_b2c,
        sponsorship: lender.sponsorship, cashBurn: lender.cash_burn,
        tier: lender.tier, refinancing: lender.refinancing,
        notes: (lender.deal_structure_notes || "").slice(0, 400),
        requirements: (lender.company_requirements || "").slice(0, 400),
        tags: lenderTags.slice(0, 20),
        internalNotes: lenderNoteText.slice(0, 1500),
        recentPassReasons: passReasons,
        detScore: Math.round(detScore),
        components,
      }));

      const system = `You are a senior capital markets analyst inside the naitive lender CRM. Each candidate already has a deterministic 0-100 detScore plus component sub-scores. Your job is to nudge that score using qualitative evidence: deal narrative, internal lender notes, tags, recent pass reasons, and structural nuance that rules-based scoring may miss. Output an integer "adj" in [-25, +25] per lender and a one-sentence rationale (<=180 chars, concrete, references the strongest reason — loan type, size band, industry fit, sponsor/burn, geography, or a specific note/pass reason).

Negative adjustments when: internal notes describe friction, repeated passes that still apply, unstated mandate misfit, deal narrative reveals risk (litigation, customer concentration, declining revenue) lender historically dislikes.
Positive adjustments when: lender notes show active appetite for this exact deal type/industry/size; recent comparable funded deal; warm relationship signals; deal narrative aligns with lender's stated thesis.
Be decisive — use the full [-25,+25] range so final scores have real separation.

Respond with strict JSON only: {"adjustments":[{"name":"<name>","adj":<-25..25 integer>,"rationale":"<one sentence>"}]}.`;

      const userMsg = `DEAL CONTEXT:\n${JSON.stringify(dealCtx)}\n\nCANDIDATE LENDERS (${aiLenders.length}):\n${JSON.stringify(aiLenders)}`;

      try {
        let text = "";
        if (ANTHROPIC_API_KEY) {
          const claudeRes = await anthropicFetch({ feature: "recommend-lenders" }, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": ANTHROPIC_API_KEY,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-5-20250929",
              max_tokens: 3500, temperature: 0,
              system, messages: [{ role: "user", content: userMsg }],
            }),
          });
          if (claudeRes.ok) {
            const j = await claudeRes.json();
            text = j?.content?.[0]?.text ?? "";
          } else {
            console.error("Claude error", claudeRes.status, await claudeRes.text());
          }
        }
        if (!text && LOVABLE_API_KEY) {
          const lov = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
            body: JSON.stringify({
              model: "google/gemini-2.5-pro",
              temperature: 0,
              messages: [
                { role: "system", content: system },
                { role: "user", content: userMsg },
              ],
            }),
          });
          if (lov.ok) {
            const j = await lov.json();
            text = j?.choices?.[0]?.message?.content ?? "";
          } else {
            console.error("Lovable AI error", lov.status, await lov.text());
          }
        }
        if (text) {
          const match = text.match(/\{[\s\S]*\}/);
          const parsed = JSON.parse(match ? match[0] : text);
          for (const a of parsed?.adjustments ?? []) {
            const k = lc(a.name);
            const adj = Math.max(-25, Math.min(25, Math.round(Number(a.adj) || 0)));
            aiAdjustments.set(k, { adj, rationale: String(a.rationale ?? "").slice(0, 200) });
          }
        }
      } catch (e) {
        console.error("AI re-rank failed; falling back to deterministic only", e);
      }
    }

    // ── Build final recommendations ──────────────────────────────────────────
    const recommendations: Recommendation[] = allScored.map((c) => {
      const cAny = c as any;
      const adjEntry = aiAdjustments.get(lc(c.lender.name));
      const adj = adjEntry?.adj ?? 0;
      const penalties = cAny.penalties ?? [];
      const boosts = cAny.boosts ?? [];
      const penaltyTotal = penalties.reduce((s: number, p: any) => s + p.delta, 0);
      const boostTotal = boosts.reduce((s: number, p: any) => s + p.delta, 0);
      const preDiversity = Math.max(0, Math.min(100, Math.round(c.detScore + adj + penaltyTotal + boostTotal)));

      // Confidence: how many evaluative dimensions had real signal
      const sigDims = [
        c.components.type !== 50, c.components.size !== 50,
        c.components.industry !== 50 && c.components.industry !== 55,
        c.components.geography !== 70, c.components.structure !== 70,
        c.components.evidence !== 100,
        !!adjEntry,
      ].filter(Boolean).length;
      const confidence = Math.round((sigDims / 7) * 100);

      // Build rationale: prefer AI; otherwise top 2 deterministic reasons.
      let rationale = adjEntry?.rationale || "";
      if (!rationale) {
        // pick best-scoring + worst-scoring reasons to summarize
        const entries = Object.entries(c.components) as [keyof ComponentScores, number][];
        const top = [...entries].sort((a, b) => b[1] - a[1])[0];
        const bot = [...entries].sort((a, b) => a[1] - b[1])[0];
        rationale = `Strong ${top[0]} fit (${top[0] === 'evidence' ? top[1] : top[1]}); weakest on ${bot[0]} (${bot[1]}).`;
      }

      const pipelineTrace: PipelineTrace = {
        hardFilters: { passed: true, checks: cAny.hardFilterChecks ?? [] },
        structured: {
          score: Math.round(cAny.structuredScore ?? 0),
          components: STRUCTURED_KEYS.map((k) => ({
            name: k, score: (c.components as any)[k], weight: (WEIGHTS as any)[k],
            reason: cAny.structuredReasons?.[k] ?? "",
          })),
        },
        unstructured: {
          score: Math.round(cAny.unstructuredScore ?? 0),
          components: UNSTRUCTURED_KEYS.map((k) => ({
            name: k, score: (c.components as any)[k], weight: (WEIGHTS as any)[k],
            reason: cAny.unstructuredReasons?.[k] ?? "",
          })),
        },
        penalties,
        boosts,
        final: {
          deterministic: Math.round(c.detScore),
          aiAdjustment: adj,
          penaltyTotal,
          boostTotal,
          diversityDelta: 0,
          matchScore: preDiversity,
          confidence,
        },
        weights: WEIGHTS,
      };

      return {
        lenderId: c.lender.id ?? null,
        lenderName: c.lender.name,
        matchScore: preDiversity,
        confidence,
        rationale: rationale.slice(0, 220),
        components: { ...c.components, ai: adj },
        tier: c.lender.tier ?? null,
        loanTypes: arr(c.lender.loan_types),
        industries: arr(c.lender.industries),
        minDeal: toNum(c.lender.min_deal),
        maxDeal: toNum(c.lender.max_deal),
        active: c.lender.active !== false,
        recentActivity: recentSet.has(lc(c.lender.name)),
        positiveFitSignals: (cAny.posHits ?? []).map((h: any) => h.signal).slice(0, 5),
        negativeFitSignals: (cAny.negHits ?? []).map((h: any) => h.signal).slice(0, 5),
        matchedExclusion: null,
        fitSummary: cAny.fit?.summary ?? null,
        explanation: buildExplanation({
          lender: c.lender,
          dealCtx,
          components: c.components,
          aiAdj: adj,
          aiRationale: adjEntry?.rationale ?? '',
          posHits: cAny.posHits ?? [],
          negHits: cAny.negHits ?? [],
          lenderTags: c.lenderTags ?? [],
          passReasons: c.passReasons ?? [],
          patterns: patternsByLender.get(c.lender.id) ?? patternsByLender.get(lc(c.lender.name)) ?? [],
          fit: cAny.fit,
          recentActivity: recentSet.has(lc(c.lender.name)),
          reasons: c.reasons ?? [],
        }),
        pipelineTrace,
      };
    });

    recommendations.sort((a, b) => b.matchScore - a.matchScore);

    // ── Persist a run log + per-item snapshots (fire-and-forget) ────────────
    const logRun = async (finalList: Recommendation[]) => {
      try {
        const { data: runRow, error: runErr } = await supabase
          .from("lender_recommendation_runs")
          .insert({
            deal_id: dealId,
            triggered_by: userData.user.id,
            qa_mode: qa,
            criteria_override: criteriaOverride ?? null,
            evaluated_count: activeLenders.length,
            scored_count: candidates.length,
            hard_filtered_count: filteredOut.length,
            model_used: ANTHROPIC_API_KEY ? "claude-sonnet-4" : (LOVABLE_API_KEY ? "gemini-2.5-pro" : "deterministic-only"),
            weights: WEIGHTS,
            meta: {
              fitAttributesLoaded: fitById.size,
              dealEmbedded: !!dealEmbedding,
              simulated: !!(narrativeAppend || notesAppend),
              outcomesLoaded: outcomeRows?.length ?? 0,
              matchRulesLoaded: matchRules?.length ?? 0,
            },
          })
          .select("id")
          .single();
        if (runErr || !runRow?.id) return;

        const items: any[] = [];
        finalList.slice(0, 60).forEach((r, idx) => {
          const t = r.pipelineTrace;
          items.push({
            run_id: runRow.id,
            lender_id: r.lenderId,
            lender_name: r.lenderName,
            hard_filtered: false,
            match_score: r.matchScore,
            confidence: r.confidence,
            structured_score: t?.structured.score ?? null,
            unstructured_score: t?.unstructured.score ?? null,
            penalty_total: t?.final.penaltyTotal ?? null,
            boost_total: t?.final.boostTotal ?? null,
            ai_adjustment: t?.final.aiAdjustment ?? null,
            dominant_driver: r.explanation?.dominantDriver ?? null,
            rationale: r.rationale,
            components: r.components as any,
            rank_position: idx + 1,
          });
        });
        qaHardFiltered.slice(0, 40).forEach((h: any) => {
          items.push({
            run_id: runRow.id,
            lender_id: h.lenderId,
            lender_name: h.lenderName,
            hard_filtered: true,
            failed_check: h.failedCheck,
            failed_reason: h.failedReason,
            components: h.components ?? null,
          });
        });
        if (items.length) await supabase.from("lender_recommendation_run_items").insert(items);
      } catch (e) {
        console.error("logRun failed", e);
      }
    };

    // In QA mode skip diversification & the 40-floor — the harness needs to see
    // every scored lender with its raw final score and full trace.
    if (qa) {
      logRun(recommendations); // fire-and-forget; no await to keep latency low
      return new Response(
        JSON.stringify({
          recommendations,
          hardFiltered: qaHardFiltered,
          sufficiency,
          generatedAt: new Date().toISOString(),
          meta: {
            evaluated: activeLenders.length,
            scored: candidates.length,
            hardFilteredCount: filteredOut.length,
            hardFilteredSample: filteredOut.slice(0, 25),
            modelUsed: ANTHROPIC_API_KEY ? "claude-sonnet-4" : (LOVABLE_API_KEY ? "gemini-2.5-pro" : "deterministic-only"),
            weights: WEIGHTS,
            fitAttributesLoaded: fitById.size,
            dealEmbedded: !!dealEmbedding,
            historicalOutcomesLoaded: positiveByLender.size,
            simulated: { narrativeAppend: !!narrativeAppend, notesAppend: !!notesAppend, criteriaOverride: criteriaOverride ?? null },
            qaMode: true,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── LAYER 7 — DIVERSIFICATION ────────────────────────────────────────────
    // Greedy selection: take highest-scoring lender; cap how many near-identical
    // lenders (same lender_type AND same tier) can sit in the top list unless
    // their score gap is < 4 points (truly tied — let them through).
    const eligible = recommendations
      .filter((r) => r.matchScore >= 40 && !excludeSet.has(lc(r.lenderName)));
    const TARGET = 12;
    const typeCap = 4, tierCap = 5;
    const typeCount = new Map<string, number>(), tierCount = new Map<string, number>();
    const picked: Recommendation[] = [];
    const deferred: Recommendation[] = [];
    for (const r of eligible) {
      const lenderObj = (recommendations as any).__lendersById; // not maintained — read tier/type from rec
      const tKey = lc((r as any).pipelineTrace?.structured?.components?.find((x: any) => x.name === "structure")?.reason ?? "") || lc(r.tier ?? "any-tier");
      const tierKey = lc(r.tier ?? "untiered");
      // Use loanTypes as proxy for lender_type cluster
      const typeKey = (r.loanTypes ?? []).slice(0, 2).map(lc).join("|") || "no-type";
      const tCount = typeCount.get(typeKey) ?? 0;
      const trCount = tierCount.get(tierKey) ?? 0;
      const overloaded = tCount >= typeCap || trCount >= tierCap;
      if (overloaded) {
        // demote: penalize and defer
        const penalty = -4;
        const newScore = Math.max(0, r.matchScore + penalty);
        if (r.pipelineTrace) {
          r.pipelineTrace.final.diversityDelta = penalty;
          r.pipelineTrace.final.matchScore = newScore;
          r.pipelineTrace.diversification = { reason: `cap reached for ${tCount >= typeCap ? `loan-type "${typeKey}"` : `tier "${tierKey}"`}`, demoted: true };
        }
        r.matchScore = newScore;
        deferred.push(r);
        continue;
      }
      typeCount.set(typeKey, tCount + 1);
      tierCount.set(tierKey, trCount + 1);
      if (r.pipelineTrace) r.pipelineTrace.diversification = { reason: "passed diversification", demoted: false };
      picked.push(r);
      if (picked.length >= TARGET) break;
    }
    // Backfill from deferred (already penalty-adjusted) if we have room.
    if (picked.length < TARGET) {
      deferred.sort((a, b) => b.matchScore - a.matchScore);
      for (const r of deferred) {
        if (picked.length >= TARGET) break;
        picked.push(r);
      }
    }
    const final = picked;
    logRun(final); // persist run log + per-item snapshots (fire-and-forget)

    // Fire-and-forget: extract fit attributes for top candidates missing them,
    // so the next recommendation pass benefits from richer signal.
    const missingFitIds = topForAI
      .filter((c: any) => !fitById.get(c.lender.id))
      .map((c) => c.lender.id)
      .filter(Boolean)
      .slice(0, 15);
    if (missingFitIds.length && Deno.env.get("LOVABLE_API_KEY")) {
      const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/extract-lender-fit`;
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader! },
        body: JSON.stringify({ lenderIds: missingFitIds }),
      }).catch((e) => console.error("background extract-lender-fit failed", e));
    }

    return new Response(
      JSON.stringify({
        recommendations: final,
        sufficiency,
        generatedAt: new Date().toISOString(),
        meta: {
          evaluated: activeLenders.length,
          scored: candidates.length,
          hardFilteredCount: filteredOut.length,
          hardFilteredSample: filteredOut.slice(0, 10),
          modelUsed: ANTHROPIC_API_KEY ? "claude-sonnet-4" : (LOVABLE_API_KEY ? "gemini-2.5-pro" : "deterministic-only"),
          weights: WEIGHTS,
          fitAttributesLoaded: fitById.size,
          backgroundExtractionQueued: missingFitIds.length,
          dealEmbedded: !!dealEmbedding,
          historicalOutcomesLoaded: positiveByLender.size,
          pipelineLayers: ["hardFilter", "structured", "unstructured", "aiRerank", "penalties", "boosts", "diversification"],
          diversification: { typeCap, tierCap, target: TARGET, demoted: final.filter((r) => r.pipelineTrace?.diversification?.demoted).length },
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("recommend-lenders error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});