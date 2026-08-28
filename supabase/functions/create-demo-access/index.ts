import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { provisionDemoWorkspace, type ProvisionResult } from "../_shared/provisionDemoWorkspace.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CompanyRole = "admin" | "member";

function generateDemoPassword(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const randomPart = Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("");
  return `Naitive-${Date.now().toString(36)}-${randomPart}!A7`;
}

interface DemoUserInput {
  name: string;
  email: string;
  role: "Admin" | "Member" | "Read Only" | string;
}

interface CreateDemoBody {
  companyName: string;
  accountType?: string;            // Hardcoded to "Demo"
  notes?: string;
  trialEndsAt?: string | null;     // ISO date or null
  trialPlan?: string;              // Hardcoded to "Full Access"
  accessLevel?: string;            // Alias for trialPlan, hardcoded to "Full Access"
  sendWelcomeEmail?: boolean;
  seedSampleData?: boolean;        // default true for demo/pilot
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
    console.log("[create-demo-access] request received");
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
    // Company type and trial plan are now hardcoded for the demo access flow.
    const accountType = "Demo";
    const trialPlan = "Full Access";
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
        is_demo: true,
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

    const PLATFORM_URL = Deno.env.get("APP_URL") ?? "https://naitive.co";
    const shouldSeed = body.seedSampleData !== false;

    const results: Array<Record<string, unknown>> = [];
    const provisionedUserIds: string[] = [];

    for (const u of body.users) {
      const email = u.email?.trim().toLowerCase();
      const name = u.name?.trim();
      if (!email || !name) {
        results.push({ email, ok: false, reason: "missing name or email" });
        continue;
      }
      const companyRole: CompanyRole = mapRole(u.role);
      const platformRole = u.role; // store original UI label as note for now
      const demoPassword = generateDemoPassword();

      try {
        // 2a. Find existing auth user
        let userId: string | null = null;
        let existing: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null = null;
        try {
          // Use SQL lookup instead of paginated listUsers (capped at 200/page)
          const { data: prof } = await admin
            .from("profiles")
            .select("user_id")
            .ilike("email", email)
            .maybeSingle();
          if (prof?.user_id) {
            const { data: got } = await admin.auth.admin.getUserById(prof.user_id);
            if (got?.user) existing = got.user as typeof existing;
          }
          if (!existing) {
            // Fall back to listUsers scan (first 1000)
            for (let page = 1; page <= 5 && !existing; page++) {
              const { data: list } = await admin.auth.admin.listUsers({ page, perPage: 200 });
              const hit = list?.users?.find((x) => x.email?.toLowerCase() === email);
              if (hit) existing = hit as typeof existing;
              if (!list?.users?.length || list.users.length < 200) break;
            }
          }
        } catch (lookupErr) {
          console.warn("[create-demo-access] existing-user lookup failed", email, lookupErr);
        }

        if (existing) {
          userId = existing.id;
          const { error: updateUserErr } = await admin.auth.admin.updateUserById(existing.id, {
            password: demoPassword,
            email_confirm: true,
            user_metadata: {
              ...(existing.user_metadata ?? {}),
              full_name: name,
              invited_via: "demo-access",
              demo_access: true,
            },
          });
          if (updateUserErr) {
            console.error("[create-demo-access] updateUserById failed", email, updateUserErr);
            results.push({ email, ok: false, reason: updateUserErr.message ?? "Failed to update demo user" });
            continue;
          }
        } else {
          const { data: created, error: createErr } = await admin.auth.admin.createUser({
            email,
            password: demoPassword,
            email_confirm: true,
            user_metadata: { full_name: name, invited_via: "demo-access", demo_access: true },
          });
          if (createErr || !created.user) {
            console.error("[create-demo-access] createUser failed", email, createErr);
            results.push({ email, ok: false, reason: createErr?.message ?? "Failed to create user" });
            continue;
          }
          userId = created.user.id;
        }

        // 2b. Upsert profile row — ALWAYS force-approve on the demo path so
        //     the user bypasses the Access Request approval gate and can log
        //     in immediately. This also covers the common case where the
        //     auth.users → profile trigger already inserted a row with
        //     approved_at = NULL.
        const nowIso = new Date().toISOString();
        const { data: existingProfile } = await admin
          .from("profiles")
          .select("id, user_id, approved_at")
          .eq("user_id", userId)
          .maybeSingle();

        if (!existingProfile) {
          await admin.from("profiles").insert({
            user_id: userId,
            display_name: name,
            full_name: name,
            email,
            is_active: true,
            onboarding_completed: true,
            onboarding_skipped: true,
            approved_at: nowIso,
            approved_by: caller.id,
            approval_requested_at: nowIso,
            is_demo_user: true,
            notifications_consent_shown: true,
            notifications_opted_in: false,
          });
        } else {
          await admin
            .from("profiles")
            .update({
              is_active: true,
              onboarding_completed: true,
              onboarding_skipped: true,
              approved_at: existingProfile.approved_at ?? nowIso,
              approved_by: caller.id,
              is_demo_user: true,
              notifications_consent_shown: true,
              notifications_opted_in: false,
            })
            .eq("user_id", userId);
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

        provisionedUserIds.push(userId!);

        const loginUrl = `${PLATFORM_URL}/login?email=${encodeURIComponent(email)}&password=${encodeURIComponent(demoPassword)}&demo=1&redirect=${encodeURIComponent("/deals")}`;
        console.log("[create-demo-access] provisioned user", { email, userId, hasLoginUrl: !!loginUrl });

        if (body.sendWelcomeEmail === false) {
          console.log("[create-demo-access] welcome email disabled, skipping send", email);
          results.push({
            email,
            ok: true,
            provisioned: true,
            userId,
            invited: false,
            email_sent: false,
            email_skipped: true,
            loginUrl,
            error: null,
          });
          continue;
        }

        // 3. Send branded demo-access email with the working demo login URL as the CTA.
        let sent = false;
        let sendErr: string | null = null;
        console.log("[create-demo-access] attempting demo-invite send", email);
        try {
          const { data: txData, error: txErr } = await admin.functions.invoke("send-app-email", {
            headers: { Authorization: authHeader },
            body: {
              templateName: "demo-invite",
              recipientEmail: email,
              idempotencyKey: `demo-access-${company.id}-${userId}-${Date.now()}`,
              templateData: {
                name,
                companyName: company.name,
                inviterName,
                acceptUrl: loginUrl,
                trialEndsAt: trialEnds,
                role: platformRole,
              },
            },
          });
          if (txErr) throw txErr;
          if (txData && typeof txData === "object" && "error" in (txData as Record<string, unknown>)) {
            const inner = (txData as { error?: string }).error;
            if (inner) throw new Error(inner);
          }
          sent = true;
          console.log("[create-demo-access] demo-invite enqueued", email);
        } catch (e) {
          sendErr = e instanceof Error ? e.message : String(e);
          console.error("[create-demo-access] demo-access email failed", email, sendErr);
        }

        results.push({
          email,
          ok: true,
          provisioned: true,
          userId,
          invited: sent,
          email_sent: sent,
          channel: sent ? "demo-login" : null,
          reason: sent ? null : sendErr ?? "Email send failed",
          error: sent ? null : sendErr ?? "Email send failed",
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[create-demo-access] user error", email, msg);
        results.push({
          email,
          ok: false,
          provisioned: false,
          invited: false,
          email_sent: false,
          reason: msg,
          error: msg,
        });
      }
    }

    // 4. Provision the canonical demo workspace (flags + pipeline + seeds +
    //    validator). Idempotent: reruns top up to target without dupes.
    let seeded: ProvisionResult | null = null;
    let seedError: string | null = null;
    if (shouldSeed && provisionedUserIds.length > 0) {
      try {
        seeded = await provisionDemoWorkspace(admin, {
          companyId: company.id,
          attributingUserId: provisionedUserIds[0],
          memberUserIds: provisionedUserIds,
        });
      } catch (seedErr) {
        seedError = seedErr instanceof Error ? seedErr.message : String(seedErr);
        console.error("[create-demo-access] provisioning failed", seedError);
      }
    }

    // 5. Create a Sales BD lead in the 5th Line internal workspace so demos
    //    flow through the existing pipeline. Best-effort.
    let crmLead: { dealId?: string; contactId?: string } | null = null;
    try {
      crmLead = await createCrmLead(admin, {
        companyName: company.name,
        accountType,
        trialEndsAt: trialEnds,
        notes: body.notes ?? null,
        users: body.users,
        attributingUserId: caller.id,
      });
    } catch (crmErr) {
      console.warn("[create-demo-access] CRM lead creation failed", crmErr);
    }

    const sendWanted = body.sendWelcomeEmail !== false;
    const provisionedCount = results.filter((r) => r.provisioned).length;
    const emailFailures = sendWanted
      ? results.filter((r) => r.provisioned && !r.email_sent).length
      : 0;
    const allEmailsSent = sendWanted && provisionedCount > 0 && emailFailures === 0;
    console.log("[create-demo-access] complete", {
      provisionedCount,
      emailFailures,
      sendWanted,
    });

    return new Response(
      JSON.stringify({
        success: true,
        company,
        results,
        seeded,
        seedError,
        crmLead,
        emailRequested: sendWanted,
        emailFailures,
        allEmailsSent,
      }),
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


const FIFTH_LINE_COMPANY_ID = "44556c46-9127-4b12-b14e-d6fee784afcf";

async function createCrmLead(
  admin: ReturnType<typeof createClient>,
  args: {
    companyName: string;
    accountType: string;
    trialEndsAt: string;
    notes: string | null;
    users: DemoUserInput[];
    attributingUserId: string;
  },
): Promise<{ dealId?: string; contactId?: string }> {
  const out: { dealId?: string; contactId?: string } = {};
  const primary = args.users[0];

  // Insert deal in 5th Line workspace
  try {
    // Resolve the 5th Line "naitive Pipeline" so the demo lead lands on the
    // Naitive page's "Demo Access" stage instead of the default Active Pipeline.
    let naitivePipelineId: string | null = null;
    try {
      const { data: pipe } = await admin
        .from("deal_pipelines")
        .select("id")
        .eq("company_id", FIFTH_LINE_COMPANY_ID)
        .eq("name", "naitive Pipeline")
        .maybeSingle();
      naitivePipelineId = (pipe?.id as string | undefined) ?? null;
    } catch (lookupErr) {
      console.warn("[create-demo-access] naitive pipeline lookup failed", lookupErr);
    }

    const { data: deal } = await admin
      .from("deals")
      .insert({
        company: args.companyName,
        value: 0,
        status: "active",
        stage: "demo-access",
        pipeline_id: naitivePipelineId,
        deal_class: "standard",
        deal_type: `${args.accountType} Lead`,
        manager: "James Turner",
        referred_by: "Demo Access",
        company_id: FIFTH_LINE_COMPANY_ID,
        user_id: args.attributingUserId,
        tags: ["demo-lead", args.accountType.toLowerCase()],
        notes: [
          `${args.accountType} workspace provisioned for ${args.companyName}.`,
          `Trial ends: ${new Date(args.trialEndsAt).toISOString().slice(0, 10)}`,
          args.notes ? `Notes: ${args.notes}` : null,
          primary ? `Primary contact: ${primary.name} <${primary.email}>` : null,
        ].filter(Boolean).join("\n"),
      })
      .select("id")
      .single();
    if (deal) out.dealId = deal.id as string;
  } catch (e) {
    console.warn("[create-demo-access] CRM deal insert failed", e);
  }

  // Insert primary contact
  if (primary) {
    try {
      const [first, ...rest] = primary.name.split(" ");
      const { data: contact } = await admin
        .from("contacts")
        .insert({
          first_name: first || primary.name,
          last_name: rest.join(" ") || null,
          email: primary.email.toLowerCase(),
          title: primary.role,
          company_id: FIFTH_LINE_COMPANY_ID,
          org_company_id: FIFTH_LINE_COMPANY_ID,
          created_by: args.attributingUserId,
        })
        .select("id")
        .single();
      if (contact) out.contactId = contact.id as string;
    } catch (e) {
      console.warn("[create-demo-access] CRM contact insert failed", e);
    }
  }

  return out;
}

serve(handler);