import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { anthropicFetch } from "../_shared/anthropicUsage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CLAUDE_MODEL = "claude-sonnet-4-5-20250929";
const CLAUDE_TIMEOUT_MS = 55_000;

// Compile firm-level Copilot Instructions (set in Settings → AI) into a system-prompt prefix.
// Mirrors src/lib/copilotInstructions.ts.
function compileCopilotInstructions(raw: any): string {
  const TONE_GUIDANCE: Record<string, string> = {
    professional_concise:
      "Use a professional, concise tone. Skip preamble. Favor short sentences and scannable bullets. Be direct and action-oriented.",
    formal:
      "Use a formal, polished tone appropriate for institutional capital partners. Avoid slang and contractions. Prefer complete sentences and measured language.",
    casual:
      "Use a casual, conversational tone. Plain language, contractions are fine. Stay accurate, but feel free to be friendly.",
  };
  const r = raw && typeof raw === "object" ? raw : {};
  const company = typeof r.company_description === "string" ? r.company_description.trim() : "";
  const stagesArr = Array.isArray(r.lifecycle_stages) ? r.lifecycle_stages : [];
  const stages = stagesArr
    .map((s: any) => (typeof s === "string" ? { name: s, description: "" } : s))
    .filter((s: any) => s && typeof s.name === "string" && s.name.trim().length > 0);
  const tone = ["professional_concise", "formal", "casual"].includes(r.tone) ? r.tone : "professional_concise";
  const team = typeof r.team_structure === "string" ? r.team_structure.trim() : "";
  const custom = typeof r.custom_instructions === "string" ? r.custom_instructions.trim() : "";
  if (!company && stages.length === 0 && !team && !custom) return "";
  const parts: string[] = [];
  if (company) parts.push("## Firm Profile", company, "");
  if (stages.length > 0) {
    parts.push("## Deal Lifecycle Stages");
    parts.push(
      stages
        .map((s: any, i: number) => `${i + 1}. ${s.name}${s.description ? ` — ${s.description}` : ""}`)
        .join("\n"),
    );
    parts.push("");
  }
  parts.push("## Communication Tone", TONE_GUIDANCE[tone], "");
  if (team) parts.push("## Team Structure", team, "");
  if (custom) parts.push("## Custom Instructions", custom);
  return parts.join("\n").trim();
}

// Format a YYYY-MM-DD due date as a human-readable relative phrase
// (e.g., "due today", "due tomorrow", "due this Friday", "3 days overdue").
function formatRelativeDue(dueDate: string): string {
  if (!dueDate) return "";
  const due = new Date(dueDate + (dueDate.length === 10 ? "T00:00:00" : ""));
  if (isNaN(due.getTime())) return `due ${dueDate}`;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000);
  const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const weekday = weekdayNames[dueDay.getDay()];

  if (diffDays === 0) return "due today";
  if (diffDays === 1) return "due tomorrow";
  if (diffDays === -1) return "due yesterday";
  if (diffDays > 1 && diffDays <= 6) return `due this ${weekday}`;
  if (diffDays === 7) return `due next ${weekday}`;
  if (diffDays > 7 && diffDays <= 14) return `due next ${weekday}`;
  if (diffDays > 14) return `due in ${diffDays} days`;
  // Overdue beyond 1 day
  if (diffDays >= -6 && diffDays < -1) return `due last ${weekday} (${Math.abs(diffDays)} days overdue)`;
  return `${Math.abs(diffDays)} days overdue`;
}

async function fetchUserContext(supabase: any, userId: string, companyId: string) {
  if (!companyId) {
    return {
      deals: [], tasks: [], lenders: [], milestones: [], activities: [],
      lenderStats: [], staleDeals: [],
    };
  }

  // Fetch ALL workspace deals (not user-scoped) so admins/users see the full
  // pipeline. We filter to pipeline-active statuses in SQL so a single deal
  // like Infillion can't be pushed out by a high-volume `updated_at` ordering
  // limit. Closed/archived/on-hold deals are excluded — they're not relevant
  // to "active deals" questions and are not surfaced in the dashboard widgets.
  const ACTIVE_STATUSES = ["on-track", "at-risk", "off-track", "active"];
  const [dealsRes, tasksRes] = await Promise.all([
    supabase.from("deals")
      .select("id, company, value, stage, status, deal_type, deal_class, pipeline_id, business_model, created_at, updated_at, user_id, deal_owner, manager, next_follow_up_at, notes_updated_at")
      .eq("company_id", companyId)
      .in("status", ACTIVE_STATUSES)
      .order("updated_at", { ascending: false })
      .limit(2000),
    supabase.from("tasks")
      .select("id, title, status, priority, due_date, description, assigned_to, created_at, deal_id")
      .eq("assigned_to", userId)
      .neq("status", "done")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(40),
  ]);

  if (dealsRes.error) {
    console.error("[claude-dashboard-chat] deals query error", {
      message: dealsRes.error.message,
      code: (dealsRes.error as any).code,
      companyId,
    });
  }
  if (tasksRes.error) {
    console.error("[claude-dashboard-chat] tasks query error", {
      message: tasksRes.error.message,
      code: (tasksRes.error as any).code,
    });
  }

  const allDeals = dealsRes.data || [];
  const deals = allDeals.filter((d: any) => {
    const n = (d.company || "").toLowerCase().trim();
    if (n.startsWith("test ")) return false;
    if (n === "test-niki's store" || n === "test-niki’s store") return false;
    if (n === "example deal") return false;
    // Match the My Deals widget: exclude naitive Pipeline & FinServ deals
    // from the standard "active deals" view used by the Dashboard AI.
    const dc = (d.deal_class || "standard").toLowerCase();
    if (dc === "naitive" || dc === "finserv") return false;
    return true;
  });

  const tasks = tasksRes.data || [];
  const dealIds = deals.map((d: any) => d.id);

  if (dealIds.length === 0) {
    return { deals, tasks, lenders: [], milestones: [], activities: [], lenderStats: [], staleDeals: [] };
  }

  const [lendersRes, milestonesRes, activitiesRes, lenderStatsRes] = await Promise.all([
    supabase.from("deal_lenders")
      .select("id, name, stage, substage, quote_amount, quote_rate, notes, pass_reason, deal_id, created_at, updated_at, deals(company)")
      .in("deal_id", dealIds)
      .order("updated_at", { ascending: false })
      .limit(150),
    supabase.from("deal_milestones")
      .select("id, title, completed, due_date, deal_id, status, created_at, deals(company)")
      .in("deal_id", dealIds)
      .eq("completed", false)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(60),
    supabase.from("activity_logs")
      .select("activity_type, description, created_at, deal_id, user_display_name, deals(company)")
      .in("deal_id", dealIds)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase.rpc("get_lender_deal_stats", { _company_id: companyId, _limit: 25 }).then((r: any) => r).catch(() => ({ data: [] })),
  ]);

  const lenders = lendersRes.data || [];
  const milestones = milestonesRes.data || [];
  const activities = activitiesRes.data || [];

  // Compute "last touch" per deal from the most recent of: deal updated_at,
  // notes_updated_at, latest activity_log, latest deal_lender update.
  const now = Date.now();
  const lastActivityByDeal = new Map<string, number>();
  for (const a of activities) {
    const t = new Date(a.created_at).getTime();
    const prev = lastActivityByDeal.get(a.deal_id) || 0;
    if (t > prev) lastActivityByDeal.set(a.deal_id, t);
  }
  // Lender-only touch — used to answer "no lender activity in N days"
  const lastLenderTouchByDeal = new Map<string, number>();
  for (const l of lenders) {
    const t = new Date(l.updated_at || l.created_at).getTime();
    const prev = lastActivityByDeal.get(l.deal_id) || 0;
    if (t > prev) lastActivityByDeal.set(l.deal_id, t);
    const prevL = lastLenderTouchByDeal.get(l.deal_id) || 0;
    if (t > prevL) lastLenderTouchByDeal.set(l.deal_id, t);
  }

  // "Active" for staleness = pipeline-active deals only (exclude archived,
  // on-hold, dead, won, lost). on-hold deals are intentionally suppressed.
  const isActiveStatus = (s: string) =>
    !!s && !["archived", "on-hold", "on_hold", "closed-won", "closed-lost", "lost", "won", "dead"].includes(s);

  const staleDeals = deals
    .filter((d: any) => isActiveStatus(d.status))
    .map((d: any) => {
      // Use real activity signals (logs, lender touches, notes) — NOT the bulk
      // updated_at column, which can be touched en-masse by maintenance jobs.
      const candidates = [
        lastActivityByDeal.get(d.id) || 0,
        d.notes_updated_at ? new Date(d.notes_updated_at).getTime() : 0,
      ].filter(Boolean);
      const last = candidates.length ? Math.max(...candidates) : new Date(d.created_at).getTime();
      const days = Math.floor((now - last) / 86_400_000);
      return { ...d, days_since_activity: days };
    })
    .filter((d: any) => d.days_since_activity >= 14)
    .sort((a: any, b: any) => b.days_since_activity - a.days_since_activity);

  return {
    deals, tasks, lenders, milestones, activities,
    lenderStats: lenderStatsRes?.data || [],
    staleDeals,
    lastLenderTouchByDeal: Object.fromEntries(lastLenderTouchByDeal),
  };
}

function buildContextString(ctx: any, companyName: string, userName: string) {
  const { deals, tasks, lenders, milestones, activities, lenderStats, staleDeals, lastLenderTouchByDeal = {} } = ctx;
  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];

  lines.push(`## User Context\nUser: ${userName} | Company: ${companyName} | Date: ${today}`);

  if (deals.length > 0) {
    const isActiveStatus = (s: string) =>
      !!s && !["archived", "on-hold", "on_hold", "closed-won", "closed-lost", "lost", "won"].includes(s);
    const activeDeals = deals.filter((d: any) => isActiveStatus(d.status));
    lines.push(`## Active Deals (${activeDeals.length} total — full workspace)`);
    activeDeals.forEach((d: any) => {
      const last = new Date(d.updated_at || d.created_at);
      const daysAgo = Math.floor((Date.now() - last.getTime()) / 86_400_000);
      const valueM = d.value ? `$${(d.value / 1e6).toFixed(1)}M` : "n/a";
      const lenderTs = lastLenderTouchByDeal[d.id];
      const lenderDays = lenderTs ? Math.floor((Date.now() - lenderTs) / 86_400_000) : null;
      const lenderLabel = lenderDays === null ? "no lender activity" : `last lender touch: ${lenderDays}d ago`;
      lines.push(`- ${d.company}: ${valueM} | stage: ${d.stage}${d.business_model ? ` | ${d.business_model}` : ""} | last update: ${daysAgo}d ago | ${lenderLabel}`);
    });
  }

  if (lenders.length > 0) {
    lines.push(`\n## Active Deal-Lender Relationships (${lenders.length})`);
    lenders.slice(0, 60).forEach((l: any) => {
      const last = new Date(l.updated_at || l.created_at);
      const daysAgo = Math.floor((Date.now() - last.getTime()) / 86_400_000);
      lines.push(`- ${l.name} on ${l.deals?.company || "?"} | stage: ${l.stage}${l.substage ? `/${l.substage}` : ""}${l.quote_amount ? ` | quote $${(l.quote_amount / 1e6).toFixed(1)}M` : ""}${l.pass_reason ? ` | PASSED: ${l.pass_reason}` : ""} | last touch ${daysAgo}d ago`);
    });
  }

  if (lenderStats.length > 0) {
    lines.push(`\n## Lender Activity Summary (top by deal count)`);
    lenderStats.slice(0, 20).forEach((l: any) => {
      lines.push(`- ${l.lender_name}: ${l.deal_count} total deals, ${l.active_count} active, $${(l.total_volume / 1e6).toFixed(0)}M total volume`);
    });
  }

  if (milestones.length > 0) {
    lines.push(`\n## Open Milestones / Outstanding Items (${milestones.length})`);
    milestones.slice(0, 40).forEach((m: any) => {
      lines.push(`- ${m.deals?.company || "?"}: ${m.title}${m.due_date ? ` (due ${m.due_date})` : ""}${m.status ? ` [${m.status}]` : ""}`);
    });
  }

  if (tasks.length > 0) {
    lines.push(`\n## My Open Tasks (assigned to ${userName}) — ${tasks.length}`);
    tasks.slice(0, 40).forEach((t: any) => {
      const dealCompany = deals.find((d: any) => d.id === t.deal_id)?.company;
      const dueLabel = t.due_date ? formatRelativeDue(t.due_date) : null;
      lines.push(`- task_id=${t.id} | [${t.priority || "normal"}] ${t.title}${dueLabel ? ` | ${dueLabel}` : ""}${dealCompany ? ` | deal: ${dealCompany}` : ""}${t.status ? ` | ${t.status}` : ""}`);
    });
  }

  if (staleDeals.length > 0) {
    lines.push(`\n## Stale-Risk Deals (>=21 days no activity)`);
    staleDeals.slice(0, 15).forEach((d: any) => {
      const lendersOnDeal = lenders
        .filter((l: any) => l.deal_id === d.id && l.stage !== "Passed" && l.stage !== "Funded")
        .slice(0, 5)
        .map((l: any) => l.name);
      lines.push(`- ${d.company}: ${d.days_since_activity}d since activity | stage: ${d.stage}${lendersOnDeal.length ? ` | active lenders: ${lendersOnDeal.join(", ")}` : " | no active lenders"}`);
    });
  }

  if (activities.length > 0) {
    lines.push(`\n## Recent Activity (last 25)`);
    activities.slice(0, 25).forEach((a: any) => {
      lines.push(`- ${a.deals?.company || "?"} [${a.activity_type}]: ${a.description}${a.user_display_name ? ` (${a.user_display_name})` : ""}`);
    });
  }

  return lines.join("\n");
}

function getPromptAddendum(userText: string): string {
  const t = userText.toLowerCase();
  if (/what are we waiting on|waiting on/.test(t)) {
    return `\n\n## Task: "What are we waiting on?"
Produce a brief, scannable list of outstanding items grouped by deal. For each deal with open items, write ONE concise line in the format:
**Deal Name** – what we're waiting on (lender, person, doc, or signal).
Use open milestones, lenders awaiting response, missing docs, and recent activity. Keep it under 8 deals. Be action-oriented. No headers, no preamble.`;
  }
  if (/most active lender|active lender/.test(t)) {
    return `\n\n## Task: "Who are our most active lenders?"
Return a short ranked list (top 6–10) of lenders with the most current activity. For each, ONE line:
**Lender Name** – active on N deals; brief context (e.g., "2 in term sheet / proposal", "3 new deals sent in last 30 days").
Use the Lender Activity Summary and Active Deal-Lender Relationships data. Rank by active deal count. No preamble.`;
  }
  if (/stale deal/.test(t)) {
    return `\n\n## Task: "Stale Deals Analysis"
For each deal flagged as stale-risk, give ONE concise line:
**Deal Name** – Xd since activity; current stage; key lenders involved (or "no active lenders"); brief risk note.
Limit to top 8. Order by days-since-activity descending. No preamble, no closing summary.`;
  }
  if (/to-?do list|my tasks|what do i need to do/.test(t)) {
    return `\n\n## Task: "To-Do List"
Summarize MY open tasks grouped by urgency. Use these EXACT section headers (in this order, skip a section if empty):
**Overdue**, **Today**, **Next 3 days**, **Later**.

Render EACH task as a markdown bullet in this exact format:
- [Task Title](/tasks/<task_id>) — <relative due label>${'`'} (e.g. \`due today\`, \`due tomorrow\`, \`due this Friday\`, \`3 days overdue\`) · brief deal/lender context if relevant

Critical rules:
- The task title MUST be a markdown link using the task_id from the data above. The href is exactly "/tasks/" + the task_id (e.g. /tasks/abc123).
- Use the pre-computed relative due phrase from the data (the part after the task_id and priority). NEVER print raw YYYY-MM-DD dates.
- Keep each line tight and verb-led. No preamble, no closing summary.
- If a task has no due date, omit the due phrase entirely.`;
  }
  return "";
}

// -------------------- Lender Intelligence Enrichment --------------------
// On-demand enrichment that fires when the user's prompt looks like a
// lender / deal-lender question. Pulls targeted data from master_lenders,
// deal_lenders, lender_notes — scoped to the user's company — and returns
// a markdown block to inject into the system prompt. Always cites the
// source deal where relevant (per project rule).

const LENDER_KEYWORDS = [
  "lender", "lenders", "founderpath", "triplepoint", "passed on", "pass on",
  "haven't responded", "havent responded", "haven't heard", "havent heard",
  "stale lender", "no response", "what stage", "who are the lenders",
  "what do we know about",
];

function looksLikeLenderQuery(text: string): boolean {
  const t = text.toLowerCase();
  return LENDER_KEYWORDS.some((k) => t.includes(k));
}

function fmtMoney(n: number | null | undefined) {
  if (n == null) return "n/a";
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

function daysSince(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

// Try to identify a deal name referenced in the user prompt. We match
// against the user's deals (already loaded in ctx) using case-insensitive
// substring — longest match wins to avoid 'Cart' matching 'Cartwheel Inc'.
function detectDeal(text: string, deals: any[]): any | null {
  const t = text.toLowerCase();
  let best: { d: any; len: number } | null = null;
  for (const d of deals) {
    const name = (d.company || "").toLowerCase().trim();
    if (!name || name.length < 3) continue;
    if (t.includes(name)) {
      if (!best || name.length > best.len) best = { d, len: name.length };
    }
  }
  return best?.d || null;
}

// Detect a lender name mentioned in the prompt, by matching the user's
// master lender directory. Returns the best (longest) match.
function detectLenderName(text: string, masterNames: string[]): string | null {
  const t = text.toLowerCase();
  let best: { n: string; len: number } | null = null;
  for (const raw of masterNames) {
    const name = (raw || "").toLowerCase().trim();
    if (!name || name.length < 3) continue;
    if (t.includes(name)) {
      if (!best || name.length > best.len) best = { n: raw, len: name.length };
    }
  }
  return best?.n || null;
}

function detectStaleIntent(text: string): boolean {
  const t = text.toLowerCase();
  return /haven'?t responded|haven'?t heard|no response|stale|not responded|silent/.test(t);
}

function detectPassFilterIntent(text: string): { segment?: string; months: number } | null {
  const t = text.toLowerCase();
  if (!/passed?\s+on/.test(t)) return null;
  // months window: "last 6 months", "past 3 months"
  const m = t.match(/(?:last|past)\s+(\d+)\s+month/);
  const months = m ? parseInt(m[1], 10) : 6;
  // segment: SaaS, ABL, growth, ecommerce, fintech, etc — capture first known token
  const segs = ["saas", "abl", "growth", "ecommerce", "e-commerce", "fintech", "consumer", "healthcare", "marketplace", "subscription", "real estate"];
  const segment = segs.find((s) => t.includes(s));
  return { segment, months };
}

async function fetchLenderEnrichment(
  supabase: any,
  companyId: string,
  ctx: any,
  userText: string,
): Promise<string> {
  if (!companyId || !looksLikeLenderQuery(userText)) return "";

  // Load master lender directory (scoped to company) — names only, for matching
  const { data: masterAll } = await supabase
    .from("master_lenders")
    .select("id, name, lender_type, loan_types, industries, min_deal, max_deal, min_revenue, ebitda_min, sub_debt, cash_burn, sponsorship, geo, b2b_b2c, contact_name, contact_title")
    .eq("company_id", companyId)
    .limit(1500);
  const masters = masterAll || [];
  const masterNames = masters.map((m: any) => m.name);

  const dealMatch = detectDeal(userText, ctx.deals || []);
  const lenderName = detectLenderName(userText, masterNames);
  const staleIntent = detectStaleIntent(userText);
  const passFilter = detectPassFilterIntent(userText);

  const sections: string[] = [];
  sections.push(`\n## Lender Intelligence (live query — ${masters.length} lenders in directory)`);

  // 1. Deal-scoped queries: lenders on a specific deal
  if (dealMatch) {
    const { data: dealLenders } = await supabase
      .from("deal_lenders")
      .select("id, name, stage, substage, tracking_status, last_contact_at, quote_amount, quote_rate, quote_term, pass_reason, notes, updated_at, created_at")
      .eq("deal_id", dealMatch.id)
      .order("updated_at", { ascending: false })
      .limit(200);
    const list = dealLenders || [];
    let filtered = list;
    if (lenderName) {
      const ln = lenderName.toLowerCase();
      filtered = list.filter((l: any) => (l.name || "").toLowerCase().includes(ln));
    } else if (staleIntent) {
      filtered = list.filter((l: any) => {
        const d = daysSince(l.last_contact_at);
        return l.tracking_status !== "passed" && (d == null || d >= 7);
      });
    }
    sections.push(`\n### Lenders on **${dealMatch.company}** (source deal: ${dealMatch.company})`);
    if (filtered.length === 0) {
      sections.push(`_No matching lenders on ${dealMatch.company}._`);
    } else {
      filtered.slice(0, 60).forEach((l: any) => {
        const dsl = daysSince(l.last_contact_at);
        const lastTouch = dsl == null ? "no recorded contact" : `${dsl}d ago`;
        const stale = dsl == null || dsl >= 7;
        const quote = l.quote_amount ? ` | quote ${fmtMoney(l.quote_amount)}${l.quote_rate ? ` @ ${l.quote_rate}%` : ""}${l.quote_term ? ` / ${l.quote_term}` : ""}` : "";
        const pass = l.pass_reason ? ` | PASSED: ${l.pass_reason}` : "";
        const status = l.tracking_status && l.tracking_status !== "active" ? ` [${l.tracking_status}]` : "";
        sections.push(`- **${l.name}** — stage: ${l.stage}${l.substage ? `/${l.substage}` : ""}${status} | last contact: ${lastTouch}${stale && l.tracking_status !== "passed" ? " ⚠️ stale" : ""}${quote}${pass}`);
      });
    }
  }

  // 2. Lender profile lookup (no specific deal, or as supplement)
  if (lenderName) {
    const masterMatch = masters.find((m: any) => (m.name || "").toLowerCase() === lenderName.toLowerCase());
    if (masterMatch) {
      sections.push(`\n### Lender Profile: **${masterMatch.name}**`);
      const lines = [
        masterMatch.lender_type ? `Type: ${masterMatch.lender_type}` : null,
        masterMatch.loan_types?.length ? `Deal types: ${masterMatch.loan_types.join(", ")}` : null,
        masterMatch.industries?.length ? `Industry focus: ${masterMatch.industries.join(", ")}` : null,
        (masterMatch.min_deal || masterMatch.max_deal) ? `Size range: ${fmtMoney(masterMatch.min_deal)} – ${fmtMoney(masterMatch.max_deal)}` : null,
        masterMatch.min_revenue ? `Min revenue: ${fmtMoney(masterMatch.min_revenue)}` : null,
        masterMatch.ebitda_min ? `EBITDA min: ${fmtMoney(masterMatch.ebitda_min)}` : null,
        masterMatch.sub_debt ? `Sub-debt: ${masterMatch.sub_debt}` : null,
        masterMatch.cash_burn ? `Cash burn ok: ${masterMatch.cash_burn}` : null,
        masterMatch.sponsorship ? `Sponsorship: ${masterMatch.sponsorship}` : null,
        masterMatch.b2b_b2c ? `B2B/B2C: ${masterMatch.b2b_b2c}` : null,
        masterMatch.geo ? `Geo: ${masterMatch.geo}` : null,
        masterMatch.contact_name ? `Primary contact: ${masterMatch.contact_name}${masterMatch.contact_title ? ` (${masterMatch.contact_title})` : ""}` : null,
      ].filter(Boolean);
      lines.forEach((l) => sections.push(`- ${l}`));

      // Cross-deal interaction history — every deal_lenders row matching this lender across this company's deals.
      const dealIds = (ctx.deals || []).map((d: any) => d.id);
      if (dealIds.length) {
        const { data: history } = await supabase
          .from("deal_lenders")
          .select("id, name, stage, tracking_status, last_contact_at, quote_amount, pass_reason, updated_at, deal_id, deals(company)")
          .in("deal_id", dealIds)
          .ilike("name", `%${masterMatch.name}%`)
          .order("updated_at", { ascending: false })
          .limit(50);
        const hist = history || [];
        if (hist.length) {
          sections.push(`\n**Interaction history for ${masterMatch.name}** (${hist.length} deal engagements):`);
          hist.forEach((h: any) => {
            const dsl = daysSince(h.last_contact_at || h.updated_at);
            sections.push(`- on **${h.deals?.company || "?"}** — stage: ${h.stage}${h.tracking_status && h.tracking_status !== "active" ? ` [${h.tracking_status}]` : ""}${h.quote_amount ? ` | quote ${fmtMoney(h.quote_amount)}` : ""}${h.pass_reason ? ` | passed: ${h.pass_reason}` : ""} | last touch ${dsl ?? "?"}d ago (source: ${h.deals?.company})`);
          });
        } else {
          sections.push(`\n_No prior deal engagements with ${masterMatch.name} in this workspace._`);
        }
      }
    } else if (!dealMatch) {
      sections.push(`\n_Lender "${lenderName}" not found in master directory._`);
    }
  }

  // 3. Cross-deal pass filter: "Which lenders have passed on SaaS deals in last 6 months"
  if (passFilter) {
    const sinceTs = new Date(Date.now() - passFilter.months * 30 * 86_400_000).toISOString();
    const dealIds = (ctx.deals || [])
      .filter((d: any) => {
        if (!passFilter.segment) return true;
        const blob = `${d.business_model || ""} ${d.deal_type || ""} ${d.company || ""}`.toLowerCase();
        return blob.includes(passFilter.segment.replace("e-commerce", "ecommerce"));
      })
      .map((d: any) => d.id);
    if (dealIds.length) {
      const { data: passed } = await supabase
        .from("deal_lenders")
        .select("name, pass_reason, updated_at, deal_id, deals(company, business_model, deal_type)")
        .in("deal_id", dealIds)
        .eq("tracking_status", "passed")
        .gte("updated_at", sinceTs)
        .order("updated_at", { ascending: false })
        .limit(150);
      const rows = passed || [];
      sections.push(`\n### Lenders who PASSED on${passFilter.segment ? ` ${passFilter.segment.toUpperCase()}` : ""} deals in last ${passFilter.months} months (${rows.length})`);
      if (rows.length === 0) {
        sections.push(`_No matching pass records found._`);
      } else {
        const grouped = new Map<string, any[]>();
        for (const r of rows) {
          const k = r.name;
          if (!grouped.has(k)) grouped.set(k, []);
          grouped.get(k)!.push(r);
        }
        Array.from(grouped.entries()).slice(0, 30).forEach(([name, recs]) => {
          const dealList = recs.map((r) => `${r.deals?.company || "?"}${r.pass_reason ? ` (${r.pass_reason})` : ""}`).join("; ");
          sections.push(`- **${name}** — passed on: ${dealList}`);
        });
      }
    }
  }

  if (sections.length === 1) return ""; // only header, no real data
  return sections.join("\n");
}
// -------------------- end lender intelligence --------------------

// -------------------- Gmail + Calendar enrichment --------------------

const NYLAS_API_KEY_ENV = Deno.env.get("NYLAS_API_KEY");
const NYLAS_API_URI = "https://api.us.nylas.com";

function looksLikeEmailQuery(text: string): boolean {
  const t = (text || "").toLowerCase();
  return /\b(email|emails|inbox|gmail|wrote|said|reply|replies|replied|message|messages|sent|received|forwarded)\b/.test(t)
    || /\b(what did .+ say|hear back|response from|heard from|any word from)\b/.test(t);
}

function looksLikeCalendarQuery(text: string): boolean {
  const t = (text || "").toLowerCase();
  return /\b(calendar|meeting|meetings|call|calls|schedule|scheduled|event|events|appointment|sync|standup|catchup|catch up)\b/.test(t)
    || /\b(when is my next|do i have|next call with|do i have a)\b/.test(t);
}

function detectTimeWindowDays(text: string): number {
  const t = (text || "").toLowerCase();
  const m = t.match(/last\s+(\d+)\s+(day|days|week|weeks|month|months)/);
  if (m) {
    const n = parseInt(m[1], 10);
    const u = m[2];
    if (u.startsWith("week")) return n * 7;
    if (u.startsWith("month")) return n * 30;
    return n;
  }
  if (/last\s+week|past\s+week|this\s+week/.test(t)) return 7;
  if (/yesterday|today/.test(t)) return 2;
  if (/last\s+month|past\s+month/.test(t)) return 30;
  return 14; // default lookback
}

function detectFutureWindowDays(text: string): number {
  const t = (text || "").toLowerCase();
  if (/this\s+week/.test(t)) return 7;
  if (/next\s+week/.test(t)) return 14;
  if (/this\s+month|next\s+month/.test(t)) return 30;
  if (/today/.test(t)) return 1;
  if (/tomorrow/.test(t)) return 2;
  if (/next\s+call|next\s+meeting/.test(t)) return 60;
  return 14;
}

// Extract candidate person/entity names from the prompt — proper-cased tokens of 2+ chars,
// excluding common stopwords. Best-effort heuristic.
function extractCandidateNames(text: string): string[] {
  if (!text) return [];
  const stop = new Set([
    "I", "Im", "I'm", "The", "And", "Any", "Did", "What", "When", "Who", "Why", "How",
    "Last", "Next", "This", "Week", "Month", "Day", "Today", "Tomorrow", "Yesterday",
    "Email", "Emails", "Inbox", "Gmail", "Calendar", "Meeting", "Meetings", "Call", "Calls",
    "From", "About", "On", "In", "At", "To", "For", "With", "Reply", "Replies", "Lender", "Lenders",
    "Deal", "Deals",
  ]);
  const tokens = text.match(/\b[A-Z][a-zA-Z'’-]{1,}(?:\s+[A-Z][a-zA-Z'’-]{1,})*\b/g) || [];
  const out: string[] = [];
  for (const tok of tokens) {
    if (stop.has(tok)) continue;
    if (tok.length < 2) continue;
    out.push(tok);
  }
  // dedupe preserving order
  return Array.from(new Set(out));
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch { return String(iso); }
}

function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return String(iso); }
}

async function fetchGmailEnrichment(
  supabase: any,
  userId: string,
  ctx: any,
  userText: string,
): Promise<string> {
  if (!looksLikeEmailQuery(userText)) return "";

  const days = detectTimeWindowDays(userText);
  const sinceTs = new Date(Date.now() - days * 86_400_000).toISOString();

  const candidates = extractCandidateNames(userText);
  const dealMatch = detectDeal(userText, ctx.deals || []);
  if (dealMatch) {
    // Don't search by the deal company name as a "person" candidate — handled below
    const dealTokens = (dealMatch.company || "").split(/\s+/);
    for (const tok of dealTokens) {
      const idx = candidates.findIndex((c) => c.toLowerCase() === tok.toLowerCase());
      if (idx >= 0) candidates.splice(idx, 1);
    }
  }

  // Build OR filter: subject/body/from_name/from_email LIKE any candidate, OR mentions deal company
  const orParts: string[] = [];
  const searchTerms = [...candidates];
  if (dealMatch?.company) searchTerms.push(dealMatch.company);
  for (const term of searchTerms.slice(0, 6)) {
    const safe = term.replace(/[%,()]/g, " ").trim();
    if (!safe) continue;
    orParts.push(`subject.ilike.%${safe}%`);
    orParts.push(`body_text.ilike.%${safe}%`);
    orParts.push(`from_name.ilike.%${safe}%`);
    orParts.push(`from_email.ilike.%${safe}%`);
    orParts.push(`snippet.ilike.%${safe}%`);
  }

  let query = supabase
    .from("gmail_messages")
    .select("id, subject, from_name, from_email, snippet, body_text, received_at, thread_id")
    .eq("user_id", userId)
    .gte("received_at", sinceTs)
    .order("received_at", { ascending: false })
    .limit(15);

  if (orParts.length > 0) {
    query = query.or(orParts.join(","));
  } else {
    // No specific terms — return nothing (we don't want to dump the whole inbox)
    return "";
  }

  const { data: msgs, error } = await query;
  if (error) {
    console.error("[claude-dashboard-chat] gmail enrichment error", error.message);
    return "";
  }
  const messages = msgs || [];
  if (messages.length === 0) return "";

  const lines: string[] = [];
  lines.push(`\n## Gmail (live query — last ${days}d, ${messages.length} match${messages.length === 1 ? "" : "es"})`);
  if (searchTerms.length) lines.push(`_Searched for: ${searchTerms.slice(0, 6).join(", ")}_`);
  for (const m of messages.slice(0, 12)) {
    const sender = m.from_name ? `${m.from_name} <${m.from_email || "?"}>` : (m.from_email || "?");
    const body = (m.body_text || m.snippet || "").replace(/\s+/g, " ").trim().slice(0, 600);
    lines.push(`- **${m.subject || "(no subject)"}** — from ${sender} on ${fmtDate(m.received_at)}\n  > ${body}`);
  }
  lines.push(`\n_When citing emails, always reference the sender and date (e.g. "Based on ${messages[0].from_name || messages[0].from_email}'s email from ${fmtDay(messages[0].received_at)}...")._`);
  return lines.join("\n");
}

async function fetchCalendarEnrichment(
  supabase: any,
  userId: string,
  ctx: any,
  userText: string,
): Promise<string> {
  if (!looksLikeCalendarQuery(userText)) return "";
  if (!NYLAS_API_KEY_ENV) return "";

  // Get grant_id
  const { data: tok } = await supabase
    .from("gmail_tokens")
    .select("grant_id")
    .eq("user_id", userId)
    .maybeSingle();
  const grantId = tok?.grant_id;
  if (!grantId) return "";

  // Window: default look 1 day back to N days forward (so "today" includes earlier-today calls).
  const futureDays = detectFutureWindowDays(userText);
  const startUnix = Math.floor((Date.now() - 1 * 86_400_000) / 1000);
  const endUnix = Math.floor((Date.now() + futureDays * 86_400_000) / 1000);

  const url = new URL(`${NYLAS_API_URI}/v3/grants/${grantId}/events`);
  url.searchParams.set("calendar_id", "primary");
  url.searchParams.set("start", String(startUnix));
  url.searchParams.set("end", String(endUnix));
  url.searchParams.set("limit", "100");

  let events: any[] = [];
  try {
    const resp = await fetch(url.toString(), {
      headers: {
        "Authorization": `Bearer ${NYLAS_API_KEY_ENV}`,
        "Accept": "application/json",
      },
    });
    if (!resp.ok) {
      console.error("[claude-dashboard-chat] nylas events error", resp.status);
      return "";
    }
    const data = await resp.json();
    events = data.data || [];
  } catch (e) {
    console.error("[claude-dashboard-chat] calendar fetch failed", e);
    return "";
  }
  if (events.length === 0) return "";

  const candidates = extractCandidateNames(userText).map((c) => c.toLowerCase());
  const dealMatch = detectDeal(userText, ctx.deals || []);
  const terms = new Set<string>(candidates);
  if (dealMatch?.company) terms.add(dealMatch.company.toLowerCase());

  const filtered = events.filter((e: any) => {
    if (terms.size === 0) return true; // generic "what's on my calendar" — return all
    const blob = [
      e.title || "",
      e.description || "",
      e.location || "",
      ...(e.participants || []).map((p: any) => `${p.name || ""} ${p.email || ""}`),
    ].join(" ").toLowerCase();
    for (const t of terms) {
      if (t && blob.includes(t)) return true;
    }
    return false;
  }).sort((a: any, b: any) => (a.when?.start_time || 0) - (b.when?.start_time || 0));

  if (filtered.length === 0) return "";

  const lines: string[] = [];
  lines.push(`\n## Google Calendar (live query — ${filtered.length} match${filtered.length === 1 ? "" : "es"})`);
  if (terms.size) lines.push(`_Searched for: ${Array.from(terms).slice(0, 6).join(", ")}_`);
  for (const e of filtered.slice(0, 15)) {
    const startISO = e.when?.start_time ? new Date(e.when.start_time * 1000).toISOString() : (e.when?.start_date || "");
    const attendees = (e.participants || []).slice(0, 6).map((p: any) => p.name || p.email).filter(Boolean).join(", ");
    const loc = e.location ? ` — ${e.location}` : "";
    lines.push(`- **${e.title || "(untitled)"}** on ${fmtDate(startISO)}${loc}${attendees ? ` | with: ${attendees}` : ""}`);
  }
  lines.push(`\n_When citing calendar events, reference the date (e.g. "From your calendar: meeting on ${fmtDay(filtered[0].when?.start_time ? new Date(filtered[0].when.start_time * 1000).toISOString() : "")}...")._`);
  return lines.join("\n");
}
// -------------------- end gmail + calendar enrichment --------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth-bound client for verifying the user
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service-role client for fetching context. We've already verified the user
    // and we explicitly scope every query by company_id / user_id below, so
    // using the service role here avoids RLS edge cases that have intermittently
    // returned empty results for users with valid company memberships.
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const body = await req.json();
    const messages = body.messages || [];
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Messages required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: membership } = await supabase
      .from("company_members")
      .select("company_id, role, companies(name)")
      .eq("user_id", user.id)
      .maybeSingle();

    const companyId = membership?.company_id;
    const companyName = (membership as any)?.companies?.name || "your company";

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, first_name")
      .eq("user_id", user.id)
      .maybeSingle();
    const userName = profile?.first_name || profile?.display_name || "there";

    const ctx = await fetchUserContext(supabase, user.id, companyId);
    const userContext = buildContextString(ctx, companyName, userName);

    // Targeted lender enrichment based on the user's latest prompt.
    const lastUserTextEarly = [...messages].reverse().find((m: any) => m.role === "user")?.content || "";
    let lenderEnrichment = "";
    try {
      lenderEnrichment = await fetchLenderEnrichment(supabase, companyId, ctx, lastUserTextEarly);
    } catch (e) {
      console.error("[claude-dashboard-chat] lender enrichment failed", e);
    }

    // Targeted Gmail + Calendar enrichment (only runs when prompt looks email/calendar-related).
    let gmailEnrichment = "";
    let calendarEnrichment = "";
    try {
      [gmailEnrichment, calendarEnrichment] = await Promise.all([
        fetchGmailEnrichment(supabase, user.id, ctx, lastUserTextEarly),
        fetchCalendarEnrichment(supabase, user.id, ctx, lastUserTextEarly),
      ]);
    } catch (e) {
      console.error("[claude-dashboard-chat] gmail/calendar enrichment failed", e);
    }

    console.log("[claude-dashboard-chat] context loaded", {
      user_id: user.id,
      company_id: companyId,
      company_name: companyName,
      counts: {
        deals: ctx.deals?.length || 0,
        tasks: ctx.tasks?.length || 0,
        lenders: ctx.lenders?.length || 0,
        milestones: ctx.milestones?.length || 0,
        activities: ctx.activities?.length || 0,
        lenderStats: ctx.lenderStats?.length || 0,
        staleDeals: ctx.staleDeals?.length || 0,
        lender_enrichment_chars: lenderEnrichment.length,
        gmail_enrichment_chars: gmailEnrichment.length,
        calendar_enrichment_chars: calendarEnrichment.length,
      },
      context_chars: userContext.length,
    });

    const lastUserText = [...messages].reverse().find((m: any) => m.role === "user")?.content || "";
    const promptAddendum = getPromptAddendum(lastUserText);

    // Load firm-level Copilot Instructions and prepend to the system prompt.
    let copilotPrefix = "";
    try {
      if (companyId) {
        const { data: aiConfigRow } = await supabase
          .from("ai_configuration")
          .select("copilot_instructions")
          .eq("company_id", companyId)
          .maybeSingle();
        copilotPrefix = compileCopilotInstructions(aiConfigRow?.copilot_instructions);
      }
    } catch (e) {
      console.warn("[claude-dashboard-chat] copilot instructions load failed", e);
    }

    const systemPrompt = `${copilotPrefix ? copilotPrefix + "\n\n" : ""}You are naitive Copilot — a Claude-powered deal intelligence assistant for commercial lending professionals at ${companyName}. You answer questions about deals, lenders, pipeline, tasks, and outstanding items using the user's actual data below.

The user's name is ${userName}.

## Your Style
- Concise, scannable, action-oriented. Skip preamble.
- Use **bold** deal/lender names. Prefer short lines over paragraphs.
- Use markdown for lists; do not over-format.
- Reference real entities from the data — never invent deals, lenders, or numbers.
- If the data doesn't contain the answer, say so briefly.
- For lender questions, ALWAYS cite the source deal (e.g. "on **Infillion**"). Use the Lender Intelligence section below when present — it is the authoritative live query.
- For email/calendar questions, ALWAYS cite the source: sender + date for emails (e.g. "Based on Song Chae's email from Apr 29..."), and the date for calendar events (e.g. "From your calendar: meeting on May 5..."). Use ONLY the Gmail / Google Calendar sections below when present — never invent senders, subjects, attendees, or times.

## Write Actions (HUMAN-IN-THE-LOOP — REQUIRED FOR EVERY WRITE)
You can request write actions on the user's data. NEVER auto-execute. Instead emit a confirmation card by appending exactly ONE fenced JSON block at the end of your reply:

\`\`\`json
{"action":"confirm","action_type":"<TYPE>","description":"<short human description>","params":{...}}
\`\`\`

Supported action_types and required params (use real UUIDs from the live data above — NEVER invent IDs):
- update_deal_status — params: { deal_id, deal_name, new_status, current_status?, status_note? } — new_status one of: on-track, at-risk, off-track, on-hold, archived, closed-won, closed-lost.
- update_deal_stage — params: { deal_id, deal_name, new_stage, current_stage }.
- update_lender_status — params: { deal_id, lender_id, lender_name, stage?, tracking_status?, pass_reason? }.
- add_deal_note (also: log_note) — params: { deal_id, note }. Use add_deal_note for "log a note", "add a note to <deal>".
- create_task — params: { title, deal_id?, priority?, due_date?, description? }.

Rules:
1. Before emitting the JSON, write ONE short sentence describing what you're about to do (e.g. "Update Censys Technologies status to At Risk — confirm?").
2. Resolve names → IDs from the live data (Deals section). If you can't find a unique match, ASK FIRST — do NOT emit a card.
3. Emit at most ONE confirm card per reply. Multi-step requests: do the first, the rest will follow after the user confirms.
4. The card itself is the user's confirmation step — do not also ask "shall I proceed?" after the JSON block.

## User's Live Data
${userContext}
${lenderEnrichment}
${gmailEnrichment}
${calendarEnrichment}
${promptAddendum}`;

    const anthropicMessages = messages
      .filter((m: any) => m.role === "user" || m.role === "assistant")
      .map((m: any) => ({ role: m.role, content: String(m.content || "") }));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);

    const anthropicResp = await anthropicFetch({ feature: "claude-dashboard-chat" }, {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 2048,
        temperature: 0.4,
        system: systemPrompt,
        messages: anthropicMessages,
        stream: true,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!anthropicResp.ok) {
      const errText = await anthropicResp.text().catch(() => "");
      console.error("[claude-dashboard-chat] Anthropic error:", anthropicResp.status, "model:", CLAUDE_MODEL, "body:", errText);
      if (anthropicResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          error: "AI service unavailable",
          upstream_status: anthropicResp.status,
          upstream_body: errText.slice(0, 1000),
          model: CLAUDE_MODEL,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!anthropicResp.body) {
      return new Response(JSON.stringify({ error: "Empty AI response" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reader = anthropicResp.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(out) {
        let buf = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });

            let nl: number;
            while ((nl = buf.indexOf("\n")) !== -1) {
              const line = buf.slice(0, nl).replace(/\r$/, "");
              buf = buf.slice(nl + 1);
              if (!line.startsWith("data: ")) continue;
              const payload = line.slice(6).trim();
              if (!payload) continue;
              try {
                const evt = JSON.parse(payload);
                if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
                  const text = evt.delta.text || "";
                  if (text) {
                    const openaiChunk = {
                      choices: [{ delta: { content: text } }],
                    };
                    out.enqueue(encoder.encode(`data: ${JSON.stringify(openaiChunk)}\n\n`));
                  }
                } else if (evt.type === "message_stop") {
                  out.enqueue(encoder.encode(`data: [DONE]\n\n`));
                }
              } catch {
              }
            }
          }
          out.enqueue(encoder.encode(`data: [DONE]\n\n`));
        } catch (e) {
          console.error("[claude-dashboard-chat] stream error:", e);
        } finally {
          try { out.close(); } catch {}
        }
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    console.error("[claude-dashboard-chat] error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
