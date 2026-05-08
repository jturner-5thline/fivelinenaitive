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

    const PLATFORM_URL = Deno.env.get("APP_URL") ?? "https://fivelinenaitive.lovable.app";
    const isDemoLike = ["demo", "pilot", "trial", "partner"].includes(accountType.toLowerCase());
    const shouldSeed = body.seedSampleData !== false && isDemoLike;

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
          // 3. Send branded demo-invite email via the shared transactional sender.
          //    Falls back to legacy send-invite if the transactional path errors.
          const acceptUrl = `${PLATFORM_URL}/accept-invite?token=${invitation.token}`;
          let sentBranded = false;
          try {
            const { error: txErr } = await admin.functions.invoke("send-transactional-email", {
              body: {
                templateName: "demo-invite",
                recipientEmail: email,
                idempotencyKey: `demo-invite-${invitation.id}`,
                templateData: {
                  name,
                  companyName: company.name,
                  inviterName,
                  acceptUrl,
                  trialEndsAt: trialEnds,
                  role: platformRole,
                },
              },
            });
            if (txErr) throw txErr;
            sentBranded = true;
          } catch (txErr) {
            console.warn("[create-demo-access] branded invite failed, falling back", txErr);
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
              console.warn("[create-demo-access] send-invite fallback failed", sendErr);
            }
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

    // 4. Seed lightweight sample data for demo / pilot accounts so the workspace
    //    feels alive on first login. Best-effort — never block the response.
    let seeded: { deals: number; contacts: number } | null = null;
    if (shouldSeed) {
      try {
        seeded = await seedDemoCompanyData(admin, company.id, caller.id);
      } catch (seedErr) {
        console.warn("[create-demo-access] sample seeding failed", seedErr);
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

    return new Response(
      JSON.stringify({ success: true, company, results, seeded, crmLead }),
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

async function seedDemoCompanyData(
  admin: ReturnType<typeof createClient>,
  companyId: string,
  attributingUserId: string,
): Promise<{ deals: number; contacts: number }> {
  // Resolve the default pipeline for the freshly-created company (created by
  // the seed-new-company trigger). If it isn't there yet, skip silently.
  const { data: pipeline } = await admin
    .from("deal_pipelines")
    .select("id, stages")
    .eq("company_id", companyId)
    .eq("is_default", true)
    .maybeSingle();

  const stages = Array.isArray(pipeline?.stages)
    ? (pipeline!.stages as Array<{ id?: string; label?: string }>)
    : [];
  const stageId = (idx: number) => stages[idx]?.id || stages[0]?.id || "qualification";

  const SAMPLE_DEALS = [
    { company: "Acme Capital", value: 18_500_000, stage: stageId(1), status: "active", deal_type: "Refinancing",       manager: "James Turner", referred_by: "Direct" },
    { company: "Northwind Logistics", value: 9_250_000, stage: stageId(2), status: "active", deal_type: "Growth Capital", manager: "James Turner", referred_by: "Goldman Sachs" },
    { company: "Stellar Health", value: 32_000_000, stage: stageId(0), status: "active", deal_type: "Acquisition",     manager: "James Turner", referred_by: "JP Morgan" },
    { company: "Apex Manufacturing", value: 12_400_000, stage: stageId(3), status: "active", deal_type: "Working Capital", manager: "James Turner", referred_by: "Direct" },
    { company: "Harbor Foods", value: 6_800_000, stage: stageId(1), status: "active", deal_type: "Recapitalization", manager: "James Turner", referred_by: "Referral Partner" },
  ];

  const dealRows = SAMPLE_DEALS.map((d) => ({
    ...d,
    company_id: companyId,
    user_id: attributingUserId,
    pipeline_id: pipeline?.id ?? null,
    is_sample: true,
  }));

  const { data: insertedDeals, error: dealsErr } = await admin
    .from("deals")
    .insert(dealRows)
    .select("id");
  if (dealsErr) {
    console.warn("[create-demo-access] seed deals error", dealsErr);
  }

  const SAMPLE_CONTACTS = [
    { first_name: "Sarah",   last_name: "Chen",     email: "sarah.chen@acmecap.example",      title: "CFO" },
    { first_name: "Michael", last_name: "Roberts",  email: "m.roberts@northwind.example",     title: "VP Finance" },
    { first_name: "Priya",   last_name: "Patel",    email: "priya@stellarhealth.example",     title: "Head of Strategy" },
    { first_name: "David",   last_name: "Nguyen",   email: "d.nguyen@apexmfg.example",        title: "Treasurer" },
  ].map((c) => ({
    ...c,
    company_id: companyId,
    org_company_id: companyId,
    created_by: attributingUserId,
  }));

  let contactsInserted = 0;
  try {
    const { count } = await admin
      .from("contacts")
      .insert(SAMPLE_CONTACTS, { count: "exact" });
    contactsInserted = count ?? SAMPLE_CONTACTS.length;
  } catch (e) {
    console.warn("[create-demo-access] seed contacts skipped", e);
  }

  return {
    deals: insertedDeals?.length ?? 0,
    contacts: contactsInserted,
  };
}

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
    const { data: deal } = await admin
      .from("deals")
      .insert({
        company: args.companyName,
        value: 0,
        status: "active",
        stage: "Initial Review",
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