/**
 * Email Workflow Configuration
 * Defines trigger conditions and template mappings for deal-triggered email prompts.
 * Email # maps to outbound_email_templates.template_number in the company's Settings.
 *
 * Source of truth: Emails_Workflow_1.xlsx
 */

export type EmailWorkflowTriggerType =
  | 'stage_enter'
  | 'timer'
  | 'manual';

export interface EmailWorkflowDefinition {
  sequenceNumber: number;
  key: string;
  sequenceName: string;
  name: string;
  description: string;
  triggerType: EmailWorkflowTriggerType;
  emailTemplateNumber: number;
  recurring: boolean;
  /** The raw trigger description from the spreadsheet */
  triggerDescription: string;
  /** The condition that must be true */
  conditionDescription: string;
  /** For stage_enter triggers */
  triggerStage?: string;
  triggerPipeline?: string;
  /** For timer triggers */
  recurringSchedule?: string;
  recurringAfterStage?: string;
  /** For conditional timer triggers */
  conditionDelayDays?: number;
  conditionMinItems?: number;
  /** Default recipient context */
  recipientContext: 'client' | 'lender' | 'lender_contacts' | 'deal_manager';
  /** Subject line template */
  subjectTemplate: string;
  /** Fields to merge into template */
  mergeFields: string[];
  /** CC recommendations */
  ccNote: string;
  /** Additional notes from the spreadsheet */
  notes: string;
}

/**
 * Master workflow definitions from Emails_Workflow_1.xlsx.
 * Email # maps to outbound_email_templates.template_number.
 */
export const EMAIL_WORKFLOW_DEFINITIONS: EmailWorkflowDefinition[] = [
  {
    sequenceNumber: 1,
    key: 'lender_submission_confirmation',
    sequenceName: 'Lender Submission Confirmation and Communication Thread',
    name: 'Lender Submission Confirmation',
    description: 'Triggered when a deal moves to "Submitted to Lenders" in the Active Pipeline. Sends a confirmation to the client that their deal has been submitted.',
    triggerType: 'stage_enter',
    emailTemplateNumber: 1,
    recurring: false,
    triggerDescription: 'Deal moves to "Submitted to Lenders" in "Active Pipeline"',
    conditionDescription: 'Deal has been moved to "Submitted to Lenders" in "Active Pipeline"',
    triggerStage: 'submitted-to-lenders',
    triggerPipeline: 'Active Pipeline',
    recipientContext: 'client',
    subjectTemplate: '[DEAL NAME] & 5TH LINE',
    mergeFields: ['deal_name', 'client_name', 'client_contact_info', 'facility_size', 'use_of_funds', 'lender_count'],
    ccNote: 'Platform to auto-recommend CC recipients based on deal and contact data',
    notes: 'Platform to auto-recommend CC recipients based on deal and contact data',
  },
  {
    sequenceNumber: 2,
    key: 'lender_submission_to_lender',
    sequenceName: 'Lender Submission Email Template',
    name: 'Lender Submission to Lender',
    description: 'Triggered when a write-up is pushed to FLEx. Sends the submission package to matched lenders.',
    triggerType: 'stage_enter',
    emailTemplateNumber: 2,
    recurring: false,
    triggerDescription: 'Write up "Pushed to FLEx"',
    conditionDescription: 'Write Up for the deal has been Pushed to FLEx',
    recipientContext: 'lender',
    subjectTemplate: '[DEAL NAME] | LENDER NAME – New Deal ~$[FACILITY_SIZE_SHORT]',
    mergeFields: ['deal_name', 'company_name', 'facility_size', 'use_of_funds', 'deal_type', 'lender_name'],
    ccNote: 'Platform to auto-recommend CC recipients',
    notes: 'Naitive should pull facility size, use of funds, and specific notes (e.g. asked for $2-3M but open to larger facility) directly from deal data to populate email body accurately',
  },
  {
    sequenceNumber: 3,
    key: 'weekly_lender_status_update',
    sequenceName: 'Lender Update Email for Client',
    name: 'Weekly Lender Status Update',
    description: 'Recurring weekly prompt (Friday 10am local time) after a deal enters "Lenders in Review". Provides status updates to the client.',
    triggerType: 'timer',
    emailTemplateNumber: 3,
    recurring: true,
    triggerDescription: 'Weekly on Fridays at 10am (local time of the user) each week starting with the first Friday after a deal enters deal stage "Lenders in Review" in the "Active Pipeline"',
    conditionDescription: 'Deal is in "Lenders in Review" stage or later in the "Active Pipeline" but is not marked as "Archived" or "On Hold"',
    recurringSchedule: 'weekly_friday_10am',
    recurringAfterStage: 'lenders-in-review',
    recipientContext: 'client',
    subjectTemplate: '[DEAL NAME] | 5th Line Status Update',
    mergeFields: ['deal_name', 'client_contact_info', 'lender_status_summary', 'outstanding_items_count', 'next_steps'],
    ccNote: 'Platform to auto-recommend CC recipients',
    notes: 'Naitive auto-populates lender counts and status from platform data',
  },
  {
    sequenceNumber: 4,
    key: 'outstanding_items_followup',
    sequenceName: 'Lender Asks for Client',
    name: 'Lender Asks for Outstanding Items',
    description: 'Triggered after 7 days from when the first outstanding item is added OR when 5+ outstanding items exist. Prompts a follow-up email to the client.',
    triggerType: 'timer',
    emailTemplateNumber: 4,
    recurring: false,
    triggerDescription: '7 Days from when the first outstanding item is added to the deal OR when there are 5 or more outstanding items added to Outstanding Items in the deal',
    conditionDescription: 'At least one outstanding item is in the Outstanding Items list for the deal',
    conditionDelayDays: 7,
    conditionMinItems: 5,
    recipientContext: 'client',
    subjectTemplate: '[DEAL NAME] & 5TH LINE - in response to thread',
    mergeFields: ['deal_name', 'client_name', 'client_contact_info', 'outstanding_items_list', 'outstanding_items_count'],
    ccNote: 'Platform to auto-recommend CC recipients',
    notes: 'Naitive can also be prompted manually to craft this before the timer fires',
  },
];

export function getWorkflowByKey(key: string): EmailWorkflowDefinition | undefined {
  return EMAIL_WORKFLOW_DEFINITIONS.find(w => w.key === key);
}

export function getWorkflowByTemplateNumber(num: number): EmailWorkflowDefinition | undefined {
  return EMAIL_WORKFLOW_DEFINITIONS.find(w => w.emailTemplateNumber === num);
}

export function getWorkflowBySequenceNumber(num: number): EmailWorkflowDefinition | undefined {
  return EMAIL_WORKFLOW_DEFINITIONS.find(w => w.sequenceNumber === num);
}
