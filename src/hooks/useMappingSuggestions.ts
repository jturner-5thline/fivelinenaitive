import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface MappingSuggestion {
  rowIdx: number;
  label: string;
  suggestedField: string;
  confidence: number;
  reason: string;
  category: 'is' | 'bs' | 'checklist';
  status: 'pending' | 'accepted' | 'rejected' | 'changed';
}

interface RowLabel {
  rowIdx: number;
  label: string;
  sampleValues: (string | number | null)[];
}

export function useMappingSuggestions() {
  const [suggestions, setSuggestions] = useState<MappingSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const fetchSuggestions = useCallback(async (
    rows: RowLabel[],
    companyId: string,
    dealId?: string,
    checklistItems?: { id: string; name: string; category: string }[],
    statementType?: 'income-statement' | 'balance-sheet' | 'both',
  ) => {
    if (!rows.length || !companyId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-mapping-suggest', {
        body: {
          rows,
          company_id: companyId,
          deal_id: dealId,
          checklist_items: checklistItems,
          statement_type: statementType || 'both',
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      let results: MappingSuggestion[] = (data.suggestions || []).map((s: any) => ({
        ...s,
        status: 'pending' as const,
      }));

      // Filter by statement type on the client side as well
      if (statementType === 'income-statement') {
        results = results.filter(s => s.category === 'is');
      } else if (statementType === 'balance-sheet') {
        results = results.filter(s => s.category === 'bs');
      }

      setSuggestions(results);
      setHasRun(true);

      if (results.length > 0) {
        toast.success(`AI Map found ${results.length} suggestion${results.length > 1 ? 's' : ''}`);
      } else {
        toast.info('No mapping suggestions found');
      }
    } catch (err: any) {
      console.error('Mapping suggestions failed:', err);
      toast.error(err.message || 'Failed to get AI suggestions');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const acceptSuggestion = useCallback((rowIdx: number) => {
    setSuggestions(prev =>
      prev.map(s => s.rowIdx === rowIdx ? { ...s, status: 'accepted' as const } : s)
    );
  }, []);

  const rejectSuggestion = useCallback((rowIdx: number) => {
    setSuggestions(prev =>
      prev.map(s => s.rowIdx === rowIdx ? { ...s, status: 'rejected' as const } : s)
    );
  }, []);

  const changeSuggestion = useCallback((rowIdx: number, newField: string) => {
    setSuggestions(prev =>
      prev.map(s => s.rowIdx === rowIdx ? { ...s, suggestedField: newField, status: 'changed' as const } : s)
    );
  }, []);

  const acceptAll = useCallback(() => {
    setSuggestions(prev =>
      prev.map(s => s.status === 'pending' ? { ...s, status: 'accepted' as const } : s)
    );
  }, []);

  const dismissAll = useCallback(() => {
    setSuggestions(prev =>
      prev.map(s => s.status === 'pending' ? { ...s, status: 'rejected' as const } : s)
    );
  }, []);

  const logPatterns = useCallback(async (companyId: string, dealId?: string) => {
    const toLog = suggestions.filter(s => s.status !== 'pending');
    if (!toLog.length) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const inserts = toLog.map(s => ({
        company_id: companyId,
        deal_id: dealId || null,
        source_label: s.label,
        source_label_normalized: s.label.toLowerCase().trim(),
        mapped_field: s.suggestedField,
        field_category: s.category === 'checklist' ? 'checklist' : 'financial',
        action: s.status === 'accepted' ? 'accepted' : s.status === 'changed' ? 'changed' : 'rejected',
        confidence: s.confidence,
        suggested_by: 'ai',
        user_id: user?.id || null,
      }));

      await supabase.from('mapping_patterns' as any).insert(inserts as any);
    } catch (err) {
      console.error('Failed to log patterns:', err);
    }
  }, [suggestions]);

  const getSuggestionForRow = useCallback((rowIdx: number) => {
    return suggestions.find(s => s.rowIdx === rowIdx && s.status !== 'rejected');
  }, [suggestions]);

  const pendingCount = suggestions.filter(s => s.status === 'pending').length;
  const acceptedCount = suggestions.filter(s => s.status === 'accepted' || s.status === 'changed').length;

  return {
    suggestions,
    isLoading,
    hasRun,
    pendingCount,
    acceptedCount,
    fetchSuggestions,
    acceptSuggestion,
    rejectSuggestion,
    changeSuggestion,
    acceptAll,
    dismissAll,
    logPatterns,
    getSuggestionForRow,
  };
}
