import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isExcludedDealName } from "@/utils/excludedDeals";
import { isActiveDeal } from "@/lib/deals";
import {
  fiscalBucketFromDate,
  bucketMatches,
  currentFiscalYear,
  currentFiscalQuarter,
  type FiscalBucket,
} from "@/lib/fiscalQuarter";

export type RepScorecardPeriod = 1 | 2 | 3 | 4 | "year";

export interface RepScorecardFilter {
  /** auth.users.id of the rep to score. Empty string => no filter (all reps). */
  userId: string | null;
  fiscalYear: number;
  period: RepScorecardPeriod;
  /** When true, exclude lost/inactive deals from Pipeline Production rows. */
  activeOnly: boolean;
}

export interface RepScorecardRow {
  key: string;
  label: string;
  /** Underlying time-anchor column used for bucketing this metric. */
  anchor: string;
  count: number;
  dollars: number;
}

export interface RepScorecardResult {
  rows: RepScorecardRow[];
  orphanDealCount: number;
  /** Total deals considered before period bucketing, after exclusions. */
  totalDeals: number;
  /** Reps with at least one owner-resolved deal, for the dropdown. */
  reps: { user_id: string; display_name: string }[];
}

interface DealRow {
  id: string;
  company: string | null;
  value: number | null;
  stage: string | null;
  status: string | null;
  deal_owner: string | null;
  manager: string | null;
  deal_owner_user_id: string | null;
  created_at: string | null;
  proposal_issued_at: string | null;
  terms_issued_at: string | null;
  terms_signed_at: string | null;
  closed_at: string | null;
  lost_at: string | null;
}

interface ProfileRow {
  user_id: string;
  display_name: string | null;
  full_name: string | null;
}

/**
 * Returns true when a deal should be attributed to `userId` for scorecard
 * purposes. Prefers the explicit FK; falls back to a case-insensitive match
 * on the legacy free-text owner/manager fields against the profile's
 * display_name / full_name so the scorecard works before the Phase 4
 * owner backfill runs.
 */
function dealBelongsToRep(
  deal: DealRow,
  userId: string,
  profileByUserId: Map<string, ProfileRow>,
): boolean {
  if (deal.deal_owner_user_id === userId) return true;
  const profile = profileByUserId.get(userId);
  if (!profile) return false;
  const candidates = [profile.display_name, profile.full_name]
    .filter((s): s is string => !!s && s.trim().length > 0)
    .map(s => s.trim().toLowerCase());
  if (candidates.length === 0) return false;
  const ownerText = (deal.deal_owner ?? "").trim().toLowerCase();
  const managerText = (deal.manager ?? "").trim().toLowerCase();
  return candidates.some(c => c === ownerText || c === managerText);
}

function dollars(deals: DealRow[]): number {
  return deals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
}

function bucketOf(ts: string | null): FiscalBucket | null {
  return fiscalBucketFromDate(ts);
}

export function useRepScorecard(filter: RepScorecardFilter) {
  return useQuery<RepScorecardResult>({
    queryKey: ["rep-scorecard", filter],
    queryFn: async () => {
      const [{ data: dealsData, error: dealsErr }, { data: profilesData, error: profilesErr }] =
        await Promise.all([
          supabase
            .from("deals")
            .select(
              "id, company, value, stage, status, deal_owner, manager, deal_owner_user_id, created_at, proposal_issued_at, terms_issued_at, terms_signed_at, closed_at, lost_at",
            )
            .limit(5000),
          supabase.from("profiles").select("user_id, display_name, full_name"),
        ]);
      if (dealsErr) throw dealsErr;
      if (profilesErr) throw profilesErr;

      const allDeals = ((dealsData ?? []) as DealRow[]).filter(
        d => !isExcludedDealName(d.company),
      );
      const profiles = (profilesData ?? []) as ProfileRow[];
      const profileByUserId = new Map(profiles.map(p => [p.user_id, p]));

      // Reps offered in the dropdown: any profile that has at least one
      // matchable deal (either FK or free-text match).
      const repsWithDeals = new Set<string>();
      for (const d of allDeals) {
        if (d.deal_owner_user_id) repsWithDeals.add(d.deal_owner_user_id);
        for (const p of profiles) {
          if (dealBelongsToRep(d, p.user_id, profileByUserId)) {
            repsWithDeals.add(p.user_id);
          }
        }
      }
      const reps = profiles
        .filter(p => repsWithDeals.has(p.user_id))
        .map(p => ({
          user_id: p.user_id,
          display_name: p.display_name || p.full_name || "(unnamed)",
        }))
        .sort((a, b) => a.display_name.localeCompare(b.display_name));

      // Orphan = milestone-anchored deal with no resolved owner (neither FK
      // nor any free-text match). Kept narrow so the banner is actionable.
      const orphanDealCount = allDeals.filter(d => {
        const hasMilestoneAnchor = !!(
          d.proposal_issued_at ||
          d.terms_issued_at ||
          d.terms_signed_at ||
          d.closed_at ||
          d.lost_at
        );
        if (!hasMilestoneAnchor) return false;
        if (d.deal_owner_user_id) return false;
        // Try every profile for a free-text match.
        for (const p of profiles) {
          if (dealBelongsToRep(d, p.user_id, profileByUserId)) return false;
        }
        return true;
      }).length;

      // Scope to the selected rep (or empty result if none picked).
      const repDeals = filter.userId
        ? allDeals.filter(d => dealBelongsToRep(d, filter.userId!, profileByUserId))
        : [];

      const inPeriod = (ts: string | null) =>
        bucketMatches(bucketOf(ts), { fiscalYear: filter.fiscalYear, fiscalQuarter: filter.period });

      // Pipeline Production rows aggregate over ALL owned deals in the period
      // (regardless of current status) unless Active-only is on.
      const ownedInPeriod = repDeals.filter(d => inPeriod(d.created_at));
      const ownedActiveInPeriod = ownedInPeriod.filter(d => isActiveDeal(d as any));
      const productionScope = filter.activeOnly ? ownedActiveInPeriod : ownedInPeriod;

      const proposalsIssued = repDeals.filter(d => inPeriod(d.proposal_issued_at));
      const termsIssued     = repDeals.filter(d => inPeriod(d.terms_issued_at));
      const termsSigned     = repDeals.filter(d => inPeriod(d.terms_signed_at));
      const dealsClosed     = repDeals.filter(d => inPeriod(d.closed_at));
      const dealsLost       = repDeals.filter(d => inPeriod(d.lost_at));

      const rows: RepScorecardRow[] = [
        { key: "deals_on_board",    label: "Deals on Board",     anchor: "created_at + owner",        count: productionScope.length,    dollars: dollars(productionScope) },
        { key: "dollars_on_board",  label: "Dollars on Board",   anchor: "created_at + owner",        count: productionScope.length,    dollars: dollars(productionScope) },
        { key: "proposals_issued",  label: "Proposals Issued",   anchor: "proposal_issued_at",        count: proposalsIssued.length,    dollars: dollars(proposalsIssued) },
        { key: "terms_issued",      label: "Terms Issued",       anchor: "terms_issued_at",           count: termsIssued.length,        dollars: dollars(termsIssued) },
        { key: "terms_signed",      label: "Terms Signed",       anchor: "terms_signed_at",           count: termsSigned.length,        dollars: dollars(termsSigned) },
        { key: "deals_closed",      label: "Deals Closed",       anchor: "closed_at",                 count: dealsClosed.length,        dollars: dollars(dealsClosed) },
        { key: "lost_deals",        label: "Lost Deals",         anchor: "lost_at",                   count: dealsLost.length,          dollars: dollars(dealsLost) },
      ];

      return {
        rows,
        orphanDealCount,
        totalDeals: repDeals.length,
        reps,
      };
    },
    staleTime: 60_000,
  });
}

export function defaultRepScorecardFilter(userId: string | null): RepScorecardFilter {
  return {
    userId,
    fiscalYear: currentFiscalYear(),
    period: currentFiscalQuarter(),
    activeOnly: false,
  };
}