import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { type QuarterOption } from '@/hooks/useQBQuarterlyRevenue';

const FINSERV_REALM_ID = '9341451968897660';

export interface StackedFinServMonth {
  month: string;
  monthKey: string;
  billableHourlyServices: number;
  recurringAdvisory: number;
  otherRevenue: number;
  totalRevenue: number;
}

export interface StackedFinServResult {
  months: StackedFinServMonth[];
  total: number;
  isLoading: boolean;
}

function classifyAccount(accountName: string): 'billableHourlyServices' | 'recurringAdvisory' | 'otherRevenue' {
  const n = accountName.trim().toLowerCase();
  if (n.includes('billable') || n.includes('hourly services')) return 'billableHourlyServices';
  if (n.includes('recurring') || n.includes('advisory')) return 'recurringAdvisory';
  return 'otherRevenue';
}

export const FINSERV_STACKED_CATEGORIES = [
  { key: 'recurringAdvisory' as const, label: 'Recurring Advisory', color: 'hsl(160, 65%, 50%)' },
  { key: 'billableHourlyServices' as const, label: 'Billable Hourly Services', color: 'hsl(35, 85%, 55%)' },
  { key: 'otherRevenue' as const, label: 'Other Revenue', color: 'hsl(220, 40%, 55%)' },
] as const;

export function useQBStackedFinServRevenue(quarter: QuarterOption | null): StackedFinServResult {
  const { user } = useAuth();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['qb-stacked-finserv-revenue', user?.id, quarter?.value],
    queryFn: async () => {
      if (!quarter) return null;

      const { data: invoices, error } = await supabase
        .from('quickbooks_invoices')
        .select('txn_date, metadata')
        .eq('realm_id', FINSERV_REALM_ID)
        .gte('txn_date', quarter.startDate)
        .lte('txn_date', quarter.endDate);

      if (error) throw error;

      const buckets = new Map<string, StackedFinServMonth>();
      for (const m of quarter.months) {
        buckets.set(m.key, {
          month: m.label,
          monthKey: m.key,
          billableHourlyServices: 0,
          recurringAdvisory: 0,
          otherRevenue: 0,
          totalRevenue: 0,
        });
      }

      for (const inv of invoices ?? []) {
        if (!inv.txn_date) continue;
        const monthKey = inv.txn_date.slice(0, 7);
        const bucket = buckets.get(monthKey);
        if (!bucket) continue;

        const meta = inv.metadata as Record<string, unknown> | null;
        if (!meta) continue;
        const lines = (meta as { Line?: Array<Record<string, unknown>> }).Line;
        if (!Array.isArray(lines)) continue;

        for (const line of lines) {
          if (line.DetailType !== 'SalesItemLineDetail') continue;
          const detail = line.SalesItemLineDetail as Record<string, unknown> | undefined;
          if (!detail) continue;
          const accountRef = detail.ItemAccountRef as { name?: string; value?: string } | undefined;
          const amount = typeof line.Amount === 'number' ? line.Amount : 0;
          if (!accountRef?.name) continue;

          const category = classifyAccount(accountRef.name);
          bucket[category] += amount;
        }
      }

      const months = quarter.months.map(m => {
        const b = buckets.get(m.key)!;
        b.totalRevenue = b.billableHourlyServices + b.recurringAdvisory + b.otherRevenue;
        return b;
      });

      const total = months.reduce((s, m) => s + m.totalRevenue, 0);
      return { months, total };
    },
    enabled: !!user && !!quarter,
    staleTime: 30_000,
  });

  return {
    months: data?.months ?? [],
    total: data?.total ?? 0,
    isLoading: isLoading || isFetching,
  };
}
