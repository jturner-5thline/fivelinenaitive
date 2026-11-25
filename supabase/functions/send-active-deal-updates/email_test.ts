import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSubject, isBatchReady, RECIPIENTS, describeChange } from "./email.ts";

Deno.test("single deal subject", () => assertEquals(buildSubject(["Acme"]), "Acme Has Been Updated"));
Deno.test("batch subject counts deals", () => assertEquals(buildSubject(["A", "B", "C"]), "3 Deals have been updated"));
Deno.test("batch waits 40 minutes from first update", () => {
  const now = new Date("2026-11-25T12:40:00Z");
  assertEquals(isBatchReady("2026-11-25T12:00:01Z", now), false);
  assertEquals(isBatchReady("2026-11-25T12:00:00Z", now), true);
  assertEquals(isBatchReady(null, now), false);
});
Deno.test("recipients are exactly the three requested", () =>
  assertEquals(RECIPIENTS, ["jturner@5thline.co", "jmoffitt@5thline.co", "swilliams@5thline.co"]));
Deno.test("describes stage change with labels", () =>
  assertEquals(describeChange("stage", { from: "a", to: "b" }, (id) => `L-${id}`, "Acme"), "Acme moved into L-b"));
Deno.test("describes status change naturally", () =>
  assertEquals(describeChange("status", { from: "x", to: "on-hold" }, (id) => id ?? "", "Acme"), "Acme status was updated to On Hold"));
