import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { DailyData, DailyRowStructure } from './types';
import { parseCashFlowExcel } from './cashFlowExcelParser';
import type { Json } from '@/integrations/supabase/types';

interface ImportState {
  dailyData: DailyData | null;
  rowStructure: DailyRowStructure | null;
  isImported: boolean;
  isLoading: boolean;
}

export function useCashFlowImport(companyId: string | undefined) {
  const [state, setState] = useState<ImportState>({
    dailyData: null,
    rowStructure: null,
    isImported: false,
    isLoading: true,
  });

  // Load existing import from DB on mount
  useEffect(() => {
    if (!companyId) {
      setState(prev => ({ ...prev, isLoading: false }));
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('cash_flow_imports')
          .select('daily_data, row_structure')
          .eq('company_id', companyId)
          .maybeSingle();

        if (cancelled) return;
        if (error) throw error;

        if (data) {
          const dailyData = data.daily_data as unknown as DailyData;
          const rowStructure = data.row_structure as unknown as DailyRowStructure;
          setState({
            dailyData,
            rowStructure,
            isImported: true,
            isLoading: false,
          });
        } else {
          setState(prev => ({ ...prev, isLoading: false }));
        }
      } catch (err) {
        console.error('Failed to load cash flow import:', err);
        if (!cancelled) setState(prev => ({ ...prev, isLoading: false }));
      }
    })();

    return () => { cancelled = true; };
  }, [companyId]);

  const importFile = useCallback(async (file: File) => {
    if (!companyId) {
      toast.error('No company context');
      return;
    }

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const { dailyData, rowStructure } = await parseCashFlowExcel(file);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Upsert into cash_flow_imports
      const { error } = await supabase
        .from('cash_flow_imports')
        .upsert({
          company_id: companyId,
          file_name: file.name,
          daily_data: dailyData as unknown as Json,
          row_structure: rowStructure as unknown as Json,
          imported_by: user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'company_id' });

      if (error) throw error;

      setState({
        dailyData,
        rowStructure,
        isImported: true,
        isLoading: false,
      });

      toast.success('Cash flow data imported', {
        description: `${dailyData.dates.length} days, ${Object.keys(dailyData.rows).length} rows from "${file.name}"`,
      });
    } catch (err) {
      console.error('Import failed:', err);
      toast.error('Import failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [companyId]);

  return {
    importedDailyData: state.dailyData,
    importedRowStructure: state.rowStructure,
    isImported: state.isImported,
    isImportLoading: state.isLoading,
    importFile,
  };
}
