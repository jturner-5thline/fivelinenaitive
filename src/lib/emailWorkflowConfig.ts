/**
 * Email Workflow Configuration
 * Defines trigger conditions and template mappings for deal-triggered email prompts.
 * Email # maps to outbound_email_templates.template_number in the company's Settings.
 */

export type EmailWorkflowTriggerType =
  | 'stage_change'
  | 'milestone_event'
  | 'recurring_timer'
  | 'conditional_timer'
  | 'manual';

export interface EmailWorkflowDefinition {
  key: string;
  name: string;
  description: string;
  triggerType: EmailWorkflowTriggerType;
  emailTemplateNumber: number;
  /** For stage_change triggers */
  triggerStage?: string;
  triggerPipeline?: string;
  /** For milestone triggers */
  triggerMilestoneTitle?: string;
  /** For recurring triggers */
  recurringSchedule?: string; // e.g. "weekly_friday_10am"
  recurringAfterStage?: string;
  /** For conditional triggers */
  conditionDelayDays?: number;
  conditionMinItems?: number;
  /** Default recipient context */
  recipientContext: 'client' | 'lenders' | 'lender_contacts' | 'deal_manager';
  /** Fields to merge into template */
  mergeFields: string[];
  /** CC recommendations */
  ccContext?: string;
}

/**
 * Master workflow definitions derived from the user's spreadsheet.
 * Email # maps to outbound_email_templates.template_number.
 */
export const EMAIL_WORKFLOW_DEFINITIONS: EmailWorkflowDefinition[] = [
  {
    key: 'lender_submission_confirmation',
    name: 'Lender Submission Confirmation',
    description: 'Triggered when a deal moves to "Submitted to Lenders" in the Active Pipeline. Sends a confirmation to the client that their deal has been submitted.',
    triggerType: 'stage_change',
    emailTemplateNumber: 1,
    triggerStage: 'submitted-to-lenders',
    recipientContext: 'client',
    mergeFields: ['deal_name', 'client_name', 'facility_size', 'use_of_funds', 'lender_count'],
  },
  {
    key: 'lender_submission_to_lender',
    name: 'Lender Submission to Lender',
    description: 'Triggered when a write-up is pushed to FLEx. Sends the submission package to matched lenders.',
    triggerType: 'milestone_event',
    emailTemplateNumber: 2,
    triggerMilestoneTitle: 'Write-up Pushed to FLEx',
    recipientContext: 'lender_contacts',
    mergeFields: ['deal_name', 'company_name', 'facility_size', 'use_of_funds', 'deal_type'],
  },
  {
    key: 'weekly_lender_status_update',
    name: 'Weekly Lender Status Update',
    description: 'Recurring weekly prompt (Friday 10am) after a deal enters "Lenders in Review". Provides status updates to lenders.',
    triggerType: 'recurring_timer',
    emailTemplateNumber: 3,
    recurringSchedule: 'weekly_friday_10am',
    recurringAfterStage: 'lenders-in-review',
    recipientContext: 'lender_contacts',
    mergeFields: ['deal_name', 'lender_status_summary', 'outstanding_items_count', 'next_steps'],
  },
  {
    key: 'outstanding_items_followup',
    name: 'Outstanding Items Follow-up',
    description: 'Triggered after 7 days of outstanding items existing, or when 5+ outstanding items are open. Prompts a follow-up email to the client.',
    triggerType: 'conditional_timer',
    emailTemplateNumber: 4,
    conditionDelayDays: 7,
    conditionMinItems: 5,
    recipientContext: 'client',
    mergeFields: ['deal_name', 'client_name', 'outstanding_items_list', 'outstanding_items_count'],
  },
];

export function getWorkflowByKey(key: string): EmailWorkflowDefinition | undefined {
  return EMAIL_WORKFLOW_DEFINITIONS.find(w => w.key === key);
}

export function getWorkflowByTemplateNumber(num: number): EmailWorkflowDefinition | undefined {
  return EMAIL_WORKFLOW_DEFINITIONS.find(w => w.emailTemplateNumber === num);
}
