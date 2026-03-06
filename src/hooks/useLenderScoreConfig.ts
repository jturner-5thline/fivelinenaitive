import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from './useCompany';

export interface LenderScoreConfig {
  enabled: boolean;
}

const DEFAULT_CONFIG: LenderScoreConfig = { enabled: true };

export function useLenderScoreConfig() {
  const { company } = useCompany();
  const [config, setConfig] = useState<LenderScoreConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!company?.id) {
      setIsLoading(false);
      return;
    }
    (async () => {
      try {
        const { data } = await supabase
          .from('company_settings')
          .select('deals_special_widgets')
          .eq('company_id', company.id)
          .single();

        const widgets = data?.deals_special_widgets as Record<string, unknown> | null;
        if (widgets && typeof widgets.lender_score === 'object' && widgets.lender_score !== null) {
          setConfig({ ...DEFAULT_CONFIG, ...(widgets.lender_score as LenderScoreConfig) });
        }
      } catch (err) {
        console.error('Error fetching lender score config:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [company?.id]);

  return { scoreConfig: config, isLoading };
}
