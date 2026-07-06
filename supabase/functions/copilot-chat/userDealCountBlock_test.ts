import { assert, assertEquals, assertMatch, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildUserDealCountBlock,
  formatDealList,
  type DealRow,
} from "./userDealCountBlock.ts";

// Regression guard for the "how many deals does <name> manage/own"
// pipeline. The Copilot must NEVER emit an authoritative reply that
// discloses only the active count when closed deals also exist —
// otherwise users see a misleading "manages 0 deals" answer even when
// the person owns a portfolio of closed deals.

const closedNiki: DealRow[] = [
  { id: "d1", company: "Acme Robotics", stage: "closed-won" },
  { id: "d2", company: "Globex Health", stage: "closed-lost" },
  { id: "d3", company: "Initech Labs", stage: "on-hold" },
];

Deno.test("zero active + non-zero closed: block still lists every closed deal by name", () => {
  const block = buildUserDealCountBlock("Niki", [], closedNiki);

  // Exact counts appear in the required Active=/Closed= form.
  assertStringIncludes(block, "Active-pipeline stages: 0");
  assertStringIncludes(block, "Closed stages (closed-won, closed-lost, on-hold, archived): 3");
  assertStringIncludes(block, "Total managed: 3");
  assertStringIncludes(block, "Active=0");
  assertStringIncludes(block, "Closed=3");

  // The active-list placeholder is (none) — never omitted.
  assertMatch(block, /Active deal names: \(none\)/);

  // EVERY closed deal name is present with an entity link.
  for (const d of closedNiki) {
    assertStringIncludes(block, `[${d.company}](entity://deal/${d.id})`);
  }
  // Closed list is not the "(none)" placeholder.
  assert(!/Closed deal names: \(none\)/.test(block), "closed list must not be (none) when closed deals exist");

  // Rule requiring the closed breakdown is present verbatim.
  assertStringIncludes(
    block,
    "ALWAYS include the closed-stage breakdown with deal names — even when the active count is 0",
  );
  // Active-pipeline filter disclosure is present.
  assertStringIncludes(block, `disclose the filter ("counting only active-pipeline stages")`);
});

Deno.test("zero active + non-zero closed: rendered stage suffix is preserved for every closed deal", () => {
  const block = buildUserDealCountBlock("Niki", [], closedNiki);
  assertStringIncludes(block, "[Acme Robotics](entity://deal/d1) — closed-won");
  assertStringIncludes(block, "[Globex Health](entity://deal/d2) — closed-lost");
  assertStringIncludes(block, "[Initech Labs](entity://deal/d3) — on-hold");
});

Deno.test("zero active + one closed: singular case still surfaces the closed deal, never hides it", () => {
  const block = buildUserDealCountBlock("James Turner", [], [
    { id: "d9", company: "Sole Closed Co", stage: "closed-won" },
  ]);
  assertStringIncludes(block, "Active-pipeline stages: 0");
  assertStringIncludes(block, "Closed stages (closed-won, closed-lost, on-hold, archived): 1");
  assertStringIncludes(block, "[Sole Closed Co](entity://deal/d9)");
  assertMatch(block, /Active deal names: \(none\)/);
});

Deno.test("zero active + zero closed: block is still authoritative (0/0) — no truthy count leaks", () => {
  const block = buildUserDealCountBlock("Ghost User", [], []);
  assertStringIncludes(block, "Active-pipeline stages: 0");
  assertStringIncludes(block, "Closed stages (closed-won, closed-lost, on-hold, archived): 0");
  assertStringIncludes(block, "Total managed: 0");
  assertMatch(block, /Active deal names: \(none\)/);
  assertMatch(block, /Closed deal names: \(none\)/);
});

Deno.test("non-zero active + non-zero closed: both breakdowns rendered with all names", () => {
  const active: DealRow[] = [
    { id: "a1", company: "Northwind Growth", stage: "term-sheet" },
    { id: "a2", company: "Contoso Capital", stage: "diligence" },
  ];
  const closed: DealRow[] = [
    { id: "c1", company: "Old Deal Co", stage: "closed-lost" },
  ];
  const block = buildUserDealCountBlock("Scott", active, closed);
  assertStringIncludes(block, "Active-pipeline stages: 2");
  assertStringIncludes(block, "Closed stages (closed-won, closed-lost, on-hold, archived): 1");
  assertStringIncludes(block, "Total managed: 3");
  for (const d of [...active, ...closed]) {
    assertStringIncludes(block, `[${d.company}](entity://deal/${d.id})`);
  }
});

Deno.test("formatDealList: empty array yields (none) placeholder — required so the field is never blank", () => {
  assertEquals(formatDealList([]), "(none)");
});

Deno.test("formatDealList: entity links are comma-separated and preserve stage when present", () => {
  const out = formatDealList([
    { id: "x", company: "X Co", stage: "diligence" },
    { id: "y", company: "Y Co", stage: null },
  ]);
  assertEquals(out, "[X Co](entity://deal/x) — diligence, [Y Co](entity://deal/y)");
});

Deno.test("prompt rule text is stable so the LLM cannot silently drop the closed-breakdown requirement", () => {
  // If any of these substrings change, the enforcement rule this test
  // guards has drifted — update both the helper and the copilot-chat
  // system-prompt rule in the same PR.
  const block = buildUserDealCountBlock("Anyone", [], [{ id: "z", company: "Z", stage: "closed-won" }]);
  assertStringIncludes(block, "These are the ONLY correct figures for this question.");
  assertStringIncludes(block, "You MUST state Active=");
  assertStringIncludes(block, `disclose the filter ("counting only active-pipeline stages")`);
  assertStringIncludes(block, "ALWAYS include the closed-stage breakdown with deal names");
  assertStringIncludes(block, "Do NOT emit any other count in the same reply.");
});