// deno-lint-ignore-file no-explicit-any
/**
 * Admin Agent — shared "capture + bridge to Approval Queue" pipeline.
 *
 * Single source of truth used by BOTH:
 *  - supabase/functions/copilot-chat   (chat-triggered Stage 2 path)
 *  - supabase/functions/admin-agent-sweep (proactive pg_cron path)
 *
 * Behavior (kept identical to the previous inline implementations):
 *  1) Inserts admin_agent_selected_actions rows (confirmation_status='confirmed',
 *     status='pending').
 *  2) Resolves the deal owner per deal so the resulting task is assigned to
 *     the actual owner instead of whoever clicks Approve. Falls back to the
 *     attribution user when no owner is set.
 *  3) Inserts ai_action_queue rows (action_type='create_task') with a stable
 *     payload + source envelope so the Approval Queue UI shows the ADMIN
 *     AGENT badge.
 *  4) Flips the selection rows to status='queued'.
 *  5) Optionally fans out an in-app `notification_instances` row per
 *     unique assignee so users see "X new Admin Agent items" alongside the
 *     queue badge.
 *
 * The caller owns idempotency (the cron sweep dedupes per ISO week before
 * calling this).
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type SelectionAction = "update" | "create" | "ignore" | "follow_up";
export type ScopeLevel = "portfolio" | "deal" | "field";

export interface SelectionInput {
  deal_id: string | null;
  deal_name?: string | null;
  field: string;
  lender_id?: string | null;
  action: SelectionAction;
  scope_level: ScopeLevel;
  note?: string | null;
}

export interface EnqueueOpts {
  supabase: SupabaseClient;
  companyId: string;
  /** Attribution user — who "owns" the selection row. For chat path this is
   *  the chatting user; for the cron path this is the workspace owner. */
  attributionUserId: string;
  auditRunId: string | null;
  selections: SelectionInput[];
  /** Free-form context for parse logs / source_message. */
  sourceMessage: string;
  rawUserResponse?: string | null;
  /** True when this came from the cron path. Stamps source.trigger. */
  fromCron: boolean;
  /** Optional flag passed straight through to source for debugging. */
  forced?: boolean;
  /** When true, also insert in-app notification_instances rows. */
  emitNotifications?: boolean;
  /**
   * Optional set of user_ids that have activated the Admin Agent. When
   * provided, deal-owner assignment is only honoured if the owner is in
   * the allowlist; otherwise we fall back to the (already-activated)
   * attribution user. Notification fanout is likewise restricted to
   * allowlisted recipients. This is the server-side enforcement of the
   * per-user activation gate.
   */
  activatedUserIds?: Set<string>;
}

export interface EnqueueResult {
  inserted_selections: number;
  inserted_queue_rows: number;
  notifications_sent: number;
  selection_ids: string[];
  queue_ids: string[];
  error: string | null;
}

const FIELD_LABEL: Record<string, string> = {
  status: "status",
  stage: "stage",
  milestones: "milestones",
  status_notes: "status notes",
  funding_sources: "funding sources",
};

const VERB: Record<string, string> = {
  update: "Update",
  create: "Create",
  follow_up: "Follow up on",
};

/**
 * Map (field, action) from the admin-agent audit to the executable
 * Approval Queue action_type. Fields without an obvious one-click executor
 * fall back to 'create_followup_task' (the legacy behavior).
 */
function resolveActionType(field: string, action: string): {
  type: string;
  target_object_type: string | null;
  risk: 'low' | 'medium' | 'high';
} {
  if (action === 'follow_up') {
    return { type: 'create_followup_task', target_object_type: 'task', risk: 'low' };
  }
  if (field === 'stage' && action === 'update') {
    return { type: 'update_deal_stage', target_object_type: 'deal', risk: 'high' };
  }
  if (field === 'status' && action === 'update') {
    return { type: 'update_deal_status', target_object_type: 'deal', risk: 'medium' };
  }
  if (field === 'status_notes') {
    return { type: 'add_status_note', target_object_type: 'deal', risk: 'low' };
  }
  if (field === 'funding_sources' && action === 'update') {
    return { type: 'update_funding_source', target_object_type: 'deal_lender', risk: 'medium' };
  }
  if (field === 'milestones') {
    return {
      type: action === 'create' ? 'create_milestone' : 'update_milestone',
      target_object_type: 'deal_milestone',
      risk: 'low',
    };
  }
  return { type: 'create_followup_task', target_object_type: 'task', risk: 'low' };
}

export async function enqueueAdminAgentSelections(opts: EnqueueOpts): Promise<EnqueueResult> {
  const {
    supabase,
    companyId,
    attributionUserId,
    auditRunId,
    selections,
    sourceMessage,
    rawUserResponse = null,
    fromCron,
    forced = false,
    emitNotifications = false,
    activatedUserIds,
  } = opts;

  const result: EnqueueResult = {
    inserted_selections: 0,
    inserted_queue_rows: 0,
    notifications_sent: 0,
    selection_ids: [],
    queue_ids: [],
    error: null,
  };

  if (!selections || selections.length === 0) return result;

  // 1) Resolve deal owners + names in one shot so we can stamp assignee +
  //    priority on the queue payload, and so we don't need to query deals
  //    again from the UI on approve.
  const dealIds = Array.from(
    new Set(
      selections
        .map((s) => s.deal_id)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  );
  const dealMeta: Record<string, { name: string; owner: string | null; isFlagged: boolean }> = {};
  if (dealIds.length > 0) {
    const { data: dealRows, error: dealErr } = await supabase
      .from("deals")
      .select("id, company, deal_owner_user_id, is_flagged")
      .in("id", dealIds);
    if (dealErr) {
      console.warn("[admin_agent/queue] deals lookup failed:", dealErr.message);
    }
    for (const d of dealRows ?? []) {
      if (!d?.id) continue;
      dealMeta[d.id] = {
        name: (d as any).company ?? "Untitled Deal",
        owner: (d as any).deal_owner_user_id ?? null,
        isFlagged: !!(d as any).is_flagged,
      };
    }
  }

  // 2) Persist admin_agent_selected_actions in the canonical shape.
  const selectionRows = selections.map((s) => ({
    audit_run_id: auditRunId,
    company_id: companyId,
    user_id: attributionUserId,
    deal_id: s.deal_id,
    field: s.field,
    lender_id: s.lender_id ?? null,
    action: s.action,
    scope_level: s.scope_level,
    note: s.note ?? null,
    source_message: sourceMessage.slice(0, 4000) || null,
    raw_user_response: rawUserResponse ? rawUserResponse.slice(0, 4000) : null,
    parsed_interpretation: {
      source: fromCron ? "cron" : "chat",
      deal_id: s.deal_id,
      field: s.field,
      lender_id: s.lender_id ?? null,
      action: s.action,
      scope_level: s.scope_level,
      note: s.note ?? null,
    },
    confirmation_status: "confirmed",
    status: "pending",
  }));

  const { data: insertedSelections, error: selErr } = await supabase
    .from("admin_agent_selected_actions")
    .insert(selectionRows)
    .select("id, deal_id, field, lender_id, action, scope_level");

  if (selErr) {
    result.error = `selections insert: ${selErr.message}`;
    return result;
  }
  result.inserted_selections = insertedSelections?.length ?? 0;
  result.selection_ids = (insertedSelections ?? []).map((r: any) => r.id);

  // 3) Bridge non-ignore selections into ai_action_queue.
  const enqueueable = (insertedSelections ?? []).filter(
    (r: any) => r && r.action !== "ignore",
  );
  if (enqueueable.length === 0) return result;

  // T+3 calendar days due date.
  const dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // Approval Queue TTL for admin-agent items. The table default is 48h,
  // which is too short for a weekly sweep (Friday-created items aged out
  // before users could triage them on Monday). Stamp an explicit 14-day
  // expiry so a full week of inbox time is always available.
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const queueRowsAll = enqueueable.map((sel: any) => {
    const meta = sel.deal_id ? dealMeta[sel.deal_id] : null;
    const dealName = meta?.name ?? "Untitled Deal";
    const fieldLabel = FIELD_LABEL[sel.field] ?? sel.field;
    const verb = VERB[sel.action] ?? "Review";
    const resolved = resolveActionType(sel.field, sel.action);
    // Execution-style imperative title.
    const title = sel.deal_id
      ? `${verb} ${fieldLabel} on ${dealName}`
      : `${verb} ${fieldLabel}`;
    const description = fromCron
      ? `Admin Agent (proactive sweep) flagged this on ${new Date().toLocaleDateString()}.`
      : `Admin Agent captured this from the deal audit on ${new Date().toLocaleDateString()}.`;

    // Deal-owner assignee resolution with a documented fallback chain.
    // When an activation allowlist is provided, only honour the deal-owner
    // assignment if that owner has activated the Admin Agent for themselves.
    // Otherwise, fall back to the attribution user (which the sweep already
    // guarantees is an activated user). This prevents the proactive sweep
    // from creating queue items / tasks for deactivated users.
    const ownerAllowed = meta?.owner
      ? (activatedUserIds ? activatedUserIds.has(meta.owner) : true)
      : false;
    const assignedTo = ownerAllowed ? (meta!.owner as string) : attributionUserId;
    // Priority is intentionally null unless the deal is flagged at-risk —
    // the tasks.priority CHECK only accepts NULL or 'urgent'.
    const priority: "urgent" | null = meta?.isFlagged ? "urgent" : null;

    return {
      // user_id on ai_action_queue is the row owner (approver inbox), kept
      // as the attribution user so RLS continues to surface it correctly.
      user_id: attributionUserId,
      assigned_to: assignedTo,
      priority: priority === 'urgent' ? 'urgent' : 'normal',
      risk_level: resolved.risk,
      target_object_type: resolved.target_object_type,
      target_object_id: resolved.type === 'update_funding_source'
        ? (sel.lender_id ?? null)
        : (sel.deal_id ?? null),
      old_values: {},
      new_values: resolved.type === 'create_followup_task'
        ? { title, description, due_date: dueDate, priority, assigned_to: assignedTo }
        : {},
      rationale: `Admin Agent detected this ${fieldLabel} needs ${sel.action} on ${dealName}.`,
      evidence: [],
      deal_id: sel.deal_id,
      deal_name: dealName,
      action_type: resolved.type,
      title,
      description,
      payload: {
        title,
        description,
        due_date: dueDate,
        priority,
        assigned_to: assignedTo,
        deal_lender_id: sel.lender_id ?? null,
        admin_agent_selection_id: sel.id,
        admin_agent_field: sel.field,
        admin_agent_action: sel.action,
        admin_agent_lender_id: sel.lender_id ?? null,
      },
      source: {
        origin: "admin_agent",
        trigger: fromCron ? "cron" : "chat",
        audit_run_id: auditRunId,
        selection_id: sel.id,
        field: sel.field,
        action: sel.action,
        forced,
        assignee_resolved_from: ownerAllowed
          ? "deal_owner"
          : meta?.owner
            ? "attribution_fallback_owner_not_activated"
            : "attribution_fallback",
      },
      expires_at: expiresAt,
    };
  });

  // Hard rule: NEVER create approval cards whose underlying action is
  // "create a task" (action_type create_task / create_followup_task, or
  // target_object_type === 'task'). Those become noise; concrete next
  // steps belong on stage / status / note actions.
  // Also: never surface generic "update funding sources on <Deal>" cards.
  // They're too vague to action from the queue — funding-source movements
  // should be captured directly on the deal / lender record instead.
  const queueRows = queueRowsAll.filter((r: any) => {
    // SCOPE WHITELIST — the Deal Admin Agent is limited to 6 exact
    // triggers, all of which flow through runDealAdminAgentAnalysis
    // (lender Terms Issued / Pass status updates + draft_email follow-ups
    // for lenders, outstanding items, and unanswered client threads).
    // The portfolio field-verification pipeline in this file produces
    // reminder cards (update_deal_stage / update_deal_status / add_status_note
    // / update_milestone / update_contact / update_company / create_task)
    // that are NOT in that list — drop them all here so this producer
    // stops writing out-of-scope rows to ai_action_queue.
    return false;
    // (Legacy filters preserved below for reference — unreachable.)
    // eslint-disable-next-line no-unreachable
    if (r.action_type === "create_task" || r.action_type === "create_followup_task") return false;
    if (r.action_type === "update_funding_source") return false;
    if (typeof r.target_object_type === "string" && r.target_object_type.toLowerCase() === "task") return false;
    // Never surface vague "update X on <Deal>" cards. If the enqueue payload
    // carries no concrete target values (e.g. a specific new stage / status
    // / milestone / field value), the item is unactionable noise. The Deal
    // Admin Agent proper always attaches new_values when it knows exactly
    // what should change; anything without them is a proactive-sweep
    // placeholder and should be dropped.
    const VAGUE_WHEN_EMPTY = new Set([
      "update_deal_stage",
      "update_deal_status",
      "update_milestone",
      "update_contact",
      "update_company",
    ]);
    if (VAGUE_WHEN_EMPTY.has(r.action_type)) {
      const nv = r.new_values;
      const hasConcrete = nv && typeof nv === "object" && Object.keys(nv).length > 0;
      if (!hasConcrete) return false;
    }
    // Deal STATUS enum guardrail. Status is a health badge with a strict
    // enum: on-track | at-risk | off-track (or cleared). Anything else
    // (e.g. "Active", "Live", "Pending", "Kickoff") is not a real status
    // value and must never surface in the queue.
    if (r.action_type === "update_deal_status") {
      const nv = (r.new_values ?? {}) as Record<string, unknown>;
      const candidate = (nv.status ?? nv.new_status ?? "") as unknown;
      const norm = String(candidate ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
      const ALLOWED = new Set(["on-track", "at-risk", "off-track"]);
      if (!norm || !ALLOWED.has(norm)) return false;
    }
    return true;
  });
  if (queueRows.length === 0) return result;

  const { data: insertedQueue, error: qErr } = await supabase
    .from("ai_action_queue")
    .insert(queueRows)
    .select("id, deal_id, payload");
  if (qErr) {
    result.error = `queue insert: ${qErr.message}`;
    return result;
  }
  result.inserted_queue_rows = insertedQueue?.length ?? 0;
  result.queue_ids = (insertedQueue ?? []).map((r: any) => r.id);

  // 4) Flip the source selections to 'queued'.
  const ids = enqueueable.map((r: any) => r.id);
  if (ids.length > 0) {
    const { error: updErr } = await supabase
      .from("admin_agent_selected_actions")
      .update({ status: "queued" })
      .in("id", ids);
    if (updErr) {
      console.warn("[admin_agent/queue] selection status->queued failed:", updErr.message);
    }
  }

  // 5) Optional in-app notification fanout. One row per unique recipient
  //    summarising "N Admin Agent items added to your Approval Queue".
  if (emitNotifications && (insertedQueue?.length ?? 0) > 0) {
    try {
      const perUser = new Map<string, number>();
      for (const row of insertedQueue ?? []) {
        const to = (row as any)?.payload?.assigned_to ?? attributionUserId;
        if (!to) continue;
        // Never notify a deactivated user, even if we somehow assigned to
        // them via the deal-owner path.
        if (activatedUserIds && !activatedUserIds.has(to)) continue;
        perUser.set(to, (perUser.get(to) ?? 0) + 1);
      }
      if (perUser.size > 0) {
        const notifRows = Array.from(perUser.entries()).map(([recipient, count]) => ({
          trigger_key: "admin_agent.queue_added",
          recipient_user_id: recipient,
          channel_type: "in_app",
          status: "sent" as const,
          title: `${count} Admin Agent item${count === 1 ? "" : "s"} need${count === 1 ? "s" : ""} approval`,
          body: fromCron
            ? "The proactive Friday sweep added new items to your Approval Queue."
            : "New items were added to your Approval Queue from the chat audit.",
          rendered_data: {
            count,
            trigger: fromCron ? "cron" : "chat",
            audit_run_id: auditRunId,
          },
          context: {
            source: "admin_agent",
            audit_run_id: auditRunId,
            company_id: companyId,
          },
          actor_user_id: attributionUserId,
          sent_at: new Date().toISOString(),
        }));
        const { error: notifErr, data: notifIns } = await supabase
          .from("notification_instances")
          .insert(notifRows)
          .select("id");
        if (notifErr) {
          console.warn("[admin_agent/queue] notification insert failed:", notifErr.message);
        } else {
          result.notifications_sent = notifIns?.length ?? 0;
        }
      }
    } catch (e) {
      console.warn("[admin_agent/queue] notification fanout threw:", (e as Error)?.message);
    }
  }

  return result;
}