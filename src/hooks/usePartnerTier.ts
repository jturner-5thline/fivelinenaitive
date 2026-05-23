import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { usePartnerRules, DEFAULT_PARTNER_RULES } from '@/hooks/usePartnerRules';
import { filterDealsForPartner } from '@/lib/partnerNameMatch';

const SIGNED_STAGES = ['final-credit-items', 'closed-won', 'funded-invoiced', 'terms-issued', 'agreement-pending'];

export type AutoTier = 1 | 2 | 3 | 4;

export interface PartnerTierInfo {
  tier: AutoTier;
  manualOverride: boolean;
  overrideReason?: string;
  overrideBy?: string;
  overrideAt?: string;
  // raw computed
  qualifiedTrailing3mo: number;
  signedTrailing3mo: number;
  addedToBoardTrailing3mo: number;
  addedToBoardTrailing12mo: number;
  totalDeals: number;
  daysSinceAdded: number;
  daysUntilRemovalEligible: number | null; // null if not tier 4
  removalWarning: '60d' | '30d' | 'eligible' | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function usePartnerTier(partner: {
  id: string;
  name?: string | null;
  created_at: string;
  metadata?: Record<string, any> | null;
} | null) {
  const { company } = useCompany();
  const { data: rules } = usePartnerRules();
  const qualifiedStages =
    (rules?.tiers.qualifiedDealStages) || DEFAULT_PARTNER_RULES.tiers.qualifiedDealStages;
  const tier4Months = rules?.tiers.tier4.monthsBeforeRemoval ?? DEFAULT_PARTNER_RULES.tiers.tier4.monthsBeforeRemoval;
  const t1 = rules?.tiers.tier1 || DEFAULT_PARTNER_RULES.tiers.tier1;
  const t2 = rules?.tiers.tier2 || DEFAULT_PARTNER_RULES.tiers.tier2;
  const t3 = rules?.tiers.tier3 || DEFAULT_PARTNER_RULES.tiers.tier3;

  return useQuery({
    queryKey: ['partner_tier', company?.id, partner?.id, qualifiedStages, tier4Months, t1, t2, t3],
    enabled: !!company?.id && !!partner?.id && !!partner?.name,
    queryFn: async (): Promise<PartnerTierInfo> => {
      const name = (partner!.name || '').toLowerCase().trim();
      const now = Date.now();
      const winT1 = new Date(now - t1.trailingMonths * 30 * MS_PER_DAY).toISOString();
      const winT2 = new Date(now - t2.trailingMonths * 30 * MS_PER_DAY).toISOString();
      const win12 = new Date(now - 12 * 30 * MS_PER_DAY).toISOString();
      const win3 = new Date(now - 3 * 30 * MS_PER_DAY).toISOString();

      // Pull all deals for the company that have a referral source set, then
      // match client-side. The previous `.or(referred_by.ilike.${name},...)`
      // required an EXACT case-insensitive match (no wildcards), so partner
      // names like "Dorian Meza @ Truist Bank" never matched referred_by
      // values like "Dorian Meza" → every partner collapsed to Tier 4 / 3.
      const { data: deals } = await supabase
        .from('deals')
        .select('id, stage, referred_by, sourced_via, created_at, closing_date')
        .eq('company_id', company!.id)
        .or('referred_by.not.is.null,sourced_via.not.is.null');

      const rows = filterDealsForPartner(
        (deals || []) as Array<{
          stage: string | null;
          referred_by: string | null;
          sourced_via: string | null;
          created_at: string;
          closing_date: string | null;
        }>,
        partner!.name || '',
      );

      const qualifiedTrailingT1 = rows.filter(
        d => d.stage && qualifiedStages.includes(d.stage) && d.created_at >= winT1,
      ).length;
      const qualifiedTrailingT2 = rows.filter(
        d => d.stage && qualifiedStages.includes(d.stage) && d.created_at >= winT2,
      ).length;
      const signedTrailingT1 = rows.filter(
        d => d.stage && SIGNED_STAGES.includes(d.stage) &&
          (d.closing_date || d.created_at) >= winT1,
      ).length;
      const addedToBoardTrailingT2 = rows.filter(d => d.created_at >= winT2).length;
      const qualifiedTrailing3mo = qualifiedTrailingT1;
      const signedTrailing3mo = signedTrailingT1;
      const addedToBoardTrailing3mo = rows.filter(d => d.created_at >= win3).length;
      const addedToBoardTrailing12mo = rows.filter(d => d.created_at >= win12).length;
      const totalDeals = rows.length;

      // Manual override wins
      const meta = (partner!.metadata || {}) as Record<string, any>;
      const override = meta.tierOverride as
        | { tier: AutoTier; reason?: string; by?: string; at?: string }
        | undefined;

      let tier: AutoTier;
      if (override && [1, 2, 3, 4].includes(Number(override.tier))) {
        tier = Number(override.tier) as AutoTier;
      } else if (
        // Tier 1: qualifiedDeals threshold in trailingMonths OR signedClients threshold
        qualifiedTrailingT1 >= t1.qualifiedDeals ||
        signedTrailingT1 >= t1.signedClients
      ) {
        tier = 1;
      } else if (
        // Tier 2: qualified within [min..max] in trailingMonths OR dealsOnBoard threshold
        (qualifiedTrailingT2 >= t2.qualifiedDealsMin && qualifiedTrailingT2 <= t2.qualifiedDealsMax) ||
        addedToBoardTrailingT2 >= t2.dealsOnBoard
      ) {
        tier = 2;
      } else if (addedToBoardTrailing12mo >= (t3.dealsPerQuarter * 4)) {
        tier = 3;
      } else if (totalDeals === 0) {
        tier = 4;
      } else {
        tier = 3;
      }

      const daysSinceAdded = Math.max(
        0,
        Math.floor((now - new Date(partner!.created_at).getTime()) / MS_PER_DAY),
      );
      const cutoffDays = tier4Months * 30;
      let daysUntilRemovalEligible: number | null = null;
      let removalWarning: PartnerTierInfo['removalWarning'] = null;
      if (tier === 4) {
        daysUntilRemovalEligible = cutoffDays - daysSinceAdded;
        if (daysUntilRemovalEligible <= 0) removalWarning = 'eligible';
        else if (daysUntilRemovalEligible <= 30) removalWarning = '30d';
        else if (daysUntilRemovalEligible <= 60) removalWarning = '60d';
      }

      return {
        tier,
        manualOverride: !!override,
        overrideReason: override?.reason,
        overrideBy: override?.by,
        overrideAt: override?.at,
        qualifiedTrailing3mo,
        signedTrailing3mo,
        addedToBoardTrailing3mo,
        addedToBoardTrailing12mo,
        totalDeals,
        daysSinceAdded,
        daysUntilRemovalEligible,
        removalWarning,
      };
    },
    staleTime: 60_000,
  });
}

export const PARTNER_TIER_OVERRIDE_EMAILS = ['jturner@5thline.co', 'jmoffitt@5thline.co'];