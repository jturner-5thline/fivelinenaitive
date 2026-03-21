import { supabase } from '@/integrations/supabase/client';
import { addDays, subDays, format } from 'date-fns';

/**
 * Seeds a fully configured sample deal with realistic fake lenders,
 * milestones, and activity logs so new users can explore immediately.
 */
export async function seedSampleDeal(userId: string, companyId?: string | null): Promise<boolean> {
  try {
    // Check if user already has deals (don't re-seed)
    const { data: existingDeals } = await supabase
      .from('deals')
      .select('id')
      .limit(1);

    if (existingDeals && existingDeals.length > 0) {
      return false;
    }

    // Check company_features flag
    if (companyId) {
      const { data: features } = await (supabase as any)
        .from('company_features')
        .select('sample_deal_on_signup')
        .eq('company_id', companyId)
        .maybeSingle();

      if (features && features.sample_deal_on_signup === false) {
        return false;
      }
    }

    // Get default pipeline for the company
    let pipelineId: string | null = null;
    let defaultStage = 'initial-screening';
    if (companyId) {
      const { data: pipeline } = await supabase
        .from('deal_pipelines')
        .select('id, stages')
        .eq('company_id', companyId)
        .eq('is_default', true)
        .maybeSingle();

      if (pipeline) {
        pipelineId = pipeline.id;
        // Use second stage (after new-lead) if available
        const stages = pipeline.stages as any[];
        if (stages && stages.length > 1) {
          defaultStage = stages[1].id;
        }
      }
    }

    const now = new Date();

    // ── Create the sample deal ──
    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .insert({
        company: 'Greenfield Technologies (Sample)',
        value: 8500000,
        status: 'active',
        stage: defaultStage,
        engagement_type: 'Retained',
        deal_type: 'Growth Capital',
        manager: 'You',
        analyst: 'Unassigned',
        referred_by: 'Industry Conference',
        contact: 'Sarah Chen, CEO',
        contact_info: 'sarah@greenfieldtech.com',
        company_url: 'https://greenfieldtech.example.com',
        business_model: 'B2B SaaS — AI-powered supply chain optimization platform serving mid-market manufacturers. $4.2M ARR, 130% NRR, 45 enterprise clients.',
        narrative: 'Greenfield Technologies is seeking $8.5M in growth capital to accelerate product development and expand their sales team. The company has demonstrated strong unit economics with CAC payback under 12 months and gross margins above 80%. Their AI-driven platform has seen 3x YoY growth in enterprise contracts.',
        user_id: userId,
        company_id: companyId || null,
        pipeline_id: pipelineId,
        notes: '**This is a sample deal** to help you explore the platform.\n\nKey highlights:\n- Strong revenue growth trajectory\n- Healthy unit economics\n- Multiple lenders at various stages\n\nFeel free to edit or delete this deal at any time.',
        closing_date: format(addDays(now, 60), 'yyyy-MM-dd'),
        sourced_via: 'Conference',
      })
      .select()
      .single();

    if (dealError || !deal) {
      console.error('Failed to create sample deal:', dealError);
      return false;
    }

    // ── Add realistic lenders at various stages ──
    const lenders = [
      {
        deal_id: deal.id,
        name: 'Summit Growth Partners',
        stage: 'term-sheets',
        tracking_status: 'active',
        notes: 'Very strong interest. Term sheet received at $8.5M, 3-year term, 11.5% rate. Reviewing with client.',
        quote_amount: 8500000,
        quote_rate: 11.5,
        quote_term: '3 years',
        score: 9,
      },
      {
        deal_id: deal.id,
        name: 'Horizon Capital Group',
        stage: 'draft-terms',
        tracking_status: 'active',
        notes: 'Draft terms received. Competitive rate but requesting board observer seat. Client reviewing.',
        quote_amount: 7500000,
        quote_rate: 12.0,
        quote_term: '4 years',
        score: 7,
      },
      {
        deal_id: deal.id,
        name: 'Meridian Lending Corp',
        stage: 'reviewing-drl',
        substage: 'in-review',
        tracking_status: 'active',
        notes: 'Materials sent last week. Credit team reviewing financials. Follow-up scheduled for Thursday.',
        score: 6,
      },
      {
        deal_id: deal.id,
        name: 'Pacific Coast Finance',
        stage: 'reviewing-drl',
        substage: 'awaiting-response',
        tracking_status: 'active',
        notes: 'DRL submitted. Awaiting initial feedback from their growth lending team.',
      },
      {
        deal_id: deal.id,
        name: 'Atlas Venture Debt',
        stage: 'e8be95f3-4e34-4e72-999e-bbf79789d9a7', // Sent DRL
        tracking_status: 'active',
        notes: 'Information package sent. They typically take 5-7 business days for initial review.',
      },
      {
        deal_id: deal.id,
        name: 'Keystone Business Credit',
        stage: 'passed',
        tracking_status: 'passed',
        pass_reason: 'Deal size below their minimum ($15M floor). Suggested we revisit if raise increases.',
        notes: 'Passed — deal size mismatch. Min ticket is $15M.',
      },
      {
        deal_id: deal.id,
        name: 'First Republic Commercial',
        stage: 'on-hold',
        tracking_status: 'on-hold',
        notes: 'Interested but currently at capacity for Q1. Will revisit in 30 days.',
      },
      {
        deal_id: deal.id,
        name: 'Venture West Capital',
        stage: 'on-deck',
        tracking_status: 'on-deck',
        notes: 'Good fit profile. Queued for outreach after current round of responses.',
      },
    ];

    const { error: lenderError } = await supabase
      .from('deal_lenders')
      .insert(lenders);

    if (lenderError) {
      console.error('Failed to create sample lenders:', lenderError);
    }

    // ── Add milestones ──
    const milestones = [
      { title: 'Engagement Letter Signed', due_date: format(subDays(now, 14), "yyyy-MM-dd'T'HH:mm:ss'Z'"), completed: true, completed_at: format(subDays(now, 14), "yyyy-MM-dd'T'HH:mm:ss'Z'"), position: 0 },
      { title: 'Financial Model Received', due_date: format(subDays(now, 10), "yyyy-MM-dd'T'HH:mm:ss'Z'"), completed: true, completed_at: format(subDays(now, 9), "yyyy-MM-dd'T'HH:mm:ss'Z'"), position: 1 },
      { title: 'Initial Lender Outreach', due_date: format(subDays(now, 7), "yyyy-MM-dd'T'HH:mm:ss'Z'"), completed: true, completed_at: format(subDays(now, 7), "yyyy-MM-dd'T'HH:mm:ss'Z'"), position: 2 },
      { title: 'Management Presentations', due_date: format(addDays(now, 5), "yyyy-MM-dd'T'HH:mm:ss'Z'"), completed: false, position: 3 },
      { title: 'Term Sheet Comparison', due_date: format(addDays(now, 14), "yyyy-MM-dd'T'HH:mm:ss'Z'"), completed: false, position: 4 },
      { title: 'Final Lender Selection', due_date: format(addDays(now, 30), "yyyy-MM-dd'T'HH:mm:ss'Z'"), completed: false, position: 5 },
      { title: 'Credit Agreement Review', due_date: format(addDays(now, 45), "yyyy-MM-dd'T'HH:mm:ss'Z'"), completed: false, position: 6 },
      { title: 'Closing & Funding', due_date: format(addDays(now, 60), "yyyy-MM-dd'T'HH:mm:ss'Z'"), completed: false, position: 7 },
    ].map(m => ({ ...m, deal_id: deal.id, user_id: userId }));

    const { error: milestoneError } = await supabase
      .from('deal_milestones')
      .insert(milestones);

    if (milestoneError) {
      console.error('Failed to create sample milestones:', milestoneError);
    }

    // ── Add activity log entries ──
    const activities = [
      {
        deal_id: deal.id,
        user_id: userId,
        activity_type: 'deal_created',
        description: 'Deal created — Greenfield Technologies, $8.5M Growth Capital',
        user_display_name: 'You',
        created_at: format(subDays(now, 14), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
      },
      {
        deal_id: deal.id,
        user_id: userId,
        activity_type: 'milestone_completed',
        description: 'Milestone completed: Engagement Letter Signed',
        user_display_name: 'You',
        created_at: format(subDays(now, 14), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
      },
      {
        deal_id: deal.id,
        user_id: userId,
        activity_type: 'note_added',
        description: 'Received financial model and projections from client. Revenue trajectory looks strong.',
        user_display_name: 'You',
        created_at: format(subDays(now, 9), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
      },
      {
        deal_id: deal.id,
        user_id: userId,
        activity_type: 'lender_added',
        description: 'Added 8 lenders to the deal for outreach',
        user_display_name: 'You',
        created_at: format(subDays(now, 7), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
      },
      {
        deal_id: deal.id,
        user_id: userId,
        activity_type: 'stage_change',
        description: 'Summit Growth Partners moved to Term Sheets stage',
        user_display_name: 'You',
        created_at: format(subDays(now, 2), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
      },
      {
        deal_id: deal.id,
        user_id: userId,
        activity_type: 'note_added',
        description: 'Summit Growth Partners term sheet: $8.5M, 11.5% rate, 3-year term. Very competitive — recommend presenting to client.',
        user_display_name: 'You',
        created_at: format(subDays(now, 1), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
      },
    ];

    const { error: activityError } = await supabase
      .from('activity_logs')
      .insert(activities);

    if (activityError) {
      console.error('Failed to create sample activities:', activityError);
    }

    return true;
  } catch (error) {
    console.error('Error seeding sample deal:', error);
    return false;
  }
}
