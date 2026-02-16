import { useMemo } from 'react';
import { DealWriteUpData } from '@/components/deal/DealWriteUp';
import { FlexSyncRecord } from '@/hooks/useFlexSyncHistory';

/**
 * Compares current writeup data against the last successful FLEx sync payload
 * and returns the set of field keys that have changed.
 */
export function useFlexChangedFields(
  data: DealWriteUpData,
  latestSync: FlexSyncRecord | null | undefined,
  isPublishedOnFlex: boolean
): Set<string> {
  return useMemo(() => {
    const changed = new Set<string>();

    // Only show changes if deal has been published to FLEx at least once
    if (!isPublishedOnFlex || !latestSync?.payload) return changed;

    const payload = latestSync.payload as Record<string, unknown>;
    // The payload is nested: { event: "sync_deals", deals: [{ ... }] }
    const deals = payload.deals as Array<Record<string, unknown>> | undefined;
    const synced = deals?.[0];
    if (!synced) return changed;

    // Simple value comparison helper
    const compare = (fieldKey: string, currentVal: unknown, syncedKey: string) => {
      const syncedVal = synced[syncedKey];
      // Treat undefined/null/empty string as equivalent
      const norm = (v: unknown) => {
        if (v === undefined || v === null || v === '') return '';
        return String(v);
      };
      if (norm(currentVal) !== norm(syncedVal)) {
        changed.add(fieldKey);
      }
    };

    // Compare scalar fields
    compare('companyName', data.companyName, 'company_name');
    compare('companyUrl', data.companyUrl, 'company_url');
    compare('linkedinUrl', data.linkedinUrl, 'linkedin_url');
    compare('description', data.description, 'description');
    compare('location', data.location, 'state');
    compare('yearFounded', data.yearFounded, 'year_founded');
    compare('headcount', data.headcount, 'headcount');
    compare('profitability', data.profitability, 'profitability');
    compare('grossMargins', data.grossMargins, 'gross_margins');
    compare('capitalAsk', data.capitalAsk, 'capital_ask');
    compare('accountingSystem', data.accountingSystem, 'accounting_system');
    compare('useOfFunds', data.useOfFunds, 'use_of_funds');
    compare('existingDebtDetails', data.existingDebtDetails, 'existing_debt');

    // Compare joined fields
    compare('industries', data.industries?.join(', ') || '', 'industry');
    compare('dealTypes', data.dealTypes?.join(', ') || '', 'deal_type');
    compare('billingModels', data.billingModels?.join(', ') || '', 'billing_model');

    // Compare JSON arrays by stringifying
    const jsonCompare = (fieldKey: string, currentVal: unknown, syncedKey: string) => {
      const syncedVal = synced[syncedKey];
      const normJson = (v: unknown) => {
        if (!v || (Array.isArray(v) && v.length === 0)) return '[]';
        try { return JSON.stringify(v); } catch { return '[]'; }
      };
      if (normJson(currentVal) !== normJson(syncedVal)) {
        changed.add(fieldKey);
      }
    };

    jsonCompare('keyItems', data.keyItems, 'key_items');
    jsonCompare('companyHighlights', data.companyHighlights, 'company_highlights');
    jsonCompare('financialYears', data.financialYears, 'financial_years');
    jsonCompare('financialComments', data.financialComments, 'financial_comments');
    jsonCompare('team', data.team?.filter(m => m.name.trim()), 'team');
    jsonCompare('visibleMetrics', data.visibleMetrics, 'visible_metrics');

    return changed;
  }, [data, latestSync, isPublishedOnFlex]);
}
