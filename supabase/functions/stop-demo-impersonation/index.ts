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
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  sessionId?: string;
  reason?: string;
  // Admin landing after returning. Defaults to Demo Users & Metrics.
  returnTo?: string;
  // Browser origin to use when minting the auth callback link.
  returnOrigin?: string;
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

function cleanOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const allowed =
      parsed.protocol === "https:" &&
      (host.endsWith(".lovable.app") ||
        host.endsWith(".lovableproject.com") ||
        host === "fivelinenaitive.lovable.app" ||
        host === "naitive.co" ||
        host === "www.naitive.co");
    return allowed ? parsed.origin : null;
  } catch {
    return null;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ ok: false, error: "No authorization header", code: "missing_authorization" }, 401);
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData?.user) {
      return json({ ok: false, error: "Unauthorized", code: "invalid_demo_session" }, 401);
    }
    const impersonated = authData.user;
    const body = (await req.json().catch(() => ({}))) as Body;
    const ip = req.headers.get("x-forwarded-for") ?? null;

    // Find the session for THIS demo user. If the client supplies a session id,
    // make the restore idempotent: an already-ended row can still mint the
    // return link until expiry, avoiding dead-ends after retries or diagnostics.
    const now = new Date().toISOString();
    const query = body.sessionId
      ? admin
          .from("admin_impersonation_sessions")
          .select("*")
          .eq("id", body.sessionId)
          .eq("target_demo_user_id", impersonated.id)
          .gt("expires_at", now)
          .limit(1)
      : admin
          .from("admin_impersonation_sessions")
          .select("*")
          .eq("target_demo_user_id", impersonated.id)
          .is("ended_at", null)
          .gt("expires_at", now)
          .order("started_at", { ascending: false })
          .limit(1);
    const { data: rows, error: sessionLookupError } = await query;
    const session = rows?.[0];

    if (sessionLookupError || !session) {
      await admin.from("admin_audit_logs").insert({
        admin_user_id: impersonated.id,
        action_type: "impersonation_failed_stop",
        target_type: "demo_user",
        target_id: impersonated.id,
        target_name: impersonated.email ?? null,
        details: { reason: "no_active_session" },
        ip_address: ip,
      });
      return json({
        ok: false,
        error: sessionLookupError?.message ?? "No active impersonation session",
        code: "no_active_session",
      }, 404);
    }

    // End the demo session row first so failures below still close it. This is
    // safe to retry because already-ended rows still restore by session id.
    if (!session.ended_at) {
      await admin
        .from("admin_impersonation_sessions")
        .update({ ended_at: now, ended_reason: body.reason ?? "return_to_admin" })
        .eq("id", session.id);
    }

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

    const { data: sourceAdmin, error: sourceAdminErr } = await admin.auth.admin.getUserById(session.source_admin_user_id);
    const sourceAdminEmail = sourceAdmin?.user?.email ?? session.source_admin_email ?? null;
    if (sourceAdminErr || !sourceAdmin?.user || !sourceAdminEmail) {
      return json({
        ok: false,
        error: sourceAdminErr?.message ?? "Original admin account unavailable",
        code: "source_admin_unavailable",
      }, 500);
    }

    const refererOrigin = (() => {
      try { return new URL(req.headers.get("referer") ?? "").origin; } catch { return null; }
    })();
    const origin =
      cleanOrigin(body.returnOrigin ?? null) ||
      cleanOrigin(req.headers.get("origin")) ||
      cleanOrigin(refererOrigin) ||
      "https://fivelinenaitive.lovable.app";
    const returnTo = ALLOWED_RETURNS.has(body.returnTo ?? "")
      ? (body.returnTo as string)
      : "/admin?section=users-permissions&page=demo-metrics";
    const callback = `${origin}/auth/impersonation/callback`
      + `?return=admin&landing=${encodeURIComponent(returnTo)}`
      + `&session_id=${encodeURIComponent(session.id)}`;

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: sourceAdminEmail,
      options: { redirectTo: callback },
    });
    if (linkErr || !link?.properties?.action_link) {
      return json({ ok: false, error: linkErr?.message ?? "Failed to mint return link", code: "return_link_failed" }, 500);
    }

    return json({
      ok: true,
      returnLink: link.properties.action_link,
      returnTo,
      callbackUrl: callback,
      sourceAdminUserId: session.source_admin_user_id,
      sourceAdminEmail,
    }, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[stop-demo-impersonation] fatal", msg);
    return json({ ok: false, error: msg, code: "runtime_error" }, 500);
  }
});