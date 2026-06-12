import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CompanyRole = "admin" | "member";
const DEMO_PASSWORD = "User1234";
const SEED_VERSION = "1.0.0";

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
          const { error: updateUserErr } = await admin.auth.admin.updateUserById(existing.id, {
            password: DEMO_PASSWORD,
            email_confirm: true,
            user_metadata: {
              ...(existing.user_metadata ?? {}),
              full_name: name,
              invited_via: "demo-access",
              demo_access: true,
            },
          });
          if (updateUserErr) {
            results.push({ email, ok: false, reason: updateUserErr.message ?? "Failed to update demo user" });
            continue;
          }
        } else {
          const { data: created, error: createErr } = await admin.auth.admin.createUser({
            email,
            password: DEMO_PASSWORD,
            email_confirm: true,
            user_metadata: { full_name: name, invited_via: "demo-access", demo_access: true },
          });
          if (createErr || !created.user) {
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

        const loginUrl = `${PLATFORM_URL}/login?email=${encodeURIComponent(email)}&password=${encodeURIComponent(DEMO_PASSWORD)}&demo=1&redirect=${encodeURIComponent("/deals")}`;
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
          const { data: txData, error: txErr } = await admin.functions.invoke("send-transactional-email", {
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

    // 4. Seed the demo workspace transactionally and idempotently so the
    //    user lands in a fully populated tenant on first login.
    let seeded: SeedResult | null = null;
    let seedError: string | null = null;
    if (shouldSeed && provisionedUserIds.length > 0) {
      try {
        seeded = await seedDemoCompanyData(admin, company.id, provisionedUserIds[0]);
      } catch (seedErr) {
        seedError = seedErr instanceof Error ? seedErr.message : String(seedErr);
        console.error("[create-demo-access] sample seeding failed", seedError);
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

interface SeedResult {
  deals: number;
  contacts: number;
  crmCompanies: number;
  tasks: number;
  fundingSources: number;
  pipelineId: string | null;
  seededAt: string;
  seedVersion: string;
  skipped?: boolean;
}

const FIRST_NAMES = [
  "Sarah","Michael","Priya","David","Emily","James","Olivia","Daniel","Sophia","Liam",
  "Ava","Noah","Mia","Ethan","Isabella","Mason","Charlotte","Logan","Amelia","Lucas",
  "Harper","Benjamin","Evelyn","Henry","Abigail","Alexander","Ella","Sebastian","Scarlett","Jack",
];
const LAST_NAMES = [
  "Chen","Roberts","Patel","Nguyen","Brooks","Mercer","Hayes","Collins","Parker","Martinez",
  "Thompson","Foster","Anderson","Wright","Bennett","Coleman","Russell","Griffin","Hayward","Sutton",
  "Lambert","Khan","Singh","Garcia","Schultz","Ramirez","Okafor","Vasquez","Ito","Becker",
];
const INDUSTRIES = [
  "Software","Healthcare","Manufacturing","Logistics","Retail","Financial Services","Energy",
  "Real Estate","Media","Construction","Education","Consumer Goods","Telecom","Hospitality",
];
const CITIES = [
  ["New York","NY"],["San Francisco","CA"],["Chicago","IL"],["Austin","TX"],["Boston","MA"],
  ["Seattle","WA"],["Denver","CO"],["Atlanta","GA"],["Miami","FL"],["Los Angeles","CA"],
];
const COMPANY_SUFFIXES = ["Capital","Holdings","Partners","Group","Industries","Logistics","Health","Foods","Manufacturing","Energy","Labs","Systems","Solutions","Ventures","Brands"];
const COMPANY_PREFIXES = ["Acme","Northwind","Stellar","Apex","Harbor","Summit","Cobalt","Ironwood","Maple","Crescent","Lumen","Beacon","Vanguard","Cardinal","Granite","Pioneer","Atlas","Falcon","Helix","Orion","Quanta","Vertex","Zephyr","Pinnacle","Ridge","Aurora","Bluestone","Cascade","Delta","Evergreen"];
const DEAL_TYPES = ["Refinancing","Growth Capital","Acquisition","Working Capital","Recapitalization","Bridge Loan","Senior Debt"];
const REFERRERS = ["Direct","Goldman Sachs","JP Morgan","Referral Partner","Inbound","Cold Outbound","Existing Client"];
const DEFAULT_STAGES = [
  { id: "final-credit-items", color: "bg-slate-500", label: "Final Credit Items" },
  { id: "client-strategy-review", color: "bg-blue-500", label: "Client Strategy Review" },
  { id: "write-up-pending", color: "bg-indigo-500", label: "Write-Up Pending" },
  { id: "submitted-to-lenders", color: "bg-violet-500", label: "Submitted to Lenders" },
  { id: "lenders-in-review", color: "bg-purple-500", label: "Lenders in Review" },
  { id: "terms-issued", color: "bg-fuchsia-500", label: "Terms Issued" },
  { id: "in-due-diligence", color: "bg-amber-500", label: "In Due Diligence" },
  { id: "funded-invoiced", color: "bg-cyan-500", label: "Funded / Invoiced" },
  { id: "closed-won", color: "bg-success", label: "Closed Won" },
  { id: "closed-lost", color: "bg-destructive", label: "Closed Lost" },
  { id: "on-hold", color: "bg-muted", label: "On Hold" },
];
const LENDER_TYPES = ["Bank","Non-Bank","Credit Fund","Private Credit","BDC","SBA","Mezzanine"];
const LOAN_TYPES_POOL = ["Senior Debt","Unitranche","Mezzanine","Revolver","Term Loan","ABL"];
const TIERS = ["T1","T2","T3"];

function pick<T>(arr: readonly T[], i: number): T {
  return arr[i % arr.length];
}
function rand(seed: number, max: number) {
  // deterministic pseudo-random in [0, max)
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return Math.floor((x - Math.floor(x)) * max);
}

async function seedDemoCompanyData(
  admin: ReturnType<typeof createClient>,
  companyId: string,
  attributingUserId: string,
): Promise<SeedResult> {
  // Idempotency: if this company has already been seeded, skip.
  const { data: companyRow } = await admin
    .from("companies")
    .select("id, seeded_at, seed_version")
    .eq("id", companyId)
    .maybeSingle();
  if (companyRow?.seeded_at) {
    return {
      deals: 0, contacts: 0, crmCompanies: 0, tasks: 0, fundingSources: 0,
      pipelineId: null,
      seededAt: companyRow.seeded_at as string,
      seedVersion: (companyRow.seed_version as string) ?? SEED_VERSION,
      skipped: true,
    };
  }

  // Track inserted IDs so we can roll back on failure.
  const inserted: {
    pipelines: string[];
    crmCompanies: string[];
    contacts: string[];
    deals: string[];
    tasks: string[];
    lenders: string[];
  } = { pipelines: [], crmCompanies: [], contacts: [], deals: [], tasks: [], lenders: [] };

  const rollback = async () => {
    try {
      if (inserted.tasks.length) await admin.from("tasks").delete().in("id", inserted.tasks);
      if (inserted.deals.length) await admin.from("deals").delete().in("id", inserted.deals);
      if (inserted.contacts.length) await admin.from("contacts").delete().in("id", inserted.contacts);
      if (inserted.crmCompanies.length) await admin.from("crm_companies").delete().in("id", inserted.crmCompanies);
      if (inserted.lenders.length) await admin.from("master_lenders").delete().in("id", inserted.lenders);
      if (inserted.pipelines.length) await admin.from("deal_pipelines").delete().in("id", inserted.pipelines);
    } catch (e) {
      console.error("[seedDemoCompanyData] rollback failed", e);
    }
  };

  try {
    // --- Default pipeline ---
    let { data: pipeline } = await admin
      .from("deal_pipelines")
      .select("id, stages")
      .eq("company_id", companyId)
      .eq("is_default", true)
      .maybeSingle();
    if (!pipeline) {
      const { data: newPipe, error: pipeErr } = await admin
        .from("deal_pipelines")
        .insert({
          company_id: companyId,
          name: "Active Pipeline",
          stages: DEFAULT_STAGES,
          is_default: true,
          position: 0,
        })
        .select("id, stages")
        .single();
      if (pipeErr || !newPipe) throw new Error(`pipeline: ${pipeErr?.message ?? "insert failed"}`);
      pipeline = newPipe;
      inserted.pipelines.push(newPipe.id as string);
    }
    const stages = Array.isArray(pipeline.stages)
      ? (pipeline.stages as Array<{ id?: string; label?: string }>)
      : DEFAULT_STAGES;
    const stageId = (idx: number) => stages[idx]?.id || stages[0]?.id || "lenders-in-review";

    // --- 50 CRM companies ---
    const crmRows = Array.from({ length: 50 }, (_, i) => {
      const prefix = pick(COMPANY_PREFIXES, i);
      const suffix = pick(COMPANY_SUFFIXES, i + 3);
      const name = `${prefix} ${suffix}`;
      const [city, state] = pick(CITIES, i);
      const industry = pick(INDUSTRIES, i);
      const domain = `${prefix.toLowerCase()}${suffix.toLowerCase()}.example`;
      return {
        name,
        domain,
        industry,
        employee_count: 50 + rand(i, 950),
        annual_revenue: (1_000_000 + rand(i + 7, 50_000_000)),
        hq_city: city,
        hq_state: state,
        hq_country: "USA",
        website_url: `https://${domain}`,
        description: `${name} is a ${industry.toLowerCase()} company headquartered in ${city}, ${state}.`,
        phone: `+1 (${200 + rand(i, 700)}) ${100 + rand(i + 1, 900)}-${1000 + rand(i + 2, 9000)}`,
        company_type: "prospect",
        status: "active",
        lifecycle_stage: "lead",
        owner_user_id: attributingUserId,
        org_company_id: companyId,
        created_by: attributingUserId,
        tags: ["demo"],
      };
    });
    const { data: crmInserted, error: crmErr } = await admin
      .from("crm_companies")
      .insert(crmRows)
      .select("id, name, domain");
    if (crmErr) throw new Error(`crm_companies: ${crmErr.message}`);
    (crmInserted ?? []).forEach((c) => inserted.crmCompanies.push(c.id as string));

    // --- 100 contacts (linked to crm_companies) ---
    const contactRows = Array.from({ length: 100 }, (_, i) => {
      const first = pick(FIRST_NAMES, i);
      const last = pick(LAST_NAMES, i + 5);
      const crm = (crmInserted ?? [])[i % Math.max(crmInserted?.length ?? 1, 1)] as
        | { id: string; name: string; domain: string }
        | undefined;
      const domain = crm?.domain ?? "example.com";
      return {
        first_name: first,
        last_name: last,
        full_name: `${first} ${last}`,
        email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@${domain}`,
        phone_work: `+1 (${200 + rand(i, 700)}) ${100 + rand(i + 1, 900)}-${1000 + rand(i + 2, 9000)}`,
        job_title: pick(["CFO","CEO","COO","VP Finance","Treasurer","Controller","Head of Strategy","Director of Finance"], i),
        seniority: pick(["c_level","vp","director","manager"], i),
        lifecycle_stage: "lead",
        status: "active",
        owner_user_id: attributingUserId,
        primary_company_id: crm?.id ?? null,
        crm_company_id: crm?.id ?? null,
        company_id: companyId,
        org_company_id: companyId,
        created_by: attributingUserId,
        tags: ["demo"],
        description: `Primary finance contact at ${crm?.name ?? "client"}.`,
        linkedin_url: `https://linkedin.com/in/${first.toLowerCase()}-${last.toLowerCase()}-${i}`,
      };
    });
    const { data: contactsInserted, error: contactsErr } = await admin
      .from("contacts")
      .insert(contactRows)
      .select("id");
    if (contactsErr) throw new Error(`contacts: ${contactsErr.message}`);
    (contactsInserted ?? []).forEach((c) => inserted.contacts.push(c.id as string));

    // --- 12 deals between $1MM and $20MM, mixed stages + statuses ---
    const DEAL_VALUES = [1_200_000, 2_500_000, 3_800_000, 5_000_000, 6_500_000, 8_000_000, 9_750_000, 11_250_000, 13_500_000, 15_000_000, 17_500_000, 19_800_000];
    const STATUS_CYCLE = ["active","active","active","active","active","active","active","active","on_hold","closed_won","closed_lost","active"];
    const dealRows = DEAL_VALUES.map((value, i) => {
      const crm = (crmInserted ?? [])[i % Math.max(crmInserted?.length ?? 1, 1)] as
        | { id: string; name: string; domain: string }
        | undefined;
      const status = STATUS_CYCLE[i];
      const stageIdx =
        status === "closed_won" ? 8 :
        status === "closed_lost" ? 9 :
        status === "on_hold" ? 10 :
        i % 8;
      return {
        company: crm?.name ?? `Demo Deal ${i + 1}`,
        value,
        stage: stageId(stageIdx),
        status,
        deal_type: pick(DEAL_TYPES, i),
        manager: "James Turner",
        referred_by: pick(REFERRERS, i),
        company_id: companyId,
        user_id: attributingUserId,
        crm_company_id: crm?.id ?? null,
        pipeline_id: pipeline.id,
        deal_class: "standard",
        tags: ["demo"],
        notes: `Seeded demo deal #${i + 1}. Value $${(value / 1_000_000).toFixed(1)}MM.`,
        on_hold: status === "on_hold",
      };
    });
    const { data: dealsInserted, error: dealsErr } = await admin
      .from("deals")
      .insert(dealRows)
      .select("id");
    if (dealsErr) throw new Error(`deals: ${dealsErr.message}`);
    (dealsInserted ?? []).forEach((d) => inserted.deals.push(d.id as string));

    // --- 20 tasks linked to deals ---
    const today = new Date();
    const inDays = (n: number) => {
      const d = new Date(today);
      d.setDate(d.getDate() + n);
      return d.toISOString().slice(0, 10);
    };
    const TASK_TITLES = [
      "Review term sheet","Send diligence checklist","Schedule intro call","Update investment memo",
      "Confirm data room access","Follow up on financials","Coordinate lender call","Draft NDA",
      "Verify EBITDA adjustments","Send client status update","Prepare lender list","Validate KPIs",
      "Walk through model","Confirm closing timeline","Review legal redline","Push update to VDR",
      "Send weekly summary","Schedule diligence meeting","Review proposed structure","Send signed engagement",
    ];
    const taskRows = TASK_TITLES.map((title, i) => ({
      title,
      description: `${title} — auto-seeded demo task.`,
      due_date: inDays((i % 14) - 3),
      status: pick(["pending","in_progress","pending","completed"], i),
      priority: pick(["low","medium","high"], i),
      task_type: "task",
      deal_id: inserted.deals[i % inserted.deals.length] ?? null,
      assigned_to: attributingUserId,
      assigned_by: attributingUserId,
      created_by: attributingUserId,
      company_id: companyId,
      tags: ["demo"],
      position: i,
    }));
    const { data: tasksInserted, error: tasksErr } = await admin
      .from("tasks")
      .insert(taskRows)
      .select("id");
    if (tasksErr) throw new Error(`tasks: ${tasksErr.message}`);
    (tasksInserted ?? []).forEach((t) => inserted.tasks.push(t.id as string));

    // --- 50 funding sources (master_lenders) ---
    const lenderRows = Array.from({ length: 50 }, (_, i) => {
      const firstName = pick(FIRST_NAMES, i + 2);
      const lastName = pick(LAST_NAMES, i + 11);
      const orgPrefix = pick(COMPANY_PREFIXES, i + 7);
      const orgSuffix = pick(["Capital","Credit","Partners","Bank","Finance","Fund"], i);
      const name = `${orgPrefix} ${orgSuffix}`;
      const [city, state] = pick(CITIES, i + 3);
      return {
        user_id: attributingUserId,
        company_id: companyId,
        name,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${orgPrefix.toLowerCase()}${orgSuffix.toLowerCase()}.example`,
        contact_name: `${firstName} ${lastName}`,
        contact_title: pick(["Managing Director","Director","VP","Principal","Associate"], i),
        contact_phone: `+1 (${200 + rand(i, 700)}) ${100 + rand(i + 1, 900)}-${1000 + rand(i + 2, 9000)}`,
        lender_type: pick(LENDER_TYPES, i),
        loan_types: [pick(LOAN_TYPES_POOL, i), pick(LOAN_TYPES_POOL, i + 1)],
        industries: [pick(INDUSTRIES, i), pick(INDUSTRIES, i + 2)],
        min_deal: 1_000_000 + rand(i, 4_000_000),
        max_deal: 20_000_000 + rand(i + 5, 80_000_000),
        min_revenue: 5_000_000 + rand(i, 15_000_000),
        ebitda_min: 1_000_000 + rand(i + 1, 4_000_000),
        geo: `${city}, ${state}`,
        address: `${100 + rand(i, 9900)} Market St, ${city}, ${state}`,
        phone: `+1 (${200 + rand(i, 700)}) ${100 + rand(i + 1, 900)}-${1000 + rand(i + 2, 9000)}`,
        website: `https://${orgPrefix.toLowerCase()}${orgSuffix.toLowerCase()}.example`,
        linkedin_url: `https://linkedin.com/company/${orgPrefix.toLowerCase()}-${orgSuffix.toLowerCase()}`,
        b2b_b2c: pick(["B2B","Both"], i),
        refinancing: pick(["Yes","No"], i),
        sub_debt: pick(["Yes","No"], i),
        cash_burn: pick(["Yes","No"], i),
        sponsorship: pick(["Required","Preferred","Not Required"], i),
        tier: pick(TIERS, i),
        active: true,
        tags: ["demo"],
        about_notes: `${name} is a demo-seeded ${pick(LENDER_TYPES, i).toLowerCase()} based in ${city}, ${state}.`,
        funding_source_notes: `Default check size $${((20_000_000 + rand(i, 30_000_000)) / 1_000_000).toFixed(0)}MM.`,
      };
    });
    const { data: lendersInserted, error: lendersErr } = await admin
      .from("master_lenders")
      .insert(lenderRows)
      .select("id");
    if (lendersErr) throw new Error(`master_lenders: ${lendersErr.message}`);
    (lendersInserted ?? []).forEach((l) => inserted.lenders.push(l.id as string));

    // --- Mark company as seeded (commit point) ---
    const seededAt = new Date().toISOString();
    const { error: markErr } = await admin
      .from("companies")
      .update({ is_demo: true, seeded_at: seededAt, seed_version: SEED_VERSION })
      .eq("id", companyId);
    if (markErr) throw new Error(`mark seeded: ${markErr.message}`);

    return {
      deals: inserted.deals.length,
      contacts: inserted.contacts.length,
      crmCompanies: inserted.crmCompanies.length,
      tasks: inserted.tasks.length,
      fundingSources: inserted.lenders.length,
      pipelineId: pipeline.id as string,
      seededAt,
      seedVersion: SEED_VERSION,
    };
  } catch (err) {
    console.error("[seedDemoCompanyData] error, rolling back", err);
    await rollback();
    throw err;
  }
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