import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DealCriteria } from './useLenderMatching';
import { useDealMatchingCriteria } from './useDealMatchingCriteria';
import { htmlToPlainText } from '@/lib/htmlToPlainText';

/**
 * Fetches ALL deal data sources and builds an enriched DealCriteria object.
 * Sources: deal row, deal_writeups, deal_lenders (pass reasons), deal_space_notes.
 */
export function useDealEnrichedCriteria(dealId: string | undefined) {
  const { criteria: savedCriteria } = useDealMatchingCriteria(dealId);
  const [enrichedData, setEnrichedData] = useState<{
    description?: string;
    dealNotes?: string[];
    existingLenderFeedback?: string[];
    revenue?: number;
    ebitda?: number;
    autoDetected: Record<string, boolean>;
  }>({ autoDetected: {} });
  const [isLoading, setIsLoading] = useState(true);
  const [dealRow, setDealRow] = useState<{
    value?: number;
    dealTypes?: string[];
    narrative?: string;
    industry?: string;
    company?: string;
  }>({});
  const [writeupData, setWriteupData] = useState<Record<string, unknown>>({});

  const fetchAllData = useCallback(async () => {
    if (!dealId) { setIsLoading(false); return; }

    setIsLoading(true);
    try {
      // Fetch all sources in parallel
      const [dealRes, writeupRes, lendersRes, notesRes] = await Promise.all([
        supabase.from('deals').select('value, deal_type, company, stage, narrative').eq('id', dealId).maybeSingle(),
        supabase.from('deal_writeups').select('description, industry, location, capital_ask, last_year_revenue, this_year_revenue, gross_margins, profitability, sponsorship, cash_burn_ok, b2b_b2c, deal_type, use_of_funds, existing_debt_details, customer_base, billing_model, company_name').eq('deal_id', dealId).maybeSingle(),
        supabase.from('deal_lenders').select('name, pass_reason, tracking_status, notes').eq('deal_id', dealId),
        supabase.from('deal_space_notes').select('content, title').eq('deal_id', dealId).limit(20),
      ]);

      const deal = dealRes.data;
      const writeup = writeupRes.data;
      const lenders = lendersRes.data || [];
      const notes = notesRes.data || [];

      // Parse deal row
      setDealRow({
        value: deal?.value || undefined,
        dealTypes: deal?.deal_type ? [deal.deal_type] : undefined,
        narrative: deal?.narrative || undefined,
        company: deal?.company || undefined,
      });

      // Parse writeup
      if (writeup) setWriteupData(writeup as Record<string, unknown>);

      // Extract revenue from writeup
      const parseRevenue = (s: string | null | undefined): number | undefined => {
        if (!s) return undefined;
        const cleaned = s.replace(/[$,\s]/g, '').toLowerCase();
        if (cleaned.includes('m')) return parseFloat(cleaned) * 1000000 || undefined;
        if (cleaned.includes('k')) return parseFloat(cleaned) * 1000 || undefined;
        const n = parseFloat(cleaned);
        return isNaN(n) ? undefined : n;
      };

      const revenue = parseRevenue(writeup?.this_year_revenue as string) || parseRevenue(writeup?.last_year_revenue as string);

      // Extract lender feedback (pass reasons)
      const feedback = lenders
        .filter(l => l.pass_reason && l.tracking_status === 'passed')
        .map(l => `${l.name}: ${l.pass_reason}`);

      // Extract deal space notes as plain text
      const noteTexts = notes
        .map(n => htmlToPlainText(n.content || ''))
        .filter(t => t.length > 10)
        .slice(0, 10);

      const autoDetected: Record<string, boolean> = {};
      // Auto-detect industry from writeup description if not explicitly set
      if (!savedCriteria.industry && writeup?.industry) {
        autoDetected['industry'] = true;
      }

      setEnrichedData({
        description: writeup?.description as string || deal?.narrative || undefined,
        dealNotes: noteTexts.length > 0 ? noteTexts : undefined,
        existingLenderFeedback: feedback.length > 0 ? feedback : undefined,
        revenue,
        autoDetected,
      });
    } catch (err) {
      console.error('Error fetching enriched deal criteria:', err);
    } finally {
      setIsLoading(false);
    }
  }, [dealId, savedCriteria.industry]);

  useEffect(() => { fetchAllData(); }, [fetchAllData]);

  // Build the final enriched criteria object
  const criteria = useMemo<DealCriteria>(() => {
    const writeup = writeupData as Record<string, string | boolean | null>;
    return {
      // Core fields - savedCriteria (manual) takes priority, then writeup, then deal row
      industry: savedCriteria.industry || (writeup?.industry as string) || undefined,
      dealValue: dealRow.value || undefined,
      capitalAsk: (writeup?.capital_ask as string) || undefined,
      dealTypes: dealRow.dealTypes || (writeup?.deal_type ? [writeup.deal_type as string] : undefined),
      geo: (writeup?.location as string) || undefined,
      cashBurnOk: savedCriteria.cashBurnOk ?? (writeup?.cash_burn_ok as boolean | undefined),
      sponsorship: savedCriteria.sponsorship || (writeup?.sponsorship as string) || undefined,
      b2bB2c: savedCriteria.b2bB2c || (writeup?.b2b_b2c as string) || undefined,
      // New enriched fields
      revenue: enrichedData.revenue,
      companyDescription: enrichedData.description,
      dealNotes: enrichedData.dealNotes,
      existingLenderFeedback: enrichedData.existingLenderFeedback,
      useOfFunds: (writeup?.use_of_funds as string) || undefined,
      existingDebt: (writeup?.existing_debt_details as string) || undefined,
      grossMargins: (writeup?.gross_margins as string) || undefined,
      profitability: (writeup?.profitability as string) || undefined,
    };
  }, [savedCriteria, writeupData, dealRow, enrichedData]);

  return {
    criteria,
    isLoading,
    autoDetected: enrichedData.autoDetected,
    refetch: fetchAllData,
  };
}
