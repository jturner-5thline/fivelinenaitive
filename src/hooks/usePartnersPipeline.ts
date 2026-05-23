import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';

export interface PipelineStage {
  id: string;
  company_id: string;
  name: string;
  definition: string;
  color: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Partner {
  id: string;
  company_id: string;
  name: string;
  firm_type: string;
  stage_id: string | null;
  owner_id: string | null;
  sort_order_in_stage: number;
  notes: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

const DEFAULT_STAGES = [
  { name: 'Identified', color: '#6b7280', definition: 'Potential partner sourced, no outreach yet', sort_order: 0 },
  { name: 'Contacted', color: '#3b82f6', definition: 'Initial outreach made, awaiting response', sort_order: 1 },
  { name: 'In Discussion', color: '#f59e0b', definition: 'Active conversations, exploring mutual fit', sort_order: 2 },
  { name: 'Agreement', color: '#8b5cf6', definition: 'Terms or NDA being negotiated/finalized', sort_order: 3 },
  { name: 'Active Partner', color: '#10b981', definition: 'Fully onboarded, actively co-selling or referring', sort_order: 4 },
  { name: 'Dormant', color: '#ef4444', definition: 'Previously active, needs re-engagement', sort_order: 5 },
];

export function usePipelineStages() {
  const { company } = useCompany();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['partner_pipeline_stages', company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('partner_pipeline_stages' as any)
        .select('*')
        .eq('company_id', company!.id)
        .order('sort_order');
      if (error) throw error;
      const stages = (data || []) as unknown as PipelineStage[];

      // Seed defaults if empty
      if (stages.length === 0 && company?.id) {
        const toInsert = DEFAULT_STAGES.map(s => ({ ...s, company_id: company.id }));
        const { data: seeded, error: seedErr } = await supabase
          .from('partner_pipeline_stages' as any)
          .insert(toInsert)
          .select('*');
        if (seedErr) throw seedErr;
        return (seeded || []) as unknown as PipelineStage[];
      }
      return stages;
    },
  });
}

export function useSavePipelineStages() {
  const { company } = useCompany();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (stages: Omit<PipelineStage, 'created_at' | 'updated_at'>[]) => {
      if (!company?.id) throw new Error('No company');

      // Delete existing stages not in the new set
      const existingIds = stages.filter(s => s.id).map(s => s.id);
      if (existingIds.length > 0) {
        await supabase
          .from('partner_pipeline_stages' as any)
          .delete()
          .eq('company_id', company.id)
          .not('id', 'in', `(${existingIds.join(',')})`);
      } else {
        await supabase
          .from('partner_pipeline_stages' as any)
          .delete()
          .eq('company_id', company.id);
      }

      // Upsert all stages
      const toUpsert = stages.map((s, i) => ({
        id: s.id || undefined,
        company_id: company.id,
        name: s.name,
        definition: s.definition || '',
        color: s.color || '#3b82f6',
        sort_order: i,
      }));

      const { data, error } = await supabase
        .from('partner_pipeline_stages' as any)
        .upsert(toUpsert)
        .select('*');
      if (error) throw error;
      return data as unknown as PipelineStage[];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partner_pipeline_stages'] });
      toast.success('Pipeline stages saved');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function usePartners(filters?: {
  start?: Date | null;
  end?: Date | null;
  granularity?: string;
}) {
  const { company } = useCompany();

  return useQuery({
    queryKey: [
      'partners',
      company?.id,
      filters?.start?.toISOString() ?? null,
      filters?.end?.toISOString() ?? null,
      filters?.granularity ?? null,
    ],
    enabled: !!company?.id,
    queryFn: async () => {
      let query = supabase
        .from('partners' as any)
        .select('*')
        .eq('company_id', company!.id);

      if (filters?.start) query = query.gte('created_at', filters.start.toISOString());
      if (filters?.end) query = query.lte('created_at', filters.end.toISOString());

      const { data, error } = await query.order('sort_order_in_stage');
      if (error) throw error;
      return (data || []) as unknown as Partner[];
    },
  });
}

export function useCreatePartner() {
  const { company } = useCompany();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (partner: { name: string; firm_type: string; stage_id: string | null; owner_id: string | null; notes: string }) => {
      if (!company?.id) throw new Error('No company');
      const { data, error } = await supabase
        .from('partners' as any)
        .insert({ ...partner, company_id: company.id })
        .select('*')
        .single();
      if (error) throw error;
      return data as unknown as Partner;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partners'] });
      toast.success('Partner added');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdatePartner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Partner> & { id: string }) => {
      const { data, error } = await supabase
        .from('partners' as any)
        .update(updates)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as unknown as Partner;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partners'] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeletePartner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('partners' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partners'] });
      toast.success('Partner deleted');
    },
    onError: (e: any) => toast.error(e.message),
  });
}
