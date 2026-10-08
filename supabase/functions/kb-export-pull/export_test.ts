// Read-only tests for kb-export-pull. Prints only counts/status codes, never record contents or keys.
import { assert, assertEquals } from "jsr:@std/assert@1";

const URL_ = `${Deno.env.get("SUPABASE_URL") ?? "https://tgkksvazruzbghssnxde.supabase.co"}/functions/v1/kb-export-pull`;
const KEY = Deno.env.get("KB_EXPORT_PULL_KEY");
const TENANT = "44556c46-9127-4b12-b14e-d6fee784afcf";
const t = (name: string, fn: () => Promise<void>) =>
  Deno.test({ name, ignore: !KEY, sanitizeOps: false, sanitizeResources: false, fn });

async function call(body: unknown, key: string | null = KEY ?? null) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (key) headers["x-export-key"] = key;
  const r = await fetch(URL_, { method: "POST", headers, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j: j as Record<string, any> };
}

Deno.test("key is configured in test env", () => { console.log("key_present:", !!KEY); });

Deno.test({ name: "missing/wrong key rejected", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  assertEquals((await call({ mode: "page", table: "deals", limit: 5 }, null)).status, 401);
  assertEquals((await call({ mode: "page", table: "deals", limit: 5 }, "x".repeat(64))).status, 401);
} });

t("unsupported tables and tenant overrides rejected", async () => {
  for (const table of ["profiles", "calendar_events", "deals; drop", ""]) assertEquals((await call({ mode: "page", table, limit: 5 })).status, 400);
  for (const k of ["company_id", "org_company_id", "tenant_id", "tenant", "workspace_id"])
    assertEquals((await call({ mode: "page", table: "deals", limit: 5, [k]: TENANT })).status, 400);
  assertEquals((await call({ mode: "page", table: "deals", limit: 5, extra: 1 })).status, 400);
  assertEquals((await call({ mode: "nope", table: "deals" })).status, 400);
});

t("invalid cursors and limits rejected", async () => {
  for (const limit of [0, -1, 1.5, "5", 1001, null]) assertEquals((await call({ mode: "page", table: "deals", limit })).status, 400);
  const ub = "2026-01-01T00:00:00.000000Z";
  const bad = [
    { cursor_ts: "2026-01-01", cursor_id: crypto.randomUUID(), scan_upper_bound: ub },
    { cursor_ts: ub, cursor_id: "not-a-uuid", scan_upper_bound: ub },
    { cursor_ts: ub, scan_upper_bound: ub },
    { cursor_id: crypto.randomUUID(), scan_upper_bound: ub },
    { cursor_ts: ub, cursor_id: crypto.randomUUID() },
    { scan_upper_bound: "2999-01-01T00:00:00Z" },
    { cursor_ts: "2026-02-01T00:00:00Z", cursor_id: crypto.randomUUID(), scan_upper_bound: ub },
  ];
  for (const b of bad) assertEquals((await call({ mode: "page", table: "deals", limit: 5, ...b })).status, 400, JSON.stringify(Object.keys(b)));
  assertEquals((await call({ mode: "inventory", table: "deals", limit: 0 })).status, 400);
  assertEquals((await call({ mode: "verify", table: "deals", candidate_ids: [] })).status, 400);
  assertEquals((await call({ mode: "verify", table: "deals", candidate_ids: Array.from({ length: 1001 }, () => crypto.randomUUID()) })).status, 400);
  assertEquals((await call({ mode: "verify", table: "deals", candidate_ids: ["bad"] })).status, 400);
});

for (const table of ["deals", "deal_status_notes", "deal_activity"]) {
  t(`5-record pages advance with fixed upper bound: ${table}`, async () => {
    const p1 = await call({ mode: "page", table, limit: 5 });
    assertEquals(p1.status, 200);
    const ub = p1.j.scan_upper_bound;
    assert(/\.\d{6}Z$/.test(ub), "upper bound keeps microseconds");
    let pages = 1, total = p1.j.count, prev = p1.j, seen = new Set(p1.j.records.map((r: any) => r.id));
    while (prev.has_more && pages < 4) {
      assert(/\.\d{6}Z$/.test(prev.next_cursor.ts), "cursor keeps microseconds");
      const n = await call({ mode: "page", table, limit: 5, cursor_ts: prev.next_cursor.ts, cursor_id: prev.next_cursor.id, scan_upper_bound: ub });
      assertEquals(n.status, 200);
      assertEquals(n.j.scan_upper_bound, ub);
      for (const r of n.j.records) { assert(!seen.has(r.id), "no duplicate across pages"); seen.add(r.id); }
      total += n.j.count; pages++; prev = n.j;
    }
    assert(typeof p1.j.end_of_scan === "boolean");
    if (table === "deals") for (const r of p1.j.records) { assertEquals(r.company_id, TENANT); assert(!("user_id" in r) && !("k_ts" in r)); }
    if (table === "deal_activity") {
      const allowed = new Set(["activity_kind","activity_label","deal_lender_id","deal_owner","lender_name","logged_at","narrative","note","post_signing_hours","pre_signing_hours","stage","status","value"]);
      for (const r of p1.j.records) for (const f of ["before", "after"]) {
        assert(r[f] && typeof r[f] === "object" && !Array.isArray(r[f]));
        for (const [k, v] of Object.entries(r[f])) { assert(allowed.has(k)); assert(v === null || typeof v !== "object"); }
      }
    }
    console.log(`${table}: pages=${pages} records=${total} first_page=${p1.j.count}`);
  });
}

t("inventory paginates and verify enforces tenant", async () => {
  const p1 = await call({ mode: "inventory", table: "deals", limit: 5 });
  assertEquals(p1.status, 200);
  assert(typeof p1.j.end_of_inventory === "boolean");
  if (p1.j.has_more) {
    const p2 = await call({ mode: "inventory", table: "deals", limit: 5, cursor_id: p1.j.next_cursor_id });
    assertEquals(p2.status, 200);
    assert(p2.j.ids.every((id: string) => id > p1.j.next_cursor_id));
  }
  const fake = crypto.randomUUID(); const other = "673c08e7-03df-4d95-9e7e-9e921956a4b4";
  const v = await call({ mode: "verify", table: "deals", candidate_ids: [...p1.j.ids, fake, other] });
  assertEquals(v.status, 200);
  assertEquals(v.j.active_count, p1.j.ids.length);
  assert(!v.j.active_ids.includes(fake) && !v.j.active_ids.includes(other), "out-of-tenant id rejected");
  // Ask for the tenant row via companies inventory: must be exactly one id (the tenant).
  const c = await call({ mode: "inventory", table: "companies", limit: 5 });
  assertEquals(c.j.ids, [TENANT]);
  console.log(`inventory first_page=${p1.j.count} verify_checked=${v.j.checked} active=${v.j.active_count}`);
});
