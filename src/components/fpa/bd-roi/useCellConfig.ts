import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { QUARTERS_12 } from './bdRoiData';
import { BD_CELL_SEED } from './bdCellSeed';

export interface CellConfig {
  id?: string;
  sheet_id: string;
  row_key: string;
  col_key: string;
  cell_type: 'formula' | 'qbo_metric' | 'static';
  formula_string?: string;
  qbo_metric_id?: string;
  qbo_entity?: string;
  qbo_account?: string;
  qbo_aggregation?: string;
  qbo_time_window?: { start: string; end: string; label: string };
  metadata?: Record<string, unknown>;
}

/** Quarter col_key → human-readable date range */
function getQuarterDates(colKey: string): { start: string; end: string; label: string } {
  const match = colKey.match(/^Q(\d)-(\d{2})$/);
  if (!match) return { start: '', end: '', label: colKey };
  const q = parseInt(match[1]);
  const year = 2000 + parseInt(match[2]);
  const startMonth = (q - 1) * 3 + 1;
  const endMonth = q * 3;
  const lastDay = new Date(year, endMonth, 0).getDate();
  return {
    start: `${year}-${String(startMonth).padStart(2, '0')}-01`,
    end: `${year}-${String(endMonth).padStart(2, '0')}-${lastDay}`,
    label: `Q${q} ${year}`,
  };
}

export function useCellConfig(sheetId: string) {
  const { company } = useCompany();
  const [configs, setConfigs] = useState<Map<string, CellConfig>>(new Map());
  const [loading, setLoading] = useState(true);

  const makeKey = (rowKey: string, colKey: string) => `${rowKey}::${colKey}`;

  // Load configs from DB, fall back to seed data
  useEffect(() => {
    if (!company?.id) return;

    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('sheet_cell_config')
        .select('*')
        .eq('company_id', company.id)
        .eq('sheet_id', sheetId);

      const map = new Map<string, CellConfig>();

      if (!error && data && data.length > 0) {
        for (const row of data) {
          const config: CellConfig = {
            id: row.id,
            sheet_id: row.sheet_id,
            row_key: row.row_key,
            col_key: row.col_key,
            cell_type: row.cell_type as CellConfig['cell_type'],
            formula_string: row.formula_string || undefined,
            qbo_metric_id: row.qbo_metric_id || undefined,
            qbo_entity: row.qbo_entity || undefined,
            qbo_account: row.qbo_account || undefined,
            qbo_aggregation: row.qbo_aggregation || undefined,
            qbo_time_window: row.qbo_time_window as CellConfig['qbo_time_window'] || undefined,
            metadata: (row.metadata as Record<string, unknown>) || undefined,
          };
          map.set(makeKey(config.row_key, config.col_key), config);
        }
      } else {
        // Use seed data as fallback
        for (const seed of BD_CELL_SEED) {
          const cols = seed.col_keys ?? QUARTERS_12;
          for (const col of cols) {
            const config: CellConfig = {
              sheet_id: sheetId,
              row_key: seed.row_key,
              col_key: col,
              cell_type: seed.cell_type,
              formula_string: seed.formula_string,
              qbo_metric_id: seed.qbo_metric_id,
              qbo_entity: seed.qbo_entity,
              qbo_account: seed.qbo_account,
              qbo_aggregation: seed.qbo_aggregation,
              qbo_time_window: seed.cell_type === 'qbo_metric' ? getQuarterDates(col) : undefined,
            };
            map.set(makeKey(config.row_key, config.col_key), config);
          }
        }
      }

      setConfigs(map);
      setLoading(false);
    };

    load();
  }, [company?.id, sheetId]);

  const getConfig = useCallback((rowKey: string, colKey: string): CellConfig | undefined => {
    return configs.get(makeKey(rowKey, colKey));
  }, [configs]);

  const updateConfig = useCallback((updated: CellConfig) => {
    setConfigs(prev => {
      const next = new Map(prev);
      next.set(makeKey(updated.row_key, updated.col_key), updated);
      return next;
    });
  }, []);

  return { configs, getConfig, updateConfig, loading };
}
