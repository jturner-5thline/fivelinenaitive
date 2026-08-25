import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useOptionalSalesBdDateRange } from '@/contexts/SalesBdDateRangeContext';
import { partnerMatches } from '@/lib/partnerNameMatch';
import { useDealFirstActivityDates, filterByEffectiveDate } from '@/hooks/useDealFirstActivityDates';


export interface DealReferralSourceEntry {
  /** Canonical display name — the linked contact's name (or company name). */
  referredBy: string;
  /** Linked contact record id (contacts.id), when the source is a person. */
  contactId: string | null;
  /** Linked CRM company record id (crm_companies.id). */
  crmCompanyId: string | null;
  /** Number of deals referred */
  dealCount: number;
  /** Total dollar volume across referred deals */
  totalVolume: number;
  /** Most recent deal */
  latestDeal: {
    id: string;
    company: string;
    value: number;
    stage: string;
    status: string;
    created_at: string;
    pipelineName: string;
  };
  /** All deals referred by this source */
  deals: {
    id: string;
    company: string;
    value: number;
    stage: string;
    status: string;
    created_at: string;
    pipelineName: string;
    pipelineId: string;
  }[];
  /** Channel type from channel_entries if matched */
  channelType: string | null;
  /** Linked company name (from the linked CRM company record) */
  companyName: string | null;
  /** Owner (profiles.user_id) of the linked contact, when the source is a person. */
  ownerUserId: string | null;

  /** Computed tier (1|2|3) using sales_bd_rules thresholds, or null when no data */
  tier: 1 | 2 | 3 | null;
  /** Alternate channels seen (for tooltip) when the modal is mixed */
  alternateChannels: string[];
}

interface RawDealRow {
  id: string;
  company: string;
  value: number | null;
  stage: string;
  status: string;
  referred_by: string;
  referred_by_contact_id: string | null;
  referred_by_crm_company_id: string | null;
  sourced_via: string | null;
  created_at: string;
  pipeline_id: string;
}


interface AllDealRow {
  id: string;
  value: number | null;
  stage: string | null;
  referred_by: string | null;
  sourced_via: string | null;
  closing_date: string | null;
  created_at: string;
  company: string | null;
}

interface SalesBdRules {
  tier1_qualified_deals: number;
  tier1_trailing_months: number;
  tier1_signed_clients: number;
  tier2_qualified_deals_min: number;
  tier2_qualified_deals_max: number;
  tier2_trailing_months: number;
  tier2_deals_on_board: number;
  tier3_deals_per_quarter: number;
  qualified_deal_stages: string[];
}

const SIGNED_STAGE_SLUGS = new Set([
  'final-credit-items', 'closed-won', 'funded-invoiced', 'terms-issued', 'agreement-pending',
]);

function toSlug(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const FIRM_KEYWORDS = [
  'capital', 'bank', 'partners', 'group', 'advisors', 'advisory', 'ventures',
  'fund', 'finance', 'financial', 'lending', 'credit', 'holdings', 'asset',
  'investments', 'securities', 'wealth',
];

/** "Rob at SaaS Capital" → "SaaS Capital"; "Jamie @ Meriwether" → "Meriwether";
 *  "Nicole Gessl - Comerica Bank" → "Comerica Bank";
 *  "Cliff Sentelypress Growth Capital" → "Sentelypress Growth Capital"
 *  (heuristic: drop a leading single first-name token when remaining tokens
 *  include a firm keyword). Returns null when nothing recognisable is found. */
function parseFirmFromReferrer(raw: string): string | null {
  const sepMatch = raw.match(/\s*(?:@|\bat\b|\s-\s)\s*(.+)$/i);
  if (sepMatch) {
    const firm = sepMatch[1].trim();
    if (firm.length >= 2 && !/^\d/.test(firm)) return firm;
  }
  // Heuristic: "Firstname Firm Name with Keyword" — keep everything after the
  // first token if a firm keyword is present further along.
  const tokens = raw.trim().split(/\s+/);
  if (tokens.length >= 3) {
    const lower = tokens.map(t => t.toLowerCase().replace(/[^a-z]/g, ''));
    const kwIdx = lower.findIndex(t => FIRM_KEYWORDS.includes(t));
    if (kwIdx >= 2) {
      return tokens.slice(1, kwIdx + 1).join(' ');
    }
  }
  return null;
}

/** Map a deal.sourced_via string to one of the canonical channel labels used
 *  on the Channels chart. Returns null when the value is non-referral. */
function sourcedViaToChannel(sv: string | null | undefined): string | null {
  if (!sv) return null;
  const l = sv.toLowerCase();
  if (l.includes('bank')) return 'Banks';
  if (l.includes('lender')) return 'Lenders';
  if (l.includes('service provider')) return 'Service Providers';
  if (l.includes('investor') || l.includes('m&a') || l.includes('investment bank')) return 'M&A and Investment Bankers';
  if (l.includes('advisor')) return 'Advisors';
  if (l.includes('client') || l.includes('personal')) return 'Other';
  return null;
}

interface PipelineRow {
  id: string;
  name: string;
  is_default: boolean;
}

export function useDealReferralSources(filters?: {
  channelFilter?: string[];
  companyFilter?: string[];
  pipelineFilter?: 'all' | 'active' | 'in-development';
  /** Use all deal history. Intended for current pipeline-stage classification. */
  ignoreDateRange?: boolean;
}) {
  const { company } = useCompany();
  const dateCtx = useOptionalSalesBdDateRange();
  const rangeStart = filters?.ignoreDateRange ? null : dateCtx?.start ?? null;
  const rangeEnd = filters?.ignoreDateRange ? null : dateCtx?.end ?? null;
  const granularity = dateCtx?.range.granularity ?? null;

  const { data: pipelines = [] } = useQuery({
    queryKey: ['deal_referral_pipelines', company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_pipelines')
        .select('id, name, is_default')
        .eq('company_id', company!.id);
      if (error) throw error;
      return (data || []) as PipelineRow[];
    },
  });

  const { activePipelineIds, inDevPipelineIds } = useMemo(() => {
    const active: string[] = [];
    const inDev: string[] = [];
    for (const p of pipelines) {
      const lower = p.name.toLowerCase();
      if (lower.includes('in development') || lower.includes('in-development')) {
        inDev.push(p.id);
      } else if (p.is_default || lower.includes('active')) {
        active.push(p.id);
      }
    }
    return { activePipelineIds: active, inDevPipelineIds: inDev };
  }, [pipelines]);

  const targetPipelineIds = useMemo(() => {
    if (filters?.pipelineFilter === 'active') return activePipelineIds;
    if (filters?.pipelineFilter === 'in-development') return inDevPipelineIds;
    return [...activePipelineIds, ...inDevPipelineIds];
  }, [activePipelineIds, inDevPipelineIds, filters?.pipelineFilter]);

  const pipelineMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of pipelines) m.set(p.id, p.name);
    return m;
  }, [pipelines]);

  // Deals are fetched without a date filter — `created_at` is the CRM import
  // timestamp, not when the deal actually happened. We timebound below using
  // each deal's effective date (earliest stage-history event, else created_at).
  const { data: dealsRaw = [], isLoading: dealsLoading } = useQuery({
    queryKey: ['deal_referral_deals', company?.id, targetPipelineIds],
    enabled: !!company?.id && targetPipelineIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('id, company, value, stage, status, referred_by, referred_by_contact_id, referred_by_crm_company_id, sourced_via, created_at, pipeline_id')
        .eq('company_id', company!.id)
        .not('referred_by', 'is', null)
        .neq('referred_by', '')
        .in('pipeline_id', targetPipelineIds);
      if (error) throw error;
      return (data || []) as RawDealRow[];
    },
  });

  const rawDealIds = useMemo(() => dealsRaw.map(d => d.id).sort(), [dealsRaw]);

  // Earliest stage-history event per deal = the real "deal started" date.
  const { data: firstActivityByDeal = new Map<string, string>() } =
    useDealFirstActivityDates(rawDealIds);

  const deals = useMemo(
    () => filterByEffectiveDate(dealsRaw, firstActivityByDeal, rangeStart, rangeEnd),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dealsRaw, firstActivityByDeal, rangeStart, rangeEnd, granularity],
  );



  const { data: channelEntries = [] } = useQuery({
    queryKey: ['deal_referral_channel_entries', company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('channel_entries')
        .select(`
          id, channel_type,
          contact:contacts!channel_entries_contact_id_fkey(full_name),
          crm_company:crm_companies!channel_entries_crm_company_id_fkey(name)
        `)
        .eq('company_id', company!.id);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  // Manual overrides saved from the "Edit Referral Source" dialog. These win
  // over channel_entries / sourced_via inference for both channel and company.
  const { data: referralSourceRecords = [] } = useQuery({
    queryKey: ['referral_source_records', company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referral_sources')
        .select('id, name, company, channel, company_id')
        .or(`company_id.eq.${company!.id},company_id.is.null`);
      if (error) throw error;
      return (data || []) as any[];
    },
  });



  // Linked contact records for the referral sources on these deals. Referral
  // sources are STRICTLY real CRM records — a deal only counts as referred
  // when `referred_by_contact_id` / `referred_by_crm_company_id` resolves.
  const linkedContactIds = useMemo(
    () => Array.from(new Set(deals.map(d => d.referred_by_contact_id).filter(Boolean) as string[])).sort(),
    [deals],
  );
  const linkedCompanyIds = useMemo(
    () => Array.from(new Set(deals.map(d => d.referred_by_crm_company_id).filter(Boolean) as string[])).sort(),
    [deals],
  );

  const { data: linkedContacts = [] } = useQuery({
    // Keep the projection versioned: this query originally omitted
    // owner_user_id, so an existing React Query cache could keep every source
    // looking unassigned after the owner filter shipped.
    queryKey: ['deal_referral_linked_contacts', 'with-owner-v1', company?.id, linkedContactIds],
    enabled: !!company?.id && linkedContactIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, full_name, owner_user_id, crm_company_id, crm_company:crm_companies!contacts_crm_company_id_fkey(name)')
        .in('id', linkedContactIds);
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        full_name: string | null;
        owner_user_id: string | null;
        crm_company_id: string | null;
        crm_company: { name: string | null } | null;
      }>;

    },
  });

  const { data: linkedCompanies = [] } = useQuery({
    queryKey: ['deal_referral_linked_companies', company?.id, linkedCompanyIds],
    enabled: !!company?.id && linkedCompanyIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_companies')
        .select('id, name')
        .in('id', linkedCompanyIds);
      if (error) throw error;
      return (data || []) as Array<{ id: string; name: string | null }>;
    },
  });


  // All deals (any date) used purely to compute tier inputs against trailing
  // windows defined by sales_bd_rules. We intentionally don't filter by the
  // header range here — the trailing window is independent.
  const { data: allDeals = [] } = useQuery({
    queryKey: ['deal_referral_all_deals', company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('id, value, stage, referred_by, sourced_via, closing_date, created_at, company')
        .eq('company_id', company!.id)
        .not('referred_by', 'is', null)
        .neq('referred_by', '');
      if (error) throw error;
      return (data || []) as AllDealRow[];
    },
  });

  const { data: rules } = useQuery({
    queryKey: ['sales_bd_rules_global'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_bd_rules')
        .select('tier1_qualified_deals, tier1_trailing_months, tier1_signed_clients, tier2_qualified_deals_min, tier2_qualified_deals_max, tier2_trailing_months, tier2_deals_on_board, tier3_deals_per_quarter, qualified_deal_stages')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data || null) as SalesBdRules | null;
    },
    staleTime: 5 * 60 * 1000,
  });

  const referralSources = useMemo(() => {
    const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

    const contactById = new Map(linkedContacts.map(c => [c.id, c]));
    const companyById = new Map(linkedCompanies.map(c => [c.id, c]));

    // Group STRICTLY by linked CRM record (contact first, else company).
    // Deals whose referrer isn't linked to a real record are ignored.
    const grouped = new Map<string, {
      raw: string;
      contactId: string | null;
      crmCompanyId: string | null;
      deals: typeof deals;
    }>();
    for (const deal of deals) {
      const contact = deal.referred_by_contact_id ? contactById.get(deal.referred_by_contact_id) : undefined;
      const directCompany = deal.referred_by_crm_company_id ? companyById.get(deal.referred_by_crm_company_id) : undefined;
      if (!contact && !directCompany) continue;

      const key = contact ? `contact:${contact.id}` : `company:${directCompany!.id}`;
      const raw = (contact?.full_name?.trim() || directCompany?.name?.trim() || deal.referred_by);
      if (!grouped.has(key)) {
        grouped.set(key, {
          raw,
          contactId: contact?.id ?? null,
          crmCompanyId: contact?.crm_company_id ?? directCompany?.id ?? null,
          deals: [],
        });
      }
      grouped.get(key)!.deals.push(deal);
    }

    // Channel enrichment lookup
    const channelLookup = new Map<string, { channelType: string; companyName: string | null }>();
    for (const ce of channelEntries) {
      const contactName = ce.contact?.full_name;
      const companyName = ce.crm_company?.name;
      if (contactName) {
        channelLookup.set(normalize(contactName), { channelType: ce.channel_type, companyName });
      }
      if (companyName) {
        channelLookup.set(normalize(companyName), { channelType: ce.channel_type, companyName });
      }
    }

    // Manual overrides (referral_sources rows edited in "Edit Referral Source").
    // Keyed by both the source name and its saved company so the override
    // applies however the referrer appears on the deal.
    const overrideLookup = new Map<string, { channel: string | null; companyName: string | null }>();
    for (const rs of referralSourceRecords) {
      const value = { channel: rs.channel || null, companyName: rs.company || null };
      if (rs.name) {
        const k = normalize(rs.name);
        // Tenant-scoped rows win over global ones.
        if (!overrideLookup.has(k) || rs.company_id) overrideLookup.set(k, value);
      }
      if (rs.company) {
        const k = normalize(rs.company);
        if (!overrideLookup.has(k)) overrideLookup.set(k, value);
      }
    }



    // Contact-name → CRM company lookup, built from the linked contact records.
    const contactCompanyLookup = new Map<string, string>();
    for (const c of linkedContacts) {
      const name = c.full_name?.trim();
      const cname = c.crm_company?.name?.trim();
      if (name && cname) contactCompanyLookup.set(normalize(name), cname);
    }


    // Pre-compute tier-relevant windows once.
    const now = Date.now();
    const ms = (months: number) => months * 30 * 24 * 60 * 60 * 1000;
    const qualifiedSlugs = new Set((rules?.qualified_deal_stages || []).map(toSlug));
    const t1Months = rules?.tier1_trailing_months ?? 3;
    const t2Months = rules?.tier2_trailing_months ?? 3;
    const winT1 = now - ms(t1Months);
    const winT2 = now - ms(t2Months);
    const win12 = now - ms(12);

    const entries: DealReferralSourceEntry[] = [];
    for (const [, { raw, contactId, crmCompanyId, deals: groupDeals }] of grouped) {
      const nameKey = normalize(raw);
      const sorted = [...groupDeals].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const totalVolume = groupDeals.reduce((sum, d) => sum + Number(d.value || 0), 0);
      const latest = sorted[0];

      const match = channelLookup.get(nameKey);

      // === Derive company (linked CRM company record wins) ===
      const linkedCompanyName = crmCompanyId
        ? (companyById.get(crmCompanyId)?.name?.trim()
          || contactById.get(contactId ?? '')?.crm_company?.name?.trim()
          || null)
        : null;
      let derivedCompany: string | null = linkedCompanyName || match?.companyName || null;
      if (!derivedCompany) {
        derivedCompany = contactCompanyLookup.get(nameKey) || null;

        if (!derivedCompany) {
          // Referrer may be "Jane Doe @ Firm" or "Jane Doe - Firm"; try the
          // leading name part before the separator.
          const stripped = raw.split(/\s*(?:@|\bat\b|\s-\s)\s*/i)[0];
          if (stripped && stripped !== raw) {
            derivedCompany = contactCompanyLookup.get(normalize(stripped)) || null;
          }
        }
      }
      if (!derivedCompany) {
        derivedCompany = parseFirmFromReferrer(raw);
      }
      if (!derivedCompany) {
        // Modal deals.company across this referrer's deals
        const counts = new Map<string, number>();
        for (const d of groupDeals) {
          if (d.company) counts.set(d.company, (counts.get(d.company) || 0) + 1);
        }
        let best: string | null = null;
        let bestN = 0;
        for (const [c, n] of counts) {
          if (n > bestN) { best = c; bestN = n; }
        }
        // Only use modal company if it occurs in 2+ deals (otherwise it's just
        // "the one company they sourced", which is noisy).
        derivedCompany = bestN >= 2 ? best : null;
      }

      // Manual override for this referrer (by name, or by its resolved company).
      const override =
        overrideLookup.get(nameKey)
        || (derivedCompany ? overrideLookup.get(normalize(derivedCompany)) : undefined);
      if (override?.companyName) derivedCompany = override.companyName;

      // === Derive channel from modal sourced_via across this referrer's deals ===
      const channelCounts = new Map<string, number>();
      for (const d of groupDeals) {
        const c = sourcedViaToChannel((d as any).sourced_via ?? null);
        if (c) channelCounts.set(c, (channelCounts.get(c) || 0) + 1);
      }
      let modalChannel: string | null = override?.channel || match?.channelType || null;
      const alternateChannels: string[] = [];
      if (!modalChannel && channelCounts.size > 0) {
        const sortedC = [...channelCounts.entries()].sort((a, b) => b[1] - a[1]);
        modalChannel = sortedC[0][0];
        for (let i = 1; i < sortedC.length; i++) alternateChannels.push(sortedC[i][0]);
      }

      // === Compute tier from all-time deals matched by partnerMatches() ===
      let tier: 1 | 2 | 3 | null = null;
      if (rules) {
        const matched = allDeals.filter(d => partnerMatches(raw, d.referred_by) || partnerMatches(raw, d.sourced_via));
        const qualifiedT1 = matched.filter(d => d.stage && qualifiedSlugs.has(toSlug(d.stage)) && new Date(d.created_at).getTime() >= winT1).length;
        const qualifiedT2 = matched.filter(d => d.stage && qualifiedSlugs.has(toSlug(d.stage)) && new Date(d.created_at).getTime() >= winT2).length;
        const signedT1 = matched.filter(d => d.stage && SIGNED_STAGE_SLUGS.has(toSlug(d.stage)) && new Date(d.closing_date || d.created_at).getTime() >= winT1).length;
        const addedT2 = matched.filter(d => new Date(d.created_at).getTime() >= winT2).length;
        const addedT12 = matched.filter(d => new Date(d.created_at).getTime() >= win12).length;
        if (qualifiedT1 >= rules.tier1_qualified_deals || signedT1 >= rules.tier1_signed_clients) {
          tier = 1;
        } else if ((qualifiedT2 >= rules.tier2_qualified_deals_min && qualifiedT2 <= rules.tier2_qualified_deals_max) || addedT2 >= rules.tier2_deals_on_board) {
          tier = 2;
        } else if (addedT12 >= rules.tier3_deals_per_quarter * 4 || matched.length > 0) {
          tier = 3;
        }
      }

      entries.push({
        referredBy: raw,
        contactId,
        crmCompanyId,
        ownerUserId: contactId ? (contactById.get(contactId)?.owner_user_id ?? null) : null,

        dealCount: groupDeals.length,
        totalVolume,
        latestDeal: {
          id: latest.id,
          company: latest.company,
          value: Number(latest.value || 0),
          stage: latest.stage,
          status: latest.status,
          created_at: latest.created_at,
          pipelineName: pipelineMap.get(latest.pipeline_id) || 'Unknown',
        },
        deals: sorted.map(d => ({
          id: d.id,
          company: d.company,
          value: Number(d.value || 0),
          stage: d.stage,
          status: d.status,
          created_at: d.created_at,
          pipelineName: pipelineMap.get(d.pipeline_id) || 'Unknown',
          pipelineId: d.pipeline_id,
        })),
        channelType: modalChannel,
        companyName: derivedCompany,
        tier,
        alternateChannels,
      });
    }

    let filtered = entries;
    if (filters?.channelFilter?.length) {
      filtered = filtered.filter(e => e.channelType && filters.channelFilter!.includes(e.channelType));
    }
    if (filters?.companyFilter?.length) {
      filtered = filtered.filter(e => e.companyName && filters.companyFilter!.includes(e.companyName));
    }

    // Sort by total volume desc
    filtered.sort((a, b) => b.totalVolume - a.totalVolume);

    return filtered;
  }, [deals, channelEntries, referralSourceRecords, linkedContacts, linkedCompanies, pipelineMap, filters?.channelFilter, filters?.companyFilter, allDeals, rules]);

  // Unique companies for filter options
  const companyOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of referralSources) {
      if (r.companyName) set.add(r.companyName);
    }
    return Array.from(set).sort().map(c => ({ value: c, label: c }));
  }, [referralSources]);

  // Deals whose referrer text isn't linked to a CRM contact/company — these
  // are excluded from the referral source list entirely.
  const unlinkedDealCount = useMemo(
    () => deals.filter(d => !d.referred_by_contact_id && !d.referred_by_crm_company_id).length,
    [deals],
  );

  return {
    referralSources,
    isLoading: dealsLoading,
    totalCount: referralSources.length,
    totalVolume: referralSources.reduce((s, r) => s + r.totalVolume, 0),
    totalDeals: referralSources.reduce((s, r) => s + r.dealCount, 0),
    companyOptions,
    unlinkedDealCount,
  };
}
