import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ScheduledCashFlow } from './scheduledCashFlows';
import type { DealCashflowOverride } from './useDealCashflowOverrides';
import { computeTotalFee, normalizeSuccessFeePercent } from '@/lib/fees';

/**
 * Stage tokens (case-insensitive, separators normalized) that indicate the
 * deal is "active and likely to produce revenue" — closing fee + retainer
 * projections are surfaced in Cash Flow only for these stages.
 *
 * Maps to the user-facing labels: "Agreement Pending", "Final Credit Items",
 * "Funded", "Closed".
 */
const ACTIVE_STAGE_TOKENS = new Set([
  'agreement pending',
  'final credit items',
  'funded',
  'funded invoiced',
  'closed',
  'closed won',
]);

function normalizeStage(s: string | null | undefined): string {
  return String(s || '').toLowerCase().replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function isActiveStage(s: string | null | undefined): boolean {
  return ACTIVE_STAGE_TOKENS.has(normalizeStage(s));
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Project Cash-In entries from the naitive deal pipeline:
 *  - One-time Closing Fee at expected close date = deal value × success_fee_percent (default 2%)
 *  - Recurring monthly Retainer (day-of-month from contract_start_date) when retainer_fee is set
 *
 * Entries are tagged with id prefix `deal:` and a `notes` value of
 * `naitive Deal — <Company> · <kind>` so the drilldown shows provenance.
 * They use the same ScheduledCashFlow shape so the existing merge / drilldown
 * pipeline picks them up unchanged.
 */
export function useDealProjectedCashFlows(
  companyId: string | undefined,
  enabled: boolean,
  overrides?: Record<string, DealCashflowOverride>,
) {
  const [items, setItems] = useState<ScheduledCashFlow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !companyId) { setItems([]); return; }
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('deals')
        .select('id, company, value, stage, retainer_fee, milestone_fee, success_fee_percent, projected_close_date, contract_start_date')
        .eq('company_id', companyId)
        .limit(500);
      if (cancelled) return;
      if (error || !data) {
        setItems([]); setIsLoading(false); return;
      }
      const out: ScheduledCashFlow[] = [];
      const today = fmtDate(new Date());
      for (const d of data as any[]) {
        if (!isActiveStage(d.stage)) continue;
        // Global test-deal exclusion
        const name = String(d.company || '').trim();
        if (!name) continue;
        const lower = name.toLowerCase();
        if (
          lower === "test-niki's store" ||
          lower === 'example deal' ||
          lower.startsWith('test ')
        ) continue;

        // Closing Fee projection
        // SOURCE OF TRUTH: deal.value × normalized success_fee_percent.
        // Never fall back to deals.total_fee — Closing Fees must always
        // reflect the Success Fee only (project-wide rule, see src/lib/fees.ts).
        const dealValue = Number(d.value) || 0;
        const sfPct = Number(d.success_fee_percent);
        const closingAmount = computeTotalFee(dealValue, sfPct);
        const closeDate = (d.projected_close_date || '').toString().slice(0, 10);
        if (closeDate && closingAmount > 0) {
          const normalizedPctDisplay = normalizeSuccessFeePercent(sfPct) * 100;
          out.push({
            id: `deal:${d.id}:closing`,
            company_id: '',
            account: name,
            category: 'Closing Fees',
            amount: closingAmount,
            frequency_type: 'one_time',
            frequency_config: { one_time_date: closeDate },
            flow_type: 'cash_in',
            start_date: closeDate,
            end_date: closeDate,
            notes: `naitive Deal — ${name} · Closing Fee (P) · ${normalizedPctDisplay}% of $${dealValue.toLocaleString()}`,
          });
        }

        // Monthly Retainer projection
        const retainer = Number(d.retainer_fee) || 0;
        if (retainer > 0) {
          const startDateStr = (d.contract_start_date || today).toString().slice(0, 10);
          const startD = new Date(startDateStr + 'T00:00:00');
          const dayOfMonth = Number.isFinite(startD.getDate()) ? startD.getDate() : 1;
          // End: cap at projected close date or +24 months from today, whichever is earlier
          const horizon = new Date();
          horizon.setMonth(horizon.getMonth() + 24);
          const endCandidate = closeDate ? new Date(closeDate + 'T00:00:00') : horizon;
          const endDate = endCandidate < horizon ? endCandidate : horizon;
          out.push({
            id: `deal:${d.id}:retainer`,
            company_id: '',
            account: name,
            category: 'Retainers',
            amount: retainer,
            frequency_type: 'monthly_day',
            frequency_config: { day_of_month: dayOfMonth },
            flow_type: 'cash_in',
            start_date: startDateStr,
            end_date: fmtDate(endDate),
            notes: `naitive Deal — ${name} · Monthly Retainer (P)`,
          });
        }

        // Milestone (one-time, halfway between today and close date if configured)
        const milestone = Number(d.milestone_fee) || 0;
        if (milestone > 0 && closeDate) {
          const closeD = new Date(closeDate + 'T00:00:00');
          const now = new Date();
          const mid = closeD > now
            ? new Date((now.getTime() + closeD.getTime()) / 2)
            : closeD;
          const midStr = fmtDate(mid);
          out.push({
            id: `deal:${d.id}:milestone`,
            company_id: '',
            account: name,
            category: 'Milestones',
            amount: milestone,
            frequency_type: 'one_time',
            frequency_config: { one_time_date: midStr },
            flow_type: 'cash_in',
            start_date: midStr,
            end_date: midStr,
            notes: `naitive Deal — ${name} · Milestone (P)`,
          });
        }
      }
      // Apply persisted per-row overrides (excluded dates + series truncation)
      // captured from the cashflow drilldown grid.
      const applied = overrides
        ? out.map((entry) => {
            const ov = overrides[entry.id];
            if (!ov) return entry;
            const cfg = entry.frequency_config || {};
            const existing = cfg.excluded_dates || [];
            const mergedExcluded = Array.from(new Set([...existing, ...(ov.excluded_dates || [])]));
            const nextEnd = ov.end_date
              ? (entry.end_date && entry.end_date < ov.end_date ? entry.end_date : ov.end_date)
              : entry.end_date;
            return {
              ...entry,
              end_date: nextEnd,
              frequency_config: { ...cfg, excluded_dates: mergedExcluded },
            };
          })
        : out;
      setItems(applied);
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [companyId, enabled, overrides]);

  return { items, isLoading };
}