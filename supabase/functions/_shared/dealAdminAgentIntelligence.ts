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
  referral_sources: any[];
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
    referral_sources: await gatherReferralSourcesForDeal(supabase, deal, since, today),
  };
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

EMAIL SIGNAL → ACTION MAPPING (apply rigorously)
- ETA commitment from a counterparty ("I'll send financials by Friday") → add_status_note capturing the commitment AND a create_followup_task due the committed date, assigned to the deal manager.
- Status signal ("still working on materials", "almost done") → add_status_note only.
- Blocker / delay ("won't be ready until tomorrow", "pushing to next week") → add_status_note AND, if the blocker is on a specific lender, update_funding_source with the new ETA in notes.
- Implicit next step from the deal manager ("let me check and get back to you", "I'll circle back") → create_followup_task on the deal manager.

FUNDING SOURCE (LENDER) UPDATE GATE — apply strictly
- ONLY propose update_funding_source when the lender's situation clearly maps to ONE of:
    (a) PASS / DECLINE / not-a-fit on this deal → propose stage="passed" (or "not_a_fit").
    (b) TERM SHEET / IOI / indication / proposal / pricing terms issued or revised → propose the matching terms stage.
    (c) HOLD / PAUSE on the deal — ONLY when the lender EXPLICITLY says so. Trigger language: "revisit", "table this", "pause", "postpone", "circle back later", "park this", "put on hold", "shelve", "come back to this in <N> weeks". Propose stage="on-hold".
        Do NOT infer hold from silence, slow replies, missed deadlines, or your own assumption that the lender is "probably busy". Those are unresponsive, not on hold.
    (d) UNRESPONSIVE — lender has gone silent after we engaged them (multiple unanswered nudges, no reply past a committed date, or business_days_since_last_contact materially exceeds normal cadence) and there is NO explicit hold/pause language anywhere in the thread. Propose stage="unresponsive". This is the correct status whenever the only signal is absence of a response — never collapse this into "on-hold".
- RATIONALE WORDING for update_funding_source: rationale_summary must name the lender's actual situation. When the signal is "only 'followed up' with no reply", "multiple follow-ups without a response", "gone quiet", "no substage detail", or any other silence pattern, the rationale MUST say the correct move is "Unresponsive" — NEVER "on-hold", "on hold", or "may warrant on-hold". On-hold is only correct when you can quote the lender pausing the deal. Phrase it like: "{Lender} has had {N} follow-ups with no response on {Deal}, so the correct status is Unresponsive."
- A generic inbound inquiry, intro pleasantry, scheduling note, materials request, diligence question, or any other neutral lender email is NOT sufficient on its own — do NOT propose update_funding_source for those. Use add_status_note instead if anything is worth recording.
- Cite the specific email (kind="email") whose excerpt contains the pass/terms/hold language as evidence. For an UNRESPONSIVE proposal, cite the most recent outbound nudge plus the funding_source's business_days_since_last_contact as evidence (kind="funding_source") — never invent lender wording that isn't in the thread.
- NEVER emit a create_followup_task whose title/description is a generic "update funding sources" reminder (e.g. "Update Funding Sources for {Deal}"). Those are noise; real lender movements belong on update_funding_source with a citation.
- NEVER emit a create_followup_task whose title/description is a generic "update stage" reminder (e.g. "Update Stage for {Deal}"). Stage moves belong on update_deal_stage with a concrete proposed stage and evidence.
- NEVER emit a create_followup_task whose title/description is a generic "follow up" / "follow-up" reminder (e.g. "Follow up on {Deal}", "Follow-up task", "Create follow-up task"). Tasks must describe the concrete action — who does what by when. Vague "follow up" cards are noise.

CLAAP RECORDING MAPPING
- For every Claap recording in the bundle that does NOT already have a matching status_note within 48h: emit one add_status_note synthesizing what happened, who was on it, decisions reached, and next step.
- Each distinct action_item from the recording becomes a separate create_followup_task assigned to the deal manager, with due_date set to the action item's deadline if present.

LENDER FOLLOW-UP RULES (use funding_sources[].business_days_since_last_contact)
- Rule L1: funding_sources[].business_days_since_last_contact >= 3 AND tracking_status is active/engaged (not "passed"/"closed") → draft_email to that lender (requires_send_ui=true) gently nudging for an update. Cite the funding_source id as target_object_id and as evidence (kind="funding_source").
- Rule L2: An outbound email to a lender contact reads as urgent (deadline language, escalation, "ASAP", calling out timing) AND no inbound reply has arrived → draft_email re-pinging that lender. Reference the email id in evidence (kind="email"). Tone: still semi-formal, do not blame.
- Rule L3: A lender explicitly stated they would respond by date X (parsed from an email, claap transcript, or status note) AND that date is today or in the past with no reply since → draft_email referencing their commitment, plus an optional internal create_followup_task for the deal manager.
- All lender draft_email items: proposed_values must include { to (array of email strings), subject, body }. Keep body under 120 words.
- Do not nudge the same lender more than once per scan — pick the strongest rule and emit one draft.`;

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

const SYSTEM_PROMPT_FULL = SYSTEM_PROMPT + REFERRAL_RULES;

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
  };
  const fp = fingerprint && fingerprint.trim().length > 0
    ? `\nuser_style_fingerprint (recent edits this user made to the agent's drafts — mimic their voice):\n${fingerprint.trim()}\n`
    : "";
  return `Deal signals (last ${LOOKBACK_DAYS} days):\n\n${JSON.stringify(compact, null, 2)}\n${fp}\nReturn JSON: { "items": [CandidateItem, ...] }. If nothing is strongly actionable, return { "items": [] }.`;
}

async function callModelForCandidates(
  bundle: DealSignalBundle,
  fingerprint?: string | null,
): Promise<CandidateItem[]> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY missing — Deal Admin Agent cannot analyze");
  }

  const body = {
    model: MODEL,
    max_tokens: 6000,
    system: `${SYSTEM_PROMPT_FULL}\n\nRespond with ONLY a JSON object of the form {"items":[...]}. No prose, no markdown fences.`,
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
  return true;
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
    if (!proposingHold) return c;

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
    return {
      ...c,
      proposed_values: nextPv,
      rationale_summary: c.rationale_summary
        ? `${c.rationale_summary} (auto-normalized: hold→unresponsive)`
        : "Auto-normalized hold→unresponsive — no explicit pause language in evidence.",
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
    .select("id, action_type, target_object_type, target_object_id, deal_id, created_at, source")
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
    const resolved = await reconcileStalePendingApprovals(supabase, companyId);
    result.auto_resolved_pending = resolved;
    if (resolved > 0) {
      console.log(`[deal-admin-agent] auto-resolved ${resolved} pending approval items for company=${companyId}`);
    }
  } catch (e) {
    result.errors.push(`reconcile_pending: ${(e as Error)?.message ?? "unknown"}`);
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
    .select("id, company, stage, status, deal_owner_user_id, manager, deal_owner, is_flagged, updated_at, company_id, pipeline_id, referral_source_id")
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
        bundle.email_threads.length +
        bundle.referral_sources.length;
      console.log(`[deal-admin-agent] deal=${d.id} ${d.company} signals act=${bundle.activity.length} em=${bundle.emails.length} thr=${bundle.email_threads.length} cal=${bundle.calendar_items.length} claap=${bundle.claap_recordings.length} notes=${bundle.status_notes.length} hist=${bundle.stage_history.length}`);
      if (sigCount === 0) continue;

      const fingerprint = bundle.current.deal_owner_user_id
        ? fingerprintByUser.get(bundle.current.deal_owner_user_id) ?? null
        : null;
      const raw = await callModelForCandidates(bundle, fingerprint);
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

      // Deterministic guardrail: rewrite any update_funding_source proposal
      // moving a lender to on-hold/pause when the evidence doesn't actually
      // quote explicit pause language. Silence/no-response is "unresponsive",
      // never "on-hold". Runs before gating so the rewritten value flows
      // through every downstream check.
      const holdNormalized = normalizeHoldVsUnresponsive(stageValidated.kept);
      if (holdNormalized.rewritten > 0) {
        console.log(`[deal-admin-agent] REWROTE ${holdNormalized.rewritten} update_funding_source proposal(s) for deal=${d.id} — on-hold→unresponsive (no explicit pause language)`);
      }

      // Gate `update_funding_source` proposals: only allow them when the
      // lender communication carries an actionable pass / terms / hold
      // signal. Neutral inbound emails (intros, scheduling, diligence
      // questions) must not generate funding-source update cards.
      const lenderGated = filterFundingSourceProposals(holdNormalized.kept, bundle.funding_sources);
      if (lenderGated.dropped > 0) {
        result.candidates_filtered += lenderGated.dropped;
        console.log(`[deal-admin-agent] DROPPED ${lenderGated.dropped} update_funding_source proposal(s) for deal=${d.id} — no pass/terms/hold signal in evidence`);
      }
      if (lenderGated.kept.length === 0) continue;

      // Suppress ALL create_followup_task proposals — we don't surface
      // "create a task" approval cards. Concrete next-steps flow through
      // other action types (update_deal_stage, update_funding_source,
      // draft_email, add_status_note, etc.).
      const isTaskCandidate = (c: CandidateItem) =>
        c.action_type === "create_followup_task" ||
        (typeof c.target_object_type === "string" &&
          c.target_object_type.toLowerCase() === "task");
      const taskDroppedCount = lenderGated.kept.filter(isTaskCandidate).length;
      const taskFiltered = lenderGated.kept.filter((c) => !isTaskCandidate(c));
      if (taskDroppedCount > 0) {
        result.candidates_filtered += taskDroppedCount;
        console.log(`[deal-admin-agent] DROPPED ${taskDroppedCount} create_followup_task proposal(s) for deal=${d.id} — task-creation approval cards are disabled`);
      }
      if (taskFiltered.length === 0) continue;

      const { kept, merged, filtered } = dedupeAndMerge(taskFiltered, existingKeys);
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

      if (opts.dryRun) {
        const preview = buildCandidateRows(opts, bundle, slice);
        result.preview_rows = result.preview_rows ?? [];
        result.preview_rows.push(...preview);
        result.queue_rows_inserted += preview.length;
        totalInserted += preview.length;
        for (const c of slice) {
          existingKeys.add(
            `${c.action_type}::${c.target_object_type}::${c.target_object_id ?? ""}`,
          );
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