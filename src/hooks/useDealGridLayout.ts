import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import type { Json } from '@/integrations/supabase/types';
import { normalizeDealGrid, DEFAULT_DEAL_GRID, type DealGridItem } from '@/lib/dealGridLayout';

const KEY = 'dealDetailGrid';
const cacheKey = (c: string) => `deal-grid-layout:${c}`;

/** Account-wide Deal Space grid layout stored in company_settings.deals_widgets_config.dealDetailGrid. */
export function useDealGridLayout() {
  const { company } = useCompany();
  const companyId = company?.id ?? null;
  const [items, setItems] = useState<DealGridItem[]>(() => {
    try { const c = companyId && localStorage.getItem(cacheKey(companyId)); return c ? normalizeDealGrid(JSON.parse(c)) : DEFAULT_DEAL_GRID; } catch { return DEFAULT_DEAL_GRID; }
  });
  const [isLoaded, setIsLoaded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    try { const c = localStorage.getItem(cacheKey(companyId)); if (c) setItems(normalizeDealGrid(JSON.parse(c))); } catch { /* ignore */ }
    (async () => {
      const { data } = await supabase.from('company_settings').select('deals_widgets_config').eq('company_id', companyId).maybeSingle();
      if (cancelled) return;
      const saved = (data?.deals_widgets_config as Record<string, unknown> | null)?.[KEY];
      if (Array.isArray(saved)) {
        const n = normalizeDealGrid(saved);
        setItems(n);
        localStorage.setItem(cacheKey(companyId), JSON.stringify(n));
      }
      setIsLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  const persist = useCallback(async (next: DealGridItem[]) => {
    if (!companyId) return;
    const { data: existing } = await supabase.from('company_settings').select('id, deals_widgets_config').eq('company_id', companyId).maybeSingle();
    const merged = { ...((existing?.deals_widgets_config as Record<string, unknown>) || {}), [KEY]: next } as unknown as Json;
    const { error } = existing
      ? await supabase.from('company_settings').update({ deals_widgets_config: merged }).eq('company_id', companyId)
      : await supabase.from('company_settings').insert([{ company_id: companyId, deals_widgets_config: merged }]);
    if (error) console.error('Failed to save deal grid layout:', error);
  }, [companyId]);

  const update = useCallback((next: DealGridItem[]) => {
    if (!companyId || !isLoaded) return; // never overwrite saved layout before it loads
    setItems(next);
    localStorage.setItem(cacheKey(companyId), JSON.stringify(next));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void persist(next); }, 400);
  }, [companyId, isLoaded, persist]);

  const reset = useCallback(() => update(DEFAULT_DEAL_GRID), [update]);

  return { items, update, reset, isLoaded };
}
