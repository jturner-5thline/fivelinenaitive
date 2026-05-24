import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { REGISTRY_BY_KEY } from "./registry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface ApplyBody {
  // Hook contract (shipped): { undo, diff_id, tool_name, proposed_value, source_prompt }
  undo?: boolean;
  mode?: "apply" | "undo"; // server-side callers can use this; UI uses `undo`.
  diff_id: string;
  tool_name: string;
  company_id?: string;     // optional from UI; resolved from dry_run row when missing.
  proposed_value?: unknown;
  source_prompt?: string;
}

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function applyRateLimitHit(adminSb: ReturnType<typeof createClient>, companyId: string): Promise<boolean> {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await adminSb
    .from("settings_audit_log")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("action", "apply")
    .gte("created_at", since);
  return (count ?? 0) >= 10;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const userSb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminSb = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: userData, error: userErr } = await userSb.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
  const userId = userData.user.id;

  let body: ApplyBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (!body?.diff_id || !body?.tool_name) {
    return json({ error: "missing fields" }, 400);
  }
  const mode: "apply" | "undo" = body.mode ?? (body.undo ? "undo" : "apply");

  const tool = REGISTRY_BY_KEY[body.tool_name];
  if (!tool) return json({ error: "unknown tool" }, 400);

  // Resolve company_id from the original dry-run row when the client didn't send one.
  let company_id = body.company_id;
  if (!company_id) {
    const { data: dryRow } = await adminSb
      .from("settings_audit_log")
      .select("company_id")
      .eq("diff_id", body.diff_id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    company_id = (dryRow as any)?.company_id ?? undefined;
  }
  if (!company_id) return json({ error: "company_id could not be resolved" }, 400);

  // Server admin re-check.
  const { data: isAdmin } = await adminSb.rpc("is_company_admin", {
    _user_id: userId,
    _company_id: company_id,
  });
  if (!isAdmin) {
    await adminSb.from("settings_audit_log").insert({
      company_id, actor_user_id: userId, tool_key: tool.key,
      diff_id: body.diff_id, action: "deny", reason: "not_admin",
    });
    return json({ error: "admin required" }, 403);
  }

  if (mode === "apply") {
    // Rate limit.
    if (await applyRateLimitHit(adminSb, company_id)) {
      await adminSb.from("settings_audit_log").insert({
        company_id, actor_user_id: userId, tool_key: tool.key,
        diff_id: body.diff_id, action: "deny", reason: "rate_limited",
      });
      return json({ error: "rate_limited" }, 429);
    }
    // Validate value.
    const validation = tool.validator(body.proposed_value);
    if (!validation.ok) {
      await adminSb.from("settings_audit_log").insert({
        company_id, actor_user_id: userId, tool_key: tool.key,
        diff_id: body.diff_id, action: "deny", reason: `invalid_value:${validation.error}`,
      });
      return json({ error: `invalid value: ${validation.error}` }, 400);
    }
    try {
      const result = await tool.apply_mutation(
        { sb: userSb, company_id, user_id: userId },
        validation.value,
      );
      const undo_token = crypto.randomUUID();
      await adminSb.from("settings_audit_log").insert({
        company_id,
        actor_user_id: userId,
        tool_key: tool.key,
        target_table: tool.target_table,
        target_column: tool.target_column,
        diff_id: body.diff_id,
        old_value: { value: result.old },
        new_value: { value: result.new },
        action: "apply",
        source_prompt: body.source_prompt ?? null,
        undo_token,
        applied_at: new Date().toISOString(),
      });
      return json({ ok: true, undo_token, old: result.old, new: result.new });
    } catch (e) {
      await adminSb.from("settings_audit_log").insert({
        company_id, actor_user_id: userId, tool_key: tool.key,
        diff_id: body.diff_id, action: "deny", reason: `apply_failed:${(e as Error).message}`,
      });
      return json({ error: (e as Error).message }, 500);
    }
  }

  if (mode === "undo") {
    // Find the most recent apply for this diff_id.
    const { data: applyRow } = await adminSb
      .from("settings_audit_log")
      .select("id, old_value, applied_at")
      .eq("diff_id", body.diff_id)
      .eq("action", "apply")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!applyRow) return json({ error: "no apply to undo" }, 404);
    const appliedAt = applyRow.applied_at ? new Date(applyRow.applied_at as string).getTime() : 0;
    if (Date.now() - appliedAt > 30_000) {
      await adminSb.from("settings_audit_log").insert({
        company_id, actor_user_id: userId, tool_key: tool.key,
        diff_id: body.diff_id, action: "deny", reason: "undo_expired",
      });
      return json({ error: "undo window expired" }, 410);
    }
    const oldVal = (applyRow.old_value as any)?.value ?? null;
    try {
      const result = await tool.apply_mutation(
        { sb: userSb, company_id, user_id: userId },
        oldVal,
      );
      await adminSb.from("settings_audit_log").insert({
        company_id,
        actor_user_id: userId,
        tool_key: tool.key,
        target_table: tool.target_table,
        target_column: tool.target_column,
        diff_id: body.diff_id,
        old_value: { value: result.old },
        new_value: { value: result.new },
        action: "undo",
      });
      return json({ ok: true, reverted_to: oldVal });
    } catch (e) {
      return json({ error: (e as Error).message }, 500);
    }
  }

  return json({ error: "invalid mode" }, 400);
});