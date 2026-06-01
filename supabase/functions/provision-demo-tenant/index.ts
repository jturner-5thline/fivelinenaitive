// Provisions an isolated demo tenant by:
//   1. Creating (or reusing) a company row.
//   2. Creating (or reusing) an auth user via the admin API with email_confirm=true.
//      No email is sent — password is set server-side.
//   3. Linking the user as owner via company_members.
//   4. Calling public.clone_demo_tenant() to mirror a source tenant's
//      structural data (pipelines, sampled deals + history, sampled lenders,
//      agents, workflows, dashboards, settings) with PII anonymized.
//
// Idempotent: safe to re-run for the same email/company.
// Auth: protected by a shared PROVISION_DEMO_SECRET header to avoid public abuse.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-provision-secret",
};

const FIFTH_LINE_COMPANY_ID = "44556c46-9127-4b12-b14e-d6fee784afcf";

interface ProvisionBody {
  email: string;
  password: string;
  display_name: string;
  company_name: string;
  source_company_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Simple shared-secret gate so the function isn't publicly callable.
  const provided = req.headers.get("x-provision-secret") ?? "";
  const expected = Deno.env.get("PROVISION_DEMO_SECRET") ?? "";
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: ProvisionBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const { email, password, display_name, company_name } = body;
  const source_company_id = body.source_company_id ?? FIFTH_LINE_COMPANY_ID;

  if (!email || !password || !display_name || !company_name) {
    return json({ error: "missing required fields" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // 1. Company (idempotent by name)
  let companyId: string;
  {
    const { data: existing } = await supabase
      .from("companies")
      .select("id")
      .eq("name", company_name)
      .maybeSingle();

    if (existing?.id) {
      companyId = existing.id;
    } else {
      const { data: created, error } = await supabase
        .from("companies")
        .insert({ name: company_name, account_type: "demo" })
        .select("id")
        .single();
      if (error) return json({ error: "company insert failed", detail: error.message }, 500);
      companyId = created.id;
    }
  }

  // 2. Auth user (idempotent: find existing by email, else create with admin API)
  let userId: string;
  let createdUser = false;
  {
    // listUsers paginates by email filter — use the explicit search.
    const { data: list, error: listErr } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) return json({ error: "listUsers failed", detail: listErr.message }, 500);
    const found = list.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());

    if (found) {
      userId = found.id;
      // Reset password & ensure email_confirmed.
      const { error: updErr } = await supabase.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: { ...found.user_metadata, display_name, full_name: display_name },
      });
      if (updErr) return json({ error: "updateUser failed", detail: updErr.message }, 500);
    } else {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // mark as confirmed — NO email is sent
        user_metadata: { display_name, full_name: display_name },
      });
      if (createErr) return json({ error: "createUser failed", detail: createErr.message }, 500);
      userId = created.user!.id;
      createdUser = true;
    }
  }

  // 3. company_members owner link (idempotent)
  {
    const { data: existing } = await supabase
      .from("company_members")
      .select("id")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!existing) {
      const { error } = await supabase
        .from("company_members")
        .insert({ company_id: companyId, user_id: userId, role: "owner" });
      if (error) return json({ error: "company_members insert failed", detail: error.message }, 500);
    }
  }

  // 4. Clone source tenant data (idempotent — function wipes target rows first)
  const { data: cloneResult, error: cloneErr } = await supabase.rpc("clone_demo_tenant", {
    p_source_company_id: source_company_id,
    p_target_company_id: companyId,
    p_owner_user_id: userId,
  });
  if (cloneErr) {
    return json({
      error: "clone failed",
      detail: cloneErr.message,
      partial: { user_id: userId, company_id: companyId, created_user: createdUser },
    }, 500);
  }

  return json({
    ok: true,
    created_user: createdUser,
    user_id: userId,
    company_id: companyId,
    email,
    clone: cloneResult,
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}