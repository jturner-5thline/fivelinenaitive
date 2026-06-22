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
}

interface CandidateItem {
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
}

export interface AnalyzeResult {
  evaluated_deals: number;
  candidates_proposed: number;
  candidates_filtered: number;
  candidates_merged: number;
  queue_rows_inserted: number;
  queue_ids: string[];
  errors: string[];
}

/* ------------------------------------------------------------------ */
/*  Signal gathering                                                  */
/* ------------------------------------------------------------------ */

const LOOKBACK_DAYS = 30;

async function gatherSignalsForDeal(
  supabase: SupabaseClient,
  deal: any,
  companyId: string,
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
  }
  const enrichedThreads = threadRows.map((t) => ({
    ...t,
    messages: threadMessages[t.thread_id] ?? [],
  }));

  // Pre-compute "business days since last lender contact" for each funding
  // source so the prompt can apply the 3-BD follow-up rule deterministically.
  const today = new Date();
  const fundingWithBd = (fs.data ?? []).map((f: any) => {
    const lastTs = f.last_contact_at ?? f.last_status_change_at ?? f.updated_at ?? null;
    const bd = lastTs ? businessDaysBetween(new Date(lastTs), today) : null;
    return { ...f, business_days_since_last_contact: bd };
  });

  // Hydrate claap recordings with transcript / summary / action items from
  // claap_transcripts (deal-linked) and claap_recordings (org-linked).
  const claapRows: any[] = claap.data ?? [];
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
    ...claapRows.map((r) => ({
      source: "deal_claap_recordings",
      id: r.id,
      title: r.recording_title,
      url: r.recording_url,
      recorder: r.recorder_name ?? r.recorder_email,
      duration_seconds: r.duration_seconds,
      linked_at: r.linked_at,
      notes: r.notes,
    })),
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
    const { data: nameClaap } = await supabase
      .from("claap_recordings")
      .select("id, title, summary, action_items, key_takeaways, started_at, ended_at, organizer_email, participants, recording_url")
      .eq("org_company_id", companyId)
      .ilike("title", `%${dealNameRaw}%`)
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
      .ilike("title", `%${dealNameRaw}%`)
      .gte("start_time", since)
      .order("start_time", { ascending: false })
      .limit(8);
    var nameCalendarEvents = (nameCal ?? []).filter((e: any) => !e.is_cancelled);
  } else {
    var nameCalendarEvents: any[] = [];
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
  };
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

EMAIL SIGNAL → ACTION MAPPING (apply rigorously)
- ETA commitment from a counterparty ("I'll send financials by Friday") → add_status_note capturing the commitment AND a create_followup_task due the committed date, assigned to the deal manager.
- Status signal ("still working on materials", "almost done") → add_status_note only.
- Blocker / delay ("won't be ready until tomorrow", "pushing to next week") → add_status_note AND, if the blocker is on a specific lender, update_funding_source with the new ETA in notes.
- Implicit next step from the deal manager ("let me check and get back to you", "I'll circle back") → create_followup_task on the deal manager.

CLAAP RECORDING MAPPING
- For every Claap recording in the bundle that does NOT already have a matching status_note within 48h: emit one add_status_note synthesizing what happened, who was on it, decisions reached, and next step.
- Each distinct action_item from the recording becomes a separate create_followup_task assigned to the deal manager, with due_date set to the action item's deadline if present.

LENDER FOLLOW-UP RULES (use funding_sources[].business_days_since_last_contact)
- Rule L1: funding_sources[].business_days_since_last_contact >= 3 AND tracking_status is active/engaged (not "passed"/"closed") → draft_email to that lender (requires_send_ui=true) gently nudging for an update. Cite the funding_source id as target_object_id and as evidence (kind="funding_source").
- Rule L2: An outbound email to a lender contact reads as urgent (deadline language, escalation, "ASAP", calling out timing) AND no inbound reply has arrived → draft_email re-pinging that lender. Reference the email id in evidence (kind="email"). Tone: still semi-formal, do not blame.
- Rule L3: A lender explicitly stated they would respond by date X (parsed from an email, claap transcript, or status note) AND that date is today or in the past with no reply since → draft_email referencing their commitment, plus an optional internal create_followup_task for the deal manager.
- All lender draft_email items: proposed_values must include { to (array of email strings), subject, body }. Keep body under 120 words.
- Do not nudge the same lender more than once per scan — pick the strongest rule and emit one draft.`;

function buildUserPrompt(bundle: DealSignalBundle): string {
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
        received_at: m.received_at,
      })),
    })),
  };
  return `Deal signals (last ${LOOKBACK_DAYS} days):\n\n${JSON.stringify(compact, null, 2)}\n\nReturn JSON: { "items": [CandidateItem, ...] }. If nothing is strongly actionable, return { "items": [] }.`;
}

async function callModelForCandidates(
  bundle: DealSignalBundle,
): Promise<CandidateItem[]> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY missing — Deal Admin Agent cannot analyze");
  }

  const body = {
    model: MODEL,
    max_tokens: 6000,
    system: `${SYSTEM_PROMPT}\n\nRespond with ONLY a JSON object of the form {"items":[...]}. No prose, no markdown fences.`,
    messages: [
      { role: "user", content: buildUserPrompt(bundle) },
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
  const map: Record<string, string> = {
    add_status_note: "Add status note",
    update_funding_source: "Update funding source",
    create_followup_task: "Create follow-up task",
    create_milestone: "Create milestone",
    draft_email: "Draft email",
    update_deal_field: "Update deal field",
    update_contact_field: "Update contact",
    escalate: "Escalate",
  };
  const base = map[t] ?? t.replace(/_/g, " ");
  return label ? `${base} — ${label}` : base;
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
  return true;
}

function dedupeAndMerge(
  candidates: CandidateItem[],
  existingKeys: Set<string>,
): { kept: CandidateItem[]; merged: number; filtered: number } {
  const byTarget = new Map<string, CandidateItem>();
  let merged = 0;
  let filtered = 0;
  for (const c of candidates) {
    const k = `${c.action_type}::${c.target_object_type}::${c.target_object_id ?? ""}`;
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

/* ------------------------------------------------------------------ */
/*  Queue insert                                                       */
/* ------------------------------------------------------------------ */

function computePriority(c: CandidateItem, dealFlagged: boolean): "urgent" | "high" | "normal" | "low" {
  if (dealFlagged && c.risk_level === "high") return "urgent";
  if (c.action_type === "escalate") return "urgent";
  if (c.priority) return c.priority;
  if (c.confidence_score >= 0.85 && c.risk_level !== "low") return "high";
  if (c.risk_level === "low") return "low";
  return "normal";
}

async function insertCandidates(
  supabase: SupabaseClient,
  opts: AnalyzeOpts,
  bundle: DealSignalBundle,
  candidates: CandidateItem[],
): Promise<{ ids: string[]; error: string | null }> {
  if (candidates.length === 0) return { ids: [], error: null };

  // Pick reviewer: deal owner if activated, else attribution user.
  const owner = bundle.current.deal_owner_user_id;
  const ownerAllowed = owner && (!opts.activatedUserIds || opts.activatedUserIds.has(owner));
  const assignedTo = ownerAllowed ? (owner as string) : opts.attributionUserId;

  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const rows = candidates.map((c) => {
    const risk = c.risk_level ?? RISK_BY_TYPE[c.action_type];
    const priority = computePriority({ ...c, risk_level: risk }, bundle.current.is_flagged);
    return {
      user_id: opts.attributionUserId,
      assigned_to: assignedTo,
      deal_id: bundle.deal_id,
      deal_name: bundle.deal_name,
      action_type: c.action_type,
      title: c.item_title,
      description: c.rationale_summary,
      priority,
      risk_level: risk,
      target_object_type: c.target_object_type ?? TARGET_TYPE_BY_ACTION[c.action_type],
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
          target_object_type: c.target_object_type,
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

  const { data, error } = await supabase
    .from("ai_action_queue")
    .insert(rows)
    .select("id");
  if (error) return { ids: [], error: error.message };
  return { ids: (data ?? []).map((r: any) => r.id), error: null };
}

/* ------------------------------------------------------------------ */
/*  Main entry                                                         */
/* ------------------------------------------------------------------ */

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
  };

  // 1) Load target deals.
  let dealQ = supabase
    .from("deals")
    .select("id, company, stage, status, deal_owner_user_id, is_flagged, updated_at, company_id")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false })
    .limit(maxDeals);
  if (dealIds && dealIds.length > 0) dealQ = dealQ.in("id", dealIds);
  const { data: deals, error: dealErr } = await dealQ;
  if (dealErr) {
    result.errors.push(`deals query: ${dealErr.message}`);
    return result;
  }
  const dealList = (deals ?? []).filter((d: any) => {
    const name = (d.company ?? "").toLowerCase();
    const status = (d.status ?? "").toLowerCase();
    const stage = (d.stage ?? "").toLowerCase();
    if (status === "archived" || status === "archive" || stage === "archived") return false;
    if (!name) return true;
    if (name === "test-niki's store" || name === "example deal") return false;
    if (name.startsWith("test ")) return false;
    return true;
  });

  // 2) Existing dedupe keys — anything currently pending/approved in the queue
  //    for this company we shouldn't re-propose.
  const dealIdsArr = dealList.map((d: any) => d.id);
  const existingKeys = new Set<string>();
  if (dealIdsArr.length > 0) {
    const { data: existing } = await supabase
      .from("ai_action_queue")
      .select("action_type, target_object_type, target_object_id, deal_id, status")
      .in("deal_id", dealIdsArr)
      .in("status", ["pending", "approved"]);
    for (const e of existing ?? []) {
      existingKeys.add(
        `${(e as any).action_type}::${(e as any).target_object_type ?? ""}::${(e as any).target_object_id ?? ""}`,
      );
    }
  }

  // 3) Per-deal: gather signals, call model, validate, dedupe, insert.
  let totalInserted = 0;
  for (const d of dealList) {
    if (totalInserted >= maxQueueRows) break;
    result.evaluated_deals++;
    try {
      const bundle = await gatherSignalsForDeal(supabase, d, companyId);
      // Skip deals with effectively no signal — avoids burning credits.
      const sigCount =
        bundle.activity.length +
        bundle.emails.length +
        bundle.status_notes.length +
        bundle.stage_history.length +
        bundle.calendar_items.length +
        bundle.claap_recordings.length +
        bundle.email_threads.length;
      console.log(`[deal-admin-agent] deal=${d.id} ${d.company} signals act=${bundle.activity.length} em=${bundle.emails.length} thr=${bundle.email_threads.length} cal=${bundle.calendar_items.length} claap=${bundle.claap_recordings.length} notes=${bundle.status_notes.length} hist=${bundle.stage_history.length}`);
      if (sigCount === 0) continue;

      const raw = await callModelForCandidates(bundle);
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

      const { kept, merged, filtered } = dedupeAndMerge(valid, existingKeys);
      result.candidates_merged += merged;
      result.candidates_filtered += filtered;
      if (kept.length === 0) continue;

      // Rank: confidence desc, then risk asc for ties (low risk first).
      const ranked = [...kept].sort((a, b) => {
        if (b.confidence_score !== a.confidence_score) return b.confidence_score - a.confidence_score;
        const ro = { low: 0, medium: 1, high: 2 } as const;
        return ro[a.risk_level ?? "medium"] - ro[b.risk_level ?? "medium"];
      });
      const remaining = maxQueueRows - totalInserted;
      const slice = ranked.slice(0, remaining);

      const { ids, error } = await insertCandidates(supabase, opts, bundle, slice);
      if (error) {
        result.errors.push(`deal ${d.id}: ${error}`);
        console.log(`[deal-admin-agent] INSERT_ERR deal=${d.id} err=${error}`);
        continue;
      }
      console.log(`[deal-admin-agent] INSERTED deal=${d.id} count=${ids.length} valid=${valid.length} kept=${kept.length}`);
      // Track inserted keys so subsequent deals don't re-propose the same target.
      for (const c of slice) {
        existingKeys.add(
          `${c.action_type}::${c.target_object_type}::${c.target_object_id ?? ""}`,
        );
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