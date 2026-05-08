import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CompanyRole = "admin" | "member";

interface DemoUserInput {
  name: string;
  email: string;
  role: "Admin" | "Member" | "Read Only" | string;
}

interface CreateDemoBody {
  companyName: string;
  accountType?: string;            // Pilot | Demo | Partner | Client
  notes?: string;
  trialEndsAt?: string | null;     // ISO date or null
  trialPlan?: string;              // free text bucket
  sendWelcomeEmail?: boolean;
  users: DemoUserInput[];
}

function mapRole(uiRole: string): CompanyRole {
  // company_role enum is owner|admin|member; treat "Read Only" as member.
  return uiRole === "Admin" ? "admin" : "member";
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const caller = authData.user;

    // Verify caller is a platform admin
    const { data: roleRow, error: roleErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .maybeSingle();
    if (roleErr || !roleRow) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const body = (await req.json()) as CreateDemoBody;
    if (!body?.companyName?.trim() || !Array.isArray(body.users) || body.users.length === 0) {
      return new Response(JSON.stringify({ error: "companyName and at least one user are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const trialEnds = body.trialEndsAt
      ? new Date(body.trialEndsAt).toISOString()
      : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const accountType = (body.accountType || "Demo").trim();
    const subscriptionStatus = "trialing";

    // 1. Create company
    const { data: company, error: companyErr } = await admin
      .from("companies")
      .insert({
        name: body.companyName.trim(),
        account_type: accountType,
        notes: body.notes ?? null,
        trial_ends_at: trialEnds,
        subscription_status: subscriptionStatus,
        created_by: caller.id,
      })
      .select("id, name")
      .single();

    if (companyErr || !company) {
      console.error("[create-demo-access] company insert failed", companyErr);
      return new Response(JSON.stringify({ error: companyErr?.message ?? "Failed to create company" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const inviterName =
      (caller.user_metadata as Record<string, unknown> | null)?.full_name as string | undefined ||
      (caller.email?.split("@")[0] ?? "An admin");

    const results: Array<Record<string, unknown>> = [];

    for (const u of body.users) {
      const email = u.email?.trim().toLowerCase();
      const name = u.name?.trim();
      if (!email || !name) {
        results.push({ email, ok: false, reason: "missing name or email" });
        continue;
      }
      const companyRole: CompanyRole = mapRole(u.role);
      const platformRole = u.role; // store original UI label as note for now

      try {
        // 2a. Find existing auth user
        let userId: string | null = null;
        const { data: existingList } = await admin.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        });
        const existing = existingList?.users?.find((x) => x.email?.toLowerCase() === email);

        if (existing) {
          userId = existing.id;
        } else {
          const { data: created, error: createErr } = await admin.auth.admin.createUser({
            email,
            email_confirm: true,
            user_metadata: { full_name: name, invited_via: "demo-access" },
          });
          if (createErr || !created.user) {
            results.push({ email, ok: false, reason: createErr?.message ?? "Failed to create user" });
            continue;
          }
          userId = created.user.id;
        }

        // 2b. Upsert profile row
        const { data: existingProfile } = await admin
          .from("profiles")
          .select("id, user_id")
          .eq("user_id", userId)
          .maybeSingle();

        if (!existingProfile) {
          await admin.from("profiles").insert({
            user_id: userId,
            display_name: name,
            full_name: name,
            email,
            is_active: true,
            approved_at: new Date().toISOString(),
          });
        } else {
          await admin.from("profiles").update({ is_active: true }).eq("user_id", userId);
        }

        // 2c. Add to company_members (idempotent on unique key)
        await admin
          .from("company_members")
          .upsert(
            {
              company_id: company.id,
              user_id: userId,
              role: companyRole,
            },
            { onConflict: "company_id,user_id" },
          );

        // 2d. Create invitation row (token auto-gens)
        const { data: invitation, error: inviteErr } = await admin
          .from("company_invitations")
          .insert({
            company_id: company.id,
            email,
            role: companyRole,
            invited_by: caller.id,
          })
          .select("id, token")
          .single();

        if (inviteErr) {
          // Could be a unique constraint hit — surface but continue
          results.push({ email, ok: true, userId, invited: false, warn: inviteErr.message });
        } else if (body.sendWelcomeEmail !== false) {
          // 3. Send invite email via existing send-invite function
          try {
            await admin.functions.invoke("send-invite", {
              body: {
                invitationId: invitation.id,
                email,
                companyName: company.name,
                inviterName,
                role: platformRole,
                token: invitation.token,
              },
              headers: { Authorization: authHeader },
            });
          } catch (sendErr) {
            console.warn("[create-demo-access] send-invite failed", sendErr);
          }
          results.push({ email, ok: true, userId, invited: true });
        } else {
          results.push({ email, ok: true, userId, invited: false });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[create-demo-access] user error", email, msg);
        results.push({ email, ok: false, reason: msg });
      }
    }

    return new Response(
      JSON.stringify({ success: true, company, results }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[create-demo-access] fatal", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);