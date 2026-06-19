// deno-lint-ignore-file no-explicit-any
/**
 * Deal Admin Agent · cross-source analysis endpoint.
 *
 * Triggers the executable-action intelligence pass for a workspace
 * (or a single deal). Writes ai_action_queue rows that conform to the
 * executable Approval Queue contract.
 *
 * Body: { company_id?: string, deal_id?: string, deal_ids?: string[],
 *         max_deals?: number, max_queue_rows?: number, min_confidence?: number }
 * If company_id is omitted, the caller's first membership is used.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { runDealAdminAgentAnalysis } from "../_shared/dealAdminAgentIntelligence.ts";
import { AGENT_KEYS, isAgentEnabledForCompany } from "../_shared/agentEntitlement.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization");
  if (!auth) {
    return new Response(JSON.stringify({ ok: false, error: "missing auth" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ ok: false, error: "unauthenticated" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = userData.user.id;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Resolve company_id from caller membership if not provided.
  let companyId: string | null = body?.company_id ?? null;
  if (!companyId) {
    const { data: m } = await admin
      .from("company_members")
      .select("company_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    companyId = (m as any)?.company_id ?? null;
  }
  if (!companyId) {
    return new Response(JSON.stringify({ ok: false, error: "no company context" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Entitlement: Admin Agent must be enabled for this company.
  const enabled = await isAgentEnabledForCompany(admin, companyId, AGENT_KEYS.ADMIN_AGENT);
  if (!enabled) {
    return new Response(JSON.stringify({ ok: false, error: "admin_agent_not_enabled" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Activated user set (server-side enforcement).
  const { data: actRows } = await admin
    .from("admin_agent_user_overrides")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("is_activated", true);
  const activatedUserIds = new Set<string>((actRows ?? []).map((r: any) => r.user_id));
  if (activatedUserIds.size === 0) {
    return new Response(JSON.stringify({ ok: false, error: "no_activated_users" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const dealIds: string[] | undefined =
    body?.deal_id ? [body.deal_id] :
    Array.isArray(body?.deal_ids) && body.deal_ids.length > 0 ? body.deal_ids :
    undefined;

  const result = await runDealAdminAgentAnalysis({
    supabase: admin,
    companyId,
    attributionUserId: activatedUserIds.has(userId) ? userId : Array.from(activatedUserIds)[0],
    activatedUserIds,
    dealIds,
    maxDeals: typeof body?.max_deals === "number" ? body.max_deals : 25,
    maxQueueRows: typeof body?.max_queue_rows === "number" ? body.max_queue_rows : 60,
    minConfidence: typeof body?.min_confidence === "number" ? body.min_confidence : 0.6,
    source: "manual",
  });

  return new Response(
    JSON.stringify({ ok: true, company_id: companyId, ...result }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});