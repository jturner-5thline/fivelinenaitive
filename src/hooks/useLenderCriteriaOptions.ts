import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LenderCriteriaOptions {
  sponsorship: string[];
  cashBurn: string[];
  subDebt: string[];
  refinancing: string[];
  b2bB2c: string[];
  nda: string[];
}

const EMPTY: LenderCriteriaOptions = {
  sponsorship: [],
  cashBurn: [],
  subDebt: [],
  refinancing: [],
  b2bB2c: [],
  nda: [],
};

// Mirrors the normalization used by LenderFilters so edit dropdowns and
// filter dropdowns always offer the same option set.
function normalizeSponsorship(v: string) {
  const t = v.trim();
  if (/^not\s*required$/i.test(t)) return 'No';
  if (/^required$/i.test(t)) return 'Yes';
  return t;
}

function normalizeCashBurn(v: string) {
  const t = v.trim();
  if (/^ok\b/i.test(t)) return 'Yes';
  if (/case\s*[-\s]?by\s*[-\s]?case/i.test(t)) return 'Yes';
  return t;
}

function collect(
  rows: Array<Record<string, unknown>>,
  key: string,
  normalize: (v: string) => string = (v) => v.trim(),
): string[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const raw = row[key];
    if (typeof raw !== 'string') continue;
    const value = normalize(raw);
    if (!value) continue;
    const dedupeKey = value.toLowerCase();
    if (!seen.has(dedupeKey)) seen.set(dedupeKey, value);
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

export function useLenderCriteriaOptions() {
  const { data } = useQuery({
    queryKey: ['lender-criteria-options'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<LenderCriteriaOptions> => {
      const { data, error } = await supabase
        .from('master_lenders')
        .select('sponsorship, cash_burn, sub_debt, refinancing, b2b_b2c, nda');
      if (error || !data) return EMPTY;
      const rows = data as unknown as Array<Record<string, unknown>>;
      return {
        sponsorship: collect(rows, 'sponsorship', normalizeSponsorship),
        cashBurn: collect(rows, 'cash_burn', normalizeCashBurn),
        subDebt: collect(rows, 'sub_debt'),
        refinancing: collect(rows, 'refinancing'),
        b2bB2c: collect(rows, 'b2b_b2c'),
        nda: collect(rows, 'nda'),
      };
    },
  });

  return data ?? EMPTY;
}
