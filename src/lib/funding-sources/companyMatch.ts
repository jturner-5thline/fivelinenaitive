import { supabase } from '@/integrations/supabase/client';
import { diceCoefficient } from '@/utils/stringSimilarity';

export interface CompanyCandidate {
  id: string;
  name: string;
  domain: string | null;
  website_url: string | null;
  score: number;
  reason: string;
}

const NOISE_WORDS = [
  'capital', 'partners', 'partner', 'group', 'holdings', 'holding', 'ventures', 'venture',
  'finance', 'financial', 'financing', 'credit', 'bank', 'banking', 'fund', 'funds', 'funding',
  'management', 'advisors', 'advisers', 'advisory', 'lending', 'lenders', 'lender', 'investments',
  'investment', 'llc', 'lp', 'llp', 'inc', 'incorporated', 'corp', 'corporation', 'co', 'company', 'plc', 'ltd',
];

/** Strip legal/finance filler so "Eastward Capital Partners" ≈ "EI Eastward Capital". */
export function normalizeCompanyName(raw: string): string {
  const base = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = base.split(' ').filter(t => t && !NOISE_WORDS.includes(t));
  return (tokens.length ? tokens : base.split(' ')).join(' ').trim();
}

export function extractDomain(input?: string | null): string | null {
  if (!input) return null;
  let v = input.trim().toLowerCase();
  if (!v) return null;
  v = v.replace(/^https?:\/\//, '').replace(/^www\./, '');
  v = v.split('/')[0].split('?')[0].split('@').pop() || v;
  if (!v.includes('.')) return null;
  return v;
}

/**
 * Find CRM companies that likely already represent this funding source.
 * Matches on domain first (exact = highest confidence), then fuzzy name.
 */
export async function findCompanyMatches(
  name: string,
  website?: string | null,
  extraEmail?: string | null,
): Promise<CompanyCandidate[]> {
  const domain = extractDomain(website) || extractDomain(extraEmail);
  const norm = normalizeCompanyName(name);
  const firstToken = norm.split(' ')[0] || name;

  const [byDomain, byName] = await Promise.all([
    domain
      ? supabase
          .from('crm_companies')
          .select('id,name,domain,website_url')
          .or(`domain.ilike.%${domain}%,domain_normalized.ilike.%${domain}%,website_url.ilike.%${domain}%`)
          .limit(10)
      : Promise.resolve({ data: [], error: null } as any),
    supabase
      .from('crm_companies')
      .select('id,name,domain,website_url')
      .ilike('name', `%${firstToken}%`)
      .limit(25),
  ]);

  const seen = new Map<string, CompanyCandidate>();

  for (const row of (byDomain.data ?? []) as any[]) {
    seen.set(row.id, {
      id: row.id,
      name: row.name,
      domain: row.domain ?? null,
      website_url: row.website_url ?? null,
      score: 1,
      reason: `Same domain (${domain})`,
    });
  }

  for (const row of (byName.data ?? []) as any[]) {
    if (seen.has(row.id)) continue;
    const score = diceCoefficient(norm, normalizeCompanyName(row.name));
    if (score >= 0.55) {
      seen.set(row.id, {
        id: row.id,
        name: row.name,
        domain: row.domain ?? null,
        website_url: row.website_url ?? null,
        score,
        reason: `Similar name (${Math.round(score * 100)}% match)`,
      });
    }
  }

  return Array.from(seen.values()).sort((a, b) => b.score - a.score).slice(0, 6);
}
