import { expect, it } from "vitest";
import { textResult, toJsonValue } from "../supabase";

it("maps nested structured results into JSON without changing valid data", () => {
  expect(textResult({}, { row: { name: "Item", ids: ["a"], empty: null } }).structuredContent).toEqual({ row: { name: "Item", ids: ["a"], empty: null } });
});
it("converts dates and rejects non-JSON numeric/undefined values safely", () => {
  expect(toJsonValue({ date: new Date("2026-11-06T00:00:00Z"), omitted: undefined, values: [NaN, undefined, true] })).toEqual({ date: "2026-11-06T00:00:00.000Z", values: [null, null, true] });
});