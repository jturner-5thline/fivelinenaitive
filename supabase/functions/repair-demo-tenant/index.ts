import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { provisionDemoWorkspace } from "../_shared/provisionDemoWorkspace.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  companyId?: string;
  userEmail?: string;
  renameTo?: string;
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
    let companyId = body.companyId ?? null;
    let demoUserId: string | null = null;

    // Resolve by user email if companyId not supplied.
    if (!companyId && body.userEmail) {
      const email = body.userEmail.toLowerCase().trim();
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const u = list?.users?.find((x) => x.email?.toLowerCase() === email);
      if (!u) return json({ error: `No auth user for ${email}` }, 404);
      demoUserId = u.id;
      const { data: memberships } = await admin
        .from("company_members")
        .select("company_id, companies!inner(id, is_demo, created_at)")
        .eq("user_id", u.id);
      const demoMembership = (memberships ?? []).find((m) => {
        const c = (m as { companies?: { is_demo?: boolean } }).companies;
        return c?.is_demo === true;
      });
      companyId = demoMembership?.company_id ?? memberships?.[0]?.company_id ?? null;
      if (!companyId) return json({ error: `User ${email} has no company` }, 404);
    }

    if (!companyId) return json({ error: "companyId or userEmail required" }, 400);

    // Resolve a member to attribute seed rows to.
    if (!demoUserId) {
      const { data: members } = await admin
        .from("company_members")
        .select("user_id, role")
        .eq("company_id", companyId)
        .order("role", { ascending: true });
      demoUserId = members?.[0]?.user_id as string | undefined ?? null;
    }
    if (!demoUserId) return json({ error: "No members on this company" }, 400);

    // Optional rename (the canonical provisioner handles all demo flags).
    if (body.renameTo?.trim()) {
      await admin.from("companies").update({ name: body.renameTo.trim() }).eq("id", companyId);
    }

    const { data: companyMembers } = await admin
      .from("company_members").select("user_id").eq("company_id", companyId);
    const memberIds = (companyMembers ?? []).map((m) => m.user_id as string);

    // Single canonical provisioning service. Same code path as create.
    try {
      const seeded = await provisionDemoWorkspace(admin, {
        companyId,
        attributingUserId: demoUserId,
        memberUserIds: memberIds.length ? memberIds : [demoUserId],
      });

      const hasWarnings =
        (seeded.warnings && seeded.warnings.length > 0) ||
        Object.keys(seeded.missing).length > 0;

      return json({
        status: hasWarnings ? "warning" : "ok",
        message: hasWarnings
          ? "Demo workspace repaired with nonblocking warnings."
          : "Demo workspace repaired successfully.",
        repaired: true,
        canOpenWorkspace: true,
        companyId,
        attributedUserId: demoUserId,
        memberIds,
        renamed: !!body.renameTo,
        createdCounts: seeded.insertedThisRun,
        missingCounts: seeded.missing,
        warnings: seeded.warnings ?? [],
        seeded,
      }, 200);
    } catch (provErr) {
      const e = provErr as Error & { fatalMissing?: Record<string, number>; warnings?: string[] };
      console.error("[repair-demo-tenant] fatal provisioning gap", e.message, {
        fatalMissing: e.fatalMissing,
        warnings: e.warnings,
      });
      return json({
        status: "fatal",
        message: e.message,
        repaired: false,
        canOpenWorkspace: false,
        companyId,
        attributedUserId: demoUserId,
        memberIds,
        missingCounts: e.fatalMissing ?? {},
        warnings: e.warnings ?? [],
      }, 200);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[repair-demo-tenant] fatal", msg);
    return json({
      status: "fatal",
      message: msg,
      repaired: false,
      canOpenWorkspace: false,
      error: msg,
    }, 500);
  }
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}