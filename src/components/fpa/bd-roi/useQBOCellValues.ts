import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { CellConfig } from './useCellConfig';

export interface QBOResolvedValues {
  /** key = "rowKey::colKey", value = resolved number */
  values: Map<string, number>;
  loading: Set<string>;
}

/**
 * For every cell config with cell_type === 'qbo_metric', query the
 * appropriate QBO data table and aggregate the result.
 */
export function useQBOCellValues(configs: Map<string, CellConfig>): QBOResolvedValues {
  const { user } = useAuth();
  const [values, setValues] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState<Set<string>>(new Set());

  // Collect all qbo_metric cells
  const qboCells = useMemo(() => {
    const cells: CellConfig[] = [];
    for (const cfg of configs.values()) {
      if (cfg.cell_type === 'qbo_metric' && cfg.qbo_entity && cfg.qbo_account) {
        cells.push(cfg);
      }
    }
    return cells;
  }, [configs]);

  useEffect(() => {
    if (!user || qboCells.length === 0) return;

    const resolve = async () => {
      const keys = qboCells.map(c => `${c.row_key}::${c.col_key}`);
      setLoading(new Set(keys));

      const newValues = new Map<string, number>();

      // Batch by entity to reduce queries
      const byEntity = new Map<string, CellConfig[]>();
      for (const c of qboCells) {
        const group = byEntity.get(c.qbo_entity!) ?? [];
        group.push(c);
        byEntity.set(c.qbo_entity!, group);
      }

      for (const [entityName, cells] of byEntity) {
        // Resolve realm_id from entity name
        const { data: tokenData } = await supabase
          .from('quickbooks_tokens' as any)
          .select('realm_id, company_name')
          .eq('company_name', entityName)
          .limit(1);

        const realmId = (tokenData as any)?.[0]?.realm_id;
        if (!realmId) continue;

        for (const cell of cells) {
          const key = `${cell.row_key}::${cell.col_key}`;
          const tw = cell.qbo_time_window;
          if (!tw?.start || !tw?.end) continue;

          const val = await resolveMetric(realmId, cell.qbo_account!, cell.qbo_aggregation ?? 'sum', tw.start, tw.end);
          if (val !== null) {
            newValues.set(key, val);
          }
        }
      }

      setValues(prev => {
        const merged = new Map(prev);
        for (const [k, v] of newValues) merged.set(k, v);
        return merged;
      });
      setLoading(new Set());
    };

    resolve();
  }, [user, qboCells]);

  return { values, loading };
}

/**
 * Query QBO invoices for the given account name within a date range,
 * then aggregate. Falls back to expenses if no invoice data found.
 */
async function resolveMetric(
  realmId: string,
  accountName: string,
  aggregation: string,
  startDate: string,
  endDate: string,
): Promise<number | null> {
  // Try invoices first (revenue accounts)
  const { data: invoices } = await supabase
    .from('quickbooks_invoices')
    .select('total_amt')
    .eq('realm_id', realmId)
    .gte('txn_date', startDate)
    .lte('txn_date', endDate);

  // Try expenses (cost accounts)
  const { data: expenses } = await supabase
    .from('quickbooks_expenses')
    .select('total_amt, account_ref_name')
    .eq('realm_id', realmId)
    .gte('txn_date', startDate)
    .lte('txn_date', endDate);

  // Filter expenses by account name if specified
  const matchingExpenses = (expenses ?? []).filter(
    (e: any) => e.account_ref_name && e.account_ref_name.toLowerCase().includes(accountName.toLowerCase())
  );

  // Use whichever has data — prefer account-matched expenses, fall back to all invoices for revenue accounts
  const isRevenueAccount = accountName.toLowerCase().includes('revenue') || accountName.toLowerCase().includes('income');
  const rows = isRevenueAccount
    ? (invoices ?? [])
    : matchingExpenses.length > 0 ? matchingExpenses : (invoices ?? []);

  if (rows.length === 0) return null;

  const amounts = rows.map((r: any) => r.total_amt ?? 0);

  switch (aggregation) {
    case 'sum':
      return amounts.reduce((a: number, b: number) => a + b, 0);
    case 'average':
      return amounts.reduce((a: number, b: number) => a + b, 0) / amounts.length;
    case 'balance':
      return amounts[amounts.length - 1];
    case 'count':
      return amounts.length;
    default:
      return amounts.reduce((a: number, b: number) => a + b, 0);
  }
}

/**
 * Resolve a single cell after save — call this imperatively.
 */
export async function resolveSingleCell(config: CellConfig): Promise<number | null> {
  if (config.cell_type !== 'qbo_metric' || !config.qbo_entity || !config.qbo_account) return null;

  const { data: tokenData } = await supabase
    .from('quickbooks_tokens' as any)
    .select('realm_id, company_name')
    .eq('company_name', config.qbo_entity)
    .limit(1);

  const realmId = (tokenData as any)?.[0]?.realm_id;
  if (!realmId) return null;

  const tw = config.qbo_time_window;
  if (!tw?.start || !tw?.end) return null;

  return resolveMetric(realmId, config.qbo_account, config.qbo_aggregation ?? 'sum', tw.start, tw.end);
}
