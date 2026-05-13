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
import { applyDemoLenderSalutation } from './demoLenderSalutation';

/**
 * Guard for legacy code-defined workflows that are 5th-Line-specific.
 * DB-stored workflows in `email_workflows` are tenant-scoped via `company_id`
 * and therefore should NOT be gated by this check.
 */
function isFifthLine(companyId: string): boolean {
  return companyId === FIFTH_LINE_COMPANY_ID;
}

/** Per-deal+stage+user dedup window for re-prompting (minutes). */
const STAGE_PROMPT_DEDUP_MINUTES = 30;

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
  pipelineId?: string | null;
  pipelineName?: string | null;
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
  // 1. Legacy code-defined workflows (5th Line only — kept for backwards compat)
  if (isFifthLine(ctx.companyId)) {
    const matched = EMAIL_WORKFLOW_DEFINITIONS.filter(
      w => w.triggerType === 'stage_enter' && w.triggerStage === newStage
    );
    for (const workflow of matched) {
      await createPromptFromWorkflow(
        workflow, ctx,
        `Deal moved to stage "${newStage}"${oldStage ? ` from "${oldStage}"` : ''}`
      );
    }
  }

  // 2. DB-stored email_workflows (tenant-scoped, runs for ALL companies)
  await checkDbStageWorkflows(ctx, newStage, oldStage);
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
  const merged = text
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
  // Demo-only: rewrite the salutation to address a deterministic fake
  // lender contact instead of the lender company / placeholder.
  return applyDemoLenderSalutation(merged, ctx.lenderName, ctx.companyId);
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

/**
 * Check DB-stored email_workflows for stage_enter triggers.
 * Normalizes stage names (lowercase, trimmed) for robust matching.
 * Handles preventDuplicateSend and logs events to email_workflow_events.
 */
async function checkDbStageWorkflows(
  ctx: TriggerContext,
  newStage: string,
  oldStage?: string
): Promise<void> {
  // Fetch active stage_enter workflows for this company
  const { data: workflows } = await supabase
    .from('email_workflows' as any)
    .select('*')
    .eq('company_id', ctx.companyId)
    .eq('is_active', true)
    .eq('show_in_deal_prompt', true)
    .eq('trigger_type', 'stage_enter');

  if (!workflows || workflows.length === 0) return;

  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const newNorm = normalize(newStage);
  const pipelineNameNorm = ctx.pipelineName ? normalize(ctx.pipelineName) : null;

  for (const wf of workflows as any[]) {
    const stageNorm = normalize(wf.stage_name || '');
    if (stageNorm !== newNorm) continue;

    // Pipeline scoping — if the workflow is bound to a specific pipeline name,
    // skip when the deal is on a different pipeline.
    if (wf.pipeline_name && pipelineNameNorm) {
      const wfPipeNorm = normalize(wf.pipeline_name);
      if (wfPipeNorm !== pipelineNameNorm) continue;
    }

    // Duplicate prevention: check if already sent for this workflow + deal
    if (wf.prevent_duplicate_send) {
      const { data: existing } = await supabase
        .from('email_workflow_events' as any)
        .select('id')
        .eq('workflow_id', wf.id)
        .eq('deal_id', ctx.dealId)
        .eq('status', 'sent')
        .limit(1);
      if (existing && existing.length > 0) continue;
    }

    // Per-deal+stage+workflow dedup window — skip if a prompt for the same
    // workflow+deal was created within the last STAGE_PROMPT_DEDUP_MINUTES,
    // regardless of status. Prevents bouncing-stage spam.
    const cutoff = new Date(Date.now() - STAGE_PROMPT_DEDUP_MINUTES * 60_000).toISOString();
    const { data: recentPrompt } = await supabase
      .from('deal_email_prompts')
      .select('id, status')
      .eq('deal_id', ctx.dealId)
      .eq('workflow_key', wf.id)
      .gte('triggered_at', cutoff)
      .limit(1);
    if (recentPrompt && recentPrompt.length > 0) {
      // If a prompt is still pending, surface it to any open listener instead
      // of creating a duplicate.
      const existingId = (recentPrompt[0] as any).id;
      const status = (recentPrompt[0] as any).status;
      if (status === 'pending') {
        dispatchWorkflowPromptEvent(existingId, ctx.dealId);
      }
      continue;
    }

    // Resolve template — skip prompt if template is inactive or missing
    const { data: template } = await supabase
      .from('outbound_email_templates' as any)
      .select('*')
      .eq('id', wf.email_template_id)
      .eq('is_active', true)
      .maybeSingle();

    if (!template) {
      console.warn(`[email-workflow] Skipping workflow "${wf.name}": mapped template is inactive or missing`);
      continue;
    }

    const subject = mergeTemplate(
      (template as any)?.subject_line || wf.default_subject || '',
      ctx
    );
    const bodyHtml = mergeTemplate(
      (template as any)?.body_rich_text || `<p>Email template not found. Please configure it in Settings → Email.</p>`,
      ctx
    );

    const recipients = await resolveRecipients(
      (wf.audience || 'client').toLowerCase(),
      ctx
    );

    const { data: { user } } = await supabase.auth.getUser();
    const triggerReason = `Triggered because deal entered "${wf.stage_name}" (${wf.trigger_event})`;

    const { data: promptData } = await supabase.from('deal_email_prompts').insert({
      deal_id: ctx.dealId,
      company_id: ctx.companyId,
      workflow_key: wf.id,
      workflow_name: wf.name,
      trigger_reason: triggerReason,
      email_template_number: wf.email_template_number,
      recipients_json: recipients,
      cc_json: [],
      merged_subject: subject,
      merged_body_html: bodyHtml,
      status: 'pending',
      metadata: {
        workflow_id: wf.id,
        template_id: wf.email_template_id,
        triggered_by: user?.id || null,
        sequence_type: wf.sequence_type,
        audience: wf.audience,
        comm_type: wf.comm_type,
        requires_approval: wf.requires_approval,
        prevent_duplicate_send: wf.prevent_duplicate_send,
        stage_id: newStage,
        previous_stage_id: oldStage || null,
        pipeline_id: ctx.pipelineId || null,
        pipeline_name: ctx.pipelineName || null,
      },
    } as any).select().single();

    // Log to email_workflow_events
    await supabase.from('email_workflow_events' as any).insert({
      workflow_id: wf.id,
      deal_id: ctx.dealId,
      company_id: ctx.companyId,
      email_template_id: wf.email_template_id,
      prompt_id: (promptData as any)?.id || null,
      status: 'pending_approval',
      prompt_shown_at: new Date().toISOString(),
    } as any);

    // Notification audit — record that the prompt was created (status: prompted)
    await supabase.from('notification_audit' as any).insert({
      trigger_key: 'workflow_email_prompt',
      recipient_user_id: user?.id || null,
      deal_id: ctx.dealId,
      channel: 'in_app_modal',
      status: 'prompted',
      title: wf.name,
      body: triggerReason,
      metadata: {
        prompt_id: (promptData as any)?.id || null,
        workflow_id: wf.id,
        stage_id: newStage,
        previous_stage_id: oldStage || null,
        pipeline_id: ctx.pipelineId || null,
      },
    } as any);

    // Surface the new prompt to any open listener so the modal opens.
    if ((promptData as any)?.id) {
      dispatchWorkflowPromptEvent((promptData as any).id, ctx.dealId);
    }
  }
}

/**
 * Browser-side notifier — listened to by `WorkflowEmailModalListener`
 * mounted globally in App.tsx. Safe no-op outside the browser.
 */
function dispatchWorkflowPromptEvent(promptId: string, dealId: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('workflow-email-prompt', { detail: { promptId, dealId } })
  );
}
