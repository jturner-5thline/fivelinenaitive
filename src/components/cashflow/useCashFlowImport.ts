import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { DailyData, DailyRowStructure } from './types';
import { parseCashFlowExcel } from './cashFlowExcelParser';
import type { Json } from '@/integrations/supabase/types';

async function fetchCashFlowImport(companyId: string) {
  const { data, error } = await supabase
    .from('cash_flow_imports')
    .select('daily_data, row_structure')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export function useCashFlowImport(companyId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: importData, isLoading } = useQuery({
    queryKey: ['cash_flow_imports', companyId],
    queryFn: () => fetchCashFlowImport(companyId!),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,
  });

  const dailyData = importData?.daily_data as unknown as DailyData | null;
  const rowStructure = importData?.row_structure as unknown as DailyRowStructure | null;
  const isImported = !!importData;

  const importFile = useCallback(async (file: File) => {
    if (!companyId) {
      toast.error('No company context');
      return;
    }

    const loadingToast = toast.loading('Importing cash flow data…');

    try {
      const { dailyData, rowStructure, diagnostics } = await parseCashFlowExcel(file);
      console.info('Cash flow import diagnostics', diagnostics);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

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

      if (error) {
        console.error('Cash flow import upsert failed', { companyId, error });
        throw error;
      }

      // Invalidate the cache so the query refetches
      queryClient.invalidateQueries({ queryKey: ['cash_flow_imports', companyId] });

      const fmtDate = (iso: string) => {
        const [y, m, d] = iso.split('-');
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return `${months[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
      };
      toast.success('Cash flow data imported', {
        id: loadingToast,
        description: `Imported ${diagnostics.dateColumnCount} days from ${fmtDate(diagnostics.firstDate)} to ${fmtDate(diagnostics.lastDate)}, ${diagnostics.dataRowCount} rows`,
      });
    } catch (err) {
      console.error('Import failed:', err);
      toast.error('Import failed', {
        id: loadingToast,
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [companyId, queryClient]);

  return {
    importedDailyData: dailyData,
    importedRowStructure: rowStructure,
    isImported,
    isImportLoading: isLoading,
    importFile,
  };
}
