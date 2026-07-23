// deno-lint-ignore-file no-explicit-any
/**
 * Deal Admin Agent — cross-source intelligence engine.
 *
 * Pulls structured signals per deal (emails, calendar items, activity,
 * status notes, funding sources, tasks, stage history, milestones),
 * asks the model to propose EXECUTABLE Approval Queue items, then
 * applies the promotion rule (clear target object + proposed values +
 * confidence) before inserting into ai_action_queue.
 *
 * Output items conform to the executable contract documented in the
 * Approval Queue spec and are written with the rich fields the queue
 * UI + approval-queue-execute router consume.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { businessDaysBetween } from "./businessDays.ts";

// 5th Line workspace — only this company gets the "Active Pipeline" scope filter.
const FIFTH_LINE_COMPANY_ID = "44556c46-9127-4b12-b14e-d6fee784afcf";

// Tone presets applied to every model call.
const INTERNAL_TONE = "concise, fairly informal, not casual or funny";
const EXTERNAL_TONE = "concise, semi-formal, acquaintance / friendly";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5-20250929";

// Knowledge-base retrieval (RAG) — uses Lovable AI Gateway embeddings so we
// only pull the chunks relevant to the deal we're evaluating instead of
// re-injecting every uploaded document on every call.
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const EMBED_URL = "https://ai.gateway.lovable.dev/v1/embeddings";
const EMBED_MODEL = "openai/text-embedding-3-small";
const KB_MATCH_COUNT = 6;
const KB_PER_CHUNK_CAP = 1200;
const KB_TOTAL_CAP = 8000;

async function embedQuery(text: string): Promise<number[] | null> {
  if (!LOVABLE_API_KEY) return null;
  const input = text.trim().slice(0, 6000);
  if (!input) return null;
  try {
    const res = await fetch(EMBED_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
      body: JSON.stringify({ model: EMBED_MODEL, input }),
    });
    if (!res.ok) {
      console.warn(`[deal-admin-agent] embed ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const json = await res.json();
    const vec = json?.data?.[0]?.embedding;
    return Array.isArray(vec) ? (vec as number[]) : null;
  } catch (e) {
    console.warn("[deal-admin-agent] embed failed", (e as Error)?.message);
    return null;
  }
}

function buildKnowledgeQueryText(bundle: DealSignalBundle): string {
  const parts: string[] = [];
  parts.push(`Deal: ${bundle.deal_name || bundle.deal_id}`);
  if (bundle.current.stage) parts.push(`Stage: ${bundle.current.stage}`);
  if (bundle.current.status) parts.push(`Status: ${bundle.current.status}`);
  // Recent qualitative signal — status notes + latest activity give the best
  // topical signal for retrieval.
  const notes = (bundle.status_notes || [])
    .slice(0, 3)
    .map((n: any) => String(n?.note || n?.body || n?.content || "").trim())
    .filter((s: string) => s.length > 0);
  if (notes.length) parts.push(`Recent notes: ${notes.join(" | ")}`);
  const acts = (bundle.activity || [])
    .slice(0, 5)
    .map((a: any) => String(a?.title || a?.summary || a?.description || "").trim())
    .filter((s: string) => s.length > 0);
  if (acts.length) parts.push(`Recent activity: ${acts.join(" | ")}`);
  const stages = (bundle.stage_history || [])
    .slice(0, 3)
    .map((s: any) => `${s?.from_stage ?? "?"} → ${s?.to_stage ?? "?"}`);
  if (stages.length) parts.push(`Stage history: ${stages.join(", ")}`);
  return parts.join("\n");
}

async function retrieveKnowledgeForDeal(
  supabase: SupabaseClient,
  companyId: string,
  tagFilter: string[],
  bundle: DealSignalBundle,
): Promise<string | null> {
  const query = buildKnowledgeQueryText(bundle);
  const vec = await embedQuery(query);
  if (!vec) return null;
  try {
    const { data, error } = await supabase.rpc("match_admin_agent_knowledge", {
      p_company_id: companyId,
      p_agent_key: "admin_agent",
      p_query: vec as unknown as string,
      p_match_count: KB_MATCH_COUNT,
      p_tag_filter: tagFilter.length > 0 ? tagFilter : null,
    });
    if (error) {
      console.warn("[deal-admin-agent] kb rpc failed", error.message);
      return null;
    }
    const rows: any[] = Array.isArray(data) ? data : [];
    if (rows.length === 0) return null;
    let used = 0;
    const blocks: string[] = [];
    for (const r of rows) {
      const snippet = String(r?.content || "").trim().slice(0, KB_PER_CHUNK_CAP);
      if (!snippet) continue;
      if (used + snippet.length > KB_TOTAL_CAP) break;
      used += snippet.length;
      const title = String(r?.title || "Untitled").trim();
      const tags = Array.isArray(r?.tags) && r.tags.length > 0 ? ` [${r.tags.join(", ")}]` : "";
      const sim = typeof r?.similarity === "number" ? ` (relevance ${r.similarity.toFixed(2)})` : "";
      blocks.push(`### ${title}${tags}${sim}\n${snippet}`);
    }
    if (blocks.length === 0) return null;
    const scopeNote = tagFilter.length > 0 ? ` — scoped to tags: ${tagFilter.join(", ")}` : "";
    return `ADMIN AGENT KNOWLEDGE BASE (top ${blocks.length} passages retrieved for this deal${scopeNote} — treat as authoritative reference):\n\n${blocks.join("\n\n---\n\n")}`;
  } catch (e) {
    console.warn("[deal-admin-agent] kb retrieval failed", (e as Error)?.message);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Pass-reason taxonomy — loaded from Knowledge Base docs (tag =      */
/* "pass_reasons") so the enum + mapping guidance are editable in the */
/* Deal Admin Agent Knowledge tab instead of hardcoded here.          */
/* ------------------------------------------------------------------ */

type PassReasonEntry = { key: string; label: string; description: string };

const DEFAULT_PASS_REASON_TAXONOMY: PassReasonEntry[] = [
  { key: "deal_size_mismatch", label: "Deal Size Mismatch", description: "reason references deal size / check size / minimum or maximum size / hold size (e.g. \"too small for us\", \"below our minimum\", \"above our hold\")." },
  { key: "industry_exclusion", label: "Industry Exclusion", description: "reason references industry / sector / vertical / business type exclusion (e.g. \"we don't lend to SaaS\", \"we avoid healthcare services\")." },
  { key: "geographic_restriction", label: "Geographic Restriction", description: "reason references geography / region / country / state / jurisdiction (e.g. \"outside our footprint\", \"we don't lend in Canada\")." },
  { key: "risk_profile_concerns", label: "Risk Profile Concerns", description: "reason references credit / leverage / cash flow / EBITDA / concentration / customer concentration / covenant / rating / underwriting concerns (e.g. \"leverage too high\", \"cash flow coverage is thin\", \"customer concentration risk\")." },
  { key: "timing_issues", label: "Timing Issues", description: "reason references timing / capacity / bandwidth / pipeline / quarter / freeze (e.g. \"we're at capacity this quarter\", \"in a credit freeze right now\", \"revisit next year\")." },
  { key: "relationship_issues", label: "Relationship Issues", description: "reason references sponsor / management / prior deal / reputational concerns (e.g. \"prior experience with sponsor\", \"management team concerns\")." },
  { key: "terms_mismatch", label: "Terms Mismatch", description: "reason references pricing / structure / rate / fees / covenants / structure being unworkable for them (e.g. \"pricing doesn't work for us\", \"structure isn't what we do\")." },
  { key: "other", label: "Other", description: "only when the reason genuinely doesn't map to any category above (or when pass_reason=\"No reason provided\")." },
];

function parsePassReasonTaxonomyFromText(text: string): PassReasonEntry[] {
  if (!text || typeof text !== "string") return [];
  const out: PassReasonEntry[] = [];
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const stripped = line.replace(/^[-*•]\s*/, "");
    const m = stripped.match(/^([a-z][a-z0-9_]{1,60})\s*[—\-|:]\s*(.+)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const rest = m[2].trim();
    let label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    let description = rest;
    const parts = rest.split(/\s*[—|]\s*/);
    if (parts.length >= 2) {
      label = parts[0].trim() || label;
      description = parts.slice(1).join(" — ").trim();
    }
    if (!description) continue;
    out.push({ key, label, description });
  }
  return out;
}

async function loadPassReasonTaxonomy(
  supabase: SupabaseClient,
  companyId: string,
): Promise<{ taxonomy: PassReasonEntry[]; source: "kb" | "default" }> {
  try {
    const { data, error } = await supabase
      .from("admin_agent_knowledge_docs")
      .select("extracted_text, tags, title, updated_at")
      .eq("company_id", companyId)
      .eq("agent_key", "admin_agent")
      .eq("status", "ready")
      .contains("tags", ["pass_reasons"])
      .order("updated_at", { ascending: false })
      .limit(5);
    if (error) {
      console.warn("[deal-admin-agent] loadPassReasonTaxonomy query failed", error.message);
      return { taxonomy: DEFAULT_PASS_REASON_TAXONOMY, source: "default" };
    }
    const rows: any[] = Array.isArray(data) ? data : [];
    if (rows.length === 0) return { taxonomy: DEFAULT_PASS_REASON_TAXONOMY, source: "default" };
    const merged: PassReasonEntry[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const parsed = parsePassReasonTaxonomyFromText(String(row?.extracted_text ?? ""));
      for (const e of parsed) {
        if (seen.has(e.key)) continue;
        seen.add(e.key);
        merged.push(e);
      }
    }
    if (merged.length === 0) return { taxonomy: DEFAULT_PASS_REASON_TAXONOMY, source: "default" };
    if (!seen.has("other")) {
      const otherDefault = DEFAULT_PASS_REASON_TAXONOMY.find((e) => e.key === "other");
      if (otherDefault) merged.push(otherDefault);
    }
    return { taxonomy: merged, source: "kb" };
  } catch (e) {
    console.warn("[deal-admin-agent] loadPassReasonTaxonomy failed", (e as Error)?.message);
    return { taxonomy: DEFAULT_PASS_REASON_TAXONOMY, source: "default" };
  }
}

function buildPassReasonTaxonomyBlock(
  taxonomy: PassReasonEntry[],
  source: "kb" | "default",
): string {
  const header = source === "kb"
    ? "PASS-REASON CATEGORY TAXONOMY (loaded from Deal Admin Agent Knowledge Base — authoritative, overrides any earlier list in these rules). The pass_reason_category enum MUST be one of these keys:"
    : "PASS-REASON CATEGORY TAXONOMY (default — no KB doc tagged \"pass_reasons\" found). The pass_reason_category enum MUST be one of these keys:";
  const enumLine = `  Allowed keys: ${taxonomy.map((t) => `"${t.key}"`).join(" | ")}`;
  const mapping = taxonomy.map((t) => `    • ${t.key} — ${t.description}`).join("\n");
  return `${header}\n${enumLine}\n  Mapping guidance — map the lender's verbatim stated reason to the closest key. The Manager can adjust in the queue, but the agent must pre-select the best match (never leave blank).\n${mapping}`;
}

// Mirrors the AiActionType union used by the queue UI/executor.
const SUPPORTED_ACTION_TYPES = [
  "update_deal_stage",
  "update_deal_status",
  "add_status_note",
  "update_funding_source",
  "create_followup_task",
  "create_milestone",
  "update_milestone",
  "update_contact",
  "update_company",
  "draft_email",
  "escalate",
  "reassign_deal",
  "save_to_data_room",
] as const;
type AdminActionType = typeof SUPPORTED_ACTION_TYPES[number];

const RISK_BY_TYPE: Record<AdminActionType, "low" | "medium" | "high"> = {
  update_deal_stage: "high",
  update_deal_status: "medium",
  add_status_note: "low",
  update_funding_source: "medium",
  create_followup_task: "low",
  create_milestone: "low",
  update_milestone: "low",
  update_contact: "low",
  update_company: "low",
  draft_email: "medium",
  escalate: "high",
  reassign_deal: "high",
  save_to_data_room: "low",
};

const TARGET_TYPE_BY_ACTION: Record<AdminActionType, string> = {
  update_deal_stage: "deal",
  update_deal_status: "deal",
  add_status_note: "deal",
  update_funding_source: "deal_lender",
  create_followup_task: "task",
  create_milestone: "deal_milestone",
  update_milestone: "deal_milestone",
  update_contact: "contact",
  update_company: "company",
  draft_email: "email",
  escalate: "deal",
  reassign_deal: "deal",
  save_to_data_room: "deal",
};

interface DealSignalBundle {
  deal_id: string;
  deal_name: string;
  current: {
    stage: string | null;
    status: string | null;
    deal_owner_user_id: string | null;
    is_flagged: boolean;
    updated_at: string | null;
  };
  funding_sources: any[];
  status_notes: any[];
  activity: any[];
  stage_history: any[];
  milestones: any[];
  calendar_items: any[];
  emails: any[];
  open_tasks: any[];
  claap_recordings: any[];
  email_threads: any[];
  unlinked_terms_emails?: any[];
  referral_sources: any[];
  configured_milestone_titles: string[];
  /**
   * Snapshot of the Hours & Fees section for Rule L-1 qualification
   * comparison. When present and any field is non-null, the LLM may
   * surface these on the update_deal_stage proposal side-by-side with
   * incoming terms extracted from the lender email. The agent NEVER
   * self-certifies whether the incoming terms qualify — the Manager
   * confirms in the Approval Queue.
   */
  qualified_terms_parameters?: {
    deal_value: number | null;
    engagement_type: string | null;
    fee_type: string | null;
    success_fee_percent: number | null;
    retainer_fee: number | null;
    milestone_fee: number | null;
    total_fee: number | null;
    pre_signing_hours: number | null;
    post_signing_hours: number | null;
    has_any_parameter: boolean;
  } | null;
}

export interface CandidateItem {
  action_type: AdminActionType;
  item_title: string;
  linked_entity_label: string;
  target_object_type: string;
  target_object_id: string | null;
  target_field_paths: string[];
  current_values: Record<string, any>;
  proposed_values: Record<string, any>;
  rationale_summary: string;
  evidence_summary: string;
  evidence_references: Array<{
    kind: string;
    label: string;
    ref_id?: string | null;
    snippet?: string | null;
    url?: string | null;
  }>;
  confidence_score: number;
  risk_level: "low" | "medium" | "high";
  bulk_eligible: boolean;
  requires_send_ui: boolean;
  priority: "low" | "normal" | "high" | "urgent";
}

/**
 * SCOPE WHITELIST for the Deal Admin Agent's Approval Queue producer.
 *
 * Exported so unit tests can verify — without invoking Claude — that a
 * given LLM-shaped proposal list collapses to exactly the queue items
 * we expect for the 6 approved triggers (see runDealAdminAgentAnalysis
 * for the full list). Keep in lock-step with the inline `inScope` in
 * `runDealAdminAgentAnalysis`.
 */
const TERMS_STATUS_RE_EXPORT = /term|ioi|loi|indication|proposal/i;
const PASS_STATUS_RE_EXPORT = /pass|declin|not[_\s-]?a?[_\s-]?fit|withdraw|dead|lost|reject|no[_\s-]?go/i;
export function isInDealAdminAgentScope(c: CandidateItem): boolean {
  if (c.action_type === "draft_email") return true;
  if (c.action_type === "save_to_data_room") {
    const pv = (c.proposed_values ?? {}) as Record<string, any>;
    const bundleKey = typeof pv.bundle_key === "string" ? pv.bundle_key : "";
    return bundleKey.startsWith("terms_issued:");
  }
  if (c.action_type === "create_followup_task") {
    // The Deal Admin Agent's ONLY sanctioned use of create_followup_task is
    // the "Schedule a call" trigger — an inbound lender email asking to
    // connect / speak / set up time. Detection tags the proposal with a
    // stable bundle_key so the client-side approve handler can open the
    // calendar popup after the task lands. Anything else must go through a
    // different (whitelisted) action_type.
    // Rule L-1 (Draft Terms branch): a lender email sharing a DRAFT term
    // sheet for feedback also emits a create_followup_task — a review task
    // for the Analyst/Manager. It is tagged `draft_terms_feedback:` so the
    // scope filter allows it without opening the door to unbounded tasks.
    const pv = (c.proposed_values ?? {}) as Record<string, any>;
    const bundleKey = typeof pv.bundle_key === "string" ? pv.bundle_key : "";
    return (
      bundleKey.startsWith("schedule_call:") ||
      bundleKey.startsWith("draft_terms_feedback:")
    );
  }
  if (c.action_type === "update_funding_source") {
    const pv = (c.proposed_values ?? {}) as Record<string, any>;
    const statusBlob = [pv.tracking_status, pv.stage, pv.substage, pv.status]
      .map((v) => (typeof v === "string" ? v : ""))
      .join(" ");
    const textBlob = [
      pv.notes, pv.note, pv.reason,
      c.rationale_summary, c.evidence_summary,
      ...(Array.isArray(c.evidence_references)
        ? c.evidence_references.flatMap((e) => [e?.snippet, e?.label])
        : []),
    ].filter((s) => typeof s === "string").join("\n");
    if (TERMS_STATUS_RE_EXPORT.test(statusBlob) || PASS_STATUS_RE_EXPORT.test(statusBlob)) return true;
    if (!statusBlob.trim() && (TERMS_STATUS_RE_EXPORT.test(textBlob) || PASS_STATUS_RE_EXPORT.test(textBlob))) return true;
    return false;
  }
  return false;
}

export interface AnalyzeOpts {
  supabase: SupabaseClient;
  companyId: string;
  attributionUserId: string;
  activatedUserIds?: Set<string>;
  dealIds?: string[];
  /** Hard cap on deals processed in this run. */
  maxDeals?: number;
  /** Hard cap on enqueued queue rows. */
  maxQueueRows?: number;
  /** Min confidence to enqueue. */
  minConfidence?: number;
  source: "cron" | "manual" | "chat";
  /**
   * When true, the analysis runs end-to-end but does NOT insert into
   * ai_action_queue. The would-be rows are returned on the result for
   * verification (manual "test scan").
   */
  dryRun?: boolean;
}

export interface AnalyzeResult {
  evaluated_deals: number;
  candidates_proposed: number;
  candidates_filtered: number;
  candidates_merged: number;
  queue_rows_inserted: number;
  queue_ids: string[];
  errors: string[];
  /** Pending items removed because the underlying action was already taken. */
  auto_resolved_pending?: number;
  /** Populated when dryRun=true — the rows that WOULD have been inserted. */
  preview_rows?: any[];
}

/* ------------------------------------------------------------------ */
/*  Signal gathering                                                  */
/* ------------------------------------------------------------------ */

const LOOKBACK_DAYS = 30;

async function gatherSignalsForDeal(
  supabase: SupabaseClient,
  deal: any,
  companyId: string,
  activatedUserIds?: Set<string>,
): Promise<DealSignalBundle> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [fs, notes, act, hist, mile, cal, emails, tasks, claap, threads] = await Promise.all([
    supabase
      .from("deal_lenders")
      .select("id, name, stage, substage, notes, pass_reason, tracking_status, last_contact_at, last_status_change_at, updated_at")
      .eq("deal_id", deal.id)
      .order("updated_at", { ascending: false })
      .limit(25),
    supabase
      .from("deal_status_notes")
      .select("id, note, created_at, user_id")
      .eq("deal_id", deal.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("deal_activity")
      .select("id, source, action_type, before, after, created_at")
      .eq("deal_id", deal.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("deal_stage_history")
      .select("id, from_stage, to_stage, changed_at, source, event_type")
      .eq("deal_id", deal.id)
      .order("changed_at", { ascending: false })
      .limit(8),
    supabase
      .from("deal_milestones")
      .select("id, title, due_date, completed, completed_at, status, updated_at")
      .eq("deal_id", deal.id)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(15),
    supabase
      .from("deal_calendar_items")
      .select("id, title, date, time, notes, type, created_at")
      .eq("deal_id", deal.id)
      .gte("date", since.slice(0, 10))
      .order("date", { ascending: false })
      .limit(10),
    supabase
      .from("deal_emails")
      .select("id, gmail_message_id, notes, linked_at")
      .eq("deal_id", deal.id)
      .gte("linked_at", since)
      .order("linked_at", { ascending: false })
      .limit(15),
    supabase
      .from("tasks")
      .select("id, title, status, priority, due_date, assigned_to, updated_at")
      .eq("deal_id", deal.id)
      .in("status", ["open", "in_progress", "blocked", "pending"])
      .order("updated_at", { ascending: false })
      .limit(15),
    // Claap recordings linked to the deal (call transcripts/summaries).
    supabase
      .from("deal_claap_recordings")
      .select("id, recording_id, recording_title, recording_url, recorder_name, recorder_email, duration_seconds, linked_at, notes")
      .eq("deal_id", deal.id)
      .gte("linked_at", since)
      .order("linked_at", { ascending: false })
      .limit(10),
    // Email threads classified as matching this deal.
    supabase
      .from("email_threads")
      .select("id, thread_id, subject, latest_message_at, match_confidence")
      .eq("matched_deal_id", deal.id)
      .gte("latest_message_at", since)
      .order("latest_message_at", { ascending: false })
      .limit(10),
  ]);

  // Hydrate emails with subject/snippet from gmail_messages when possible.
  let emailRows: any[] = emails.data ?? [];
  const msgIds = emailRows
    .map((e) => e.gmail_message_id)
    .filter((v) => typeof v === "string" && v.length > 0);
  if (msgIds.length > 0) {
    const { data: gm } = await supabase
      .from("gmail_messages")
      .select("gmail_message_id, subject, snippet, from_address, received_at")
      .in("gmail_message_id", msgIds);
    const byId = new Map<string, any>((gm ?? []).map((r: any) => [r.gmail_message_id, r]));
    emailRows = emailRows.map((e) => ({
      ...e,
      ...(byId.get(e.gmail_message_id) ?? {}),
    }));
  }

  // Hydrate matched email threads with their latest gmail messages.
  const threadRows: any[] = threads.data ?? [];
  const threadIds = threadRows.map((t) => t.thread_id).filter(Boolean);
  let threadMessages: Record<string, any[]> = {};
  if (threadIds.length > 0) {
    const { data: gmThread } = await supabase
      .from("gmail_messages")
      .select("gmail_message_id, thread_id, subject, snippet, from_email, from_name, received_at")
      .in("thread_id", threadIds)
      .order("received_at", { ascending: false })
      .limit(60);
    for (const m of gmThread ?? []) {
      const tid = (m as any).thread_id as string;
      if (!threadMessages[tid]) threadMessages[tid] = [];
      if (threadMessages[tid].length < 4) threadMessages[tid].push(m);
    }
    // ALSO pull from email_cache (the real synced-emails table for Gmail).
    // email_cache has body_text, which gives the agent enough context to
    // detect "we're going to pass", "not a fit", etc. instead of relying on
    // the truncated snippet only.
    const { data: ecThread } = await supabase
      .from("email_cache")
      .select("gmail_message_id, thread_id, subject, snippet, body_text, from_email, from_name, received_at")
      .in("thread_id", threadIds)
      .order("received_at", { ascending: false })
      .limit(80);
    for (const m of ecThread ?? []) {
      const tid = (m as any).thread_id as string;
      if (!threadMessages[tid]) threadMessages[tid] = [];
      // Skip duplicates by gmail_message_id; otherwise add up to 6 per thread.
      const exists = threadMessages[tid].some(
        (x: any) => x.gmail_message_id === (m as any).gmail_message_id,
      );
      if (!exists && threadMessages[tid].length < 6) {
        threadMessages[tid].push(m);
      } else if (exists) {
        // Merge body_text into the existing entry so downstream sees it.
        const idx = threadMessages[tid].findIndex(
          (x: any) => x.gmail_message_id === (m as any).gmail_message_id,
        );
        if (idx >= 0 && !(threadMessages[tid][idx] as any).body_text) {
          threadMessages[tid][idx] = { ...threadMessages[tid][idx], body_text: (m as any).body_text };
        }
      }
    }
  }
  const enrichedThreads = threadRows.map((t) => ({
    ...t,
    messages: threadMessages[t.thread_id] ?? [],
  }));

  // Pre-compute "business days since last lender contact" for each funding
  // source so the prompt can apply the 3-BD follow-up rule deterministically.
  const today = new Date();
  // Resolve stage/substage UUIDs (or slugs) to human labels using the
  // workspace's lender_stage_configs. This is critical for downstream rules
  // that key off labels like "In Diligence" / "Closed & Funded" instead of
  // opaque UUIDs stored on deal_lenders.stage.
  const { data: stageCfgRows } = await supabase
    .from("lender_stage_configs")
    .select("stages, substages")
    .eq("company_id", companyId)
    .limit(5);
  const stageLabelById = new Map<string, string>();
  const substageLabelById = new Map<string, string>();
  for (const row of (stageCfgRows ?? []) as any[]) {
    for (const s of (row?.stages ?? []) as any[]) {
      if (s?.id && typeof s?.label === "string") stageLabelById.set(String(s.id), s.label);
    }
    for (const s of (row?.substages ?? []) as any[]) {
      if (s?.id && typeof s?.label === "string") substageLabelById.set(String(s.id), s.label);
    }
  }
  const fundingWithBd = (fs.data ?? []).map((f: any) => {
    const lastTs = f.last_contact_at ?? f.last_status_change_at ?? f.updated_at ?? null;
    const bd = lastTs ? businessDaysBetween(new Date(lastTs), today) : null;
    const stageLabel = f.stage ? (stageLabelById.get(String(f.stage)) ?? String(f.stage)) : null;
    const substageLabel = f.substage
      ? (substageLabelById.get(String(f.substage)) ?? String(f.substage))
      : null;
    return {
      ...f,
      business_days_since_last_contact: bd,
      stage_label: stageLabel,
      substage_label: substageLabel,
    };
  });

  // ------------------------------------------------------------------
  //  Per-lender OUTBOUND-AWAITING-REPLY detection
  //  For each funding source: find the most recent outbound email sent
  //  from any of this workspace's users to one of the lender's known
  //  contact emails, then check whether that lender has replied since.
  //  This powers the "outbound with no reply in 2 business days" trigger.
  // ------------------------------------------------------------------
  try {
    const masterIds = Array.from(
      new Set(
        fundingWithBd
          .map((f: any) => f.master_lender_id)
          .filter((v: any): v is string => typeof v === "string" && v.length > 0),
      ),
    );
    const emailsByMaster = new Map<string, string[]>();
    if (masterIds.length > 0) {
      const { data: lcs } = await supabase
        .from("lender_contacts")
        .select("lender_id, email")
        .in("lender_id", masterIds);
      for (const lc of (lcs ?? []) as any[]) {
        const e = (lc.email as string | null)?.toLowerCase();
        if (!e || !lc.lender_id) continue;
        const arr = emailsByMaster.get(lc.lender_id) ?? [];
        if (!arr.includes(e)) arr.push(e);
        emailsByMaster.set(lc.lender_id, arr);
      }
    }
    for (const f of fundingWithBd) {
      const contactEmails: string[] =
        (f.master_lender_id && emailsByMaster.get(f.master_lender_id)) || [];
      if (contactEmails.length === 0) {
        (f as any).outbound_awaiting_reply = null;
        continue;
      }
      // Most recent outbound to any of this lender's contact emails.
      const { data: outRows } = await supabase
        .from("gmail_sent_messages")
        .select("id, gmail_message_id, subject, body_text, sent_at, created_at, to_emails")
        .overlaps("to_emails", contactEmails)
        .order("sent_at", { ascending: false, nullsFirst: false })
        .limit(1);
      const lastOut = (outRows ?? [])[0] as any;
      if (!lastOut) {
        (f as any).outbound_awaiting_reply = null;
        continue;
      }
      const sentAt: string | null =
        (lastOut.sent_at as string | null) ?? (lastOut.created_at as string | null) ?? null;
      if (!sentAt) {
        (f as any).outbound_awaiting_reply = null;
        continue;
      }
      // Any inbound reply from those contact emails after the outbound sent_at?
      const { data: replyRows } = await supabase
        .from("gmail_messages")
        .select("gmail_message_id, from_email, received_at")
        .in("from_email", contactEmails)
        .gt("received_at", sentAt)
        .order("received_at", { ascending: false })
        .limit(1);
      const replied = (replyRows ?? []).length > 0;
      const bdSinceSent = businessDaysBetween(new Date(sentAt), today);
      const body: string = typeof lastOut.body_text === "string" ? lastOut.body_text : "";
      (f as any).outbound_awaiting_reply = {
        sent_at: sentAt,
        subject: lastOut.subject ?? null,
        to_emails: lastOut.to_emails ?? [],
        body_excerpt: body.length > 1600 ? body.slice(0, 1600) + "…" : body,
        business_days_since_sent: bdSinceSent,
        replied,
        reply_received_at: replied ? ((replyRows ?? [])[0] as any)?.received_at ?? null : null,
      };
    }
  } catch (err) {
    console.warn(
      `[deal-admin-agent] outbound-awaiting-reply enrichment failed for deal=${deal.id}:`,
      (err as Error).message,
    );
  }

  // Hydrate claap recordings with transcript / summary / action items from
  // claap_transcripts (deal-linked) and claap_recordings (org-linked).
  const claapRows: any[] = claap.data ?? [];
  // Hydrate deal_claap_recordings with the underlying claap_recordings row so
  // we know the ACTUAL meeting date (started_at) — deal_claap_recordings.linked_at
  // reflects only when the user attached the recording to the deal, not when the
  // meeting happened. Without this, an old June meeting linked yesterday looks
  // like fresh activity and the LLM invents a "captured on <today>" ghost note.
  const linkedRecIds = claapRows
    .map((r) => r.recording_id)
    .filter((v: any) => typeof v === "string" && v.length > 0);
  let linkedRecById = new Map<string, any>();
  if (linkedRecIds.length > 0) {
    const { data: linkedRecRows } = await supabase
      .from("claap_recordings")
      .select("id, title, summary, action_items, key_takeaways, started_at, ended_at, organizer_email, participants, recording_url, transcript_available")
      .in("id", linkedRecIds);
    linkedRecById = new Map<string, any>((linkedRecRows ?? []).map((r: any) => [r.id, r]));
  }
  // Only surface a linked recording if its underlying meeting occurred within
  // the status-note recency window (7 days). Anything older is stale and must
  // not seed a new "Add <deal> <> <call> status note" queue item.
  const RECENCY_MS = 7 * 24 * 60 * 60 * 1000;
  const recencyCutoff = Date.now() - RECENCY_MS;
  const { data: cTrans } = await supabase
    .from("claap_transcripts")
    .select("id, claap_meeting_id, transcript_text, summary, participants, recorded_at, call_type")
    .eq("deal_id", deal.id)
    .gte("recorded_at", since)
    .order("recorded_at", { ascending: false })
    .limit(8);
  const meetingIds = (cTrans ?? []).map((t: any) => t.claap_meeting_id).filter(Boolean);
  let meetingById = new Map<string, any>();
  if (meetingIds.length > 0) {
    const { data: cRec } = await supabase
      .from("claap_recordings")
      .select("id, title, summary, action_items, key_takeaways, started_at, ended_at, organizer_email, participants, recording_url")
      .in("id", meetingIds);
    meetingById = new Map<string, any>((cRec ?? []).map((r: any) => [r.id, r]));
  }
  const enrichedClaap = [
    ...claapRows
      .map((r) => {
        const rec = r.recording_id ? linkedRecById.get(r.recording_id) : null;
        const startedAt = rec?.started_at ?? null;
        const startedMs = startedAt ? Date.parse(startedAt) : NaN;
        // Drop stale meetings (>7 days old) OR entries we can't date at all.
        // Both categories were the source of ghost "Add <deal> <> <call> status
        // note" items — the LLM would invent a recent date because the bundle
        // gave it a title with no anchor.
        if (!Number.isFinite(startedMs) || startedMs < recencyCutoff) return null;
        return {
          source: "deal_claap_recordings",
          id: r.id,
          recording_id: r.recording_id,
          title: rec?.title ?? r.recording_title,
          url: r.recording_url ?? rec?.recording_url,
          recorder: r.recorder_name ?? r.recorder_email,
          duration_seconds: r.duration_seconds,
          linked_at: r.linked_at,
          notes: r.notes,
          recorded_at: startedAt,
          ended_at: rec?.ended_at ?? null,
          organizer_email: rec?.organizer_email ?? null,
          participants: rec?.participants ?? null,
          summary: rec?.summary ?? null,
          action_items: rec?.action_items ?? null,
          key_takeaways: rec?.key_takeaways ?? null,
          transcript_available: rec?.transcript_available ?? null,
        };
      })
      .filter((v): v is any => v !== null),
    ...(cTrans ?? []).map((t: any) => {
      const m = meetingById.get(t.claap_meeting_id);
      return {
        source: "claap_transcripts",
        id: t.id,
        title: m?.title ?? null,
        recorded_at: t.recorded_at,
        call_type: t.call_type,
        participants: t.participants ?? m?.participants ?? null,
        organizer_email: m?.organizer_email ?? null,
        url: m?.recording_url ?? null,
        summary: t.summary ?? m?.summary ?? null,
        action_items: m?.action_items ?? null,
        key_takeaways: m?.key_takeaways ?? null,
        transcript_excerpt:
          typeof t.transcript_text === "string" ? t.transcript_text.slice(0, 4000) : null,
      };
    }),
  ];

  // Fallback: name-match Claap recordings + calendar events that no one
  // has explicitly linked to this deal yet. These are the signals that
  // power proposals like "Had call 6/18 — submitting to lenders next
  // week" when the deal has no deal_calendar_items / deal_claap_recordings.
  const dealNameRaw = (deal.company ?? "").trim();
  const nameToken = dealNameRaw.split(/\s+/)[0] ?? dealNameRaw;
  if (dealNameRaw && nameToken.length >= 3) {
    const linkedTitles = new Set(enrichedClaap.map((r: any) => (r.title ?? "").toLowerCase()));
    // Use word-boundary regex matching (not substring ilike) so a deal named
    // "LASSO" does not falsely match titles containing "Galasso", or "Bond"
    // matching "Bondurant", etc. Escape any regex metachars in the deal name.
    const escapedName = dealNameRaw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const wordBoundaryPattern = `\\m${escapedName}\\M`;
    const { data: nameClaap } = await supabase
      .from("claap_recordings")
      .select("id, title, summary, action_items, key_takeaways, started_at, ended_at, organizer_email, participants, recording_url")
      .eq("org_company_id", companyId)
      .filter("title", "imatch", wordBoundaryPattern)
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(5);
    for (const r of nameClaap ?? []) {
      const t = ((r as any).title ?? "").toLowerCase();
      if (linkedTitles.has(t)) continue;
      enrichedClaap.push({
        source: "claap_recordings_name_match",
        id: (r as any).id,
        title: (r as any).title,
        recorded_at: (r as any).started_at,
        organizer_email: (r as any).organizer_email,
        participants: (r as any).participants,
        url: (r as any).recording_url,
        summary: (r as any).summary,
        action_items: (r as any).action_items,
        key_takeaways: (r as any).key_takeaways,
        transcript_excerpt: null,
      });
    }

    const { data: nameCal } = await supabase
      .from("calendar_events")
      .select("id, title, start_time, end_time, organizer_email, attendees, meeting_url, is_cancelled")
      .filter("title", "imatch", wordBoundaryPattern)
      .gte("start_time", since)
      .order("start_time", { ascending: false })
      .limit(8);
    var nameCalendarEvents = (nameCal ?? []).filter((e: any) => !e.is_cancelled);
  } else {
    var nameCalendarEvents: any[] = [];
  }

  // ----- Unlinked TERMS emails (subject/body/attachment mentions deal name)
  // Scan inbox emails that are NOT yet linked to this deal but clearly deliver
  // a term sheet / IOI / LOI / proposal for the deal (per the deal name). This
  // powers the TERMS_ISSUED_RULES trigger even when the email thread hasn't
  // been classified/matched to the deal yet.
  const unlinkedTermsEmails: any[] = [];
  if (dealNameRaw && nameToken.length >= 3) {
    const escapedNameSql = dealNameRaw.replace(/[%_]/g, (m) => `\\${m}`);
    const nameLike = `%${escapedNameSql}%`;
    const userScope = activatedUserIds && activatedUserIds.size > 0
      ? Array.from(activatedUserIds)
      : null;
    let q = supabase
      .from("email_cache")
      .select("gmail_message_id, thread_id, subject, snippet, body_text, from_email, from_name, to_emails, attachments, received_at")
      .gte("received_at", since)
      .or(`subject.ilike.${nameLike},body_text.ilike.${nameLike},snippet.ilike.${nameLike}`)
      .order("received_at", { ascending: false })
      .limit(40);
    if (userScope) q = q.in("user_id", userScope);
    const { data: cand } = await q;
    const TERMS_RE = /(term\s*sheet|termsheet|\bIOI\b|indication\s+of\s+interest|\bLOI\b|letter\s+of\s+intent|proposal|preliminary\s+terms|issued\s+terms|pricing\s+terms)/i;
    const ATT_RE = /(term[\s_-]*sheet|\bIOI\b|indication|\bLOI\b|letter[\s_-]*of[\s_-]*intent|proposal|pricing|preliminary\s+terms)/i;
    for (const m of (cand ?? []) as any[]) {
      const subj = String(m.subject ?? "");
      const body = String(m.body_text ?? m.snippet ?? "");
      const attNames: string[] = Array.isArray(m.attachments)
        ? m.attachments
            .map((a: any) => (typeof a?.filename === "string" ? a.filename : ""))
            .filter(Boolean)
        : [];
      const bodyOrSubjectHasTerms = TERMS_RE.test(subj) || TERMS_RE.test(body);
      const attachmentHasTerms = attNames.some((n) => ATT_RE.test(n));
      if (!bodyOrSubjectHasTerms && !attachmentHasTerms) continue;
      unlinkedTermsEmails.push({
        source: "email_cache_unlinked_terms_match",
        gmail_message_id: m.gmail_message_id,
        thread_id: m.thread_id,
        subject: subj,
        snippet: typeof m.snippet === "string" ? m.snippet.slice(0, 300) : null,
        body_excerpt: body ? body.slice(0, 2000) : null,
        from_email: m.from_email,
        from_name: m.from_name,
        to_emails: m.to_emails,
        received_at: m.received_at,
        attachments: attNames,
        matched_deal_name: dealNameRaw,
        match_reasons: {
          name_in_subject: subj.toLowerCase().includes(dealNameRaw.toLowerCase()),
          name_in_body: body.toLowerCase().includes(dealNameRaw.toLowerCase()),
          terms_language_in_email: bodyOrSubjectHasTerms,
          terms_attachment_filename: attachmentHasTerms,
        },
      });
      if (unlinkedTermsEmails.length >= 8) break;
    }
  }

  return {
    deal_id: deal.id,
    deal_name: deal.company ?? "Untitled Deal",
    current: {
      stage: deal.stage ?? null,
      status: deal.status ?? null,
      deal_owner_user_id: deal.deal_owner_user_id ?? null,
      is_flagged: !!deal.is_flagged,
      updated_at: deal.updated_at ?? null,
    },
    qualified_terms_parameters: (() => {
      const num = (v: any) => (typeof v === "number" && Number.isFinite(v) ? v : v == null ? null : Number(v) || null);
      const p = {
        deal_value: num(deal.value),
        engagement_type: (deal.engagement_type ?? null) as string | null,
        fee_type: (deal.fee_type ?? null) as string | null,
        success_fee_percent: num(deal.success_fee_percent),
        retainer_fee: num(deal.retainer_fee),
        milestone_fee: num(deal.milestone_fee),
        total_fee: num(deal.total_fee),
        pre_signing_hours: num(deal.pre_signing_hours),
        post_signing_hours: num(deal.post_signing_hours),
        has_any_parameter: false,
      };
      p.has_any_parameter = [
        p.deal_value, p.engagement_type, p.fee_type, p.success_fee_percent,
        p.retainer_fee, p.milestone_fee, p.total_fee,
        p.pre_signing_hours, p.post_signing_hours,
      ].some((v) => v !== null && v !== "" && v !== 0);
      return p;
    })(),
    funding_sources: fundingWithBd,
    status_notes: notes.data ?? [],
    activity: act.data ?? [],
    stage_history: hist.data ?? [],
    milestones: mile.data ?? [],
    calendar_items: [
      ...(cal.data ?? []).map((c: any) => ({ ...c, source: "deal_calendar_items" })),
      ...nameCalendarEvents.map((e: any) => ({
        source: "calendar_events_name_match",
        id: e.id,
        title: e.title,
        date: typeof e.start_time === "string" ? e.start_time.slice(0, 10) : null,
        start_time: e.start_time,
        end_time: e.end_time,
        organizer_email: e.organizer_email,
        attendees: e.attendees,
        meeting_url: e.meeting_url,
      })),
    ],
    emails: emailRows,
    open_tasks: tasks.data ?? [],
    claap_recordings: enrichedClaap,
    email_threads: enrichedThreads,
    unlinked_terms_emails: unlinkedTermsEmails,
    referral_sources: await gatherReferralSourcesForDeal(supabase, deal, since, today),
    configured_milestone_titles: await gatherConfiguredMilestoneTitles(supabase, companyId),
  };
}

/**
 * Load the workspace's configured default milestone titles. The Deal
 * Admin Agent is only allowed to propose create_milestone for titles
 * that exactly match one of these — milestones are a curated taxonomy
 * set by the company, not free-form AI suggestions.
 */
const CONFIGURED_MILESTONE_CACHE = new Map<string, { ts: number; titles: string[] }>();
async function gatherConfiguredMilestoneTitles(
  supabase: SupabaseClient,
  companyId: string,
): Promise<string[]> {
  const cached = CONFIGURED_MILESTONE_CACHE.get(companyId);
  if (cached && Date.now() - cached.ts < 5 * 60_000) return cached.titles;
  const { data } = await supabase
    .from("default_milestones")
    .select("title")
    .eq("company_id", companyId);
  const titles = Array.from(
    new Set(
      (data ?? [])
        .map((r: any) => (typeof r?.title === "string" ? r.title.trim() : ""))
        .filter((t: string) => t.length > 0),
    ),
  );
  CONFIGURED_MILESTONE_CACHE.set(companyId, { ts: Date.now(), titles });
  return titles;
}

/**
 * Build a per-deal list of referral sources the deal manager should
 * keep in the loop, each annotated with:
 *   - business_days_since_last_outbound: outbound email to that source
 *   - stage_changed_since_last_outbound: deal stage moved with no update sent
 *   - meaningful_events_since_last_outbound: stage history / new lenders /
 *     milestone completions / term-sheet status notes that occurred AFTER
 *     the last outbound message
 * The model uses these flags to fire rules R1/R2/R3.
 */
async function gatherReferralSourcesForDeal(
  supabase: SupabaseClient,
  deal: any,
  since: string,
  today: Date,
): Promise<any[]> {
  const out: any[] = [];
  const refSourceId = deal.referral_source_id as string | null | undefined;
  if (!refSourceId) return out;

  const { data: rs } = await supabase
    .from("referral_sources")
    .select("id, name, email, phone, company, type")
    .eq("id", refSourceId)
    .maybeSingle();
  if (!rs || !(rs as any).email) return out;
  const email = String((rs as any).email).toLowerCase();

  // Last outbound email sent to this referral source (any deal, any time).
  const { data: lastOutbound } = await supabase
    .from("gmail_sent_messages")
    .select("id, subject, sent_at, created_at, body_text")
    .contains("to_emails", [email])
    .order("sent_at", { ascending: false, nullsFirst: false })
    .limit(1);
  const lastOut = (lastOutbound ?? [])[0] ?? null;
  const lastOutAt: string | null =
    (lastOut?.sent_at as string | null) ?? (lastOut?.created_at as string | null) ?? null;
  const bdSinceOutbound = lastOutAt
    ? businessDaysBetween(new Date(lastOutAt), today)
    : null;

  // Recent stage transitions on this deal AFTER the last outbound.
  const cutoff = lastOutAt ?? since;
  const { data: stagesSince } = await supabase
    .from("deal_stage_history")
    .select("from_stage, to_stage, changed_at")
    .eq("deal_id", deal.id)
    .gt("changed_at", cutoff)
    .order("changed_at", { ascending: false })
    .limit(5);

  // New funding sources added since the last outbound.
  const { data: newLenders } = await supabase
    .from("deal_lenders")
    .select("id, name, stage, created_at")
    .eq("deal_id", deal.id)
    .gt("created_at", cutoff)
    .limit(10);

  // Milestones completed since the last outbound.
  const { data: doneMiles } = await supabase
    .from("deal_milestones")
    .select("id, title, completed_at")
    .eq("deal_id", deal.id)
    .eq("completed", true)
    .gt("completed_at", cutoff)
    .limit(10);

  // Status notes added since the last outbound (term sheet, diligence, etc).
  const { data: notesSince } = await supabase
    .from("deal_status_notes")
    .select("id, note, created_at")
    .eq("deal_id", deal.id)
    .gt("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(10);

  out.push({
    id: (rs as any).id,
    name: (rs as any).name,
    email,
    phone: (rs as any).phone ?? null,
    company: (rs as any).company ?? null,
    type: (rs as any).type ?? null,
    last_outbound_at: lastOutAt,
    last_outbound_subject: (lastOut as any)?.subject ?? null,
    business_days_since_last_outbound: bdSinceOutbound,
    stage_changes_since_last_outbound: stagesSince ?? [],
    new_lenders_since_last_outbound: newLenders ?? [],
    milestones_completed_since_last_outbound: doneMiles ?? [],
    status_notes_since_last_outbound: notesSince ?? [],
  });
  return out;
}

/* ------------------------------------------------------------------ */
/*  AI call                                                            */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You are the Deal Admin Agent for a credit/M&A advisory CRM.

Your job: read structured signals about a single deal and propose ONLY EXECUTABLE actions for a human approver — never vague reminders.

Rules:
- Each proposed action MUST target a specific object (deal, deal_lender, deal_milestone, task, contact, company, email) by id.
- Each proposed action MUST include concrete current_values and proposed_values for the fields you intend to change.
- If signals are weak, conflicting, or you cannot identify a target field + value, DO NOT propose anything for that observation.
- Prefer fewer high-quality items over many low-quality ones. If you have no strong proposals, return an empty array.
- Use confidence_score 0..1. Only items >= 0.6 will be surfaced.
- Set bulk_eligible=true only for clearly low-risk items (e.g. adding a status note that mirrors a fact already evidenced).
- For draft_email, set requires_send_ui=true and include proposed_values { to, subject, body }.
- Allowed action_type values: ${SUPPORTED_ACTION_TYPES.join(", ")}.
- linked_entity_label = short human label, e.g. "LAGO Innovation on Censys Technologies".
- evidence_references must cite the signal that justifies the proposal (kind ∈ email|email_thread|calendar|claap_recording|activity|status_note|funding_source|stage_history|milestone|task).
- When a Claap recording, calendar event, or email thread describes a meeting that happened ("had call on 6/18", "kickoff scheduled"), the DEFAULT proposal is an add_status_note that synthesizes (a) what happened, (b) who was on it, (c) the stated next step — phrased as a natural status update the deal owner would write. Use call_type, participants, transcript_excerpt, summary, action_items, and next-step language to ground the note. Always cite the claap_recording / calendar / email_thread evidence.
- Cross-reference signals: if an email thread + a claap recording + a calendar item all describe the same meeting/topic, MERGE them into a single high-confidence add_status_note (or follow-up task / milestone) rather than emitting one item per source.
- Pull concrete details into proposed_values.note — names, dates ("6/18"), specific commitments ("submit to lenders early next week"). Never write vague text like "follow up" or "review item".

TONE
- Internal copy (status notes, internal tasks, internal task descriptions): ${INTERNAL_TONE}.
- External drafts (draft_email to lenders, referral sources, clients): ${EXTERNAL_TONE}.
- If a user_style_fingerprint block is provided, mimic that user's phrasing/length tendencies in both internal and external copy.

CALL TYPE TAXONOMY — naitive / 5th Line invite titles (apply BEFORE writing any status note or follow-up that names the call type)
- Map calendar event titles and Claap recording titles to call_type using the rules below. NEVER guess a call type from stage alone, and NEVER default to "discovery call" when the invite title says otherwise.
- Title contains "Financing Feedback" / "Feedback Call" / "Feedback & Walkthrough" / "Feedback and Walkthrough"  → call_type = "Financing Feedback Call". This is a feedback/walkthrough meeting AFTER initial review — never describe it as a discovery, intro, or first call.
- Title matches "{Company} <> 5th Line Financing Review" (or "{Company} <> 5th Line" with no other qualifier)  → call_type = "Financing Review Call" (this is the discovery / sales / first intro call at 5th Line).
- Title contains "Kick-Off" / "Kickoff" / "Kick Off"  → call_type = "Kick-Off Call".
- Title contains "Onboarding"  → call_type = "Onboarding Call".
- Title contains "Lender" / "Lender Sync" / "{Lender Name}"  → call_type = "Lender Call".
- Title contains "Qualification" / "Qual Call"  → call_type = "Qualification Call".
- Title contains "Term Sheet" / "Proposal"  → call_type = "Term Sheet / Proposal Walkthrough".
- When in doubt, quote the literal invite title in the status note instead of inventing a generic label. Do NOT call a meeting a "discovery call" or "intro call" if the invite title contains "Feedback", "Walkthrough", "Kick", "Onboarding", "Lender", "Term Sheet", or "Proposal".
- The structured call_type field on a Claap recording is advisory only — the calendar / invite title ALWAYS wins when the two disagree.

EMAIL SIGNAL → ACTION MAPPING (apply rigorously)
- ETA commitment from a counterparty ("I'll send financials by Friday") → add_status_note capturing the commitment AND a create_followup_task due the committed date, assigned to the deal manager.
- Status signal ("still working on materials", "almost done") → add_status_note only.
- Blocker / delay ("won't be ready until tomorrow", "pushing to next week") → add_status_note AND, if the blocker is on a specific lender, update_funding_source with the new ETA in notes.
- Implicit next step from the deal manager ("let me check and get back to you", "I'll circle back") → create_followup_task on the deal manager.

STATUS NOTE RECENCY GATE — apply strictly
- Status notes exist to capture RECENT activity. NEVER propose an add_status_note whose underlying event (call, email, milestone, lender movement) is more than 7 CALENDAR DAYS old relative to "now" in the bundle. If the newest supporting evidence is older than 7 days, emit NOTHING — do not backfill historical activity into the queue.
- The 7-day window applies to the DATE OF THE EVENT itself (calendar event start/end, claap recording started_at, email sent_at, milestone completed_at, funding_source last_contact_at), not to when you noticed it. A meeting from 3+ weeks ago is stale even if no note was ever written — leave it alone.
- If multiple signals describe the same event, use the most recent one to check recency; if all are >7 days old, drop the proposal.
- NEVER PROPOSE PLACEHOLDER / GHOST STATUS NOTES. If a claap recording (or any other signal) has no summary, no transcript_excerpt, no action_items, and no key_takeaways — i.e. you have nothing but a title and a date — DO NOT emit an add_status_note. A note that says "call happened, details to follow", "full details to be added once transcript/summary is available", "captured on <date>", or any similar placeholder is FORBIDDEN. Wait until the recording is hydrated with real content, then emit ONE note grounded in that content.
- The mere existence of a deal_claap_recordings link (a user attaching a call to a deal) is NOT itself a new event — the meeting date is what counts. If the underlying meeting is >7 days old, treat it as stale even though the link is fresh.

FUNDING SOURCE (LENDER) UPDATE GATE — apply strictly
- ONLY propose update_funding_source when the lender's situation clearly maps to ONE of:
    (a) PASS / DECLINE on this deal — lender says they are "passing", "going to pass", "we'll pass", "it's a pass", "have to pass", "going to have to take a pass", "decline", "not going to be able to get comfortable", "not moving forward", "not interested at this time", or any clear variation. Propose stage="passed" AND populate proposed_values.pass_reason with the lender's actual stated reason quoted/paraphrased from the email thread (e.g. "leverage too high", "outside credit box", "industry concentration"). If no reason is given, set pass_reason="No reason provided" — do NOT invent one. ALSO populate proposed_values.notes with a concise 1–2 sentence factual, neutral summary of why the lender is passing, grounded strictly in the email content (no speculation, no filler, hard cap 2 sentences). This is what gets written to the lender's status note on approval.
    (a2) NOT A FIT — lender says the deal is "not a fit", "not for us", "doesn't fit our box/mandate", "outside our criteria", "not in our wheelhouse", or similar. Propose stage="not_a_fit" (NOT "passed") and capture the fit reason in proposed_values.pass_reason. ALSO populate proposed_values.notes with a concise 1–2 sentence factual, neutral summary of why the deal is not a fit, grounded strictly in the email content (no speculation, hard cap 2 sentences).
    (b) TERM SHEET / IOI / indication / proposal / pricing terms issued or revised → propose the matching terms stage.
    (c) HOLD / PAUSE on the deal — ONLY when the lender EXPLICITLY says so. Trigger language: "revisit", "table this", "pause", "postpone", "circle back later", "park this", "put on hold", "shelve", "come back to this in <N> weeks". Propose stage="on-hold".
        Do NOT infer hold from silence, slow replies, missed deadlines, or your own assumption that the lender is "probably busy". Those are unresponsive, not on hold.
    (d) UNRESPONSIVE — multiple follow-ups with no response from the funding source (multiple unanswered nudges, no reply past a committed date, or business_days_since_last_contact materially exceeds normal cadence) and there is NO explicit hold/pause language anywhere in the thread. Propose stage="unresponsive". This is the correct status whenever the only signal is absence of a response — never collapse this into "on-hold", "passed", or "not_a_fit".
        HARD GUARD: BEFORE proposing "unresponsive" for a lender, scan calendar_items and claap_recordings for a meeting whose title/attendees/participants include that lender's name AND whose date falls in the last 5 days. If ANY such meeting exists, DO NOT propose "unresponsive" — a meeting IS contact. Instead emit an add_status_note asking the deal owner to confirm what was reviewed with {Lender} on {meeting date} (e.g. "Did you review {Deal} with {Lender} on {date}? Please add a status note."). Never treat email silence as unresponsiveness when a real meeting just happened.
- STAGE DISAMBIGUATION (apply in this exact order):
    1. Silence only (no reply, multiple unanswered follow-ups) → "unresponsive".
    2. Lender quoted saying "not a fit" / "not for us" / "outside our box" → "not_a_fit" + pass_reason.
    3. Lender quoted saying "pass" / "passing" / "going to pass" / "decline" → "passed" + pass_reason (quote the reason from the same email if present).
    4. Lender quoted explicitly pausing the deal → "on-hold".
    Never substitute one for another, and never collapse silence into passed/not_a_fit/on-hold.
- RATIONALE WORDING for update_funding_source:
    • Silence pattern → "{Lender} has had {N} follow-ups with no response on {Deal}, so the correct status is Unresponsive."
    • Not-a-fit pattern → "{Lender} said the deal is not a fit ({short reason quoted from their email}), so the correct status is Not a Fit."
    • Pass pattern → "{Lender} is passing on {Deal} — reason: {short reason quoted from their email}. Updating to Passed with that reason."
    • On-hold pattern → quote the explicit pause language from the lender.
    Never recommend "on-hold" from a silence pattern, and never recommend "passed" from a not-a-fit pattern (or vice versa).
- A generic inbound inquiry, intro pleasantry, scheduling note, materials request, diligence question, or any other neutral lender email is NOT sufficient on its own — do NOT propose update_funding_source for those. Use add_status_note instead if anything is worth recording.
- Cite the specific email (kind="email") whose excerpt contains the pass/terms/hold language as evidence. For an UNRESPONSIVE proposal, cite the most recent outbound nudge plus the funding_source's business_days_since_last_contact as evidence (kind="funding_source") — never invent lender wording that isn't in the thread.
- NEVER emit a create_followup_task whose title/description is a generic "update funding sources" reminder (e.g. "Update Funding Sources for {Deal}"). Those are noise; real lender movements belong on update_funding_source with a citation.
- NEVER emit a create_followup_task whose title/description is a generic "update stage" reminder (e.g. "Update Stage for {Deal}"). Stage moves belong on update_deal_stage with a concrete proposed stage and evidence.
- NEVER emit a create_followup_task whose title/description is a generic "follow up" / "follow-up" reminder (e.g. "Follow up on {Deal}", "Follow-up task", "Create follow-up task"). Tasks must describe the concrete action — who does what by when. Vague "follow up" cards are noise.

DEAL STATUS UPDATE GATE — apply strictly
- Deal STATUS is a HEALTH badge with a strict enum: "on-track", "at-risk", "off-track" (or cleared / no status). It is NEVER a lifecycle word like "Active", "Live", "In Progress", "Pending", "Working", "Open", "Closed", "Won", "Lost", "Funded", "Kickoff". Those are stages or narrative — not statuses.
- ONLY propose update_deal_status when the evidence clearly maps to one of {on-track, at-risk, off-track}. If the evidence does not clearly warrant one of those three values, emit NOTHING for status (do not propose "Active" or any other value).
- If you want to record narrative about how the deal is going, use add_status_note instead.

MILESTONE UPDATE GATE — apply strictly
- Do NOT propose update_milestone (or create_milestone) for a "Kick-Off" / "Kickoff" / "Kick Off" milestone based on emails, claap recordings, intro/discovery/scoping calls, or any meeting that is merely scheduled. An intro call is NEVER a kick-off.
- ONLY propose update_milestone for a Kick-Off milestone when ALL of these are true:
    1. The calendar (deal_calendar_items / calendar) contains an event whose **title itself** clearly reads as a kick-off for THIS deal — title must match /kick[\\s-]?off/i (e.g. "{Deal} <> 5th Line Kick Off", "{Deal} Kick-Off Call"). A "RE:" / "Fw:" thread subject, an intro/discovery/scoping/feasibility/credit-referral/financing-feedback invite, or any title that does NOT itself contain "kick off" / "kickoff" / "kick-off" DOES NOT QUALIFY — even if the meeting has happened.
    2. That calendar event's date (and time, if present) is already in the past relative to "now" — the meeting has actually occurred, not just been scheduled.
    3. The deal has an existing Kick-Off milestone that is not already completed.
  If any of these is missing, emit NOTHING for the Kick-Off milestone — no update_milestone, no create_milestone, no generic "update milestone" follow-up task.
- When all three conditions ARE met, emit a single update_milestone with:
    item_title = "Check off {Deal Name} Kick-Off Milestone"
    target_object_type = "deal_milestone", target_object_id = the kick-off milestone id
    proposed_values = { completed: true, status: "completed", completed_at: <calendar event end ISO> }
    evidence_references MUST cite the kick-off calendar event (kind="calendar") whose excerpt/title contains "kick off" / "kickoff" / "kick-off". Do NOT cite a non-kickoff invite as kick-off evidence.
- Never confuse an intro/discovery/scoping/first call with a kick-off. Different meeting → no kick-off proposal.

CREATE MILESTONE GATE — apply strictly
- Milestones are a CURATED TAXONOMY set by the workspace. The bundle includes configured_milestone_titles (the company's allowed milestone titles from default_milestones). NEVER invent new milestone titles.
- Do NOT propose create_milestone unless proposed_values.title EXACTLY matches (case-insensitive, trimmed) one of configured_milestone_titles AND that milestone does not already exist on this deal (check the deal's existing milestones[]).
- If configured_milestone_titles is empty, NEVER propose create_milestone for this deal under any circumstance.
- Do NOT propose create_milestone from emails, claap recordings, intro/discovery/feasibility/assessment/term-sheet language, or any signal — unless the exact configured title applies AND is missing on the deal.
- If a real workflow event matters but no matching configured milestone exists, use add_status_note (or create_followup_task) instead — never invent a milestone.

CLAAP RECORDING MAPPING
- For every Claap recording in the bundle that does NOT already have a matching status_note within 48h: emit one add_status_note synthesizing what happened, who was on it, decisions reached, and next step.
- Each distinct action_item from the recording becomes a separate create_followup_task assigned to the deal manager, with due_date set to the action item's deadline if present.

LENDER FOLLOW-UP RULES (use funding_sources[].business_days_since_last_contact)
- TERMINAL LENDER GUARD (applies to ALL rules below): NEVER propose any lender nudge / draft_email / follow-up for a funding source whose tracking_status, stage, or substage matches any of: "not_a_fit", "not a fit", "passed", "pass", "declined", "withdraw(n)", "dead", "lost", "rejected", "closed", "no_go", "unresponsive", "on_hold", "on hold", "paused". These lenders are RESOLVED — there is nothing to nudge. If the lender is in any of these states, emit nothing for them under any rule.
- DILIGENCE CONCENTRATION GUARD (applies to ALL rules below): If ANY funding_source on this deal has a stage/substage/tracking_status indicating "in diligence" / "due diligence" / "in_diligence" / "diligence", the deal is concentrated with that lender. Do NOT propose ANY lender nudge / draft_email / follow-up for OTHER funding sources that are not themselves in diligence — we are not shopping the deal while a lender is in DD. Only the lender(s) actively in diligence may receive a nudge under L1–L3.
- Rule L1: funding_sources[].business_days_since_last_contact >= 3 AND tracking_status is active/engaged (NOT any terminal state listed above) → draft_email to that lender (requires_send_ui=true) gently nudging for an update. Cite the funding_source id as target_object_id and as evidence (kind="funding_source").
- Rule L2: An outbound email to a lender contact reads as urgent (deadline language, escalation, "ASAP", calling out timing) AND no inbound reply has arrived → draft_email re-pinging that lender. Reference the email id in evidence (kind="email"). Tone: still semi-formal, do not blame.
- Rule L3: A lender explicitly stated they would respond by date X (parsed from an email, claap transcript, or status note) AND that date is today or in the past with no reply since → draft_email referencing their commitment, plus an optional internal create_followup_task for the deal manager.
- All lender draft_email items: proposed_values must include { to (array of email strings), subject, body }. Keep body under 120 words.
- Do not nudge the same lender more than once per scan — pick the strongest rule and emit one draft.`;

const LENDER_FOLLOWUP_TITLE_RULE = `

LENDER DRAFT EMAIL TITLE — HARD RULE
- item_title for any lender draft_email MUST begin with "Follow up" (e.g. "Follow up with {Lender} on {Deal}"). NEVER use "Nudge", "Draft Nudge", "Gentle Nudge", "Ping", or "Re-ping" in the item_title. The approval queue surfaces these strictly as "Follow up …" items.`;

const LENDER_TARGET_ID_RULES = `

FUNDING SOURCE TARGET ID — HARD RULES (apply to every deal, no exceptions)
- For ANY draft_email or update_funding_source proposal scoped to a lender / funding source: target_object_type MUST be "deal_lender" AND target_object_id MUST be the exact funding_sources[].id from the bundle for that specific lender.
- NEVER put the deal id, a company id, a contact id, a lender name, an email address, or any made-up value in target_object_id. If you cannot cite a real funding_sources[].id for the specific lender, DO NOT emit the proposal at all.
- One proposal per (deal, funding_source.id) per scan. Never emit two draft_email or update_funding_source items for the same funding_sources[].id — pick the strongest signal and emit one.
- If two proposals would target the same lender on the same deal (e.g. one nudge + one status update), collapse them into a single strongest proposal. The Approval Queue must never show mirrored/duplicated cards for the same lender on the same deal.`;

const REFERRAL_RULES = `

REFERRAL SOURCE UPDATE RULES (use referral_sources[])
- Rule R1: referral_sources[].business_days_since_last_outbound >= 3 → draft_email to that referral source with a short factual status update on where the deal stands (current stage, latest lender progress, any outstanding items, next step).
- Rule R2: referral_sources[].stage_changes_since_last_outbound.length > 0 → draft_email referencing the new stage and what it means in plain language. Cite the stage_history entry as evidence (kind="stage_history").
- Rule R3: any of (new_lenders_since_last_outbound, milestones_completed_since_last_outbound, status_notes_since_last_outbound) is non-empty AND describes a meaningful event (term sheet received, diligence milestone hit, new lender added, indication received) → draft_email summarizing the event for the referral source. Cite the underlying signal as evidence (kind="status_note"|"milestone"|"funding_source").
- All referral draft_email items:
    - target_object_type MUST be "referral_source" and target_object_id MUST be the referral_sources[].id (this keeps dedupe per (deal, referral source)).
    - requires_send_ui=true.
    - proposed_values MUST include { to: [referral_source.email], subject, body }.
    - Tone: ${EXTERNAL_TONE}. Professional but not stiff. Body <= 130 words. Mention the deal/company name once.
    - Do not include market opinions, commitments, or pricing — keep to facts already in the signals.
- Pick at most ONE rule per referral source per scan — emit one draft email per (deal, referral_source). If multiple rules fire, pick the most recent meaningful event and reference all triggers in rationale_summary.
- Silence rule: if no rule fires for any referral source, emit nothing for referral sources. Do NOT propose generic "say hi" emails.`;

const TERMS_ISSUED_RULES = `

LENDER PASS / NOT-A-FIT — HIGH-PRIORITY BUNDLE (Rule L-2, apply whenever an inbound lender email is declining)

- TRIGGER: an inbound email from a lender/funding source contact whose body or subject clearly declines. Match any of (case-insensitive, non-exhaustive): "pass", "we'll pass", "we are passing", "passing on this", "have to pass", "taking a pass", "it's a pass", "decline", "declining", "not going to be able to get comfortable", "not moving forward", "not interested at this time", "not a fit", "not for us", "doesn't fit our box/mandate", "outside our criteria", "outside our mandate", "not in our wheelhouse". Also match reasonably similar phrasing.
- IDENTIFICATION IS MANDATORY: before emitting anything, correctly resolve (a) the deal (bundle.deal_id, via linked email or unlinked_terms_emails[].matched_deal_name) AND (b) the specific funding_sources[] row for the sender (match unlinked_terms_emails[].from_email or emails[].from to funding_sources[].contacts.email OR the contact-email domain). If either cannot be resolved with confidence, SKIP the trigger — do not invent a funding source.
- RECOMMEND PASSED vs NOT_A_FIT (agent recommends; Manager decides in the queue):
    • Use stage="not_a_fit" (recommended) when the email's stated reason is a MANDATE / BOX / FIT mismatch — the deal itself is outside the lender's criteria (size, industry, geography, structure, product) regardless of this specific transaction. Trigger phrases include "not a fit", "not for us", "doesn't fit our box/mandate", "outside our criteria/mandate", "not in our wheelhouse".
    • Use stage="passed" (recommended) when the lender is declining APPETITE / CREDIT / TIMING on THIS specific deal but the deal is otherwise within their box. Trigger phrases include "we'll pass", "passing on this", "have to pass", "decline", "not going to be able to get comfortable", "not moving forward", "not interested at this time".
    • If the email mixes both signals, prefer stage="not_a_fit" and note the ambiguity in rationale — the Manager can flip to "passed" in the queue.
- EMIT EXACTLY ONE BUNDLE per (deal, funding_source.id) per scan, containing TWO proposals sharing bundle_key = \`lender_pass:{deal_id}:{funding_source_id}\`:

    P1) update_funding_source — the primary lender status move.
          target_object_type = "deal_lender", target_object_id = funding_sources[].id.
          proposed_values = {
            stage: "not_a_fit" | "passed",   // agent's recommendation per rules above
            tracking_status: "not_a_fit" | "passed",  // mirror stage
            pass_reason_category: <one of the keys listed in the PASS-REASON CATEGORY TAXONOMY block appended to these rules — never invent a new key>,
            pass_reason: "<verbatim quote of the lender's stated reason from the email body — NOT a paraphrase; the exact language they used. If the email states no reason at all, set pass_reason=\"No reason provided\" and pass_reason_category=\"other\">",
            commentary: "<the verbatim lender-stated reason, same content as pass_reason, preserved word-for-word for the commentary field on the funding source>",
            notes: "<the same verbatim excerpt trimmed to <= 1200 chars>",
            bundle_key: "lender_pass:{deal_id}:{funding_source_id}"
          }
          PASS-REASON CATEGORY PRE-SELECTION IS MANDATORY (the field is NEVER blank). Use ONLY the keys and mapping guidance in the PASS-REASON CATEGORY TAXONOMY block appended to these rules (loaded from the Deal Admin Agent Knowledge Base when configured). Pre-select the best match — the Manager can change it in the queue, but the agent must not defer or invent a new key.
          rationale: "{Lender} is {passing on|saying not-a-fit for} {Deal}. Reason (verbatim from their email): \"{short quote}\". Recommending status={Passed|Not a Fit} with pass reason category={Category Label} — Manager to confirm or adjust in the queue."
          evidence_references MUST cite the inbound email (kind="email").

    P2) add_status_note — the deal-level status note.
          target_object_type = "deal", target_object_id = deal_id.
          proposed_values = {
            note: "<1–2 sentence NEUTRAL FACTUAL summary of why the lender is passing / calling it not-a-fit, grounded strictly in the email content. No filler, no speculation, no advocacy language. Hard cap 2 sentences. Include the lender name and, when present, the stated reason.>",
            bundle_key: "lender_pass:{deal_id}:{funding_source_id}"
          }
          Example: "Silver Point passed on Acme — leverage above their comfort at 5.5x. They noted willingness to revisit if the structure moves to a unitranche with tighter covenants."
          evidence_references MUST cite the same inbound email.

- DEDUPE / ONE-PER-LENDER: emit the bundle at most ONCE per (deal, funding_source.id) per scan. If multiple pass emails from the same lender exist in the window, cite the MOST RECENT one as primary evidence. Never emit two lender-pass bundles for the same (deal, lender).
- TERMINAL LENDER GUARD applies: if the funding source is already in a terminal state (passed / not_a_fit / declined / withdrawn / dead / lost / rejected / closed / no_go), SKIP — there is nothing to move.
- NEVER SELF-CERTIFY: the agent RECOMMENDS the stage (passed vs not_a_fit) and PRE-SELECTS the pass_reason_category, but the Manager is the final decision-maker in the queue. Do not include phrasing that treats the recommendation as final ("this qualifies as", "confirmed as", "final status") — use recommendation language ("recommending", "closest match", "Manager to confirm").
- The verbatim quote in pass_reason / commentary MUST come from the lender's actual email body (or unlinked_terms_emails[].snippet if that's the only excerpt available). Never fabricate or embellish. If the excerpt is longer than ~400 chars, keep it verbatim but you may trim tail whitespace / signature.


TERM SHEET / IOI / LOI RECEIVED — HIGH-PRIORITY BUNDLE (apply whenever a lender contact sends terms)

DRAFT vs OFFICIAL — MUST DECIDE FIRST (Rule L-1):
- Read the inbound email carefully. Classify the terms as EITHER:
    (a) OFFICIAL — the lender is issuing / submitting / delivering their terms as their formal position (e.g. "attached are our terms", "please find our IOI", "here is our indicative structure", "outlined below are our terms", "our term sheet is attached", "our LOI for your review"). Follow the OFFICIAL branch below (steps 1–4 + deal stage advance to Terms Issued).
    (b) DRAFT — the lender is sharing a DRAFT and explicitly asking for feedback / edits / redlines BEFORE issuing (e.g. "sharing a draft for your feedback", "let us know if this looks right before we finalize", "redlines welcome", "wanted your thoughts before we send the formal term sheet"). Follow the DRAFT branch at the bottom of this section — DO NOT advance the deal stage.
- If the classification is ambiguous, DEFAULT TO DRAFT (safer — no premature stage move). Never move the deal to Terms Issued on a draft under any circumstance.
- IDENTIFICATION IS MANDATORY: before emitting anything you MUST correctly identify (a) the deal (via bundle.deal_id and email attribution) and (b) the specific funding_sources[] row for the sender. If either cannot be resolved with confidence, SKIP the trigger for this scan.

OFFICIAL BRANCH (default — moves deal to Stage 13 Terms Issued):
- TRIGGER SOURCES (either counts as an eligible email; no allowlist, no specific lender names):
    a) An inbound email already linked/matched to this deal (present in emails[] or email_threads[]) whose body or subject clearly references a term sheet, IOI (indication of interest), LOI (letter of intent), proposal, or issued/revised pricing terms — OR carries an attachment whose filename matches /(term[\\s_-]*sheet|\\bIOI\\b|indication|\\bLOI\\b|letter[\\s_-]*of[\\s_-]*intent|proposal|pricing|preliminary\\s+terms)/i.
    b) An UNLINKED inbox email surfaced in unlinked_terms_emails[]. These are inbox messages the classifier hasn't yet linked to a deal, but whose subject/body/attachment references the deal name AND contains the terms language above. Treat these as first-class triggers — the deal is inferred from unlinked_terms_emails[].matched_deal_name (== bundle.deal_name). You do NOT need the email to be pre-attached to the deal.
- SENDER ATTRIBUTION: identify the funding source by matching unlinked_terms_emails[].from_email (or emails[].from) to funding_sources[].contacts.email or the domain of funding_sources[].contacts.email. If no funding source on the deal matches the sender, still emit steps 2–4 (status note + stage advance + data-room save) but SKIP step 1 (update_funding_source) — do not invent a funding_sources[].id. Never guess a lender; only tie steps 1 to a real funding_sources[] row.
- The rule applies universally to every funding source on every deal.
- When the trigger fires, emit ALL FOUR of the following proposals as a single bundle for the (deal, funding_source):
    1) update_funding_source
         target_object_type = "deal_lender", target_object_id = funding_sources[].id for that lender.
         proposed_values = { stage: "terms_issued", tracking_status: "terms_issued", notes: "<verbatim body of the lender's email, trimmed to 1200 chars>" }.
         rationale: "{Lender} sent over {Term Sheet|IOI|LOI|proposal} for {Deal} — moving to Terms Issued and capturing their email body as the funding-source note."
         evidence_references MUST cite the inbound email (kind="email").
    2) add_status_note
         target_object_type = "deal", target_object_id = deal_id.
         proposed_values.note = "{Lender} issued {Term Sheet|IOI|LOI|proposal} on {ISO date}. Key points: <2-4 bullets paraphrasing pricing / structure / conditions from the email>. Attachment: <filename> (pending upload to data room)."
         evidence_references MUST cite the same inbound email.
    3) update_deal_stage — Stage 13 (Terms Issued) + qualification comparison payload
         Only emit when the deal's current stage is BEFORE "Terms Issued" in the pipeline (e.g. Sourcing, Qualified, In Review, Lenders in Review). If the deal is already at Terms Issued or later (In Diligence, Closed/Funded), SKIP this step.
         proposed_values = { stage: "terms-issued", stage_label: "Terms Issued" } (resolve to the pipeline_stage_id present in configured_pipeline_stages when available).
         QUALIFICATION PAYLOAD (REQUIRED — for the Manager to confirm or reject qualification in the Approval Queue):
           proposed_values.qualified_terms_parameters = <the EXACT object from deal.qualified_terms_parameters in the prompt payload, unchanged>. This is the deal's Hours & Fees section snapshot. If bundle.qualified_terms_parameters is null OR has_any_parameter === false, set this to null.
           proposed_values.incoming_terms_parameters = { pricing: "<verbatim quote or short paraphrase of pricing from email>", structure: "<same for structure>", conditions: "<same for conditions>", fees: "<same for lender fees, if any>", other: "<anything else material>", raw_excerpt: "<verbatim excerpt from the email that carried the terms, <= 800 chars>" }. Populate every field you can from the email body / attachment context; leave a field null if the email does not state it.
           proposed_values.qualification_prompt = when qualified_terms_parameters exists (has_any_parameter=true): "Compare the incoming lender terms to the qualified-terms parameters on this deal (Hours & Fees) and confirm or reject qualification." When qualified_terms_parameters is null: "No qualified-terms parameters exist on this deal — confirm qualification by judgment."
         NEVER SELF-CERTIFY: do NOT include any field, note, or rationale phrasing that asserts the incoming terms qualify or do not qualify. The agent presents the two payloads side-by-side; the Manager decides in the queue. Any language like "these qualify", "these do not qualify", "meets criteria", or "fails criteria" in this proposal is a rule violation.
         rationale: "At least one lender ({Lender}) has issued terms on {Deal} — advancing the deal stage to Terms Issued."
         evidence_references MUST cite the inbound email.
    4) save_to_data_room — first-class upload proposal (one per attachment). ALWAYS routes to Internal ▸ Data Room ▸ "Terms" folder — the folder name is FIXED as "Terms" (never deal-specific, never "Agreements" facing the user). "category" below is legacy metadata only and does not change the destination folder.
         target_object_type = "deal", target_object_id = deal_id.
         item_title = "Save {filename} to {Deal} data room ▸ Internal ▸ Terms"
         proposed_values = {
           attachment_name: "<exact filename from email metadata>",
           category: "terms",   // routes to the fixed Internal ▸ Terms folder (server-side)
           destination_folder: "Internal/Terms",
           source: "email_attachment",
           source_email_id: "<gmail message id>",
           source_thread_id: "<gmail thread id, if present>",
           source_subject: "<email subject>",
           source_sender: "<lender sender email>",
           content_type: "<mime type from attachment metadata, if present>",
         }
         rationale: "{Lender} attached {filename} ({Term Sheet|IOI|LOI}) — saving to Internal ▸ Data Room ▸ Terms on {Deal}."
         evidence_references MUST cite the inbound email (kind="email"). If multiple attachments qualify, emit ONE save_to_data_room per attachment (they dedupe by (deal_id, source_email_id, attachment_name)).
- DEDUPE / ONE-PER-LENDER: emit the bundle at most ONCE per (deal, funding_source.id) per scan. If the same lender sent multiple emails with terms language in the window, pick the MOST RECENT email as evidence and reference the earlier ones in rationale_summary. Never emit two Terms Issued bundles for the same lender on the same deal.
- UI GROUPING (REQUIRED): proposed_values.bundle_key MUST be set to the exact string \`terms_issued:{deal_id}:{funding_source_id}\` on ONLY the three lender-scoped proposals — update_funding_source, add_status_note (the lender-specific note), and save_to_data_room. DO NOT set bundle_key on update_deal_stage — the deal-stage advance is deal-level, not lender-level, and belongs on its own separate Approval Queue card so the reviewer can approve stage moves independently of any single lender's bundle. When the lender cannot be resolved to a funding_sources[] row (sender attribution failure), OMIT bundle_key on the surviving items — do not fabricate one.
- STAGE PRECEDENCE: if the lender is already at stage/substage "terms_issued", "in_diligence", "closed", "funded", or any terminal state, SKIP update_funding_source (nothing to move) but STILL emit add_status_note + upload-followup if a fresh terms email / attachment arrived that isn't already captured.
- ATTACHMENT HANDLING: cite the attachment filename verbatim from the email metadata (emails[].attachments or unlinked_terms_emails[].attachments). Do NOT invent filenames. If the trigger fires on body language alone with no attachment, emit steps 1–3 and omit step 4 (nothing to save). If two or more qualifying attachments arrive in the same email, emit ONE step-4 save_to_data_room per attachment.
- MULTI-LENDER (STRICT — DO NOT CONSOLIDATE): if two or more different funding sources send terms on the same deal in the same scan, you MUST emit a SEPARATE step 1 (update_funding_source) AND a SEPARATE step 2 (add_status_note) for EACH lender. Do NOT merge multiple lenders into one status note or one funding-source update. Only step 3 (update_deal_stage) collapses to a SINGLE proposal for the deal, and step 4 (save_to_data_room) is emitted once per attachment. Concretely, if Lender A and Lender B both send terms: emit update_funding_source(A) + add_status_note("A issued …") + update_funding_source(B) + add_status_note("B issued …") + ONE update_deal_stage + one save_to_data_room per attachment. A single status note that lists both lenders together is a violation of this rule.
- IOI / BODY-ONLY TERMS ARE FIRST-CLASS: an inbound email whose subject or body clearly delivers an IOI / LOI / term sheet / proposal counts as a full trigger EVEN WHEN there is no attachment. Do not skip steps 1 and 2 for a lender just because they emailed the terms in-body instead of attaching a document — you MUST still emit update_funding_source + add_status_note for that lender. Step 4 (save_to_data_room) is the only step that is optional when no attachment exists.
- Never propose Terms Issued from a scheduling email, intro pleasantry, materials request, generic pricing question, or a lender merely SAYING they will send terms later. The email must actually deliver the terms (attachment or terms language quoted in-body).

DRAFT BRANCH (Rule L-1 draft term sheet — DOES NOT move the deal stage):
- When the classification is DRAFT (lender sharing a draft term sheet and explicitly asking for feedback / redlines / edits BEFORE issuing), emit EXACTLY these proposals for the (deal, funding_source) — NEVER emit update_deal_stage in this branch:
    D1) update_funding_source
          target_object_type = "deal_lender", target_object_id = funding_sources[].id.
          proposed_values = { stage: "draft_terms", tracking_status: "draft_terms", notes: "<verbatim body of the lender's email, trimmed to 1200 chars>", bundle_key: "draft_terms:{deal_id}:{funding_source_id}" }.
          rationale: "{Lender} shared a DRAFT term sheet for {Deal} and asked for feedback — setting their stage to Draft Terms (not Terms Issued)."
          evidence_references MUST cite the inbound email.
    D2) create_followup_task — feedback task for the Analyst/Manager on the draft.
          target_object_type = "deal", target_object_id = deal_id.
          item_title = "Review draft term sheet from {Lender} — {Deal}"
          proposed_values = {
            bundle_key: "draft_terms_feedback:{deal_id}:{funding_source_id}",
            title: "Review draft term sheet from {Lender} — {Deal}",
            description: "<1-2 sentences: what the lender is asking for feedback on, quoting the ask verbatim when short>",
            lender_name: "{Lender}",
            lender_contact_emails: [<sender email + any funding_sources[].contacts.email that were on the thread>],
            source_email_id: "<gmail message id>",
            source_thread_id: "<gmail thread id, if present>",
            due_in_business_days: 2,
            priority: "high"
          }
          rationale_summary = "{Lender} is asking for feedback on a DRAFT term sheet — surfacing a review task so the Analyst/Manager can respond with redlines before the lender issues officially."
          evidence_references MUST cite the inbound email.
    D3) save_to_data_room (OPTIONAL) — only if the draft is attached as a file. Same shape as OFFICIAL step 4 but with category="terms_draft" and item_title "Save {filename} (DRAFT) to {Deal} data room ▸ Internal ▸ Terms". Same fixed Internal ▸ Terms folder.
- DEDUPE for DRAFT branch: at most ONE D1 + ONE D2 per (deal, funding_source.id) per scan. Never emit both DRAFT and OFFICIAL branches for the same email — pick one classification.
- If a subsequent email from the SAME lender switches from draft to official (e.g. "here is our final term sheet"), the next scan will fire the OFFICIAL branch normally; the earlier draft_terms funding-source stage is fine to overwrite.`;

const SCHEDULE_CALL_RULES = `

SCHEDULE-A-CALL TRIGGER — INBOUND LENDER / FUNDING SOURCE EMAIL (approved, mandatory)
- TRIGGER: an inbound email in emails[] / email_threads[] / unlinked_terms_emails[] from a funding-source contact whose body or subject clearly asks to connect, speak, or schedule time. Examples of qualifying language (non-exhaustive, treat semantically — any reasonably similar phrasing counts):
    "can we set up a call?", "can we get some time?", "let's jump on a call",
    "would love to connect", "would love to chat", "would love to learn more",
    "interested in talking further", "interested in learning more",
    "happy to hop on a call", "let's schedule a call", "grab 15 / 20 / 30 min",
    "any time this week to talk", "do you have time to discuss", "let's connect".
- Distinguish from Terms Issued: if the same email ALSO delivers term-sheet / IOI / LOI language or an attachment matching the terms filename regex, apply the TERMS_ISSUED bundle rules INSTEAD and do NOT also emit a schedule-call proposal for the same email.
- SENDER ATTRIBUTION: identify the funding source by matching the inbound sender email (or its domain) to funding_sources[].contacts.email. If no funding source on the deal matches, DO NOT emit anything — never invent a funding_sources[].id and never route a schedule-a-call proposal to a non-lender.
- EMIT EXACTLY ONE PROPOSAL per qualifying (deal, funding_source) per scan:
    action_type = "create_followup_task"
    item_title  = "Schedule call: {Lender} on {Deal}"  (Deal = bundle.deal_name, Lender = the resolved funding_sources[].name)
    target_object_type = "deal_lender"
    target_object_id   = the exact funding_sources[].id (never the deal id, never a contact id, never a made-up value)
    proposed_values = {
      bundle_key: "schedule_call:{deal_id}:{funding_source_id}",   // MUST be set exactly, no other action types share this prefix
      title: "Schedule call: {Lender} on {Deal}",
      description: "<1-2 sentence factual paraphrase of what the lender asked for, quoting the actual language when short>",
      lender_name: "{Lender}",
      lender_contact_emails: [<the sender email, plus any other funding_sources[].contacts.email that were also on the thread>],
      source_email_id: "<gmail message id of the inbound request>",
      source_email_subject: "<email subject>"
    }
    rationale_summary = "{Lender} asked to connect on {Deal} — surfacing a schedule-a-call confirmation so the deal owner can open the calendar and book time between the lender and the client."
    evidence_references MUST cite the inbound email (kind="email").
    evidence_summary = REQUIRED. A single short, neutral sentence (<= 240 chars) that names the triggering language, quoted verbatim in double quotes when the phrase is <= 12 words. Format exactly:
        "{Sender first name or lender name} on {short date, e.g. Mar 12}: \"<verbatim quote of the connect/schedule phrase>\""
      If the qualifying phrase is longer than 12 words, paraphrase it neutrally in <= 20 words instead of quoting. Never editorialize ("great fit", "excited", "urgent"), never speculate about intent beyond what the sender wrote, and never mention terms/pricing.
- DEDUPE: never emit more than one schedule-a-call proposal per (deal, funding_source.id) per scan. If the lender sent multiple qualifying emails, pick the MOST RECENT and reference the earlier ones in rationale_summary.
- TERMINAL LENDER GUARD applies: if the funding source is in any terminal state (pass, declined, not_a_fit, withdrawn, dead, lost, rejected, closed, no_go, unresponsive, on_hold, paused), DO NOT emit — there is nothing to schedule.
- The proposal is a scheduling CONFIRMATION, not an actual booking. It does NOT send email, does NOT create a calendar event, and does NOT choose a time. On approval the naitive calendar pop-up opens for the deal owner to complete the booking manually.`;

const OUTBOUND_FOLLOWUP_RULES = `

OUTBOUND-AWAITING-REPLY TRIGGER — Rule L-4 (approved, mandatory)
USER SENT LENDER EMAIL, NO REPLY IN 2 BUSINESS DAYS (5 BD if lender was previously engaged)
- INPUT: each funding_sources[] row may carry an outbound_awaiting_reply object:
    { sent_at, subject, body_excerpt, business_days_since_sent, replied, reply_received_at }
  This is the MOST RECENT outbound email a user in this workspace sent to that lender's known contact emails, plus whether that lender has replied since.
- DETERMINE PER FUNDING SOURCE whether the source is "past threshold":
    1. outbound_awaiting_reply is present (not null).
    2. outbound_awaiting_reply.replied === false (lender has NOT replied since sent_at).
    3. The funding source is NOT in a terminal state (pass, declined, not_a_fit, withdrawn, dead, lost, rejected, closed, no_go, unresponsive, on_hold, paused).
    4. YOUR JUDGMENT — the outbound (subject + body_excerpt) genuinely WARRANTS A REPLY from the lender. It warrants a reply if it: asks a question, responds to a question the lender raised, requests information / materials / a decision / a next step, or otherwise reasonably requires the lender to act. Purely informational blasts, "no reply needed" FYIs, calendar invites, and out-of-office style messages DO NOT warrant a reply — skip them.
    5. Choose the follow-up THRESHOLD based on whether the lender was PREVIOUSLY ENGAGED in this thread before going quiet:
         • DEFAULT threshold = 2 business days.
         • EXTENDED threshold = 5 business days IF, prior to going quiet, this lender demonstrated active review or explicitly confirmed receipt — e.g. a prior reply in the thread acknowledging materials, asking a diligence question, promising to review, or otherwise engaging substantively. Look across emails[], status_notes, and funding_source.notes for that signal. Absence of any prior reply from the lender means DEFAULT (2 BD).
       The source is "past threshold" when outbound_awaiting_reply.business_days_since_sent >= the chosen threshold (strict business-day count).
    6. If outbound_awaiting_reply.replied === true at any point before this scan, the clock is cancelled — the source is NOT past threshold, no matter the day count.
- CONSOLIDATION (mandatory): all lender follow-up prompts for the SAME deal collapse into ONE AQ item. Do NOT emit one item per lender. If ZERO funding sources on the deal are past threshold, emit NOTHING under this rule.
- WHEN AT LEAST ONE funding source on the deal is past threshold, emit EXACTLY ONE proposal per deal per scan:
    action_type = "create_followup_task"
    item_title  = "Follow up on {Deal}: {N} lender{s} awaiting reply"
    target_object_type = "deal"
    target_object_id   = the deal id
    requires_send_ui   = false
    proposed_values = {
      title: "Follow up on {Deal} — {N} lender{s} awaiting reply",
      description: "Reply in the existing email thread with each lender listed below. Do not start a new thread.\n\n" +
                   "For each past-threshold funding source, include one bullet in this exact shape:\n" +
                   "• {Lender name} — sent {Mon DD} (\"{verbatim short quote of the ask, <= 12 words}\"), no reply in {N} business days [threshold: {2 BD | 5 BD — previously engaged}]",
      assignee_user_id: deal.owner_user_id,
      due_in_business_days: 1,
      lenders: [
        { funding_source_id, lender_name, sent_at, subject, business_days_since_sent, threshold_business_days, previously_engaged: true|false, contact_emails: [...] }
        // one entry per past-threshold funding source on this deal
      ],
      bundle_key: "lender_followups:{deal_id}"
    }
    rationale_summary = "{N} lender{s} on {Deal} are past the no-reply threshold — consolidating a single follow-up prompt so the deal owner can nudge each in the existing thread."
    evidence_summary  = REQUIRED. <= 240 chars, neutral, factual, listing up to 3 lenders in the shape "{Lender} ({N} BD)" separated by "; ". If more than 3, append "; +{K} more".
    evidence_references MUST cite each past-threshold lender's most recent outbound (kind="email", label="Outbound email to {Lender}") — one reference per lender in the bundle.
    confidence_score >= 0.7.
- DEDUPE: at most ONE consolidated create_followup_task per deal per scan under this rule. The bundle_key "lender_followups:{deal_id}" is the dedupe key — never emit a second follow-up item for the same deal in the same scan.
- If any lender replies before the next scan, the outbound_awaiting_reply.replied flag flips to true for that lender — drop them from the consolidated bundle. If ALL lenders reply, the consolidated item is auto-resolved by the executor.
- NEVER emit this trigger from an outbound sent by the lender to us, from an inbound thread, or when there is no outbound_awaiting_reply payload on any funding source — the rule keys ENTIRELY off outbound_awaiting_reply.
- This rule OVERRIDES the earlier "one proposal per lender" phrasing in any other section — L-4 is always consolidated per deal.`;

const SYSTEM_PROMPT_FULL = SYSTEM_PROMPT + LENDER_TARGET_ID_RULES + LENDER_FOLLOWUP_TITLE_RULE + REFERRAL_RULES + TERMS_ISSUED_RULES + SCHEDULE_CALL_RULES + OUTBOUND_FOLLOWUP_RULES;

function buildUserPrompt(bundle: DealSignalBundle, fingerprint?: string | null): string {
  // Trim large fields to keep prompt compact.
  const trim = (s: any, n = 240) =>
    typeof s === "string" ? (s.length > n ? s.slice(0, n) + "…" : s) : s;
  const compact = {
    deal: {
      id: bundle.deal_id,
      name: bundle.deal_name,
      stage: bundle.current.stage,
      status: bundle.current.status,
      owner_user_id: bundle.current.deal_owner_user_id,
      is_flagged: bundle.current.is_flagged,
      updated_at: bundle.current.updated_at,
      qualified_terms_parameters: bundle.qualified_terms_parameters ?? null,
    },
    funding_sources: bundle.funding_sources.map((f) => ({
      id: f.id,
      name: f.name,
      stage: f.stage,
      substage: f.substage,
      tracking_status: f.tracking_status,
      last_contact_at: f.last_contact_at,
      business_days_since_last_contact: (f as any).business_days_since_last_contact ?? null,
      notes: trim(f.notes, 200),
      pass_reason: trim(f.pass_reason, 160),
      outbound_awaiting_reply: (f as any).outbound_awaiting_reply
        ? {
            sent_at: (f as any).outbound_awaiting_reply.sent_at,
            subject: (f as any).outbound_awaiting_reply.subject,
            body_excerpt: trim((f as any).outbound_awaiting_reply.body_excerpt, 1200),
            business_days_since_sent:
              (f as any).outbound_awaiting_reply.business_days_since_sent,
            replied: (f as any).outbound_awaiting_reply.replied,
            reply_received_at: (f as any).outbound_awaiting_reply.reply_received_at ?? null,
          }
        : null,
    })),
    status_notes: bundle.status_notes.map((n) => ({
      id: n.id, created_at: n.created_at, note: trim(n.note, 200),
    })),
    recent_activity: bundle.activity.map((a) => ({
      source: a.source, action_type: a.action_type, created_at: a.created_at,
      before: trim(JSON.stringify(a.before ?? null), 160),
      after: trim(JSON.stringify(a.after ?? null), 160),
    })),
    stage_history: bundle.stage_history,
    milestones: bundle.milestones,
    calendar: bundle.calendar_items,
    emails: bundle.emails.map((e: any) => ({
      id: e.id, gmail_message_id: e.gmail_message_id,
      from: e.from_address, subject: e.subject,
      snippet: trim(e.snippet, 280), received_at: e.received_at,
      notes: trim(e.notes, 160),
    })),
    open_tasks: bundle.open_tasks,
    claap_recordings: bundle.claap_recordings.map((r: any) => ({
      source: r.source,
      id: r.id,
      title: r.title,
      url: r.url,
      recorded_at: r.recorded_at ?? r.linked_at,
      call_type: r.call_type,
      organizer_email: r.organizer_email,
      participants: r.participants,
      summary: trim(r.summary, 800),
      action_items: r.action_items,
      key_takeaways: r.key_takeaways,
      transcript_excerpt: trim(r.transcript_excerpt, 2500),
      notes: trim(r.notes, 200),
    })),
    email_threads: bundle.email_threads.map((t: any) => ({
      id: t.id,
      thread_id: t.thread_id,
      subject: t.subject,
      latest_message_at: t.latest_message_at,
      match_confidence: t.match_confidence,
      messages: (t.messages ?? []).map((m: any) => ({
        from: m.from_name ? `${m.from_name} <${m.from_email}>` : m.from_email,
        subject: m.subject,
        snippet: trim(m.snippet, 320),
        body_excerpt: trim(m.body_text, 1200),
        received_at: m.received_at,
      })),
    })),
    unlinked_terms_emails: (bundle.unlinked_terms_emails ?? []).map((m: any) => ({
      gmail_message_id: m.gmail_message_id,
      thread_id: m.thread_id,
      subject: m.subject,
      from: m.from_name ? `${m.from_name} <${m.from_email}>` : m.from_email,
      from_email: m.from_email,
      to_emails: m.to_emails,
      received_at: m.received_at,
      snippet: trim(m.snippet, 320),
      body_excerpt: trim(m.body_excerpt, 2000),
      attachments: m.attachments ?? [],
      matched_deal_name: m.matched_deal_name,
      match_reasons: m.match_reasons,
    })),
    referral_sources: (bundle.referral_sources ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      company: r.company,
      type: r.type,
      last_outbound_at: r.last_outbound_at,
      last_outbound_subject: r.last_outbound_subject,
      business_days_since_last_outbound: r.business_days_since_last_outbound,
      stage_changes_since_last_outbound: r.stage_changes_since_last_outbound,
      new_lenders_since_last_outbound: r.new_lenders_since_last_outbound,
      milestones_completed_since_last_outbound: r.milestones_completed_since_last_outbound,
      status_notes_since_last_outbound: (r.status_notes_since_last_outbound ?? []).map((n: any) => ({
        id: n.id, created_at: n.created_at, note: trim(n.note, 200),
      })),
    })),
    configured_milestone_titles: bundle.configured_milestone_titles ?? [],
  };
  const fp = fingerprint && fingerprint.trim().length > 0
    ? `\nuser_style_fingerprint (recent edits this user made to the agent's drafts — mimic their voice):\n${fingerprint.trim()}\n`
    : "";
  return `Deal signals (last ${LOOKBACK_DAYS} days):\n\n${JSON.stringify(compact, null, 2)}\n${fp}\nReturn JSON: { "items": [CandidateItem, ...] }. If nothing is strongly actionable, return { "items": [] }.`;
}

async function callModelForCandidates(
  bundle: DealSignalBundle,
  fingerprint?: string | null,
  extraRules?: string | null,
): Promise<CandidateItem[]> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY missing — Deal Admin Agent cannot analyze");
  }

  const body = {
    model: MODEL,
    max_tokens: 6000,
    system: `${SYSTEM_PROMPT_FULL}${extraRules ? `\n\n${extraRules}` : ""}\n\nRespond with ONLY a JSON object of the form {"items":[...]}. No prose, no markdown fences.`,
    messages: [
      { role: "user", content: buildUserPrompt(bundle, fingerprint) },
    ],
  };

  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Anthropic ${resp.status}: ${txt.slice(0, 200)}`);
  }

  const j = await resp.json();
  // Anthropic returns content as an array of blocks; concatenate text blocks.
  const raw: string = Array.isArray(j?.content)
    ? j.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("")
    : "";
  // Strip markdown fences if the model wrapped them anyway.
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned || "{}");
  } catch {
    return [];
  }
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  return items
    .filter((it: any) => it && typeof it === "object")
    .map((it: any) => {
      // Normalize alternative field names Claude sometimes emits.
      const target_object_type =
        it.target_object_type ?? it.target_object ?? it.target_type ?? null;
      const target_object_id =
        it.target_object_id ?? it.target_id ?? it.target ?? null;
      const item_title =
        it.item_title ?? it.title ?? it.action_title ?? null;
      const evidence_references = Array.isArray(it.evidence_references)
        ? it.evidence_references
        : Array.isArray(it.evidence)
          ? it.evidence
          : [];
      const proposed_values =
        it.proposed_values && typeof it.proposed_values === "object"
          ? it.proposed_values
          : it.proposed && typeof it.proposed === "object"
            ? it.proposed
            : {};
      const current_values =
        it.current_values && typeof it.current_values === "object"
          ? it.current_values
          : it.current && typeof it.current === "object"
            ? it.current
            : {};
      return {
        ...it,
        target_object_type,
        target_object_id,
        item_title: item_title || synthesizeTitle(it),
        evidence_references,
        proposed_values,
        current_values,
        confidence_score:
          typeof it.confidence_score === "number" ? it.confidence_score :
          typeof it.confidence === "number" ? it.confidence : 0,
        risk_level: it.risk_level ?? it.risk ?? undefined,
        rationale_summary: it.rationale_summary ?? it.rationale ?? it.reason ?? "",
        evidence_summary: it.evidence_summary ?? it.summary ?? "",
        linked_entity_label: it.linked_entity_label ?? it.entity_label ?? it.label ?? "",
        target_field_paths: Array.isArray(it.target_field_paths) ? it.target_field_paths : [],
      };
    }) as CandidateItem[];
}

/* ------------------------------------------------------------------ */
/*  Promotion + dedupe + merge                                         */
/* ------------------------------------------------------------------ */

function synthesizeTitle(it: any): string {
  const t = it?.action_type ?? "Update";
  const label = it?.linked_entity_label || it?.entity_label || it?.label || "";
  // Kick-off milestone gets a more specific, action-oriented title.
  if (t === "update_milestone") {
    const explicit = typeof it?.item_title === "string" ? it.item_title.trim() : "";
    if (explicit) return explicit;
    const proposed = it?.proposed_values ?? {};
    const milestoneTitle: string =
      (typeof proposed.title === "string" && proposed.title) ||
      (typeof it?.milestone_title === "string" && it.milestone_title) ||
      "";
    if (/kick[\s-]?off/i.test(milestoneTitle) || /kick[\s-]?off/i.test(label)) {
      return label ? `Check off ${label} Kick-Off Milestone` : "Check off Kick-Off Milestone";
    }
  }
  // Deal-name-first title templates: read naturally as
  // "Update Acorn Learning Group Status" rather than
  // "Add Status Note — Acorn Learning Group".
  const dealTemplates: Record<string, (name: string) => string> = {
    add_status_note: (n) => `Update ${n} Status`,
    update_deal_status: (n) => `Update ${n} Status`,
    update_deal_stage: (n) => `Update ${n} Stage`,
    update_deal_field: (n) => `Update ${n} Details`,
    update_funding_source: (n) => `Update ${n} Funding Source`,
    create_followup_task: (n) => `Add ${n} Follow-up Task`,
    create_milestone: (n) => `Add ${n} Milestone`,
    update_milestone: (n) => `Update ${n} Milestone`,
    reassign_deal: (n) => `Reassign ${n}`,
    draft_email: (n) => `Draft ${n} Email Reply`,
    escalate: (n) => `Escalate ${n}`,
    update_contact: (n) => `Update ${n} Contact`,
    update_contact_field: (n) => `Update ${n} Contact`,
    update_company: (n) => `Update ${n} Company`,
  };
  const fallbackLabel = t
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c: string) => c.toUpperCase());
  const tpl = dealTemplates[t];
  if (tpl && label) return tpl(label);
  return label ? `${fallbackLabel} — ${label}` : fallbackLabel;
}

function isValidCandidate(c: CandidateItem, minConf: number): boolean {
  if (!c || !c.action_type) return false;
  if (!SUPPORTED_ACTION_TYPES.includes(c.action_type as any)) return false;
  if (typeof c.confidence_score !== "number" || c.confidence_score < minConf) return false;
  if (!c.item_title || !c.target_object_type) return false;
  if (!c.proposed_values || typeof c.proposed_values !== "object") return false;
  if (Object.keys(c.proposed_values).length === 0) return false;
  // target_object_id required for everything except create_followup_task /
  // create_milestone / draft_email (which are net-new objects scoped to a deal).
  const needsId = !["create_followup_task", "create_milestone", "draft_email"].includes(c.action_type);
  if (needsId && !c.target_object_id) return false;
  if (!Array.isArray(c.evidence_references) || c.evidence_references.length === 0) return false;
  // Reject candidates whose proposed_values are missing the concrete target
  // field required for that action type. Prevents "update from X to —" cards.
  const pv = c.proposed_values as Record<string, unknown>;
  const nonEmpty = (v: unknown) =>
    typeof v === "string"
      ? v.trim().length > 0 && v.trim() !== "—" && v.trim() !== "-"
      : v !== null && v !== undefined && v !== "";
  switch (c.action_type) {
    case "update_deal_stage":
      if (!nonEmpty(pv.stage)) return false;
      break;
    case "update_deal_status":
      if (!nonEmpty(pv.status)) return false;
      {
        // Deal STATUS is a strict enum: on-track | at-risk | off-track (or
        // cleared). Anything else (e.g. "Active", "Live", "Pending") is not
        // a real status value and must be dropped rather than surfaced.
        const raw = String(pv.status ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
        const ALLOWED_STATUSES = new Set(["on-track", "at-risk", "off-track"]);
        if (!ALLOWED_STATUSES.has(raw)) return false;
      }
      break;
    case "update_funding_source":
      // Rule: update_funding_source MUST carry a concrete stage/substage/status
      // transition. A notes-only payload is ambiguous (renders as "— → —" in
      // the queue) and violates the "never approve an update to —" guardrail.
      // Notes-only lender movements must be expressed as add_status_note.
      if (
        !nonEmpty(pv.stage) &&
        !nonEmpty(pv.status) &&
        !nonEmpty((pv as any).substage) &&
        !nonEmpty((pv as any).tracking_status)
      ) return false;
      break;
    case "update_lender_status":
      if (!nonEmpty((pv as any).substage) && !nonEmpty((pv as any).new_status) && !nonEmpty(pv.status)) return false;
      break;
    case "add_status_note":
      if (!nonEmpty((pv as any).note)) return false;
      break;
    case "create_milestone":
      if (!nonEmpty((pv as any).title)) return false;
      break;
    case "create_followup_task":
      if (!nonEmpty((pv as any).title)) return false;
      break;
    case "draft_email": {
      if (!nonEmpty((pv as any).subject) || !nonEmpty((pv as any).body)) return false;
      const to = (pv as any).to;
      if (!Array.isArray(to) || to.filter((x) => typeof x === "string" && x.trim()).length === 0) return false;
      break;
    }
    case "update_milestone":
      if (!nonEmpty((pv as any).status) && (pv as any).completed === undefined) return false;
      break;
  }
  return true;
}

/**
 * Drop create_milestone proposals that don't match the workspace's
 * curated milestone taxonomy (default_milestones) — and proposals for
 * milestones the deal already has. Milestones are user-configured, not
 * AI-invented.
 */
function filterUnconfiguredMilestones(
  candidates: CandidateItem[],
  bundle: DealSignalBundle,
): { kept: CandidateItem[]; dropped: number } {
  const hasCreate = candidates.some((c) => c.action_type === "create_milestone");
  if (!hasCreate) return { kept: candidates, dropped: 0 };
  const norm = (s: unknown) => (typeof s === "string" ? s.trim().toLowerCase() : "");
  const allowed = new Set((bundle.configured_milestone_titles ?? []).map(norm).filter(Boolean));
  const existing = new Set((bundle.milestones ?? []).map((m: any) => norm(m?.title)).filter(Boolean));
  let dropped = 0;
  const kept = candidates.filter((c) => {
    if (c.action_type !== "create_milestone") return true;
    const title = norm(
      (c.proposed_values as any)?.title ?? c.linked_entity_label ?? c.item_title,
    );
    if (!title || !allowed.has(title) || existing.has(title)) {
      dropped++;
      return false;
    }
    return true;
  });
  return { kept, dropped };
}

/**
 * Drop add_status_note candidates whose supporting evidence is older than
 * 7 calendar days. Status notes exist to capture RECENT activity — the
 * queue should not surface historical backfill from weeks-old meetings or
 * emails. When no evidence can be dated (or the referenced items aren't
 * in the bundle), drop the candidate as unverifiable.
 */
function filterStaleStatusNotes(
  candidates: CandidateItem[],
  bundle: DealSignalBundle,
): { kept: CandidateItem[]; dropped: number } {
  const hasNote = candidates.some((c) => c.action_type === "add_status_note");
  if (!hasNote) return { kept: candidates, dropped: 0 };

  const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - WINDOW_MS;

  // Build an id → best-known-date lookup across every bundle collection
  // an evidence_reference could point at.
  const dateById = new Map<string, number>();
  const pushDate = (id: unknown, ...dates: unknown[]) => {
    if (!id || typeof id !== "string") return;
    let best = dateById.get(id) ?? 0;
    for (const d of dates) {
      if (!d) continue;
      const ts = new Date(String(d)).getTime();
      if (Number.isFinite(ts) && ts > best) best = ts;
    }
    if (best > 0) dateById.set(id, best);
  };
  for (const e of bundle.emails ?? []) pushDate((e as any)?.id, (e as any)?.received_at, (e as any)?.sent_at, (e as any)?.date);
  for (const t of bundle.email_threads ?? []) pushDate((t as any)?.id, (t as any)?.last_message_at, (t as any)?.updated_at);
  for (const c of bundle.calendar_items ?? []) pushDate((c as any)?.id, (c as any)?.end_time, (c as any)?.start_time, (c as any)?.date);
  for (const r of bundle.claap_recordings ?? []) pushDate((r as any)?.id, (r as any)?.ended_at, (r as any)?.started_at, (r as any)?.linked_at);
  for (const a of bundle.activity ?? []) pushDate((a as any)?.id, (a as any)?.created_at, (a as any)?.updated_at);
  for (const n of bundle.status_notes ?? []) pushDate((n as any)?.id, (n as any)?.created_at);
  for (const s of bundle.stage_history ?? []) pushDate((s as any)?.id, (s as any)?.changed_at, (s as any)?.created_at);
  for (const m of bundle.milestones ?? []) pushDate((m as any)?.id, (m as any)?.completed_at, (m as any)?.updated_at);
  for (const f of bundle.funding_sources ?? []) pushDate((f as any)?.id, (f as any)?.last_contact_at, (f as any)?.updated_at);
  for (const u of bundle.unlinked_terms_emails ?? []) {
    // Unlinked terms emails are the trigger for TERMS_ISSUED bundle status
    // notes. Register both the gmail_message_id and thread_id so evidence
    // references pointing at either resolve to the email's received_at date.
    pushDate((u as any)?.gmail_message_id, (u as any)?.received_at);
    pushDate((u as any)?.thread_id, (u as any)?.received_at);
  }

  let dropped = 0;
  const kept = candidates.filter((c) => {
    if (c.action_type !== "add_status_note") return true;
    const refs = Array.isArray(c.evidence_references) ? c.evidence_references : [];
    let newest = 0;
    for (const ev of refs) {
      const id = (ev as any)?.ref_id ?? (ev as any)?.id;
      const ts = id ? dateById.get(String(id)) : undefined;
      if (ts && ts > newest) newest = ts;
    }
    if (newest === 0 || newest < cutoff) {
      dropped += 1;
      return false;
    }
    return true;
  });
  return { kept, dropped };
}

/**
 * Hard guardrail for Kick-Off milestone completion.
 *
 * The Deal Admin Agent may ONLY propose completing (or creating) a
 * "Kick-Off" milestone when the deal has a real calendar event whose
 * **title** reads as a kick-off (matches /kick[\s-]?off/i) AND whose
 * scheduled date/time is already in the past. Intro / discovery /
 * scoping / "RE: Fw: …" calendar events do NOT qualify, even if they
 * have happened — only an event explicitly titled as a kick-off counts.
 *
 * The system prompt expresses this rule, but the LLM has historically
 * cited a non-kickoff calendar invite as evidence and proposed
 * completion anyway. This function drops any such proposal at the
 * source so it never reaches the queue.
 */
function filterInvalidKickoffMilestones(
  candidates: CandidateItem[],
  bundle: DealSignalBundle,
): { kept: CandidateItem[]; dropped: number } {
  const KICK_RE = /kick[\s-]?off/i;
  const isKickoffMilestoneTitle = (s: unknown) =>
    typeof s === "string" && KICK_RE.test(s);

  // Collect kick-off-titled calendar events for this deal that have
  // already occurred. We use the `date` (+ optional `time`) on
  // deal_calendar_items, and `start`/`start_time`/`end`/`end_time`
  // shapes on calendar_events fallbacks.
  const now = Date.now();
  const eventEpoch = (ev: any): number | null => {
    const candidates = [
      ev?.end_time, ev?.end, ev?.start_time, ev?.start,
    ].filter((v) => typeof v === "string" && v.length > 0);
    for (const c of candidates) {
      const t = Date.parse(c);
      if (!Number.isNaN(t)) return t;
    }
    if (typeof ev?.date === "string" && ev.date.length > 0) {
      const dt = ev.time && typeof ev.time === "string"
        ? `${ev.date}T${ev.time}`
        : `${ev.date}T23:59:59Z`;
      const t = Date.parse(dt);
      if (!Number.isNaN(t)) return t;
    }
    return null;
  };
  const hasPastKickoffEvent = (bundle.calendar_items ?? []).some((ev: any) => {
    if (!isKickoffMilestoneTitle(ev?.title)) return false;
    const t = eventEpoch(ev);
    return typeof t === "number" && t <= now;
  });

  let dropped = 0;
  const kept = candidates.filter((c) => {
    const at = c?.action_type;
    if (at !== "update_milestone" && at !== "create_milestone") return true;

    // Identify whether this candidate is targeting a Kick-Off milestone.
    const milestoneById = new Map<string, any>(
      (bundle.milestones ?? [])
        .filter((m: any) => m?.id)
        .map((m: any) => [m.id, m]),
    );
    const targetMilestone = c?.target_object_id
      ? milestoneById.get(c.target_object_id as string)
      : null;
    const proposedTitle = (c?.proposed_values as any)?.title;
    const itemTitle = c?.item_title;
    const linkedLabel = c?.linked_entity_label;
    const looksLikeKickoff =
      isKickoffMilestoneTitle(targetMilestone?.title) ||
      isKickoffMilestoneTitle(proposedTitle) ||
      isKickoffMilestoneTitle(itemTitle) ||
      isKickoffMilestoneTitle(linkedLabel);
    if (!looksLikeKickoff) return true;

    if (!hasPastKickoffEvent) {
      dropped++;
      return false;
    }

    // Extra check: the cited evidence itself must include a calendar
    // event whose excerpt mentions kick-off. Otherwise the LLM is
    // wiring a non-kickoff event id to a kickoff proposal.
    const evRefs = (c?.evidence_references ?? []) as any[];
    const calRefs = evRefs.filter((e) => e?.kind === "calendar");
    if (calRefs.length === 0) {
      dropped++;
      return false;
    }
    const anyKickoffEvidence = calRefs.some((e) => {
      const ex = typeof e?.excerpt === "string" ? e.excerpt : "";
      return KICK_RE.test(ex);
    });
    if (!anyKickoffEvidence) {
      dropped++;
      return false;
    }
    return true;
  });
  return { kept, dropped };
}

/**
 * Drop any `update_deal_stage` candidates whose proposed `stage` is not in
 * the deal's actual pipeline. Other action types pass through unchanged.
 * Prevents the AI from queueing un-executable stage moves like
 * "nda-signed-diligence" that the approver cannot apply.
 */
async function filterInvalidStageProposals(
  supabase: SupabaseClient,
  deal: { id: string; pipeline_id?: string | null },
  candidates: CandidateItem[],
): Promise<{ kept: CandidateItem[]; dropped: number }> {
  const hasStageProposal = candidates.some((c) => c.action_type === "update_deal_stage");
  if (!hasStageProposal) return { kept: candidates, dropped: 0 };

  let validStageIds: Set<string> | null = null;
  if (deal.pipeline_id) {
    const { data } = await supabase
      .from("deal_pipelines")
      .select("stages")
      .eq("id", deal.pipeline_id)
      .maybeSingle();
    const stages = (data as any)?.stages;
    if (Array.isArray(stages)) {
      validStageIds = new Set(
        stages
          .map((s: any) => (typeof s?.id === "string" ? s.id : null))
          .filter((x: string | null): x is string => !!x),
      );
    }
  }

  let dropped = 0;
  const kept = candidates.filter((c) => {
    if (c.action_type !== "update_deal_stage") return true;
    const proposed = (c.proposed_values as any)?.stage;
    if (typeof proposed !== "string" || !proposed) {
      dropped++;
      return false;
    }
    // If we couldn't resolve the pipeline, fail closed — better to drop than
    // queue an un-executable card.
    if (!validStageIds || validStageIds.size === 0) {
      dropped++;
      return false;
    }
    if (!validStageIds.has(proposed)) {
      dropped++;
      return false;
    }
    return true;
  });
  return { kept, dropped };
}

/**
 * Drop `update_funding_source` candidates that lack a clear pass / terms /
 * hold signal. A lender simply emailing the deal manager (intro, scheduling,
 * diligence question) must NOT trigger a funding-source update card.
 */
function filterFundingSourceProposals(
  candidates: CandidateItem[],
  fundingSources?: any[],
): { kept: CandidateItem[]; dropped: number } {
  // Keywords that justify an update_funding_source action.
  const SIGNAL_RE =
    /\b(pass(?:ing|ed)?|declin(?:e|ed|ing)|not\s+a\s+fit|outside\s+(?:our\s+)?mandate|term\s*sheet|termsheet|\bIOI\b|indication\s+of\s+interest|\bLOI\b|letter\s+of\s+intent|proposal|pricing|hold|paus(?:e|ing|ed)|postpone(?:d|ment)?|on\s+hold|park(?:ed|ing)?\s+(?:this|the\s+deal)|circle\s+back\s+later|revisit|table\s+(?:this|it)|shelve|unresponsive|no\s+response|gone\s+silent|stopped\s+responding|ghost(?:ed|ing)?|stale|days?\s+since\s+last\s+contact)\b/i;

  // Status-field values that imply a pass / hold and are inherently OK.
  const STATUS_SIGNAL_RE = /pass|declin|hold|paus|withdraw|dead|lost|term|ioi|loi|indication|unresponsive|no[\s_-]?response/i;

  // Terminal lender states — if the lender is already in one of these, there's
  // nothing left to update on the funding source. Suppress the card entirely.
  const TERMINAL_LENDER_RE = /pass|declin|withdraw|dead|lost|reject|kill|no[\s_-]*go/i;
  const fsById = new Map<string, any>();
  for (const f of fundingSources ?? []) {
    if (f?.id) fsById.set(String(f.id), f);
  }

  let dropped = 0;
  const kept = candidates.filter((c) => {
    if (c.action_type !== "update_funding_source") return true;
    // Hard gate: a funding-source update MUST point at a specific lender on
    // this deal. Generic "Update funding sources on {Deal}" cards (no
    // resolvable target_object_id, or an id that doesn't match a current
    // funding source on the deal) are noise — drop them.
    const tid = c.target_object_id ? String(c.target_object_id) : "";
    if (!tid || !fsById.has(tid)) {
      dropped++;
      return false;
    }
    const pv = (c.proposed_values ?? {}) as Record<string, any>;
    const cv = (c.current_values ?? {}) as Record<string, any>;

    // Hard gate: if the targeted lender is already in a terminal/passed state
    // on this deal, no funding-source update is needed. The user has already
    // resolved this lender.
    const targetId = c.target_object_id ? String(c.target_object_id) : "";
    const fs = targetId ? fsById.get(targetId) : null;
    if (fs) {
      const currentState = [fs.tracking_status, fs.stage, fs.substage]
        .map((v) => (typeof v === "string" ? v : ""))
        .join(" ");
      if (TERMINAL_LENDER_RE.test(currentState)) {
        // Allow ONLY if the proposal is moving the lender OUT of the terminal
        // state (e.g. re-engaging a previously passed lender). Otherwise drop.
        const proposedState = [pv.tracking_status, pv.stage, pv.substage]
          .map((v) => (typeof v === "string" ? v : ""))
          .join(" ");
        const proposingNonTerminal =
          proposedState.trim().length > 0 && !TERMINAL_LENDER_RE.test(proposedState);
        if (!proposingNonTerminal) {
          dropped++;
          return false;
        }
      }
    }

    // Allow when the proposed change itself is a status transition into
    // pass/hold/terms (tracking_status / stage / substage).
    const statusFields = [pv.tracking_status, pv.stage, pv.substage]
      .map((v) => (typeof v === "string" ? v : ""))
      .join(" ");
    const prevStatusFields = [cv.tracking_status, cv.stage, cv.substage]
      .map((v) => (typeof v === "string" ? v : ""))
      .join(" ");
    if (statusFields && STATUS_SIGNAL_RE.test(statusFields) && statusFields !== prevStatusFields) {
      return true;
    }

    // Otherwise require the supporting text (notes / rationale / evidence
    // snippets / evidence summary) to contain explicit pass/terms/hold
    // language. A neutral inbound email is not enough.
    const textBlob = [
      pv.notes,
      pv.note,
      pv.reason,
      c.rationale_summary,
      c.evidence_summary,
      ...(Array.isArray(c.evidence_references)
        ? c.evidence_references.flatMap((e) => [e?.snippet, e?.label])
        : []),
    ]
      .filter((s) => typeof s === "string")
      .join("\n");

    if (SIGNAL_RE.test(textBlob)) return true;
    dropped++;
    return false;
  });
  return { kept, dropped };
}

/**
 * Drop draft_email / follow-up candidates that target a funding source whose
 * current state is terminal (not_a_fit, passed, declined, unresponsive,
 * on-hold, withdrawn, dead, lost, rejected, closed, no-go). These lenders
 * are resolved — nudging them is never appropriate, regardless of last
 * contact recency. Applies universally to ALL draft_email lender proposals,
 * not just the deal that triggered the rule.
 */
function filterLenderDraftEmails(
  candidates: CandidateItem[],
  fundingSources?: any[],
): { kept: CandidateItem[]; dropped: number } {
  const TERMINAL_LENDER_RE =
    /(not[_\s-]?a[_\s-]?fit|notafit|not_fit|\bpass(?:ed|ing)?\b|declin|withdraw|dead|\blost\b|reject|kill|no[\s_-]*go|closed|unresponsive|on[_\s-]?hold|paus(?:e|ed|ing)?)/i;
  // "Concentration" stages: once any lender on a deal hits diligence (term
  // sheet signed, DD underway) or closed & funded, the deal is committed to
  // that lender. Nudging OTHERS at that point is incorrect.
  const CONCENTRATION_RE =
    /(in[\s_-]?(?:due[\s_-]?)?diligence|due[\s_-]?diligence|\bdiligence\b|\bdd\b|closed[\s_&-]*(?:and[\s_-]+)?funded|\bfunded\b|term[\s_-]?sheet[\s_-]?signed)/i;
  const fsById = new Map<string, any>();
  for (const f of fundingSources ?? []) {
    if (f?.id) fsById.set(String(f.id), f);
  }
  // Detect "diligence concentration": if ANY funding source on the deal is
  // in diligence (or already closed/funded), we don't nudge OTHER lenders —
  // the deal is concentrated with whoever is in DD, and shopping/follow-ups
  // elsewhere is incorrect.
  const fsState = (f: any) =>
    [
      f?.tracking_status,
      f?.stage,
      f?.substage,
      f?.status,
      f?.stage_label,
      f?.substage_label,
    ]
      .map((v) => (typeof v === "string" ? v : ""))
      .join(" ");
  const anyInDiligence = (fundingSources ?? []).some((f) =>
    CONCENTRATION_RE.test(fsState(f)),
  );
  let dropped = 0;
  const kept = candidates.filter((c) => {
    if (c.action_type !== "draft_email") return true;
    // Q&A response drafts stay in the queue even if the lender is terminal
    // or the deal has diligence concentration — the sender still asked a
    // specific question and we may still want to answer it.
    const srcKind = String((c as any)?.source?.kind || "").toLowerCase();
    if (srcKind === "lender_question_response") return true;
    const targetType = (c.target_object_type ?? "").toString().toLowerCase();
    const tid = c.target_object_id ? String(c.target_object_id) : "";
    const fs = tid ? fsById.get(tid) : null;
    const isLenderTarget =
      targetType === "funding_source" ||
      targetType === "deal_lender" ||
      targetType === "lender" ||
      !!fs; // target_object_id resolves to a deal_lender on this deal
    if (!isLenderTarget || !fs) return true;
    const stateBlob = fsState(fs);
    if (TERMINAL_LENDER_RE.test(stateBlob)) {
      dropped++;
      return false;
    }
    // Diligence concentration: only the lender(s) actually in diligence may
    // be nudged when the deal has someone in DD. Drop nudges for everyone
    // else.
    if (anyInDiligence && !CONCENTRATION_RE.test(stateBlob)) {
      dropped++;
      return false;
    }
    return true;
  });
  return { kept, dropped };
}

/**
 * Deterministic guardrail: an `update_funding_source` proposal that moves a
 * lender to "on-hold" (or any hold/pause-shaped value) is ONLY valid when the
 * evidence explicitly cites lender language for pausing the deal — "revisit",
 * "table", "pause", "postpone", "circle back later", "park this", "shelve",
 * "put on hold", etc. When the only signal is silence / no response / stale
 * cadence, the lender is unresponsive, not on hold. We rewrite the proposal
 * to stage="unresponsive" so the AI's classification mistake can't reach the
 * approval queue.
 *
 * Applied to ALL update_funding_source candidates, regardless of which prompt
 * path produced them.
 */
function normalizeHoldVsUnresponsive(candidates: CandidateItem[]): {
  kept: CandidateItem[];
  rewritten: number;
} {
  // Explicit pause/hold language a lender must actually have used.
  const EXPLICIT_HOLD_RE =
    /\b(revisit|table\s+(?:this|it|the\s+deal)|paus(?:e|ing|ed)|postpone(?:d|ment)?|circle\s+back\s+(?:later|in\s+\w+)|park(?:ed|ing)?\s+(?:this|the\s+deal|it)|shelv(?:e|ed|ing)|put\s+(?:this|it|the\s+deal)\s+on\s+hold|on\s+hold|come\s+back\s+to\s+this|hold\s+(?:off|on)\s+(?:this|for))\b/i;
  // Silence / no-response markers — these alone never justify an on-hold move.
  const SILENCE_ONLY_RE =
    /\b(no\s+response|hasn'?t\s+respond|haven'?t\s+heard|gone\s+silent|stopped\s+responding|unresponsive|ghost(?:ed|ing)?|stale|crickets|no\s+reply|awaiting\s+response|days?\s+since\s+last\s+contact|business\s+days?\s+since)\b/i;
  // What "hold-shaped" stage/status values look like in proposed_values.
  const HOLD_VALUE_RE = /(^|[\s_-])(on[\s_-]?hold|hold|paus(?:e|ed)|postpone)/i;

  let rewritten = 0;
  const kept = candidates.map((c) => {
    if (c.action_type !== "update_funding_source") return c;
    const pv = (c.proposed_values ?? {}) as Record<string, any>;
    const stage = typeof pv.stage === "string" ? pv.stage : "";
    const substage = typeof pv.substage === "string" ? pv.substage : "";
    const tracking = typeof pv.tracking_status === "string" ? pv.tracking_status : "";
    const proposingHold =
      HOLD_VALUE_RE.test(stage) || HOLD_VALUE_RE.test(substage) || HOLD_VALUE_RE.test(tracking);

    // Even when proposed_values don't mention hold, the AI sometimes writes
    // a rationale that RECOMMENDS on-hold ("may warrant on-hold status",
    // "consider putting on hold"). Scrub that wording so reviewers see
    // "Unresponsive" as the recommendation, matching the gate above.
    const rationaleText = typeof c.rationale_summary === "string" ? c.rationale_summary : "";
    const RATIONALE_HOLD_RE = /\b(on[\s-]?hold|put\s+(?:on|it\s+on)\s+hold|warrant\s+(?:an?\s+)?on[\s-]?hold|consider\s+on[\s-]?hold|hold\s+status)\b/i;
    const RATIONALE_SILENCE_RE = /\b(no\s+(?:response|reply)|multiple\s+follow[\s-]?ups?|followed\s+up|hasn'?t\s+respond|haven'?t\s+heard|gone\s+silent|stopped\s+responding|unresponsive|ghost(?:ed|ing)?|stale|crickets|awaiting\s+response|days?\s+since\s+last\s+contact|business\s+days?\s+since|no\s+substage)\b/i;
    const rationaleSuggestsHoldOnSilence =
      RATIONALE_HOLD_RE.test(rationaleText) && RATIONALE_SILENCE_RE.test(rationaleText);

    if (!proposingHold && !rationaleSuggestsHoldOnSilence) return c;

    const evidenceText = [
      pv.notes,
      pv.note,
      pv.reason,
      c.rationale_summary,
      c.evidence_summary,
      ...(Array.isArray(c.evidence_references)
        ? c.evidence_references.flatMap((e) => [e?.snippet, e?.label])
        : []),
    ]
      .filter((s) => typeof s === "string")
      .join("\n");

    const hasExplicitHold = EXPLICIT_HOLD_RE.test(evidenceText);
    if (hasExplicitHold) return c; // legitimate hold — leave it alone.

    const hasSilenceSignal = SILENCE_ONLY_RE.test(evidenceText);
    // If there's neither explicit hold language nor an obvious silence signal,
    // we still rewrite — the AI shouldn't be proposing on-hold without quoted
    // lender language, and unresponsive is the safer default.
    rewritten++;
    const nextPv: Record<string, any> = { ...pv };
    if (HOLD_VALUE_RE.test(stage)) nextPv.stage = "unresponsive";
    if (HOLD_VALUE_RE.test(substage)) nextPv.substage = "";
    if (HOLD_VALUE_RE.test(tracking)) nextPv.tracking_status = "active";
    const reasonSuffix = hasSilenceSignal
      ? "Reclassified hold→unresponsive: only silence in evidence, no explicit pause language."
      : "Reclassified hold→unresponsive: no explicit lender pause language in evidence.";
    nextPv.notes =
      typeof nextPv.notes === "string" && nextPv.notes.trim().length
        ? `${nextPv.notes}\n\n${reasonSuffix}`
        : reasonSuffix;

    // Rewrite the rationale wording so reviewers don't see an "on-hold"
    // recommendation for what is actually an unresponsive pattern.
    let nextRationale = rationaleText;
    if (nextRationale) {
      nextRationale = nextRationale
        .replace(/\bmay\s+warrant\s+(?:an?\s+)?on[\s-]?hold(?:\s+status)?\b/gi, "means the correct status is Unresponsive")
        .replace(/\b(?:should|could|might)\s+(?:be\s+)?(?:put\s+|moved\s+)?on[\s-]?hold\b/gi, "should be moved to Unresponsive")
        .replace(/\bon[\s-]?hold\s+status\b/gi, "Unresponsive status")
        .replace(/\bon[\s-]?hold\b/gi, "Unresponsive");
    } else {
      nextRationale = "Multiple follow-ups with no response from the funding source — the correct status is Unresponsive (not on-hold, which requires explicit lender pause language).";
    }

    return {
      ...c,
      proposed_values: nextPv,
      rationale_summary: nextRationale,
    } as CandidateItem;
  });

  return { kept, rewritten };
}

/**
 * Deterministic guardrail: never propose "unresponsive" for a lender when the
 * deal actually had a meeting / call with that lender in the last few business
 * days. Silence is the AI's signal for unresponsive, but silence in email
 * doesn't mean silence overall — a Zoom / calendar / Claap-recorded meeting
 * with the lender IS contact, and the correct next step is for the deal owner
 * to log a status note about that meeting, not to reclassify the lender.
 *
 * We match a lender name against calendar event titles/attendees and Claap
 * recording titles/participants within the last 5 calendar days. If any of
 * those overlap, the update_funding_source→unresponsive proposal is dropped.
 */
function filterUnresponsiveWhenRecentMeeting(
  candidates: CandidateItem[],
  bundle: DealBundle,
): { kept: CandidateItem[]; dropped: number } {
  const RECENT_MS = 5 * 24 * 60 * 60 * 1000; // 5 calendar days
  const now = Date.now();

  const fsById = new Map<string, any>();
  for (const f of bundle.funding_sources ?? []) {
    if (f?.id) fsById.set(String(f.id), f);
  }

  const tokenize = (name: string): string[] => {
    const stop = new Set([
      "the", "and", "of", "llc", "inc", "corp", "corporation", "co",
      "capital", "credit", "finance", "financial", "partners", "fund",
      "funds", "group", "bank", "holdings", "advisors", "advisory",
      "management", "ltd", "lp", "llp", "company", "usa", "us",
    ]);
    return String(name)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !stop.has(t));
  };

  const meetingSignals: Array<{ text: string; ts: number }> = [];
  const pushSignal = (parts: unknown[], tsRaw: unknown) => {
    const ts = tsRaw ? new Date(tsRaw as string).getTime() : NaN;
    if (!Number.isFinite(ts)) return;
    if (now - ts > RECENT_MS || ts > now + 24 * 60 * 60 * 1000) return;
    const text = parts
      .filter((p) => p != null)
      .map((p) => (typeof p === "string" ? p : JSON.stringify(p)))
      .join(" ")
      .toLowerCase();
    if (text.trim().length > 0) meetingSignals.push({ text, ts });
  };
  for (const c of bundle.calendar_items ?? []) {
    pushSignal(
      [(c as any)?.title, (c as any)?.attendees, (c as any)?.organizer_email, (c as any)?.description],
      (c as any)?.start_time ?? (c as any)?.end_time ?? (c as any)?.date,
    );
  }
  for (const r of bundle.claap_recordings ?? []) {
    pushSignal(
      [
        (r as any)?.title,
        (r as any)?.participants,
        (r as any)?.summary,
        (r as any)?.transcript_excerpt,
      ],
      (r as any)?.started_at ?? (r as any)?.ended_at ?? (r as any)?.recorded_at,
    );
  }

  if (meetingSignals.length === 0) return { kept: candidates, dropped: 0 };

  let dropped = 0;
  const kept = candidates.filter((c) => {
    if (c.action_type !== "update_funding_source") return true;
    const pv = (c.proposed_values ?? {}) as Record<string, any>;
    const targets = [pv.stage, pv.substage, pv.tracking_status]
      .filter((v) => typeof v === "string")
      .map((v) => String(v).toLowerCase());
    const isUnresponsive = targets.some((v) => /unresponsive/.test(v));
    if (!isUnresponsive) return true;

    const fs = c.target_object_id ? fsById.get(String(c.target_object_id)) : null;
    const lenderName = fs?.name;
    if (!lenderName || typeof lenderName !== "string") return true;
    const tokens = tokenize(lenderName);
    if (tokens.length === 0) return true;

    const matched = meetingSignals.some(({ text }) =>
      tokens.some((tok) => text.includes(tok)),
    );
    if (matched) {
      dropped++;
      return false;
    }
    return true;
  });

  return { kept, dropped };
}

/**
 * Deterministic guardrail: distinguish "Passed" from "Not a Fit" based on the
 * actual lender language in evidence, and ensure a pass_reason is populated
 * when the lender quoted one. The AI's prompt covers this, but this rewrite
 * is the safety net so a "not a fit" email never lands as a generic "passed"
 * (or vice versa) when the evidence text is unambiguous.
 */
function normalizePassVsNotAFit(candidates: CandidateItem[]): {
  kept: CandidateItem[];
  rewritten: number;
} {
  // Lender said the deal isn't a fit for them — a softer signal than an outright pass.
  const NOT_A_FIT_RE =
    /\b(not\s+a\s+fit|not\s+for\s+us|doesn'?t\s+fit\s+(?:our\s+)?(?:box|mandate|criteria|wheelhouse|profile)|outside\s+(?:our\s+)?(?:credit\s+)?(?:box|mandate|criteria|wheelhouse|profile|appetite)|not\s+in\s+our\s+(?:wheelhouse|box|mandate)|isn'?t\s+a\s+fit)\b/i;
  // Explicit pass/decline language.
  const PASS_RE =
    /\b(we'?ll?\s+pass|we\s+are\s+passing|going\s+to\s+pass|have\s+to\s+pass|gonna\s+pass|taking\s+a\s+pass|it'?s\s+a\s+pass|we\s+pass\b|passing\s+on\s+(?:this|the\s+deal|it)|decline(?:d|ing)?(?:\s+to\s+(?:participate|move\s+forward|proceed))?|we'?re\s+out|we'?ll?\s+have\s+to\s+take\s+a\s+pass)\b/i;
  // Stage values that look like pass/not-a-fit.
  const PASS_VALUE_RE = /\b(pass(?:ed)?|declin(?:ed|ing))\b/i;
  const NOT_FIT_VALUE_RE = /\b(not[_\s-]?a[_\s-]?fit|not_fit|notafit)\b/i;

  let rewritten = 0;
  const kept = candidates.map((c) => {
    if (c.action_type !== "update_funding_source") return c;
    const pv = (c.proposed_values ?? {}) as Record<string, any>;
    const stage = typeof pv.stage === "string" ? pv.stage : "";
    const substage = typeof pv.substage === "string" ? pv.substage : "";
    const tracking = typeof pv.tracking_status === "string" ? pv.tracking_status : "";
    const isPassStage =
      PASS_VALUE_RE.test(stage) || PASS_VALUE_RE.test(substage) || PASS_VALUE_RE.test(tracking);
    const isNotFitStage =
      NOT_FIT_VALUE_RE.test(stage) || NOT_FIT_VALUE_RE.test(substage) || NOT_FIT_VALUE_RE.test(tracking);
    if (!isPassStage && !isNotFitStage) return c;

    // Gather all available evidence text the agent had to work from.
    const evidenceText = [
      pv.notes,
      pv.note,
      pv.reason,
      pv.pass_reason,
      c.rationale_summary,
      c.evidence_summary,
      ...(Array.isArray(c.evidence_references)
        ? c.evidence_references.flatMap((e) => [e?.snippet, e?.label, (e as any)?.body_excerpt])
        : []),
    ]
      .filter((s) => typeof s === "string")
      .join("\n");

    const evidenceSaysNotAFit = NOT_A_FIT_RE.test(evidenceText);
    const evidenceSaysPass = PASS_RE.test(evidenceText);

    const nextPv: Record<string, any> = { ...pv };
    let mutated = false;
    let rewriteNote = "";

    // (1) Agent proposed "passed" but the lender's words are "not a fit" only.
    if (isPassStage && evidenceSaysNotAFit && !evidenceSaysPass) {
      if (PASS_VALUE_RE.test(stage)) nextPv.stage = "not_a_fit";
      if (PASS_VALUE_RE.test(substage)) nextPv.substage = "not_a_fit";
      mutated = true;
      rewriteNote = "Reclassified passed→not_a_fit: evidence quotes \"not a fit\" / \"not for us\" language, not an outright pass.";
    }
    // (2) Agent proposed "not_a_fit" but the lender clearly said "pass".
    else if (isNotFitStage && evidenceSaysPass && !evidenceSaysNotAFit) {
      if (NOT_FIT_VALUE_RE.test(stage)) nextPv.stage = "passed";
      if (NOT_FIT_VALUE_RE.test(substage)) nextPv.substage = "passed";
      mutated = true;
      rewriteNote = "Reclassified not_a_fit→passed: evidence quotes explicit pass/decline language.";
    }

    // (3) Ensure pass_reason is populated for both Passed and Not a Fit when
    //     evidence contains a reasonable reason phrase the agent failed to set.
    if ((isPassStage || isNotFitStage) && !pv.pass_reason) {
      // Try to lift a short reason phrase from the evidence (60-160 chars).
      const trimmed = evidenceText.replace(/\s+/g, " ").trim();
      if (trimmed.length > 0) {
        // Prefer sentences containing the trigger language.
        const sentences = trimmed.split(/(?<=[.!?])\s+/);
        const triggerSentence =
          sentences.find((s) => PASS_RE.test(s) || NOT_A_FIT_RE.test(s)) ?? sentences[0];
        if (triggerSentence && triggerSentence.length > 0) {
          nextPv.pass_reason = triggerSentence.length > 200
            ? triggerSentence.slice(0, 200) + "…"
            : triggerSentence;
          mutated = true;
        }
      }
      if (!nextPv.pass_reason) {
        nextPv.pass_reason = "No reason provided";
        mutated = true;
      }
    }

    // (4) Backfill the lender's status note. On approval this writes to
    //     deal_lenders.notes, which is the user-facing status note. If the
    //     agent didn't emit one, derive a concise 1–2 sentence factual
    //     summary from evidence (fall back to pass_reason). Never store
    //     internal reclassification diagnostics here — those belong on
    //     rationale_summary only.
    if (isPassStage || isNotFitStage) {
      const existingNote = typeof nextPv.notes === "string" ? nextPv.notes.trim() : "";
      if (!existingNote) {
        const trimmed = evidenceText.replace(/\s+/g, " ").trim();
        let summary = "";
        if (trimmed.length > 0) {
          const sentences = trimmed.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0);
          const triggerIdx = sentences.findIndex(
            (s) => PASS_RE.test(s) || NOT_A_FIT_RE.test(s),
          );
          const picked = triggerIdx >= 0
            ? sentences.slice(triggerIdx, triggerIdx + 2)
            : sentences.slice(0, 2);
          summary = picked.join(" ").trim();
          if (summary.length > 320) summary = summary.slice(0, 320).trim() + "…";
        }
        if (!summary) {
          const reason = typeof nextPv.pass_reason === "string" ? nextPv.pass_reason.trim() : "";
          summary = isPassStage
            ? `Lender is passing. ${reason && reason !== "No reason provided" ? `Reason: ${reason}` : "No reason provided."}`
            : `Lender indicated the deal is not a fit. ${reason && reason !== "No reason provided" ? `Reason: ${reason}` : "No specific reason provided."}`;
        }
        nextPv.notes = summary;
        mutated = true;
      }
    }

    if (!mutated) return c;
    rewritten++;

    // Reclassification diagnostics belong on rationale_summary only —
    // deal_lenders.notes must stay a clean, user-facing status note.

    // Sync rationale wording with the corrected stage.
    let nextRationale = typeof c.rationale_summary === "string" ? c.rationale_summary : "";
    if (rewriteNote.includes("passed→not_a_fit") && nextRationale) {
      nextRationale = nextRationale
        .replace(/\b(is\s+)?passing\s+on\b/gi, "$1said it's not a fit on")
        .replace(/\bupdating\s+to\s+passed\b/gi, "updating to Not a Fit")
        .replace(/\bcorrect\s+status\s+is\s+Passed\b/gi, "correct status is Not a Fit");
    } else if (rewriteNote.includes("not_a_fit→passed") && nextRationale) {
      nextRationale = nextRationale
        .replace(/\bsaid\s+(?:the\s+deal\s+)?is\s+not\s+a\s+fit\b/gi, "is passing")
        .replace(/\bupdating\s+to\s+Not\s+a\s+Fit\b/gi, "updating to Passed")
        .replace(/\bcorrect\s+status\s+is\s+Not\s+a\s+Fit\b/gi, "correct status is Passed");
    }

    return {
      ...c,
      proposed_values: nextPv,
      rationale_summary: nextRationale || c.rationale_summary,
    } as CandidateItem;
  });

  return { kept, rewritten };
}

/**
 * Drop `create_followup_task` candidates whose task is a vague
 * "update funding sources" reminder. Funding-source updates are surfaced
 * via the dedicated update_funding_source action (gated above) — we don't
 * want generic task cards mirroring that.
 */
function filterFundingSourceTaskProposals(
  candidates: CandidateItem[],
): { kept: CandidateItem[]; dropped: number } {
  const TASK_TITLE_RE = /update\s+(?:funding\s+sources?|stage)\b/i;
  // Generic "follow up" / "follow-up" titles with no concrete action are noise.
  // Matches: "follow up", "follow-up", "followup", "create follow-up task",
  // "follow up on {Deal}", "follow-up task", etc. when that's the substantive content.
  const VAGUE_FOLLOWUP_RE = /^\s*(?:create\s+)?follow[-\s]?up(?:\s+task)?(?:\s+(?:on|with|for|re|regarding|about)\s+[^.\n]{0,80})?\s*\.?\s*$/i;
  let dropped = 0;
  const kept = candidates.filter((c) => {
    if (c.action_type !== "create_followup_task") return true;
    const pv = (c.proposed_values ?? {}) as Record<string, any>;
    const haystack = [c.item_title, pv.title, pv.name, pv.description]
      .filter((s) => typeof s === "string")
      .join(" \n ");
    if (TASK_TITLE_RE.test(haystack)) {
      dropped++;
      return false;
    }
    // Drop if every text field is just a vague "follow up" phrase.
    const titles = [c.item_title, pv.title, pv.name, pv.description]
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0);
    if (titles.length > 0 && titles.every((s) => VAGUE_FOLLOWUP_RE.test(s))) {
      dropped++;
      return false;
    }
    return true;
  });
  return { kept, dropped };
}

function dedupeAndMerge(
  candidates: CandidateItem[],
  existingKeys: Set<string>,
): { kept: CandidateItem[]; merged: number; filtered: number } {
  const byTarget = new Map<string, CandidateItem>();
  let merged = 0;
  let filtered = 0;
  for (const c of candidates) {
    const k = queueSemanticKey(c as any);
    if (existingKeys.has(k)) {
      filtered++;
      continue;
    }
    const prev = byTarget.get(k);
    if (!prev) {
      byTarget.set(k, c);
    } else {
      // Merge: keep the higher-confidence one and union evidence.
      const winner = c.confidence_score > prev.confidence_score ? c : prev;
      const loser = winner === c ? prev : c;
      winner.evidence_references = [
        ...(winner.evidence_references ?? []),
        ...(loser.evidence_references ?? []),
      ].slice(0, 12);
      byTarget.set(k, winner);
      merged++;
    }
  }
  return { kept: Array.from(byTarget.values()), merged, filtered };
}

/**
 * Deterministic "Update Tasks" prompt.
 *
 * When a deal in the active pipeline has zero outstanding tasks AND the most
 * recent task on the deal (any status) was last touched more than 12 hours
 * ago — or the deal has never had any tasks and was itself last updated
 * more than 12 hours ago — return a synthetic `create_followup_task`
 * candidate that asks the user to add tasks (titles, assignees, due dates)
 * for the deal. Returns null when the deal already has outstanding tasks
 * or the 12-hour gap hasn't elapsed yet.
 *
 * The card is deduplicated against existing pending queue rows via the
 * standard queueSemanticKey (`${deal_id}::create_followup_task::task::`),
 * so re-runs won't stack multiple "Update Tasks" cards on the same deal.
 */
async function maybeBuildUpdateTasksCandidate(
  supabase: SupabaseClient,
  deal: { id: string; company?: string | null; updated_at?: string | null },
  bundle: DealSignalBundle,
): Promise<CandidateItem | null> {
  if ((bundle.open_tasks?.length ?? 0) > 0) return null;

  // Find the most recent activity on ANY task for this deal (including
  // completed/archived). If none exist, fall back to the deal's own
  // updated_at so brand-new deals get a "12 hours after creation" grace
  // window before the prompt fires.
  const { data: lastTaskRow } = await supabase
    .from("tasks")
    .select("updated_at")
    .eq("deal_id", deal.id)
    .order("updated_at", { ascending: false })
    .limit(1);
  const lastTaskAt = (lastTaskRow ?? [])[0]?.updated_at as string | null | undefined;
  const referenceAt = lastTaskAt ?? deal.updated_at ?? null;
  if (!referenceAt) return null;
  const referenceMs = new Date(referenceAt).getTime();
  if (!Number.isFinite(referenceMs)) return null;
  const twelveHoursMs = 12 * 60 * 60 * 1000;
  if (Date.now() - referenceMs < twelveHoursMs) return null;

  const dealName = deal.company || bundle.deal_name || "this deal";
  const description =
    `This deal has no outstanding tasks and hasn't had any task activity in the last 12 hours. ` +
    `Add task(s) for the next steps — include titles, assignees, and due dates so the deal keeps moving.`;

  // Prefill sensible defaults so the details panel renders editable
  // fields for title / assignee / due date. Reviewer edits the values
  // in-line before approving, at which point a task is created.
  const ownerId = bundle.current?.deal_owner_user_id ?? null;
  const defaultDue = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  return {
    action_type: "create_followup_task",
    item_title: `${dealName} Needs Tasks`,
    linked_entity_label: dealName,
    target_object_type: "task",
    target_object_id: null,
    target_field_paths: [],
    current_values: { open_tasks: 0, last_task_activity_at: lastTaskAt ?? null },
    proposed_values: {
      _synthetic: "update_tasks",
      // Seed the details panel with a single blank task row so the
      // reviewer sees the task-creation UI immediately. They can add
      // more rows (title / due date / assignee) before approving —
      // approval creates all of them against the deal at once.
      tasks: [
        {
          title: "",
          assigned_to: ownerId,
          due_date: defaultDue,
          description: "",
        },
      ],
      description,
    },
    rationale_summary:
      "Deal in the active pipeline has no outstanding tasks and no task activity in the last 12 hours. Prompt the user to add tasks so this deal doesn't stall.",
    evidence_summary: lastTaskAt
      ? `Most recent task activity on this deal was ${lastTaskAt}; no tasks are currently open.`
      : "This deal has never had any tasks and has been idle for more than 12 hours.",
    evidence_references: [
      {
        kind: "task",
        label: lastTaskAt ? "Last task activity on deal" : "Deal has no tasks",
        snippet: lastTaskAt
          ? `Last task activity: ${lastTaskAt} (>12h ago)`
          : `Deal last updated: ${deal.updated_at ?? "unknown"} (>12h ago)`,
      },
    ],
    confidence_score: 0.95,
    risk_level: "low",
    bulk_eligible: false,
    requires_send_ui: false,
    priority: "normal",
  };
}

function normalizeQueueTargetType(actionType: string, targetType?: string | null): string {
  const fallback = TARGET_TYPE_BY_ACTION[actionType as AdminActionType] ?? "";
  const raw = String(targetType ?? fallback).trim().toLowerCase();
  // The UI/user-facing copy calls these "funding sources", but the executable
  // object is the deal_lenders row. Treat both labels as the same target so the
  // agent cannot create duplicate "Update Trinity Capital" cards just because
  // one run used target_object_type="funding_source" and another used
  // "deal_lender".
  if (raw === "funding_source" || raw === "lender" || raw === "deal_funding_source") return "deal_lender";
  return raw;
}

function semanticActionGroup(actionType: string, normalizedTargetType: string, targetId?: string | null): string {
  // For a specific lender/funding source, status/stage updates and follow-up
  // email drafts are the same reviewer decision: this lender needs attention.
  // Keep one queue item per (deal, lender) instead of piling up Update + Draft +
  // Escalation cards for the same thing.
  if (
    targetId &&
    normalizedTargetType === "deal_lender" &&
    (actionType === "update_funding_source" || actionType === "draft_email")
  ) {
    return "funding_source_attention";
  }
  return actionType;
}

function evidenceArray(row: { evidence?: unknown }): any[] {
  return Array.isArray(row.evidence) ? row.evidence : [];
}

function extractLenderEvidenceId(row: { evidence?: unknown }): string | null {
  for (const ev of evidenceArray(row)) {
    const kind = String(ev?.kind ?? "").trim().toLowerCase();
    if (!["funding_source", "deal_lender", "lender"].includes(kind)) continue;
    const id = ev?.ref_id ?? ev?.id ?? null;
    if (typeof id === "string" && id.trim().length > 0) return id.trim();
  }
  return null;
}

function extractPayloadLenderTargetId(row: { payload?: unknown }): string | null {
  const payload = asObject(row.payload);
  const execPayload = asObject(payload.on_approve_execution_payload);
  const execType = normalizeQueueTargetType("draft_email", execPayload.target_object_type as string | null);
  const execId = execPayload.target_object_id;
  if (execType === "deal_lender" && typeof execId === "string" && execId.trim()) return execId.trim();
  const directId = payload.deal_lender_id ?? payload.admin_agent_lender_id ?? null;
  if (typeof directId === "string" && directId.trim()) return directId.trim();
  return null;
}

function resolveLenderAttentionTarget(row: {
  action_type?: string | null;
  target_object_type?: string | null;
  target_object_id?: string | null;
  payload?: unknown;
  evidence?: unknown;
}): string | null {
  const actionType = row.action_type ?? "";
  const targetType = normalizeQueueTargetType(actionType, row.target_object_type);
  const targetId = row.target_object_id ?? null;
  if (targetId && targetType === "deal_lender") return targetId;
  if (actionType !== "draft_email" && actionType !== "update_funding_source") return null;
  return extractPayloadLenderTargetId(row) ?? extractLenderEvidenceId(row);
}

/**
 * Return the exact `schedule_call:{deal_id}:{funding_source_id}` bundle_key
 * carried by a schedule-a-call queue row (either as a live candidate or a
 * persisted ai_action_queue row), or null when this isn't a schedule-call.
 * Checks proposed_values, new_values, and the executor payload so dedupe
 * works uniformly whether the row is pre-insert (candidate) or post-insert.
 */
function extractScheduleCallBundleKey(row: {
  payload?: unknown;
  proposed_values?: unknown;
  new_values?: unknown;
}): string | null {
  const check = (v: unknown): string | null => {
    const o = asObject(v);
    const bk = o.bundle_key;
    return typeof bk === "string" && bk.startsWith("schedule_call:") ? bk : null;
  };
  const direct =
    check((row as any).proposed_values) ??
    check((row as any).new_values);
  if (direct) return direct;
  const payload = asObject((row as any).payload);
  return (
    check(payload.on_approve_execution_payload) ??
    check((payload as any).new_values) ??
    check((payload as any).proposed_values) ??
    null
  );
}

export function queueSemanticKey(row: {
  action_type?: string | null;
  target_object_type?: string | null;
  target_object_id?: string | null;
  deal_id?: string | null;
  payload?: unknown;
  evidence?: unknown;
}): string {
  const actionType = row.action_type ?? "";
  const targetType = normalizeQueueTargetType(actionType, row.target_object_type);
  // Schedule-a-call cards live in their own dedupe bucket, keyed by the
  // `schedule_call:{deal_id}:{funding_source_id}` bundle_key. This
  // guarantees repeated inbound "let's connect" emails for the same
  // (deal, lender) collapse into a single Approval Queue item, and
  // that a schedule-call card does NOT collide with an unrelated
  // funding_source_attention (status / draft-email) card for the same
  // lender — they are separate reviewer decisions.
  if (actionType === "create_followup_task") {
    const scheduleBundle = extractScheduleCallBundleKey(row);
    if (scheduleBundle) {
      return `${row.deal_id ?? ""}::schedule_call::${scheduleBundle}`;
    }
  }
  const lenderTargetId = resolveLenderAttentionTarget(row);
  if (lenderTargetId) {
    return `${row.deal_id ?? ""}::funding_source_attention::deal_lender::${lenderTargetId}`;
  }
  const group = semanticActionGroup(actionType, targetType, row.target_object_id ?? null);
  // For add_status_note, notes on the same deal are NOT interchangeable —
  // a terms-issued note about Lender A must not collide with a call-summary
  // note about a Claap sync, or with a terms-issued note about Lender B.
  // Salt the key with the primary evidence ref id so distinct sources
  // (different emails, different meetings, different lenders) each get
  // their own slot in the queue.
  if (actionType === "add_status_note") {
    const salt = extractStatusNoteTopicSalt(row);
    return `${row.deal_id ?? ""}::${group}::${targetType}::${row.target_object_id ?? ""}::${salt}`;
  }
  if (actionType === "save_to_data_room") {
    const salt = extractDataRoomSalt(row);
    return `${row.deal_id ?? ""}::${group}::${targetType}::${row.target_object_id ?? ""}::${salt}`;
  }
  return `${row.deal_id ?? ""}::${group}::${targetType}::${row.target_object_id ?? ""}`;
}

function extractStatusNoteTopicSalt(row: {
  payload?: unknown;
  evidence?: unknown;
}): string {
  // Prefer the first evidence reference's id — evidence points at the concrete
  // source event (email, claap, meeting) that motivated the note. Different
  // sources ⇒ different slots.
  const evList = evidenceArray(row);
  const refList = Array.isArray((row as any).evidence_references)
    ? ((row as any).evidence_references as any[])
    : [];
  for (const ev of [...evList, ...refList]) {
    const id = (ev as any)?.ref_id ?? (ev as any)?.id;
    if (typeof id === "string" && id.trim().length > 0) return id.trim();
  }
  // Fall back to the first few words of the note body. Candidate items store
  // this at top-level `proposed_values`; persisted queue rows nest it inside
  // `payload.on_approve_execution_payload.new_values` (or legacy
  // `payload.proposed_values`). Check all three so the salt is stable across
  // "candidate coming from the model" and "row already in the queue".
  const payload = asObject(row.payload);
  const execNv = asObject(asObject(payload.on_approve_execution_payload).new_values);
  const topLevelPv = asObject((row as any).proposed_values);
  const pv = Object.keys(topLevelPv).length > 0
    ? topLevelPv
    : (Object.keys(execNv).length > 0 ? execNv : asObject(payload.proposed_values));
  const note = typeof pv.note === "string" ? pv.note : (typeof pv.notes === "string" ? pv.notes : "");
  if (note) {
    return note.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").slice(0, 6).join("-");
  }
  return "";
}

function extractDataRoomSalt(row: {
  payload?: unknown;
  proposed_values?: unknown;
}): string {
  // Candidate items use top-level `proposed_values`. Persisted queue rows
  // nest the same fields inside `payload.on_approve_execution_payload.new_values`
  // (Cf. how save_to_data_room mutations get executed). Read all three so the
  // salt matches across candidate ⇄ existing-row comparisons — otherwise
  // repeated runs of the agent stack duplicate "Save X to data room" cards.
  const payload = asObject(row.payload);
  const execNv = asObject(asObject(payload.on_approve_execution_payload).new_values);
  const topLevelPv = asObject((row as any).proposed_values);
  const pv = Object.keys(topLevelPv).length > 0
    ? topLevelPv
    : (Object.keys(execNv).length > 0 ? execNv : asObject(payload.proposed_values));
  // Dedupe on attachment filename only. Using source_email_id here breaks
  // when the same inbound message is cached under multiple gmail_message_id
  // rows (e.g. the message appears on both the sender's and recipient's
  // mailbox sync, or Nylas re-ingests the thread) — each cache row has a
  // different id but points at the same PDF, so keying by email id lets
  // duplicate "Save X to data room" cards slip through. The filename
  // scoped to the deal (via row.deal_id, already in the outer key) is the
  // stable identity of the attachment we care about.
  const name = typeof pv.attachment_name === "string" ? pv.attachment_name : "";
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function normalizeComparableText(v: unknown): string {
  if (Array.isArray(v)) return v.map(normalizeComparableText).join(" ").toLowerCase();
  if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).map(normalizeComparableText).join(" ").toLowerCase();
  return typeof v === "string" ? v.toLowerCase() : "";
}

function inferFundingSourceId(c: CandidateItem, bundle: DealSignalBundle): string | null {
  const haystack = normalizeComparableText([
    c.item_title,
    c.linked_entity_label,
    c.target_field_paths,
    c.current_values,
    c.proposed_values,
    c.rationale_summary,
    c.evidence_summary,
  ]);
  if (!haystack) return null;
  const matches = (bundle.funding_sources ?? [])
    .filter((f: any) => f?.id && f?.name && haystack.includes(String(f.name).toLowerCase()))
    .sort((a: any, b: any) => String(b.name).length - String(a.name).length);
  return matches[0]?.id ? String(matches[0].id) : null;
}

function normalizeCandidateTargets(candidates: CandidateItem[], bundle: DealSignalBundle): CandidateItem[] {
  const validFundingIds = new Set<string>(
    (bundle.funding_sources ?? [])
      .map((f: any) => (f?.id ? String(f.id) : ""))
      .filter((v: string) => v.length > 0),
  );
  const dealIdStr = bundle.deal_id ? String(bundle.deal_id) : "";
  const resolveFundingTargetId = (c: CandidateItem): string | null => {
    const raw = c.target_object_id ? String(c.target_object_id) : "";
    // Reject the deal id being (mis)used as a deal_lender target.
    const candidate = raw && raw !== dealIdStr && validFundingIds.has(raw) ? raw : null;
    if (candidate) return candidate;
    const inferred = inferFundingSourceId(c, bundle);
    if (inferred && validFundingIds.has(inferred)) return inferred;
    return null;
  };
  return candidates.map((c) => {
    const normalizedType = normalizeQueueTargetType(c.action_type, c.target_object_type);
    if (c.action_type === "update_funding_source") {
      return {
        ...c,
        target_object_type: "deal_lender",
        target_object_id: resolveFundingTargetId(c),
      };
    }

    if (c.action_type === "draft_email") {
      const explicitFundingTarget = normalizedType === "deal_lender";
      const resolvedLenderId = resolveFundingTargetId(c);
      if (explicitFundingTarget || resolvedLenderId) {
        return {
          ...c,
          target_object_type: "deal_lender",
          target_object_id: resolvedLenderId,
        };
      }
    }

    return { ...c, target_object_type: normalizedType };
  });
}

const PRIORITY_RANK: Record<string, number> = { low: 0, normal: 1, high: 2, urgent: 3 };
const RISK_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };

/**
 * Stamp `proposed_values.bundle_key = "terms_issued:{deal_id}:{lender_id}"` on
 * every candidate that belongs to the same Terms Issued bundle for a given
 * (deal, funding_source). The Approval Queue UI groups items sharing this key
 * into a single lender card. Safety net for when the model omits the key.
 */
function stampTermsIssuedBundleKeys(
  candidates: CandidateItem[],
  bundle: DealSignalBundle,
): CandidateItem[] {
  const dealId = bundle.deal_id ? String(bundle.deal_id) : "";
  if (!dealId) return candidates;

  const emailRefToLender = new Map<string, string>();
  for (const c of candidates) {
    if (c.action_type !== "update_funding_source") continue;
    const lenderId = c.target_object_id ? String(c.target_object_id) : "";
    if (!lenderId || lenderId === dealId) continue;
    const pv = (c.proposed_values ?? {}) as Record<string, any>;
    const stageTxt = `${pv.stage ?? ""} ${pv.tracking_status ?? ""}`.toLowerCase();
    if (!/terms|issued/.test(stageTxt)) continue;
    for (const ev of (c.evidence_references ?? []) as any[]) {
      const kind = String(ev?.kind ?? "").toLowerCase();
      const refId = ev?.ref_id ?? ev?.id;
      if ((kind === "email" || kind === "email_thread") && typeof refId === "string" && refId) {
        if (!emailRefToLender.has(refId)) emailRefToLender.set(refId, lenderId);
      }
    }
  }

  return candidates.map((c) => {
    const pv = (c.proposed_values ?? {}) as Record<string, any>;
    if (pv.bundle_key) return c;

    if (c.action_type === "update_funding_source") {
      const lenderId = c.target_object_id ? String(c.target_object_id) : "";
      const stageTxt = `${pv.stage ?? ""} ${pv.tracking_status ?? ""}`.toLowerCase();
      if (lenderId && lenderId !== dealId && /terms|issued/.test(stageTxt)) {
        return { ...c, proposed_values: { ...pv, bundle_key: `terms_issued:${dealId}:${lenderId}` } };
      }
      return c;
    }

    if (
      c.action_type === "add_status_note" ||
      c.action_type === "save_to_data_room"
    ) {
      for (const ev of (c.evidence_references ?? []) as any[]) {
        const refId = ev?.ref_id ?? ev?.id;
        if (typeof refId === "string" && emailRefToLender.has(refId)) {
          const lenderId = emailRefToLender.get(refId)!;
          return {
            ...c,
            proposed_values: { ...pv, bundle_key: `terms_issued:${dealId}:${lenderId}` },
          };
        }
      }
    }
    return c;
  });
}

function maxRankedValue<T extends string>(a: T | null | undefined, b: T | null | undefined, ranks: Record<string, number>, fallback: T): T {
  const av = a ?? fallback;
  const bv = b ?? fallback;
  return (ranks[bv] ?? 0) > (ranks[av] ?? 0) ? bv : av;
}

function asObject(v: unknown): Record<string, any> {
  return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {};
}

function mergeEvidence(existing: unknown, incoming: unknown): any[] {
  const out: any[] = [];
  const seen = new Set<string>();
  for (const ev of [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])]) {
    const key = `${ev?.kind ?? ""}::${ev?.ref_id ?? ""}::${ev?.label ?? ""}::${ev?.snippet ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ev);
    if (out.length >= 12) break;
  }
  return out;
}

async function collapseDuplicatePendingApprovals(
  supabase: SupabaseClient,
  companyId: string,
): Promise<number> {
  const { data: pending, error } = await supabase
    .from("ai_action_queue")
    .select("id, deal_id, action_type, title, description, rationale, priority, risk_level, target_object_type, target_object_id, created_at, payload, source, evidence, new_values")
    .eq("status", "pending")
    .filter("source->>origin", "eq", "deal_admin_agent")
    .filter("source->>company_id", "eq", companyId)
    .limit(1000);
  if (error || !pending || pending.length === 0) return 0;

  const idToKey = new Map<string, string>();
  for (const row of pending as any[]) {
    if (row.action_type !== "escalate") idToKey.set(row.id, queueSemanticKey(row));
  }

  const byKey = new Map<string, any[]>();
  for (const row of pending as any[]) {
    const sourceQueueId = row.payload?.source_queue_id ?? row.source?.source_queue_id ?? null;
    const key = row.action_type === "escalate" && sourceQueueId
      ? (idToKey.get(sourceQueueId) ?? queueSemanticKey(row))
      : queueSemanticKey(row);
    const arr = byKey.get(key) ?? [];
    arr.push(row);
    byKey.set(key, arr);
  }

  let collapsed = 0;
  for (const rows of byKey.values()) {
    if (rows.length < 2) continue;
    const sorted = [...rows].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const nonEscalates = sorted.filter((r) => r.action_type !== "escalate");
    const keeper =
      nonEscalates.find((r) => String(r.target_object_type ?? "").toLowerCase() === normalizeQueueTargetType(r.action_type, r.target_object_type)) ??
      nonEscalates[0] ??
      sorted[0];
    const duplicates = sorted.filter((r) => r.id !== keeper.id);
    if (duplicates.length === 0) continue;

    let priority = keeper.priority ?? "normal";
    let risk = keeper.risk_level ?? "medium";
    let evidence: any[] = Array.isArray(keeper.evidence) ? keeper.evidence : [];
    let escalatedAt: string | null = keeper.payload?.escalated_at ?? null;
    let escalatedTo: string | null = keeper.payload?.escalated_to ?? null;

    for (const row of duplicates) {
      priority = maxRankedValue(priority, row.priority, PRIORITY_RANK, "normal");
      risk = maxRankedValue(risk, row.risk_level, RISK_RANK, "medium");
      evidence = mergeEvidence(evidence, row.evidence);
      const p = asObject(row.payload);
      if (row.action_type === "escalate" || p.escalated_at) {
        escalatedAt = escalatedAt ?? p.escalated_at ?? new Date().toISOString();
        escalatedTo = escalatedTo ?? p.escalated_to ?? row.new_values?.escalate_to ?? null;
      }
    }

    const keeperPayload = asObject(keeper.payload);
    const { error: keepErr } = await supabase
      .from("ai_action_queue")
      .update({
        priority,
        risk_level: risk,
        target_object_type: normalizeQueueTargetType(keeper.action_type, keeper.target_object_type),
        evidence,
        payload: {
          ...keeperPayload,
          escalated_at: escalatedAt ?? keeperPayload.escalated_at,
          escalated_to: escalatedTo ?? keeperPayload.escalated_to,
          duplicate_suppressed_count: Number(keeperPayload.duplicate_suppressed_count ?? 0) + duplicates.length,
          duplicate_suppressed_at: new Date().toISOString(),
        },
      })
      .eq("id", keeper.id)
      .eq("status", "pending");
    if (keepErr) continue;

    const { error: dupErr } = await supabase
      .from("ai_action_queue")
      .update({
        status: "dismissed",
        dismissed_at: new Date().toISOString(),
        rejection_reason: "auto_resolved_duplicate_pending_item",
      })
      .in("id", duplicates.map((r) => r.id))
      .eq("status", "pending");
    if (!dupErr) collapsed += duplicates.length;
  }
  return collapsed;
}

/* ------------------------------------------------------------------ */
/*  Queue insert                                                       */
/* ------------------------------------------------------------------ */

// Per-deal collapse: the Approval Queue must never show more than ONE
// pending "Add Status Note" item per deal. Status notes always describe
// the latest activity/status on a deal — older status-note drafts are
// stale the moment a newer one lands. Keep the most recently created
// pending add_status_note per deal and dismiss the rest.
async function collapseStatusNotePerDeal(
  supabase: SupabaseClient,
  companyId: string,
): Promise<number> {
  const { data: pending, error } = await supabase
    .from("ai_action_queue")
    .select("id, deal_id, created_at")
    .eq("status", "pending")
    .eq("action_type", "add_status_note")
    .filter("source->>origin", "eq", "deal_admin_agent")
    .filter("source->>company_id", "eq", companyId)
    .limit(1000);
  if (error || !pending || pending.length === 0) return 0;

  const byDeal = new Map<string, any[]>();
  for (const row of pending as any[]) {
    if (!row.deal_id) continue;
    const arr = byDeal.get(row.deal_id) ?? [];
    arr.push(row);
    byDeal.set(row.deal_id, arr);
  }

  let collapsed = 0;
  for (const rows of byDeal.values()) {
    if (rows.length < 2) continue;
    const sorted = [...rows].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const [, ...older] = sorted;
    const { error: dupErr } = await supabase
      .from("ai_action_queue")
      .update({
        status: "dismissed",
        dismissed_at: new Date().toISOString(),
        rejection_reason: "auto_resolved_superseded_by_newer_status_note",
      })
      .in("id", older.map((r) => r.id))
      .eq("status", "pending");
    if (!dupErr) collapsed += older.length;
  }
  return collapsed;
}

function computePriority(c: CandidateItem, dealFlagged: boolean): "urgent" | "high" | "normal" | "low" {
  if (dealFlagged && c.risk_level === "high") return "urgent";
  if (c.action_type === "escalate") return "urgent";
  if (c.priority) return c.priority;
  if (c.confidence_score >= 0.85 && c.risk_level !== "low") return "high";
  if (c.risk_level === "low") return "low";
  return "normal";
}

/* ------------------------------------------------------------------ */
/*  Title change-suffix helpers                                        */
/* ------------------------------------------------------------------ */

function prettifyChangeValue(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "boolean") return raw ? "Completed" : "Not Completed";
  const s = String(raw).trim();
  if (!s) return "";
  // Convert snake/kebab case → Title Case ("on_hold" → "On Hold",
  // "reviewing-drl" → "Reviewing DRL"). Preserve tokens already containing
  // uppercase letters (e.g. "IOI", "LOI") so we don't downcase acronyms.
  const ACRONYMS = new Set([
    "drl","dm","ioi","loi","lp","gp","vc","pe","dd","kyc","kpi","mrr","arr",
    "sla","poc","rfp","rfi","nda","msa","sow","po","qbr","cfo","ceo","cto",
    "coo","cro","cmo","vp","svp","evp","us","usa","uk","eu","ai","api","sdk",
    "sql","erp","crm","hr","it","io","saas","paas","iaas","b2b","b2c","tam",
    "sam","som","yoy","mom","qoq","ytd","mtd","qtd","ebit","ebitda","ltv","cac"
  ]);
  const cleaned = s.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned
    .split(" ")
    .map((w) => {
      if (!w) return w;
      const lower = w.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      // Preserve tokens that already have uppercase mixed in.
      if (/[A-Z]/.test(w) && w !== w.toUpperCase()) return w;
      return lower[0].toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function valuesDiffer(a: unknown, b: unknown): boolean {
  const na = a === null || a === undefined ? "" : String(a).trim().toLowerCase();
  const nb = b === null || b === undefined ? "" : String(b).trim().toLowerCase();
  return na !== nb && String(a ?? "").trim() !== "";
}

/**
 * Return a short " to \"X\"" suffix describing the primary proposed change
 * for this candidate, or "" if nothing meaningful is proposed. Used to make
 * approval-queue titles self-explanatory (e.g. "Update Flow Capital to
 * \"Unresponsive\"" instead of just "Update Flow Capital").
 */
function describeChangeSuffix(c: CandidateItem): string {
  const pv: Record<string, any> = (c.proposed_values as any) ?? {};
  const cv: Record<string, any> = (c.current_values as any) ?? {};

  // The synthetic "no tasks on deal" prompt uses its own title
  // (`${Deal} Needs Tasks`) and asks the user to fill in the task
  // fields — don't append a `to "..."` suffix from the placeholder
  // values we pre-seed for the details form.
  if (pv._synthetic === "update_tasks") return "";

  // Priority order per action_type: which field carries the "main" intent.
  const priorityByAction: Record<string, string[]> = {
    update_funding_source: ["stage", "status", "priority", "next_step"],
    add_status_note: ["status", "deal_status"],
    update_deal_status: ["status", "deal_status"],
    update_deal_stage: ["stage_label", "stage_name", "stage", "pipeline_stage_id"],
    update_deal_field: ["value", "new_value"],
    update_milestone: ["completed", "status", "title"],
    create_milestone: ["title", "name"],
    update_contact: ["status", "role", "title"],
    update_contact_field: ["value", "new_value"],
    update_company: ["status", "name"],
    reassign_deal: ["assigned_to_name", "owner_name", "assigned_to"],
  };

  const keys = priorityByAction[c.action_type] ?? [];
  let pickedKey: string | null = null;
  let pickedValue: unknown = undefined;
  for (const k of keys) {
    if (k in pv && valuesDiffer(pv[k], cv[k])) {
      pickedKey = k;
      pickedValue = pv[k];
      break;
    }
  }
  // Fallback: first proposed field that meaningfully differs.
  if (pickedKey === null) {
    for (const k of Object.keys(pv)) {
      if (["id", "deal_id", "notes", "note", "description", "rationale"].includes(k)) continue;
      if (valuesDiffer(pv[k], cv[k])) {
        pickedKey = k;
        pickedValue = pv[k];
        break;
      }
    }
  }
  if (pickedKey === null) return "";
  const pretty = prettifyChangeValue(pickedValue);
  if (!pretty) return "";
  // Keep suffix compact — no giant blobs of text in the queue title.
  if (pretty.length > 40) return "";
  return `to "${pretty}"`;
}

function buildCandidateRows(
  opts: AnalyzeOpts,
  bundle: DealSignalBundle,
  candidates: CandidateItem[],
): any[] {
  if (candidates.length === 0) return [];
  const owner = bundle.current.deal_owner_user_id;
  const ownerAllowed = owner && (!opts.activatedUserIds || opts.activatedUserIds.has(owner));
  const assignedTo = ownerAllowed ? (owner as string) : opts.attributionUserId;
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const fundingNameById = new Map<string, string>();
  for (const f of bundle.funding_sources ?? []) {
    if (f?.id && f?.name) fundingNameById.set(String(f.id), String(f.name));
  }
  return candidates.map((c) => {
    const risk = c.risk_level ?? RISK_BY_TYPE[c.action_type];
    const priority = computePriority({ ...c, risk_level: risk }, bundle.current.is_flagged);
    // For funding-source updates, normalize the queue title to
    // "Update {Lender Name}". The deal name is already shown via
    // deal_name / target chip — don't repeat it in the title.
    let title = c.item_title;
    if (c.action_type === "update_funding_source") {
      const lenderName =
        (c.target_object_id ? fundingNameById.get(String(c.target_object_id)) : null) ||
        c.linked_entity_label ||
        (c.proposed_values as any)?.lender_name ||
        (c.current_values as any)?.lender_name ||
        "lender";
      title = `Update ${lenderName}`;
    }
    // Normalize lender outbound draft titles: the queue surfaces these as
    // "Follow up …" items, never "Nudge …". Rewrite any variant the LLM
    // produced (Nudge / Draft Nudge / Gentle Nudge / Ping / Re-ping).
    if (c.action_type === "draft_email" && typeof title === "string" && title) {
      let t = title;
      t = t.replace(/\bDraft\s+Nudge\s+Email\s+to\b/gi, "Follow up with");
      t = t.replace(/\bDraft\s+Nudge\s+to\b/gi, "Follow up with");
      t = t.replace(/\bGentle\s+Nudge\b/gi, "Follow up");
      t = t.replace(/\bNudge\s+Email\s+to\b/gi, "Follow up with");
      t = t.replace(/\bRe-?ping\b/gi, "Follow up");
      t = t.replace(/\bNudge\b/gi, "Follow up");
      t = t.replace(/\s{2,}/g, " ").trim();
      title = t;
    }
    // Append the primary proposed change so titles clearly convey intent
    // (e.g. `Update Flow Capital to "Unresponsive"` instead of a generic
    // `Update Flow Capital`).
    const suffix = describeChangeSuffix(c);
    if (suffix && title && !title.toLowerCase().includes(suffix.toLowerCase())) {
      title = `${title} ${suffix}`;
    }
    return {
      user_id: opts.attributionUserId,
      assigned_to: assignedTo,
      deal_id: bundle.deal_id,
      deal_name: bundle.deal_name,
      action_type: c.action_type,
      title,
      description: c.rationale_summary,
      priority,
      risk_level: risk,
      target_object_type: normalizeQueueTargetType(c.action_type, c.target_object_type),
      target_object_id: c.target_object_id ?? null,
      old_values: c.current_values ?? {},
      new_values: c.proposed_values ?? {},
      evidence: c.evidence_references ?? [],
      rationale: c.rationale_summary,
      payload: {
        linked_entity_label: c.linked_entity_label,
        target_field_paths: c.target_field_paths ?? [],
        confidence_score: c.confidence_score,
        bulk_eligible: !!c.bulk_eligible,
        requires_send_ui: c.action_type === "draft_email" ? true : !!c.requires_send_ui,
        evidence_summary: c.evidence_summary,
        on_approve_execution_type:
          c.action_type === "draft_email" ? "stage_email_for_send" : "execute_mutation",
        on_approve_execution_payload: {
          target_object_type: normalizeQueueTargetType(c.action_type, c.target_object_type),
          target_object_id: c.target_object_id,
          new_values: c.proposed_values,
        },
        on_reject_behavior: "log_reason_no_mutation",
      },
      source: {
        origin: "deal_admin_agent",
        trigger: opts.source,
        company_id: opts.companyId,
        evidence_count: (c.evidence_references ?? []).length,
      },
      expires_at: expiresAt,
    };
  });
}

async function insertCandidates(
  supabase: SupabaseClient,
  opts: AnalyzeOpts,
  bundle: DealSignalBundle,
  candidates: CandidateItem[],
): Promise<{ ids: string[]; error: string | null }> {
  const rows = buildCandidateRows(opts, bundle, candidates);
  if (rows.length === 0) return { ids: [], error: null };
  const { data, error } = await supabase
    .from("ai_action_queue")
    .insert(rows)
    .select("id");
  if (error) return { ids: [], error: error.message };
  return { ids: (data ?? []).map((r: any) => r.id), error: null };
}

/**
 * Refresh a still-pending schedule_call Approval Queue row with the
 * latest details the agent detected on a subsequent inbound "let's
 * connect" email. Merges (does not overwrite) contact_emails and
 * evidence, and refreshes the evidence snippet / rationale / description
 * / proposed values so the reviewer always sees the newest context.
 * Never re-opens or changes status.
 */
async function applyScheduleCallUpdate(
  supabase: SupabaseClient,
  existing: {
    id: string;
    payload: Record<string, any>;
    new_values: Record<string, any>;
    rationale: string | null;
    evidence: any[];
    description: string | null;
    title: string | null;
  },
  candidate: CandidateItem,
  bundle: DealSignalBundle,
): Promise<void> {
  const proposed = (candidate.proposed_values ?? {}) as Record<string, any>;

  // Merge lender contact emails (unique, order-preserving).
  const prevEmails: string[] = Array.isArray(
    (existing.new_values as any)?.lender_contact_emails,
  )
    ? (existing.new_values as any).lender_contact_emails.filter(
        (v: any): v is string => typeof v === "string" && v.length > 0,
      )
    : [];
  const nextEmails: string[] = Array.isArray(proposed.lender_contact_emails)
    ? proposed.lender_contact_emails.filter(
        (v: any): v is string => typeof v === "string" && v.length > 0,
      )
    : [];
  const mergedEmails = Array.from(
    new Set([...prevEmails, ...nextEmails].map((e) => e.trim().toLowerCase())),
  ).filter(Boolean);

  const nextNewValues = {
    ...(existing.new_values ?? {}),
    ...proposed,
    lender_contact_emails: mergedEmails,
  };

  // Merge evidence references (cap at 12).
  const prevEvidence = Array.isArray(existing.evidence) ? existing.evidence : [];
  const newEvidence = Array.isArray(candidate.evidence_references)
    ? candidate.evidence_references
    : [];
  const mergedEvidence = [...newEvidence, ...prevEvidence].slice(0, 12);

  const nextPayload = {
    ...(existing.payload ?? {}),
    // Refresh evidence snippet + confidence with the newer signal.
    evidence_summary:
      candidate.evidence_summary ||
      (existing.payload as any)?.evidence_summary ||
      "",
    confidence_score:
      typeof candidate.confidence_score === "number"
        ? candidate.confidence_score
        : (existing.payload as any)?.confidence_score,
    on_approve_execution_payload: {
      ...((existing.payload as any)?.on_approve_execution_payload ?? {}),
      target_object_type: normalizeQueueTargetType(
        candidate.action_type,
        candidate.target_object_type,
      ),
      target_object_id:
        candidate.target_object_id ??
        (existing.payload as any)?.on_approve_execution_payload?.target_object_id ??
        null,
      new_values: nextNewValues,
    },
    schedule_call_last_refreshed_at: new Date().toISOString(),
  };

  const updatePatch: Record<string, any> = {
    new_values: nextNewValues,
    evidence: mergedEvidence,
    rationale: candidate.rationale_summary || existing.rationale,
    description: candidate.rationale_summary || existing.description,
    payload: nextPayload,
  };

  const { error } = await supabase
    .from("ai_action_queue")
    .update(updatePatch)
    .eq("id", existing.id)
    .eq("status", "pending"); // never resurrect approved/dismissed rows
  if (error) throw new Error(error.message);

  console.log(
    `[deal-admin-agent] schedule_call REFRESHED row=${existing.id} deal=${bundle.deal_id} emails=${mergedEmails.length}`,
  );
}

/* ------------------------------------------------------------------ */
/*  Main entry                                                         */
/* ------------------------------------------------------------------ */

/**
 * Mark pending deal_admin_agent approval items as dismissed when the
 * underlying object has already been updated by a user after the queue
 * item was created. This is how the agent "removes" stale cards on its
 * regular sweep — if the deal manager has handled the lender, milestone,
 * stage, etc. themselves, we don't keep asking for approval.
 */
async function reconcileStalePendingApprovals(
  supabase: SupabaseClient,
  companyId: string,
): Promise<number> {
  // Map target_object_type -> source table + timestamp column to compare.
  const TARGET_TABLE: Record<string, { table: string; ts: string }> = {
    deal: { table: "deals", ts: "updated_at" },
    deal_lender: { table: "deal_lenders", ts: "updated_at" },
    deal_milestone: { table: "deal_milestones", ts: "updated_at" },
    referral_source: { table: "referral_sources", ts: "updated_at" },
    contact: { table: "contacts", ts: "updated_at" },
  };

  const { data: pending, error } = await supabase
    .from("ai_action_queue")
    .select("id, action_type, target_object_type, target_object_id, deal_id, created_at, source, new_values")
    .eq("status", "pending")
    .filter("source->>origin", "eq", "deal_admin_agent")
    .filter("source->>company_id", "eq", companyId)
    .limit(500);
  if (error || !pending || pending.length === 0) return 0;

  const toResolve: string[] = [];

  // Batch by table to minimize round-trips.
  const byTable = new Map<string, Array<{ id: string; created_at: string; target_id: string }>>();
  for (const row of pending as any[]) {
    const tot = row.target_object_type as string | null;
    const toid = row.target_object_id as string | null;
    if (!tot || !toid) continue;
    // draft_email / add_status_note / create_milestone are handled below
    // by deal-scoped activity checks (status notes table, milestones
    // table, sent emails) — skip the generic target_table comparison.
    if (
      row.action_type === "draft_email" ||
      row.action_type === "add_status_note" ||
      row.action_type === "create_milestone"
    ) continue;
    const def = TARGET_TABLE[tot];
    if (!def) continue;
    const arr = byTable.get(def.table) ?? [];
    arr.push({ id: row.id as string, created_at: row.created_at as string, target_id: toid });
    byTable.set(def.table, arr);
  }

  for (const [table, rows] of byTable) {
    const ids = Array.from(new Set(rows.map((r) => r.target_id)));
    if (ids.length === 0) continue;
    const { data: targets } = await supabase
      .from(table)
      .select("id, updated_at")
      .in("id", ids);
    const tsById = new Map<string, string>();
    for (const t of (targets ?? []) as any[]) {
      if (t?.id && t?.updated_at) tsById.set(t.id, t.updated_at);
    }
    for (const r of rows) {
      const ts = tsById.get(r.target_id);
      if (!ts) continue;
      // Add a 60s buffer so we don't race the agent's own insert.
      if (new Date(ts).getTime() > new Date(r.created_at).getTime() + 60_000) {
        toResolve.push(r.id);
      }
    }
  }

  // Extra signal for update_funding_source: a recent email thread on the
  // deal whose subject mentions the lender name. The lender row itself
  // rarely gets touched when the deal manager simply replies to an email,
  // but a fresh thread message means the manager is already handling it.
  const lenderItems = (pending as any[]).filter(
    (p) => p.action_type === "update_funding_source" && p.deal_id && p.target_object_id,
  );
  if (lenderItems.length > 0) {
    const lenderIds = Array.from(new Set(lenderItems.map((p) => p.target_object_id as string)));
    const { data: lenders } = await supabase
      .from("deal_lenders")
      .select("id, name, deal_id, master_lender_id, tracking_status, stage, substage")
      .in("id", lenderIds);
    const nameById = new Map<string, { name: string; deal_id: string; master_lender_id: string | null }>();
    const stateById = new Map<string, string>();
    for (const l of (lenders ?? []) as any[]) {
      if (l?.id && l?.name) nameById.set(l.id, {
        name: l.name, deal_id: l.deal_id, master_lender_id: l.master_lender_id ?? null,
      });
      if (l?.id) {
        stateById.set(
          l.id,
          [l.tracking_status, l.stage, l.substage].filter((v) => typeof v === "string").join(" "),
        );
      }
    }

    // Auto-dismiss any update_funding_source items whose targeted lender is
    // already in a terminal/passed state — there is nothing left for the
    // user to update on that lender.
    const TERMINAL_LENDER_RE = /pass|declin|withdraw|dead|lost|reject|kill|no[\s_-]*go/i;
    for (const p of lenderItems) {
      const state = stateById.get(p.target_object_id as string) ?? "";
      if (state && TERMINAL_LENDER_RE.test(state)) {
        toResolve.push(p.id);
      }
    }

    const dealIds = Array.from(new Set(lenderItems.map((p) => p.deal_id as string)));
    const { data: threads } = await supabase
      .from("email_threads")
      .select("matched_deal_id, subject, latest_message_at")
      .in("matched_deal_id", dealIds)
      .order("latest_message_at", { ascending: false })
      .limit(500);

    // Build a map: master_lender_id -> emails[] from lender_contacts so we
    // can also catch threads whose subject doesn't carry the lender name
    // but the from/to includes a known lender contact.
    const masterIds = Array.from(
      new Set(Array.from(nameById.values()).map((m) => m.master_lender_id).filter((v): v is string => !!v)),
    );
    const emailsByMaster = new Map<string, Set<string>>();
    if (masterIds.length > 0) {
      const { data: lcs } = await supabase
        .from("lender_contacts")
        .select("lender_id, email")
        .in("lender_id", masterIds);
      for (const lc of (lcs ?? []) as any[]) {
        const e = (lc.email as string | null)?.toLowerCase();
        if (!e || !lc.lender_id) continue;
        const set = emailsByMaster.get(lc.lender_id) ?? new Set<string>();
        set.add(e);
        emailsByMaster.set(lc.lender_id, set);
      }
    }

    // Pull recent gmail messages tied to matched deal threads. We re-use
    // email_threads.thread_id to scope gmail_messages by thread_id.
    const allThreadIds = Array.from(
      new Set(((threads ?? []) as any[])
        .map((t) => (t as any).thread_id ?? null)
        .filter((v): v is string => !!v)),
    );
    let gmailByThread = new Map<string, Array<{ from: string; to: string[]; received_at: string }>>();
    if (allThreadIds.length > 0) {
      const { data: gmails } = await supabase
        .from("gmail_messages")
        .select("thread_id, from_email, to_emails, received_at")
        .in("thread_id", allThreadIds)
        .order("received_at", { ascending: false })
        .limit(2000);
      for (const g of (gmails ?? []) as any[]) {
        const tid = g.thread_id as string;
        if (!tid) continue;
        const arr = gmailByThread.get(tid) ?? [];
        arr.push({
          from: (g.from_email ?? "").toLowerCase(),
          to: Array.isArray(g.to_emails) ? g.to_emails.map((s: string) => (s ?? "").toLowerCase()) : [],
          received_at: g.received_at,
        });
        gmailByThread.set(tid, arr);
      }
    }

    for (const item of lenderItems) {
      if (toResolve.includes(item.id)) continue;
      const meta = nameById.get(item.target_object_id);
      if (!meta) continue;
      const needle = meta.name.toLowerCase();
      const createdMs = new Date(item.created_at).getTime();
      const lenderEmails = meta.master_lender_id
        ? (emailsByMaster.get(meta.master_lender_id) ?? new Set<string>())
        : new Set<string>();
      // (a) Thread subject mentions the lender name and has fresh activity.
      const subjectHit = (threads ?? []).some((t: any) => {
        if (t.matched_deal_id !== item.deal_id) return false;
        if (!t.latest_message_at) return false;
        if (new Date(t.latest_message_at).getTime() <= createdMs) return false;
        return typeof t.subject === "string" && t.subject.toLowerCase().includes(needle);
      });
      // (b) A known lender contact appears on a fresh inbound/outbound
      // message tied to any thread matched to this deal.
      const contactHit = lenderEmails.size > 0 && ((threads ?? []) as any[]).some((t: any) => {
        if (t.matched_deal_id !== item.deal_id) return false;
        const tid = (t as any).thread_id;
        if (!tid) return false;
        const msgs = gmailByThread.get(tid) ?? [];
        return msgs.some((m) => {
          if (new Date(m.received_at).getTime() <= createdMs) return false;
          if (m.from && lenderEmails.has(m.from)) return true;
          if (m.to.some((e) => lenderEmails.has(e))) return true;
          return false;
        });
      });
      if (subjectHit || contactHit) toResolve.push(item.id);
    }
  }

  // Extra signal: deal-scoped activity satisfying common action types.
  const dealScopeItems = (pending as any[]).filter(
    (p) =>
      p.deal_id &&
      (p.action_type === "update_deal_stage" ||
        p.action_type === "update_deal_status" ||
        p.action_type === "add_status_note" ||
        p.action_type === "create_milestone"),
  );
  if (dealScopeItems.length > 0) {
    const dealIds = Array.from(new Set(dealScopeItems.map((p) => p.deal_id as string)));
    // Stage history → resolves update_deal_stage / update_deal_status.
    const { data: stageHist } = await supabase
      .from("deal_stage_history")
      .select("deal_id, changed_at")
      .in("deal_id", dealIds)
      .order("changed_at", { ascending: false })
      .limit(500);
    const lastStageByDeal = new Map<string, number>();
    for (const h of (stageHist ?? []) as any[]) {
      if (!h.deal_id || !h.changed_at) continue;
      const ms = new Date(h.changed_at).getTime();
      if (!lastStageByDeal.has(h.deal_id) || lastStageByDeal.get(h.deal_id)! < ms) {
        lastStageByDeal.set(h.deal_id, ms);
      }
    }
    // Status notes → resolves add_status_note.
    const { data: notes } = await supabase
      .from("deal_status_notes")
      .select("deal_id, created_at")
      .in("deal_id", dealIds)
      .order("created_at", { ascending: false })
      .limit(500);
    const lastNoteByDeal = new Map<string, number>();
    for (const n of (notes ?? []) as any[]) {
      if (!n.deal_id || !n.created_at) continue;
      const ms = new Date(n.created_at).getTime();
      if (!lastNoteByDeal.has(n.deal_id) || lastNoteByDeal.get(n.deal_id)! < ms) {
        lastNoteByDeal.set(n.deal_id, ms);
      }
    }
    // Milestones → resolves create_milestone (any new milestone).
    const { data: ms } = await supabase
      .from("deal_milestones")
      .select("deal_id, created_at")
      .in("deal_id", dealIds)
      .order("created_at", { ascending: false })
      .limit(500);
    const lastMilestoneByDeal = new Map<string, number>();
    for (const m of (ms ?? []) as any[]) {
      if (!m.deal_id || !m.created_at) continue;
      const t = new Date(m.created_at).getTime();
      if (!lastMilestoneByDeal.has(m.deal_id) || lastMilestoneByDeal.get(m.deal_id)! < t) {
        lastMilestoneByDeal.set(m.deal_id, t);
      }
    }

    for (const item of dealScopeItems) {
      if (toResolve.includes(item.id)) continue;
      const createdMs = new Date(item.created_at).getTime() + 60_000;
      const dealId = item.deal_id as string;
      if (
        (item.action_type === "update_deal_stage" || item.action_type === "update_deal_status") &&
        (lastStageByDeal.get(dealId) ?? 0) > createdMs
      ) {
        toResolve.push(item.id);
        continue;
      }
      if (item.action_type === "add_status_note" && (lastNoteByDeal.get(dealId) ?? 0) > createdMs) {
        toResolve.push(item.id);
        continue;
      }
      if (item.action_type === "create_milestone" && (lastMilestoneByDeal.get(dealId) ?? 0) > createdMs) {
        toResolve.push(item.id);
        continue;
      }
    }
  }

  // Freshness check: if a proposal cites client participants by email and
  // those clients have corresponded (sent or received a fresh email) after
  // the queue item was created, the underlying basis ("client owes us X",
  // "log this call", "draft a nudge") is stale — dismiss it. This catches
  // the common case where the deal manager has already moved on but hasn't
  // logged a status note, updated the stage, etc.
  const freshnessItems = (pending as any[]).filter(
    (p) =>
      p.deal_id &&
      (p.action_type === "add_status_note" ||
        p.action_type === "draft_email" ||
        p.action_type === "create_followup_task" ||
        p.action_type === "update_deal_status"),
  );
  if (freshnessItems.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("email")
      .eq("company_id", companyId);
    const internalEmails = new Set<string>(
      ((profs ?? []) as any[])
        .map((p) => (p.email ?? "").toLowerCase())
        .filter((e) => !!e),
    );
    const internalDomains = new Set<string>();
    for (const e of internalEmails) {
      const d = e.split("@")[1];
      if (d) internalDomains.add(d);
    }

    const freshIds = freshnessItems.map((f) => f.id as string);
    const { data: fullRows } = await supabase
      .from("ai_action_queue")
      .select("id, deal_id, created_at, evidence")
      .in("id", freshIds);

    const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const itemMeta = new Map<
      string,
      { dealId: string; createdMs: number; emails: Set<string>; domains: Set<string> }
    >();
    for (const row of (fullRows ?? []) as any[]) {
      const emails = new Set<string>();
      const domains = new Set<string>();
      const evStr = JSON.stringify(row.evidence ?? []);
      const matches = evStr.match(EMAIL_RE) ?? [];
      for (const raw of matches) {
        const e = raw.toLowerCase();
        if (internalEmails.has(e)) continue;
        const d = e.split("@")[1];
        if (d && internalDomains.has(d)) continue;
        emails.add(e);
        if (d) domains.add(d);
      }
      if (emails.size === 0) continue;
      itemMeta.set(row.id, {
        dealId: row.deal_id,
        createdMs: new Date(row.created_at).getTime(),
        emails,
        domains,
      });
    }

    if (itemMeta.size > 0) {
      const allClientEmails = Array.from(
        new Set(Array.from(itemMeta.values()).flatMap((v) => Array.from(v.emails))),
      );
      const earliestCreated = Math.min(
        ...Array.from(itemMeta.values()).map((v) => v.createdMs),
      );
      const sinceIso = new Date(earliestCreated).toISOString();

      const [gmRes, ecRes] = await Promise.all([
        supabase
          .from("gmail_messages")
          .select("from_email, received_at")
          .in("from_email", allClientEmails)
          .gte("received_at", sinceIso)
          .limit(1000),
        supabase
          .from("email_cache")
          .select("from_email, received_at")
          .in("from_email", allClientEmails)
          .gte("received_at", sinceIso)
          .limit(1000),
      ]);
      const allMsgs = [
        ...(((gmRes as any).data ?? []) as any[]),
        ...(((ecRes as any).data ?? []) as any[]),
      ];

      for (const [itemId, meta] of itemMeta) {
        if (toResolve.includes(itemId)) continue;
        const hit = allMsgs.some((m) => {
          const fe = (m.from_email ?? "").toLowerCase();
          if (!fe || !meta.emails.has(fe)) return false;
          return new Date(m.received_at).getTime() > meta.createdMs;
        });
        if (hit) toResolve.push(itemId);
      }
    }
  }

  // Off-pipeline guard (5th Line): the Deal Admin Agent is scoped strictly to
  // the default "Active" pipeline. Any pending item attached to a deal that
  // currently lives in another pipeline (e.g. "In Development", "Archived",
  // "naitive Pipeline") is by definition out of scope and should be cleared.
  if (companyId === FIFTH_LINE_COMPANY_ID) {
    const { data: pipeRow } = await supabase
      .from("deal_pipelines")
      .select("id")
      .eq("company_id", companyId)
      .eq("is_default", true)
      .maybeSingle();
    const activePipelineId = (pipeRow as any)?.id ?? null;
    if (activePipelineId) {
      const dealIdsAll = Array.from(
        new Set(
          (pending as any[])
            .map((p) => p.deal_id)
            .filter((v): v is string => typeof v === "string" && v.length > 0),
        ),
      );
      if (dealIdsAll.length > 0) {
        const { data: dealRows } = await supabase
          .from("deals")
          .select("id, pipeline_id")
          .in("id", dealIdsAll);
        const pipelineByDeal = new Map<string, string | null>();
        for (const d of (dealRows ?? []) as any[]) {
          pipelineByDeal.set(d.id, d.pipeline_id ?? null);
        }
        for (const p of pending as any[]) {
          if (!p.deal_id) continue;
          const pid = pipelineByDeal.get(p.deal_id);
          if (pid && pid !== activePipelineId && !toResolve.includes(p.id)) {
            toResolve.push(p.id);
          }
        }
      }
    }
  }

  if (toResolve.length === 0) return 0;

  // Kick-off milestone reconciliation: any pending update_milestone /
  // create_milestone targeting a kick-off milestone must be backed by a
  // PAST calendar event whose title contains "kick off" / "kickoff" /
  // "kick-off" for the same deal. Without such an event, dismiss it.
  const KICK_RE_REC = /kick[\s-]?off/i;
  const kickoffPending = (pending as any[]).filter(
    (p) =>
      (p.action_type === "update_milestone" || p.action_type === "create_milestone") &&
      p.deal_id && p.target_object_id,
  );
  if (kickoffPending.length > 0) {
    const milestoneIds = Array.from(new Set(kickoffPending.map((p) => p.target_object_id as string)));
    const { data: mrows } = await supabase
      .from("deal_milestones")
      .select("id, title")
      .in("id", milestoneIds);
    const kickoffMilestoneIds = new Set<string>(
      ((mrows ?? []) as any[])
        .filter((m) => typeof m?.title === "string" && KICK_RE_REC.test(m.title))
        .map((m) => m.id as string),
    );
    const kickoffItems = kickoffPending.filter((p) =>
      kickoffMilestoneIds.has(p.target_object_id as string),
    );
    if (kickoffItems.length > 0) {
      const dealIds = Array.from(new Set(kickoffItems.map((p) => p.deal_id as string)));
      const { data: calRows } = await supabase
        .from("deal_calendar_items")
        .select("deal_id, title, date")
        .in("deal_id", dealIds);
      const nowMs = Date.now();
      const hasKickoffByDeal = new Map<string, boolean>();
      for (const ev of (calRows ?? []) as any[]) {
        if (!ev?.deal_id || !KICK_RE_REC.test(ev?.title ?? "")) continue;
        const t = ev?.date ? Date.parse(`${ev.date}T23:59:59Z`) : NaN;
        if (!Number.isNaN(t) && t <= nowMs) {
          hasKickoffByDeal.set(ev.deal_id, true);
        }
      }
      for (const p of kickoffItems) {
        if (toResolve.includes(p.id)) continue;
        if (!hasKickoffByDeal.get(p.deal_id as string)) {
          toResolve.push(p.id);
        }
      }
    }
  }

  // Concentration reconciliation: if a deal has ANY funding source already
  // in diligence (term sheet signed, DD underway) or closed/funded, dismiss
  // pending draft_email lender nudges targeting OTHER funding sources that
  // are not themselves in that concentration state. We don't shop the deal
  // around once a lender is committed.
  const CONCENTRATION_RE_REC =
    /(in[\s_-]?(?:due[\s_-]?)?diligence|due[\s_-]?diligence|\bdiligence\b|\bdd\b|closed[\s_&-]*(?:and[\s_-]+)?funded|\bfunded\b|term[\s_-]?sheet[\s_-]?signed)/i;
  // KEEP only nudges that target a lender ACTIVELY in diligence (or term sheet
  // signed). Funded/closed lenders are terminal — nudging them is moot, so
  // they fall outside the keep-set and get dismissed alongside the rest.
  const ACTIVE_DILIGENCE_RE =
    /(in[\s_-]?(?:due[\s_-]?)?diligence|due[\s_-]?diligence|\bdiligence\b|\bdd\b|term[\s_-]?sheet[\s_-]?signed)/i;
  const lenderEmailPending = (pending as any[]).filter(
    (p) =>
      p.action_type === "draft_email" &&
      p.deal_id &&
      p.target_object_id,
  );
  if (lenderEmailPending.length > 0) {
    const dealIds = Array.from(new Set(lenderEmailPending.map((p) => p.deal_id as string)));
    const { data: allLenders } = await supabase
      .from("deal_lenders")
      .select("id, deal_id, tracking_status, stage, substage")
      .in("deal_id", dealIds);
    // Resolve stage/substage UUIDs to labels via lender_stage_configs.
    const { data: stageCfgRows } = await supabase
      .from("lender_stage_configs")
      .select("stages, substages")
      .eq("company_id", companyId)
      .limit(5);
    const stageLabelById = new Map<string, string>();
    const substageLabelById = new Map<string, string>();
    for (const row of (stageCfgRows ?? []) as any[]) {
      for (const s of (row?.stages ?? []) as any[]) {
        if (s?.id && typeof s?.label === "string") stageLabelById.set(String(s.id), s.label);
      }
      for (const s of (row?.substages ?? []) as any[]) {
        if (s?.id && typeof s?.label === "string") substageLabelById.set(String(s.id), s.label);
      }
    }
    const stateById = new Map<string, string>();
    const dealHasDiligence = new Map<string, boolean>();
    for (const l of (allLenders ?? []) as any[]) {
      const stageLabel = l.stage ? (stageLabelById.get(String(l.stage)) ?? String(l.stage)) : "";
      const substageLabel = l.substage
        ? (substageLabelById.get(String(l.substage)) ?? String(l.substage))
        : "";
      const blob = [l.tracking_status, l.stage, l.substage, stageLabel, substageLabel]
        .filter((v) => typeof v === "string")
        .join(" ");
      if (l?.id) stateById.set(l.id, blob);
      if (l?.deal_id && CONCENTRATION_RE_REC.test(blob)) {
        dealHasDiligence.set(l.deal_id, true);
      }
    }
    for (const p of lenderEmailPending) {
      if (toResolve.includes(p.id)) continue;
      if (!dealHasDiligence.get(p.deal_id as string)) continue;
      // Only act on lender-targeted drafts: target_object_id must map to a
      // deal_lender on this deal. Skip client/referral/other drafts so we
      // don't accidentally dismiss legitimate non-lender nudges.
      const targetState = stateById.get(p.target_object_id as string);
      if (targetState === undefined) continue;
      if (!ACTIVE_DILIGENCE_RE.test(targetState)) {
        toResolve.push(p.id);
      }
    }

    // Terminal-lender reconciliation: dismiss pending OUTBOUND NUDGE drafts
    // whose target lender has since moved to a terminal state
    // (passed / not_a_fit / declined / withdrawn / dead / lost / rejected /
    // closed / unresponsive / on-hold / paused). We deliberately exclude
    // Q&A response drafts (source.kind === 'lender_question_response') —
    // even a "passed" lender may have asked a specific question that still
    // deserves an answer. Nudges become moot; Q&A does not.
    const TERMINAL_LENDER_RE_REC =
      /(not[_\s-]?a[_\s-]?fit|notafit|not_fit|\bpass(?:ed|ing)?\b|declin|withdraw|dead|\blost\b|reject|kill|no[\s_-]*go|closed|unresponsive|on[_\s-]?hold|paus(?:e|ed|ing)?)/i;
    for (const p of lenderEmailPending) {
      if (toResolve.includes(p.id)) continue;
      const targetState = stateById.get(p.target_object_id as string);
      if (!targetState) continue;
      const srcKind = String((p as any)?.source?.kind || "").toLowerCase();
      if (srcKind === "lender_question_response") continue; // Q&A replies still valid
      if (TERMINAL_LENDER_RE_REC.test(targetState)) {
        toResolve.push(p.id);
      }
    }

    // Placeholder-recipient safety net: any pending draft_email whose only
    // recipient(s) sit on an `@example.com` / `@example.org` domain (or an
    // obviously synthetic address like `*-contact@…`) is un-sendable — the
    // funding source has no real contact on file. Dismiss so the queue isn't
    // polluted with drafts pointing at seed/placeholder addresses.
    const PLACEHOLDER_DOMAIN_RE = /@(example\.(com|org|net)|test\.local|localhost|invalid)$/i;
    for (const p of lenderEmailPending) {
      if (toResolve.includes(p.id)) continue;
      const nv: any = (p as any).new_values || {};
      const rawTo = nv?.to;
      const toArr: string[] = Array.isArray(rawTo)
        ? rawTo.map((v: any) => String(v || "").toLowerCase()).filter(Boolean)
        : typeof rawTo === "string"
          ? rawTo.split(/[,;\s]+/).map((v) => v.toLowerCase()).filter(Boolean)
          : [];
      if (toArr.length === 0) continue;
      const allPlaceholder = toArr.every((addr) => PLACEHOLDER_DOMAIN_RE.test(addr));
      if (allPlaceholder) toResolve.push(p.id);
    }
  }

  if (toResolve.length === 0) return 0;

  const nowIso = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("ai_action_queue")
    .update({
      status: "dismissed",
      dismissed_at: nowIso,
      rejection_reason: "auto_resolved_user_already_acted",
    })
    .in("id", toResolve)
    .eq("status", "pending");
  if (updErr) {
    console.log(`[deal-admin-agent] reconcile update failed: ${updErr.message}`);
    return 0;
  }
  return toResolve.length;
}

export async function runDealAdminAgentAnalysis(opts: AnalyzeOpts): Promise<AnalyzeResult> {
  const {
    supabase,
    companyId,
    dealIds,
    maxDeals = 25,
    maxQueueRows = 60,
    minConfidence = 0.6,
  } = opts;

  const result: AnalyzeResult = {
    evaluated_deals: 0,
    candidates_proposed: 0,
    candidates_filtered: 0,
    candidates_merged: 0,
    queue_rows_inserted: 0,
    queue_ids: [],
    errors: [],
    auto_resolved_pending: 0,
  };

  // 0) Reconcile: clear pending deal_admin_agent approval items where the
  //    user has already acted on the underlying object (e.g. lender updated,
  //    milestone marked complete, deal stage changed, status note added).
  try {
    const collapsed = await collapseDuplicatePendingApprovals(supabase, companyId);
    if (collapsed > 0) {
      result.auto_resolved_pending = (result.auto_resolved_pending ?? 0) + collapsed;
      console.log(`[deal-admin-agent] collapsed ${collapsed} duplicate pending approval items for company=${companyId}`);
    }
    const collapsedNotes = await collapseStatusNotePerDeal(supabase, companyId);
    if (collapsedNotes > 0) {
      result.auto_resolved_pending = (result.auto_resolved_pending ?? 0) + collapsedNotes;
      console.log(`[deal-admin-agent] collapsed ${collapsedNotes} superseded pending status-note items for company=${companyId}`);
    }
    const resolved = await reconcileStalePendingApprovals(supabase, companyId);
    result.auto_resolved_pending = (result.auto_resolved_pending ?? 0) + resolved;
    if (resolved > 0) {
      console.log(`[deal-admin-agent] auto-resolved ${resolved} pending approval items for company=${companyId}`);
    }
  } catch (e) {
    result.errors.push(`reconcile_pending: ${(e as Error)?.message ?? "unknown"}`);
  }

  // Load workspace custom + learned rules once per sweep and inject into
  // every model call so the agent operates under them company-wide.
  let companyRulesBlock: string | null = null;
  let kbTagFilter: string[] = [];
  let passReasonTaxonomyBlock: string | null = null;
  try {
    const [{ data: settings }, { data: learned }] = await Promise.all([
      supabase
        .from("admin_agent_settings")
        .select("custom_rules, knowledge_tag_filter")
        .eq("company_id", companyId)
        .maybeSingle(),
      supabase
        .from("agent_learned_rules")
        .select("rule_text")
        .eq("company_id", companyId)
        .eq("agent_key", "admin_agent")
        .eq("status", "active"),
    ]);
    const customTexts: string[] = Array.isArray((settings as any)?.custom_rules)
      ? ((settings as any).custom_rules as any[])
          .map((r) => (typeof r === "string" ? r : r?.text))
          .filter((t: any) => typeof t === "string" && t.trim().length > 0)
      : [];
    const learnedTexts: string[] = (learned ?? [])
      .map((r: any) => (typeof r?.rule_text === "string" ? r.rule_text.trim() : ""))
      .filter((t: string) => t.length > 0);
    const parts: string[] = [];
    if (customTexts.length > 0) {
      parts.push(`ADMIN AGENT CUSTOM RULES (workspace-specific, follow strictly):\n${customTexts.map((t, i) => `${i + 1}. ${t}`).join("\n")}`);
    }
    if (learnedTexts.length > 0) {
      parts.push(`ADMIN AGENT LEARNED RULES (synthesized from operator feedback — apply with the same weight as custom rules):\n${learnedTexts.map((t, i) => `${i + 1}. ${t}`).join("\n")}`);
    }
    const tagFilter: string[] = Array.isArray((settings as any)?.knowledge_tag_filter)
      ? ((settings as any).knowledge_tag_filter as any[]).filter((t: any) => typeof t === "string" && t.length > 0)
      : [];
    kbTagFilter = tagFilter;
    // Knowledge base is now retrieved per-deal via embeddings (RAG) rather
    // than injected in full here — see retrieveKnowledgeForDeal below.
    if (parts.length > 0) companyRulesBlock = parts.join("\n\n");
  } catch (e) {
    console.warn("[deal-admin-agent] rule load failed", (e as Error)?.message);
  }

  // Load pass-reason taxonomy from Knowledge Base (tag "pass_reasons") so the
  // enum + mapping guidance are edited in the Knowledge tab, not in code.
  try {
    const { taxonomy, source } = await loadPassReasonTaxonomy(supabase, companyId);
    passReasonTaxonomyBlock = buildPassReasonTaxonomyBlock(taxonomy, source);
    console.log(`[deal-admin-agent] pass-reason taxonomy loaded from ${source} (${taxonomy.length} keys)`);
  } catch (e) {
    console.warn("[deal-admin-agent] pass-reason taxonomy load failed", (e as Error)?.message);
  }

  // 1) Load target deals.
  // Scope: deals whose **Deal Manager** is an activated Admin Agent user.
  // The Deal Manager is the source of truth for reminders/agent tasks
  // (Memory: deal-manager-email-resolution). We resolve the manager via,
  // in priority order:
  //   (a) deals.deal_owner_user_id (when set)
  //   (b) deals.manager (text) → profiles by display_name/first_name/full_name
  //   (c) deals.deal_owner (text, legacy) → profiles same way
  // For the 5th Line workspace, additionally restrict to the default
  // ("Active Pipeline") pipeline.
  const activatedArr = Array.from(opts.activatedUserIds ?? new Set<string>());
  if (activatedArr.length === 0) {
    result.errors.push("no activated users — nothing in scope");
    return result;
  }

  let activePipelineId: string | null = null;
  if (companyId === FIFTH_LINE_COMPANY_ID) {
    const { data: pipeRow } = await supabase
      .from("deal_pipelines")
      .select("id")
      .eq("company_id", companyId)
      .eq("is_default", true)
      .maybeSingle();
    activePipelineId = (pipeRow as any)?.id ?? null;
  }

  let dealQ = supabase
    .from("deals")
    .select("id, company, stage, status, deal_owner_user_id, manager, deal_owner, is_flagged, updated_at, company_id, pipeline_id, referral_source_id, value, engagement_type, fee_type, success_fee_percent, retainer_fee, milestone_fee, total_fee, pre_signing_hours, post_signing_hours")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false })
    .limit(Math.max(maxDeals, 200));
  if (activePipelineId) dealQ = dealQ.eq("pipeline_id", activePipelineId);
  if (dealIds && dealIds.length > 0) dealQ = dealQ.in("id", dealIds);
  const { data: deals, error: dealErr } = await dealQ;
  if (dealErr) {
    result.errors.push(`deals query: ${dealErr.message}`);
    return result;
  }

  // Build a name→user_id lookup over activated users so we can resolve the
  // text `manager` / `deal_owner` columns when `deal_owner_user_id` is null.
  const activatedProfiles = new Map<string, { id: string; names: string[] }>();
  {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name, first_name, last_name, full_name")
      .in("id", activatedArr);
    for (const p of (profs ?? []) as any[]) {
      const names: string[] = [];
      for (const k of ["display_name", "full_name", "first_name", "last_name"]) {
        const v = (p as any)[k];
        if (typeof v === "string" && v.trim()) names.push(v.trim().toLowerCase());
      }
      if (typeof p.first_name === "string" && typeof p.last_name === "string") {
        names.push(`${p.first_name} ${p.last_name}`.trim().toLowerCase());
      }
      activatedProfiles.set(p.id, { id: p.id, names: Array.from(new Set(names)) });
    }
  }
  function resolveManagerUserId(d: any): string | null {
    if (d.deal_owner_user_id && activatedArr.includes(d.deal_owner_user_id)) {
      return d.deal_owner_user_id;
    }
    const candidates: string[] = [];
    if (typeof d.manager === "string" && d.manager.trim()) candidates.push(d.manager.trim().toLowerCase());
    if (typeof d.deal_owner === "string" && d.deal_owner.trim()) candidates.push(d.deal_owner.trim().toLowerCase());
    for (const c of candidates) {
      for (const [uid, prof] of activatedProfiles) {
        if (prof.names.some((n) => n && (n === c || c.includes(n) || n.includes(c)))) return uid;
      }
    }
    return null;
  }

  const dealList = (deals ?? []).filter((d: any) => {
    const name = (d.company ?? "").toLowerCase();
    const status = (d.status ?? "").toLowerCase();
    const stage = (d.stage ?? "").toLowerCase();
    if (status === "archived" || status === "archive" || stage === "archived") return false;
    if (name === "test-niki's store" || name === "example deal") return false;
    if (name.startsWith("test ")) return false;
    // Gate by Deal Manager (resolved). Drop deals with no activated manager.
    const mgr = resolveManagerUserId(d);
    if (!mgr) return false;
    // Stash resolved manager for downstream attribution & fingerprint lookup.
    (d as any).deal_owner_user_id = mgr;
    return true;
  }).slice(0, maxDeals);

  // Pre-fetch a per-manager style fingerprint from recent approval edits.
  const fingerprintByUser = new Map<string, string>();
  for (const uid of activatedArr) {
    const { data: deltas } = await supabase
      .from("admin_agent_tone_deltas")
      .select("action_type, original_draft, edited_draft, diff_summary, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(15);
    if (deltas && deltas.length > 0) {
      fingerprintByUser.set(
        uid,
        deltas.map((d: any, i: number) => {
          const orig = JSON.stringify(d.original_draft ?? {}).slice(0, 400);
          const edit = JSON.stringify(d.edited_draft ?? {}).slice(0, 400);
          return `#${i + 1} [${d.action_type}]\n  proposed: ${orig}\n  user-edited: ${edit}${d.diff_summary ? `\n  delta: ${d.diff_summary}` : ""}`;
        }).join("\n"),
      );
    }
  }

  // 2) Existing dedupe keys — anything currently pending, approved, OR
  //    dismissed/rejected in the queue for this company we shouldn't
  //    re-propose. Rejecting a card is a decision the reviewer already
  //    made; a fresh sweep must not resurface it.
  const dealIdsArr = dealList.map((d: any) => d.id);
  const existingKeys = new Set<string>();
  // Map: schedule_call semantic key -> existing pending row we can refresh
  // in place when the agent re-detects the same (deal, lender) connect/
  // schedule request with updated contact emails, description, or evidence.
  // This lets a later inbound email UPDATE the existing Approval Queue
  // item instead of being silently dropped as a duplicate.
  const pendingScheduleCallByKey = new Map<
    string,
    {
      id: string;
      payload: Record<string, any>;
      new_values: Record<string, any>;
      rationale: string | null;
      evidence: any[];
      description: string | null;
      title: string | null;
    }
  >();
  if (dealIdsArr.length > 0) {
    const { data: existing } = await supabase
      .from("ai_action_queue")
      .select("id, action_type, target_object_type, target_object_id, deal_id, status, payload, source, evidence, new_values, rationale, description, title")
      .in("deal_id", dealIdsArr)
      .in("status", ["pending", "approved", "dismissed"]);
    for (const e of existing ?? []) {
      const key = queueSemanticKey(e as any);
      existingKeys.add(key);
      // Candidate keys are deal-local while candidate objects don't carry
      // deal_id at this stage. Add the target-only variant too so old pending
      // cards suppress re-created cards even when the prior row used a
      // different target_object_type label.
      if ((e as any).target_object_id) {
        existingKeys.add(key.replace(`${(e as any).deal_id ?? ""}::`, "::"));
      }
      // Track pending schedule_call rows so a later sweep updates the
      // same card instead of skipping it.
      if (
        (e as any).status === "pending" &&
        key.includes("::schedule_call::") &&
        (e as any).id
      ) {
        pendingScheduleCallByKey.set(key, {
          id: String((e as any).id),
          payload: ((e as any).payload ?? {}) as Record<string, any>,
          new_values: ((e as any).new_values ?? {}) as Record<string, any>,
          rationale: (e as any).rationale ?? null,
          evidence: Array.isArray((e as any).evidence) ? (e as any).evidence : [],
          description: (e as any).description ?? null,
          title: (e as any).title ?? null,
        });
      }
    }
  }

  // 3) Per-deal: gather signals, call model, validate, dedupe, insert.
  let totalInserted = 0;
  for (const d of dealList) {
    if (totalInserted >= maxQueueRows) break;
    result.evaluated_deals++;
    try {
      const bundle = await gatherSignalsForDeal(supabase, d, companyId, opts.activatedUserIds);
      // Deterministic "Update Tasks" prompt: if this active-pipeline deal has
      // no outstanding tasks AND the most recent task on the deal was last
      // updated (or the deal itself was updated) more than 12 hours ago,
      // enqueue a single approval-queue prompt asking the user to add
      // tasks (titles, assignees, due dates) for the deal. This does NOT
      // create the tasks itself — the approver adds them manually.
      const updateTasksCandidate = await maybeBuildUpdateTasksCandidate(supabase, d, bundle);
      // Skip deals with effectively no signal — avoids burning credits.
      const sigCount =
        bundle.activity.length +
        bundle.emails.length +
        bundle.status_notes.length +
        bundle.stage_history.length +
        bundle.calendar_items.length +
        bundle.claap_recordings.length +
        bundle.email_threads.length +
        (bundle.unlinked_terms_emails?.length ?? 0) +
        bundle.referral_sources.length;
      console.log(`[deal-admin-agent] deal=${d.id} ${d.company} signals act=${bundle.activity.length} em=${bundle.emails.length} thr=${bundle.email_threads.length} cal=${bundle.calendar_items.length} claap=${bundle.claap_recordings.length} notes=${bundle.status_notes.length} hist=${bundle.stage_history.length} unlinked_terms=${bundle.unlinked_terms_emails?.length ?? 0}`);
      if (sigCount === 0 && !updateTasksCandidate) continue;

      const fingerprint = bundle.current.deal_owner_user_id
        ? fingerprintByUser.get(bundle.current.deal_owner_user_id) ?? null
        : null;
      const kbBlock = await retrieveKnowledgeForDeal(supabase, companyId, kbTagFilter, bundle);
      const perDealRules = [companyRulesBlock, kbBlock, passReasonTaxonomyBlock]
        .filter((s): s is string => !!s && s.length > 0)
        .join("\n\n") || null;
      const modelCandidates = sigCount > 0
        ? stampTermsIssuedBundleKeys(
            normalizeCandidateTargets(await callModelForCandidates(bundle, fingerprint, perDealRules), bundle),
            bundle,
          )
        : [];
      const rawAll = updateTasksCandidate
        ? [...modelCandidates, updateTasksCandidate]
        : modelCandidates;
      // Drop lender-scoped proposals (draft_email / update_funding_source)
      // whose target_object_id couldn't be resolved to a real deal_lender on
      // this deal. The LLM occasionally emits the deal id or a hallucinated
      // uuid there; without a valid funding-source target we can't dedupe
      // against existing pending items, so the same lender ends up in the
      // queue twice. If we don't know exactly which lender the item is for,
      // the Deal Admin Agent should not create it.
      const raw = rawAll.filter((c) => {
        if (c.action_type !== "draft_email" && c.action_type !== "update_funding_source") return true;
        const tType = String(c.target_object_type ?? "").toLowerCase();
        if (tType !== "deal_lender") return c.action_type !== "update_funding_source";
        const hasTarget = typeof c.target_object_id === "string" && c.target_object_id.length > 0;
        if (!hasTarget) {
          console.log(`[deal-admin-agent] DROPPED ${c.action_type} for deal=${d.id} — unresolved deal_lender target`);
          return false;
        }
        return true;
      });
      result.candidates_filtered += rawAll.length - raw.length;
      result.candidates_proposed += raw.length;
      console.log(`[deal-admin-agent] deal=${d.id} raw_candidates=${raw.length} sample=${JSON.stringify(raw.slice(0,1)).slice(0,400)}`);

      const valid = raw.filter((c) => {
        const ok = isValidCandidate(c, minConfidence);
        if (!ok) {
          console.log(`[deal-admin-agent] REJECT deal=${d.id} type=${c?.action_type} conf=${c?.confidence_score} title=${!!c?.item_title} tot=${c?.target_object_type} toid=${!!c?.target_object_id} ev=${(c?.evidence_references??[]).length} pv=${Object.keys(c?.proposed_values??{}).length}`);
        }
        return ok;
      });
      result.candidates_filtered += raw.length - valid.length;
      if (valid.length === 0) continue;

      // Validate any update_deal_stage proposals against the deal's actual
      // pipeline. The model has historically hallucinated stage ids
      // (e.g. "nda-signed-diligence") that don't exist in the workspace's
      // pipeline configuration — those rows are unexecutable and confuse
      // the approver, so drop them at the source.
      const stageValidated = await filterInvalidStageProposals(supabase, d, valid);
      if (stageValidated.dropped > 0) {
        result.candidates_filtered += stageValidated.dropped;
        console.log(`[deal-admin-agent] DROPPED ${stageValidated.dropped} update_deal_stage proposal(s) for deal=${d.id} — proposed stage not in pipeline`);
      }
      if (stageValidated.kept.length === 0) continue;

      // Drop create_milestone proposals whose title isn't in the workspace's
      // configured milestone taxonomy (default_milestones), or that already
      // exist on the deal. Milestones are curated, not free-form AI ideas.
      const milestoneFiltered = filterUnconfiguredMilestones(stageValidated.kept, bundle);
      if (milestoneFiltered.dropped > 0) {
        result.candidates_filtered += milestoneFiltered.dropped;
        console.log(`[deal-admin-agent] DROPPED ${milestoneFiltered.dropped} create_milestone proposal(s) for deal=${d.id} — title not in configured default_milestones (or already exists)`);
      }
      if (milestoneFiltered.kept.length === 0) continue;

      // Drop any Kick-Off milestone proposal that isn't backed by a real,
      // past calendar event explicitly titled as a kick-off. Prevents the
      // agent from completing the Kick-Off milestone off the back of an
      // unrelated invite (intro / "RE: Fw: …" / discovery).
      const kickoffFiltered = filterInvalidKickoffMilestones(milestoneFiltered.kept, bundle);
      if (kickoffFiltered.dropped > 0) {
        result.candidates_filtered += kickoffFiltered.dropped;
        console.log(`[deal-admin-agent] DROPPED ${kickoffFiltered.dropped} kick-off milestone proposal(s) for deal=${d.id} — no past calendar event titled as a kick-off`);
      }
      if (kickoffFiltered.kept.length === 0) continue;

      // Drop status-note proposals whose newest supporting evidence is
      // older than 7 days. Status notes are for RECENT activity only —
      // no historical backfill from weeks-old meetings/emails.
      const staleNotes = filterStaleStatusNotes(kickoffFiltered.kept, bundle);
      if (staleNotes.dropped > 0) {
        result.candidates_filtered += staleNotes.dropped;
        console.log(`[deal-admin-agent] DROPPED ${staleNotes.dropped} add_status_note proposal(s) for deal=${d.id} — evidence older than 7 days (or undatable)`);
      }
      if (staleNotes.kept.length === 0) continue;

      // Deterministic guardrail: rewrite any update_funding_source proposal
      // moving a lender to on-hold/pause when the evidence doesn't actually
      // quote explicit pause language. Silence/no-response is "unresponsive",
      // never "on-hold". Runs before gating so the rewritten value flows
      // through every downstream check.
      const holdNormalized = normalizeHoldVsUnresponsive(staleNotes.kept);
      if (holdNormalized.rewritten > 0) {
        console.log(`[deal-admin-agent] REWROTE ${holdNormalized.rewritten} update_funding_source proposal(s) for deal=${d.id} — on-hold→unresponsive (no explicit pause language)`);
      }

      // Drop any update_funding_source→unresponsive proposal when the deal
      // actually had a calendar or Claap meeting with that lender in the
      // last 5 days. Silence in email ≠ silence overall — a meeting IS
      // contact, and the correct next step is a status note, not a
      // reclassification to Unresponsive.
      const meetingGated = filterUnresponsiveWhenRecentMeeting(holdNormalized.kept, bundle);
      if (meetingGated.dropped > 0) {
        result.candidates_filtered += meetingGated.dropped;
        console.log(`[deal-admin-agent] DROPPED ${meetingGated.dropped} update_funding_source→unresponsive proposal(s) for deal=${d.id} — recent calendar/Claap meeting with that lender in past 5 days`);
      }
      if (meetingGated.kept.length === 0) continue;

      // Normalize pass vs not-a-fit and populate pass_reason from evidence
      // when the agent forgot. Keeps stage labels honest to lender wording.
      const passNormalized = normalizePassVsNotAFit(meetingGated.kept);
      if (passNormalized.rewritten > 0) {
        console.log(`[deal-admin-agent] REWROTE ${passNormalized.rewritten} update_funding_source proposal(s) for deal=${d.id} — pass/not_a_fit reclassification + pass_reason backfill`);
      }

      // Gate `update_funding_source` proposals: only allow them when the
      // lender communication carries an actionable pass / terms / hold
      // signal. Neutral inbound emails (intros, scheduling, diligence
      // questions) must not generate funding-source update cards.
      const lenderGated = filterFundingSourceProposals(passNormalized.kept, bundle.funding_sources);
      if (lenderGated.dropped > 0) {
        result.candidates_filtered += lenderGated.dropped;
        console.log(`[deal-admin-agent] DROPPED ${lenderGated.dropped} update_funding_source proposal(s) for deal=${d.id} — no pass/terms/hold signal in evidence`);
      }
      if (lenderGated.kept.length === 0) continue;

      // Drop draft_email lender nudges targeting funding sources that are
      // already in a terminal state (not_a_fit, passed, unresponsive, etc.).
      // Universal: nothing to nudge once the lender is resolved.
      const lenderEmailGated = filterLenderDraftEmails(lenderGated.kept, bundle.funding_sources);
      if (lenderEmailGated.dropped > 0) {
        result.candidates_filtered += lenderEmailGated.dropped;
        console.log(`[deal-admin-agent] DROPPED ${lenderEmailGated.dropped} draft_email lender-nudge proposal(s) for deal=${d.id} — lender is in terminal state (not_a_fit/passed/unresponsive/on-hold/declined)`);
      }
      if (lenderEmailGated.kept.length === 0) continue;

      // Suppress ALL create_followup_task proposals — we don't surface
      // "create a task" approval cards. Concrete next-steps flow through
      // other action types (update_deal_stage, update_funding_source,
      // draft_email, add_status_note, etc.). The one exception is the
      // deterministic "Update Tasks" prompt injected above for deals in
      // the active pipeline that have gone 12+ hours with no outstanding
      // tasks — that card asks the user to add tasks manually.
      const isUpdateTasksPrompt = (c: CandidateItem) => {
        const pv = (c.proposed_values ?? {}) as Record<string, any>;
        return c.action_type === "create_followup_task" && pv._synthetic === "update_tasks";
      };
      const isTaskCandidate = (c: CandidateItem) =>
        !isUpdateTasksPrompt(c) && (
          c.action_type === "create_followup_task" ||
          (typeof c.target_object_type === "string" &&
            c.target_object_type.toLowerCase() === "task")
        );
      const taskDroppedCount = lenderEmailGated.kept.filter(isTaskCandidate).length;
      const taskFiltered = lenderEmailGated.kept.filter((c) => !isTaskCandidate(c));
      if (taskDroppedCount > 0) {
        result.candidates_filtered += taskDroppedCount;
        console.log(`[deal-admin-agent] DROPPED ${taskDroppedCount} create_followup_task proposal(s) for deal=${d.id} — task-creation approval cards are disabled`);
      }
      if (taskFiltered.length === 0) continue;

      // ------------------------------------------------------------------
      // SCOPE WHITELIST — Deal Admin Agent is limited to 6 exact triggers:
      //   Lender email → Terms Issued update           (update_funding_source)
      //   Lender email → Pass update                   (update_funding_source)
      //   Lender email → schedule a call               (draft_email)
      //   Follow up on unanswered lender email (2 BD)  (draft_email)
      //   Outstanding items reminder to client (2 BD)  (draft_email)
      //   No client reply in 3 BD                      (draft_email)
      // Plus: when a Terms Issued email carries an attachment (term sheet /
      // IOI / LOI / proposal / indicative terms), also allow the paired
      // save_to_data_room proposal so the file lands in the deal's
      // Internal ▸ Data Room ▸ "Terms" folder (folder is fixed by
      // save-terms-attachment). The deal-level add_status_note and
      // update_deal_stage proposals from the bundle stay out of scope —
      // the lender status note is already captured on update_funding_source.
      // Anything else is out of scope and must not reach the approval queue.
      // ------------------------------------------------------------------
      const outOfScopeCount = taskFiltered.filter((c) => !isInDealAdminAgentScope(c)).length;
      const scopedFiltered = taskFiltered.filter(isInDealAdminAgentScope);
      if (outOfScopeCount > 0) {
        result.candidates_filtered += outOfScopeCount;
        console.log(`[deal-admin-agent] DROPPED ${outOfScopeCount} out-of-scope proposal(s) for deal=${d.id} — not one of the 6 approved triggers (lender Terms Issued/Pass, follow-ups, outstanding-items reminder, client no-reply)`);
      }
      if (scopedFiltered.length === 0) continue;

      const { kept, merged, filtered } = dedupeAndMerge(scopedFiltered, existingKeys);
      result.candidates_merged += merged;
      result.candidates_filtered += filtered;

      // Update-in-place pass for schedule_call cards. When a candidate's
      // semantic key matches a still-pending schedule_call row, refresh
      // that row's contact emails / description / evidence / rationale
      // instead of leaving stale details on a duplicate that dedupe would
      // drop. This runs regardless of whether other new candidates
      // survived, so a later "let's connect" email always keeps the
      // existing Approval Queue item current.
      if (pendingScheduleCallByKey.size > 0) {
        for (const c of scopedFiltered) {
          const key = queueSemanticKey({ ...c, deal_id: bundle.deal_id } as any);
          const existingRow = pendingScheduleCallByKey.get(key);
          if (!existingRow) continue;
          try {
            await applyScheduleCallUpdate(supabase, existingRow, c, bundle);
            result.candidates_merged += 1;
          } catch (err) {
            console.warn(
              `[deal-admin-agent] schedule_call in-place update failed for row=${existingRow.id}:`,
              (err as Error)?.message,
            );
          }
        }
      }

      if (kept.length === 0) continue;

      // Rank: confidence desc, then risk asc for ties (low risk first).
      const ranked = [...kept].sort((a, b) => {
        if (b.confidence_score !== a.confidence_score) return b.confidence_score - a.confidence_score;
        const ro = { low: 0, medium: 1, high: 2 } as const;
        return ro[a.risk_level ?? "medium"] - ro[b.risk_level ?? "medium"];
      });
      const remaining = maxQueueRows - totalInserted;
      const slice = ranked.slice(0, remaining);

      if (opts.dryRun) {
        const preview = buildCandidateRows(opts, bundle, slice);
        result.preview_rows = result.preview_rows ?? [];
        result.preview_rows.push(...preview);
        result.queue_rows_inserted += preview.length;
        totalInserted += preview.length;
        for (const c of slice) {
          existingKeys.add(queueSemanticKey({ ...c, deal_id: bundle.deal_id } as any));
        }
        continue;
      }

      const { ids, error } = await insertCandidates(supabase, opts, bundle, slice);
      if (error) {
        result.errors.push(`deal ${d.id}: ${error}`);
        console.log(`[deal-admin-agent] INSERT_ERR deal=${d.id} err=${error}`);
        continue;
      }
      console.log(`[deal-admin-agent] INSERTED deal=${d.id} count=${ids.length} valid=${valid.length} kept=${kept.length}`);
      // Track inserted keys so subsequent deals don't re-propose the same target.
      for (const c of slice) {
        existingKeys.add(queueSemanticKey({ ...c, deal_id: bundle.deal_id } as any));
      }
      result.queue_ids.push(...ids);
      result.queue_rows_inserted += ids.length;
      totalInserted += ids.length;
    } catch (e) {
      result.errors.push(`deal ${d.id}: ${(e as Error)?.message ?? "unknown"}`);
    }
  }

  return result;
}