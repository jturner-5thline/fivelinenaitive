// Admin-only impersonation handoff for demo users.
//
// action=start  -> validates the caller is an admin and the target user
//                  belongs to a demo company (companies.is_demo = true),
//                  generates a single-use magic-link, audits the event,
//                  and returns { actionLink, auditId, target }.
// action=stop   -> records that an impersonation session was ended.
//
// Service-role privileges never leave this function. The client only ever
// receives a short-lived sign-in URL for the validated demo user.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  action?: "start" | "stop";
  targetUserId?: string;
  targetEmail?: string;
  redirectTo?: string;
  reason?: string;
  auditId?: string;
}

function json(p: unknown, s: number) {
  return new Response(JSON.stringify(p), {
    status: s,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No authorization header" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData?.user) return json({ error: "Unauthorized" }, 401);
    const caller = authData.user;

    const { data: roleRow } = await admin
      .from("user_roles").select("role")
      .eq("user_id", caller.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "Admin access required" }, 403);

    const body = (await req.json().catch(() => ({}))) as Body;
    const action = body.action ?? "start";
    const ip = req.headers.get("x-forwarded-for") ?? null;

    if (action === "stop") {
      await admin.from("admin_audit_logs").insert({
        admin_user_id: caller.id,
        action_type: "impersonation_stop",
        target_type: "demo_user",
        target_id: body.targetUserId ?? null,
        target_name: body.targetEmail ?? null,
        details: { reason: body.reason ?? null, auditId: body.auditId ?? null },
        ip_address: ip,
      });
      return json({ ok: true }, 200);
    }

    // ---- start ----
    let targetUser: { id: string; email: string | null } | null = null;
    if (body.targetUserId) {
      const { data: u } = await admin.auth.admin.getUserById(body.targetUserId);
      if (!u?.user) return json({ error: "Target user not found" }, 404);
      targetUser = { id: u.user.id, email: u.user.email ?? null };
    } else if (body.targetEmail) {
      const email = body.targetEmail.toLowerCase().trim();
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const u = list?.users?.find((x) => x.email?.toLowerCase() === email);
      if (!u) return json({ error: `No auth user for ${email}` }, 404);
      targetUser = { id: u.id, email: u.email ?? null };
    } else {
      return json({ error: "targetUserId or targetEmail required" }, 400);
    }

    // Guardrail #1 — never allow impersonating another admin.
    const { data: targetIsAdmin } = await admin
      .from("user_roles").select("role")
      .eq("user_id", targetUser.id).eq("role", "admin").maybeSingle();
    if (targetIsAdmin) return json({ error: "Cannot impersonate another admin" }, 403);

    // Guardrail #2 — target must belong to at least one demo company.
    const { data: memberships } = await admin
      .from("company_members")
      .select("company_id, companies!inner(id, name, is_demo)")
      .eq("user_id", targetUser.id);
    const demoMembership = (memberships ?? []).find(
      (m: any) => m.companies?.is_demo === true,
    );
    if (!demoMembership) {
      return json({ error: "Target user is not a member of any demo workspace" }, 403);
    }

    if (!targetUser.email) return json({ error: "Target user has no email" }, 400);

    // Audit START first so we have an id to thread through the magic link.
    const { data: audit, error: auditErr } = await admin
      .from("admin_audit_logs")
      .insert({
        admin_user_id: caller.id,
        action_type: "impersonation_start",
        target_type: "demo_user",
        target_id: targetUser.id,
        target_name: targetUser.email,
        details: {
          reason: body.reason ?? "admin_demo_workspace_open",
          demoCompanyId: (demoMembership as any).company_id,
          demoCompanyName: (demoMembership as any).companies?.name ?? null,
          adminEmail: caller.email ?? null,
          source: "admin/demo-metrics",
        },
        ip_address: ip,
      })
      .select("id").single();
    if (auditErr) console.warn("[impersonate] audit insert failed", auditErr.message);

    const origin =
      req.headers.get("origin") ||
      req.headers.get("referer")?.replace(/\/$/, "") ||
      "";
    const fallbackRedirect = `${origin || ""}/pipeline`;
    const baseRedirect = body.redirectTo || fallbackRedirect;
    const hash = `#impersonating=1` +
      `&admin_id=${encodeURIComponent(caller.id)}` +
      `&admin_email=${encodeURIComponent(caller.email ?? "")}` +
      `&target_id=${encodeURIComponent(targetUser.id)}` +
      `&target_email=${encodeURIComponent(targetUser.email)}` +
      `&audit_id=${encodeURIComponent(audit?.id ?? "")}`;
    const redirectWithMarker = baseRedirect + hash;

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: targetUser.email,
      options: { redirectTo: redirectWithMarker },
    });
    if (linkErr || !link?.properties?.action_link) {
      return json({ error: linkErr?.message ?? "Failed to mint magic link" }, 500);
    }

    return json({
      ok: true,
      actionLink: link.properties.action_link,
      redirectTo: redirectWithMarker,
      auditId: audit?.id ?? null,
      target: {
        id: targetUser.id,
        email: targetUser.email,
        demoCompanyId: (demoMembership as any).company_id,
        demoCompanyName: (demoMembership as any).companies?.name ?? null,
      },
    }, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin-impersonate-demo-user] fatal", msg);
    return json({ error: msg }, 500);
  }
});