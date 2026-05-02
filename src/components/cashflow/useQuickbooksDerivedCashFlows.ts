import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ScheduledCashFlow } from './scheduledCashFlows';

/**
 * Map a QuickBooks income account / item name to one of the four Debt Advisory
 * sub-rows in the Cash Flow weekly grid. Returns null when the line is clearly
 * not Debt Advisory revenue (e.g. FinServ Recurring Advisory). Returns
 * 'Debt Advisory Revenue' as the bucket-of-last-resort for Debt-tagged income
 * we can't categorize to a child row.
 */
function mapQbAccountToRow(
  accountName: string | null | undefined,
  itemName: string | null | undefined,
): { row: string; categorized: boolean } | null {
  const a = (accountName || '').toLowerCase();
  const i = (itemName || '').toLowerCase();
  const hay = `${a} ${i}`;

  // Exclude FinServ / Tech / non-Debt revenue explicitly.
  if (a.startsWith('financial services') || a.includes('financing programs') || a.includes('tech ')) {
    return null;
  }

  // Retainers
  if (hay.includes('retainer')) return { row: 'Retainers', categorized: true };
  if (hay.includes('monthly retainer')) return { row: 'Retainers', categorized: true };

  // Milestones (must check before generic "fee")
  if (hay.includes('milestone')) return { row: 'Milestones', categorized: true };

  // Referral
  if (hay.includes('referral')) return { row: 'Referral Fees', categorized: true };

  // Closing / Success / Advisory fees
  if (hay.includes('closing fee') || hay.includes('success fee') || hay.includes('advisory fee')) {
    return { row: 'Closing Fees', categorized: true };
  }
  if (a.startsWith('debt fee revenue') || hay.includes('consulting fee')) {
    return { row: 'Closing Fees', categorized: true };
  }

  // Anything else under a Debt-flagged account → bucket into parent
  if (a.includes('debt') || a.startsWith('retainer revenue') || a.startsWith('referral revenue')) {
    return { row: 'Debt Advisory Revenue', categorized: false };
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
 */
export function useQuickbooksDerivedCashFlows(enabled: boolean) {
  const [items, setItems] = useState<ScheduledCashFlow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled) { setItems([]); return; }
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      // Pull recent invoices (last ~3 years through 1 year forward to capture
      // any future-dated docs). The Cash Flow grid clamps to its own range.
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
          const mapped = mapQbAccountToRow(accountName, itemName);
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