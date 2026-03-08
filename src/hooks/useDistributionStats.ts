import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';

export interface TrackingSettings {
  id: string;
  company_id: string;
  internal_domains: string[];
  internal_ip_ranges: string[];
  exclude_bot_traffic: boolean;
  updated_at: string;
}

export interface DistributionStat {
  id: string;
  distribution_id: string;
  company_id: string;
  raw_sends: number;
  raw_opens: number;
  raw_unique_opens: number;
  raw_clicks: number;
  raw_bounces: number;
  clean_sends: number;
  clean_opens: number;
  clean_unique_opens: number;
  clean_clicks: number;
  clean_bounces: number;
  clean_open_rate: number | null;
  clean_click_rate: number | null;
  computed_at: string;
}

export function useTrackingSettings() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['tracking-settings', company?.id],
    queryFn: async () => {
      if (!company?.id) return null;
      const { data, error } = await supabase
        .from('organization_tracking_settings')
        .select('*')
        .eq('company_id', company.id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as TrackingSettings | null;
    },
    enabled: !!company?.id,
  });
}

export function useSaveTrackingSettings() {
  const qc = useQueryClient();
  const { company } = useCompany();
  return useMutation({
    mutationFn: async (settings: Partial<TrackingSettings>) => {
      if (!company?.id) throw new Error('No company');
      const { data: existing } = await supabase
        .from('organization_tracking_settings')
        .select('id')
        .eq('company_id', company.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('organization_tracking_settings')
          .update(settings as any)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('organization_tracking_settings')
          .insert({ ...settings, company_id: company.id } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tracking-settings'] });
      toast.success('Tracking settings saved');
    },
    onError: () => toast.error('Failed to save settings'),
  });
}

export function useDistributionStats() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['distribution-stats', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data, error } = await supabase
        .from('email_distribution_stats')
        .select('*')
        .eq('company_id', company.id)
        .order('computed_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as DistributionStat[];
    },
    enabled: !!company?.id,
  });
}
