import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';

export const PARTNER_RULES_EDITOR_EMAILS = ['jturner@5thline.co', 'jmoffitt@5thline.co'];

export interface TierDefinitions {
  tier1: { qualifiedDeals: number; trailingMonths: number; signedClients: number };
  tier2: { qualifiedDealsMin: number; qualifiedDealsMax: number; trailingMonths: number; dealsOnBoard: number };
  tier3: { dealsPerQuarter: number };
  tier4: { monthsBeforeRemoval: number };
  qualifiedDealStages: string[]; // deal.stage ids that count as "qualified"
}

export interface StageCriteria {
  trial: { labels: { fit: string; responsiveness: string; engagement: string; contribution: string } };
  activePartner: {
    referralToProposalThreshold: number; referralToProposalMonths: number;
    signedClientThreshold: number; signedClientMonths: number;
    referredRevenueThreshold: number; referredRevenueMonths: number;
    publicPartnershipRequired: boolean;
  };
}

export interface PartnerRules {
  tiers: TierDefinitions;
  stages: StageCriteria;
}

export const DEFAULT_PARTNER_RULES: PartnerRules = {
  tiers: {
    // Apr 10, 2026 Partnerships Channel Review spec
    tier1: { qualifiedDeals: 3, trailingMonths: 3, signedClients: 1 },
    tier2: { qualifiedDealsMin: 2, qualifiedDealsMax: 3, trailingMonths: 3, dealsOnBoard: 4 },
    tier3: { dealsPerQuarter: 1 },
    tier4: { monthsBeforeRemoval: 6 },
    // Qualified Deal = "Proposal Issued stage or greater" in Active or FinServ pipelines
    qualifiedDealStages: [
      'proposal-issued',
      'agreement-pending',
      'final-credit-items',
      'client-strategy-review',
      'write-up-pending',
      'submitted-to-lenders',
      'lenders-in-review',
      'terms-issued',
      'in-due-diligence',
      'funded-invoiced',
      'closed-won',
    ],
  },
  stages: {
    trial: {
      labels: { fit: 'Fit', responsiveness: 'Responsiveness', engagement: 'Engagement', contribution: 'Contribution Potential' },
    },
    activePartner: {
      referralToProposalThreshold: 3, referralToProposalMonths: 3,
      signedClientThreshold: 1, signedClientMonths: 3,
      referredRevenueThreshold: 100_000, referredRevenueMonths: 12,
      publicPartnershipRequired: true,
    },
  },
};

function mergeRules(stored: any): PartnerRules {
  const s = stored || {};
  return {
    tiers: { ...DEFAULT_PARTNER_RULES.tiers, ...(s.tiers || {}),
      tier1: { ...DEFAULT_PARTNER_RULES.tiers.tier1, ...(s.tiers?.tier1 || {}) },
      tier2: { ...DEFAULT_PARTNER_RULES.tiers.tier2, ...(s.tiers?.tier2 || {}) },
      tier3: { ...DEFAULT_PARTNER_RULES.tiers.tier3, ...(s.tiers?.tier3 || {}) },
      tier4: { ...DEFAULT_PARTNER_RULES.tiers.tier4, ...(s.tiers?.tier4 || {}) },
      qualifiedDealStages: s.tiers?.qualifiedDealStages || DEFAULT_PARTNER_RULES.tiers.qualifiedDealStages,
    },
    stages: {
      trial: { labels: { ...DEFAULT_PARTNER_RULES.stages.trial.labels, ...(s.stages?.trial?.labels || {}) } },
      activePartner: { ...DEFAULT_PARTNER_RULES.stages.activePartner, ...(s.stages?.activePartner || {}) },
    },
  };
}

export function useCanEditPartnerRules() {
  const { user } = useAuth();
  const email = (user?.email || '').toLowerCase();
  return PARTNER_RULES_EDITOR_EMAILS.includes(email);
}

export function usePartnerRules() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['partner_pipeline_rules', company?.id],
    enabled: !!company?.id,
    queryFn: async (): Promise<PartnerRules> => {
      const { data } = await supabase
        .from('partner_pipeline_rules' as any)
        .select('rules')
        .eq('company_id', company!.id)
        .maybeSingle();
      return mergeRules((data as any)?.rules);
    },
    staleTime: 60_000,
  });
}

export function useSavePartnerRules() {
  const { company } = useCompany();
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ next, summary }: { next: PartnerRules; summary: string }) => {
      if (!company?.id) throw new Error('No company');
      const { data: prev } = await supabase
        .from('partner_pipeline_rules' as any)
        .select('rules')
        .eq('company_id', company.id)
        .maybeSingle();
      const prevRules = (prev as any)?.rules ?? null;
      const { error: upErr } = await supabase
        .from('partner_pipeline_rules' as any)
        .upsert({ company_id: company.id, rules: next as any, updated_by: user?.id ?? null }, { onConflict: 'company_id' });
      if (upErr) throw upErr;
      const { error: auErr } = await supabase
        .from('partner_pipeline_rules_audit' as any)
        .insert({
          company_id: company.id,
          changed_by: user?.id ?? null,
          changed_by_email: user?.email ?? null,
          prev_rules: prevRules,
          new_rules: next as any,
          summary,
        });
      if (auErr) throw auErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partner_pipeline_rules'] });
      qc.invalidateQueries({ queryKey: ['partner_pipeline_rules_audit'] });
      qc.invalidateQueries({ queryKey: ['partner_promotion_criteria'] });
      // Force every PartnerTierBadge on the Sales & BD pipeline to recompute
      // against the freshly-saved thresholds (queryKey already embeds rules,
      // but invalidating drops stale cache immediately).
      qc.invalidateQueries({ queryKey: ['partner_tier'] });
      toast.success('Rules updated');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to update rules'),
  });
}

export function usePartnerRulesAudit() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['partner_pipeline_rules_audit', company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('partner_pipeline_rules_audit' as any)
        .select('id, changed_at, changed_by_email, summary')
        .eq('company_id', company!.id)
        .order('changed_at', { ascending: false })
        .limit(50);
      return ((data as unknown) || []) as Array<{ id: string; changed_at: string; changed_by_email: string | null; summary: string | null }>;
    },
  });
}

export interface ChannelType {
  id: string;
  company_id: string;
  name: string;
  description: string;
  sort_order: number;
}

export function useChannelTypes() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['partner_channel_types', company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('partner_channel_types' as any)
        .select('*')
        .eq('company_id', company!.id)
        .order('sort_order');
      return (data || []) as unknown as ChannelType[];
    },
  });
}

export function useMutateChannelType() {
  const { company } = useCompany();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['partner_channel_types'] });
  return {
    upsert: useMutation({
      mutationFn: async (row: Partial<ChannelType> & { name: string }) => {
        if (!company?.id) throw new Error('No company');
        const payload = {
          id: row.id || undefined,
          company_id: company.id,
          name: row.name,
          description: row.description ?? '',
          sort_order: row.sort_order ?? 0,
        };
        const { error } = await supabase.from('partner_channel_types' as any).upsert(payload);
        if (error) throw error;
      },
      onSuccess: () => { invalidate(); toast.success('Channel type saved'); },
      onError: (e: any) => toast.error(e.message || 'Save failed'),
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase.from('partner_channel_types' as any).delete().eq('id', id);
        if (error) throw error;
      },
      onSuccess: () => { invalidate(); toast.success('Channel type removed'); },
      onError: (e: any) => toast.error(e.message || 'Delete failed'),
    }),
  };
}
