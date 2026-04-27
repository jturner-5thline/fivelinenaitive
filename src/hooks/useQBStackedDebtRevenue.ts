import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { type QuarterOption } from '@/hooks/useQBQuarterlyRevenue';

const DEBT_REALM_ID = '193514877331929';

export interface StackedDebtMonth {
  month: string;
  monthKey: string;
  referralFeeRevenue: number;
  retainerRevenue: number;
  milestoneRevenue: number;
  closingFeeRevenue: number;
  otherRevenue: number;
  totalRevenue: number;
}

export interface StackedDebtResult {
  months: StackedDebtMonth[];
  total: number;
  isLoading: boolean;
}

/** Map a QuickBooks account name to one of the 5 bucket keys */
function classifyAccount(accountName: string): keyof Pick<StackedDebtMonth, 'referralFeeRevenue' | 'retainerRevenue' | 'milestoneRevenue' | 'closingFeeRevenue' | 'otherRevenue'> {
  const n = accountName.trim().toLowerCase();
  if (n.includes('referral')) return 'referralFeeRevenue';
  if (n.includes('retainer')) return 'retainerRevenue';
  if (n.includes('milestone')) return 'milestoneRevenue';
  if (n.includes('closing fee') || n.includes('abl closing') || n.includes('venture debt closing')) return 'closingFeeRevenue';
  return 'otherRevenue';
}

export const STACKED_CATEGORIES = [
  { key: 'referralFeeRevenue' as const, label: 'Referral Fee Revenue', color: 'hsl(200, 80%, 55%)' },
  { key: 'retainerRevenue' as const, label: 'Retainer Revenue', color: 'hsl(160, 65%, 50%)' },
  { key: 'milestoneRevenue' as const, label: 'Milestone Revenue', color: 'hsl(280, 65%, 60%)' },
  { key: 'closingFeeRevenue' as const, label: 'Closing Fee Revenue', color: 'hsl(35, 85%, 55%)' },
  { key: 'otherRevenue' as const, label: 'Other Revenue', color: 'hsl(220, 40%, 55%)' },
] as const;

export function useQBStackedDebtRevenue(quarter: QuarterOption | null): StackedDebtResult {
  const { user } = useAuth();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['qb-stacked-debt-revenue', user?.id, quarter?.value],
    queryFn: async () => {
      if (!quarter) return null;

      const { data: invoices, error } = await supabase
        .from('quickbooks_invoices')
        .select('txn_date, metadata')
        .eq('realm_id', DEBT_REALM_ID)
        .gte('txn_date', quarter.startDate)
        .lte('txn_date', quarter.endDate);

      if (error) throw error;

      // Initialize month buckets
      const buckets = new Map<string, StackedDebtMonth>();
      for (const m of quarter.months) {
        buckets.set(m.key, {
          month: m.label,
          monthKey: m.key,
          referralFeeRevenue: 0,
          retainerRevenue: 0,
          milestoneRevenue: 0,
          closingFeeRevenue: 0,
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
        b.totalRevenue = b.referralFeeRevenue + b.retainerRevenue + b.milestoneRevenue + b.closingFeeRevenue + b.otherRevenue;
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
