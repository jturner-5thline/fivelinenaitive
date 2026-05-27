import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { buildBuckets, type Granularity } from '@/lib/insightsTimeRange';
import { QBO_ENTITIES } from '@/config/qboEntities';

/**
 * Authoritative revenue series sourced from QuickBooks Online "ProfitAndLoss"
 * reports — NOT from summing `quickbooks_invoices.total_amt`. Per Scott's
 * 2026-05-27 feedback, invoice-sums overstate recognized revenue because:
 *   - Debt closing-fee invoices are billed accrual-style but recognized in
 *     QBO on a cash basis (i.e., only when paid).
 *   - Inter-company transfers can post as invoices.
 * Using the stored P&L "Total Income" line guarantees parity with QBO's
 * native consolidated P&L report that Scott reconciles against.
 *
 * The hook returns:
 *   - totalIncome:  P&L Total Income summed across all connected realms for
 *                   the selected period.
 *   - buckets:      [{ key, label, value }] for the trend chart.
 *   - missingBuckets: list of (realm, bucketKey) pairs without an exact
 *                   stored P&L report. The hook will background-trigger a
 *                   quickbooks-sync for each, so the next refresh is exact.
 */

export interface QBPLBucket {
  key: string;
  label: string;
  start_date: string;
  end_date: string;
  /** P&L Total Income summed across realms for the bucket. */
  value: number;
  /** True when at least one realm fell back to a day-overlap approximation. */
  approximated: boolean;
}

export interface QBPLSeries {
  totalIncome: number;
  buckets: QBPLBucket[];
  /** Number of (realm, bucket) pairs that lacked an exact stored P&L. */
  missingCount: number;
  /** True while a background sync is fetching the missing reports. */
  isSyncingMissing: boolean;
}

interface RawPLRow {
  realm_id: string;
  period_start: string | null;
  period_end: string | null;
  report_data: any;
  synced_at: string;
}

function parseTotalIncomeFromReport(report: any): number {
  const rows = report?.Rows?.Row ?? [];
  for (const row of rows) {
    if (row?.type === 'Section' && row?.group === 'Income') {
      const v = row?.Summary?.ColData?.[1]?.value;
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    }
  }
  return 0;
}

function overlapDays(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  const start = aStart > bStart ? aStart : bStart;
  const end = aEnd < bEnd ? aEnd : bEnd;
  if (start > end) return 0;
  const s = new Date(start + 'T00:00:00Z').getTime();
  const e = new Date(end + 'T00:00:00Z').getTime();
  return Math.max(1, Math.round((e - s) / 86_400_000) + 1);
}

function totalDays(start: string, end: string): number {
  return overlapDays(start, end, start, end);
}

/** Pick the best P&L row for a (realm, bucket) and return its allocated value. */
function allocateRowToBucket(
  rows: RawPLRow[],
  realmId: string,
  bucketStart: string,
  bucketEnd: string,
): { value: number; exact: boolean } | null {
  const realmRows = rows.filter(r => r.realm_id === realmId && r.period_start && r.period_end);
  if (!realmRows.length) return null;

  // Exact bucket match (period_start === bucketStart && period_end === bucketEnd).
  const exact = realmRows.find(r => r.period_start === bucketStart && r.period_end === bucketEnd);
  if (exact) {
    return { value: parseTotalIncomeFromReport(exact.report_data), exact: true };
  }

  // Pick the smallest enclosing report that fully contains the bucket; allocate
  // by day-overlap. This is approximate but bounded to within the enclosing
  // P&L's totals (so consolidated YTD stays exact).
  const enclosing = realmRows
    .filter(r => r.period_start! <= bucketStart && r.period_end! >= bucketEnd)
    .sort((a, b) => totalDays(a.period_start!, a.period_end!) - totalDays(b.period_start!, b.period_end!))[0];
  if (enclosing) {
    const total = parseTotalIncomeFromReport(enclosing.report_data);
    const days = totalDays(enclosing.period_start!, enclosing.period_end!);
    const bDays = overlapDays(bucketStart, bucketEnd, enclosing.period_start!, enclosing.period_end!);
    return { value: total * (bDays / days), exact: false };
  }

  return null;
}

function pickRealmTotalForPeriod(rows: RawPLRow[], realmId: string, start: string, end: string): number {
  const realmRows = rows.filter(r => r.realm_id === realmId && r.period_start && r.period_end);
  if (!realmRows.length) return 0;
  const exact = realmRows.find(r => r.period_start === start && r.period_end === end);
  if (exact) return parseTotalIncomeFromReport(exact.report_data);
  // Fallback: take the report that best brackets the period (largest fully-inside report).
  const inside = realmRows
    .filter(r => r.period_start! >= start && r.period_end! <= end)
    .sort((a, b) => totalDays(b.period_start!, b.period_end!) - totalDays(a.period_start!, a.period_end!));
  if (inside.length) {
    // If the largest covers ≥80% of the period, use it; otherwise sum non-overlapping inside reports.
    const biggest = inside[0];
    const span = totalDays(start, end);
    if (totalDays(biggest.period_start!, biggest.period_end!) / span >= 0.8) {
      return parseTotalIncomeFromReport(biggest.report_data);
    }
    // Greedy non-overlap sum.
    const picked: RawPLRow[] = [];
    for (const r of inside) {
      if (picked.every(p => r.period_end! < p.period_start! || r.period_start! > p.period_end!)) {
        picked.push(r);
      }
    }
    return picked.reduce((s, r) => s + parseTotalIncomeFromReport(r.report_data), 0);
  }
  // Last resort: pick smallest enclosing report and allocate by day-overlap.
  const enclosing = realmRows
    .filter(r => r.period_start! <= start && r.period_end! >= end)
    .sort((a, b) => totalDays(a.period_start!, a.period_end!) - totalDays(b.period_start!, b.period_end!))[0];
  if (enclosing) {
    const total = parseTotalIncomeFromReport(enclosing.report_data);
    const days = totalDays(enclosing.period_start!, enclosing.period_end!);
    const ovl = overlapDays(start, end, enclosing.period_start!, enclosing.period_end!);
    return total * (ovl / days);
  }
  return 0;
}

const recentSyncs = new Map<string, number>();
const SYNC_THROTTLE_MS = 60_000;

function shouldTriggerSync(realmId: string, start: string, end: string): boolean {
  const key = `${realmId}|${start}|${end}`;
  const last = recentSyncs.get(key) ?? 0;
  if (Date.now() - last < SYNC_THROTTLE_MS) return false;
  recentSyncs.set(key, Date.now());
  return true;
}

export function useQBTotalIncomeSeries(
  period: { start: string; end: string } | undefined,
  granularity: Granularity = 'monthly',
): QBPLSeries & { isLoading: boolean } {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isSyncingRef = useRef(false);

  const buckets = useMemo(() => {
    if (!period) return [];
    return buildBuckets(period.start, period.end, granularity);
  }, [period?.start, period?.end, granularity]);

  const realmIds = useMemo(() => QBO_ENTITIES.map(e => e.realmId), []);

  const { data, isLoading } = useQuery({
    queryKey: ['qb-pl-series', user?.id, period?.start, period?.end, granularity],
    enabled: !!user && !!period,
    staleTime: 60_000,
    queryFn: async (): Promise<QBPLSeries> => {
      if (!period) return { totalIncome: 0, buckets: [], missingCount: 0, isSyncingMissing: false };

      // Pull P&L rows covering [period.start - 1y, period.end + 1d] to allow
      // enclosing reports to participate in allocation.
      const { data: reports, error } = await supabase
        .from('quickbooks_reports')
        .select('realm_id, period_start, period_end, report_data, synced_at')
        .eq('report_type', 'profit_and_loss')
        .in('realm_id', realmIds)
        .order('synced_at', { ascending: false });
      if (error) throw error;

      // Dedupe by (realm, period_start, period_end) keeping freshest synced_at.
      const seen = new Set<string>();
      const rows: RawPLRow[] = [];
      for (const r of reports ?? []) {
        const k = `${r.realm_id}|${r.period_start}|${r.period_end}`;
        if (seen.has(k)) continue;
        seen.add(k);
        rows.push(r as RawPLRow);
      }

      // Bucket totals.
      let missingCount = 0;
      const out: QBPLBucket[] = buckets.map(b => {
        let value = 0;
        let approximated = false;
        for (const realmId of realmIds) {
          const alloc = allocateRowToBucket(rows, realmId, b.start_date, b.end_date);
          if (!alloc) {
            missingCount += 1;
            continue;
          }
          value += alloc.value;
          if (!alloc.exact) approximated = true;
        }
        return {
          key: b.key,
          label: b.label,
          start_date: b.start_date,
          end_date: b.end_date,
          value,
          approximated,
        };
      });

      // Period total — prefer per-realm exact-match sums over the whole period.
      let totalIncome = 0;
      for (const realmId of realmIds) {
        totalIncome += pickRealmTotalForPeriod(rows, realmId, period.start, period.end);
      }

      return { totalIncome, buckets: out, missingCount, isSyncingMissing: false };
    },
  });

  // Fire-and-forget background sync for any missing (realm, bucket) pairs.
  // Throttled so we don't hammer QBO when a user rapidly toggles granularity.
  useEffect(() => {
    if (!user || !period || isSyncingRef.current) return;
    if (!data || data.missingCount === 0) return;
    isSyncingRef.current = true;
    (async () => {
      try {
        // Build the set of (realm, bucketStart, bucketEnd) that need syncing.
        const targets: Array<{ realmId: string; start: string; end: string }> = [];
        for (const b of buckets) {
          for (const realmId of realmIds) {
            // Skip if we already have an exact P&L for this bucket+realm.
            // (We can't introspect the cache cheaply here; let the throttle handle it.)
            if (shouldTriggerSync(realmId, b.start_date, b.end_date)) {
              targets.push({ realmId, start: b.start_date, end: b.end_date });
            }
          }
        }
        await Promise.allSettled(
          targets.map(t =>
            supabase.functions.invoke('quickbooks-sync', {
              body: {
                syncType: 'profit_and_loss',
                realmId: t.realmId,
                start_date: t.start,
                end_date: t.end,
              },
            }),
          ),
        );
        await queryClient.invalidateQueries({ queryKey: ['qb-pl-series'] });
      } finally {
        isSyncingRef.current = false;
      }
    })();
  }, [data?.missingCount, period?.start, period?.end, granularity]);

  return {
    totalIncome: data?.totalIncome ?? 0,
    buckets: data?.buckets ?? [],
    missingCount: data?.missingCount ?? 0,
    isSyncingMissing: !!data && data.missingCount > 0,
    isLoading,
  };
}