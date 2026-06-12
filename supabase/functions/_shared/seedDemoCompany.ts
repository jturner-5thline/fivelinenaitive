import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export const SEED_VERSION = "1.0.0";

export interface SeedResult {
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

function pick<T>(arr: readonly T[], i: number): T {
  return arr[i % arr.length];
}
function rand(seed: number, max: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return Math.floor((x - Math.floor(x)) * max);
}

export async function seedDemoCompanyData(
  admin: ReturnType<typeof createClient>,
  companyId: string,
  attributingUserId: string,
): Promise<SeedResult> {
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

  const inserted = {
    pipelines: [] as string[], crmCompanies: [] as string[], contacts: [] as string[],
    deals: [] as string[], tasks: [] as string[], lenders: [] as string[],
  };

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
      inserted.pipelines.push(newPipe.id as string);
    }
    const stages = Array.isArray(pipeline.stages)
      ? (pipeline.stages as Array<{ id?: string; label?: string }>)
      : DEFAULT_STAGES;
    const stageId = (idx: number) => stages[idx]?.id || stages[0]?.id || "lenders-in-review";

    const crmRows = Array.from({ length: 50 }, (_, i) => {
      const prefix = pick(COMPANY_PREFIXES, i);
      const suffix = pick(COMPANY_SUFFIXES, i + 3);
      const name = `${prefix} ${suffix}`;
      const [city, state] = pick(CITIES, i);
      const industry = pick(INDUSTRIES, i);
      const domain = `${prefix.toLowerCase()}${suffix.toLowerCase()}.example`;
      return {
        name, domain, industry,
        employee_count: 50 + rand(i, 950),
        annual_revenue: (1_000_000 + rand(i + 7, 50_000_000)),
        hq_city: city, hq_state: state, hq_country: "USA",
        website_url: `https://${domain}`,
        description: `${name} is a ${industry.toLowerCase()} company headquartered in ${city}, ${state}.`,
        phone: `+1 (${200 + rand(i, 700)}) ${100 + rand(i + 1, 900)}-${1000 + rand(i + 2, 9000)}`,
        company_type: "prospect", status: "active", lifecycle_stage: "lead",
        owner_user_id: attributingUserId,
        org_company_id: companyId,
        created_by: attributingUserId,
        tags: ["demo"],
      };
    });
    const { data: crmInserted, error: crmErr } = await admin
      .from("crm_companies").insert(crmRows).select("id, name, domain");
    if (crmErr) throw new Error(`crm_companies: ${crmErr.message}`);
    (crmInserted ?? []).forEach((c) => inserted.crmCompanies.push(c.id as string));

    const contactRows = Array.from({ length: 100 }, (_, i) => {
      const first = pick(FIRST_NAMES, i);
      const last = pick(LAST_NAMES, i + 5);
      const crm = (crmInserted ?? [])[i % Math.max(crmInserted?.length ?? 1, 1)] as
        | { id: string; name: string; domain: string } | undefined;
      const domain = crm?.domain ?? "example.com";
      return {
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
      };
    });
    const { data: contactsInserted, error: contactsErr } = await admin
      .from("contacts").insert(contactRows).select("id");
    if (contactsErr) throw new Error(`contacts: ${contactsErr.message}`);
    (contactsInserted ?? []).forEach((c) => inserted.contacts.push(c.id as string));

    const DEAL_VALUES = [1_200_000, 2_500_000, 3_800_000, 5_000_000, 6_500_000, 8_000_000, 9_750_000, 11_250_000, 13_500_000, 15_000_000, 17_500_000, 19_800_000];
    const STATUS_CYCLE = ["active","active","active","active","active","active","active","active","on_hold","closed_won","closed_lost","active"];
    const dealRows = DEAL_VALUES.map((value, i) => {
      const crm = (crmInserted ?? [])[i % Math.max(crmInserted?.length ?? 1, 1)] as
        | { id: string; name: string; domain: string } | undefined;
      const status = STATUS_CYCLE[i];
      const stageIdx = status === "closed_won" ? 8 : status === "closed_lost" ? 9 : status === "on_hold" ? 10 : i % 8;
      return {
        company: crm?.name ?? `Demo Deal ${i + 1}`,
        value, stage: stageId(stageIdx), status,
        deal_type: pick(DEAL_TYPES, i),
        manager: "James Turner",
        referred_by: pick(REFERRERS, i),
        company_id: companyId, user_id: attributingUserId,
        crm_company_id: crm?.id ?? null,
        pipeline_id: pipeline.id,
        deal_class: "standard", tags: ["demo"],
        notes: `Seeded demo deal #${i + 1}. Value $${(value / 1_000_000).toFixed(1)}MM.`,
        on_hold: status === "on_hold",
      };
    });
    const { data: dealsInserted, error: dealsErr } = await admin
      .from("deals").insert(dealRows).select("id");
    if (dealsErr) throw new Error(`deals: ${dealsErr.message}`);
    (dealsInserted ?? []).forEach((d) => inserted.deals.push(d.id as string));

    const today = new Date();
    const inDays = (n: number) => {
      const d = new Date(today); d.setDate(d.getDate() + n);
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
      title, description: `${title} — auto-seeded demo task.`,
      due_date: inDays((i % 14) - 3),
      status: pick(["pending","in_progress","pending","completed"], i),
      priority: pick(["low","medium","high"], i),
      task_type: "task",
      deal_id: inserted.deals[i % inserted.deals.length] ?? null,
      assigned_to: attributingUserId, assigned_by: attributingUserId, created_by: attributingUserId,
      company_id: companyId, tags: ["demo"], position: i,
    }));
    const { data: tasksInserted, error: tasksErr } = await admin
      .from("tasks").insert(taskRows).select("id");
    if (tasksErr) throw new Error(`tasks: ${tasksErr.message}`);
    (tasksInserted ?? []).forEach((t) => inserted.tasks.push(t.id as string));

    const lenderRows = Array.from({ length: 50 }, (_, i) => {
      const firstName = pick(FIRST_NAMES, i + 2);
      const lastName = pick(LAST_NAMES, i + 11);
      const orgPrefix = pick(COMPANY_PREFIXES, i + 7);
      const orgSuffix = pick(["Capital","Credit","Partners","Bank","Finance","Fund"], i);
      const name = `${orgPrefix} ${orgSuffix}`;
      const [city, state] = pick(CITIES, i + 3);
      return {
        user_id: attributingUserId, company_id: companyId, name,
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
        active: true, tags: ["demo"],
        about_notes: `${name} is a demo-seeded ${pick(LENDER_TYPES, i).toLowerCase()} based in ${city}, ${state}.`,
        funding_source_notes: `Default check size $${((20_000_000 + rand(i, 30_000_000)) / 1_000_000).toFixed(0)}MM.`,
      };
    });
    const { data: lendersInserted, error: lendersErr } = await admin
      .from("master_lenders").insert(lenderRows).select("id");
    if (lendersErr) throw new Error(`master_lenders: ${lendersErr.message}`);
    (lendersInserted ?? []).forEach((l) => inserted.lenders.push(l.id as string));

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
      seededAt, seedVersion: SEED_VERSION,
    };
  } catch (err) {
    console.error("[seedDemoCompanyData] error, rolling back", err);
    await rollback();
    throw err;
  }
}