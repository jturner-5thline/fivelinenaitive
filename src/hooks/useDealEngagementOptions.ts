import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAdminCompanyOverride } from '@/contexts/AdminCompanyOverrideContext';
import { ENGAGEMENT_TYPE_CONFIG } from '@/types/deal';
import type { Json } from '@/integrations/supabase/types';

export interface EngagementOption { id: string; label: string }

export const DEFAULT_ENGAGEMENT_OPTIONS: EngagementOption[] = Object.entries(ENGAGEMENT_TYPE_CONFIG)
  .map(([id, c]) => ({ id, label: c.label }));

const QUERY_KEY = ['deal-engagement-options'];

export function slugifyEngagement(label: string) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function sanitize(list: unknown): EngagementOption[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: EngagementOption[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const label = String((item as any).label ?? '').trim();
    const id = String((item as any).id ?? '').trim() || slugifyEngagement(label);
    if (!label || !id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label });
  }
  return out;
}

async function resolveCompanyId(override: string | null): Promise<string | null> {
  if (override) return override;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('company_members').select('company_id').eq('user_id', user.id).maybeSingle();
  return data?.company_id ?? null;
}

/** Per-workspace Engagement dropdown options (stored in company_settings.deal_info_layout.engagement_options). */
export function useDealEngagementOptions() {
  const override = useAdminCompanyOverride();
  const queryClient = useQueryClient();
  const [companyId, setCompanyId] = useState<string | null>(override?.companyId ?? null);

  useEffect(() => {
    let cancelled = false;
    resolveCompanyId(override?.companyId ?? null).then((id) => { if (!cancelled) setCompanyId(id); });
    return () => { cancelled = true; };
  }, [override?.companyId]);

  const { data, isLoading } = useQuery({
    queryKey: [...QUERY_KEY, companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_settings').select('deal_info_layout').eq('company_id', companyId!).maybeSingle();
      if (error) throw error;
      const raw = (data?.deal_info_layout as any)?.engagement_options;
      const list = sanitize(raw);
      return list.length > 0 ? list : DEFAULT_ENGAGEMENT_OPTIONS;
    },
  });

  const options = data ?? DEFAULT_ENGAGEMENT_OPTIONS;

  const saveOptions = useCallback(async (next: EngagementOption[]) => {
    if (!companyId) throw new Error('No company resolved');
    const cleaned = sanitize(next);
    const { data: existing, error: readErr } = await supabase
      .from('company_settings').select('id, deal_info_layout').eq('company_id', companyId).maybeSingle();
    if (readErr) throw readErr;
    const prev = (existing?.deal_info_layout && typeof existing.deal_info_layout === 'object' && !Array.isArray(existing.deal_info_layout))
      ? existing.deal_info_layout as Record<string, unknown> : {};
    const layout = { ...prev, engagement_options: cleaned } as unknown as Json;
    if (existing) {
      const { error } = await supabase.from('company_settings').update({ deal_info_layout: layout }).eq('company_id', companyId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('company_settings').insert({ company_id: companyId, deal_info_layout: layout });
      if (error) throw error;
    }
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }, [companyId, queryClient]);

  const labelFor = useCallback((value?: string | null) => {
    if (!value) return '';
    return options.find(o => o.id === value)?.label
      ?? (ENGAGEMENT_TYPE_CONFIG as Record<string, { label: string }>)[value]?.label
      ?? value.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }, [options]);

  return useMemo(() => ({ options, isLoading, companyId, saveOptions, labelFor }), [options, isLoading, companyId, saveOptions, labelFor]);
}
