import { supabase } from '@/integrations/supabase/client';

/**
 * Profile snapshot used to personalize a single lender's submission email.
 *
 * Sources:
 *  - `master_lenders` for the funding source's stated focus areas (deal types,
 *    deal-size range, industries, sponsorship/refinancing posture, notes).
 *  - `deal_lenders` for prior interaction on THIS deal (last contact date,
 *    notes, current substage, pass reason).
 */
export interface LenderProfileSnapshot {
  lenderName: string;
  // ── Profile (from master_lenders)
  loanTypes: string[] | null;
  industries: string[] | null;
  industriesToAvoid: string[] | null;
  minDeal: number | null;
  maxDeal: number | null;
  minRevenue: number | null;
  ebitdaMin: number | null;
  b2bB2c: string | null;
  geo: string | null;
  sponsorship: string | null;
  refinancing: string | null;
  subDebt: string | null;
  cashBurn: string | null;
  tier: string | null;
  dealStructureNotes: string | null;
  companyRequirements: string | null;
  // ── Prior interaction (from deal_lenders for this deal)
  priorNotes: string | null;
  priorSubstage: string | null;
  priorTrackingStatus: string | null;
  priorPassReason: string | null;
  lastContactAt: string | null;
}

/**
 * Fetch profile + prior-interaction snapshots for the supplied lender names
 * scoped to a single deal. Names are matched case-insensitively against
 * `master_lenders.name`. RLS restricts reads to the caller's workspace.
 *
 * Lenders that don't resolve (e.g. ad-hoc "Lender" placeholders) are simply
 * omitted; the caller falls back to a generic prompt for those.
 */
export async function fetchLenderProfilesForDeal(
  dealId: string,
  lenderNames: string[],
): Promise<Map<string, LenderProfileSnapshot>> {
  const out = new Map<string, LenderProfileSnapshot>();
  const cleaned = Array.from(new Set(lenderNames.map((n) => n.trim()).filter(Boolean)));
  if (cleaned.length === 0) return out;

  // ── 1) Pull master_lenders profile rows.
  let masterRows: any[] = [];
  try {
    const { data, error } = await supabase
      .from('master_lenders')
      .select(
        'id, name, loan_types, industries, industries_to_avoid, min_deal, max_deal, min_revenue, ebitda_min, b2b_b2c, geo, sponsorship, refinancing, sub_debt, cash_burn, tier, deal_structure_notes, company_requirements',
      )
      .in('name', cleaned);
    if (error) throw error;
    masterRows = data || [];

    // Case-insensitive fallback for any names that didn't exact-match.
    const matchedLower = new Set(masterRows.map((r) => String(r.name || '').toLowerCase()));
    const unmatched = cleaned.filter((n) => !matchedLower.has(n.toLowerCase()));
    if (unmatched.length > 0) {
      const ilikeResults = await Promise.all(
        unmatched.map((n) =>
          supabase
            .from('master_lenders')
            .select(
              'id, name, loan_types, industries, industries_to_avoid, min_deal, max_deal, min_revenue, ebitda_min, b2b_b2c, geo, sponsorship, refinancing, sub_debt, cash_burn, tier, deal_structure_notes, company_requirements',
            )
            .ilike('name', n)
            .limit(1)
            .maybeSingle(),
        ),
      );
      for (const r of ilikeResults) {
        if (r.data) masterRows.push(r.data);
      }
    }
  } catch (err) {
    console.warn('[lenderPersonalization] master_lenders lookup failed:', err);
  }

  // ── 2) Pull deal_lenders rows for this deal so we can attach prior interaction.
  let dealLenderRows: any[] = [];
  try {
    const { data, error } = await supabase
      .from('deal_lenders')
      .select('name, notes, substage, tracking_status, pass_reason, last_contact_at')
      .eq('deal_id', dealId)
      .in('name', cleaned);
    if (error) throw error;
    dealLenderRows = data || [];
  } catch (err) {
    console.warn('[lenderPersonalization] deal_lenders lookup failed:', err);
  }

  // ── 3) Merge by lowercased name. The lender's display name from
  //    master_lenders is the canonical key we hand back to the prompt.
  const dealByName = new Map<string, any>();
  for (const r of dealLenderRows) {
    if (r?.name) dealByName.set(String(r.name).toLowerCase(), r);
  }

  for (const m of masterRows) {
    const key = String(m.name || '').toLowerCase();
    if (!key) continue;
    const dl = dealByName.get(key);
    out.set(key, {
      lenderName: m.name,
      loanTypes: m.loan_types ?? null,
      industries: m.industries ?? null,
      industriesToAvoid: m.industries_to_avoid ?? null,
      minDeal: m.min_deal ?? null,
      maxDeal: m.max_deal ?? null,
      minRevenue: m.min_revenue ?? null,
      ebitdaMin: m.ebitda_min ?? null,
      b2bB2c: m.b2b_b2c ?? null,
      geo: m.geo ?? null,
      sponsorship: m.sponsorship ?? null,
      refinancing: m.refinancing ?? null,
      subDebt: m.sub_debt ?? null,
      cashBurn: m.cash_burn ?? null,
      tier: m.tier ?? null,
      dealStructureNotes: m.deal_structure_notes ?? null,
      companyRequirements: m.company_requirements ?? null,
      priorNotes: dl?.notes ?? null,
      priorSubstage: dl?.substage ?? null,
      priorTrackingStatus: dl?.tracking_status ?? null,
      priorPassReason: dl?.pass_reason ?? null,
      lastContactAt: dl?.last_contact_at ?? null,
    });
  }

  return out;
}

/** Compact USD formatter used inside the prompt blocks. */
function fmtMoney(n: number | null): string | null {
  if (n == null || isNaN(n)) return null;
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}MM`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

/**
 * Render a single lender's profile as a compact prompt block. Returns null
 * when no useful profile data is available, so the caller can decide whether
 * to include the funding source in the personalized prompt or fall back to generic
 * copy.
 */
export function renderLenderProfileBlock(p: LenderProfileSnapshot): string {
  const lines: string[] = [`### ${p.lenderName}`];
  const facts: string[] = [];

  if (p.loanTypes?.length) facts.push(`- Deal types: ${p.loanTypes.join(', ')}`);
  const lo = fmtMoney(p.minDeal);
  const hi = fmtMoney(p.maxDeal);
  if (lo && hi) facts.push(`- Deal size range: ${lo}–${hi}`);
  else if (lo) facts.push(`- Min deal size: ${lo}`);
  else if (hi) facts.push(`- Max deal size: ${hi}`);
  if (p.minRevenue != null) {
    const r = fmtMoney(p.minRevenue);
    if (r) facts.push(`- Min revenue: ${r}`);
  }
  if (p.ebitdaMin != null) {
    const e = fmtMoney(p.ebitdaMin);
    if (e) facts.push(`- Min EBITDA: ${e}`);
  }
  if (p.industries?.length) facts.push(`- Industry focus: ${p.industries.join(', ')}`);
  if (p.industriesToAvoid?.length) facts.push(`- Avoids: ${p.industriesToAvoid.join(', ')}`);
  if (p.b2bB2c) facts.push(`- B2B/B2C: ${p.b2bB2c}`);
  if (p.geo) facts.push(`- Geo: ${p.geo}`);
  if (p.sponsorship) facts.push(`- Sponsorship: ${p.sponsorship}`);
  if (p.refinancing) facts.push(`- Refinancing: ${p.refinancing}`);
  if (p.subDebt) facts.push(`- Sub debt: ${p.subDebt}`);
  if (p.cashBurn) facts.push(`- Cash burn appetite: ${p.cashBurn}`);
  if (p.tier) facts.push(`- Tier: ${p.tier}`);
  if (p.dealStructureNotes) facts.push(`- Deal structure notes: ${p.dealStructureNotes}`);
  if (p.companyRequirements) facts.push(`- Company requirements: ${p.companyRequirements}`);

  if (facts.length) {
    lines.push('Profile:');
    lines.push(...facts);
  }

  // Prior interaction on THIS deal — used for tone (warm follow-up vs. fresh intro).
  const interaction: string[] = [];
  if (p.lastContactAt) {
    interaction.push(`- Last contact on this deal: ${new Date(p.lastContactAt).toISOString().slice(0, 10)}`);
  }
  if (p.priorSubstage) interaction.push(`- Current status on this deal: ${p.priorSubstage}`);
  else if (p.priorTrackingStatus) interaction.push(`- Current status on this deal: ${p.priorTrackingStatus}`);
  if (p.priorPassReason) interaction.push(`- Pass reason: ${p.priorPassReason}`);
  if (p.priorNotes) interaction.push(`- Notes: ${p.priorNotes}`);
  if (interaction.length) {
    lines.push('Prior interaction on this deal:');
    lines.push(...interaction);
  }

  // If we couldn't surface anything useful, return empty so caller can skip.
  if (facts.length === 0 && interaction.length === 0) return '';
  return lines.join('\n');
}