import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import type { Json } from '@/integrations/supabase/types';

export type DealWidgetKey = 'tasks' | 'openItems' | 'calendar' | 'hoursFees' | 'statusReport' | 'fundingMix';

export type DealWidgetVisibility = Record<DealWidgetKey, boolean>;

export const DEAL_WIDGET_LABELS: { key: DealWidgetKey; label: string }[] = [
  { key: 'tasks', label: 'Tasks' },
  { key: 'fundingMix', label: 'Funding Source Mix' },
  { key: 'openItems', label: 'Open Items' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'hoursFees', label: 'Hours & Fees' },
  { key: 'statusReport', label: 'Status Report' },
];

const DEFAULTS: DealWidgetVisibility = {
  tasks: true, openItems: true, calendar: true, hoursFees: true, statusReport: true, fundingMix: true,
};

const CONFIG_KEY = 'dealDetailVisibility';
const cacheKey = (companyId: string) => `deal-widget-visibility:${companyId}`;

/**
 * Account-wide (company-level) visibility of Deal Detail widgets.
 * Stored in company_settings.deals_widgets_config.dealDetailVisibility.
 */
export function useDealWidgetVisibility() {
  const { company } = useCompany();
  const companyId = company?.id ?? null;
  const [visibility, setVisibility] = useState<DealWidgetVisibility>(() => {
    if (!companyId) return DEFAULTS;
    try {
      const c = localStorage.getItem(cacheKey(companyId));
      return c ? { ...DEFAULTS, ...JSON.parse(c) } : DEFAULTS;
    } catch { return DEFAULTS; }
  });

  useEffect(() => {
    if (!companyId) return;
    try {
      const c = localStorage.getItem(cacheKey(companyId));
      if (c) setVisibility({ ...DEFAULTS, ...JSON.parse(c) });
    } catch { /* ignore */ }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('company_settings')
        .select('deals_widgets_config')
        .eq('company_id', companyId)
        .maybeSingle();
      if (cancelled) return;
      const cfg = (data?.deals_widgets_config as any)?.[CONFIG_KEY];
      if (cfg && typeof cfg === 'object') {
        const next = { ...DEFAULTS, ...cfg };
        setVisibility(next);
        localStorage.setItem(cacheKey(companyId), JSON.stringify(next));
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  const setWidgetVisible = useCallback(async (key: DealWidgetKey, visible: boolean) => {
    if (!companyId) return;
    const next = { ...visibility, [key]: visible };
    setVisibility(next);
    localStorage.setItem(cacheKey(companyId), JSON.stringify(next));
    const { data: existing } = await supabase
      .from('company_settings')
      .select('id, deals_widgets_config')
      .eq('company_id', companyId)
      .maybeSingle();
    const merged = { ...((existing?.deals_widgets_config as any) || {}), [CONFIG_KEY]: next } as unknown as Json;
    const { error } = existing
      ? await supabase.from('company_settings').update({ deals_widgets_config: merged }).eq('company_id', companyId)
      : await supabase.from('company_settings').insert([{ company_id: companyId, deals_widgets_config: merged }]);
    if (error) console.error('Failed to save deal widget visibility:', error);
    return error;
  }, [companyId, visibility]);

  return { visibility, setWidgetVisible };
}
