import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface LenderAttachmentSummary {
  lenderName: string;
  hasNda: boolean;
  hasMarketingMaterials: boolean;
}

export function useLenderAttachmentsSummary() {
  const { user } = useAuth();
  const [summaries, setSummaries] = useState<Record<string, LenderAttachmentSummary>>({});
  const [isLoading, setIsLoading] = useState(false);

  const fetchSummaries = useCallback(async () => {
    if (!user) {
      setSummaries({});
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('lender_attachments')
        .select('lender_name, category')
        .eq('user_id', user.id);

      if (error) throw error;

      const summaryMap: Record<string, LenderAttachmentSummary> = {};
      
      (data || []).forEach((att) => {
        if (!summaryMap[att.lender_name]) {
          summaryMap[att.lender_name] = {
            lenderName: att.lender_name,
            hasNda: false,
            hasMarketingMaterials: false,
          };
        }
        
        if (att.category === 'nda') {
          summaryMap[att.lender_name].hasNda = true;
        }
        if (att.category === 'marketing_materials') {
          summaryMap[att.lender_name].hasMarketingMaterials = true;
        }
      });

      setSummaries(summaryMap);
    } catch (error) {
      console.error('Error fetching lender attachment summaries:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSummaries();
  }, [fetchSummaries]);

  const getLenderSummary = useCallback((lenderName: string): LenderAttachmentSummary => {
    return summaries[lenderName] || {
      lenderName,
      hasNda: false,
      hasMarketingMaterials: false,
    };
  }, [summaries]);

  return {
    summaries,
    isLoading,
    getLenderSummary,
    refetch: fetchSummaries,
  };
}
