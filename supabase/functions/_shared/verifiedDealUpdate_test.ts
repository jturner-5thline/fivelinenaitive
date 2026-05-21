import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  verifiedDealUpdate,
  WriteNotPersistedError,
} from "./verifiedDealUpdate.ts";

// Minimal fake SupabaseClient that replays a canned row from `.maybeSingle()`.
// We don't need a real network — we just need the chained query builder
// shape that `verifiedDealUpdate` uses.
function makeFakeClient(opts: {
  returnRow?: Record<string, unknown> | null;
  error?: { message: string } | null;
  onUpdate?: (patch: Record<string, unknown>) => void;
}): any {
  return {
    from() {
      return {
        update(patch: Record<string, unknown>) {
          opts.onUpdate?.(patch);
          return {
            eq() {
              return {
                select() {
                  return {
                    async maybeSingle() {
                      return {
                        data: opts.returnRow ?? null,
                        error: opts.error ?? null,
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

Deno.test("happy path: returned row equals patch", async () => {
  const client = makeFakeClient({
    returnRow: { id: "d1", manager: "Scott Williams", estimated_hours: 150 },
  });
  const row = await verifiedDealUpdate(client, "d1", {
    manager: "Scott Williams",
    estimated_hours: 150,
  });
  assertEquals(row.manager, "Scott Williams");
});

Deno.test("mismatch on one field throws structured error", async () => {
  const client = makeFakeClient({
    returnRow: { id: "d1", manager: "James Turner" },
  });
  const err = await assertRejects(
    () => verifiedDealUpdate(client, "d1", { manager: "Scott Williams" }),
    WriteNotPersistedError,
  );
  assertEquals(err.mismatches.length, 1);
  assertEquals(err.mismatches[0].field, "manager");
  assertEquals(err.mismatches[0].expected, "Scott Williams");
  assertEquals(err.mismatches[0].actual, "James Turner");
});

Deno.test("multiple mismatches collected into one error", async () => {
  const client = makeFakeClient({
    returnRow: { id: "d1", manager: "James", estimated_hours: 100, stage: "lir" },
  });
  const err = await assertRejects(
    () =>
      verifiedDealUpdate(client, "d1", {
        manager: "Scott",
        estimated_hours: 150,
        stage: "proposal-issued",
      }),
    WriteNotPersistedError,
  );
  assertEquals(err.mismatches.length, 3);
});

Deno.test("date-only fields normalize to YYYY-MM-DD", async () => {
  const client = makeFakeClient({
    returnRow: { id: "d1", closing_date: "2026-08-15" },
  });
  // Caller passes a full ISO timestamp; trigger stores date-only.
  const row = await verifiedDealUpdate(client, "d1", {
    closing_date: "2026-08-15T00:00:00.000Z",
  });
  assertEquals(row.closing_date, "2026-08-15");
});

Deno.test("numeric tolerance within 1e-6", async () => {
  const client = makeFakeClient({
    returnRow: { id: "d1", value: 10000000.0000001 },
  });
  await verifiedDealUpdate(client, "d1", { value: 10000000 });
});

Deno.test("string trim normalization", async () => {
  const client = makeFakeClient({
    returnRow: { id: "d1", manager: "Scott Williams" },
  });
  await verifiedDealUpdate(client, "d1", { manager: "  Scott Williams  " });
});

Deno.test("null row (RLS denied / not found) throws __row__ mismatch", async () => {
  const client = makeFakeClient({ returnRow: null });
  const err = await assertRejects(
    () => verifiedDealUpdate(client, "missing", { manager: "Scott" }),
    WriteNotPersistedError,
  );
  assertEquals(err.mismatches[0].field, "__row__");
});

Deno.test("postgrest error becomes WriteNotPersistedError", async () => {
  const client = makeFakeClient({
    error: { message: "new row violates row-level security policy" },
  });
  await assertRejects(
    () => verifiedDealUpdate(client, "d1", { manager: "x" }),
    WriteNotPersistedError,
  );
});

Deno.test("skipVerifyFields excludes a column from comparison", async () => {
  const client = makeFakeClient({
    returnRow: { id: "d1", stage: "approved", manager: "Scott" },
  });
  // stage came back different but we asked to skip verifying it.
  await verifiedDealUpdate(
    client,
    "d1",
    { stage: "draft", manager: "Scott" },
    { skipVerifyFields: ["stage"] },
  );
});

Deno.test("auto-skipped updated_at never produces a false mismatch", async () => {
  const client = makeFakeClient({
    returnRow: { id: "d1", updated_at: "2026-05-22T01:00:00Z", manager: "Scott" },
  });
  // We send an updated_at that the trigger overwrites — must not flag.
  await verifiedDealUpdate(client, "d1", {
    updated_at: "2026-05-21T12:00:00Z",
    manager: "Scott",
  });
});

Deno.test("toUserMessage phrases single mismatch as ask-bar copy", () => {
  const err = new WriteNotPersistedError("d1", [
    { field: "manager", expected: "Scott Williams", actual: "James Turner" },
  ]);
  assertEquals(
    err.toUserMessage(),
    `I tried to set manager to "Scott Williams" but the database still has "James Turner".`,
  );
});
