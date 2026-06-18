// Canonical demo workspace provisioning service.
// Used by both `create-demo-access` (first-time create) and
// `repair-demo-tenant` (backfill / repair). One implementation, one seed
// template, one validator, one set of targets. Top-up based so reruns
// repair missing data without ever creating duplicates.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { seedDemoInbox } from "./seedDemoInbox.ts";

export const SEED_VERSION = "1.2.0";

export const DEMO_TARGETS = {
  deals: 12,
  contacts: 100,
  crmCompanies: 50,
  tasks: 20,
  fundingSources: 50,
  calendarEvents: 80, // per member user — spans roughly -30 .. +60 days
  inboxEmails: 15,    // per member user
  dealActivities: 24, // total across demo deals
} as const;

export type DemoCounts = Record<keyof typeof DEMO_TARGETS, number>;
export const REPAIRABLE_SEED_GAP_KEYS = new Set<keyof typeof DEMO_TARGETS>([
  "calendarEvents", "inboxEmails", "dealActivities",
]);

export function splitMissingCounts(missing: Partial<DemoCounts>) {
  const fatalMissing: Partial<DemoCounts> = {};
  const repairableMissing: Partial<DemoCounts> = {};
  for (const k of Object.keys(missing) as Array<keyof typeof DEMO_TARGETS>) {
    if (REPAIRABLE_SEED_GAP_KEYS.has(k)) repairableMissing[k] = missing[k];
    else fatalMissing[k] = missing[k];
  }
  return { fatalMissing, repairableMissing };
}

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
  warnings: string[];
  canOpenWorkspace: boolean;
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
const MEETING_TEMPLATES = [
  { title: "Intro call — {company}", duration: 30, type: "intro" },
  { title: "Management call — {company}", duration: 60, type: "mgmt" },
  { title: "Diligence review — {company}", duration: 45, type: "diligence" },
  { title: "Lender call — {company} x {lender}", duration: 30, type: "lender" },
  { title: "IC prep — {company}", duration: 45, type: "ic" },
  { title: "Pipeline check-in", duration: 30, type: "internal" },
  { title: "Closing call — {company}", duration: 60, type: "closing" },
  { title: "Term sheet walkthrough — {company}", duration: 45, type: "termsheet" },
  { title: "Weekly client sync — {company}", duration: 30, type: "weekly" },
  { title: "Post-mortem — {company}", duration: 30, type: "postmortem" },
];
const EMAIL_TEMPLATES = [
  { subject: "Intro — {company}", body: "Wanted to introduce our team and walk through the opportunity at {company}. Can we find time this week for an intro call?", from: "contact" },
  { subject: "Re: {company} — diligence checklist", body: "Attached is the diligence checklist for {company}. Let me know what's still outstanding so we can keep things moving.", from: "user" },
  { subject: "{company} — financials follow-up", body: "Following up on the most recent financials package for {company}. We need TTM EBITDA reconciled before we send to lenders.", from: "contact" },
  { subject: "Lender outreach — {company}", body: "Reaching out re: {company}. Initial reaction from {lender} was positive; they'd like to see the CIM and a model.", from: "lender" },
  { subject: "Re: term sheet — {company}", body: "Attached is the redlined term sheet for {company}. Key change is the pricing grid; happy to jump on a call to walk through.", from: "lender" },
  { subject: "CIM ready — {company}", body: "CIM for {company} is final. Sending out to the lender list this morning.", from: "user" },
  { subject: "IC prep — {company}", body: "Here's the IC memo for {company} ahead of Thursday. Please flag any open items by EOD.", from: "user" },
  { subject: "Re: {company} closing logistics", body: "Confirming closing date for {company}. We'll need signature blocks finalized by Friday.", from: "contact" },
  { subject: "Weekly update — {company}", body: "Quick weekly update on {company}: diligence on track, two lenders in committee, targeting close end of month.", from: "user" },
  { subject: "Pass — {company}", body: "Unfortunately {lender} is going to pass on {company} — wrong industry fit. Will keep them in mind for the next one.", from: "lender" },
];

const DEMO_DEFAULT_CHECKLIST_CONFIG = {
  version: 2,
  configs: ["Growth Capital", "ABL", "CapEx", "Refinancing", "Acquisition", "Working Capital", "Recapitalization", "Bridge Loan", "Senior Debt"].map((dealType, idx) => ({
    id: `demo-${dealType.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    dealTypeMatchString: dealType,
    rounds: [
      {
        id: `demo-${idx}-initial`,
        title: "Initial Items",
        order: 0,
        items: [
          { id: `demo-${idx}-initial-1`, label: "Pitch Deck", order: 0, required: true },
          { id: `demo-${idx}-initial-2`, label: "Financial Model", order: 1, required: true },
          { id: `demo-${idx}-initial-3`, label: "Monthly YTD P&L, BS & Cash Flow", order: 2, required: true },
          { id: `demo-${idx}-initial-4`, label: "Audited Financials 2024", order: 3, required: false },
        ],
      },
      {
        id: `demo-${idx}-kickoff`,
        title: "Kick Off",
        order: 1,
        items: [
          { id: `demo-${idx}-kickoff-1`, label: "Detailed Cap Table", order: 0, required: false },
          { id: `demo-${idx}-kickoff-2`, label: "Customer Contracts", order: 1, required: false },
          { id: `demo-${idx}-kickoff-3`, label: "AR Aging Report", order: 2, required: false },
          { id: `demo-${idx}-kickoff-4`, label: "Bank Statements", order: 3, required: false },
        ],
      },
    ],
  })),
};

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

// Comms tables (calendar_events, email_cache, activity_logs) have no `tags`
// column. We mark seeded rows with a stable prefix on the natural-key id and
// count by prefix. This keeps the seed idempotent without schema changes.
const DEMO_CAL_PREFIX = "demo-seed-cal-";
const DEMO_GMAIL_PREFIX = "demo-seed-msg-";
const DEMO_ACTIVITY_PREFIX = "demo-seed-act-";

async function countCalendarSeed(admin: Admin, userId: string): Promise<number> {
  const { count } = await admin
    .from("calendar_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .like("event_id", `${DEMO_CAL_PREFIX}%`);
  return count ?? 0;
}
async function countEmailSeed(admin: Admin, userId: string): Promise<number> {
  const { count } = await admin
    .from("email_cache")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .like("gmail_message_id", `${DEMO_GMAIL_PREFIX}%`);
  return count ?? 0;
}
async function countActivitySeed(admin: Admin, dealIds: string[]): Promise<number> {
  if (dealIds.length === 0) return 0;
  const { count } = await admin
    .from("activity_logs")
    .select("id", { count: "exact", head: true })
    .in("deal_id", dealIds)
    .like("message_id", `${DEMO_ACTIVITY_PREFIX}%`);
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

  // 2a) Resolve the attributing user's display name for deal manager attribution
  // so the manager field references a REAL demo user, not a hardcoded string.
  let managerName = "Demo User";
  try {
    const { data: prof } = await admin
      .from("profiles")
      .select("display_name, first_name, last_name, email")
      .eq("user_id", attributingUserId)
      .maybeSingle();
    if (prof) {
      const dn = (prof as any).display_name as string | null;
      const fn = (prof as any).first_name as string | null;
      const ln = (prof as any).last_name as string | null;
      const em = (prof as any).email as string | null;
      managerName = (dn?.trim() || [fn, ln].filter(Boolean).join(" ").trim() || em || "Demo User");
    }
  } catch (_e) { /* fallback to default */ }

  // 2b) Pre-seed Data Room checklist categories for this company so the
  // Data Room tab renders folders / categories immediately on first open
  // (the client hook seeds these lazily, but in fresh demo workspaces the
  // first render can hit an empty state that the VDR view assumes is
  // present — pre-seeding makes the experience consistent for every
  // demo workspace from the very first click).
  try {
    const { count: catCount } = await admin
      .from("data_room_checklist_categories")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);
    if ((catCount ?? 0) === 0) {
      const defaults = [
        { name: "Materials",  icon: "folder",       color: "blue",   position: 0 },
        { name: "Financials", icon: "dollar-sign",  color: "green",  position: 1 },
        { name: "Agreements", icon: "file-check",   color: "purple", position: 2 },
        { name: "Other",      icon: "files",        color: "gray",   position: 3 },
      ];
      const { error: catErr } = await admin
        .from("data_room_checklist_categories")
        .insert(defaults.map(d => ({
          ...d,
          company_id: companyId,
          user_id: attributingUserId,
        })));
      if (catErr) console.warn("[provisionDemoWorkspace] checklist categories seed failed:", catErr.message);
    }
  } catch (e) {
    console.warn("[provisionDemoWorkspace] checklist categories seed errored:", (e as Error).message);
  }

  // 2c) Repair legacy demo checklist config shape. Older demo workspaces stored
  // an array of folder sections, which lacks `dealTypeMatchString` and can break
  // the Data Room matcher. Always force demo workspaces to the current v2 shape.
  try {
    const { error: settingsErr } = await admin
      .from("company_settings")
      .upsert(
        { company_id: companyId, data_room_default_checklists: DEMO_DEFAULT_CHECKLIST_CONFIG },
        { onConflict: "company_id" },
      );
    if (settingsErr) {
      console.warn("[provisionDemoWorkspace] default checklist config repair failed:", settingsErr.message);
      warnings.push(`default_checklists:${settingsErr.message}`);
    }
  } catch (e) {
    console.warn("[provisionDemoWorkspace] default checklist config repair errored:", (e as Error).message);
    warnings.push(`default_checklists:${(e as Error).message}`);
  }

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
    calendarEvents: 0, inboxEmails: 0, dealActivities: 0,
  };
  const warnings: string[] = [];

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

  // 5b) Pre-fetch demo contacts so tasks + contact_deals can reference them
  // by FK. Grouped by crm_company_id for relational consistency.
  // First, ensure every demo CRM company has at least one contact so the
  // Companies page never shows orphan rows. This is a top-up that only
  // inserts contacts for companies currently missing them.
  try {
    const { data: emptyCos } = await admin
      .from("crm_companies")
      .select("id, name, domain")
      .eq("org_company_id", companyId)
      .contains("tags", ["demo"]);
    const { data: usedCrm } = await admin
      .from("contacts")
      .select("crm_company_id")
      .eq("org_company_id", companyId)
      .contains("tags", ["demo"])
      .not("crm_company_id", "is", null);
    const used = new Set((usedCrm ?? []).map((r: any) => r.crm_company_id));
    const needsContacts = (emptyCos ?? []).filter((c: any) => !used.has(c.id));
    if (needsContacts.length > 0) {
      const titlePool = ["CFO","CEO","COO","VP Finance","Treasurer","Controller","Head of Strategy","Director of Finance"];
      const rows: Array<Record<string, unknown>> = [];
      needsContacts.forEach((co: any, idx: number) => {
        for (let k = 0; k < 2; k++) {
          const first = pick(FIRST_NAMES, idx * 2 + k);
          const last = pick(LAST_NAMES, idx * 2 + k + 5);
          rows.push({
            first_name: first, last_name: last,
            email: `${first.toLowerCase()}.${last.toLowerCase()}${idx * 2 + k}@${co.domain ?? "example.com"}`,
            phone_work: `+1 (${200 + rand(idx + k, 700)}) ${100 + rand(idx + 1, 900)}-${1000 + rand(idx + k + 2, 9000)}`,
            job_title: pick(titlePool, idx + k),
            seniority: k === 0 ? "c_level" : "vp",
            lifecycle_stage: "lead", status: "active",
            owner_user_id: attributingUserId,
            crm_company_id: co.id,
            company_id: companyId, org_company_id: companyId,
            created_by: attributingUserId, tags: ["demo"],
            description: `Finance contact at ${co.name ?? "client"}.`,
            linkedin_url: `https://linkedin.com/in/demo-${idx}-${k}`,
          });
        }
      });
      const { error: fillErr } = await admin.from("contacts").insert(rows);
      if (fillErr) console.warn(`[provisionDemoWorkspace] empty-company contact fill warning: ${fillErr.message}`);
    }
  } catch (e) {
    console.warn(`[provisionDemoWorkspace] empty-company contact fill errored: ${(e as Error).message}`);
  }

  const { data: preContactsRaw } = await admin
    .from("contacts")
    .select("id, crm_company_id")
    .eq("org_company_id", companyId)
    .contains("tags", ["demo"]);
  const preContacts = (preContactsRaw ?? []) as Array<{ id: string; crm_company_id: string | null }>;
  const contactsByCrm = new Map<string, string[]>();
  for (const c of preContacts) {
    if (!c.crm_company_id) continue;
    const arr = contactsByCrm.get(c.crm_company_id) ?? [];
    arr.push(c.id);
    contactsByCrm.set(c.crm_company_id, arr);
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
        manager: managerName,
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
    .from("deals").select("id, company, crm_company_id").eq("company_id", companyId)
    .contains("tags", ["demo"]).order("created_at", { ascending: true });
  const demoDeals = (dealList ?? []) as Array<{ id: string; company: string | null; crm_company_id: string | null }>;
  const dealIds = demoDeals.map((d) => d.id);

  // 6b) Relational backfill — ensure existing demo deals reference the
  // current demo manager/owner (idempotent; safe to re-run).
  if (dealIds.length > 0) {
    await admin
      .from("deals")
      .update({ manager: managerName, user_id: attributingUserId })
      .in("id", dealIds)
      .or(`manager.is.null,manager.eq.James Turner`);
  }

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
      const deal = demoDeals[i % Math.max(demoDeals.length, 1)] ?? null;
      const crmId = deal?.crm_company_id ?? null;
      const contactPool = crmId ? (contactsByCrm.get(crmId) ?? []) : [];
      const contactId = contactPool[i % Math.max(contactPool.length, 1)] ?? null;
      rows.push({
        title, description: `${title} — auto-seeded demo task.`,
        due_date: inDays((i % 14) - 3),
        status: pick(["pending","in_progress","pending","completed"], i),
        priority: i % 5 === 0 ? "urgent" : null,
        task_type: "task",
        deal_id: deal?.id ?? null,
        crm_company_id: crmId,
        contact_id: contactId,
        assigned_to: attributingUserId, assigned_by: attributingUserId, created_by: attributingUserId,
        company_id: companyId, tags: ["demo"], position: i,
      });
    }
    const { error } = await admin.from("tasks").insert(rows);
    if (error) throw new Error(`tasks top-up: ${error.message}`);
    insertedThisRun.tasks = rows.length;
  }

  // 7b) Link contacts <-> deals via the contact_deals join table so
  // navigating from a deal lists its contacts and vice versa.
  if (demoDeals.length > 0 && contactsByCrm.size > 0) {
    const links: Array<{ deal_id: string; contact_id: string; role: string }> = [];
    for (const d of demoDeals) {
      if (!d.crm_company_id) continue;
      const pool = contactsByCrm.get(d.crm_company_id) ?? [];
      const take = pool.slice(0, 3);
      take.forEach((cid, idx) => {
        links.push({ deal_id: d.id, contact_id: cid, role: idx === 0 ? "primary" : "stakeholder" });
      });
    }
    if (links.length > 0) {
      const { error } = await admin
        .from("contact_deals")
        .upsert(links, { onConflict: "contact_id,deal_id", ignoreDuplicates: true });
      if (error) {
        console.warn(`[provisionDemoWorkspace] contact_deals link warning: ${error.message}`);
        warnings.push(`contact_deals:${error.message}`);
      }
    }
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

  // 9) Re-fetch contacts + lenders so comms rows can reference seeded entities.
  const [{ data: contactList }, { data: lenderList }] = await Promise.all([
    admin.from("contacts").select("id, first_name, last_name, email, crm_company_id")
      .eq("org_company_id", companyId).contains("tags", ["demo"]).limit(200),
    admin.from("master_lenders").select("id, name, contact_name, email")
      .eq("company_id", companyId).contains("tags", ["demo"]).limit(60),
  ]);
  const demoContacts = (contactList ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null; crm_company_id: string | null }>;
  const demoLenders = (lenderList ?? []) as Array<{ id: string; name: string | null; contact_name: string | null; email: string | null }>;

  // 8b) Top-up per-deal funding source associations (deal_lenders).
  // Every demo deal must have a spread of funding sources across stages and
  // tracking statuses so the deal view + funding-source view both look real.
  if (dealIds.length > 0 && demoLenders.length > 0) {
    const { data: existingDl } = await admin
      .from("deal_lenders")
      .select("deal_id, master_lender_id")
      .in("deal_id", dealIds)
      .contains("tags", ["demo"]);
    const seededDealIds = new Set((existingDl ?? []).map((r: { deal_id: string }) => r.deal_id));
    const existingPairs = new Set(
      (existingDl ?? [])
        .filter((r: { master_lender_id: string | null }) => !!r.master_lender_id)
        .map((r: { deal_id: string; master_lender_id: string | null }) => `${r.deal_id}:${r.master_lender_id}`),
    );
    const dealsNeedingLenders = demoDeals.filter((d) => !seededDealIds.has(d.id));

    // Per-deal lender plan: a variety of stages + statuses with internally
    // consistent amounts (quote_amount only on Terms Issued / Approved / Funded).
    const LENDER_PLAN: Array<{
      stage: string;
      tracking_status: "active" | "on-hold" | "on-deck" | "passed" | "excluded";
      hasQuote: boolean;
      hasSubmitted: boolean;
      hasApproved?: boolean;
      hasDeclined?: boolean;
    }> = [
      { stage: "Initial Outreach", tracking_status: "active",   hasQuote: false, hasSubmitted: false },
      { stage: "Sent DRL",         tracking_status: "on-deck",  hasQuote: false, hasSubmitted: true  },
      { stage: "In Review",        tracking_status: "active",   hasQuote: false, hasSubmitted: true  },
      { stage: "Terms Issued",     tracking_status: "active",   hasQuote: true,  hasSubmitted: true  },
      { stage: "Approved",         tracking_status: "active",   hasQuote: true,  hasSubmitted: true, hasApproved: true },
      { stage: "Funded",           tracking_status: "active",   hasQuote: true,  hasSubmitted: true, hasApproved: true },
      { stage: "Passed",           tracking_status: "passed",   hasQuote: false, hasSubmitted: true, hasDeclined: true },
      { stage: "On Hold",          tracking_status: "on-hold",  hasQuote: false, hasSubmitted: false },
    ];
    const PASS_REASONS = [
      "Outside credit box","Industry not a fit","Leverage too high","Customer concentration",
      "Sponsor required","Not enough EBITDA","Pricing too tight","Wrong geo",
    ];

    const rows: Array<Record<string, unknown>> = [];
    let lenderCursor = 0;
    const nowMs = Date.now();

    dealsNeedingLenders.forEach((deal, dIdx) => {
      // 6 lenders per deal spanning the pipeline; offset start so different
      // deals show different mixes (e.g. one deal heavy on Passed, one
      // heavy on Terms Issued / Funded).
      const start = dIdx % LENDER_PLAN.length;
      const count = 6;
      for (let j = 0; j < count; j++) {
        const plan = LENDER_PLAN[(start + j) % LENDER_PLAN.length];
        // Pick the next demo lender that isn't already attached to this deal,
        // so the new (deal_id, master_lender_id) unique index never trips.
        let lender = demoLenders[lenderCursor % demoLenders.length];
        let safety = 0;
        while (
          lender?.id &&
          existingPairs.has(`${deal.id}:${lender.id}`) &&
          safety < demoLenders.length
        ) {
          lenderCursor++;
          lender = demoLenders[lenderCursor % demoLenders.length];
          safety++;
        }
        lenderCursor++;
        if (lender?.id) existingPairs.add(`${deal.id}:${lender.id}`);
        const seed = dIdx * 17 + j * 5;
        const quoteAmount = plan.hasQuote
          ? 2_000_000 + rand(seed, 18_000_000)
          : null;
        const quoteRate = plan.hasQuote
          ? Number((7 + rand(seed + 1, 600) / 100).toFixed(2))
          : null;
        const quoteTerm = plan.hasQuote
          ? pick(["3 yr","5 yr","7 yr","5 yr (amort)"], seed)
          : null;
        const daysAgo = (n: number) => new Date(nowMs - n * 86_400_000).toISOString();
        const submittedAt = plan.hasSubmitted ? daysAgo(20 + (seed % 30)) : null;
        const approvedAt  = plan.hasApproved  ? daysAgo(5 + (seed % 10))  : null;
        const declinedAt  = plan.hasDeclined  ? daysAgo(3 + (seed % 14))  : null;
        const onHoldAt    = plan.tracking_status === "on-hold" ? daysAgo(7 + (seed % 10)) : null;
        const onDeckAt    = plan.tracking_status === "on-deck" ? daysAgo(2 + (seed % 6))  : null;
        const lastContactAt = daysAgo(1 + (seed % 12));
        rows.push({
          deal_id: deal.id,
          name: lender?.name ?? `Demo Funding Source ${j + 1}`,
          master_lender_id: lender?.id ?? null,
          stage: plan.stage,
          tracking_status: plan.tracking_status,
          quote_amount: quoteAmount,
          quote_rate: quoteRate,
          quote_term: quoteTerm,
          score: 50 + rand(seed + 3, 50),
          tags: ["demo"],
          notes: plan.tracking_status === "passed"
            ? `Pass — ${pick(PASS_REASONS, seed)}.`
            : `${plan.stage} — seeded demo lender activity.`,
          pass_reason: plan.tracking_status === "passed" ? pick(PASS_REASONS, seed) : null,
          submitted_at: submittedAt,
          approved_at: approvedAt,
          declined_at: declinedAt,
          passed_at: plan.tracking_status === "passed" ? declinedAt : null,
          on_hold_at: onHoldAt,
          on_deck_at: onDeckAt,
          last_contact_at: lastContactAt,
          last_status_change_at: lastContactAt,
        });
      }
    });

    if (rows.length > 0) {
      // Use upsert on the new (deal_id, master_lender_id) unique index so
      // re-running provisioning is always idempotent for demo funding sources.
      const { error } = await admin
        .from("deal_lenders")
        .upsert(rows, { onConflict: "deal_id,master_lender_id", ignoreDuplicates: true });
      if (error) {
        console.warn(`[provisionDemoWorkspace] deal_lenders top-up warning: ${error.message}`);
        warnings.push(`deal_lenders:${error.message}`);
      }
    }
  }

  // 10) Seed calendar events + inbox emails per member user.
  const now = Date.now();
  for (const uid of memberUserIds) {
    // calendar — upsert the stable demo keys so repair can fill holes without duplicates.
    const haveCal = await countCalendarSeed(admin, uid);
    if (haveCal < DEMO_TARGETS.calendarEvents) {
      const rows = [];
      for (let i = 0; i < DEMO_TARGETS.calendarEvents; i++) {
        const tpl = MEETING_TEMPLATES[i % MEETING_TEMPLATES.length];
        const deal = demoDeals[i % Math.max(demoDeals.length, 1)];
        const companyName = deal?.company ?? "Demo Co";
        const lender = demoLenders[i % Math.max(demoLenders.length, 1)];
        const contact = demoContacts[i % Math.max(demoContacts.length, 1)];
        // Spread events across roughly -30 .. +60 days from now so the
        // calendar feels populated for past month + next two months.
        const offsetDays = -30 + Math.floor((i / DEMO_TARGETS.calendarEvents) * 90);
        const startBase = new Date(now + offsetDays * 86_400_000);
        // Skip weekends — bump Sat/Sun forward to Monday.
        const dow = startBase.getDay();
        if (dow === 0) startBase.setDate(startBase.getDate() + 1);
        if (dow === 6) startBase.setDate(startBase.getDate() + 2);
        startBase.setHours(9 + (i % 8), (i % 2) * 30, 0, 0);
        const start = startBase;
        const end = new Date(start.getTime() + tpl.duration * 60_000);
        const attendees: string[] = [];
        if (contact?.email) attendees.push(contact.email);
        if (tpl.type === "lender" && lender?.email) attendees.push(lender.email);
        const title = tpl.title
          .replace("{company}", companyName)
          .replace("{lender}", lender?.name ?? "Lender");
        rows.push({
          user_id: uid,
          provider: "demo",
          event_id: `${DEMO_CAL_PREFIX}${uid}-${i}`,
          title,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          organizer_email: contact?.email ?? null,
          attendees,
          location: tpl.type === "internal" ? "naitive HQ" : "Google Meet",
          meeting_url: `https://meet.example.com/demo-${i}`,
          is_all_day: false, is_cancelled: false,
          raw: { demo: true, deal_id: deal?.id, crm_company_id: deal?.crm_company_id, kind: tpl.type },
        });
      }
      if (rows.length) {
        const { error } = await admin
          .from("calendar_events")
          .upsert(rows, { onConflict: "user_id,provider,event_id" });
        if (error) {
          console.warn(`[provisionDemoWorkspace] calendar_events insert warning for user ${uid}: ${error.message}`);
          warnings.push(`calendar_events:${uid}:${error.message}`);
        } else {
          const afterCal = await countCalendarSeed(admin, uid);
          insertedThisRun.calendarEvents += Math.max(0, afterCal - haveCal);
        }
      }
    }

    // inbox emails (email_cache) — upsert stable Gmail ids for idempotent repair.
    const haveMail = await countEmailSeed(admin, uid);
    if (haveMail < DEMO_TARGETS.inboxEmails) {
      const rows = [];
      for (let i = 0; i < DEMO_TARGETS.inboxEmails; i++) {
        const tpl = EMAIL_TEMPLATES[i % EMAIL_TEMPLATES.length];
        const deal = demoDeals[i % Math.max(demoDeals.length, 1)];
        const companyName = deal?.company ?? "Demo Co";
        const contact = demoContacts[i % Math.max(demoContacts.length, 1)];
        const lender = demoLenders[i % Math.max(demoLenders.length, 1)];
        const senderContact = tpl.from === "lender"
          ? { name: lender?.contact_name ?? lender?.name ?? "Lender", email: lender?.email ?? "lender@example.com" }
          : tpl.from === "user"
            ? { name: "Me", email: "me@naitive.example" }
            : { name: `${contact?.first_name ?? "Client"} ${contact?.last_name ?? ""}`.trim(), email: contact?.email ?? "client@example.com" };
        const subject = tpl.subject.replace("{company}", companyName).replace("{lender}", lender?.name ?? "Lender");
        const body = tpl.body.replace("{company}", companyName).replace("{lender}", lender?.name ?? "Lender");
        const receivedAt = new Date(now - (i + 1) * 3_600_000 * 6).toISOString();
        rows.push({
          user_id: uid,
          gmail_message_id: `${DEMO_GMAIL_PREFIX}${uid}-${i}`,
          thread_id: `${DEMO_GMAIL_PREFIX}thread-${uid}-${Math.floor(i / 2)}`,
          subject, snippet: body.slice(0, 120), body_text: body, body_html: `<p>${body}</p>`,
          from_email: senderContact.email, from_name: senderContact.name,
          to_emails: ["me@naitive.example"], cc_emails: [],
          labels: ["INBOX", "DEMO"],
          is_read: i % 3 !== 0, is_starred: i % 5 === 0,
          received_at: receivedAt,
          provider: "demo",
          attachments: [], inline_attachments: [],
        });
      }
      if (rows.length) {
        const { error } = await admin
          .from("email_cache")
          .upsert(rows, { onConflict: "user_id,gmail_message_id" });
        if (error) {
          console.warn(`[provisionDemoWorkspace] email_cache insert warning for user ${uid}: ${error.message}`);
          warnings.push(`email_cache:${uid}:${error.message}`);
        } else {
          const afterMail = await countEmailSeed(admin, uid);
          insertedThisRun.inboxEmails += Math.max(0, afterMail - haveMail);
        }
      }
    }
  }

  // 11) Seed deal activity logs (email-style activity per demo deal).
  if (dealIds.length > 0) {
    const haveAct = await countActivitySeed(admin, dealIds);
    if (haveAct < DEMO_TARGETS.dealActivities) {
      const rows = [];
      for (let i = haveAct; i < DEMO_TARGETS.dealActivities; i++) {
        const tpl = EMAIL_TEMPLATES[i % EMAIL_TEMPLATES.length];
        const deal = demoDeals[i % demoDeals.length];
        const companyName = deal.company ?? "Demo Co";
        const contact = demoContacts[i % Math.max(demoContacts.length, 1)];
        const lender = demoLenders[i % Math.max(demoLenders.length, 1)];
        const direction: "inbound" | "outbound" = tpl.from === "user" ? "outbound" : "inbound";
        const subject = tpl.subject.replace("{company}", companyName).replace("{lender}", lender?.name ?? "Lender");
        const body = tpl.body.replace("{company}", companyName).replace("{lender}", lender?.name ?? "Lender");
        const sentAt = new Date(now - (i + 1) * 86_400_000).toISOString();
        const fromAddr = direction === "outbound" ? "me@naitive.example" : (contact?.email ?? "client@example.com");
        const toAddr = direction === "outbound" ? (contact?.email ?? "client@example.com") : "me@naitive.example";
        rows.push({
          deal_id: deal.id,
          user_id: attributingUserId,
          activity_type: "email",
          description: `Email ${direction}: ${subject}`,
          metadata: { demo: true, kind: "email" },
          user_display_name: "Demo User",
          direction, subject, body,
          from_address: fromAddr, to_addresses: [toAddr],
          sent_at: sentAt,
          message_id: `${DEMO_ACTIVITY_PREFIX}${deal.id}-${i}`,
          thread_id: `${DEMO_ACTIVITY_PREFIX}thread-${deal.id}-${Math.floor(i / 3)}`,
          provider: "demo",
          created_at: sentAt,
        });
      }
      if (rows.length) {
        const { error } = await admin.from("activity_logs").insert(rows);
        if (error) {
          console.warn(`[provisionDemoWorkspace] activity_logs insert warning: ${error.message}`);
          warnings.push(`activity_logs:${error.message}`);
        } else {
          insertedThisRun.dealActivities = rows.length;
        }
      }
    }
  }

  // 12) Validate counts. Comms gaps are nonfatal (warning); core gaps + pipeline are fatal.
  const validation = await validateDemoSeed(admin, companyId);

  const { fatalMissing, repairableMissing } = splitMissingCounts(validation.missing);
  const hasFatalGap = Object.keys(fatalMissing).length > 0 || !validation.pipelineId;
  const canOpenWorkspace = !hasFatalGap;

  const seededAt = new Date().toISOString();
  await admin.from("companies").update({
    is_demo: true,
    seeded_at: canOpenWorkspace ? seededAt : null,
    seed_version: canOpenWorkspace ? SEED_VERSION : null,
  }).eq("id", companyId);

  console.log("[provisionDemoWorkspace] complete", {
    companyId,
    insertedThisRun,
    missing: validation.missing,
    repairableMissing,
    fatalMissing,
    warnings,
    canOpenWorkspace,
  });

  if (hasFatalGap) {
    // Surface a structured fatal so the caller can return a clean error.
    const err = new Error(
      `Demo provisioning fatal gap. Missing: ${JSON.stringify(fatalMissing)}${!validation.pipelineId ? " (no default pipeline)" : ""}`,
    );
    (err as Error & { fatalMissing?: unknown; warnings?: string[] }).fatalMissing = fatalMissing;
    (err as Error & { fatalMissing?: unknown; warnings?: string[] }).warnings = warnings;
    throw err;
  }

  // Seed a fake inbox for every member of this demo workspace so the Mail
  // experience is usable immediately, without any real OAuth connection.
  try {
    const { data: contactRows } = await admin
      .from("contacts")
      .select("id, first_name, last_name, email, job_title")
      .eq("org_company_id", companyId)
      .limit(8);
    const { data: dealRows } = await admin
      .from("deals")
      .select("id, company, stage")
      .eq("company_id", companyId)
      .limit(5);
    const dealIds = (dealRows ?? []).map((d) => d.id);
    const { data: lenderRows } = dealIds.length
      ? await admin
          .from("deal_lenders")
          .select("id, deal_id, name")
          .in("deal_id", dealIds)
          .limit(5)
      : { data: [] as Array<{ id: string; deal_id: string; name: string }> };
    const { data: taskRows } = await admin
      .from("tasks")
      .select("id, title, deal_id")
      .eq("company_id", companyId)
      .limit(3);

    for (const memberId of memberUserIds) {
      const { data: prof } = await admin
        .from("profiles")
        .select("email, first_name, last_name, display_name")
        .eq("user_id", memberId)
        .maybeSingle();
      const email = prof?.email;
      if (!email) continue;
      const display = prof?.display_name || [prof?.first_name, prof?.last_name].filter(Boolean).join(" ") || "Demo User";
      await seedDemoInbox({
        admin,
        userId: memberId,
        userEmail: email,
        userDisplayName: display,
        companyId,
        contacts: contactRows ?? [],
        deals: dealRows ?? [],
        lenders: lenderRows ?? [],
        tasks: taskRows ?? [],
        calendarEvents: [],
      });
    }
  } catch (e) {
    console.error("[provisionDemoWorkspace] inbox seed failed:", e);
    warnings.push(`inbox seed failed: ${(e as Error).message}`);
  }

  // Seed a realistic Data Room per demo deal so the Data Room tab is not empty.
  // Non-fatal: any failure is logged and surfaced as a warning, never thrown.
  try {
    const { data: allDealsForVdr } = await admin
      .from("deals")
      .select("id, company")
      .eq("company_id", companyId);
    const uploadedBy = memberUserIds[0] ?? null;
    const seededVdr = await seedDemoDataRoom(admin, {
      companyId,
      uploadedBy,
      deals: allDealsForVdr ?? [],
    });
    console.log(`[provisionDemoWorkspace] data room seeded: ${seededVdr} document rows`);
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[provisionDemoWorkspace] data room seed failed:", msg);
    warnings.push(`vdr seed failed: ${msg}`);
  }

  return {
    ...validation,
    companyId,
    seededAt,
    seedVersion: SEED_VERSION,
    insertedThisRun,
    flagsApplied: { company: true, profiles: memberUserIds.length },
    warnings,
    canOpenWorkspace,
  };
}

// Shared validator — used post-provision and by the admin demo-metrics tool.
export async function validateDemoSeed(
  admin: Admin,
  companyId: string,
): Promise<DemoValidation> {
  const [deals, contacts, crmCompanies, tasks, fundingSources, pipe, members] = await Promise.all([
    countDemo(admin, "deals", { company_id: companyId }),
    countDemo(admin, "contacts", { org_company_id: companyId }),
    countDemo(admin, "crm_companies", { org_company_id: companyId }),
    countDemo(admin, "tasks", { company_id: companyId }),
    countDemo(admin, "master_lenders", { company_id: companyId }),
    admin.from("deal_pipelines").select("id").eq("company_id", companyId).eq("is_default", true).maybeSingle(),
    admin.from("company_members").select("user_id").eq("company_id", companyId),
  ]);
  const memberIds = ((members.data ?? []) as Array<{ user_id: string }>).map((m) => m.user_id).filter(Boolean);
  const { data: dealsForActivity } = await admin
    .from("deals").select("id").eq("company_id", companyId).contains("tags", ["demo"]);
  const demoDealIds = ((dealsForActivity ?? []) as Array<{ id: string }>).map((d) => d.id);

  // Comms counts are aggregated across all member users; treat as ok when
  // every member meets the per-user target (or if there are no members yet).
  let calendarEvents = 0;
  let inboxEmails = 0;
  let calOk = true;
  let mailOk = true;
  for (const uid of memberIds) {
    const c = await countCalendarSeed(admin, uid);
    const m = await countEmailSeed(admin, uid);
    calendarEvents += c;
    inboxEmails += m;
    if (c < DEMO_TARGETS.calendarEvents) calOk = false;
    if (m < DEMO_TARGETS.inboxEmails) mailOk = false;
  }
  if (memberIds.length === 0) { calOk = false; mailOk = false; }
  const dealActivities = await countActivitySeed(admin, demoDealIds);

  const counts: DemoCounts = {
    deals, contacts, crmCompanies, tasks, fundingSources,
    calendarEvents, inboxEmails, dealActivities,
  };
  const missing: Partial<DemoCounts> = {};
  (Object.keys(DEMO_TARGETS) as Array<keyof typeof DEMO_TARGETS>).forEach((k) => {
    // For per-user comms targets, "missing" reflects total shortfall across members.
    if (k === "calendarEvents") {
      const target = DEMO_TARGETS.calendarEvents * Math.max(memberIds.length, 1);
      if (counts.calendarEvents < target) missing[k] = target - counts.calendarEvents;
    } else if (k === "inboxEmails") {
      const target = DEMO_TARGETS.inboxEmails * Math.max(memberIds.length, 1);
      if (counts.inboxEmails < target) missing[k] = target - counts.inboxEmails;
    } else {
      if (counts[k] < DEMO_TARGETS[k]) missing[k] = DEMO_TARGETS[k] - counts[k];
    }
  });
  void calOk; void mailOk;
  return {
    ok: Object.keys(missing).length === 0 && !!pipe.data?.id,
    targets: DEMO_TARGETS, counts, missing,
    pipelineId: (pipe.data?.id as string | undefined) ?? null,
  };
}
// ---------- Data Room seeding ----------
interface VdrSeedDeal { id: string; company?: string | null }

const DEMO_VDR_FOLDERS = [
  { name: "Financials",  icon: "financials" },
  { name: "Legal",       icon: "legal" },
  { name: "Corporate",   icon: "corporate" },
  { name: "Commercial",  icon: "commercial" },
] as const;

// Per-deal document template. ~12 docs across 4 folders.
const DEMO_VDR_TEMPLATE: Array<{
  filename: string;
  folder: typeof DEMO_VDR_FOLDERS[number]["name"];
  file_type: string;
  mime: string;
  size: number;
}> = [
  { filename: "Pitch Deck.pdf",                     folder: "Corporate",  file_type: "pdf",  mime: "application/pdf",                                                         size: 2_400_000 },
  { filename: "Articles of Incorporation.pdf",      folder: "Corporate",  file_type: "pdf",  mime: "application/pdf",                                                         size:   480_000 },
  { filename: "Cap Table.xlsx",                     folder: "Corporate",  file_type: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",       size:    96_000 },
  { filename: "Financial Model.xlsx",               folder: "Financials", file_type: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",       size: 1_200_000 },
  { filename: "Income Statement FY2025.xlsx",       folder: "Financials", file_type: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",       size:   210_000 },
  { filename: "Balance Sheet FY2025.xlsx",          folder: "Financials", file_type: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",       size:   188_000 },
  { filename: "Cash Flow Statement.xlsx",           folder: "Financials", file_type: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",       size:   174_000 },
  { filename: "Audited Financials 2024.pdf",        folder: "Financials", file_type: "pdf",  mime: "application/pdf",                                                         size: 3_100_000 },
  { filename: "AR Aging Report.xlsx",               folder: "Financials", file_type: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",       size:    72_000 },
  { filename: "Bank Statements.pdf",                folder: "Financials", file_type: "pdf",  mime: "application/pdf",                                                         size: 1_500_000 },
  { filename: "Term Sheet.pdf",                     folder: "Legal",      file_type: "pdf",  mime: "application/pdf",                                                         size:   320_000 },
  { filename: "Customer Contracts.pdf",             folder: "Commercial", file_type: "pdf",  mime: "application/pdf",                                                         size:   910_000 },
];

/**
 * Idempotent: tags every seeded row with `metadata.demo_seed = true` and a
 * stable `metadata.seed_key` of "demo-vdr-{deal_id}-{filename}". A row is
 * skipped if a matching seed_key already exists for the deal.
 */
async function seedDemoDataRoom(
  admin: Admin,
  args: { companyId: string; uploadedBy: string | null; deals: VdrSeedDeal[] },
): Promise<number> {
  const { companyId, uploadedBy, deals } = args;
  if (deals.length === 0) return 0;

  let inserted = 0;
  for (const deal of deals) {
    // What's already seeded for this deal?
    const { data: existing, error: existErr } = await admin
      .from("vdr_documents")
      .select("id, metadata")
      .eq("deal_id", deal.id)
      .eq("source", "dataroom");
    if (existErr) {
      console.warn(`[seedDemoDataRoom] read failed deal=${deal.id}: ${existErr.message}`);
      continue;
    }
    const existingKeys = new Set<string>(
      (existing ?? [])
        .map((r: any) => (r?.metadata && typeof r.metadata === "object" ? r.metadata.seed_key : null))
        .filter((k: any): k is string => typeof k === "string"),
    );

    // 1) Folder rows (one per top-level category) — idempotent.
    const folderRows = DEMO_VDR_FOLDERS.map((f, idx) => ({
      deal_id: deal.id,
      company_id: companyId,
      filename: f.name,
      file_path: null,
      file_size: 0,
      file_type: null,
      folder_path: "/",
      is_folder: true,
      source: "dataroom",
      uploaded_by: uploadedBy,
      sort_order: idx,
      ingestion_status: "complete",
      chunk_count: 0,
      entity_count: 0,
      shared_to_dataroom: true,
      dataroom_folder_path: `/${f.name}/`,
      metadata: { demo_seed: true, seed_key: `demo-vdr-folder-${deal.id}-${f.name}` },
    }));
    const newFolders = folderRows.filter(r => !existingKeys.has((r.metadata as any).seed_key));
    if (newFolders.length) {
      const { error } = await admin.from("vdr_documents").insert(newFolders);
      if (error) {
        console.warn(`[seedDemoDataRoom] folder insert failed deal=${deal.id}: ${error.message}`);
      } else {
        inserted += newFolders.length;
      }
    }

    // 2) Document rows from template.
    const nowIso = new Date().toISOString();
    const fileRows = DEMO_VDR_TEMPLATE.map((tpl, idx) => {
      const seedKey = `demo-vdr-${deal.id}-${tpl.filename}`;
      return {
        deal_id: deal.id,
        company_id: companyId,
        filename: tpl.filename,
        file_path: null, // no storage object — preview will degrade gracefully
        file_size: tpl.size,
        file_type: tpl.file_type,
        folder_path: `/${tpl.folder}/`,
        is_folder: false,
        source: "dataroom",
        uploaded_by: uploadedBy,
        sort_order: idx + 10,
        ingestion_status: "complete",
        chunk_count: 0,
        entity_count: 0,
        shared_to_dataroom: true,
        dataroom_folder_path: `/${tpl.folder}/`,
        created_at: nowIso,
        updated_at: nowIso,
        metadata: {
          demo_seed: true,
          seed_key: seedKey,
          mime_type: tpl.mime,
          provider: "demo",
          category: tpl.folder,
        },
      };
    });
    const newFiles = fileRows.filter(r => !existingKeys.has((r.metadata as any).seed_key));
    if (newFiles.length) {
      const { error } = await admin.from("vdr_documents").insert(newFiles);
      if (error) {
        console.warn(`[seedDemoDataRoom] file insert failed deal=${deal.id}: ${error.message}`);
      } else {
        inserted += newFiles.length;
      }
    }
  }
  return inserted;
}
