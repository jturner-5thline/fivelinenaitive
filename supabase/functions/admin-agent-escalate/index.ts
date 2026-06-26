// deno-lint-ignore-file no-explicit-any
/**
 * Admin Agent · 4-business-day escalation pass.
 *
 * Finds pending Approval Queue items originated by `deal_admin_agent`
 * that have sat untouched for > 4 US business days. For each one we
 * UPDATE the existing row in place — bumping priority/risk, reassigning
 * to the company admin, and stamping `payload.escalated_at` so it isn't
 * re-escalated on the next run. We do NOT create a new queue item.
 *
 * Idempotent. Designed to be hit by pg_cron once per business day.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { businessDaysBetween, subtractBusinessDays } from "../_shared/businessDays.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ESCALATION_BD = 4;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = new Date();
  // Window: created earlier than 4 BD ago. Use 4 BD ago at start-of-day as a
  // cheap upper bound for the DB filter; we re-check exact BD in JS.
  const cutoffWall = subtractBusinessDays(now, ESCALATION_BD);
  const { data: stale, error } = await supabase
    .from("ai_action_queue")
    .select("id, deal_id, deal_name, title, description, rationale, action_type, payload, source, created_at, assigned_to, user_id")
    .eq("status", "pending")
    .lt("created_at", cutoffWall.toISOString())
    .limit(500);
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const candidates = (stale ?? []).filter((row: any) => {
    const origin = row.source?.origin ?? null;
    if (origin !== "deal_admin_agent") return false;
    if (row.payload?.escalated_at) return false;
    const bd = businessDaysBetween(new Date(row.created_at), now);
    return bd > ESCALATION_BD;
  });

  // Resolve a company admin per (company_id) just-in-time.
  const adminByCompany = new Map<string, string | null>();
  async function resolveAdmin(companyId: string | null): Promise<string | null> {
    if (!companyId) return null;
    if (adminByCompany.has(companyId)) return adminByCompany.get(companyId)!;
    const { data: members } = await supabase
      .from("company_members")
      .select("user_id")
      .eq("company_id", companyId);
    const memberIds = (members ?? []).map((m: any) => m.user_id);
    if (memberIds.length === 0) {
      adminByCompany.set(companyId, null);
      return null;
    }
    const { data: admins } = await supabase
      .from("user_roles")
      .select("user_id, created_at")
      .eq("role", "admin")
      .in("user_id", memberIds)
      .order("created_at", { ascending: true })
      .limit(1);
    const adminId = (admins?.[0] as any)?.user_id ?? null;
    adminByCompany.set(companyId, adminId);
    return adminId;
  }

  let escalated = 0;
  const errors: string[] = [];
  for (const row of candidates) {
    const companyId = row.source?.company_id ?? null;
    const adminId = await resolveAdmin(companyId);
    if (!adminId) continue;

    const escalationNote = `Auto-escalated after ${ESCALATION_BD} business days of inactivity. Original rationale: ${row.rationale ?? row.description ?? "—"}`;
    const { error: updErr } = await supabase
      .from("ai_action_queue")
      .update({
        assigned_to: adminId,
        priority: "urgent",
        risk_level: "high",
        rationale: escalationNote,
        payload: {
          ...(row.payload ?? {}),
          escalated_at: now.toISOString(),
          escalated_to: adminId,
          escalated_from: row.assigned_to ?? row.user_id,
          original_rationale: row.rationale ?? row.description ?? null,
        },
      })
      .eq("id", row.id)
      .eq("status", "pending");
    if (updErr) {
      errors.push(`row ${row.id}: ${updErr.message}`);
      continue;
    }
    escalated++;
  }

  return new Response(
    JSON.stringify({
      ok: true,
      ran_at: now.toISOString(),
      scanned: stale?.length ?? 0,
      eligible: candidates.length,
      escalated,
      errors: errors.slice(0, 10),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});