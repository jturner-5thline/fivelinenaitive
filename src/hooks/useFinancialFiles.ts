import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface FinancialFileRecord {
  id: string;
  deal_id: string;
  company_id: string | null;
  file_name: string;
  file_size: number | null;
  storage_path: string | null;
  statement_type: string;
  start_month: number;
  start_year: number;
  month_count: number;
  analysis_result: any;
  field_mappings: Record<string, any>;
  excluded_columns: number[];
  flipped_rows: number[];
  flipped_columns: number[];
  pushed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancialDataRecord {
  id: string;
  deal_id: string;
  source_file_id: string;
  year_month: string;
  account_key: string;
  account_label: string;
  value: number;
  pushed_at: string;
}

export function useFinancialFiles(dealId: string) {
  const [files, setFiles] = useState<FinancialFileRecord[]>([]);
  const [financialData, setFinancialData] = useState<FinancialDataRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load all files for this deal
  const loadFiles = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('deal_financial_files' as any)
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setFiles((data as any as FinancialFileRecord[]) || []);
    } catch (err) {
      console.error('Failed to load financial files:', err);
    }
  }, [dealId]);

  // Load all financial data for this deal
  const loadFinancialData = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('deal_financial_data' as any)
        .select('*')
        .eq('deal_id', dealId)
        .order('year_month');
      if (error) throw error;
      setFinancialData((data as any as FinancialDataRecord[]) || []);
    } catch (err) {
      console.error('Failed to load financial data:', err);
    }
  }, [dealId]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setIsLoading(true);
      await Promise.all([loadFiles(), loadFinancialData()]);
      if (!cancelled) setIsLoading(false);
    }
    init();
    return () => { cancelled = true; };
  }, [loadFiles, loadFinancialData]);

  // Create/upsert a file record
  const upsertFile = useCallback(async (file: Partial<FinancialFileRecord> & { deal_id: string; file_name: string }) => {
    try {
      // Get company_id
      const { data: deal } = await supabase.from('deals').select('company_id').eq('id', dealId).single();
      const companyId = deal?.company_id || null;

      const { data, error } = await supabase
        .from('deal_financial_files' as any)
        .upsert({
          ...file,
          company_id: companyId,
        } as any, { onConflict: 'id' } as any)
        .select()
        .single();
      if (error) throw error;
      const record = data as any as FinancialFileRecord;
      setFiles(prev => {
        const existing = prev.findIndex(f => f.id === record.id);
        if (existing >= 0) {
          const next = [...prev];
          next[existing] = record;
          return next;
        }
        return [...prev, record];
      });
      return record;
    } catch (err) {
      console.error('Failed to upsert financial file:', err);
      toast.error('Failed to save file record');
      return null;
    }
  }, [dealId]);

  // Save file mappings
  const saveFileMappings = useCallback(async (
    fileId: string,
    mappings: Record<string, any>,
    excludedCols: number[],
    flippedRowsList: number[],
    flippedColsList: number[],
    startMonth: number,
    startYear: number,
  ) => {
    try {
      const { error } = await supabase
        .from('deal_financial_files' as any)
        .update({
          field_mappings: mappings,
          excluded_columns: excludedCols,
          flipped_rows: flippedRowsList,
          flipped_columns: flippedColsList,
          start_month: startMonth,
          start_year: startYear,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', fileId);
      if (error) throw error;

      setFiles(prev => prev.map(f =>
        f.id === fileId ? {
          ...f,
          field_mappings: mappings,
          excluded_columns: excludedCols,
          flipped_rows: flippedRowsList,
          flipped_columns: flippedColsList,
          start_month: startMonth,
          start_year: startYear,
        } : f
      ));
    } catch (err) {
      console.error('Failed to save file mappings:', err);
    }
  }, []);

  // Push mapped data to deal_financial_data (upsert by deal_id, year_month, account_key)
  const pushFileData = useCallback(async (
    fileId: string,
    dataRows: Array<{ year_month: string; account_key: string; account_label: string; value: number }>,
  ) => {
    try {
      const { data: deal } = await supabase.from('deals').select('company_id').eq('id', dealId).single();
      const companyId = deal?.company_id || null;

      // Upsert all rows
      const rows = dataRows.map(r => ({
        deal_id: dealId,
        company_id: companyId,
        source_file_id: fileId,
        year_month: r.year_month,
        account_key: r.account_key,
        account_label: r.account_label,
        value: r.value,
        pushed_at: new Date().toISOString(),
      }));

      // Batch upsert
      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { error } = await supabase
          .from('deal_financial_data' as any)
          .upsert(batch as any, { onConflict: 'deal_id,year_month,account_key' } as any);
        if (error) throw error;
      }

      // Mark file as pushed
      await supabase
        .from('deal_financial_files' as any)
        .update({ pushed_at: new Date().toISOString() } as any)
        .eq('id', fileId);

      setFiles(prev => prev.map(f =>
        f.id === fileId ? { ...f, pushed_at: new Date().toISOString() } : f
      ));

      // Reload financial data
      await loadFinancialData();
      return true;
    } catch (err) {
      console.error('Failed to push financial data:', err);
      toast.error('Failed to push data to model');
      return false;
    }
  }, [dealId, loadFinancialData]);

  const deleteFile = useCallback(async (fileId: string) => {
    try {
      await supabase.from('deal_financial_data' as any).delete().eq('source_file_id', fileId);
      await supabase.from('deal_financial_files' as any).delete().eq('id', fileId);
      setFiles(prev => prev.filter(f => f.id !== fileId));
      await loadFinancialData();
    } catch (err) {
      console.error('Failed to delete file:', err);
      toast.error('Failed to delete file');
    }
  }, [loadFinancialData]);

  return {
    files,
    financialData,
    isLoading,
    upsertFile,
    saveFileMappings,
    pushFileData,
    deleteFile,
    loadFiles,
    loadFinancialData,
  };
}
