import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import type { Json } from '@/integrations/supabase/types';

export type DealWidgetKey = 'tasks' | 'openItems' | 'calendar' | 'hoursFees' | 'statusReport' | 'fundingMix' | 'milestones';

export type DealWidgetVisibility = Record<DealWidgetKey, boolean>;

export const DEAL_WIDGET_LABELS: { key: DealWidgetKey; label: string }[] = [
  { key: 'tasks', label: 'Tasks' },
  { key: 'milestones', label: 'Deal Milestones' },
  { key: 'fundingMix', label: 'Funding Source Mix' },
  { key: 'openItems', label: 'Open Items' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'hoursFees', label: 'Hours & Fees' },
  { key: 'statusReport', label: 'Status Report' },
];

const DEFAULTS: DealWidgetVisibility = {
  tasks: true, openItems: true, calendar: true, hoursFees: true, statusReport: true, fundingMix: true, milestones: true,
};
const DEFAULT_ORDER: DealWidgetKey[] = DEAL_WIDGET_LABELS.map((w) => w.key);

const CONFIG_KEY = 'dealDetailVisibility';
const ORDER_KEY = 'dealDetailOrder';
const cacheKey = (companyId: string) => `deal-widget-visibility:${companyId}`;
const orderCacheKey = (companyId: string) => `deal-widget-order:${companyId}`;

/** Keep known keys in saved order, append any new keys at the end. */
function normalizeOrder(raw: unknown): DealWidgetKey[] {
  const saved = Array.isArray(raw) ? (raw.filter((k) => DEFAULT_ORDER.includes(k as DealWidgetKey)) as DealWidgetKey[]) : [];
  const uniq = Array.from(new Set(saved));
  return [...uniq, ...DEFAULT_ORDER.filter((k) => !uniq.includes(k))];
}

function readCache<T>(key: string): T | null {
  try { const c = localStorage.getItem(key); return c ? JSON.parse(c) : null; } catch { return null; }
}

/**
 * Account-wide (company-level) visibility + order of Deal Detail widgets.
 * Stored in company_settings.deals_widgets_config.{dealDetailVisibility,dealDetailOrder}.
 */
export function useDealWidgetVisibility() {
  const { company } = useCompany();
  const companyId = company?.id ?? null;
  const [visibility, setVisibility] = useState<DealWidgetVisibility>(() => {
    const c = companyId ? readCache<Partial<DealWidgetVisibility>>(cacheKey(companyId)) : null;
    return c ? { ...DEFAULTS, ...c } : DEFAULTS;
  });
  const [order, setOrderState] = useState<DealWidgetKey[]>(() =>
    normalizeOrder(companyId ? readCache(orderCacheKey(companyId)) : null),
  );

  useEffect(() => {
    if (!companyId) return;
    const c = readCache<Partial<DealWidgetVisibility>>(cacheKey(companyId));
    if (c) setVisibility({ ...DEFAULTS, ...c });
    const o = readCache(orderCacheKey(companyId));
    if (o) setOrderState(normalizeOrder(o));
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('company_settings')
        .select('deals_widgets_config')
        .eq('company_id', companyId)
        .maybeSingle();
      if (cancelled) return;
      const all = data?.deals_widgets_config as any;
      const cfg = all?.[CONFIG_KEY];
      if (cfg && typeof cfg === 'object') {
        const next = { ...DEFAULTS, ...cfg };
        setVisibility(next);
        localStorage.setItem(cacheKey(companyId), JSON.stringify(next));
      }
      if (Array.isArray(all?.[ORDER_KEY])) {
        const next = normalizeOrder(all[ORDER_KEY]);
        setOrderState(next);
        localStorage.setItem(orderCacheKey(companyId), JSON.stringify(next));
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  const persist = useCallback(async (patch: Record<string, unknown>) => {
    if (!companyId) return null;
    const { data: existing } = await supabase
      .from('company_settings')
      .select('id, deals_widgets_config')
      .eq('company_id', companyId)
      .maybeSingle();
    const merged = { ...((existing?.deals_widgets_config as any) || {}), ...patch } as unknown as Json;
    const { error } = existing
      ? await supabase.from('company_settings').update({ deals_widgets_config: merged }).eq('company_id', companyId)
      : await supabase.from('company_settings').insert([{ company_id: companyId, deals_widgets_config: merged }]);
    if (error) console.error('Failed to save deal widget settings:', error);
    return error;
  }, [companyId]);

  const setWidgetVisible = useCallback(async (key: DealWidgetKey, visible: boolean) => {
    if (!companyId) return;
    const next = { ...visibility, [key]: visible };
    setVisibility(next);
    localStorage.setItem(cacheKey(companyId), JSON.stringify(next));
    return persist({ [CONFIG_KEY]: next });
  }, [companyId, visibility, persist]);

  const setOrder = useCallback(async (next: DealWidgetKey[]) => {
    if (!companyId) return;
    const norm = normalizeOrder(next);
    setOrderState(norm);
    localStorage.setItem(orderCacheKey(companyId), JSON.stringify(norm));
    return persist({ [ORDER_KEY]: norm });
  }, [companyId, persist]);

  const orderIndex = useCallback((key: DealWidgetKey) => order.indexOf(key), [order]);

  return { visibility, setWidgetVisible, order, setOrder, orderIndex };
}
