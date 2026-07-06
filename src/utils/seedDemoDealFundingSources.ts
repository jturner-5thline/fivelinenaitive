import { supabase } from '@/integrations/supabase/client';
import { DEMO_COMPANY_ID } from '@/lib/demoAccount';
import { addDays, subDays } from 'date-fns';

/**
 * When a user in the Demo Access workspace creates a new deal, auto-populate
 * it with a realistic mix of funding sources drawn from the demo tenant's
 * master lender directory. Each seeded lender gets a varied stage, tracking
 * status, and status note so the deal feels "in flight" the moment it's
 * created. A few follow-up tasks are attached too, so the Tasks and Lenders
 * tabs both light up right away.
 *
 * This runs only for the DEMO_COMPANY_ID tenant. No-op everywhere else.
 */

type SeedTemplate = {
  stage: string;
  substage?: string | null;
  tracking_status: string;
  notes: string;
  pass_reason?: string;
  quote_amount?: number;
  quote_rate?: number;
  quote_term?: string;
  score?: number;
  lastContactDaysAgo?: number;
  task?: { title: string; description?: string; dueInDays: number; priority?: string };
};

// Six varied "buckets" so every seeded deal shows a distribution across the
// funnel: from cold outreach through funded / passed.
const TEMPLATES: SeedTemplate[] = [
  {
    stage: 'Terms Issued',
    tracking_status: 'active',
    notes: 'Term sheet in hand — $8.5MM at 11.25% fixed, 36-month term. Client reviewing today; expecting redlines by Thursday.',
    quote_amount: 8_500_000,
    quote_rate: 11.25,
    quote_term: '36 months',
    score: 9,
    lastContactDaysAgo: 1,
    task: { title: 'Compare term sheet vs. competing offers', dueInDays: 2, priority: 'high' },
  },
  {
    stage: 'In Review',
    tracking_status: 'active',
    notes: 'Full package delivered last Monday. Credit committee is scheduled for next week; analyst flagged strong NRR as a positive signal.',
    score: 7,
    lastContactDaysAgo: 3,
    task: { title: 'Follow up on credit committee outcome', dueInDays: 5, priority: 'medium' },
  },
  {
    stage: 'Sent DRL',
    tracking_status: 'on-deck',
    notes: 'Data request list sent Friday. Awaiting three additional cohort files before they take it to committee.',
    score: 6,
    lastContactDaysAgo: 4,
    task: { title: 'Collect outstanding DRL items from client', dueInDays: 3, priority: 'high' },
  },
  {
    stage: 'Initial Outreach',
    tracking_status: 'active',
    notes: 'Warm intro made via our network. Overview deck sent — typical 5-7 day turnaround on initial feedback.',
    lastContactDaysAgo: 2,
  },
  {
    stage: 'Initial Outreach',
    tracking_status: 'on-deck',
    notes: 'Cold outreach sent. Strong historical fit for our deal profile — worth a nudge if no reply by end of week.',
    lastContactDaysAgo: 6,
    task: { title: 'Nudge if no response by Friday', dueInDays: 4, priority: 'low' },
  },
  {
    stage: 'Passed',
    tracking_status: 'passed',
    pass_reason: 'Sector focus mismatch — currently concentrated on healthcare and life sciences this quarter.',
    notes: 'Passed on sector mismatch. Suggested circling back next quarter when their mandate broadens.',
    lastContactDaysAgo: 5,
  },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function seedDemoDealFundingSources(
  dealId: string,
  userId: string,
  companyId: string | null | undefined,
): Promise<void> {
  if (companyId !== DEMO_COMPANY_ID) return;

  try {
    // Pull a randomized slice of the tenant's funding source directory so
    // every new demo deal ends up with a different-looking lender roster.
    const { data: masters, error: masterErr } = await supabase
      .from('master_lenders')
      .select('id, name')
      .eq('company_id', DEMO_COMPANY_ID)
      .limit(60);

    if (masterErr || !masters?.length) {
      console.warn('[demoDealFundingSources] no master_lenders found', masterErr);
      return;
    }

    const picked = shuffle(masters).slice(0, TEMPLATES.length);
    const now = new Date();

    const lenderRows = picked.map((ml, i) => {
      const t = TEMPLATES[i];
      return {
        deal_id: dealId,
        master_lender_id: ml.id,
        name: ml.name,
        stage: t.stage,
        substage: t.substage ?? null,
        tracking_status: t.tracking_status,
        notes: t.notes,
        pass_reason: t.pass_reason ?? null,
        quote_amount: t.quote_amount ?? null,
        quote_rate: t.quote_rate ?? null,
        quote_term: t.quote_term ?? null,
        score: t.score ?? null,
        last_contact_at: t.lastContactDaysAgo
          ? subDays(now, t.lastContactDaysAgo).toISOString()
          : null,
      };
    });

    const { data: insertedLenders, error: lenderErr } = await supabase
      .from('deal_lenders')
      .insert(lenderRows as any)
      .select('id, name');

    if (lenderErr) {
      console.error('[demoDealFundingSources] deal_lenders insert failed', lenderErr);
      return;
    }

    // Attach a couple of follow-up tasks against the seeded lenders so the
    // Tasks tab isn't empty on a brand-new demo deal.
    const tasks = picked
      .map((_, i) => {
        const t = TEMPLATES[i];
        if (!t.task) return null;
        const lenderRow = insertedLenders?.[i];
        return {
          deal_id: dealId,
          company_id: DEMO_COMPANY_ID,
          user_id: userId,
          created_by: userId,
          title: `${t.task.title} — ${lenderRow?.name ?? ''}`.trim(),
          description: t.task.description ?? null,
          due_date: addDays(now, t.task.dueInDays).toISOString(),
          status: 'open',
          priority: t.task.priority ?? 'medium',
          lender_id: lenderRow?.id ?? null,
        };
      })
      .filter(Boolean) as any[];

    if (tasks.length) {
      const { error: taskErr } = await supabase.from('tasks').insert(tasks);
      if (taskErr) console.error('[demoDealFundingSources] tasks insert failed', taskErr);
    }

    // Activity log entry so the deal timeline shows the auto-seed.
    await supabase.from('activity_logs').insert({
      deal_id: dealId,
      user_id: userId,
      activity_type: 'lender_added',
      description: `Auto-added ${lenderRows.length} funding sources from the demo directory across various stages.`,
      user_display_name: 'Demo Access',
    } as any);
  } catch (err) {
    console.error('[demoDealFundingSources] unexpected error', err);
  }
}