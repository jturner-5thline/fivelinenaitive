import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from './useCompany';
import { toast } from 'sonner';

export interface FPADashboardConfig {
  // Tabs
  tabs: {
    overview: boolean;
    pnl: boolean;
    balance: boolean;
    cashflow: boolean;
    scenarios: boolean;
    collaborate: boolean;
    export: boolean;
  };
  // Charts & elements within overview/pnl
  charts: {
    revenueChart: boolean;
    marginTrends: boolean;
    opexComparison: boolean;
    topVendors: boolean;
    waterfallBridge: boolean;
  };
  // Dashboard elements
  elements: {
    kpiCards: boolean;
    varianceLegend: boolean;
    plTable: boolean;
    chartConfigButton: boolean;
    comparisonFilter: boolean;
    dateRangeFilter: boolean;
    exportButton: boolean;
  };
  // Scenario sub-elements
  scenarios: {
    scenarioModeling: boolean;
    sensitivityTable: boolean;
    stressTesting: boolean;
  };
}

export const DEFAULT_FPA_CONFIG: FPADashboardConfig = {
  tabs: {
    overview: true,
    pnl: true,
    balance: true,
    cashflow: true,
    scenarios: true,
    collaborate: true,
    export: true,
  },
  charts: {
    revenueChart: true,
    marginTrends: true,
    opexComparison: true,
    topVendors: true,
    waterfallBridge: true,
  },
  elements: {
    kpiCards: true,
    varianceLegend: true,
    plTable: true,
    chartConfigButton: true,
    comparisonFilter: true,
    dateRangeFilter: true,
    exportButton: true,
  },
  scenarios: {
    scenarioModeling: true,
    sensitivityTable: true,
    stressTesting: true,
  },
};

export function useFPADashboardConfig() {
  const { company, isAdmin } = useCompany();
  const [config, setConfig] = useState<FPADashboardConfig>(DEFAULT_FPA_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const pendingSaveRef = useRef(false);

  const applyFromRow = useCallback((row: Record<string, any> | null) => {
    if (row?.fpa_dashboard_config && typeof row.fpa_dashboard_config === 'object') {
      const saved = row.fpa_dashboard_config as Record<string, any>;
      setConfig({
        tabs: { ...DEFAULT_FPA_CONFIG.tabs, ...saved.tabs },
        charts: { ...DEFAULT_FPA_CONFIG.charts, ...saved.charts },
        elements: { ...DEFAULT_FPA_CONFIG.elements, ...saved.elements },
        scenarios: { ...DEFAULT_FPA_CONFIG.scenarios, ...saved.scenarios },
      });
    } else {
      setConfig(DEFAULT_FPA_CONFIG);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    if (!company?.id) {
      setConfig(DEFAULT_FPA_CONFIG);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('fpa_dashboard_config')
        .eq('company_id', company.id)
        .maybeSingle();

      if (error) throw error;
      applyFromRow(data);
    } catch (error) {
      console.error('Error fetching FPA dashboard config:', error);
    } finally {
      setIsLoading(false);
    }
  }, [company?.id, applyFromRow]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Realtime subscription — push config changes to all company members
  useEffect(() => {
    if (!company?.id) return;

    const channel = supabase
      .channel(`fpa-dashboard-config-${company.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'company_settings',
          filter: `company_id=eq.${company.id}`,
        },
        (payload) => {
          if (pendingSaveRef.current) return;
          applyFromRow(payload.new as Record<string, any>);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [company?.id, applyFromRow]);

  const saveConfig = useCallback(async (newConfig: FPADashboardConfig) => {
    if (!company?.id || !isAdmin) {
      toast.error('Only admins can update dashboard configuration');
      return false;
    }

    setIsSaving(true);
    try {
      // Check if settings row exists
      const { data: existing } = await supabase
        .from('company_settings')
        .select('id')
        .eq('company_id', company.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('company_settings')
          .update({ fpa_dashboard_config: newConfig as any })
          .eq('company_id', company.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('company_settings')
          .insert({ company_id: company.id, fpa_dashboard_config: newConfig as any });
        if (error) throw error;
      }

      setConfig(newConfig);
      toast.success('Dashboard configuration saved for the team');
      return true;
    } catch (error) {
      console.error('Error saving FPA dashboard config:', error);
      toast.error('Failed to save dashboard configuration');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [company?.id, isAdmin]);

  return {
    config,
    isLoading,
    isSaving,
    isAdmin,
    saveConfig,
    refetch: fetchConfig,
  };
}
