import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';

export interface LenderAttachmentSummary {
  lenderName: string;
  hasNda: boolean;
  hasMarketingMaterials: boolean;
}

export function useLenderAttachmentsSummary() {
  const { user } = useAuth();
  const { company } = useCompany();
  const [summaries, setSummaries] = useState<Record<string, LenderAttachmentSummary>>({});
  const [isLoading, setIsLoading] = useState(false);

  const fetchSummaries = useCallback(async () => {
    if (!user || !company?.id) {
      setSummaries({});
      return;
    }

    setIsLoading(true);
    try {
      const [{ data, error }, { data: flags }] = await Promise.all([
        supabase
          .from('lender_attachments')
          .select('lender_name, category')
          .eq('company_id', company.id),
        supabase
          .from('lender_doc_flags' as any)
          .select('lender_name, has_nda, has_marketing')
          .eq('company_id', company.id),
      ]);

      if (error) throw error;

      const summaryMap: Record<string, LenderAttachmentSummary> = {};

      const ensure = (name: string) => {
        if (!summaryMap[name]) {
          summaryMap[name] = { lenderName: name, hasNda: false, hasMarketingMaterials: false };
        }
        return summaryMap[name];
      };

      (data || []).forEach((att) => {
        const s = ensure(att.lender_name);
        if (att.category === 'nda') s.hasNda = true;
        if (att.category === 'marketing_materials') s.hasMarketingMaterials = true;
      });

      // Manual flags override / add to attachment-derived state
      ((flags as any[]) || []).forEach((f) => {
        const s = ensure(f.lender_name);
        if (f.has_nda) s.hasNda = true;
        if (f.has_marketing) s.hasMarketingMaterials = true;
      });

      setSummaries(summaryMap);
    } catch (error) {
      console.error('Error fetching lender attachment summaries:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, company?.id]);

  const setManualFlag = useCallback(async (
    lenderName: string,
    field: 'nda' | 'marketing',
    value: boolean,
  ) => {
    if (!user || !company?.id) return;

    // Optimistic update
    setSummaries((prev) => {
      const existing = prev[lenderName] || { lenderName, hasNda: false, hasMarketingMaterials: false };
      return {
        ...prev,
        [lenderName]: {
          ...existing,
          ...(field === 'nda' ? { hasNda: value } : { hasMarketingMaterials: value }),
        },
      };
    });

    const { error } = await supabase
      .from('lender_doc_flags' as any)
      .upsert(
        {
          company_id: company.id,
          lender_name: lenderName,
          ...(field === 'nda' ? { has_nda: value } : { has_marketing: value }),
          updated_by: user.id,
        },
        { onConflict: 'company_id,lender_name' },
      );

    if (error) {
      console.error('Error saving lender doc flag:', error);
      fetchSummaries();
    }
  }, [user, company?.id, fetchSummaries]);


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
    setManualFlag,
    refetch: fetchSummaries,
  };

}
