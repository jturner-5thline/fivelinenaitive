/**
 * Email Workflow Trigger Engine
 * Evaluates deal events against workflow definitions and creates pending prompts.
 * NEVER sends email automatically — only creates recommendations.
 *
 * Source of truth: Emails_Workflow_1.xlsx
 */
import { supabase } from '@/integrations/supabase/client';
import { EMAIL_WORKFLOW_DEFINITIONS, type EmailWorkflowDefinition } from './emailWorkflowConfig';
import { FIFTH_LINE_COMPANY_ID } from '@/hooks/useNaitivePipelineAccess';

/** Guard: only 5th Line company triggers email workflows */
function isFifthLine(companyId: string): boolean {
  return companyId === FIFTH_LINE_COMPANY_ID;
}

interface TriggerContext {
  dealId: string;
  companyId: string;
  dealName: string;
  clientName?: string;
  clientContactInfo?: string;
  facilitySize?: number;
  useOfFunds?: string;
  dealType?: string;
  lenderCount?: number;
  lenderName?: string;
  outstandingItemsCount?: number;
}

/**
 * Check stage_enter workflows and create prompts if matched.
 * Sequence 1: Deal → "Submitted to Lenders"
 * Sequence 2: Write-up "Pushed to FLEx" (treated as stage_enter on milestone)
 */
export async function checkStageChangeWorkflows(
  ctx: TriggerContext,
  newStage: string,
  oldStage?: string
): Promise<void> {
  if (!isFifthLine(ctx.companyId)) return;

  const matched = EMAIL_WORKFLOW_DEFINITIONS.filter(
    w => w.triggerType === 'stage_enter' && w.triggerStage === newStage
  );

  for (const workflow of matched) {
    await createPromptFromWorkflow(workflow, ctx, `Deal moved to stage "${newStage}"${oldStage ? ` from "${oldStage}"` : ''}`);
  }
}

/**
 * Check milestone-based workflows (Sequence 2: Write-up Pushed to FLEx).
 */
export async function checkMilestoneWorkflows(
  ctx: TriggerContext,
  milestoneTitle: string
): Promise<void> {
  if (!isFifthLine(ctx.companyId)) return;

  // Sequence 2 triggers on "Pushed to FLEx" milestone
  if (milestoneTitle.toLowerCase().includes('pushed to flex')) {
    const workflow = EMAIL_WORKFLOW_DEFINITIONS.find(w => w.key === 'lender_submission_to_lender');
    if (workflow) {
      await createPromptFromWorkflow(workflow, ctx, `Milestone completed: "${milestoneTitle}"`);
    }
  }
}

/**
 * Check conditional/timer triggers (Sequence 4: outstanding items thresholds).
 */
export async function checkConditionalWorkflows(
  ctx: TriggerContext
): Promise<void> {
  if (!isFifthLine(ctx.companyId)) return;

  const matched = EMAIL_WORKFLOW_DEFINITIONS.filter(
    w => w.triggerType === 'timer' && !w.recurring && w.conditionMinItems
  );

  for (const workflow of matched) {
    if (workflow.conditionMinItems && ctx.outstandingItemsCount &&
        ctx.outstandingItemsCount >= workflow.conditionMinItems) {
      // Check if a pending prompt already exists for this workflow+deal
      const { data: existing } = await supabase
        .from('deal_email_prompts')
        .select('id')
        .eq('deal_id', ctx.dealId)
        .eq('workflow_key', workflow.key)
        .eq('status', 'pending')
        .limit(1);

      if (!existing || existing.length === 0) {
        await createPromptFromWorkflow(
          workflow, ctx,
          `${ctx.outstandingItemsCount} outstanding items detected (threshold: ${workflow.conditionMinItems})`
        );
      }
    }
  }
}

/**
 * Manually trigger a workflow prompt for a deal (from the Email Prompt Center).
 */
export async function manuallyTriggerWorkflow(
  workflowKey: string,
  ctx: TriggerContext
): Promise<boolean> {
  if (!isFifthLine(ctx.companyId)) return false;
  const workflow = EMAIL_WORKFLOW_DEFINITIONS.find(w => w.key === workflowKey);
  if (!workflow) return false;
  await createPromptFromWorkflow(workflow, ctx, 'Manually triggered by user');
  return true;
}

/**
 * Core: resolve template, merge fields, create the prompt record.
 */
async function createPromptFromWorkflow(
  workflow: EmailWorkflowDefinition,
  ctx: TriggerContext,
  triggerReason: string
): Promise<void> {
  // Resolve template from company's email templates
  const { data: template } = await supabase
    .from('outbound_email_templates' as any)
    .select('*')
    .eq('company_id', ctx.companyId)
    .eq('template_number', workflow.emailTemplateNumber)
    .eq('is_active', true)
    .maybeSingle();

  const subject = mergeTemplate(
    (template as any)?.subject_line || workflow.subjectTemplate,
    ctx
  );
  const bodyHtml = mergeTemplate(
    (template as any)?.body_rich_text || `<p>Email template #${workflow.emailTemplateNumber} not found. Please configure it in Settings → Email.</p>`,
    ctx
  );

  // Build recipients based on context
  const recipients = await resolveRecipients(workflow.recipientContext, ctx);

  const { data: { user } } = await supabase.auth.getUser();

  await supabase.from('deal_email_prompts').insert({
    deal_id: ctx.dealId,
    company_id: ctx.companyId,
    workflow_key: workflow.key,
    workflow_name: workflow.name,
    trigger_reason: triggerReason,
    email_template_number: workflow.emailTemplateNumber,
    recipients_json: recipients,
    cc_json: [],
    merged_subject: subject,
    merged_body_html: bodyHtml,
    status: 'pending',
    metadata: {
      template_id: (template as any)?.id || null,
      triggered_by: user?.id || null,
      sequence_number: workflow.sequenceNumber,
      sequence_name: workflow.sequenceName,
      recurring: workflow.recurring,
      condition: workflow.conditionDescription,
      notes: workflow.notes,
    },
  } as any);
}

function mergeTemplate(text: string, ctx: TriggerContext): string {
  return text
    .replace(/\[COMPANY NAME\]/gi, ctx.dealName || '')
    .replace(/\[CLIENT NAME\]/gi, ctx.clientName || '')
    .replace(/\[CLIENT CONTACT INFO\]/gi, ctx.clientContactInfo || '')
    .replace(/\[DEAL NAME\]/gi, ctx.dealName || '')
    .replace(/\[FACILITY SIZE\]/gi, ctx.facilitySize ? `$${(ctx.facilitySize / 1_000_000).toFixed(1)}M` : '')
    .replace(/\[FACILITY_SIZE_SHORT\]/gi, ctx.facilitySize ? `${(ctx.facilitySize / 1_000_000).toFixed(0)}MM` : 'XMM')
    .replace(/\[USE OF FUNDS\]/gi, ctx.useOfFunds || '')
    .replace(/\[DEAL TYPE\]/gi, ctx.dealType || '')
    .replace(/\[LENDER COUNT\]/gi, String(ctx.lenderCount || 0))
    .replace(/\[LENDER NAME\]/gi, ctx.lenderName || '')
    .replace(/LENDER NAME/g, ctx.lenderName || 'LENDER NAME')
    .replace(/\[OUTSTANDING ITEMS COUNT\]/gi, String(ctx.outstandingItemsCount || 0));
}

async function resolveRecipients(
  context: string,
  ctx: TriggerContext
): Promise<Array<{ name: string; email: string }>> {
  switch (context) {
    case 'client':
      return [{ name: ctx.clientName || 'Client', email: ctx.clientContactInfo || '' }];
    case 'lender':
    case 'lender_contacts':
      return [{ name: ctx.lenderName || 'Lender', email: '' }];
    case 'deal_manager':
      return [{ name: 'Deal Manager', email: '' }];
    default:
      return [];
  }
}
