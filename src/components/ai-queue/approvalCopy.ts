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
