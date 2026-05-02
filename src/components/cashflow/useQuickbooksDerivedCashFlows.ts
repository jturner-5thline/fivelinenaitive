import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ScheduledCashFlow } from './scheduledCashFlows';

/** Admin-editable mapping rule loaded from `qb_cashflow_mapping_rules`. */
interface MappingRule {
  priority: number;
  match_type: 'include' | 'exclude';
  match_field: 'account' | 'item' | 'either';
  pattern: string;
  target_row: string | null;
  categorized: boolean;
  is_active: boolean;
}

/** Hardcoded fallback rules, used only if the DB table is empty/unreachable. */
const FALLBACK_RULES: MappingRule[] = [
  { priority: 10, match_type: 'exclude', match_field: 'account', pattern: 'financial services', target_row: null, categorized: true, is_active: true },
  { priority: 11, match_type: 'exclude', match_field: 'account', pattern: 'financing programs', target_row: null, categorized: true, is_active: true },
  { priority: 12, match_type: 'exclude', match_field: 'account', pattern: 'tech ',              target_row: null, categorized: true, is_active: true },
  { priority: 20, match_type: 'include', match_field: 'either',  pattern: 'monthly retainer',   target_row: 'Retainers', categorized: true, is_active: true },
  { priority: 21, match_type: 'include', match_field: 'either',  pattern: 'retainer',           target_row: 'Retainers', categorized: true, is_active: true },
  { priority: 30, match_type: 'include', match_field: 'either',  pattern: 'milestone',          target_row: 'Milestones', categorized: true, is_active: true },
  { priority: 40, match_type: 'include', match_field: 'either',  pattern: 'referral',           target_row: 'Referral Fees', categorized: true, is_active: true },
  { priority: 50, match_type: 'include', match_field: 'either',  pattern: 'closing fee',        target_row: 'Closing Fees', categorized: true, is_active: true },
  { priority: 51, match_type: 'include', match_field: 'either',  pattern: 'success fee',        target_row: 'Closing Fees', categorized: true, is_active: true },
  { priority: 52, match_type: 'include', match_field: 'either',  pattern: 'advisory fee',       target_row: 'Closing Fees', categorized: true, is_active: true },
  { priority: 53, match_type: 'include', match_field: 'account', pattern: 'debt fee revenue',   target_row: 'Closing Fees', categorized: true, is_active: true },
  { priority: 54, match_type: 'include', match_field: 'either',  pattern: 'consulting fee',     target_row: 'Closing Fees', categorized: true, is_active: true },
  { priority: 90, match_type: 'include', match_field: 'account', pattern: 'debt',               target_row: 'Debt Advisory Revenue', categorized: false, is_active: true },
  { priority: 91, match_type: 'include', match_field: 'account', pattern: 'retainer revenue',   target_row: 'Debt Advisory Revenue', categorized: false, is_active: true },
  { priority: 92, match_type: 'include', match_field: 'account', pattern: 'referral revenue',   target_row: 'Debt Advisory Revenue', categorized: false, is_active: true },
];

function ruleMatches(rule: MappingRule, account: string, item: string): boolean {
  const p = rule.pattern.toLowerCase();
  if (!p) return false;
  if (rule.match_field === 'account') return account.includes(p);
  if (rule.match_field === 'item') return item.includes(p);
  return account.includes(p) || item.includes(p);
}

/**
 * Apply rules in priority order. First matching rule wins.
 *  - exclude → return null (drop the line entirely)
 *  - include → return the target row (or null if blank)
 */
function applyRules(
  rules: MappingRule[],
  accountName: string | null | undefined,
  itemName: string | null | undefined,
): { row: string; categorized: boolean } | null {
  const account = (accountName || '').toLowerCase();
  const item = (itemName || '').toLowerCase();
  for (const r of rules) {
    if (!r.is_active) continue;
    if (!ruleMatches(r, account, item)) continue;
    if (r.match_type === 'exclude') return null;
    if (r.target_row) return { row: r.target_row, categorized: r.categorized };
  }
  return null;
}

/**
 * Build read-only ScheduledCashFlow entries from QuickBooks invoice line items.
 * These entries are tagged with id prefix `qb:` and a `notes` line of the form
 * `[QuickBooks — <account>] <invoice ref>` so the drilldown popover can display
 * provenance.
 *
 * The QB token table is org-wide (4 realms), and per project policy QuickBooks
 * data is shared across the workspace — so we do not filter by company_id.
 *
 * Mapping rules are loaded from the admin-editable `qb_cashflow_mapping_rules`
 * table. If the table is empty/unreachable, falls back to the original
 * hardcoded ruleset so behavior degrades gracefully.
 */
export function useQuickbooksDerivedCashFlows(enabled: boolean) {
  const [items, setItems] = useState<ScheduledCashFlow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled) { setItems([]); return; }
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const { data: ruleRows } = await supabase
        .from('qb_cashflow_mapping_rules')
        .select('priority, match_type, match_field, pattern, target_row, categorized, is_active')
        .eq('is_active', true)
        .order('priority', { ascending: true });
      const rules: MappingRule[] = (ruleRows && ruleRows.length > 0)
        ? (ruleRows as unknown as MappingRule[])
        : FALLBACK_RULES;
      const minDate = new Date();
      minDate.setFullYear(minDate.getFullYear() - 3);
      const { data, error } = await supabase
        .from('quickbooks_invoices')
        .select('id, qb_id, doc_number, customer_name, txn_date, total_amt, metadata, realm_id')
        .gte('txn_date', minDate.toISOString().slice(0, 10))
        .limit(2000);
      if (cancelled) return;
      if (error || !data) {
        setItems([]); setIsLoading(false); return;
      }
      const out: ScheduledCashFlow[] = [];
      for (const inv of data as any[]) {
        const lines = (inv.metadata?.Line || []) as any[];
        if (!Array.isArray(lines) || lines.length === 0) continue;
        let lineIdx = 0;
        for (const line of lines) {
          if (line?.DetailType !== 'SalesItemLineDetail') continue;
          const detail = line.SalesItemLineDetail || {};
          const accountName = detail?.ItemAccountRef?.name as string | undefined;
          const itemName = detail?.ItemRef?.name as string | undefined;
          const mapped = applyRules(rules, accountName, itemName);
          if (!mapped) continue;
          const amount = Number(line.Amount);
          if (!Number.isFinite(amount) || amount === 0) continue;
          const dateStr = (inv.txn_date || '').slice(0, 10);
          if (!dateStr) continue;
          out.push({
            id: `qb:${inv.id}:${lineIdx}`,
            company_id: '',
            account: inv.customer_name || 'QuickBooks',
            category: mapped.row,
            amount,
            frequency_type: 'one_time',
            frequency_config: { one_time_date: dateStr },
            flow_type: 'cash_in',
            start_date: dateStr,
            end_date: dateStr,
            notes: `QuickBooks — ${accountName || itemName || 'Income'}${inv.doc_number ? ` · Inv #${inv.doc_number}` : ''}${mapped.categorized ? '' : ' (uncategorized)'}`,
          });
          lineIdx++;
        }
      }
      setItems(out);
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [enabled]);

  return { items, isLoading };
}
