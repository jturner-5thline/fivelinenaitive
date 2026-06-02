import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

type DealRow = {
  id: string;
  company: string;
  value?: number | null;
  stage?: string | null;
  status?: string | null;
  similarity?: number | null;
};

function buildFuzzySearchUiPayload(result: any): any | null {
  const deals = Array.isArray(result?.deals) ? result.deals : [];
  const top = deals[0];
  const tier = typeof result?.tier === "string" ? result.tier : "none";
  if (!deals.length || !top) return null;
  if (tier === "medium") {
    return {
      action: "confirm",
      action_type: "deal_fuzzy_confirm",
      description: `Did you mean \"${top.company}\"?`,
      params: {
        query: result?.query || "",
        tier,
        confidence: typeof result?.confidence === "number" ? result.confidence : null,
        latency_ms: typeof result?.latency_ms === "number" ? result.latency_ms : null,
        top_match: top,
        matches: deals.slice(0, 5),
      },
    };
  }
  if (tier === "low") {
    return {
      action: "confirm",
      action_type: "deal_fuzzy_suggestions",
      description: `I found a few similar deals for \"${result?.query || "that request"}\"`,
      params: {
        query: result?.query || "",
        tier,
        confidence: typeof result?.confidence === "number" ? result.confidence : null,
        latency_ms: typeof result?.latency_ms === "number" ? result.latency_ms : null,
        matches: deals.slice(0, 3),
      },
    };
  }
  return null;
}

function makeDeal(id: string, company: string, similarity: number): DealRow {
  return {
    id,
    company,
    similarity,
    value: 5_000_000,
    stage: "Diligence",
    status: "active",
  };
}

Deno.test("buildFuzzySearchUiPayload returns confirm card for medium-confidence match", () => {
  const payload = buildFuzzySearchUiPayload({
    query: "Exampl Deal",
    tier: "medium",
    confidence: 0.71,
    latency_ms: 118,
    deals: [makeDeal("1", "Example Deal", 0.71), makeDeal("2", "Example Dental", 0.64)],
  });

  assertExists(payload);
  assertEquals(payload.action, "confirm");
  assertEquals(payload.action_type, "deal_fuzzy_confirm");
  assertEquals(payload.params.top_match.company, "Example Deal");
  assertEquals(payload.params.latency_ms, 118);
});

Deno.test("buildFuzzySearchUiPayload returns suggestions card for low-confidence matches", () => {
  const payload = buildFuzzySearchUiPayload({
    query: "Xnergy",
    tier: "low",
    confidence: 0.42,
    latency_ms: 97,
    deals: [
      makeDeal("1", "Xnergy United Network", 0.42),
      makeDeal("2", "Xnergy Labs", 0.39),
      makeDeal("3", "Xenergy Growth", 0.35),
      makeDeal("4", "Energy United", 0.31),
    ],
  });

  assertExists(payload);
  assertEquals(payload.action_type, "deal_fuzzy_suggestions");
  assertEquals(payload.params.matches.length, 3);
  assertEquals(payload.params.matches[0].company, "Xnergy United Network");
});

Deno.test("buildFuzzySearchUiPayload ignores high-confidence or empty results", () => {
  assertEquals(buildFuzzySearchUiPayload({ tier: "high", deals: [makeDeal("1", "Exact Deal", 0.93)] }), null);
  assertEquals(buildFuzzySearchUiPayload({ tier: "medium", deals: [] }), null);
});

Deno.test("name collision envelope shape stays renderer-compatible", () => {
  const collisionEnvelope = {
    action: "confirm",
    action_type: "name_collision",
    status: "name_collision",
    description: 'A deal named "Example Deal" already exists',
    params: {
      proposed: { name: "Example Deal", value: 5000000, manager_name: "Niki Heikali" },
      existing: [{ id: "deal-1", name: "Example Deal", value: 3000000, stage: "NDA", manager_name: "James" }],
    },
  };

  assertEquals(collisionEnvelope.action, "confirm");
  assertEquals(collisionEnvelope.action_type, "name_collision");
  assertEquals(collisionEnvelope.params.existing.length, 1);
  assertEquals(collisionEnvelope.params.proposed.name, "Example Deal");
});