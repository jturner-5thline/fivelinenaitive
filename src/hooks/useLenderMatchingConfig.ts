import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from './useCompany';
import { toast } from 'sonner';

export interface MatchingCriterion {
  id: string;
  label: string;
  enabled: boolean;
  weight: number;
  position: number;
}

export interface MatchingPenalties {
  industry_avoided: number;
  below_min_deal: number;
  above_max_deal: number;
  cash_burn_mismatch: number;
  sponsorship_mismatch: number;
}

export interface LenderMatchingConfig {
  criteria: MatchingCriterion[];
  penalties: MatchingPenalties;
}

const DEFAULT_CONFIG: LenderMatchingConfig = {
  criteria: [
    { id: 'deal_size', label: 'Deal Size', enabled: true, weight: 50, position: 1 },
    { id: 'deal_type', label: 'Deal Type', enabled: true, weight: 40, position: 2 },
    { id: 'cash_burn', label: 'Cash Burn OK', enabled: true, weight: 30, position: 3 },
    { id: 'industry', label: 'Industry', enabled: true, weight: 25, position: 4 },
    { id: 'sponsorship', label: 'Sponsorship', enabled: true, weight: 20, position: 5 },
    { id: 'geography', label: 'Geography', enabled: true, weight: 10, position: 6 },
    { id: 'b2b_b2c', label: 'B2B/B2C', enabled: true, weight: 8, position: 7 },
  ],
  penalties: {
    industry_avoided: -50,
    below_min_deal: -30,
    above_max_deal: -30,
    cash_burn_mismatch: -25,
    sponsorship_mismatch: -20,
  },
};

export function useLenderMatchingConfig() {
  const { company } = useCompany();
  const [config, setConfig] = useState<LenderMatchingConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchConfig = useCallback(async () => {
    if (!company?.id) {
      setConfig(DEFAULT_CONFIG);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('lender_matching_config')
        .eq('company_id', company.id)
        .maybeSingle();

      if (error) throw error;

      if (data?.lender_matching_config) {
        const dbConfig = data.lender_matching_config as unknown as LenderMatchingConfig;
        // Merge with defaults to ensure all fields exist
        setConfig({
          criteria: dbConfig.criteria || DEFAULT_CONFIG.criteria,
          penalties: { ...DEFAULT_CONFIG.penalties, ...dbConfig.penalties },
        });
      } else {
        setConfig(DEFAULT_CONFIG);
      }
    } catch (error) {
      console.error('Error fetching lender matching config:', error);
      setConfig(DEFAULT_CONFIG);
    } finally {
      setIsLoading(false);
    }
  }, [company?.id]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const saveConfig = useCallback(async (newConfig: LenderMatchingConfig) => {
    if (!company?.id) {
      toast.error('No company found');
      return false;
    }

    setIsSaving(true);
    try {
      // Check if settings exist
      const { data: existing } = await supabase
        .from('company_settings')
        .select('id')
        .eq('company_id', company.id)
        .maybeSingle();

      // Cast to Json type for Supabase
      const configJson = JSON.parse(JSON.stringify(newConfig));

      if (existing) {
        const { error } = await supabase
          .from('company_settings')
          .update({ lender_matching_config: configJson })
          .eq('company_id', company.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('company_settings')
          .insert({
            company_id: company.id,
            lender_matching_config: configJson,
          });

        if (error) throw error;
      }

      setConfig(newConfig);
      toast.success('Lender matching configuration saved');
      return true;
    } catch (error) {
      console.error('Error saving lender matching config:', error);
      toast.error('Failed to save configuration');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [company?.id]);

  const resetToDefaults = useCallback(async () => {
    return saveConfig(DEFAULT_CONFIG);
  }, [saveConfig]);

  return {
    config,
    isLoading,
    isSaving,
    saveConfig,
    resetToDefaults,
    refetch: fetchConfig,
  };
}
