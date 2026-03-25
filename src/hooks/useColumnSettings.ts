import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type ColumnType = 'actual' | 'projection';

export interface ColumnSetting {
  id: string;
  company_id: string;
  column_key: string;
  column_type: ColumnType;
}

/**
 * Determines if a column is actual or projection based on its date.
 * Default rule: periods ending on or before current month = actual, future = projection.
 */
export function defaultColumnType(endDate: Date): ColumnType {
  const now = new Date();
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return endDate <= currentMonthEnd ? 'actual' : 'projection';
}

export function useColumnSettings(companyId: string | undefined) {
  const [settings, setSettings] = useState<ColumnSetting[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSettings = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from('financial_column_settings' as any)
      .select('*')
      .eq('company_id', companyId);

    if (!error && data) {
      setSettings(data as unknown as ColumnSetting[]);
    }
    setIsLoading(false);
  }, [companyId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  /**
   * Get the column type for a given column key, falling back to date-based default.
   */
  const getColumnType = useCallback((columnKey: string, endDate: Date): ColumnType => {
    const saved = settings.find(s => s.column_key === columnKey);
    if (saved) return saved.column_type;
    return defaultColumnType(endDate);
  }, [settings]);

  /**
   * Save or update a column type setting.
   */
  const setColumnType = useCallback(async (columnKey: string, columnType: ColumnType) => {
    if (!companyId) return;

    const existing = settings.find(s => s.column_key === columnKey);

    if (existing) {
      const { error } = await supabase
        .from('financial_column_settings' as any)
        .update({ column_type: columnType, updated_at: new Date().toISOString() })
        .eq('id', existing.id);

      if (!error) {
        setSettings(prev => prev.map(s =>
          s.id === existing.id ? { ...s, column_type: columnType } : s
        ));
      }
    } else {
      const { data, error } = await supabase
        .from('financial_column_settings' as any)
        .insert({ company_id: companyId, column_key: columnKey, column_type: columnType })
        .select()
        .single();

      if (!error && data) {
        setSettings(prev => [...prev, data as unknown as ColumnSetting]);
      }
    }
  }, [companyId, settings]);

  /**
   * Bulk update multiple column settings at once.
   */
  const bulkSetColumnTypes = useCallback(async (updates: { columnKey: string; columnType: ColumnType }[]) => {
    if (!companyId) return;

    for (const { columnKey, columnType } of updates) {
      await setColumnType(columnKey, columnType);
    }
  }, [companyId, setColumnType]);

  /**
   * Reset a column to use the default date-based rule (delete the override).
   */
  const resetColumnType = useCallback(async (columnKey: string) => {
    if (!companyId) return;
    const existing = settings.find(s => s.column_key === columnKey);
    if (!existing) return;

    const { error } = await supabase
      .from('financial_column_settings' as any)
      .delete()
      .eq('id', existing.id);

    if (!error) {
      setSettings(prev => prev.filter(s => s.id !== existing.id));
    }
  }, [companyId, settings]);

  return {
    settings,
    isLoading,
    getColumnType,
    setColumnType,
    bulkSetColumnTypes,
    resetColumnType,
    refetch: fetchSettings,
  };
}
