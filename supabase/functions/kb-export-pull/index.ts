// kb-export-pull — read-only, machine-to-machine export for ONE fixed tenant.
// Auth: x-export-key header only, compared via SHA-256 digests + node:crypto timingSafeEqual.
// The tenant is hardcoded inside the database RPCs; callers cannot change it.
// Cursor timestamps are passed through as strings (never via JS Date) so
// PostgreSQL microsecond precision is preserved.
// NOTE: scan_upper_bound only limits row timestamps. It is NOT a shared
// database snapshot and does not prove later-committing transactions are excluded.
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHash, timingSafeEqual } from "node:crypto";

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const TABLES = new Set([
  "companies", "deals", "crm_companies", "contacts", "master_lenders", "deal_lenders",
  "deal_space_notes", "deal_status_notes", "lender_notes", "tasks", "claap_meetings",
  "activity_logs", "deal_activity",
]);
const TENANT_KEYS = new Set(["company_id", "org_company_id", "tenant_id", "tenant", "workspace_id"]);
const ALLOWED: Record<string, Set<string>> = {
  page: new Set(["mode", "table", "limit", "cursor_ts", "cursor_id", "scan_upper_bound"]),
  inventory: new Set(["mode", "table", "limit", "cursor_id"]),
  verify: new Set(["mode", "table", "candidate_ids"]),
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// ISO-8601 UTC with up to 6 fractional digits (what the RPC emits).
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const MAX_LIMIT = 1000;
const MAX_CANDIDATES = 1000;
const MAX_BODY_BYTES = 64 * 1024;

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
const bad = (error: string) => reply(400, { error });

function digest(v: string): Buffer {
  return createHash("sha256").update(v, "utf8").digest();
}

function authorized(req: Request): boolean {
  const expected = Deno.env.get("KB_EXPORT_PULL_KEY");
  if (!expected || expected.length < 32) return false; // fail closed
  const supplied = req.headers.get("x-export-key");
  if (!supplied) return false;
  return timingSafeEqual(digest(supplied), digest(expected));
}

function validTs(v: unknown): v is string {
  if (typeof v !== "string" || !TS_RE.test(v)) return false;
  // Structural sanity check only; the original string is what we forward.
  return !Number.isNaN(Date.parse(v.replace(/(\.\d{3})\d+Z$/, "$1Z")));
}

function validLimit(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_LIMIT;
}

Deno.serve(async (req) => {
  // 1) Authenticate before anything else (no CORS: browsers are not callers).
  if (!authorized(req)) return reply(401, { error: "Unauthorized" });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });

  // 2) Parse and validate.
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return reply(413, { error: "Body too large" });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return bad("Invalid JSON body"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return bad("Body must be a JSON object");
  const b = body as Record<string, unknown>;

  for (const k of Object.keys(b)) {
    if (TENANT_KEYS.has(k)) return bad("Tenant override parameters are not allowed");
  }
  const mode = b.mode;
  if (typeof mode !== "string" || !(mode in ALLOWED)) return bad("mode must be one of: page, inventory, verify");
  for (const k of Object.keys(b)) {
    if (!ALLOWED[mode].has(k)) return bad(`Unknown field: ${k}`);
  }
  if (typeof b.table !== "string" || !TABLES.has(b.table)) return bad("Unsupported table");

  let rpc: string;
  let args: Record<string, unknown>;

  if (mode === "page") {
    if (!validLimit(b.limit)) return bad(`limit must be an integer between 1 and ${MAX_LIMIT}`);
    const hasTs = b.cursor_ts !== undefined && b.cursor_ts !== null;
    const hasId = b.cursor_id !== undefined && b.cursor_id !== null;
    if (hasTs !== hasId) return bad("cursor_ts and cursor_id must be supplied together");
    if (hasTs && !validTs(b.cursor_ts)) return bad("Invalid cursor_ts");
    if (hasId && (typeof b.cursor_id !== "string" || !UUID_RE.test(b.cursor_id))) return bad("Invalid cursor_id");
    const hasUb = b.scan_upper_bound !== undefined && b.scan_upper_bound !== null;
    if (hasUb && !validTs(b.scan_upper_bound)) return bad("Invalid scan_upper_bound");
    if (hasTs && !hasUb) return bad("scan_upper_bound is required when a cursor is supplied");
    rpc = "fn_kb_export_table_page";
    args = {
      p_table: b.table, p_limit: b.limit,
      p_cursor_ts: hasTs ? b.cursor_ts : null, p_cursor_id: hasId ? b.cursor_id : null,
      p_scan_upper_bound: hasUb ? b.scan_upper_bound : null,
    };
  } else if (mode === "inventory") {
    if (!validLimit(b.limit)) return bad(`limit must be an integer between 1 and ${MAX_LIMIT}`);
    const hasId = b.cursor_id !== undefined && b.cursor_id !== null;
    if (hasId && (typeof b.cursor_id !== "string" || !UUID_RE.test(b.cursor_id))) return bad("Invalid cursor_id");
    rpc = "fn_kb_export_id_inventory_page";
    args = { p_table: b.table, p_limit: b.limit, p_cursor_id: hasId ? b.cursor_id : null };
  } else {
    const ids = b.candidate_ids;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_CANDIDATES) {
      return bad(`candidate_ids must be an array of 1-${MAX_CANDIDATES} UUIDs`);
    }
    if (!ids.every((i) => typeof i === "string" && UUID_RE.test(i))) return bad("candidate_ids contains an invalid UUID");
    rpc = "fn_kb_export_verify_active_ids";
    args = { p_table: b.table, p_candidate_ids: ids };
  }

  // 3) Call the read-only RPC.
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return reply(500, { error: "Server misconfigured" });
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data, error } = await db.rpc(rpc, args);
  if (error) {
    // Log only codes/messages from our own validation, never record contents.
    console.error("kb-export-pull rpc error", { mode, table: b.table, code: error.code });
    if (error.code === "22023" || error.code === "22007" || error.code === "22008" || error.code === "22P02") {
      return bad(error.message || "Invalid parameters");
    }
    return reply(500, { error: "Export failed" });
  }
  return reply(200, { mode, ...(data as Record<string, unknown>) });
});
