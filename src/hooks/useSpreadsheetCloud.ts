import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SpreadsheetWorkbook } from '@/hooks/useSpreadsheetWorkbook';
import type { Json } from '@/integrations/supabase/types';

export function useSpreadsheetCloud() {
  const saveWorkbook = useCallback(async (workbook: SpreadsheetWorkbook) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Sign in to save workbooks');
      return null;
    }

    const serialized = serializeWorkbook(workbook) as unknown as Json;

    // Check if workbook already exists in cloud
    const { data: existing } = await supabase
      .from('spreadsheet_workbooks')
      .select('id, version')
      .eq('id', workbook.id)
      .maybeSingle();

    if (existing) {
      // Save version snapshot before updating
      await supabase.from('spreadsheet_versions').insert([{
        workbook_id: existing.id,
        version: existing.version,
        data: serialized,
        name: `v${existing.version} — ${new Date().toLocaleString()}`,
      }]);

      const { error } = await supabase
        .from('spreadsheet_workbooks')
        .update({ name: workbook.name, data: serialized, version: existing.version + 1 })
        .eq('id', existing.id);

      if (error) throw error;
      toast.success('Workbook saved', { description: `v${existing.version + 1}` });
      return existing.id;
    } else {
      const { data, error } = await supabase
        .from('spreadsheet_workbooks')
        .insert([{ id: workbook.id, user_id: user.id, name: workbook.name, data: serialized, version: 1 }])
        .select('id')
        .single();

      if (error) throw error;
      toast.success('Workbook saved to cloud');
      return data.id;
    }
  }, []);

  const loadWorkbooks = useCallback(async () => {
    const { data, error } = await supabase
      .from('spreadsheet_workbooks')
      .select('id, name, version, updated_at')
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }, []);

  const loadWorkbook = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from('spreadsheet_workbooks')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return deserializeWorkbook(data);
  }, []);

  const loadVersions = useCallback(async (workbookId: string) => {
    const { data, error } = await supabase
      .from('spreadsheet_versions')
      .select('id, version, name, created_at')
      .eq('workbook_id', workbookId)
      .order('version', { ascending: false });

    if (error) throw error;
    return data || [];
  }, []);

  const restoreVersion = useCallback(async (workbookId: string, versionId: string) => {
    const { data: version, error } = await supabase
      .from('spreadsheet_versions')
      .select('data')
      .eq('id', versionId)
      .single();

    if (error) throw error;
    
    // Update workbook with version data
    await supabase
      .from('spreadsheet_workbooks')
      .update({ data: version.data })
      .eq('id', workbookId);

    toast.success('Version restored');
    return version.data;
  }, []);

  const deleteWorkbook = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('spreadsheet_workbooks')
      .delete()
      .eq('id', id);

    if (error) throw error;
    toast.success('Workbook deleted');
  }, []);

  return { saveWorkbook, loadWorkbooks, loadWorkbook, loadVersions, restoreVersion, deleteWorkbook };
}

function serializeWorkbook(wb: SpreadsheetWorkbook): Record<string, unknown> {
  return {
    name: wb.name,
    sheets: wb.sheets.map(s => ({
      name: s.name,
      data: s.data,
      colWidths: s.colWidths,
      formats: s.formats,
      frozenRows: s.frozenRows,
      frozenCols: s.frozenCols,
      mergedCells: s.mergedCells,
      comments: s.comments,
      validations: s.validations,
      conditionalFormats: s.conditionalFormats,
    })),
    activeSheetIndex: wb.activeSheetIndex,
    namedRanges: (wb as any).namedRanges || {},
  };
}

function deserializeWorkbook(row: any): SpreadsheetWorkbook {
  const d = row.data as any;
  return {
    id: row.id,
    name: d.name || row.name,
    sheets: (d.sheets || []).map((s: any) => ({
      ...s,
      comments: s.comments || {},
      validations: s.validations || {},
      conditionalFormats: s.conditionalFormats || [],
      mergedCells: s.mergedCells || [],
      formats: s.formats || {},
    })),
    activeSheetIndex: d.activeSheetIndex || 0,
    rawWorkbook: null,
    isDirty: false,
    source: 'platform' as const,
    namedRanges: d.namedRanges || {},
  };
}
