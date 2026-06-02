import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TenantSpec {
  companyName: string;
  primaryDomain?: string;
  adminEmail: string;
  adminName?: string;
  accountType?: string; // default "Client"
}

interface ProvisionBody {
  tenants?: TenantSpec[];
  // When omitted, defaults to Griffin Moor + Clarence Day for the
  // Asana 1214979538381022 tenant-isolation acceptance items.
}

const DEFAULT_TENANTS: TenantSpec[] = [
  {
    companyName: "Griffin Moor",
    primaryDomain: "griffinmoor.com",
    adminEmail: "cday@griffinmoor.com",
    adminName: "Clarence Day",
    accountType: "Client",
  },
  {
    companyName: "Clarence Day",
    primaryDomain: "clarenceday.com",
    adminEmail: "admin@clarenceday.com",
    adminName: "Clarence Day Admin",
    accountType: "Client",
  },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
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
    const APP_URL = Deno.env.get("APP_URL") ?? "https://fivelinenaitive.lovable.app";

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData?.user) return json({ error: "Unauthorized" }, 401);
    const caller = authData.user;

    // Caller must be a platform admin AND a 5th Line internal email.
    const callerEmail = (caller.email ?? "").toLowerCase();
    if (!callerEmail.endsWith("@5thline.com") && !callerEmail.endsWith("@5thline.co")) {
      return json({ error: "Restricted to 5th Line internal operators" }, 403);
    }
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "Admin access required" }, 403);

    const body = (await req.json().catch(() => ({}))) as ProvisionBody;
    const tenants = body.tenants?.length ? body.tenants : DEFAULT_TENANTS;

    const results: Array<Record<string, unknown>> = [];

    for (const t of tenants) {
      const companyName = t.companyName?.trim();
      const adminEmail = t.adminEmail?.trim().toLowerCase();
      const adminName = t.adminName?.trim() || adminEmail?.split("@")[0] || "Admin";
      const accountType = (t.accountType || "Client").trim();
      const primaryDomain = t.primaryDomain?.trim().toLowerCase() || null;

      if (!companyName || !adminEmail) {
        results.push({ companyName, ok: false, reason: "companyName and adminEmail required" });
        continue;
      }

      try {
        // 1. Idempotent company lookup by primary_domain, then by name.
        let companyId: string | null = null;
        let companyCreated = false;
        if (primaryDomain) {
          const { data: existingByDomain } = await admin
            .from("companies")
            .select("id")
            .eq("primary_domain", primaryDomain)
            .maybeSingle();
          if (existingByDomain) companyId = existingByDomain.id;
        }
        if (!companyId) {
          const { data: existingByName } = await admin
            .from("companies")
            .select("id")
            .eq("name", companyName)
            .maybeSingle();
          if (existingByName) companyId = existingByName.id;
        }
        if (!companyId) {
          const { data: created, error: cErr } = await admin
            .from("companies")
            .insert({
              name: companyName,
              account_type: accountType,
              primary_domain: primaryDomain,
              domains: primaryDomain ? [primaryDomain] : [],
              subscription_status: "active",
              created_by: caller.id,
            })
            .select("id")
            .single();
          if (cErr || !created) throw new Error(cErr?.message ?? "company insert failed");
          companyId = created.id;
          companyCreated = true;
        }

        // 2. Idempotent auth user lookup/create.
        let userId: string | null = null;
        let userCreated = false;
        // Paginate listUsers to find by email (admin API has no direct filter).
        for (let page = 1; page <= 10 && !userId; page++) {
          const { data: list } = await admin.auth.admin.listUsers({ page, perPage: 200 });
          const hit = list?.users?.find((u) => u.email?.toLowerCase() === adminEmail);
          if (hit) userId = hit.id;
          if (!list?.users?.length || list.users.length < 200) break;
        }
        if (!userId) {
          const { data: createdUser, error: uErr } = await admin.auth.admin.createUser({
            email: adminEmail,
            email_confirm: true,
            user_metadata: { full_name: adminName, provisioned_via: "provision-tenant" },
          });
          if (uErr || !createdUser.user) throw new Error(uErr?.message ?? "user create failed");
          userId = createdUser.user.id;
          userCreated = true;
        }

        // 3. Force-approve profile so they bypass access-request gate.
        const nowIso = new Date().toISOString();
        const { data: existingProfile } = await admin
          .from("profiles")
          .select("id, approved_at")
          .eq("user_id", userId)
          .maybeSingle();
        if (!existingProfile) {
          await admin.from("profiles").insert({
            user_id: userId,
            display_name: adminName,
            full_name: adminName,
            email: adminEmail,
            is_active: true,
            approved_at: nowIso,
            approved_by: caller.id,
            approval_requested_at: nowIso,
          });
        } else {
          await admin
            .from("profiles")
            .update({
              is_active: true,
              approved_at: existingProfile.approved_at ?? nowIso,
              approved_by: caller.id,
            })
            .eq("user_id", userId);
        }

        // 4. Upsert company_members as admin (tenant admin, not platform admin).
        await admin
          .from("company_members")
          .upsert(
            { company_id: companyId, user_id: userId, role: "admin" },
            { onConflict: "company_id,user_id" },
          );

        // 5. Generate one-time magic login link. No email is sent — the link
        //    is returned to the caller (5th Line admin) to surface in-console.
        const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
          type: "magiclink",
          email: adminEmail,
          options: { redirectTo: `${APP_URL}/` },
        });
        if (linkErr) throw new Error(`generateLink failed: ${linkErr.message}`);
        const actionLink =
          linkData?.properties?.action_link ?? linkData?.action_link ?? null;

        results.push({
          ok: true,
          companyName,
          companyId,
          companyCreated,
          userId,
          userCreated,
          adminEmail,
          magicLink: actionLink,
          expiresHint: "Magic link single-use; default Supabase OTP expiry applies (~1h).",
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[provision-tenant] failed", companyName, msg);
        results.push({ ok: false, companyName, reason: msg });
      }
    }

    return json({ provisionedBy: caller.email, results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[provision-tenant] fatal", msg);
    return json({ error: msg }, 500);
  }
});