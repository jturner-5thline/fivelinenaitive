import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Pull the helpers we want to test by importing the module side-effect-free.
// The module starts a server, so we can't import it directly in tests without
// triggering serve(). Instead we copy the small pure functions for unit testing.
// (Keeping these mirrored is a deliberate trade-off — the helpers are tiny.)

const ALLOWED_CATEGORIES = [
  "materials", "financials", "agreements", "kpis_metrics", "other", "uncategorized",
] as const;
type Category = (typeof ALLOWED_CATEGORIES)[number];
const ALLOWED_SENSITIVITY = ["low", "medium", "high"] as const;

function parseStrictJson(text: string): any | null {
  if (!text) return null;
  let body = text.trim();
  body = body.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start >= 0 && end > start) body = body.slice(start, end + 1);
  try { return JSON.parse(body); } catch (_) { return null; }
}

function clampCategory(c: any): Category {
  return ALLOWED_CATEGORIES.includes(c) ? c : "uncategorized";
}
function clampSensitivity(s: any): "low" | "medium" | "high" {
  return ALLOWED_SENSITIVITY.includes(s) ? s : "medium";
}

function postProcess(parsed: any) {
  const confidenceRaw = Number(parsed?.confidence);
  const confidence = isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0;
  let category = clampCategory(parsed?.category);
  const sensitivity = clampSensitivity(parsed?.sensitivity);
  const flags: string[] = Array.isArray(parsed?.flags)
    ? parsed.flags.map(String).filter(Boolean) : [];
  if (confidence < 0.75) {
    category = "uncategorized";
    if (!flags.includes("needs_review")) flags.push("needs_review");
  } else if (confidence < 0.9) {
    if (!flags.includes("needs_confirmation")) flags.push("needs_confirmation");
  }
  let externalShare = parsed?.external_share_recommended === true;
  if (sensitivity === "high") externalShare = false;
  return { category, confidence, sensitivity, flags, externalShare };
}

Deno.test("parseStrictJson — plain JSON", () => {
  const r = parseStrictJson('{"category":"financials","confidence":0.92}');
  assertEquals(r.category, "financials");
  assertEquals(r.confidence, 0.92);
});

Deno.test("parseStrictJson — fenced JSON", () => {
  const r = parseStrictJson('```json\n{"category":"materials"}\n```');
  assertEquals(r.category, "materials");
});

Deno.test("parseStrictJson — JSON wrapped in prose", () => {
  const r = parseStrictJson('Sure! Here you go:\n{"category":"agreements","confidence":0.81}\nThanks.');
  assertEquals(r.category, "agreements");
});

Deno.test("parseStrictJson — invalid returns null", () => {
  assertEquals(parseStrictJson("not json"), null);
});

Deno.test("postProcess — low confidence forces uncategorized + needs_review", () => {
  const r = postProcess({ category: "financials", confidence: 0.5, sensitivity: "low" });
  assertEquals(r.category, "uncategorized");
  assertEquals(r.flags.includes("needs_review"), true);
});

Deno.test("postProcess — medium confidence flags needs_confirmation", () => {
  const r = postProcess({ category: "financials", confidence: 0.8, sensitivity: "low" });
  assertEquals(r.category, "financials");
  assertEquals(r.flags.includes("needs_confirmation"), true);
});

Deno.test("postProcess — high sensitivity forces external_share = false", () => {
  const r = postProcess({
    category: "financials", confidence: 0.95,
    sensitivity: "high", external_share_recommended: true,
  });
  assertEquals(r.externalShare, false);
});

Deno.test("postProcess — clamps confidence > 1", () => {
  const r = postProcess({ category: "financials", confidence: 5, sensitivity: "low" });
  assertEquals(r.confidence, 1);
});

Deno.test("postProcess — invalid category falls back to uncategorized", () => {
  const r = postProcess({ category: "🤷", confidence: 0.95, sensitivity: "low" });
  assertEquals(r.category, "uncategorized");
});