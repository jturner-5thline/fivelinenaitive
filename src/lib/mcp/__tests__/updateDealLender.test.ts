import { describe, expect, it, vi } from "vitest";
vi.mock("@lovable.dev/mcp-js", () => ({ defineTool: (t: unknown) => t }));
vi.mock("../supabase", () => ({ supabaseForUser: vi.fn(), requireAuth: () => null, errorResult: vi.fn(), textResult: vi.fn() }));
import { combineNotes, buildUpdates } from "../tools/update-deal-lender";

describe("update_deal_lender notes", () => {
  it("replace overwrites", () => expect(combineNotes("old", "new", "replace")).toBe("new"));
  it("append adds blank line after existing", () => expect(combineNotes("old", "new", "append")).toBe("old\n\nnew"));
  it("prepend adds blank line before existing", () => expect(combineNotes("old", "new", "prepend")).toBe("new\n\nold"));
  it("append to empty is just new text", () => expect(combineNotes(null, "new", "append")).toBe("new"));
  it("null clears", () => expect(combineNotes("old", null, "append")).toBeNull());
});

describe("update_deal_lender fields", () => {
  it("only passed fields change", () => {
    expect(buildUpdates({ notes: "x", stage: "on-deck" }, { mode: "replace", quote_rate: 9.5 } as Parameters<typeof buildUpdates>[1])).toEqual({ quote_rate: 9.5 });
  });
  it("never writes master-directory or timestamp fields", () => {
    const u = buildUpdates({}, { mode: "replace", notes: "n", stage: "passed" } as Parameters<typeof buildUpdates>[1]);
    expect(Object.keys(u).sort()).toEqual(["notes", "stage"]);
  });
  it("rejects notes over 10,000 chars after append", () => {
    expect(() => buildUpdates({ notes: "a".repeat(9_999) }, { mode: "append", notes: "bb" } as Parameters<typeof buildUpdates>[1])).toThrow();
  });
});
