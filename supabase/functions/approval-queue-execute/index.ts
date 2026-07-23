// Approval Queue execution router.
// Validates the approver, executes the proposed mutation against the real
// record (or stages drafted emails), and writes an audit row.
//
// Decisions supported: approve | reject | reassign | more_context
// For action_type='draft_email', "approve" stages — it does NOT send.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Decision = 'approve' | 'reject' | 'reassign' | 'more_context';

interface ExecuteInput {
  action_id: string;
  decision: Decision;
  edited_values?: Record<string, unknown>;
  reassign_to_user_id?: string;
  rejection_reason?: string;
  more_context_notes?: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Fire in-app + email notifications for each newly created task whose
// assignee is not the approver themselves. Best-effort — never fails the
// execution if a downstream notification call errors.
async function notifyTaskAssignees(
  admin: any,
  tasks: Array<{ id: string; title: string; assigned_to: string | null; due_date: string | null; deal_id: string | null }>,
  actorUserId: string,
  dealId: string | null,
) {
  try {
    const targets = (tasks ?? []).filter(
      (t) => t && t.assigned_to && t.assigned_to !== actorUserId,
    );
    if (targets.length === 0) return;

    const assigneeIds = Array.from(new Set(targets.map((t) => t.assigned_to as string)));
    const [{ data: profiles }, { data: actorProfile }, { data: deal }] = await Promise.all([
      admin.from('profiles').select('user_id, display_name, email').in('user_id', assigneeIds),
      admin.from('profiles').select('display_name').eq('user_id', actorUserId).maybeSingle(),
      dealId
        ? admin.from('deals').select('company').eq('id', dealId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const profileMap = new Map<string, { email?: string; display_name?: string }>();
    for (const p of (profiles ?? []) as any[]) profileMap.set(p.user_id, p);
    const actorName = (actorProfile as any)?.display_name || 'A teammate';
    const dealName = (deal as any)?.company || null;

    await Promise.all(
      targets.map(async (t) => {
        const prof = profileMap.get(t.assigned_to as string);
        // In-app notification (SECURITY DEFINER RPC — safe under service role).
        try {
          await admin.rpc('create_task_inapp_notification', {
            _task_id: t.id,
            _recipient_user_id: t.assigned_to,
            _trigger_key: 'task_assigned',
            _title: 'New task assigned',
            _body: `${actorName} assigned you "${t.title}"${dealName ? ` on ${dealName}` : ''}`,
            _context: { task_id: t.id, task_title: t.title, deal_id: dealId },
          });
        } catch (e) {
          console.warn('[approval-queue-execute] in-app notify failed', e);
        }
        // Transactional email
        if (prof?.email) {
          try {
            const taskUrl = `https://fivelinenaitive.lovable.app/tasks?taskId=${t.id}&view=mine`;
            await admin.functions.invoke('send-transactional-email', {
              body: {
                templateName: 'task-assigned',
                recipientEmail: prof.email,
                idempotencyKey: `task-assigned-${t.id}-${prof.email}`,
                templateData: {
                  assigneeName: prof.display_name || undefined,
                  taskTitle: t.title,
                  dealName: dealName || undefined,
                  assignedByName: actorName,
                  dueDate: t.due_date || undefined,
                  taskUrl,
                },
              },
            });
          } catch (e) {
            console.warn('[approval-queue-execute] email notify failed', e);
          }
        }
      }),
    );
  } catch (e) {
    console.warn('[approval-queue-execute] notifyTaskAssignees error', e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ error: 'Unauthorized' }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: userData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !userData?.user) return json({ error: 'Unauthorized' }, 401);
  const userId = userData.user.id;

  let input: ExecuteInput;
  try {
    input = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  if (!input?.action_id || !input?.decision) {
    return json({ error: 'action_id and decision required' }, 400);
  }

  // Load the queue item.
  const { data: item, error: loadErr } = await admin
    .from('ai_action_queue')
    .select('*')
    .eq('id', input.action_id)
    .maybeSingle();
  if (loadErr || !item) return json({ error: 'Action not found' }, 404);

  // Authorization: assignee, original user, or anyone in same company can act.
  const assignedTo = item.assigned_to ?? item.user_id;
  if (assignedTo !== userId && item.user_id !== userId) {
    // Allow same-company members.
    const { data: myMembership } = await admin
      .from('company_members').select('company_id').eq('user_id', userId);
    const { data: theirMembership } = await admin
      .from('company_members').select('company_id').eq('user_id', assignedTo);
    const mine = new Set((myMembership ?? []).map((r: any) => r.company_id));
    const overlap = (theirMembership ?? []).some((r: any) => mine.has(r.company_id));
    if (!overlap) return json({ error: 'Forbidden' }, 403);
  }

  const now = new Date().toISOString();

  // -------------------- REJECT --------------------
  if (input.decision === 'reject') {
    await admin.from('ai_action_queue').update({
      status: 'dismissed',
      dismissed_at: now,
      rejection_reason: input.rejection_reason ?? null,
    }).eq('id', item.id);
    await admin.from('approval_queue_audit').insert({
      action_queue_id: item.id,
      target_object_type: item.target_object_type,
      target_object_id: item.target_object_id,
      action_type: item.action_type,
      old_values: item.old_values ?? {},
      new_values: item.new_values ?? {},
      approver_user_id: userId,
      decision: 'rejected',
      execution_status: 'noop',
      rejection_reason: input.rejection_reason ?? null,
    });
    return json({ ok: true, decision: 'rejected' });
  }

  // -------------------- REASSIGN --------------------
  if (input.decision === 'reassign') {
    if (!input.reassign_to_user_id) return json({ error: 'reassign_to_user_id required' }, 400);
    await admin.from('ai_action_queue').update({
      assigned_to: input.reassign_to_user_id,
      reassigned_from: assignedTo,
    }).eq('id', item.id);
    await admin.from('approval_queue_audit').insert({
      action_queue_id: item.id,
      target_object_type: item.target_object_type,
      target_object_id: item.target_object_id,
      action_type: item.action_type,
      old_values: { assigned_to: assignedTo },
      new_values: { assigned_to: input.reassign_to_user_id },
      approver_user_id: userId,
      decision: 'reassigned',
      execution_status: 'success',
    });
    return json({ ok: true, decision: 'reassigned' });
  }

  // -------------------- MORE CONTEXT --------------------
  if (input.decision === 'more_context') {
    await admin.from('ai_action_queue').update({
      more_context_requested_at: now,
      more_context_notes: input.more_context_notes ?? null,
    }).eq('id', item.id);
    await admin.from('approval_queue_audit').insert({
      action_queue_id: item.id,
      target_object_type: item.target_object_type,
      target_object_id: item.target_object_id,
      action_type: item.action_type,
      old_values: item.old_values ?? {},
      new_values: item.new_values ?? {},
      approver_user_id: userId,
      decision: 'more_context',
      execution_status: 'noop',
    });
    return json({ ok: true, decision: 'more_context' });
  }

  // -------------------- APPROVE --------------------
  // Merge edited values into the proposed new_values.
  const merged: Record<string, unknown> = {
    ...(item.new_values || {}),
    ...(input.edited_values || {}),
  };
  // Some legacy items carry their proposal in `payload`. Surface it as fallback.
  const payload = item.payload || {};
  const wasEdited = !!input.edited_values && Object.keys(input.edited_values).length > 0;

  // Helper to fail safely.
  // Resolve the on-approve execution type (caller-supplied via payload, else
  // a deterministic default per action_type). This is persisted on both the
  // queue row and the audit row so the platform's behavior is traceable.
  const ON_APPROVE_DEFAULTS: Record<string, string> = {
    update_deal_stage: 'update_stage',
    update_deal_status: 'update_record',
    add_status_note: 'append_note',
    update_funding_source: 'update_record',
    update_lender_status: 'update_record',
    create_milestone: 'create_or_update_milestone',
    update_milestone: 'create_or_update_milestone',
    create_followup_task: 'create_task',
    create_task: 'create_task',
    log_note: 'append_note',
    update_contact: 'update_record',
    update_company: 'update_record',
    deal_update: 'update_record',
    escalate: 'create_task',
    reassign_deal: 'reassign_record_owner',
    draft_email: 'stage_email_for_send',
    save_to_data_room: 'immediate_record_write',
    claap_recording_review: 'immediate_record_write',
    claap_action_items: 'immediate_record_write',
  };
  const onApproveType =
    (payload?.on_approve_execution_type as string | undefined) ||
    ON_APPROVE_DEFAULTS[item.action_type] ||
    'immediate_record_write';

  // Friendly per-action success messages surfaced back to the UI toast.
  function buildResultMessage(extra?: Record<string, unknown>): string {
    const dealName = item.deal_name || 'this deal';
    switch (item.action_type) {
      case 'update_deal_stage':
        return `Stage updated to "${(merged.stage ?? payload.stage) as string}" on ${dealName}`;
      case 'update_deal_status':
        return `Status updated to "${(merged.status ?? payload.status) as string}" on ${dealName}`;
      case 'add_status_note':
      case 'log_note':
        return `Status note added to ${dealName}`;
      case 'update_funding_source':
      case 'update_lender_status': {
        const s = (merged.substage ?? merged.new_status ?? payload.substage ?? payload.new_status) as string | undefined;
        return s ? `Funding source updated to ${s}` : `Funding source updated on ${dealName}`;
      }
      case 'create_milestone':
        return `Milestone created on ${dealName}`;
      case 'update_milestone':
        return `Milestone updated on ${dealName}`;
      case 'create_followup_task':
      case 'create_task':
        return `Follow-up task created on ${dealName}`;
      case 'escalate':
        return `Escalation task created on ${dealName}`;
      case 'update_contact':
        return `Contact updated`;
      case 'update_company':
        return `Company updated`;
      case 'deal_update':
        return `Deal updated on ${dealName}`;
      case 'reassign_deal':
        return `Owner reassigned on ${dealName}`;
      case 'draft_email':
        return `Draft staged for send`;
      default:
        return `Approved: ${item.title}`;
    }
    void extra;
  }

  async function recordFailure(reason: string) {
    await admin.from('ai_action_queue').update({
      status: 'failed',
      execution_error: reason,
      executed_at: now,
      executed_by: userId,
      on_approve_execution_type: onApproveType,
    }).eq('id', item.id);
    await admin.from('approval_queue_audit').insert({
      action_queue_id: item.id,
      target_object_type: item.target_object_type,
      target_object_id: item.target_object_id,
      action_type: item.action_type,
      old_values: item.old_values ?? {},
      new_values: merged,
      approver_user_id: userId,
      decision: 'approved',
      execution_status: 'failed',
      failure_reason: reason,
      was_edited: wasEdited,
    });
    return json({ ok: false, error: reason, result_message: `Could not apply "${item.title}": ${reason}` }, 200);
  }

  async function recordSuccess(
    decision: 'approved' | 'edited_approved' | 'email_staged' = 'approved',
    execution: 'success' | 'staged' = 'success',
    executionResult: Record<string, unknown> = {},
  ) {
    await admin.from('ai_action_queue').update({
      status: 'approved',
      approved_at: now,
      executed_at: now,
      executed_by: userId,
      on_approve_execution_type: onApproveType,
      execution_result: executionResult,
      execution_error: null,
      edited_before_approval: wasEdited,
      new_values: merged,
    }).eq('id', item.id);
    await admin.from('approval_queue_audit').insert({
      action_queue_id: item.id,
      target_object_type: item.target_object_type,
      target_object_id: item.target_object_id,
      action_type: item.action_type,
      old_values: {
        ...(item.old_values ?? {}),
        // Preserve the agent's ORIGINAL proposal so edit-before-approve
        // deltas remain reconstructable from audit history alone.
        _original_proposal: item.new_values ?? {},
      },
      new_values: merged,
      approver_user_id: userId,
      decision: wasEdited ? 'edited_approved' : decision,
      execution_status: execution,
      was_edited: wasEdited,
    });
    // Activity log entry for traceability.
    if (item.deal_id) {
      await admin.from('activity_logs').insert({
        deal_id: item.deal_id,
        activity_type: 'ai_action_approved',
        description: `Approved: ${item.title}`,
        user_id: userId,
      });
    }
    // Silent tone training — only when the approver edited an agent
    // proposal (deal_admin_agent origin) for text-bearing action types.
    try {
      const origin = (item.source as any)?.origin ?? null;
      // Expanded trackable set: also learn from structured-field corrections
      // (stage / status / funding-source moves, reassignments) so the engine
      // biases future proposals toward the approver's preferences, not just
      // their tone on free-text drafts.
      const trackable = [
        'draft_email',
        'add_status_note',
        'create_followup_task',
        'update_deal_stage',
        'update_deal_status',
        'update_funding_source',
        'reassign_deal',
      ];
      if (
        wasEdited &&
        origin === 'deal_admin_agent' &&
        trackable.includes(item.action_type)
      ) {
        const { data: membership } = await admin
          .from('company_members')
          .select('company_id')
          .eq('user_id', userId)
          .limit(1)
          .maybeSingle();
        // Build a short human-readable diff summary across known text fields.
        const fields = ['body', 'body_html', 'body_text', 'subject', 'note', 'title', 'description'];
        const diffs: string[] = [];
        for (const f of fields) {
          const a = (item.new_values as any)?.[f];
          const b = (merged as any)?.[f];
          if (typeof a === 'string' && typeof b === 'string' && a !== b) {
            const delta = b.length - a.length;
            diffs.push(`${f}: ${a.length}→${b.length} chars (Δ${delta >= 0 ? '+' : ''}${delta})`);
          }
        }
        await admin.from('admin_agent_tone_deltas').insert({
          user_id: userId,
          company_id: membership?.company_id ?? null,
          queue_item_id: item.id,
          action_type: item.action_type,
          original_draft: item.new_values ?? {},
          edited_draft: merged,
          diff_summary: diffs.join('; ') || null,
        });
      }
    } catch (e) {
      console.warn('[approval-queue-execute] tone-delta capture failed:', (e as Error)?.message);
    }
  }

  try {
    switch (item.action_type) {
      case 'update_deal_stage': {
        const stage = merged.stage ?? payload.stage;
        if (!item.deal_id || !stage) return recordFailure('Missing deal or stage');
        const { error } = await admin.from('deals').update({ stage }).eq('id', item.deal_id);
        if (error) return recordFailure(error.message);
        break;
      }
      case 'update_deal_status': {
        const status = merged.status ?? payload.status;
        if (!item.deal_id || !status) return recordFailure('Missing deal or status');
        const { error } = await admin.from('deals').update({ status }).eq('id', item.deal_id);
        if (error) return recordFailure(error.message);
        break;
      }
      case 'add_status_note': {
        const note = merged.note ?? payload.note ?? item.description;
        if (!item.deal_id || !note) return recordFailure('Missing deal or note');
        // Mirror the client-side behavior in DealDetail.tsx: the visible
        // "status notes" field on the deal is `deals.notes`; the
        // `deal_status_notes` table is a HISTORY of previous values. To
        // actually update what the user sees on the deal, archive the
        // current `deals.notes` into history first, then overwrite
        // `deals.notes` with the approved note.
        const { data: currentDeal } = await admin
          .from('deals')
          .select('notes')
          .eq('id', item.deal_id)
          .maybeSingle();
        const previous = (currentDeal?.notes ?? '').toString().trim();
        if (previous && previous !== '<p></p>' && previous !== note) {
          const { error: histErr } = await admin.from('deal_status_notes').insert({
            deal_id: item.deal_id,
            note: previous,
            user_id: userId,
          } as any);
          if (histErr) return recordFailure(histErr.message);
        }
        const { error: updErr } = await admin
          .from('deals')
          .update({ notes: note })
          .eq('id', item.deal_id);
        if (updErr) return recordFailure(updErr.message);
        // NOTE: we do NOT also insert the new note into `deal_status_notes`.
        // Manual saves in DealDetail.tsx only archive the SUPERSEDED value —
        // the current note lives in `deals.notes`. Mirroring that keeps the
        // Status History tab consistent between manual and approved edits.
        break;
      }
      case 'update_funding_source':
      case 'update_lender_status': {
        // The deal-lender id can arrive as deal_lender_id in proposed_values
        // OR as the queue item's target_object_id (when target_object_type
        // is 'deal_lender'). Accept either.
        const dlId = (
          merged.deal_lender_id ??
          payload.deal_lender_id ??
          (item.target_object_type === 'deal_lender' || item.target_object_type === 'funding_source' ? item.target_object_id : undefined)
        ) as string | undefined;
        // Accept stage OR substage OR new_status as the destination value —
        // the agent now proposes stage="unresponsive" / "passed" / "not_a_fit"
        // directly, not just substage.
        const stage = (merged.stage ?? payload.stage) as string | undefined;
        const substage = (merged.substage ?? merged.new_status ?? payload.substage ?? payload.new_status) as string | undefined;
        const tracking = (merged.tracking_status ?? payload.tracking_status) as string | undefined;
        const passReason = (merged.pass_reason ?? payload.pass_reason) as string | undefined;
        const notes = (merged.notes ?? payload.notes) as string | undefined;
        if (!dlId || (!stage && !substage && tracking === undefined)) {
          return recordFailure('Missing funding source id or status');
        }
        const upd: Record<string, unknown> = {};
        if (stage !== undefined) upd.stage = stage;
        if (substage !== undefined) upd.substage = substage;
        if (tracking !== undefined) upd.tracking_status = tracking;
        if (passReason !== undefined) upd.pass_reason = passReason;
        if (notes !== undefined) upd.notes = notes;
        upd.last_status_change_at = new Date().toISOString();
        const { error } = await admin.from('deal_lenders').update(upd as any).eq('id', dlId);
        if (error) return recordFailure(error.message);
        break;
      }
      case 'create_milestone':
      case 'update_milestone': {
        const m = { ...payload, ...merged } as any;
        if (!item.deal_id) return recordFailure('Missing deal');
        // Prefer the queue row's target_object_id for updates — the AI
        // stores the existing milestone id there, not inside new_values.
        const targetId =
          item.action_type === 'update_milestone' &&
          item.target_object_type === 'deal_milestone'
            ? (item.target_object_id || m.id)
            : m.id;
        if (item.action_type === 'update_milestone' && targetId) {
          const { id: _omit, ...rest } = m;
          // `status` on deal_milestones is constrained to on_track/at_risk/off_track.
          // AI payloads sometimes send status:'completed' — the `completed` flag
          // is the source of truth for that, so drop the invalid value.
          if (rest.status && !['on_track', 'at_risk', 'off_track'].includes(String(rest.status))) {
            delete rest.status;
          }
          const { error } = await admin
            .from('deal_milestones')
            .update(rest)
            .eq('id', targetId);
          if (error) return recordFailure(error.message);
        } else {
          const { error } = await admin.from('deal_milestones').insert({
            deal_id: item.deal_id,
            title: m.title || item.title,
            due_date: m.due_date ?? null,
            completed: m.completed ?? false,
          } as any);
          if (error) return recordFailure(error.message);
        }
        break;
      }
      case 'create_followup_task':
      case 'create_task': {
        const p = { ...payload, ...merged } as any;
        const { data: membership } = await admin
          .from('company_members').select('company_id').eq('user_id', userId).limit(1).maybeSingle();
        // The synthetic "Needs Tasks" prompt sends an array of tasks the
        // reviewer filled in (title / due_date / assigned_to per row).
        // For all other create_followup_task cards, fall back to the
        // legacy single-task insert.
        const UUID_RE =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        // Multi-task path ("[Deal] Needs Tasks" reviewer flow): every row
        // must include BOTH a non-empty title AND a valid assignee UUID.
        // No silent self-assign fallback — mirror the UI validation so a
        // client that bypasses the disabled button still fails here.
        let rows: any[];
        if (Array.isArray(p.tasks)) {
          const taskList = p.tasks as any[];
          if (taskList.length === 0) {
            return recordFailure('At least one task is required');
          }
          const invalid: string[] = [];
          rows = taskList.map((t: any, idx: number) => {
            const title = typeof t?.title === 'string' ? t.title.trim() : '';
            const assignee =
              typeof t?.assigned_to === 'string' ? t.assigned_to.trim() : '';
            if (!title) invalid.push(`Row ${idx + 1}: missing title`);
            if (!assignee || !UUID_RE.test(assignee)) {
              invalid.push(`Row ${idx + 1}: missing or invalid assignee`);
            }
            return {
              title,
              description: t?.description ?? null,
              due_date: t?.due_date || null,
              priority: t?.priority === 'urgent' ? 'urgent' : null,
              deal_id: item.deal_id,
              assigned_to: assignee || null,
              assigned_by: userId,
              company_id: membership?.company_id ?? null,
            };
          });
          if (invalid.length > 0) {
            return recordFailure(
              `Task validation failed — ${invalid.join('; ')}`,
            );
          }
        } else {
          // Legacy single-task path (create_followup_task from other cards):
          // still require a title; assignee falls back to the actor.
          const title =
            typeof p.title === 'string' && p.title.trim().length > 0
              ? p.title.trim()
              : typeof item.title === 'string'
              ? item.title.trim()
              : '';
          if (!title) {
            return recordFailure('A task title is required');
          }
          const assignee =
            typeof p.assigned_to === 'string' && UUID_RE.test(p.assigned_to)
              ? p.assigned_to
              : userId;
          rows = [{
            title,
            description: p.description ?? item.description ?? null,
            due_date: p.due_date ?? null,
            priority: p.priority === 'urgent' ? 'urgent' : null,
            deal_id: item.deal_id,
            assigned_to: assignee,
            assigned_by: userId,
            company_id: membership?.company_id ?? null,
          }];
        }
        const { data: insertedTasks, error } = await admin
          .from('tasks')
          .insert(rows as any)
          .select('id, title, assigned_to, due_date, deal_id');
        if (error) return recordFailure(error.message);
        await notifyTaskAssignees(admin, insertedTasks ?? [], userId, item.deal_id);
        break;
      }
      case 'log_note': {
        const p = { ...payload, ...merged } as any;
        const { error } = await admin.from('activity_logs').insert({
          deal_id: item.deal_id,
          activity_type: p.activity_type || 'note',
          description: p.description || item.description || item.title,
          user_id: userId,
        });
        if (error) return recordFailure(error.message);
        break;
      }
      case 'update_contact': {
        const p = { ...payload, ...merged } as any;
        if (!p.contact_id) return recordFailure('Missing contact_id');
        const { contact_id, ...fields } = p;
        const { error } = await admin.from('contacts').update(fields).eq('id', contact_id);
        if (error) return recordFailure(error.message);
        break;
      }
      case 'update_company': {
        const p = { ...payload, ...merged } as any;
        if (!p.company_id) return recordFailure('Missing company_id');
        const { company_id, ...fields } = p;
        const { error } = await admin.from('crm_companies').update(fields).eq('id', company_id);
        if (error) return recordFailure(error.message);
        break;
      }
      case 'deal_update': {
        const p = { ...payload, ...merged } as any;
        const fields = p.fields ?? p;
        if (!item.deal_id || !fields || typeof fields !== 'object') return recordFailure('Missing deal or fields');
        const { error } = await admin.from('deals').update(fields).eq('id', item.deal_id);
        if (error) return recordFailure(error.message);
        break;
      }
      case 'escalate': {
        const p = { ...payload, ...merged } as any;
        const { data: membership } = await admin
          .from('company_members').select('company_id').eq('user_id', userId).limit(1).maybeSingle();
        const { data: insertedTasks, error } = await admin.from('tasks').insert({
          title: p.title || `Escalation: ${item.title}`,
          description: p.description ?? item.rationale ?? item.description ?? null,
          due_date: p.due_date ?? null,
          priority: 'urgent',
          deal_id: item.deal_id,
          assigned_to: p.escalate_to ?? userId,
          assigned_by: userId,
          company_id: membership?.company_id ?? null,
        } as any).select('id, title, assigned_to, due_date, deal_id');
        if (error) return recordFailure(error.message);
        await notifyTaskAssignees(admin, insertedTasks ?? [], userId, item.deal_id);
        break;
      }
      case 'reassign_deal': {
        const p = { ...payload, ...merged } as any;
        if (!item.deal_id || !p.manager) return recordFailure('Missing deal or manager');
        const { error } = await admin.from('deals').update({ manager: p.manager }).eq('id', item.deal_id);
        if (error) return recordFailure(error.message);
        break;
      }
      case 'draft_email': {
        // STAGE — do NOT send. User must manually send from staged drafts UI.
        const p = { ...payload, ...merged } as any;
        const { data: staged, error } = await admin.from('staged_email_drafts').insert({
          source_action_id: item.id,
          user_id: userId,
          deal_id: item.deal_id,
          thread_id: p.thread_id ?? null,
          to_recipients: p.to ?? p.to_recipients ?? [],
          cc_recipients: p.cc ?? p.cc_recipients ?? [],
          bcc_recipients: p.bcc ?? p.bcc_recipients ?? [],
          subject: p.subject ?? null,
          body_html: p.body_html ?? p.body ?? null,
          body_text: p.body_text ?? null,
          attachments: p.attachments ?? [],
          status: 'staged',
        }).select('id').single();
        if (error) return recordFailure(error.message);
        await recordSuccess('email_staged', 'staged', { staged_email_id: (staged as any)?.id ?? null });
        return json({
          ok: true,
          decision: 'email_staged',
          result_message: buildResultMessage(),
          staged_email_id: (staged as any)?.id ?? null,
        });
      }
      // Legacy / passthrough — existing executors handle these on the client.
      case 'save_to_data_room':
      case 'claap_recording_review':
      case 'claap_action_items': {
        const { error } = await admin.from('activity_logs').insert({
          deal_id: item.deal_id,
          activity_type: 'ai_action_approved',
          description: `Approved (passthrough): ${item.title}`,
          user_id: userId,
        });
        if (error) return recordFailure(error.message);
        break;
      }
      default:
        return recordFailure(`Unknown action type: ${item.action_type}`);
    }

    await recordSuccess();
    return json({
      ok: true,
      decision: 'approved',
      result_message: buildResultMessage(),
      on_approve_execution_type: onApproveType,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return recordFailure(msg);
  }
});