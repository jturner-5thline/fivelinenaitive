// Admin-only secure handoff to "open as" a demo user.
//
// Flow:
//  1. Caller (admin) hits this function with { targetUserId | targetEmail }.
//  2. We verify the caller is an admin AND the target user is a non-admin
//     member of a demo company.
//  3. We INSERT a row in `admin_impersonation_sessions` with a fresh nonce
//     and a short TTL — this is the canonical record of impersonation,
//     not a browser-side cookie.
//  4. We mint a single-use Supabase magic link for the target user via the
//     service-role admin client, redirecting to
//     `/auth/impersonation/callback?session_id=<id>&nonce=<nonce>`.
//  5. Return { actionLink, sessionId } to the caller. The browser opens
//     the link, Supabase establishes the demo user's real session, and
//     the callback validates the session row before landing in `/deals`.
//
// The service-role admin client and the user-scoped client are kept
// strictly separate — see https://github.com/supabase/supabase-js/discussions
// guidance on never mixing the two.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  targetUserId?: string;
  targetEmail?: string;
  reason?: string;
  sourceSurface?: string;
  // Where to land after the magic link verifies. Must be an internal path.
  landingPath?: string;
}

const ALLOWED_LANDINGS = new Set([
  "/deals", "/pipeline", "/tasks", "/dashboard",
]);

function json(p: unknown, s: number) {
  return new Response(JSON.stringify(p), {
    status: s, headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function randomNonce() {
  return crypto.randomUUID().replace(/-/g, "");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const ip = req.headers.get("x-forwarded-for") ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;

  async function auditFailure(adminId: string | null, reason: string, target: Record<string, unknown>) {
    try {
      await admin.from("admin_audit_logs").insert({
        admin_user_id: adminId ?? "00000000-0000-0000-0000-000000000000",
        action_type: "impersonation_failed_start",
        target_type: "demo_user",
        target_id: (target.userId as string) ?? null,
        target_name: (target.email as string) ?? null,
        details: { reason, ...target },
        ip_address: ip,
      });
    } catch { /* ignore */ }
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No authorization header" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData?.user) return json({ error: "Unauthorized" }, 401);
    const caller = authData.user;

    const { data: roleRow } = await admin
      .from("user_roles").select("role")
      .eq("user_id", caller.id).eq("role", "admin").maybeSingle();
    if (!roleRow) {
      await auditFailure(caller.id, "not_admin", {});
      return json({ error: "Admin access required" }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as Body;

    // Resolve target ----------------------------------------------------
    let targetUser: { id: string; email: string | null } | null = null;
    if (body.targetUserId) {
      const { data: u } = await admin.auth.admin.getUserById(body.targetUserId);
      if (!u?.user) { await auditFailure(caller.id, "target_not_found", { userId: body.targetUserId }); return json({ error: "Target user not found", code: "target_not_found" }, 404); }
      targetUser = { id: u.user.id, email: u.user.email ?? null };
    } else if (body.targetEmail) {
      const email = body.targetEmail.toLowerCase().trim();
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const u = list?.users?.find((x) => x.email?.toLowerCase() === email);
      if (!u) { await auditFailure(caller.id, "target_not_found", { email }); return json({ error: `No auth user for ${email}`, code: "target_not_found" }, 404); }
      targetUser = { id: u.id, email: u.email ?? null };
    } else {
      return json({ error: "targetUserId or targetEmail required" }, 400);
    }

    // Guardrail: never impersonate another admin --------------------------
    const { data: targetIsAdmin } = await admin
      .from("user_roles").select("role")
      .eq("user_id", targetUser.id).eq("role", "admin").maybeSingle();
    if (targetIsAdmin) {
      await auditFailure(caller.id, "target_is_admin", { userId: targetUser.id, email: targetUser.email });
      return json({ error: "Cannot impersonate another admin", code: "target_is_admin" }, 403);
    }

    // Guardrail: target must belong to a demo workspace -------------------
    const { data: memberships } = await admin
      .from("company_members")
      .select("company_id, companies!inner(id, name, is_demo, seeded_at, seed_version)")
      .eq("user_id", targetUser.id);
    const demoMembership = (memberships ?? []).find(
      (m: any) => m.companies?.is_demo === true,
    );
    if (!demoMembership) {
      await auditFailure(caller.id, "target_not_demo", { userId: targetUser.id, email: targetUser.email });
      return json({ error: "Target user is not a member of any demo workspace", code: "target_not_demo" }, 403);
    }
    if (!targetUser.email) {
      await auditFailure(caller.id, "target_no_email", { userId: targetUser.id });
      return json({ error: "Target user has no email", code: "target_no_email" }, 400);
    }
    const demoCompany = (demoMembership as any).companies;
    const seedHealthy = !!demoCompany?.seeded_at && !!demoCompany?.seed_version;

    // Persist canonical impersonation state -------------------------------
    const nonce = randomNonce();
    const { data: session, error: sessionErr } = await admin
      .from("admin_impersonation_sessions")
      .insert({
        source_admin_user_id: caller.id,
        source_admin_email: caller.email ?? null,
        target_demo_user_id: targetUser.id,
        target_demo_email: targetUser.email,
        target_demo_company_id: (demoMembership as any).company_id,
        target_demo_company_name: demoCompany?.name ?? null,
        source_surface: body.sourceSurface ?? "admin/demo-metrics",
        nonce,
        ip_address: ip,
        user_agent: userAgent,
      })
      .select("id, expires_at").single();
    if (sessionErr || !session) {
      await auditFailure(caller.id, "session_insert_failed", { error: sessionErr?.message });
      return json({ error: "Could not persist impersonation session" }, 500);
    }

    // Mint magic link → callback ------------------------------------------
    const origin =
      req.headers.get("origin") ||
      (req.headers.get("referer") ?? "").replace(/\/$/, "");
    const landing = ALLOWED_LANDINGS.has(body.landingPath ?? "")
      ? (body.landingPath as string) : "/deals";
    const callback = `${origin}/auth/impersonation/callback`
      + `?session_id=${encodeURIComponent(session.id)}`
      + `&nonce=${encodeURIComponent(nonce)}`
      + `&landing=${encodeURIComponent(landing)}`;

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: targetUser.email,
      options: { redirectTo: callback },
    });
    if (linkErr || !link?.properties?.action_link) {
      await auditFailure(caller.id, "generate_link_failed", { error: linkErr?.message });
      return json({ error: linkErr?.message ?? "Failed to mint magic link" }, 500);
    }

    // Audit successful start ----------------------------------------------
    await admin.from("admin_audit_logs").insert({
      admin_user_id: caller.id,
      action_type: "impersonation_start",
      target_type: "demo_user",
      target_id: targetUser.id,
      target_name: targetUser.email,
      details: {
        sessionId: session.id,
        demoCompanyId: (demoMembership as any).company_id,
        demoCompanyName: demoCompany?.name ?? null,
        reason: body.reason ?? null,
        source: body.sourceSurface ?? "admin/demo-metrics",
        adminEmail: caller.email ?? null,
      },
      ip_address: ip,
    });

    return json({
      ok: true,
      sessionId: session.id,
      expiresAt: session.expires_at,
      actionLink: link.properties.action_link,
      callbackUrl: callback,
      target: {
        id: targetUser.id,
        email: targetUser.email,
        demoCompanyId: (demoMembership as any).company_id,
        demoCompanyName: demoCompany?.name ?? null,
        seedHealthy,
      },
    }, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[start-demo-impersonation] fatal", msg);
    return json({ error: msg }, 500);
  }
});