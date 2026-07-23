import type { QueuedAiAction } from '@/hooks/useAiActionQueue';

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

function buildFundingSourceRationale(item: QueuedAiAction, target: string, cited: string): string {
  const nv = (item.new_values || {}) as Record<string, any>;
  const ov = (item.old_values || {}) as Record<string, any>;
  const lender = nv.lender_name || ov.lender_name || nv.funding_source_name || 'This funding source';
  const toStage = String(nv.substage ?? nv.new_status ?? nv.status ?? '').trim();
  const fromStage = String(ov.substage ?? ov.new_status ?? ov.status ?? '').trim();
  const lastContact = ov.last_contact_at ?? nv.last_contact_at ?? null;
  const days = daysSince(lastContact);
  const toLower = toStage.toLowerCase();

  const inactiveStage = /unresponsive|stale|no\s*response|cold|dormant|passed|pass/.test(toLower);

  if (inactiveStage && days !== null) {
    return `${lender} hasn't had any activity on ${target} in ${days} day${days === 1 ? '' : 's'}, so it makes sense to move them to "${toStage}".${cited}`;
  }
  if (inactiveStage) {
    return `${lender} has gone quiet on ${target} with no recent replies or diligence movement, so it makes sense to move them to "${toStage}".${cited}`;
  }
  if (toStage) {
    const fromPart = fromStage ? ` from "${fromStage}"` : '';
    const recency = days !== null ? ` (last contact ${days} day${days === 1 ? '' : 's'} ago)` : '';
    return `Recent activity with ${lender} on ${target}${recency} indicates their status has shifted${fromPart} to "${toStage}".${cited}`;
  }
  return `${lender} on ${target} has new activity that warrants a sub-stage update so the deal page reflects reality.${cited}`;
}

/** One-sentence summary of what changes if the reviewer approves. */
export function buildOutcomeSentence(item: QueuedAiAction): string {
  const target = item.deal_name || 'this record';
  const nv = (item.new_values || {}) as Record<string, any>;
  switch (item.action_type) {
    case 'update_deal_stage':
      return `Move ${target} to stage "${nv.stage ?? '—'}".`;
    case 'update_deal_status':
      return `Set ${target} status to "${nv.status ?? '—'}".`;
    case 'add_status_note':
      return `Add status note to ${target}.`;
    case 'update_funding_source': {
      const lender = nv.lender_name || nv.funding_source_name || 'funding source';
      const stage = nv.substage ?? nv.new_status ?? nv.status ?? '—';
      return `Update ${lender} on ${target} to "${stage}".`;
    }
    case 'create_milestone':
      return `Add milestone on ${target}.`;
    case 'update_milestone':
      return `Update milestone on ${target}.`;
    case 'create_followup_task':
    case 'create_task': {
      if ((nv as any)?._synthetic === 'update_tasks') {
        return `Add tasks for ${target}.`;
      }
      return `Create follow-up task on ${target}.`;
    }
    case 'update_contact':
      return `Update contact record.`;
    case 'update_company':
      return `Update company record.`;
    case 'draft_email':
      return `Stage drafted email reply for manual send.`;
    case 'escalate':
      return `Escalate ${target} with an urgent task.`;
    case 'reassign_deal':
      return `Reassign ${target} to a new manager.`;
    default:
      return item.title;
  }
}

/** Explicit "what the system will do when you click Approve" message. */
export function buildOnApproveSentence(item: QueuedAiAction): string {
  const target = item.deal_name || 'the deal';
  const nv = (item.new_values || {}) as Record<string, any>;
  const ov = (item.old_values || {}) as Record<string, any>;
  switch (item.action_type) {
    case 'update_deal_stage':
      return `${capitalize(target)} will move from "${ov.stage ?? '—'}" to "${nv.stage ?? '—'}".`;
    case 'update_deal_status':
      return `${capitalize(target)} status will update from "${ov.status ?? '—'}" to "${nv.status ?? '—'}".`;
    case 'add_status_note':
      return `A new status note will be appended to ${target}.`;
    case 'update_funding_source': {
      const lender = nv.lender_name || ov.lender_name || 'funding source';
      const from = ov.substage ?? ov.new_status ?? ov.status ?? ov.stage ?? null;
      const to = nv.substage ?? nv.new_status ?? nv.status ?? nv.stage ?? null;
      const notesChanged = typeof nv.notes === 'string' && nv.notes.trim().length > 0 && nv.notes !== ov.notes;
      if (!to && notesChanged) {
        return `Notes on ${lender} for ${target} will be updated. No stage or status change.`;
      }
      if (!to) {
        return `${capitalize(lender)} on ${target} will be updated.`;
      }
      return `${capitalize(lender)} on ${target} will update from "${from ?? '—'}" to "${to}".`;
    }
    case 'create_milestone':
      return `A new milestone will be created on ${target}.`;
    case 'update_milestone':
      return `The milestone on ${target} will be updated.`;
    case 'create_followup_task':
    case 'create_task':
      return `A follow-up task will be created on ${target}.`;
    case 'update_contact':
      return `The linked contact record will be updated.`;
    case 'update_company':
      return `The linked company record will be updated.`;
    case 'draft_email':
      return `This draft moves to the Staged Drafts panel for manual send — it will NOT auto-send.`;
    case 'escalate':
      return `An urgent escalation task will be created.`;
    case 'reassign_deal':
      return `${capitalize(target)} will be reassigned to a new manager.`;
    default:
      return `The proposed change above will be applied.`;
  }
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** CTA label for the primary approve button. */
export function approveButtonLabel(item: QueuedAiAction, edited = false): string {
  if (item.action_type === 'draft_email') return edited ? 'Edit & Stage' : 'Approve & Stage';
  // The synthetic "Needs Tasks" prompt is always in "create" mode — the
  // reviewer is filling in a form, so "Edit & Approve" is misleading.
  if (
    (item.action_type === 'create_followup_task' || item.action_type === 'create_task') &&
    (item.new_values as any)?._synthetic === 'update_tasks'
  ) {
    return 'Create tasks';
  }
  return edited ? 'Edit & Approve' : 'Approve';
}

/** Short label describing the target object (e.g. "Funding Source · Censys"). */
export function targetSummary(item: QueuedAiAction): string {
  const t = item.target_object_type;
  const deal = item.deal_name;
  // Header meta should just be the linked record name — no type prefix.
  // The item title already conveys what kind of change is being proposed,
  // so chips like "Deal ·" or "Funding Source ·" just add noise.
  if (deal) return deal;
  return 'Unlinked';
}

/** Fallback reasoning when an item has no `rationale` field set. */
export function buildRationaleFallback(item: QueuedAiAction): string {
  const target = item.deal_name || 'this record';
  const cited = '';
  switch (item.action_type) {
    case 'update_deal_stage':
      return `Recent activity on ${target} indicates the deal has progressed past its current stage.`;
    case 'update_deal_status':
      return `Signals on ${target} suggest the status no longer matches recent activity.`;
    case 'add_status_note':
      return `New context surfaced on ${target} that isn't yet captured in the status log.`;
    case 'update_funding_source':
    case 'update_lender_status':
      return buildFundingSourceRationale(item, target, cited);
    case 'create_milestone':
      return `A meaningful event on ${target} isn't tracked as a milestone yet.`;
    case 'update_milestone':
      return `An existing milestone on ${target} no longer matches the latest evidence.`;
    case 'create_followup_task':
    case 'create_task':
      return `Recent communication on ${target} implies an owner needs to follow up soon.`;
    case 'update_contact':
      return `Updated contact details were parsed from recent messages.`;
    case 'update_company':
      return `Updated company information was parsed from recent activity.`;
    case 'draft_email':
      return `A reply is expected on ${target} based on the latest thread.`;
    case 'escalate':
      return `Signals on ${target} suggest something needs attention beyond normal handling.`;
    case 'reassign_deal':
      return `Activity on ${target} suggests a different owner is better positioned to drive it.`;
    case 'save_to_data_room':
      return `A document related to ${target} arrived outside the data room.`;
    case 'log_note':
      return `Notable context appeared on ${target} that isn't captured anywhere yet.`;
    case 'claap_recording_review':
    case 'claap_action_items':
      return `A meeting recording produced items needing review before applying to ${target}.`;
    default:
      return `Surfaced from recent activity on ${target}.`;
  }
}

/** Truncate any rationale to a single sentence for compact display. */
export function toSingleSentence(text: string | null | undefined): string {
  if (!text) return '';
  const trimmed = String(text).trim().replace(/\s+/g, ' ');
  const match = trimmed.match(/^.*?[.!?](?=\s|$)/);
  return (match ? match[0] : trimmed).trim();
}

/** Field keys whose values should render as tag-style pills in the diff view. */
export const TAG_STYLE_FIELD_KEYS = new Set<string>([
  'stage', 'stage_id', 'stage_label', 'stage_name', 'pipeline_stage_id',
  'status', 'deal_status', 'substage', 'sub_stage',
  'funding_source_status', 'lender_status', 'milestone_status',
  'priority', 'call_type', 'type',
]);

const ACRONYMS = new Set([
  'drl','dm','ioi','loi','lp','gp','vc','pe','dd','kyc','kpi','mrr','arr',
  'sla','poc','rfp','rfi','nda','msa','sow','po','qbr','cfo','ceo','cto',
  'coo','cro','cmo','vp','svp','evp','us','usa','uk','eu','ai','api','sdk',
  'sql','erp','crm','hr','it','io','saas','paas','iaas','b2b','b2c','tam',
  'sam','som','yoy','mom','qoq','ytd','mtd','qtd','ebit','ebitda','ltv','cac',
]);

/** Convert raw stage/status values (e.g. "reviewing-drl") to human labels
 *  (e.g. "Reviewing DRL") for tag-style rendering. */
export function prettifyTagLabel(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'boolean') return raw ? 'Completed' : 'Not Completed';
  const s = String(raw).trim();
  if (!s) return '';
  const cleaned = s.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned
    .split(' ')
    .map((w) => {
      if (!w) return w;
      const lower = w.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      if (/[A-Z]/.test(w) && w !== w.toUpperCase()) return w;
      return lower[0].toUpperCase() + lower.slice(1);
    })
    .join(' ');
}
