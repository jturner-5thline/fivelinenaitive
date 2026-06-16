// Open Standard Demo Workspace — admin-only, single-click entry into the
// canonical demo tenant. No targetUserId/targetEmail from the browser:
// the server resolves the canonical workspace + dedicated standard-demo
// auth identity itself.
//
// Resolution order for the standard demo company:
//   1. platform_settings.value where key = 'standard_demo_company_id'
//   2. companies.is_standard_demo = true (if column exists)
//   3. STANDARD_DEMO_COMPANY_ID hardcoded fallback (canonical 5th Line demo)
//
// Auth identity: STANDARD_DEMO_EMAIL (demo@5thline.co). Auto-provisioned
// as a confirmed auth user + company_member if missing.
//
// Handoff: mints a single-use Supabase magic link via
// `auth.admin.generateLink` and redirects to the existing
// `/auth/impersonation/callback`, which finalises the session. A row in
// `admin_impersonation_sessions` carries the source-admin info so
// `stop-demo-impersonation` can re-mint the admin's session for the
// Return-to-Admin banner.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STANDARD_DEMO_COMPANY_ID = "6114fade-e101-4dfa-9159-9870135832df";
const STANDARD_DEMO_EMAIL = "demo@5thline.co";
const STANDARD_DEMO_PASSWORD = "Demo2024!"; // confirmed-only seed, never exposed

const ALLOWED_LANDINGS = new Set(["/deals", "/pipeline", "/tasks", "/dashboard"]);

interface Body {
  openInNewTab?: boolean;
  landingPath?: string;
  repairIfNeeded?: boolean;
  resetWorkspace?: boolean;
}

function json(p: unknown, s: number) {
  return new Response(JSON.stringify(p), {
    status: s,
    headers: { "Content-Type": "application/json", ...corsHeaders },
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

  async function audit(adminId: string, action: string, details: Record<string, unknown>) {
    try {
      await admin.from("admin_audit_logs").insert({
        admin_user_id: adminId,
        action_type: action,
        target_type: "standard_demo_workspace",
        target_id: details.companyId ?? null,
        target_name: STANDARD_DEMO_EMAIL,
        details,
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

    // Admin gate
    const { data: roleRow } = await admin
      .from("user_roles").select("role")
      .eq("user_id", caller.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "Admin access required" }, 403);

    const body = (await req.json().catch(() => ({}))) as Body;

    // 1. Resolve canonical standard demo company ----------------------
    let companyId: string | null = null;
    let companyName: string | null = null;
    try {
      const { data: setting } = await admin
        .from("platform_settings")
        .select("value")
        .eq("key", "standard_demo_company_id")
        .maybeSingle();
      const v = (setting as { value?: unknown } | null)?.value;
      if (typeof v === "string") companyId = v;
      else if (v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string") {
        companyId = (v as { id: string }).id;
      }
    } catch { /* table/column optional */ }
    if (!companyId) companyId = STANDARD_DEMO_COMPANY_ID;

    const { data: company } = await admin
      .from("companies").select("id, name").eq("id", companyId).maybeSingle();
    if (!company) {
      return json({ error: "Standard demo workspace not found", code: "no_standard_demo" }, 404);
    }
    companyName = company.name ?? "Standard Demo";

    // 2. Resolve / provision standard-demo auth identity --------------
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    let demoUser = list?.users?.find((u) => u.email?.toLowerCase() === STANDARD_DEMO_EMAIL);
    if (!demoUser) {
      const created = await admin.auth.admin.createUser({
        email: STANDARD_DEMO_EMAIL,
        password: STANDARD_DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { is_standard_demo: true, full_name: "Standard Demo" },
      });
      if (created.error || !created.data?.user) {
        return json({ error: created.error?.message ?? "Could not provision standard demo identity" }, 500);
      }
      demoUser = created.data.user;
    }

    // Guardrail: never let an admin role attach to the standard demo user.
    const { data: demoIsAdmin } = await admin
      .from("user_roles").select("role")
      .eq("user_id", demoUser.id).eq("role", "admin").maybeSingle();
    if (demoIsAdmin) {
      return json({ error: "Standard demo identity has admin role — refuse to handoff", code: "demo_is_admin" }, 409);
    }

    // Ensure membership in the standard demo company.
    const { data: membership } = await admin
      .from("company_members")
      .select("company_id")
      .eq("user_id", demoUser.id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!membership) {
      await admin.from("company_members").insert({
        user_id: demoUser.id,
        company_id: companyId,
        role: "member",
      });
    }

    // 3. Optional repair / reset --------------------------------------
    let repairResult: unknown = null;
    if (body.repairIfNeeded || body.resetWorkspace) {
      try {
        const r = await admin.functions.invoke("repair-demo-tenant", {
          body: { companyId, userEmail: STANDARD_DEMO_EMAIL },
        });
        repairResult = r.data ?? r.error?.message ?? null;
        await audit(caller.id, body.resetWorkspace ? "reset_standard_demo" : "repair_standard_demo", {
          companyId, repairResult,
        });
      } catch (e) {
        repairResult = e instanceof Error ? e.message : String(e);
      }
    }

    // 4. Persist canonical handoff state ------------------------------
    const nonce = randomNonce();
    const { data: session, error: sessionErr } = await admin
      .from("admin_impersonation_sessions")
      .insert({
        source_admin_user_id: caller.id,
        source_admin_email: caller.email ?? null,
        target_demo_user_id: demoUser.id,
        target_demo_email: STANDARD_DEMO_EMAIL,
        target_demo_company_id: companyId,
        target_demo_company_name: companyName,
        source_surface: "admin/standard-demo",
        nonce,
        ip_address: ip,
        user_agent: userAgent,
      })
      .select("id, expires_at").single();
    if (sessionErr || !session) {
      return json({ error: "Could not persist standard-demo session" }, 500);
    }

    // 5. Mint magic link → existing impersonation callback ------------
    const origin =
      req.headers.get("origin") ||
      (req.headers.get("referer") ?? "").replace(/\/$/, "");
    const landing = ALLOWED_LANDINGS.has(body.landingPath ?? "")
      ? (body.landingPath as string) : "/deals";
    const callback = `${origin}/auth/impersonation/callback`
      + `?session_id=${encodeURIComponent(session.id)}`
      + `&nonce=${encodeURIComponent(nonce)}`
      + `&landing=${encodeURIComponent(landing)}`
      + `&standard_demo=1`;

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: STANDARD_DEMO_EMAIL,
      options: { redirectTo: callback },
    });
    if (linkErr || !link?.properties?.action_link) {
      return json({ error: linkErr?.message ?? "Failed to mint magic link" }, 500);
    }

    await audit(caller.id, "open_standard_demo", {
      companyId,
      companyName,
      sessionId: session.id,
      landing,
      openInNewTab: !!body.openInNewTab,
    });

    return json({
      ok: true,
      sessionId: session.id,
      expiresAt: session.expires_at,
      actionLink: link.properties.action_link,
      callbackUrl: callback,
      workspace: { id: companyId, name: companyName, email: STANDARD_DEMO_EMAIL },
      repairResult,
    }, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[open-standard-demo-workspace] fatal", msg);
    return json({ error: msg }, 500);
  }
});