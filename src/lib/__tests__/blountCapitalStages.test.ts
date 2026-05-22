import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const BLOUNT_CAPITAL_ID = 'c4753066-0da9-4d87-8858-7eb1adecd173';

const EXPECTED_LABELS = [
  'Prospect - Unqualified',
  'Prospect - Qualified / Intake',
  'Initial Client Meeting',
  'Internal Qualification Meeting',
  'Initial Lender Review',
  'Agreement Proposal Meeting',
  'Kickoff + Data Room',
  'Internal Lender Strategy + Pool Build',
  'Lender Diligence',
  'Term Sheet Review',
  'Final Diligence',
  'Closing Documentation',
  'Closed Won',
  'Closed Lost',
  'On Hold',
  'Passed',
];

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

describe('Blount Capital deal stages', () => {
  // Integration test — requires live Supabase env. Skip locally if absent.
  const maybe = SUPABASE_URL && SUPABASE_KEY ? it : it.skip;

  maybe('returns the exact ordered 16-stage label list', async () => {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!);
    const { data, error } = await supabase
      .from('deal_pipelines')
      .select('stages')
      .eq('company_id', BLOUNT_CAPITAL_ID)
      .eq('is_default', true)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeTruthy();
    const labels = (data!.stages as Array<{ label: string }>).map(s => s.label);
    expect(labels).toEqual(EXPECTED_LABELS);
  });
});