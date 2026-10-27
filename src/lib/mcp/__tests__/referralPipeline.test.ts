import { describe, it, expect } from "vitest";
import { classifyReferralPipeline, computeTier, type TierRules } from "../referralPipeline";

const rules: TierRules = {
  tier1_qualified_deals: 3, tier1_trailing_months: 3, tier1_signed_clients: 2,
  tier2_qualified_deals_min: 1, tier2_qualified_deals_max: 2, tier2_trailing_months: 3,
  tier2_deals_on_board: 2, tier3_deals_per_quarter: 1, qualified_deal_stages: ["lenders-in-review"],
};
const now = new Date("2026-10-23T00:00:00Z");
const base = { allDeals: [], manualSources: [], contacts: [], companyNames: new Map<string, string>(), rules, now };

describe("classifyReferralPipeline", () => {
  it("puts a manually added source with no deals in Nurturing", () => {
    const out = classifyReferralPipeline({ ...base, pipelineDeals: [], manualSources: [{ id: "m1", name: "Jane Doe", email: "j@x.com", company: "X", contact_id: null, created_at: "2026-09-01T00:00:00Z" }] });
    expect(out.map((s) => s.stage)).toEqual(["Nurturing"]);
    expect(out[0].stage_entered_at).toBe("2026-09-01T00:00:00Z");
  });

  it("drops a manual source added 6+ months ago with no deals", () => {
    const out = classifyReferralPipeline({ ...base, pipelineDeals: [], manualSources: [{ id: "m1", name: "Old Source", email: "o@x.com", company: null, contact_id: null, created_at: "2026-03-01T00:00:00Z" }] });
    expect(out).toHaveLength(0);
  });

  it("classifies a linked referrer with one qualified recent deal as Tier 2", () => {
    const deal = { id: "d1", company: "Acme", stage: "lenders-in-review", referred_by: "Bob Smith", referred_by_contact_id: "c1", referred_by_crm_company_id: null, created_at: "2026-10-01T00:00:00Z" };
    const out = classifyReferralPipeline({
      ...base,
      pipelineDeals: [deal],
      allDeals: [{ stage: deal.stage, referred_by: "Bob Smith", sourced_via: null, closing_date: null, created_at: deal.created_at, nda_entered_at: deal.created_at }],
      contacts: [{ id: "c1", full_name: "Bob Smith", crm_company_id: null }],
    });
    expect(out[0].stage).toBe("Tier 2");
    expect(out[0].contact_id).toBe("c1");
  });

  it("does not count a referred deal that never entered NDA / Needs List Sent", () => {
    const deal = { id: "d1", company: "Acme", stage: "lead", referred_by: "Bob Smith", referred_by_contact_id: "c1", referred_by_crm_company_id: null, created_at: "2026-10-01T00:00:00Z", nda_entered_at: null };
    const out = classifyReferralPipeline({
      ...base,
      pipelineDeals: [deal],
      allDeals: [{ stage: "lead", referred_by: "Bob Smith", sourced_via: null, closing_date: null, created_at: deal.created_at, nda_entered_at: null }],
      contacts: [{ id: "c1", full_name: "Bob Smith", crm_company_id: null }],
    });
    expect(out[0].stage).toBe("Nurturing");
  });

  it("measures trailing windows from the NDA entry date, not created_at", () => {
    const tierDeal = (nda: string) => ({ stage: "ndaneeds-list-sent", referred_by: "Bob Smith", sourced_via: null, closing_date: null, created_at: "2024-01-01T00:00:00Z", nda_entered_at: nda });
    // Two deals imported long ago but entering NDA last month meet "2 deals on board in 3 months" -> Tier 2.
    expect(computeTier("Bob Smith", [tierDeal("2026-09-20T00:00:00Z"), tierDeal("2026-10-01T00:00:00Z")], rules, now.getTime()).tier).toBe(2);
    // Same deals entering NDA a year ago fall outside the window -> Tier 3.
    expect(computeTier("Bob Smith", [tierDeal("2025-11-01T00:00:00Z"), tierDeal("2025-11-02T00:00:00Z")], rules, now.getTime()).tier).toBe(3);
  });
});
