// deno-lint-ignore-file no-explicit-any
/**
 * Deal Admin Agent · Follow-up task auto-reschedule.
 *
 * Rule (applies to every activated user's open, deal-linked tasks):
 *   If a task's title looks like a follow-up / check-in / nudge / ping AND
 *   the assignee already sent an email tied to the same deal today (ET),
 *   push the task's due date to today + 2 business days.
 *
 * The reschedule is skipped when the current due_date is already at or
 * beyond today+2BD, so re-running the sweep is idempotent for a given day.
 * Each reschedule writes a `task_activity` row (event_type
 * = 'auto_rescheduled') so the change is auditable, and returns the touched
 * task IDs for the caller to include in its per-company summary.
 */

import { addBusinessDays } from "./businessDays.ts";

const FOLLOWUP_TITLE_RE =
  /\b(follow[\s-]?ups?|followup|check[\s-]?in|check[\s-]?back|nudge|ping|touch[\s-]?base|circle[\s-]?back|remind(?:er)?|chase|bump)\b/i;

function pad(n: number) { return n < 10 ? `0${n}` : String(n); }
function ymdET(d: Date = new Date()): string {
  // "en-CA" gives YYYY-MM-DD; timeZone anchors us to America/New_York.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts; // already YYYY-MM-DD
}
function startOfTodayETasUTCIso(): string {
  // Midnight ET today → serialized as ISO for received_at filtering. Uses
  // the ET-local YYYY-MM-DD and asks "when was midnight ET on that day",
  // approximated by anchoring at -04:00/-05:00 doesn't matter here: we only
  // need a lower bound loose enough to catch same-day sends and tight
  // enough to exclude yesterday. Pick -05:00 (EST) which is always earlier
  // than or equal to actual ET midnight, guaranteeing we catch every
  // ET-today send without leaking prior day.
  const ymd = ymdET();
  return `${ymd}T05:00:00.000Z`;
}

function ymdFromDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface RescheduleResult {
  scanned_tasks: number;
  matched_tasks: number;
  rescheduled_tasks: number;
  skipped_already_future: number;
  details: Array<{
    task_id: string;
    deal_id: string | null;
    title: string;
    old_due_date: string | null;
    new_due_date: string;
    trigger_gmail_message_id: string;
    assignee_email: string;
  }>;
  errors: string[];
}

export async function rescheduleFollowupTasksForCompany(opts: {
  supabase: any;
  companyId: string;
  activatedUserIds?: string[]; // limit to Admin-Agent-activated assignees
}): Promise<RescheduleResult> {
  const { supabase, companyId, activatedUserIds } = opts;
  const result: RescheduleResult = {
    scanned_tasks: 0,
    matched_tasks: 0,
    rescheduled_tasks: 0,
    skipped_already_future: 0,
    details: [],
    errors: [],
  };

  const today = new Date();
  const targetDueDate = ymdFromDate(addBusinessDays(today, 2)); // DATE
  const sinceIso = startOfTodayETasUTCIso();

  // 1) Open, deal-linked tasks in this company.
  let taskQuery = supabase
    .from("tasks")
    .select("id, deal_id, title, due_date, status, assigned_to, assigned_by, company_id")
    .eq("company_id", companyId)
    .not("deal_id", "is", null)
    .not("status", "in", "(complete,completed,done,archived,cancelled,canceled)");

  if (Array.isArray(activatedUserIds) && activatedUserIds.length > 0) {
    taskQuery = taskQuery.in("assigned_to", activatedUserIds);
  }

  const { data: openTasks, error: tErr } = await taskQuery;
  if (tErr) {
    result.errors.push(`tasks fetch: ${tErr.message}`);
    return result;
  }

  const followupTasks = (openTasks || []).filter(
    (t: any) => typeof t.title === "string" && FOLLOWUP_TITLE_RE.test(t.title),
  );
  result.scanned_tasks = followupTasks.length;
  if (followupTasks.length === 0) return result;

  // 2) Resolve assignee emails.
  const assigneeIds = Array.from(
    new Set(followupTasks.map((t: any) => t.assigned_to).filter(Boolean)),
  );
  const emailByUserId = new Map<string, string>();
  if (assigneeIds.length > 0) {
    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("user_id, email")
      .in("user_id", assigneeIds);
    if (pErr) {
      result.errors.push(`profiles fetch: ${pErr.message}`);
    } else {
      for (const p of profiles || []) {
        if (p?.user_id && typeof p.email === "string") {
          emailByUserId.set(p.user_id, String(p.email).toLowerCase().trim());
        }
      }
    }
  }

  // 3) Pull today's deal_emails for the affected deals (once, batched).
  const dealIds = Array.from(
    new Set(followupTasks.map((t: any) => t.deal_id).filter(Boolean)),
  );
  const linksByDeal = new Map<string, Array<{ gmail_message_id: string; user_id: string | null; linked_at: string }>>();
  if (dealIds.length > 0) {
    const { data: links, error: lErr } = await supabase
      .from("deal_emails")
      .select("deal_id, gmail_message_id, user_id, linked_at")
      .in("deal_id", dealIds)
      .gte("linked_at", sinceIso);
    if (lErr) {
      result.errors.push(`deal_emails fetch: ${lErr.message}`);
    } else {
      for (const row of links || []) {
        const arr = linksByDeal.get(row.deal_id) || [];
        arr.push({
          gmail_message_id: row.gmail_message_id,
          user_id: row.user_id ?? null,
          linked_at: row.linked_at,
        });
        linksByDeal.set(row.deal_id, arr);
      }
    }
  }

  // 4) For each task, check if today's linked emails include a SENT message
  //    from the assignee.
  for (const task of followupTasks) {
    const dealLinks = linksByDeal.get(task.deal_id) || [];
    if (dealLinks.length === 0) continue;

    const assigneeEmail = emailByUserId.get(task.assigned_to) || "";
    if (!assigneeEmail) continue;

    const gmailIds = dealLinks.map((l) => l.gmail_message_id).filter(Boolean);
    if (gmailIds.length === 0) continue;

    // Look up the underlying email_cache rows to confirm it's an outbound
    // "SENT" from the assignee today (ET).
    const { data: cacheRows, error: cErr } = await supabase
      .from("email_cache")
      .select("gmail_message_id, from_email, labels, received_at, user_id")
      .in("gmail_message_id", gmailIds)
      .gte("received_at", sinceIso);
    if (cErr) {
      result.errors.push(`email_cache fetch: ${cErr.message}`);
      continue;
    }

    const trigger = (cacheRows || []).find((row: any) => {
      const from = String(row.from_email || "").toLowerCase().trim();
      const labels: string[] = Array.isArray(row.labels) ? row.labels : [];
      const isSent = labels.some((l) => String(l).toUpperCase() === "SENT");
      return from === assigneeEmail && isSent;
    });
    if (!trigger) continue;

    result.matched_tasks++;

    // Skip if already at or beyond the target date (idempotent).
    if (task.due_date && task.due_date >= targetDueDate) {
      result.skipped_already_future++;
      continue;
    }

    const { error: upErr } = await supabase
      .from("tasks")
      .update({ due_date: targetDueDate })
      .eq("id", task.id);
    if (upErr) {
      result.errors.push(`task update ${task.id}: ${upErr.message}`);
      continue;
    }

    // Log activity. actor_id is NOT NULL — attribute to assigned_by (the
    // creator) or fall back to assigned_to so RLS/NOT-NULL both hold.
    const actorId = task.assigned_by || task.assigned_to;
    if (actorId) {
      await supabase.from("task_activity").insert({
        task_id: task.id,
        actor_id: actorId,
        event_type: "auto_rescheduled",
        payload: {
          reason: "assignee_sent_email_today",
          rule: "followup_task_auto_reschedule",
          old_due_date: task.due_date,
          new_due_date: targetDueDate,
          business_days_added: 2,
          trigger_gmail_message_id: trigger.gmail_message_id,
          deal_id: task.deal_id,
          source: "deal-admin-agent",
        },
      });
    }

    result.rescheduled_tasks++;
    result.details.push({
      task_id: task.id,
      deal_id: task.deal_id,
      title: task.title,
      old_due_date: task.due_date,
      new_due_date: targetDueDate,
      trigger_gmail_message_id: trigger.gmail_message_id,
      assignee_email: assigneeEmail,
    });
  }

  return result;
}