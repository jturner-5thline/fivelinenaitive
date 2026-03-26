import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from './useCompany';
import { toast } from 'sonner';

interface CompanySettings {
  id: string;
  company_id: string;
  default_deal_stage_id: string | null;
  fpa_dashboard_config: Record<string, unknown> | null;
}

export function useCompanySettings() {
  const { company } = useCompany();
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    if (!company?.id) {
      setSettings(null);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .eq('company_id', company.id)
        .maybeSingle();

      if (error) throw error;
      setSettings(data as unknown as CompanySettings);
    } catch (error) {
      console.error('Error fetching company settings:', error);
    } finally {
      setIsLoading(false);
    }
  }, [company?.id]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateDefaultStage = useCallback(async (stageId: string | null) => {
    if (!company?.id) {
      // Fallback to localStorage if no company
      if (stageId) {
        localStorage.setItem('defaultDealStageId', stageId);
      } else {
        localStorage.removeItem('defaultDealStageId');
      }
      return true;
    }

    try {
      if (settings) {
        // Update existing settings
        const { error } = await supabase
          .from('company_settings')
          .update({ default_deal_stage_id: stageId })
          .eq('company_id', company.id);

        if (error) throw error;
      } else {
        // Insert new settings
        const { error } = await supabase
          .from('company_settings')
          .insert({ 
            company_id: company.id, 
            default_deal_stage_id: stageId 
          });

        if (error) throw error;
      }

      setSettings(prev => prev 
        ? { ...prev, default_deal_stage_id: stageId }
        : { id: '', company_id: company.id, default_deal_stage_id: stageId }
      );
      return true;
    } catch (error) {
      console.error('Error updating default stage:', error);
      toast.error('Failed to save default stage setting');
      return false;
    }
  }, [company?.id, settings]);

  const updateSettings = useCallback(async (patch: Partial<Record<string, unknown>>) => {
    if (!company?.id) return;
    try {
      if (settings) {
        const { error } = await supabase
          .from('company_settings')
          .update(patch as any)
          .eq('company_id', company.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('company_settings')
          .insert({ company_id: company.id, ...patch } as any);
        if (error) throw error;
      }
      await fetchSettings();
    } catch (error) {
      console.error('Error updating company settings:', error);
      throw error;
    }
  }, [company?.id, settings, fetchSettings]);

  const defaultStageId = settings?.default_deal_stage_id ?? 
    (company?.id ? null : localStorage.getItem('defaultDealStageId'));

  return {
    settings,
    isLoading,
    defaultStageId,
    updateDefaultStage,
    updateSettings,
    refetch: fetchSettings,
  };
}
