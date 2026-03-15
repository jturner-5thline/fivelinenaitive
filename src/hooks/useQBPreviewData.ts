import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { WidgetConfig, TimeWindow, Grain, isQBAccountField } from '@/components/widget-editor/widgetTypes';

export interface PreviewDataPoint {
  period: string;
  [key: string]: string | number;
}

/** Compute the date range from a TimeWindow */
function getDateRange(window: TimeWindow | undefined): { start: string; end: string } | null {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  switch (window) {
    case 'mtd':
      return { start: `${year}-${String(month + 1).padStart(2, '0')}-01`, end: now.toISOString().slice(0, 10) };
    case 'lastMonth': {
      const lm = month === 0 ? 11 : month - 1;
      const ly = month === 0 ? year - 1 : year;
      const lastDay = new Date(ly, lm + 1, 0).getDate();
      return { start: `${ly}-${String(lm + 1).padStart(2, '0')}-01`, end: `${ly}-${String(lm + 1).padStart(2, '0')}-${lastDay}` };
    }
    case 'qtd': {
      const qStart = Math.floor(month / 3) * 3;
      return { start: `${year}-${String(qStart + 1).padStart(2, '0')}-01`, end: now.toISOString().slice(0, 10) };
    }
    case 'lastQuarter': {
      const curQ = Math.floor(month / 3);
      const prevQ = curQ === 0 ? 3 : curQ - 1;
      const pqYear = curQ === 0 ? year - 1 : year;
      const pqStart = prevQ * 3;
      const pqEnd = new Date(pqYear, pqStart + 3, 0);
      return { start: `${pqYear}-${String(pqStart + 1).padStart(2, '0')}-01`, end: pqEnd.toISOString().slice(0, 10) };
    }
    case 'ytd':
      return { start: `${year}-01-01`, end: now.toISOString().slice(0, 10) };
    case 'lastYear':
      return { start: `${year - 1}-01-01`, end: `${year - 1}-12-31` };
    case 'ttm': {
      const ttmStart = new Date(now);
      ttmStart.setMonth(ttmStart.getMonth() - 12);
      return { start: ttmStart.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    }
    case 'last3Months': {
      const s3 = new Date(now); s3.setMonth(s3.getMonth() - 3);
      return { start: s3.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    }
    case 'last6Months': {
      const s6 = new Date(now); s6.setMonth(s6.getMonth() - 6);
      return { start: s6.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    }
    case 'last12Months': {
      const s12 = new Date(now); s12.setMonth(s12.getMonth() - 12);
      return { start: s12.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    }
    case 'all':
    default:
      return null; // no filter
  }
}

/** Format a date into a period label based on grain */
function toPeriodLabel(dateStr: string, grain: Grain | undefined): string {
  const d = new Date(dateStr + 'T00:00:00');
  switch (grain) {
    case 'day':
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    case 'quarter': {
      const q = Math.floor(d.getMonth() / 3) + 1;
      return `Q${q} ${d.getFullYear()}`;
    }
    case 'year':
      return String(d.getFullYear());
    case 'month':
    default:
      return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }
}

/** Sort key for period grouping */
function toPeriodKey(dateStr: string, grain: Grain | undefined): string {
  const d = new Date(dateStr + 'T00:00:00');
  switch (grain) {
    case 'day':
      return dateStr;
    case 'quarter': {
      const q = Math.floor(d.getMonth() / 3) + 1;
      return `${d.getFullYear()}-Q${q}`;
    }
    case 'year':
      return String(d.getFullYear());
    case 'month':
    default:
      return dateStr.slice(0, 7); // YYYY-MM
  }
}

/** Generate all period keys between start and end dates for the given grain */
function generateAllPeriodKeys(start: string, end: string, grain: Grain | undefined): { key: string; label: string }[] {
  const results: { key: string; label: string }[] = [];
  const current = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');

  // Align to grain boundary
  switch (grain) {
    case 'month':
      current.setDate(1);
      break;
    case 'quarter':
      current.setDate(1);
      current.setMonth(Math.floor(current.getMonth() / 3) * 3);
      break;
    case 'year':
      current.setMonth(0, 1);
      break;
  }

  const seen = new Set<string>();
  while (current <= endDate) {
    const dateStr = current.toISOString().slice(0, 10);
    const key = toPeriodKey(dateStr, grain);
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ key, label: toPeriodLabel(dateStr, grain) });
    }
    // Advance
    switch (grain) {
      case 'day':
        current.setDate(current.getDate() + 1);
        break;
      case 'quarter':
        current.setMonth(current.getMonth() + 3);
        break;
      case 'year':
        current.setFullYear(current.getFullYear() + 1);
        break;
      case 'month':
      default:
        current.setMonth(current.getMonth() + 1);
        break;
    }
  }
  return results;
}

/** Determine which QB table(s) to query based on the configured value fields */
function getRelevantFieldMapping(fieldId: string): { table: 'invoices' | 'payments' | 'expenses' | 'accounts'; amountCol: string; label: string } | null {
  // Standard seed fields
  const map: Record<string, { table: 'invoices' | 'payments' | 'expenses'; amountCol: string; label: string }> = {
    'f-revenue': { table: 'invoices', amountCol: 'total_amt', label: 'Revenue' },
    'f-amount': { table: 'invoices', amountCol: 'total_amt', label: 'Amount' },
    'f-expenses': { table: 'expenses', amountCol: 'total_amt', label: 'Expenses' },
    'f-cogs': { table: 'expenses', amountCol: 'total_amt', label: 'COGS' },
  };
  if (map[fieldId]) return map[fieldId];

  // QB account fields
  if (isQBAccountField(fieldId)) {
    return { table: 'accounts', amountCol: 'current_balance', label: 'Balance' };
  }

  return null;
}

export function useQBPreviewData(config: WidgetConfig) {
  const { user } = useAuth();
  const realmId = config.entityId;
  const grain = config.xAxis.grain;
  const timeWindow = config.xAxis.window;
  const showZeroPeriods = config.xAxis.showZeroPeriods ?? true;
  const hasQBValues = config.values.some(v => v.fieldId && (
    ['f-revenue', 'f-amount', 'f-expenses', 'f-cogs'].includes(v.fieldId) ||
    isQBAccountField(v.fieldId)
  ));

  // Build a stable key from breakdown/accountFilter config
  const valuesKey = config.values.map(v => 
    `${v.fieldId}|${v.breakdown ?? 'total'}|${(v.accountFilter ?? []).sort().join(',')}`
  ).join(';');

  return useQuery({
    queryKey: ['qb-preview-data', user?.id, realmId, valuesKey, grain, timeWindow, showZeroPeriods],
    queryFn: async (): Promise<PreviewDataPoint[]> => {
      const dateRange = getDateRange(timeWindow);

      // Group results by period
      const periodMap = new Map<string, PreviewDataPoint>();

      for (const vc of config.values) {
        if (!vc.fieldId) continue;
        const mapping = getRelevantFieldMapping(vc.fieldId);
        if (!mapping) continue;

        // For COA accounts (current_balance is point-in-time, not time-series)
        if (mapping.table === 'accounts' && isQBAccountField(vc.fieldId)) {
          const accountUuid = vc.fieldId.replace('qb-account-', '');
          const { data } = await supabase
            .from('quickbooks_accounts')
            .select('name, current_balance')
            .eq('id', accountUuid)
            .single();

          if (data) {
            const label = data.name ?? 'Account';
            const key = 'current';
            if (!periodMap.has(key)) {
              periodMap.set(key, { period: 'Current' });
            }
            periodMap.get(key)![label] = data.current_balance ?? 0;
          }
          continue;
        }

        // Check if this is a revenue field with byAccount breakdown
        const isByAccount = vc.breakdown === 'byAccount' && 
          mapping.table === 'invoices' && 
          ['f-revenue', 'f-amount'].includes(vc.fieldId);

        if (isByAccount) {
          // Fetch invoices with metadata to parse line items
          let query = supabase
            .from('quickbooks_invoices')
            .select('txn_date, metadata')
            .order('txn_date', { ascending: true });

          if (realmId) {
            query = query.eq('realm_id', realmId);
          }
          if (dateRange) {
            query = query.gte('txn_date', dateRange.start).lte('txn_date', dateRange.end);
          }

          const { data: rows, error } = await query;
          if (error || !rows) continue;

          const accountFilter = vc.accountFilter ?? [];

          for (const row of rows) {
            if (!row.txn_date) continue;
            const key = toPeriodKey(row.txn_date, grain);
            const periodLabel = toPeriodLabel(row.txn_date, grain);

            if (!periodMap.has(key)) {
              periodMap.set(key, { period: periodLabel });
            }
            const point = periodMap.get(key)!;

            // Parse line items from metadata
            const meta = row.metadata as Record<string, unknown> | null;
            if (!meta) continue;
            const lines = (meta as { Line?: Array<Record<string, unknown>> }).Line;
            if (!Array.isArray(lines)) continue;

            for (const line of lines) {
              if (line.DetailType !== 'SalesItemLineDetail') continue;
              const detail = line.SalesItemLineDetail as Record<string, unknown> | undefined;
              if (!detail) continue;
              const accountRef = detail.ItemAccountRef as { name?: string; value?: string } | undefined;
              if (!accountRef?.name || !accountRef?.value) continue;
              const amount = (line.Amount as number) ?? 0;

              // Apply account filter if specified
              if (accountFilter.length > 0 && !accountFilter.includes(accountRef.value)) continue;

              const acctLabel = accountRef.name;
              point[acctLabel] = ((point[acctLabel] as number) || 0) + amount;
            }
          }
          continue;
        }

        // Standard time-series: invoices, payments, expenses (total mode)
        const tableName = mapping.table === 'invoices'
          ? 'quickbooks_invoices'
          : mapping.table === 'payments'
          ? 'quickbooks_payments'
          : 'quickbooks_expenses';

        let query = supabase
          .from(tableName)
          .select('txn_date, total_amt')
          .order('txn_date', { ascending: true });

        if (realmId) {
          query = query.eq('realm_id', realmId);
        }
        if (dateRange) {
          query = query.gte('txn_date', dateRange.start).lte('txn_date', dateRange.end);
        }

        const { data: rows, error } = await query;
        if (error || !rows) continue;

        const label = mapping.label;

        // Aggregate by period
        for (const row of rows) {
          if (!row.txn_date) continue;
          const key = toPeriodKey(row.txn_date, grain);
          const periodLabel = toPeriodLabel(row.txn_date, grain);

          if (!periodMap.has(key)) {
            periodMap.set(key, { period: periodLabel });
          }
          const point = periodMap.get(key)!;
          point[label] = ((point[label] as number) || 0) + (row.total_amt ?? 0);
        }
      }

      // Collect all value labels used across data points
      const allLabels = new Set<string>();
      for (const point of periodMap.values()) {
        for (const k of Object.keys(point)) {
          if (k !== 'period') allLabels.add(k);
        }
      }

      // If showZeroPeriods is on and we have a date range, fill in all missing periods
      if (showZeroPeriods && dateRange) {
        const allKeys = generateAllPeriodKeys(dateRange.start, dateRange.end, grain);
        for (const { key, label } of allKeys) {
          if (!periodMap.has(key)) {
            periodMap.set(key, { period: label });
          }
        }
      }

      // Ensure every point has explicit 0 for all value labels (prevents "undefined")
      for (const point of periodMap.values()) {
        for (const label of allLabels) {
          if (!(label in point)) {
            point[label] = 0;
          }
        }
      }

      // Sort by period key
      let sorted = Array.from(periodMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, v]) => v);

      // Filter out $0 periods if configured
      if (!showZeroPeriods) {
        sorted = sorted.filter((point) => {
          const numericValues = Object.entries(point)
            .filter(([k]) => k !== 'period')
            .map(([, v]) => (typeof v === 'number' ? v : 0));
          return numericValues.some((v) => v !== 0);
        });
      }

      return sorted;
    },
    enabled: !!user && hasQBValues,
    staleTime: 5_000,
  });
}
