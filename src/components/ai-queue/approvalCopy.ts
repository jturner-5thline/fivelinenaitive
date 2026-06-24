import type { QueuedAiAction } from '@/hooks/useAiActionQueue';

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
      return `Create milestone on ${target}.`;
    case 'update_milestone':
      return `Update milestone on ${target}.`;
    case 'create_followup_task':
    case 'create_task':
      return `Create follow-up task on ${target}.`;
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
      return `On approve: ${target} will move from "${ov.stage ?? '—'}" to "${nv.stage ?? '—'}".`;
    case 'update_deal_status':
      return `On approve: ${target} status will update from "${ov.status ?? '—'}" to "${nv.status ?? '—'}".`;
    case 'add_status_note':
      return `On approve: a new status note will be appended to ${target}.`;
    case 'update_funding_source': {
      const lender = nv.lender_name || ov.lender_name || 'funding source';
      const from = ov.substage ?? ov.new_status ?? ov.status ?? '—';
      const to = nv.substage ?? nv.new_status ?? nv.status ?? '—';
      return `On approve: ${lender} on ${target} will update from "${from}" to "${to}".`;
    }
    case 'create_milestone':
      return `On approve: a new milestone will be created on ${target}.`;
    case 'update_milestone':
      return `On approve: the milestone on ${target} will be updated.`;
    case 'create_followup_task':
    case 'create_task':
      return `On approve: a follow-up task will be created on ${target}.`;
    case 'update_contact':
      return `On approve: the linked contact record will be updated.`;
    case 'update_company':
      return `On approve: the linked company record will be updated.`;
    case 'draft_email':
      return `On approve: this draft moves to the Staged Drafts panel for manual send — it will NOT auto-send.`;
    case 'escalate':
      return `On approve: an urgent escalation task will be created.`;
    case 'reassign_deal':
      return `On approve: ${target} will be reassigned to a new manager.`;
    default:
      return `On approve: the proposed change above will be applied.`;
  }
}

/** CTA label for the primary approve button. */
export function approveButtonLabel(item: QueuedAiAction, edited = false): string {
  if (item.action_type === 'draft_email') return edited ? 'Edit & Stage' : 'Approve & Stage';
  return edited ? 'Edit & Approve' : 'Approve & Apply';
}

/** Short label describing the target object (e.g. "Funding Source · Censys"). */
export function targetSummary(item: QueuedAiAction): string {
  const t = item.target_object_type;
  const deal = item.deal_name;
  // For funding-source (deal_lender) cards, show the deal title as the
  // target chip — the lender name is already in the item title.
  if (t === 'deal_lender' && deal) return deal;
  const map: Record<string, string> = {
    deal: 'Deal',
    deal_stage: 'Stage',
    deal_status_note: 'Status Note',
    deal_lender: 'Funding Source',
    deal_milestone: 'Milestone',
    task: 'Task',
    contact: 'Contact',
    company: 'Company',
    email_draft: 'Email Draft',
  };
  const label = t ? map[t] || t : null;
  if (label && deal) return `${label} · ${deal}`;
  if (label) return label;
  return deal || 'Unlinked';
}

/** Fallback reasoning when an item has no `rationale` field set. */
export function buildRationaleFallback(item: QueuedAiAction): string {
  const target = item.deal_name || 'this record';
  const evidence = Array.isArray(item.evidence) ? item.evidence : [];
  const cited = evidence.length
    ? ` Cited from ${evidence.length} source${evidence.length === 1 ? '' : 's'}.`
    : '';
  switch (item.action_type) {
    case 'update_deal_stage':
      return `Recent activity on ${target} indicates the deal has progressed past its current stage. Naitive recommends advancing it so downstream automations (digests, milestones, lender prompts) reflect the new stage.${cited}`;
    case 'update_deal_status':
      return `Signals from notes, calls, or email on ${target} suggest the status no longer matches what the team is doing. Updating it keeps the pipeline accurate.${cited}`;
    case 'add_status_note':
      return `New context surfaced on ${target} that isn't yet captured in the status log. Logging it preserves the history for future reviewers.${cited}`;
    case 'update_funding_source':
    case 'update_lender_status':
      return `A funding source on ${target} has new activity (a reply, a pass, an indication, or new diligence). Naitive recommends moving the lender to the matching sub-stage so the deal page reflects reality.${cited}`;
    case 'create_milestone':
      return `Naitive detected a meaningful event on ${target} that isn't tracked as a milestone yet. Adding it keeps the timeline complete.${cited}`;
    case 'update_milestone':
      return `An existing milestone on ${target} no longer matches the latest evidence. Updating keeps the deal record consistent.${cited}`;
    case 'create_followup_task':
    case 'create_task':
      return `Recent communication on ${target} implies an owner needs to do something soon. Creating a follow-up task makes sure it doesn't get lost.${cited}`;
    case 'update_contact':
      return `Naitive parsed updated contact details (title, phone, email signature) from recent messages. Applying them keeps the CRM clean.${cited}`;
    case 'update_company':
      return `Naitive parsed updated company information from recent activity. Applying it keeps the company record accurate.${cited}`;
    case 'draft_email':
      return `A reply is expected on ${target} based on the latest thread. Naitive prepared a draft for your review — nothing is sent until you approve and send manually.${cited}`;
    case 'escalate':
      return `Signals on ${target} suggest something needs attention beyond normal handling. Naitive recommends an explicit escalation so it isn't missed.${cited}`;
    case 'reassign_deal':
      return `Activity patterns on ${target} suggest a different owner is better positioned to drive it forward.${cited}`;
    case 'save_to_data_room':
      return `A document related to ${target} arrived outside the data room. Saving it keeps deal artifacts in one place.${cited}`;
    case 'log_note':
      return `Notable context appeared on ${target} that isn't captured anywhere yet. Logging it preserves it for the next reviewer.${cited}`;
    case 'claap_recording_review':
    case 'claap_action_items':
      return `A meeting recording was processed and naitive extracted items that need a human review before being applied to ${target}.${cited}`;
    default:
      return `Naitive surfaced this based on recent activity on ${target}. Review the details above and approve if it matches what you'd do.${cited}`;
  }
}
