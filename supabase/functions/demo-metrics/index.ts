// Admin-only operational check: lists every demo tenant with its expected
// vs actual seeded counts, surfacing any gaps. Powers the "Demo Metrics"
// admin view. Read-only — performs no writes.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { validateDemoSeed, DEMO_TARGETS, SEED_VERSION } from "../_shared/provisionDemoWorkspace.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const { data: roleRow } = await admin
      .from("user_roles").select("role")
      .eq("user_id", authData.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "Admin access required" }, 403);

    const { data: demoCompanies } = await admin
      .from("companies")
      .select("id, name, is_demo, seeded_at, seed_version, created_at")
      .eq("is_demo", true)
      .order("created_at", { ascending: false });

    const tenants = await Promise.all(
      (demoCompanies ?? []).map(async (c) => {
        const v = await validateDemoSeed(admin, c.id as string);
        // Pull demo users in this tenant. We resolve emails via auth.admin
        // because profiles may not carry the canonical login email.
        const { data: members } = await admin
          .from("company_members")
          .select("user_id, role, created_at")
          .eq("company_id", c.id);
        const memberRows = await Promise.all(
          (members ?? []).map(async (m) => {
            try {
              const { data: u } = await admin.auth.admin.getUserById(m.user_id as string);
              const { data: p } = await admin
                .from("profiles").select("full_name, is_demo_user")
                .eq("user_id", m.user_id as string).maybeSingle();
              return {
                userId: m.user_id as string,
                email: u?.user?.email ?? null,
                fullName: (p as any)?.full_name ?? (u?.user?.user_metadata as any)?.full_name ?? null,
                role: m.role,
                addedAt: m.created_at,
                lastSignInAt: u?.user?.last_sign_in_at ?? null,
                isDemoUser: (p as any)?.is_demo_user ?? false,
              };
            } catch (err) {
              console.error("[demo-metrics] member fetch failed", m.user_id, err);
              return {
                userId: m.user_id as string,
                email: null,
                fullName: null,
                role: m.role,
                addedAt: m.created_at,
                lastSignInAt: null,
                isDemoUser: false,
              };
            }
          }),
        );
        return {
          companyId: c.id, name: c.name,
          seededAt: c.seeded_at, seedVersion: c.seed_version,
          expectedSeedVersion: SEED_VERSION,
          ok: v.ok,
          counts: v.counts, targets: v.targets, missing: v.missing,
          pipelineId: v.pipelineId,
          members: memberRows,
        };
      }),
    );

    return json({
      success: true,
      seedVersion: SEED_VERSION,
      targets: DEMO_TARGETS,
      tenants,
      summary: {
        total: tenants.length,
        healthy: tenants.filter((t) => t.ok).length,
        unhealthy: tenants.filter((t) => !t.ok).length,
      },
    }, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[demo-metrics] fatal", msg);
    return json({ error: msg }, 500);
  }
});

function json(p: unknown, s: number) {
  return new Response(JSON.stringify(p), { status: s, headers: { "Content-Type": "application/json", ...corsHeaders } });
}