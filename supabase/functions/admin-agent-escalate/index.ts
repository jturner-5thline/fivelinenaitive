// deno-lint-ignore-file no-explicit-any
/**
 * Admin Agent · 4-business-day escalation pass.
 *
 * Finds pending Approval Queue items originated by `deal_admin_agent`
 * that have sat untouched for > 4 US business days. For each one we
 * insert a single `escalate` Approval Queue row assigned to the company
 * admin and stamp `payload.escalated_at` on the original so it isn't
 * re-escalated on the next run.
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

    const { error: insErr } = await supabase.from("ai_action_queue").insert({
      user_id: adminId,
      assigned_to: adminId,
      deal_id: row.deal_id,
      deal_name: row.deal_name,
      action_type: "escalate",
      title: `Escalation: ${row.title}`,
      description:
        `This Admin Agent proposal has been pending for more than ${ESCALATION_BD} business days without approval or rejection.\n\nOriginal rationale: ${row.rationale ?? row.description ?? "—"}`,
      priority: "urgent",
      risk_level: "high",
      target_object_type: "deal",
      target_object_id: row.deal_id,
      old_values: {},
      new_values: { escalate_to: adminId, source_queue_id: row.id },
      evidence: [{ kind: "approval_queue_item", ref_id: row.id, label: row.title }],
      rationale: `Auto-escalated after ${ESCALATION_BD} business days of inactivity.`,
      payload: {
        source_queue_id: row.id,
        escalated_from: row.assigned_to ?? row.user_id,
        on_approve_execution_type: "create_task",
      },
      source: {
        origin: "deal_admin_agent",
        trigger: "escalation",
        company_id: companyId,
        source_queue_id: row.id,
      },
    });
    if (insErr) {
      errors.push(`row ${row.id}: ${insErr.message}`);
      continue;
    }

    await supabase
      .from("ai_action_queue")
      .update({
        payload: { ...(row.payload ?? {}), escalated_at: now.toISOString() },
      })
      .eq("id", row.id);
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