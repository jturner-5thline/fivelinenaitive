// Reverses an active demo-user impersonation.
//
// Caller is the impersonated demo user session. We look up the active row
// in admin_impersonation_sessions for this user, validate it is not
// expired/ended, mark it ended, audit the stop, and mint a fresh magic
// link for the original source admin so they can re-establish their own
// session via /auth/impersonation/callback. The browser is expected to
// open that link to land back in the admin's authenticated session.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  sessionId?: string;
  reason?: string;
  // Admin landing after returning. Defaults to Demo Users & Metrics.
  returnTo?: string;
}

const ALLOWED_RETURNS = new Set([
  "/admin?section=users-permissions&page=demo-metrics",
  "/admin",
  "/pipeline",
  "/deals",
]);

function json(p: unknown, s: number) {
  return new Response(JSON.stringify(p), {
    status: s, headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No authorization header" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData?.user) return json({ error: "Unauthorized" }, 401);
    const impersonated = authData.user;
    const body = (await req.json().catch(() => ({}))) as Body;
    const ip = req.headers.get("x-forwarded-for") ?? null;

    // Find the active session for THIS user (target). Optionally filtered
    // by sessionId for an extra integrity check.
    let query = admin
      .from("admin_impersonation_sessions")
      .select("*")
      .eq("target_demo_user_id", impersonated.id)
      .is("ended_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("started_at", { ascending: false })
      .limit(1);
    if (body.sessionId) query = query.eq("id", body.sessionId);
    const { data: rows } = await query;
    const session = rows?.[0];

    if (!session) {
      await admin.from("admin_audit_logs").insert({
        admin_user_id: impersonated.id,
        action_type: "impersonation_failed_stop",
        target_type: "demo_user",
        target_id: impersonated.id,
        target_name: impersonated.email ?? null,
        details: { reason: "no_active_session" },
        ip_address: ip,
      });
      return json({ error: "No active impersonation session", code: "no_active_session" }, 404);
    }

    // End the session row first so failures below still close it.
    await admin
      .from("admin_impersonation_sessions")
      .update({ ended_at: new Date().toISOString(), ended_reason: body.reason ?? "return_to_admin" })
      .eq("id", session.id);

    // Audit stop ----------------------------------------------------------
    await admin.from("admin_audit_logs").insert({
      admin_user_id: session.source_admin_user_id,
      action_type: "impersonation_stop",
      target_type: "demo_user",
      target_id: impersonated.id,
      target_name: impersonated.email ?? null,
      details: {
        sessionId: session.id,
        reason: body.reason ?? "return_to_admin",
        durationMs: Date.now() - new Date(session.started_at).getTime(),
      },
      ip_address: ip,
    });

    if (!session.source_admin_email) {
      return json({ ok: true, returnLink: null, note: "Admin email unavailable; sign in manually." }, 200);
    }

    const origin =
      req.headers.get("origin") ||
      (req.headers.get("referer") ?? "").replace(/\/$/, "");
    const returnTo = ALLOWED_RETURNS.has(body.returnTo ?? "")
      ? (body.returnTo as string)
      : "/admin?section=users-permissions&page=demo-metrics";
    const callback = `${origin}/auth/impersonation/callback`
      + `?return=admin&landing=${encodeURIComponent(returnTo)}`
      + `&session_id=${encodeURIComponent(session.id)}`;

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: session.source_admin_email,
      options: { redirectTo: callback },
    });
    if (linkErr || !link?.properties?.action_link) {
      return json({ error: linkErr?.message ?? "Failed to mint return link" }, 500);
    }

    return json({
      ok: true,
      returnLink: link.properties.action_link,
      returnTo,
      sourceAdminEmail: session.source_admin_email,
    }, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[stop-demo-impersonation] fatal", msg);
    return json({ error: msg }, 500);
  }
});