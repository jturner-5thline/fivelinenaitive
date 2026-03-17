import { supabase } from '@/integrations/supabase/client';
import { addDays, format } from 'date-fns';

/**
 * Seeds a single sample deal with lenders and milestones for new users
 * so they can explore the platform immediately after onboarding.
 */
export async function seedSampleDeal(userId: string, companyId?: string | null): Promise<boolean> {
  try {
    // Check if user already has deals (don't re-seed)
    const { data: existingDeals } = await supabase
      .from('deals')
      .select('id')
      .limit(1);

    if (existingDeals && existingDeals.length > 0) {
      return false; // User already has deals
    }

    // Check company_features flag for sample_deal_on_signup
    if (companyId) {
      const { data: features } = await (supabase as any)
        .from('company_features')
        .select('sample_deal_on_signup')
        .eq('company_id', companyId)
        .maybeSingle();

      if (features && features.sample_deal_on_signup === false) {
        return false; // Company has sample deals disabled
      }
    }

    const now = new Date();

    // Create a single sample deal
    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .insert({
        company: 'Acme Corp (Sample)',
        value: 5000000,
        status: 'active',
        stage: 'Due Diligence',
        engagement_type: 'Retained',
        deal_type: 'Growth Capital',
        manager: 'You',
        referred_by: 'Direct',
        user_id: userId,
        company_id: companyId || null,
        notes: 'This is a sample deal to help you get started. Feel free to edit or delete it!',
      })
      .select()
      .single();

    if (dealError || !deal) {
      console.error('Failed to create sample deal:', dealError);
      return false;
    }

    // Add sample lenders
    const lenders = [
      {
        deal_id: deal.id,
        name: 'First National Bank',
        stage: 'reviewing-drl',
        notes: 'Sample lender — reviewing the deal request letter.',
      },
      {
        deal_id: deal.id,
        name: 'Capital Partners',
        stage: 'dd',
        notes: 'Sample lender — currently in due diligence.',
      },
      {
        deal_id: deal.id,
        name: 'Growth Fund LLC',
        stage: 'term-sheet',
        notes: 'Sample lender — term sheet issued.',
      },
    ];

    const { error: lenderError } = await supabase
      .from('deal_lenders')
      .insert(lenders);

    if (lenderError) {
      console.error('Failed to create sample lenders:', lenderError);
    }

    // Add sample milestones
    const milestones = [
      { title: 'Deal Kick Off', due_date: format(addDays(now, -7), "yyyy-MM-dd'T'HH:mm:ss'Z'"), completed: true, position: 0 },
      { title: 'Initial Lender Outreach', due_date: format(addDays(now, -3), "yyyy-MM-dd'T'HH:mm:ss'Z'"), completed: true, position: 1 },
      { title: 'Management Calls', due_date: format(addDays(now, 7), "yyyy-MM-dd'T'HH:mm:ss'Z'"), completed: false, position: 2 },
      { title: 'Term Sheet Review', due_date: format(addDays(now, 21), "yyyy-MM-dd'T'HH:mm:ss'Z'"), completed: false, position: 3 },
      { title: 'Closing', due_date: format(addDays(now, 45), "yyyy-MM-dd'T'HH:mm:ss'Z'"), completed: false, position: 4 },
    ].map(m => ({ ...m, deal_id: deal.id }));

    const { error: milestoneError } = await supabase
      .from('deal_milestones')
      .insert(milestones);

    if (milestoneError) {
      console.error('Failed to create sample milestones:', milestoneError);
    }

    return true;
  } catch (error) {
    console.error('Error seeding sample deal:', error);
    return false;
  }
}
