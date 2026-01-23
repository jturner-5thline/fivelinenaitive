import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type LenderPassReasonCategory = 
  | 'deal_size_mismatch'
  | 'industry_exclusion'
  | 'geographic_restriction'
  | 'risk_profile_concerns'
  | 'timing_issues'
  | 'relationship_issues'
  | 'terms_mismatch'
  | 'other';

export const PASS_REASON_LABELS: Record<LenderPassReasonCategory, string> = {
  deal_size_mismatch: 'Deal Size Mismatch',
  industry_exclusion: 'Industry/Sector Exclusion',
  geographic_restriction: 'Geographic Restrictions',
  risk_profile_concerns: 'Risk Profile Concerns',
  timing_issues: 'Timing Issues',
  relationship_issues: 'Relationship Issues',
  terms_mismatch: 'Terms Mismatch',
  other: 'Other',
};

export interface LenderDisqualification {
  id: string;
  deal_id: string;
  deal_lender_id: string | null;
  lender_name: string;
  master_lender_id: string | null;
  disqualified_by: string | null;
  reason_category: LenderPassReasonCategory;
  reason_details: string | null;
  deal_size: number | null;
  deal_industry: string | null;
  deal_geography: string | null;
  created_at: string;
}

export interface LenderPassPattern {
  id: string;
  master_lender_id: string | null;
  lender_name: string;
  reason_category: LenderPassReasonCategory;
  pattern_type: string;
  pattern_value: string;
  confidence_score: number;
  occurrence_count: number;
  last_updated: string;
  created_at: string;
}

export interface DisqualifyLenderParams {
  dealId: string;
  dealLenderId?: string;
  lenderName: string;
  masterLenderId?: string;
  reasonCategory: LenderPassReasonCategory;
  reasonDetails?: string;
  dealSize?: number;
  dealIndustry?: string;
  dealGeography?: string;
}

export function useLenderDisqualifications(dealId?: string) {
  const { user } = useAuth();
  const [disqualifications, setDisqualifications] = useState<LenderDisqualification[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDisqualifications = useCallback(async () => {
    if (!dealId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('lender_disqualifications')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDisqualifications((data || []) as LenderDisqualification[]);
    } catch (error) {
      console.error('Error fetching disqualifications:', error);
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    fetchDisqualifications();
  }, [fetchDisqualifications]);

  const disqualifyLender = async (params: DisqualifyLenderParams) => {
    if (!user) {
      toast.error('You must be logged in to disqualify a lender');
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('lender_disqualifications')
        .insert({
          deal_id: params.dealId,
          deal_lender_id: params.dealLenderId || null,
          lender_name: params.lenderName,
          master_lender_id: params.masterLenderId || null,
          disqualified_by: user.id,
          reason_category: params.reasonCategory,
          reason_details: params.reasonDetails || null,
          deal_size: params.dealSize || null,
          deal_industry: params.dealIndustry || null,
          deal_geography: params.dealGeography || null,
        })
        .select()
        .single();

      if (error) throw error;
      
      toast.success(`${params.lenderName} has been disqualified from this deal`);
      await fetchDisqualifications();
      return data as LenderDisqualification;
    } catch (error) {
      console.error('Error disqualifying lender:', error);
      toast.error('Failed to disqualify lender');
      return null;
    }
  };

  const removeDisqualification = async (disqualificationId: string) => {
    try {
      const { error } = await supabase
        .from('lender_disqualifications')
        .delete()
        .eq('id', disqualificationId);

      if (error) throw error;
      
      toast.success('Disqualification removed');
      await fetchDisqualifications();
    } catch (error) {
      console.error('Error removing disqualification:', error);
      toast.error('Failed to remove disqualification');
    }
  };

  const isLenderDisqualified = (lenderName: string) => {
    return disqualifications.some(d => 
      d.lender_name.toLowerCase() === lenderName.toLowerCase()
    );
  };

  const getDisqualificationForLender = (lenderName: string) => {
    return disqualifications.find(d => 
      d.lender_name.toLowerCase() === lenderName.toLowerCase()
    );
  };

  return {
    disqualifications,
    loading,
    disqualifyLender,
    removeDisqualification,
    isLenderDisqualified,
    getDisqualificationForLender,
    refetch: fetchDisqualifications,
  };
}

export function useLenderPassPatterns(lenderName?: string, masterLenderId?: string) {
  const [patterns, setPatterns] = useState<LenderPassPattern[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPatterns = useCallback(async () => {
    if (!lenderName && !masterLenderId) return;
    
    setLoading(true);
    try {
      let query = supabase
        .from('lender_pass_patterns')
        .select('*')
        .order('confidence_score', { ascending: false });

      if (masterLenderId) {
        query = query.eq('master_lender_id', masterLenderId);
      } else if (lenderName) {
        query = query.ilike('lender_name', lenderName);
      }

      const { data, error } = await query;

      if (error) throw error;
      setPatterns((data || []) as LenderPassPattern[]);
    } catch (error) {
      console.error('Error fetching pass patterns:', error);
    } finally {
      setLoading(false);
    }
  }, [lenderName, masterLenderId]);

  useEffect(() => {
    fetchPatterns();
  }, [fetchPatterns]);

  return {
    patterns,
    loading,
    refetch: fetchPatterns,
  };
}

// Hook to get warnings for a specific lender based on deal context
export function useLenderWarnings(
  lenderName: string,
  dealContext?: {
    dealSize?: number;
    industry?: string;
    geography?: string;
  }
) {
  const { patterns, loading } = useLenderPassPatterns(lenderName);
  
  const warnings = patterns.filter(pattern => {
    if (pattern.confidence_score < 0.5) return false;
    
    // Check if pattern matches current deal context
    if (dealContext) {
      if (pattern.pattern_type === 'excluded_industry' && dealContext.industry) {
        return pattern.pattern_value.toLowerCase() === dealContext.industry.toLowerCase();
      }
      if (pattern.pattern_type === 'excluded_geography' && dealContext.geography) {
        return pattern.pattern_value.toLowerCase().includes(dealContext.geography.toLowerCase()) ||
               dealContext.geography.toLowerCase().includes(pattern.pattern_value.toLowerCase());
      }
    }
    
    return pattern.occurrence_count >= 2;
  });

  const hasWarnings = warnings.length > 0;
  const highConfidenceWarnings = warnings.filter(w => w.confidence_score >= 0.7);

  return {
    warnings,
    hasWarnings,
    highConfidenceWarnings,
    loading,
  };
}
