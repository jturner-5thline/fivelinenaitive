import { supabase } from '@/integrations/supabase/client';
import { addDays, subDays, format } from 'date-fns';

/**
 * Seeds a fully configured sample deal with realistic fake lenders,
 * milestones, and activity logs so new users can explore immediately.
 */
export async function seedSampleDeal(userId: string, companyId?: string | null): Promise<boolean> {
  try {
    // Check if THIS USER already has deals
    const { data: existingDeals } = await supabase
      .from('deals')
      .select('id, company_id, pipeline_id')
      .eq('user_id', userId)
      .limit(5);

    if (existingDeals && existingDeals.length > 0) {
      // If there's an orphaned deal (company_id is null) and we now have a companyId, repair it
      const orphanedDeal = existingDeals.find(d => !d.company_id);
      if (orphanedDeal && companyId) {
        // Find default pipeline for this company
        let pipelineId: string | null = null;
        let defaultStage: string | null = null;
        const { data: pipeline } = await supabase
          .from('deal_pipelines')
          .select('id, stages')
          .eq('company_id', companyId)
          .eq('is_default', true)
          .maybeSingle();

        if (pipeline) {
          pipelineId = pipeline.id;
          const stages = pipeline.stages as any[];
          if (stages && stages.length > 1) {
            defaultStage = stages[1].id;
          }
        }

        const updates: Record<string, any> = { company_id: companyId };
        if (pipelineId) updates.pipeline_id = pipelineId;
        if (defaultStage) updates.stage = defaultStage;

        await supabase
          .from('deals')
          .update(updates)
          .eq('id', orphanedDeal.id);

        console.log('Repaired orphaned sample deal:', orphanedDeal.id);
      }
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

    // Get or create default pipeline for the company
    let pipelineId: string | null = null;
    let defaultStage = 'qualification';
    if (companyId) {
      const { data: pipeline } = await supabase
        .from('deal_pipelines')
        .select('id, stages')
        .eq('company_id', companyId)
        .eq('is_default', true)
        .maybeSingle();

      if (pipeline) {
        pipelineId = pipeline.id;
        const stages = pipeline.stages as any[];
        if (stages && stages.length > 1) {
          defaultStage = stages[1].id;
        }
      } else {
        // Create default "Active Pipeline" if none exists
        const defaultPipelineStages = [
          { id: 'prospect', label: 'Prospect', color: 'bg-slate-500' },
          { id: 'qualification', label: 'Qualification', color: 'bg-blue-500' },
          { id: 'proposal', label: 'Proposal', color: 'bg-yellow-500' },
          { id: 'negotiation', label: 'Negotiation', color: 'bg-orange-500' },
          { id: 'closed-won', label: 'Closed Won', color: 'bg-green-500' },
          { id: 'closed-lost', label: 'Closed Lost', color: 'bg-red-500' },
        ];
        const { data: newPipeline } = await supabase
          .from('deal_pipelines')
          .insert({
            company_id: companyId,
            name: 'Active Pipeline',
            stages: defaultPipelineStages as any,
            is_default: true,
            position: 0,
          })
          .select('id')
          .single();

        if (newPipeline) {
          pipelineId = newPipeline.id;
        }
      }
    }

    // Get lender pipeline stages for this company to use valid stage IDs
    let lenderStages: { id: string; label: string }[] = [];
    if (companyId) {
      const { data: lenderPipeline } = await (supabase as any)
        .from('lender_pipelines')
        .select('stages')
        .eq('company_id', companyId)
        .eq('is_default', true)
        .maybeSingle();

      if (lenderPipeline?.stages) {
        lenderStages = lenderPipeline.stages as any[];
      }
    }

    // Fallback generic stages if no lender pipeline found
    if (lenderStages.length === 0) {
      lenderStages = [
        { id: 'outreach', label: 'Outreach' },
        { id: 'reviewing', label: 'Reviewing' },
        { id: 'diligence', label: 'Diligence' },
        { id: 'term-sheet', label: 'Term Sheet' },
        { id: 'passed', label: 'Passed' },
      ];
    }

    // Helper to find a stage by label pattern or fall back to index
    const findStage = (patterns: string[], fallbackIndex: number): string => {
      for (const pattern of patterns) {
        const found = lenderStages.find(s => s.label.toLowerCase().includes(pattern.toLowerCase()));
        if (found) return found.id;
      }
      return lenderStages[Math.min(fallbackIndex, lenderStages.length - 1)]?.id || 'outreach';
    };

    const stageOutreach = findStage(['outreach', 'contacted', 'sent'], 0);
    const stageReviewing = findStage(['review', 'diligence'], 1);
    const stageTermSheet = findStage(['term', 'offer', 'draft'], Math.min(3, lenderStages.length - 1));
    const stagePassed = findStage(['pass', 'declined', 'closed'], lenderStages.length - 1);

    const now = new Date();

    // ── Create the sample deal ──
    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .insert({
        company: 'Example Deal',
        value: 10000000,
        status: 'active',
        stage: defaultStage,
        engagement_type: 'Retained',
        deal_type: 'Debt Financing',
        manager: 'You',
        analyst: 'Unassigned',
        referred_by: 'Existing Client Referral',
        contact: 'Alex Morgan, CFO',
        contact_info: 'alex.morgan@examplecorp.com',
        company_url: 'https://examplecorp.com',
        business_model: 'B2B SaaS platform providing workforce management solutions to mid-market enterprises. $6.5MM ARR with 120% net revenue retention across 80+ enterprise customers.',
        narrative: 'Example Corp is seeking $10MM in debt financing to fund geographic expansion and product development. The company has demonstrated consistent growth with strong unit economics: gross margins above 75%, CAC payback under 14 months, and a clear path to profitability within 18 months. Management team has deep industry experience with two prior successful exits.',
        user_id: userId,
        company_id: companyId || null,
        pipeline_id: pipelineId,
        notes: '**This is an example deal** to help you explore the platform.\n\nDeal Overview:\n- $10MM debt financing for growth capital\n- Strong recurring revenue base ($6.5MM ARR)\n- Multiple lenders engaged at various stages\n- Target close in 60 days\n\nNext Steps:\n1. Complete management presentations with shortlisted lenders\n2. Compare incoming term sheets\n3. Negotiate final terms with selected lender\n\nFeel free to edit or delete this deal at any time.',
        closing_date: format(addDays(now, 60), 'yyyy-MM-dd'),
        sourced_via: 'Referral',
        total_fee: 200000,
        retainer_fee: 25000,
        success_fee_percent: 1.75,
        pre_signing_hours: 45,
        post_signing_hours: 12,
        exclusivity: 'Yes — 90 days',
      })
      .select()
      .single();

    if (dealError || !deal) {
      console.error('Failed to create sample deal:', dealError);
      return false;
    }

    // ── Add realistic lenders using the company's actual lender stages ──
    const lenders = [
      {
        deal_id: deal.id,
        name: 'Summit Growth Partners',
        stage: stageTermSheet,
        tracking_status: 'active',
        notes: 'Strong interest from day one. Term sheet received at $10MM, 36-month term, 10.75% fixed rate. Very competitive — reviewing with client this week.',
        quote_amount: 10000000,
        quote_rate: 10.75,
        quote_term: '36 months',
        score: 9,
      },
      {
        deal_id: deal.id,
        name: 'Horizon Capital Group',
        stage: stageReviewing,
        tracking_status: 'active',
        notes: 'Preliminary terms shared verbally: $8-10MM range, floating rate at SOFR + 450bps. Requesting updated financial model with quarterly projections. Solid relationship — worth keeping in the mix.',
        quote_amount: 9000000,
        quote_rate: 11.25,
        quote_term: '48 months',
        score: 7,
      },
      {
        deal_id: deal.id,
        name: 'Meridian Lending Corp',
        stage: stageReviewing,
        substage: 'in-review',
        tracking_status: 'active',
        notes: 'Full package sent last Monday. Credit committee review is scheduled for next week. Analyst flagged strong NRR as a positive signal. Follow-up call Thursday at 2pm.',
        score: 6,
      },
      {
        deal_id: deal.id,
        name: 'Pacific Coast Finance',
        stage: stageOutreach,
        tracking_status: 'active',
        notes: 'Warm intro made via our network. Information package sent — they focus on tech-enabled services, so this could be a strong fit. Typically 5-7 day turnaround on initial feedback.',
      },
      {
        deal_id: deal.id,
        name: 'Atlas Venture Debt',
        stage: stageOutreach,
        tracking_status: 'active',
        notes: 'Initial outreach sent. They have a strong track record with SaaS companies in the $5-15MM range. Awaiting response from their origination team.',
      },
      {
        deal_id: deal.id,
        name: 'Keystone Business Credit',
        stage: stagePassed,
        tracking_status: 'passed',
        pass_reason: 'Industry sector not within current lending mandate. They are focused on healthcare and life sciences for Q1-Q2.',
        notes: 'Passed — sector mismatch. Suggested revisiting if they expand their mandate later this year.',
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
        description: 'Deal created — Example Deal, $10.00MM Debt Financing',
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
        description: 'Received financial model and 3-year projections from client. Revenue growth trajectory is strong with clear path to $10MM ARR.',
        user_display_name: 'You',
        created_at: format(subDays(now, 9), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
      },
      {
        deal_id: deal.id,
        user_id: userId,
        activity_type: 'lender_added',
        description: 'Added 6 lenders to the deal for outreach',
        user_display_name: 'You',
        created_at: format(subDays(now, 7), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
      },
      {
        deal_id: deal.id,
        user_id: userId,
        activity_type: 'stage_change',
        description: 'Summit Growth Partners moved to Term Sheet stage — $10MM at 10.75%',
        user_display_name: 'You',
        created_at: format(subDays(now, 2), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
      },
      {
        deal_id: deal.id,
        user_id: userId,
        activity_type: 'note_added',
        description: 'Summit Growth Partners term sheet: $10MM, 10.75% fixed, 36-month term. Very competitive — scheduling client review call for Monday.',
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
