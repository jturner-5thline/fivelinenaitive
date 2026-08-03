import { registerWorkflow, createWorkflowTask, getRegisteredWorkflows } from './workflowEngine';
import { supabase } from '@/integrations/supabase/client';

// Helper to move deal stage
async function moveDealStage(dealId: string, newStage: string) {
  await supabase.from('wf_deals').update({ stage: newStage as any }).eq('id', dealId);
}

// Helper to create a calendar event via the calendar-events edge function
async function createCalendarEventForDeal(deal: any, summary: string, durationMinutes = 30, offsetDays = 2) {
  try {
    const startTime = new Date(Date.now() + offsetDays * 86400000);
    startTime.setHours(10, 0, 0, 0);
    const endTime = new Date(startTime.getTime() + durationMinutes * 60000);
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const { data, error } = await supabase.functions.invoke('calendar-events', {
      body: {
        action: 'create',
        timezone: userTimezone,
        event_data: {
          summary,
          description: `Auto-created by workflow for deal: ${deal.name || deal.id}`,
          start: startTime.toISOString(),
          end: endTime.toISOString(),
        },
      },
    });
    if (error) console.error('[WF Calendar] Error:', error);
    else console.log('[WF Calendar] Created event:', data?.event?.id);
    return data?.event;
  } catch (err) {
    console.error('[WF Calendar] Failed:', err);
    return null;
  }
}

// Helper to send workflow email notification via edge function
async function sendWorkflowNotification(userId: string, dealId: string, dealName: string, message: string) {
  try {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    await fetch(`https://${projectId}.supabase.co/functions/v1/notification-engine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trigger: 'workflow_task_assigned',
        user_id: userId,
        deal_id: dealId,
        metadata: { deal_name: dealName, message },
      }),
    });
  } catch (err) {
    console.error('[WF Notification] Failed:', err);
  }
}

// Helper to fetch Claap recording for a deal
async function fetchClaapRecordingForDeal(dealId: string) {
  try {
    const { data } = await supabase
      .from('claap_meetings')
      .select('*')
      .eq('deal_id', dealId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  } catch (err) {
    console.error('[WF Claap] Failed to fetch recording:', err);
    return null;
  }
}

// ===== W1-W3: Calendar & Sales =====
registerWorkflow('sales_call_create_deal', {
  key: 'sales_call_create_deal',
  name: 'Sales Call → Deal Creation',
  description: 'When a sales call occurs, create a deal with AI-extracted info',
  trigger: 'calendar_event',
  default_owner_role: 'manager',
  handler: async (deal, ctx) => {
    // Fetch latest Claap recording for AI summary
    const recording = await fetchClaapRecordingForDeal(deal.id);
    if (recording?.ai_summary) {
      console.log('[W1] Found Claap recording with AI summary, enriching deal');
      // Update deal notes with meeting summary
      await supabase.from('activity_logs').insert({
        deal_id: deal.id,
        activity_type: 'meeting_summary',
        description: `Sales call AI summary: ${recording.ai_summary.substring(0, 500)}`,
        user_id: ctx.workflowOwnerId,
      });
    }

    // Create follow-up calendar event
    await createCalendarEventForDeal(deal, `Follow-up: ${deal.name || 'New Deal'}`, 30, 3);

    await createWorkflowTask({
      dealId: deal.id,
      title: 'Review sales call recording and confirm deal details',
      assigneeId: deal.manager_id,
      workflowOwnerId: ctx.workflowOwnerId,
      workflowKey: 'sales_call_create_deal',
      dueOffsetDays: 2,
      companyId: ctx.companyId,
    });
  },
});

registerWorkflow('sales_email_send_nda', {
  key: 'sales_email_send_nda',
  name: 'Sales Email → Send NDA',
  description: 'When sales email sent, trigger NDA sending workflow',
  trigger: 'email_event',
  default_owner_role: 'manager',
  handler: async (deal, ctx) => {
    // Create task for manager to send NDA (DocuSign integration placeholder)
    await createWorkflowTask({
      dealId: deal.id,
      title: 'Send NDA to prospect via DocuSign',
      assigneeId: deal.manager_id,
      workflowOwnerId: ctx.workflowOwnerId,
      workflowKey: 'sales_email_send_nda',
      dueOffsetDays: 1,
      companyId: ctx.companyId,
    });

    // Send notification to manager
    if (deal.manager_id) {
      await sendWorkflowNotification(deal.manager_id, deal.id, deal.name || 'Deal', 'NDA ready to send');
    }
  },
});

registerWorkflow('deal_active_followup_task', {
  key: 'deal_active_followup_task',
  name: 'New Deal → Follow-up Task (Request Materials)',
  description: 'Create recurring follow-up task when deal enters active pipeline to request materials',
  trigger: 'stage_change',
  triggerFilter: { to_stage: 'nda_needs_list_sent' },
  default_owner_role: 'manager',
  handler: async (deal, ctx) => {
    // Pre-condition: check required fields
    if (!deal.name) {
      console.warn('[WF] deal_active_followup_task: missing deal name, skipping');
      return;
    }

    const description = `Deal: ${deal.name || 'Unknown'} (${deal.company_name || ''})\nContact: ${deal.contact_email || 'N/A'}\nAction: Follow up to collect materials for naitive.`;

    await createWorkflowTask({
      dealId: deal.id,
      title: 'Follow up: NDA & Materials',
      description,
      assigneeId: deal.manager_id,
      workflowOwnerId: ctx.workflowOwnerId,
      workflowKey: 'deal_active_followup_task',
      isRecurring: true,
      recurrenceRuleJson: { interval: 3, unit: 'days', stopOn: 'materials_added' },
      recurrenceStopConditions: [
        { field: 'deal_stage_changed', operator: 'not_equals', value: 'nda_needs_list_sent' },
        { field: 'prop_issued', operator: 'is_true' },
      ],
      dueOffsetDays: 3,
      companyId: ctx.companyId,
    });

    // Update next_follow_up_at on the deal
    const dueAt = new Date(Date.now() + 3 * 86400000).toISOString();
    await supabase.from('deals').update({ next_follow_up_at: dueAt }).eq('id', deal.id);
  },
});

// ===== W4-W6: Early Stage Credit =====
registerWorkflow('materials_to_pre_credit_needs', {
  key: 'materials_to_pre_credit_needs',
  name: 'Materials Received → Pre Credit Needs',
  trigger: 'manual',
  default_owner_role: 'system',
  handler: async (deal, ctx) => {
    await moveDealStage(deal.id, 'pre_credit_needs');
  },
});

registerWorkflow('analyst_prepare_model_memo', {
  key: 'analyst_prepare_model_memo',
  name: 'Analyst Prepares Model & Memo',
  trigger: 'stage_change',
  triggerFilter: { to_stage: 'pre_credit_needs' },
  default_owner_role: 'analyst',
  handler: async (deal, ctx) => {
    await createWorkflowTask({
      dealId: deal.id, title: 'Upload, map, review materials; create memo & model',
      assigneeId: deal.analyst_id, workflowOwnerId: ctx.workflowOwnerId,
      workflowKey: 'analyst_prepare_model_memo', dueOffsetDays: 5, companyId: ctx.companyId,
    });
    if (deal.analyst_id) {
      await sendWorkflowNotification(deal.analyst_id, deal.id, deal.name || 'Deal', 'New task: Prepare model & memo');
    }
  },
});

registerWorkflow('analyst_approval_flow', {
  key: 'analyst_approval_flow',
  name: 'Analyst Approval / Disapproval',
  trigger: 'manual',
  default_owner_role: 'analyst',
  handler: async (deal, ctx) => {
    if (ctx.metadata?.approved) {
      await moveDealStage(deal.id, 'analyst_completes_review');
      await createWorkflowTask({
        dealId: deal.id, title: 'Review model and memo',
        assigneeId: deal.manager_id, workflowOwnerId: deal.manager_id,
        workflowKey: 'analyst_approval_flow', dueOffsetDays: 3, companyId: ctx.companyId,
      });
      if (deal.manager_id) {
        await sendWorkflowNotification(deal.manager_id, deal.id, deal.name || 'Deal', 'Analyst approved – review model & memo');
      }
    }
  },
});

// ===== W7-W9: Manager Approval =====
registerWorkflow('analyst_disapprove_manager_review', {
  key: 'analyst_disapprove_manager_review',
  name: 'Analyst Disapproves → Manager Review',
  trigger: 'manual',
  default_owner_role: 'manager',
  handler: async (deal, ctx) => {
    await createWorkflowTask({
      dealId: deal.id, title: 'Review disapproved deal; confirm disqualification',
      assigneeId: deal.manager_id, workflowOwnerId: ctx.workflowOwnerId,
      workflowKey: 'analyst_disapprove_manager_review', dueOffsetDays: 2, companyId: ctx.companyId,
    });
  },
});

registerWorkflow('manager_approve_route_preview', {
  key: 'manager_approve_route_preview',
  name: 'Manager Approves → Route to Preview',
  trigger: 'stage_change',
  triggerFilter: { to_stage: 'manager_approves_preview' },
  default_owner_role: 'manager',
  handler: async (deal, ctx) => {
    // Manager selects route via UI popup
    console.log('[W8] Manager approval routing');
  },
});

registerWorkflow('manager_disapprove_notifications', {
  key: 'manager_disapprove_notifications',
  name: 'Manager Disapproves → Notifications',
  trigger: 'manual',
  default_owner_role: 'manager',
  handler: async (deal, ctx) => {
    await createWorkflowTask({
      dealId: deal.id, title: 'Move deal to Closed Out / Not a Fit',
      assigneeId: deal.ops_id, workflowOwnerId: ctx.workflowOwnerId,
      workflowKey: 'manager_disapprove_notifications', dueOffsetDays: 1, companyId: ctx.companyId,
    });
    // Notify ops
    if (deal.ops_id) {
      await sendWorkflowNotification(deal.ops_id, deal.id, deal.name || 'Deal', 'Manager disapproved – close out deal');
    }
  },
});

// ===== W10-W12: Initial Lender Review & Feedback =====
registerWorkflow('initial_lender_review_entry', {
  key: 'initial_lender_review_entry',
  name: 'Initial Lender Review Entry',
  trigger: 'stage_change',
  triggerFilter: { to_stage: 'initial_lender_review' },
  default_owner_role: 'manager',
  handler: async (deal, ctx) => {
    await createWorkflowTask({
      dealId: deal.id, title: 'Compile lender list and add to deal',
      assigneeId: deal.manager_id, workflowOwnerId: ctx.workflowOwnerId,
      workflowKey: 'initial_lender_review_entry', dueOffsetDays: 3, companyId: ctx.companyId,
    });
  },
});

registerWorkflow('initial_feedback_entry', {
  key: 'initial_feedback_entry',
  name: 'Initial Feedback Entry',
  trigger: 'stage_change',
  triggerFilter: { to_stage: 'initial_feedback_call' },
  default_owner_role: 'manager',
  handler: async (deal, ctx) => {
    await createWorkflowTask({
      dealId: deal.id, title: 'Complete initial feedback call and prep agenda',
      assigneeId: deal.manager_id, workflowOwnerId: ctx.workflowOwnerId,
      workflowKey: 'initial_feedback_entry', dueOffsetDays: 3, companyId: ctx.companyId,
    });
    // Create calendar event for feedback call
    await createCalendarEventForDeal(deal, `Initial Feedback Call – ${deal.name || 'Deal'}`, 30, 2);
  },
});

registerWorkflow('initial_feedback_to_prop_dev', {
  key: 'initial_feedback_to_prop_dev',
  name: 'Feedback Completed → Prop in Dev',
  trigger: 'manual',
  default_owner_role: 'manager',
  handler: async (deal, ctx) => {
    await moveDealStage(deal.id, 'prop_in_dev');
  },
});

// ===== W13-W18: Proposal & Agreement =====
registerWorkflow('proposal_completed_sent_task', {
  key: 'proposal_completed_sent_task',
  name: 'Prop in Dev → Proposal Task',
  trigger: 'stage_change',
  triggerFilter: { to_stage: 'prop_in_dev' },
  default_owner_role: 'manager',
  handler: async (deal, ctx) => {
    await createWorkflowTask({
      dealId: deal.id, title: 'Proposal Completed and Sent',
      assigneeId: deal.manager_id, workflowOwnerId: ctx.workflowOwnerId,
      workflowKey: 'proposal_completed_sent_task', dueOffsetDays: 5, companyId: ctx.companyId,
    });
  },
});

registerWorkflow('proposal_sent_offer_move', {
  key: 'proposal_sent_offer_move',
  name: 'Proposal Sent → Offer Move',
  trigger: 'manual',
  default_owner_role: 'manager',
  handler: async (deal, ctx) => {
    console.log('[W14] Pop-up to move deal');
  },
});

registerWorkflow('prop_issued_followup', {
  key: 'prop_issued_followup',
  name: 'Prop Issued → Follow-up',
  description: 'Recurring follow-up after proposal is issued until manager decides to move forward',
  trigger: 'stage_change',
  triggerFilter: { to_stage: 'prop_issued' },
  default_owner_role: 'manager',
  handler: async (deal, ctx) => {
    // Pre-condition: check for existing open follow-up task
    const { data: existing } = await supabase
      .from('wf_tasks')
      .select('id')
      .eq('deal_id', deal.id)
      .eq('workflow_key', 'prop_issued_followup')
      .eq('status', 'open')
      .maybeSingle();
    if (existing) {
      console.log('[WF] prop_issued_followup: open task already exists, skipping');
      return;
    }

    // Pre-condition: verify a proposal/follow-up has been set for this deal
    const { data: proposalTask } = await supabase
      .from('wf_tasks')
      .select('id')
      .eq('deal_id', deal.id)
      .eq('workflow_key', 'proposal_completed_sent_task')
      .maybeSingle();
    if (!proposalTask) {
      console.warn('[WF] prop_issued_followup: no proposal task found for deal, skipping');
      return;
    }

    await createWorkflowTask({
      dealId: deal.id, title: 'Follow up on proposal',
      assigneeId: deal.manager_id, workflowOwnerId: ctx.workflowOwnerId,
      workflowKey: 'prop_issued_followup', isRecurring: true,
      recurrenceRuleJson: { interval: 4, unit: 'days' },
      recurrenceStopConditions: [
        { field: 'deal_stage_changed', operator: 'not_equals', value: 'prop_issued' },
        { field: 'manager_move_forward_decision', operator: 'equals', value: true },
      ],
      dueOffsetDays: 4, companyId: ctx.companyId,
    });

    // Update next_follow_up_at on the deal
    const dueAt = new Date(Date.now() + 4 * 86400000).toISOString();
    await supabase.from('deals').update({ next_follow_up_at: dueAt }).eq('id', deal.id);
  },
});

registerWorkflow('prop_forward_to_agreement', {
  key: 'prop_forward_to_agreement',
  name: 'Deal Moving Forward → Agreement',
  trigger: 'manual',
  default_owner_role: 'manager',
  handler: async (deal, ctx) => {
    await moveDealStage(deal.id, 'agreement_pending');
  },
});

registerWorkflow('agreement_pending_followup', {
  key: 'agreement_pending_followup',
  name: 'Agreement Pending → Follow-up',
  description: 'Recurring follow-up after agreement is sent until manager decides to move forward',
  trigger: 'stage_change',
  triggerFilter: { to_stage: 'agreement_pending' },
  default_owner_role: 'manager',
  handler: async (deal, ctx) => {
    // Pre-condition: verify an agreement has been sent (check VDR or activity logs)
    const { data: agreementDoc } = await supabase
      .from('activity_logs')
      .select('id')
      .eq('deal_id', deal.id)
      .in('activity_type', ['agreement_sent', 'document_uploaded', 'agreement_generated'])
      .limit(1)
      .maybeSingle();

    if (!agreementDoc) {
      // Also check for a proposal task completion as fallback indicator
      const { data: propTask } = await supabase
        .from('wf_tasks')
        .select('id')
        .eq('deal_id', deal.id)
        .eq('workflow_key', 'prop_forward_to_agreement')
        .maybeSingle();
      if (!propTask) {
        console.warn('[WF] agreement_pending_followup: no agreement document or prop-forward task found, skipping');
        return;
      }
    }

    await createWorkflowTask({
      dealId: deal.id, title: 'Follow up on agreement',
      assigneeId: deal.manager_id, workflowOwnerId: ctx.workflowOwnerId,
      workflowKey: 'agreement_pending_followup', isRecurring: true,
      recurrenceRuleJson: { interval: 4, unit: 'days' },
      recurrenceStopConditions: [
        { field: 'manager_move_forward_decision', operator: 'equals', value: true },
        { field: 'deal_stage_changed', operator: 'not_equals', value: 'agreement_pending' },
      ],
      dueOffsetDays: 4, companyId: ctx.companyId,
    });

    // Update next_follow_up_at on the deal
    const dueAt = new Date(Date.now() + 4 * 86400000).toISOString();
    await supabase.from('deals').update({ next_follow_up_at: dueAt }).eq('id', deal.id);
  },
});

registerWorkflow('agreement_to_final_credit', {
  key: 'agreement_to_final_credit',
  name: 'Agreement Signed → Final Credit',
  trigger: 'manual',
  default_owner_role: 'manager',
  handler: async (deal, ctx) => {
    await moveDealStage(deal.id, 'final_credit_items');
  },
});

// ===== W19-W24: Final Credit Items =====
registerWorkflow('final_credit_retainer', {
  key: 'final_credit_retainer', name: 'Initial Retainer Fee',
  trigger: 'stage_change', triggerFilter: { to_stage: 'final_credit_items' },
  default_owner_role: 'manager',
  handler: async (deal, ctx) => {
    await createWorkflowTask({
      dealId: deal.id, title: 'Initial Retainer Fee – link to invoice form',
      assigneeId: deal.manager_id, workflowOwnerId: ctx.workflowOwnerId,
      workflowKey: 'final_credit_retainer', dueOffsetDays: 3, companyId: ctx.companyId,
    });
  },
});

registerWorkflow('final_credit_intro_jen', {
  key: 'final_credit_intro_jen', name: 'Intro to Jen',
  trigger: 'stage_change', triggerFilter: { to_stage: 'final_credit_items' },
  default_owner_role: 'manager',
  handler: async (deal, ctx) => {
    await createWorkflowTask({
      dealId: deal.id, title: 'Intro to Jen for controller intro',
      assigneeId: deal.manager_id, workflowOwnerId: ctx.workflowOwnerId,
      workflowKey: 'final_credit_intro_jen', dueOffsetDays: 2, companyId: ctx.companyId,
    });
  },
});

registerWorkflow('final_credit_prep_kickoff_email', {
  key: 'final_credit_prep_kickoff_email', name: 'Prep Kick Off Email',
  trigger: 'stage_change', triggerFilter: { to_stage: 'final_credit_items' },
  default_owner_role: 'analyst',
  handler: async (deal, ctx) => {
    await createWorkflowTask({
      dealId: deal.id, title: 'Prep Kick Off Email',
      assigneeId: deal.analyst_id, workflowOwnerId: ctx.workflowOwnerId,
      workflowKey: 'final_credit_prep_kickoff_email', dueOffsetDays: 2, companyId: ctx.companyId,
    });
  },
});

registerWorkflow('final_credit_send_kickoff_email', {
  key: 'final_credit_send_kickoff_email', name: 'Review & Send Kick Off Email',
  trigger: 'stage_change', triggerFilter: { to_stage: 'final_credit_items' },
  default_owner_role: 'manager',
  handler: async (deal, ctx) => {
    await createWorkflowTask({
      dealId: deal.id, title: 'Review and Send Kick Off Email',
      assigneeId: deal.manager_id, workflowOwnerId: ctx.workflowOwnerId,
      workflowKey: 'final_credit_send_kickoff_email', dueOffsetDays: 3, companyId: ctx.companyId,
    });
  },
});

registerWorkflow('final_credit_materials_review', {
  key: 'final_credit_materials_review', name: 'Receive & Review Materials',
  trigger: 'stage_change', triggerFilter: { to_stage: 'final_credit_items' },
  default_owner_role: 'analyst',
  handler: async (deal, ctx) => {
    await createWorkflowTask({
      dealId: deal.id, title: 'Receive and review materials in Credit File, reassign to Manager',
      assigneeId: deal.analyst_id, workflowOwnerId: ctx.workflowOwnerId,
      workflowKey: 'final_credit_materials_review', dueOffsetDays: 5, companyId: ctx.companyId,
    });
  },
});

registerWorkflow('post_signing_materials_mapped', {
  key: 'post_signing_materials_mapped', name: 'Checklist Materials Mapped',
  trigger: 'manual', default_owner_role: 'analyst',
  handler: async (deal, ctx) => {
    await moveDealStage(deal.id, 'client_strategy_review');
  },
});

// ===== W25-W27: Client Strategy Review =====
registerWorkflow('client_strategy_set_call', {
  key: 'client_strategy_set_call', name: 'Set Kick-off Call',
  trigger: 'stage_change', triggerFilter: { to_stage: 'client_strategy_review' },
  default_owner_role: 'manager',
  handler: async (deal, ctx) => {
    await createWorkflowTask({
      dealId: deal.id, title: 'Set kick-off call with client',
      assigneeId: deal.manager_id, workflowOwnerId: ctx.workflowOwnerId,
      workflowKey: 'client_strategy_set_call', dueOffsetDays: 2, companyId: ctx.companyId,
    });
    // Auto-create calendar event for the kick-off call
    await createCalendarEventForDeal(deal, `Strategy Kick-off Call – ${deal.name || 'Deal'}`, 45, 3);
  },
});

registerWorkflow('client_strategy_agenda', {
  key: 'client_strategy_agenda', name: 'Strategy Review Agenda',
  trigger: 'stage_change', triggerFilter: { to_stage: 'client_strategy_review' },
  default_owner_role: 'analyst',
  handler: async (deal, ctx) => {
    await createWorkflowTask({
      dealId: deal.id, title: 'Prep kick-off call agenda; reassign to Manager',
      assigneeId: deal.analyst_id, workflowOwnerId: ctx.workflowOwnerId,
      workflowKey: 'client_strategy_agenda', dueOffsetDays: 2, companyId: ctx.companyId,
    });
    await createWorkflowTask({
      dealId: deal.id, title: 'Set internal kick-off call after client call',
      assigneeId: deal.manager_id, workflowOwnerId: ctx.workflowOwnerId,
      workflowKey: 'client_strategy_agenda', dueOffsetDays: 3, companyId: ctx.companyId,
    });
    // Auto-create internal debrief calendar event
    await createCalendarEventForDeal(deal, `Internal Strategy Debrief – ${deal.name || 'Deal'}`, 30, 4);
  },
});

registerWorkflow('client_strategy_outcome', {
  key: 'client_strategy_outcome', name: 'Strategy Review Outcome',
  trigger: 'calendar_event', default_owner_role: 'manager',
  handler: async (deal, ctx) => {
    // After strategy call: check for Claap recording and extract insights
    const recording = await fetchClaapRecordingForDeal(deal.id);
    if (recording) {
      console.log('[W27] Found Claap recording for strategy call');
      if (recording.ai_summary) {
        await supabase.from('activity_logs').insert({
          deal_id: deal.id,
          activity_type: 'meeting_summary',
          description: `Strategy call summary: ${recording.ai_summary.substring(0, 500)}`,
          user_id: ctx.workflowOwnerId,
        });
      }
      if (recording.next_steps && recording.next_steps.length > 0) {
        for (const step of recording.next_steps) {
          await createWorkflowTask({
            dealId: deal.id, title: step,
            assigneeId: deal.manager_id, workflowOwnerId: ctx.workflowOwnerId,
            workflowKey: 'client_strategy_outcome', dueOffsetDays: 5, companyId: ctx.companyId,
          });
        }
      }
    }
  },
});

// ===== W28-W30: Write Up Pending =====
registerWorkflow('write_up_materials_review', {
  key: 'write_up_materials_review', name: 'Write Up Materials Review',
  trigger: 'stage_change', triggerFilter: { to_stage: 'write_up_pending' },
  default_owner_role: 'analyst',
  handler: async (deal, ctx) => {
    await createWorkflowTask({
      dealId: deal.id, title: 'Review DealSpace with all materials',
      assigneeId: deal.analyst_id, workflowOwnerId: ctx.workflowOwnerId,
      workflowKey: 'write_up_materials_review', dueOffsetDays: 3, companyId: ctx.companyId,
    });
  },
});

registerWorkflow('write_up_create_and_approve', {
  key: 'write_up_create_and_approve', name: 'Write Up Draft & Approval',
  trigger: 'stage_change', triggerFilter: { to_stage: 'write_up_pending' },
  default_owner_role: 'analyst',
  handler: async (deal, ctx) => {
    const tasks = [
      { title: 'Create Teaser or Write Up Draft, reassign to Manager', assignee: deal.analyst_id },
      { title: 'Approve write up', assignee: deal.manager_id },
      { title: 'Prep Data Room, reassign to Manager for approval', assignee: deal.analyst_id },
      { title: 'Add lenders to Naitive', assignee: deal.manager_id },
      { title: 'Draft email to lenders, reassign to Manager', assignee: deal.analyst_id },
      { title: 'Confirm email to lenders sent; move to next stage', assignee: deal.manager_id },
    ];
    for (const t of tasks) {
      await createWorkflowTask({
        dealId: deal.id, title: t.title, assigneeId: t.assignee,
        workflowOwnerId: ctx.workflowOwnerId, workflowKey: 'write_up_create_and_approve',
        dueOffsetDays: 5, companyId: ctx.companyId,
      });
    }
  },
});

registerWorkflow('write_up_to_submitted_lenders', {
  key: 'write_up_to_submitted_lenders', name: 'Push to FLEx → Submitted',
  trigger: 'manual', default_owner_role: 'analyst',
  handler: async (deal, ctx) => {
    await moveDealStage(deal.id, 'submitted_to_lenders');
  },
});

// ===== W31-W33: Submitted & Lenders in Review =====
registerWorkflow('submitted_to_lenders_emails', {
  key: 'submitted_to_lenders_emails', name: 'Submitted → Send Emails',
  trigger: 'stage_change', triggerFilter: { to_stage: 'submitted_to_lenders' },
  default_owner_role: 'manager',
  handler: async (deal, ctx) => {
    await createWorkflowTask({
      dealId: deal.id, title: 'Monitor lender replies',
      assigneeId: deal.manager_id, workflowOwnerId: ctx.workflowOwnerId,
      workflowKey: 'submitted_to_lenders_emails', dueOffsetDays: 3, companyId: ctx.companyId,
    });
    // Notify manager that deal is submitted
    if (deal.manager_id) {
      await sendWorkflowNotification(deal.manager_id, deal.id, deal.name || 'Deal', 'Deal submitted to lenders – monitoring replies');
    }
  },
});

registerWorkflow('positive_lender_response', {
  key: 'positive_lender_response', name: 'Positive Response → Lenders in Review',
  trigger: 'email_event', default_owner_role: 'manager',
  handler: async (deal, ctx) => {
    await moveDealStage(deal.id, 'lenders_in_review');
    await createWorkflowTask({
      dealId: deal.id, title: 'Follow up: Funding Source Status',
      assigneeId: deal.manager_id, workflowOwnerId: ctx.workflowOwnerId,
      workflowKey: 'positive_lender_response', isRecurring: true,
      recurrenceRuleJson: { interval: 7, unit: 'days' },
      recurrenceStopConditions: [
        { field: 'deal_stage_changed', operator: 'not_equals', value: 'submitted_to_lenders' },
        { field: 'manager_move_forward_decision', operator: 'equals', value: true },
      ],
      dueOffsetDays: 7, companyId: ctx.companyId,
    });
    // Create recurring calendar event for weekly lender check
    await createCalendarEventForDeal(deal, `Weekly Lender Review – ${deal.name || 'Deal'}`, 30, 7);
    if (deal.manager_id) {
      await sendWorkflowNotification(deal.manager_id, deal.id, deal.name || 'Deal', 'Positive lender response received!');
    }
  },
});

registerWorkflow('lenders_review_weekly_check', {
  key: 'lenders_review_weekly_check', name: 'Lenders in Review Weekly Check',
  trigger: 'stage_change', triggerFilter: { to_stage: 'lenders_in_review' },
  default_owner_role: 'manager',
  handler: async (deal, ctx) => {
    const tasks = [
      { title: 'Weekly check on platform for lender updates', assignee: deal.manager_id },
      { title: 'Track responses, set management calls', assignee: deal.analyst_id },
      { title: 'Prepare answers to lender questions', assignee: deal.analyst_id },
      { title: 'Confirm terms are real, save to file', assignee: deal.analyst_id },
    ];
    for (const t of tasks) {
      await createWorkflowTask({
        dealId: deal.id, title: t.title, assigneeId: t.assignee,
        workflowOwnerId: ctx.workflowOwnerId, workflowKey: 'lenders_review_weekly_check',
        dueOffsetDays: 5, companyId: ctx.companyId,
      });
    }
    // Set up weekly review calendar event
    await createCalendarEventForDeal(deal, `Weekly Lender Review – ${deal.name || 'Deal'}`, 30, 5);
  },
});

// ===== W34-W36: Terms Issued =====
registerWorkflow('terms_issued_analysis', {
  key: 'terms_issued_analysis', name: 'Terms Issued – Analysis',
  trigger: 'stage_change', triggerFilter: { to_stage: 'terms_issued_analysis' },
  default_owner_role: 'analyst',
  handler: async (deal, ctx) => {
    await createWorkflowTask({
      dealId: deal.id, title: 'Review Terms and prep Terms Analysis',
      assigneeId: deal.analyst_id, workflowOwnerId: ctx.workflowOwnerId,
      workflowKey: 'terms_issued_analysis', dueOffsetDays: 5, companyId: ctx.companyId,
    });
    await createWorkflowTask({
      dealId: deal.id, title: 'Call to review terms with client',
      assigneeId: deal.manager_id, workflowOwnerId: ctx.workflowOwnerId,
      workflowKey: 'terms_issued_analysis', dueOffsetDays: 5, companyId: ctx.companyId,
    });
    // Create terms review call event
    await createCalendarEventForDeal(deal, `Terms Review Call – ${deal.name || 'Deal'}`, 45, 3);
  },
});

registerWorkflow('terms_issued_payment', {
  key: 'terms_issued_payment', name: 'Terms Issued – Payment',
  trigger: 'stage_change', triggerFilter: { to_stage: 'terms_issued_payment' },
  default_owner_role: 'manager',
  handler: async (deal, ctx) => {
    await createWorkflowTask({
      dealId: deal.id, title: 'Send milestone invoice',
      assigneeId: deal.manager_id, workflowOwnerId: ctx.workflowOwnerId,
      workflowKey: 'terms_issued_payment', dueOffsetDays: 3, companyId: ctx.companyId,
    });
    await createWorkflowTask({
      dealId: deal.id, title: 'Re-Intro to Jen for controller intro',
      assigneeId: deal.manager_id, workflowOwnerId: ctx.workflowOwnerId,
      workflowKey: 'terms_issued_payment', dueOffsetDays: 3, companyId: ctx.companyId,
    });
  },
});

registerWorkflow('terms_signed_to_due_diligence', {
  key: 'terms_signed_to_due_diligence', name: 'Terms Signed → Due Diligence',
  trigger: 'manual', default_owner_role: 'manager',
  handler: async (deal, ctx) => {
    await moveDealStage(deal.id, 'due_diligence_client');
  },
});

// ===== W37-W38: Due Diligence =====
registerWorkflow('due_diligence_client_flow', {
  key: 'due_diligence_client_flow', name: 'Due Diligence – Client',
  trigger: 'stage_change', triggerFilter: { to_stage: 'due_diligence_client' },
  default_owner_role: 'manager',
  handler: async (deal, ctx) => {
    const tasks = [
      { title: 'Set educational call with client', assignee: deal.manager_id },
      { title: 'Set follow-up emails to lender and client', assignee: deal.manager_id },
      { title: 'Inform Ops and team once ready', assignee: deal.manager_id },
      { title: 'Check if marketing case; ask for feedback', assignee: deal.manager_id },
    ];
    for (const t of tasks) {
      await createWorkflowTask({
        dealId: deal.id, title: t.title, assigneeId: t.assignee,
        workflowOwnerId: ctx.workflowOwnerId, workflowKey: 'due_diligence_client_flow',
        dueOffsetDays: 5, companyId: ctx.companyId,
      });
    }
    // Create educational call event
    await createCalendarEventForDeal(deal, `Due Diligence Educational Call – ${deal.name || 'Deal'}`, 60, 3);
    if (deal.manager_id) {
      await sendWorkflowNotification(deal.manager_id, deal.id, deal.name || 'Deal', 'Due diligence phase started');
    }
  },
});

registerWorkflow('due_diligence_to_funded', {
  key: 'due_diligence_to_funded', name: 'Due Diligence → Funded',
  trigger: 'manual', default_owner_role: 'manager',
  handler: async (deal, ctx) => {
    await moveDealStage(deal.id, 'funded_naitive');
  },
});

// ===== W39-W42: Funded / Invoiced =====
registerWorkflow('funded_naitive_main', {
  key: 'funded_naitive_main', name: 'Funded – Naitive Main',
  trigger: 'stage_change', triggerFilter: { to_stage: 'funded_naitive' },
  default_owner_role: 'manager',
  handler: async (deal, ctx) => {
    await createWorkflowTask({
      dealId: deal.id, title: 'Move to Closed Won when appropriate',
      assigneeId: deal.manager_id, workflowOwnerId: ctx.workflowOwnerId,
      workflowKey: 'funded_naitive_main', dueOffsetDays: 7, companyId: ctx.companyId,
    });
    // Celebrate! Send notification
    if (deal.manager_id) {
      await sendWorkflowNotification(deal.manager_id, deal.id, deal.name || 'Deal', 'Deal funded! 🎉 Move to Closed Won when ready');
    }
  },
});

registerWorkflow('funded_payment_workflow', {
  key: 'funded_payment_workflow', name: 'Funded – Payment',
  trigger: 'stage_change', triggerFilter: { to_stage: 'funded_payment' },
  default_owner_role: 'manager',
  handler: async (deal, ctx) => {
    await createWorkflowTask({
      dealId: deal.id, title: 'Send final fee invoice',
      assigneeId: deal.manager_id, workflowOwnerId: ctx.workflowOwnerId,
      workflowKey: 'funded_payment_workflow', dueOffsetDays: 3, companyId: ctx.companyId,
    });
    await createWorkflowTask({
      dealId: deal.id, title: 'Re-Intro to Jen for controller intro',
      assigneeId: deal.manager_id, workflowOwnerId: ctx.workflowOwnerId,
      workflowKey: 'funded_payment_workflow', dueOffsetDays: 3, companyId: ctx.companyId,
    });
  },
});

registerWorkflow('funded_feedback_testimonials', {
  key: 'funded_feedback_testimonials', name: 'Funded – Feedback & Testimonials',
  trigger: 'stage_change', triggerFilter: { to_stage: 'funded_feedback_testimonials' },
  default_owner_role: 'manager',
  handler: async (deal, ctx) => {
    await createWorkflowTask({
      dealId: deal.id, title: 'Send email intro for Chandler feedback/testimonial',
      assigneeId: deal.manager_id, workflowOwnerId: ctx.workflowOwnerId,
      workflowKey: 'funded_feedback_testimonials', dueOffsetDays: 3, companyId: ctx.companyId,
    });
  },
});

registerWorkflow('funded_lender_review', {
  key: 'funded_lender_review', name: 'Funded – Lender Review',
  trigger: 'stage_change', triggerFilter: { to_stage: 'funded_lender_review' },
  default_owner_role: 'manager',
  handler: async (deal, ctx) => {
    await createWorkflowTask({
      dealId: deal.id, title: 'Rate lenders on performance dimensions',
      assigneeId: deal.manager_id, workflowOwnerId: ctx.workflowOwnerId,
      workflowKey: 'funded_lender_review', dueOffsetDays: 5, companyId: ctx.companyId,
    });
  },
});

// Export all workflow keys for seeding
export const ALL_WORKFLOW_KEYS = [
  'sales_call_create_deal', 'sales_email_send_nda', 'deal_active_followup_task',
  'materials_to_pre_credit_needs', 'analyst_prepare_model_memo', 'analyst_approval_flow',
  'analyst_disapprove_manager_review', 'manager_approve_route_preview', 'manager_disapprove_notifications',
  'initial_lender_review_entry', 'initial_feedback_entry', 'initial_feedback_to_prop_dev',
  'proposal_completed_sent_task', 'proposal_sent_offer_move', 'prop_issued_followup',
  'prop_forward_to_agreement', 'agreement_pending_followup', 'agreement_to_final_credit',
  'final_credit_retainer', 'final_credit_intro_jen', 'final_credit_prep_kickoff_email',
  'final_credit_send_kickoff_email', 'final_credit_materials_review', 'post_signing_materials_mapped',
  'client_strategy_set_call', 'client_strategy_agenda', 'client_strategy_outcome',
  'write_up_materials_review', 'write_up_create_and_approve', 'write_up_to_submitted_lenders',
  'submitted_to_lenders_emails', 'positive_lender_response', 'lenders_review_weekly_check',
  'terms_issued_analysis', 'terms_issued_payment', 'terms_signed_to_due_diligence',
  'due_diligence_client_flow', 'due_diligence_to_funded',
  'funded_naitive_main', 'funded_payment_workflow', 'funded_feedback_testimonials', 'funded_lender_review',
];

/**
 * Ensures all registered workflows from ALL_WORKFLOW_KEYS exist in the wf_workflows table.
 * Missing workflows are inserted with is_active = true.
 */
export async function ensureWorkflowsSeeded(): Promise<void> {
  try {
    // Fetch existing workflow keys from the database
    const { data: existing, error } = await supabase
      .from('wf_workflows')
      .select('key');
    if (error) {
      console.error('[WF Seed] Failed to fetch existing workflows:', error);
      return;
    }

    const existingKeys = new Set((existing || []).map((w: any) => w.key));
    const registeredWorkflows = getRegisteredWorkflows();
    // Stage-driven task workflows are disabled — never (re)seed them.
    const missing = registeredWorkflows.filter(
      w => !existingKeys.has(w.key) && (w as any).trigger !== 'stage_change'
    );

    if (missing.length === 0) return;

    console.log(`[WF Seed] Seeding ${missing.length} missing workflows:`, missing.map(w => w.key));

    const rows = missing.map(w => ({
      key: w.key,
      name: w.name,
      description: w.description || null,
      trigger_type: w.trigger as any,
      default_owner_role: w.default_owner_role as any,
      is_active: true,
    }));

    const { error: insertError } = await supabase
      .from('wf_workflows')
      .insert(rows as any);

    if (insertError) {
      console.error('[WF Seed] Failed to seed workflows:', insertError);
    } else {
      console.log(`[WF Seed] Successfully seeded ${missing.length} workflows`);
    }
  } catch (err) {
    console.error('[WF Seed] Unexpected error:', err);
  }
}
