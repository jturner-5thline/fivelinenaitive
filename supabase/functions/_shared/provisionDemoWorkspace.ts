// Canonical demo workspace provisioning service.
// Used by both `create-demo-access` (first-time create) and
// `repair-demo-tenant` (backfill / repair). One implementation, one seed
// template, one validator, one set of targets. Top-up based so reruns
// repair missing data without ever creating duplicates.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export const SEED_VERSION = "1.1.0";

export const DEMO_TARGETS = {
  deals: 12,
  contacts: 100,
  crmCompanies: 50,
  tasks: 20,
  fundingSources: 50,
} as const;

export type DemoCounts = Record<keyof typeof DEMO_TARGETS, number>;

export interface DemoValidation {
  ok: boolean;
  targets: typeof DEMO_TARGETS;
  counts: DemoCounts;
  missing: Partial<DemoCounts>;
  pipelineId: string | null;
}

export interface ProvisionResult extends DemoValidation {
  companyId: string;
  seededAt: string;
  seedVersion: string;
  insertedThisRun: DemoCounts;
  flagsApplied: { company: boolean; profiles: number };
}

type Admin = ReturnType<typeof createClient>;

// ---------- shared static pools ----------
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
const CITIES: Array<[string, string]> = [
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
const DEAL_VALUES = [1_200_000, 2_500_000, 3_800_000, 5_000_000, 6_500_000, 8_000_000, 9_750_000, 11_250_000, 13_500_000, 15_000_000, 17_500_000, 19_800_000];
const STATUS_CYCLE = ["on-track","on-track","on-track","on-track","at-risk","at-risk","off-track","on-track","on-hold","archived","archived","on-track"];
const TASK_TITLES = [
  "Review term sheet","Send diligence checklist","Schedule intro call","Update investment memo",
  "Confirm data room access","Follow up on financials","Coordinate lender call","Draft NDA",
  "Verify EBITDA adjustments","Send client status update","Prepare lender list","Validate KPIs",
  "Walk through model","Confirm closing timeline","Review legal redline","Push update to VDR",
  "Send weekly summary","Schedule diligence meeting","Review proposed structure","Send signed engagement",
];

function pick<T>(arr: readonly T[], i: number): T { return arr[i % arr.length]; }
function rand(seed: number, max: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return Math.floor((x - Math.floor(x)) * max);
}

// ---------- count helpers ----------
async function countDemo(admin: Admin, table: string, filters: Record<string, unknown>): Promise<number> {
  let q = admin.from(table).select("id", { count: "exact", head: true });
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
  q = q.contains("tags", ["demo"]);
  const { count } = await q;
  return count ?? 0;
}

// ---------- main service ----------
export async function provisionDemoWorkspace(
  admin: Admin,
  args: { companyId: string; attributingUserId: string; memberUserIds?: string[] },
): Promise<ProvisionResult> {
  const { companyId, attributingUserId } = args;
  const memberUserIds = args.memberUserIds && args.memberUserIds.length > 0
    ? args.memberUserIds
    : [attributingUserId];

  // 1) Force canonical company flags.
  await admin
    .from("companies")
    .update({ is_demo: true })
    .eq("id", companyId);

  // 2) Force canonical profile flags for every member of this workspace.
  await admin
    .from("profiles")
    .update({
      is_demo_user: true,
      is_active: true,
      onboarding_completed: true,
      onboarding_skipped: true,
    })
    .in("user_id", memberUserIds);

  // 3) Ensure default pipeline exists.
  let { data: pipeline } = await admin
    .from("deal_pipelines")
    .select("id, stages")
    .eq("company_id", companyId)
    .eq("is_default", true)
    .maybeSingle();
  if (!pipeline) {
    const { data: newPipe, error: pipeErr } = await admin
      .from("deal_pipelines")
      .insert({ company_id: companyId, name: "Active Pipeline", stages: DEFAULT_STAGES, is_default: true, position: 0 })
      .select("id, stages")
      .single();
    if (pipeErr || !newPipe) throw new Error(`pipeline: ${pipeErr?.message ?? "insert failed"}`);
    pipeline = newPipe;
  }
  const stages = Array.isArray(pipeline.stages)
    ? (pipeline.stages as Array<{ id?: string }>)
    : DEFAULT_STAGES;
  const stageId = (idx: number) => stages[idx]?.id || stages[0]?.id || "lenders-in-review";
  const pipelineId = pipeline.id as string;

  const insertedThisRun: DemoCounts = {
    deals: 0, contacts: 0, crmCompanies: 0, tasks: 0, fundingSources: 0,
  };

  // 4) Top-up CRM companies.
  const haveCrm = await countDemo(admin, "crm_companies", { org_company_id: companyId });
  if (haveCrm < DEMO_TARGETS.crmCompanies) {
    const rows = [];
    for (let i = haveCrm; i < DEMO_TARGETS.crmCompanies; i++) {
      const prefix = pick(COMPANY_PREFIXES, i);
      const suffix = pick(COMPANY_SUFFIXES, i + 3);
      const name = `${prefix} ${suffix}`;
      const [city, state] = pick(CITIES, i);
      const industry = pick(INDUSTRIES, i);
      const domain = `${prefix.toLowerCase()}${suffix.toLowerCase()}${i}.example`;
      rows.push({
        name, domain, industry,
        employee_count: 50 + rand(i, 950),
        annual_revenue: 1_000_000 + rand(i + 7, 50_000_000),
        hq_city: city, hq_state: state, hq_country: "USA",
        website_url: `https://${domain}`,
        description: `${name} is a ${industry.toLowerCase()} company headquartered in ${city}, ${state}.`,
        phone: `+1 (${200 + rand(i, 700)}) ${100 + rand(i + 1, 900)}-${1000 + rand(i + 2, 9000)}`,
        company_type: "prospect", status: "active", lifecycle_stage: "lead",
        owner_user_id: attributingUserId, org_company_id: companyId,
        created_by: attributingUserId, tags: ["demo"],
      });
    }
    const { error } = await admin.from("crm_companies").insert(rows);
    if (error) throw new Error(`crm_companies top-up: ${error.message}`);
    insertedThisRun.crmCompanies = rows.length;
  }

  // Re-fetch full list of demo CRM companies for FK references.
  const { data: crmList } = await admin
    .from("crm_companies")
    .select("id, name, domain")
    .eq("org_company_id", companyId)
    .contains("tags", ["demo"])
    .order("created_at", { ascending: true });
  const crmCompanies = (crmList ?? []) as Array<{ id: string; name: string; domain: string }>;

  // 5) Top-up contacts.
  const haveContacts = await countDemo(admin, "contacts", { org_company_id: companyId });
  if (haveContacts < DEMO_TARGETS.contacts) {
    const rows = [];
    for (let i = haveContacts; i < DEMO_TARGETS.contacts; i++) {
      const first = pick(FIRST_NAMES, i);
      const last = pick(LAST_NAMES, i + 5);
      const crm = crmCompanies[i % Math.max(crmCompanies.length, 1)];
      const domain = crm?.domain ?? "example.com";
      rows.push({
        first_name: first, last_name: last,
        email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@${domain}`,
        phone_work: `+1 (${200 + rand(i, 700)}) ${100 + rand(i + 1, 900)}-${1000 + rand(i + 2, 9000)}`,
        job_title: pick(["CFO","CEO","COO","VP Finance","Treasurer","Controller","Head of Strategy","Director of Finance"], i),
        seniority: pick(["c_level","vp","director","manager"], i),
        lifecycle_stage: "lead", status: "active",
        owner_user_id: attributingUserId,
        crm_company_id: crm?.id ?? null,
        company_id: companyId, org_company_id: companyId,
        created_by: attributingUserId, tags: ["demo"],
        description: `Primary finance contact at ${crm?.name ?? "client"}.`,
        linkedin_url: `https://linkedin.com/in/${first.toLowerCase()}-${last.toLowerCase()}-${i}`,
      });
    }
    const { error } = await admin.from("contacts").insert(rows);
    if (error) throw new Error(`contacts top-up: ${error.message}`);
    insertedThisRun.contacts = rows.length;
  }

  // 6) Top-up deals.
  const haveDeals = await countDemo(admin, "deals", { company_id: companyId });
  if (haveDeals < DEMO_TARGETS.deals) {
    const rows = [];
    for (let i = haveDeals; i < DEMO_TARGETS.deals; i++) {
      const crm = crmCompanies[i % Math.max(crmCompanies.length, 1)];
      const status = STATUS_CYCLE[i % STATUS_CYCLE.length];
      const stageIdx = i === 9 ? 8 : i === 10 ? 9 : status === "on-hold" ? 10 : i % 8;
      rows.push({
        company: crm?.name ?? `Demo Deal ${i + 1}`,
        value: DEAL_VALUES[i % DEAL_VALUES.length],
        stage: stageId(stageIdx), status,
        deal_type: pick(DEAL_TYPES, i),
        manager: "James Turner",
        referred_by: pick(REFERRERS, i),
        company_id: companyId, user_id: attributingUserId,
        crm_company_id: crm?.id ?? null,
        pipeline_id: pipelineId,
        deal_class: "standard", tags: ["demo"],
        notes: `Seeded demo deal #${i + 1}.`,
        on_hold: status === "on-hold",
      });
    }
    const { error } = await admin.from("deals").insert(rows);
    if (error) throw new Error(`deals top-up: ${error.message}`);
    insertedThisRun.deals = rows.length;
  }

  // Re-fetch deals for task FKs.
  const { data: dealList } = await admin
    .from("deals").select("id").eq("company_id", companyId)
    .contains("tags", ["demo"]).order("created_at", { ascending: true });
  const dealIds = (dealList ?? []).map((d) => d.id as string);

  // 7) Top-up tasks.
  const haveTasks = await countDemo(admin, "tasks", { company_id: companyId });
  if (haveTasks < DEMO_TARGETS.tasks) {
    const today = new Date();
    const inDays = (n: number) => {
      const d = new Date(today); d.setDate(d.getDate() + n);
      return d.toISOString().slice(0, 10);
    };
    const rows = [];
    for (let i = haveTasks; i < DEMO_TARGETS.tasks; i++) {
      const title = TASK_TITLES[i % TASK_TITLES.length];
      rows.push({
        title, description: `${title} — auto-seeded demo task.`,
        due_date: inDays((i % 14) - 3),
        status: pick(["pending","in_progress","pending","completed"], i),
        priority: i % 5 === 0 ? "urgent" : null,
        task_type: "task",
        deal_id: dealIds[i % Math.max(dealIds.length, 1)] ?? null,
        assigned_to: attributingUserId, assigned_by: attributingUserId, created_by: attributingUserId,
        company_id: companyId, tags: ["demo"], position: i,
      });
    }
    const { error } = await admin.from("tasks").insert(rows);
    if (error) throw new Error(`tasks top-up: ${error.message}`);
    insertedThisRun.tasks = rows.length;
  }

  // 8) Top-up funding sources (master_lenders).
  const haveLenders = await countDemo(admin, "master_lenders", { company_id: companyId });
  if (haveLenders < DEMO_TARGETS.fundingSources) {
    const rows = [];
    for (let i = haveLenders; i < DEMO_TARGETS.fundingSources; i++) {
      const firstName = pick(FIRST_NAMES, i + 2);
      const lastName = pick(LAST_NAMES, i + 11);
      const orgPrefix = pick(COMPANY_PREFIXES, i + 7);
      const orgSuffix = pick(["Capital","Credit","Partners","Bank","Finance","Fund"], i);
      const name = `${orgPrefix} ${orgSuffix}`;
      const [city, state] = pick(CITIES, i + 3);
      rows.push({
        user_id: attributingUserId, company_id: companyId, name,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@${orgPrefix.toLowerCase()}${orgSuffix.toLowerCase()}.example`,
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
        website: `https://${orgPrefix.toLowerCase()}${orgSuffix.toLowerCase()}${i}.example`,
        linkedin_url: `https://linkedin.com/company/${orgPrefix.toLowerCase()}-${orgSuffix.toLowerCase()}-${i}`,
        b2b_b2c: pick(["B2B","Both"], i),
        refinancing: pick(["Yes","No"], i),
        sub_debt: pick(["Yes","No"], i),
        cash_burn: pick(["Yes","No"], i),
        sponsorship: pick(["Required","Preferred","Not Required"], i),
        tier: pick(TIERS, i),
        active: true, tags: ["demo"],
        about_notes: `${name} is a demo-seeded ${pick(LENDER_TYPES, i).toLowerCase()} based in ${city}, ${state}.`,
        funding_source_notes: `Default check size $${((20_000_000 + rand(i, 30_000_000)) / 1_000_000).toFixed(0)}MM.`,
      });
    }
    const { error } = await admin.from("master_lenders").insert(rows);
    if (error) throw new Error(`master_lenders top-up: ${error.message}`);
    insertedThisRun.fundingSources = rows.length;
  }

  // 9) Validate counts. If anything is short, mark provisioning failed.
  const validation = await validateDemoSeed(admin, companyId);

  const seededAt = new Date().toISOString();
  await admin.from("companies").update({
    is_demo: true,
    seeded_at: validation.ok ? seededAt : null,
    seed_version: validation.ok ? SEED_VERSION : null,
  }).eq("id", companyId);

  if (!validation.ok) {
    throw new Error(
      `Demo provisioning validation failed. Missing: ${JSON.stringify(validation.missing)}`,
    );
  }

  return {
    ...validation,
    companyId,
    seededAt,
    seedVersion: SEED_VERSION,
    insertedThisRun,
    flagsApplied: { company: true, profiles: memberUserIds.length },
  };
}

// Shared validator — used post-provision and by the admin demo-metrics tool.
export async function validateDemoSeed(
  admin: Admin,
  companyId: string,
): Promise<DemoValidation> {
  const [deals, contacts, crmCompanies, tasks, fundingSources, pipe] = await Promise.all([
    countDemo(admin, "deals", { company_id: companyId }),
    countDemo(admin, "contacts", { org_company_id: companyId }),
    countDemo(admin, "crm_companies", { org_company_id: companyId }),
    countDemo(admin, "tasks", { company_id: companyId }),
    countDemo(admin, "master_lenders", { company_id: companyId }),
    admin.from("deal_pipelines").select("id").eq("company_id", companyId).eq("is_default", true).maybeSingle(),
  ]);
  const counts: DemoCounts = { deals, contacts, crmCompanies, tasks, fundingSources };
  const missing: Partial<DemoCounts> = {};
  (Object.keys(DEMO_TARGETS) as Array<keyof typeof DEMO_TARGETS>).forEach((k) => {
    if (counts[k] < DEMO_TARGETS[k]) missing[k] = DEMO_TARGETS[k] - counts[k];
  });
  return {
    ok: Object.keys(missing).length === 0 && !!pipe.data?.id,
    targets: DEMO_TARGETS, counts, missing,
    pipelineId: (pipe.data?.id as string | undefined) ?? null,
  };
}