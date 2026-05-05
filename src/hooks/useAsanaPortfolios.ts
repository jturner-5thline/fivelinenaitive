import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

export interface AsanaPortfolioRow {
  gid: string;
  name: string;
  permalink_url: string | null;
  owner: string | null;
  projectCount: number;
  onTrack: number;
  atRisk: number;
  offTrack: number;
  noStatus: number;
}

export interface UseAsanaPortfoliosResult {
  portfolios: AsanaPortfolioRow[];
  loading: boolean;
  error: string | null;
  lastSyncedAt: string | null;
  configured: boolean;
  refresh: () => Promise<void>;
}

export function useAsanaPortfolios(): UseAsanaPortfoliosResult {
  const { company } = useCompany();
  const companyId = company?.id ?? null;
  const [portfolios, setPortfolios] = useState<AsanaPortfolioRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const inFlight = useRef(false);

  const fetchPortfolios = useCallback(async () => {
    if (!companyId || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const { data: integration, error: intErr } = await supabase
        .from('integrations')
        .select('id, config')
        .eq('type', 'asana')
        .eq('status', 'connected')
        .eq('company_id', companyId)
        .limit(1)
        .maybeSingle();
      if (intErr) throw intErr;
      if (!integration) {
        setConfigured(false);
        setPortfolios([]);
        return;
      }
      setConfigured(true);
      const cfg = (integration.config || {}) as Record<string, string>;
      const workspaceGid = cfg.workspace_gid;
      if (!workspaceGid) {
        setError('Asana workspace not configured');
        return;
      }

      const { data, error: fnErr } = await supabase.functions.invoke('asana-proxy', {
        body: {
          action: 'list_portfolios',
          integration_id: integration.id,
          workspace_gid: workspaceGid,
        },
      });
      if (fnErr) throw fnErr;
      if (!data?.success) throw new Error(data?.error || 'Failed to fetch Asana Portfolios');

      const normalized: AsanaPortfolioRow[] = (data.portfolios || []).map((p: any) => ({
        gid: p.gid,
        name: p.name || '(Untitled portfolio)',
        permalink_url: p.permalink_url || null,
        owner: p.owner?.name || null,
        projectCount: p.project_count || 0,
        onTrack: p.status_counts?.on_track || 0,
        atRisk: p.status_counts?.at_risk || 0,
        offTrack: p.status_counts?.off_track || 0,
        noStatus: p.status_counts?.no_status || 0,
      }));
      setPortfolios(normalized);
      setLastSyncedAt(new Date().toISOString());
    } catch (e) {
      console.error('[AsanaPortfolios] sync failed:', e);
      setError(e instanceof Error ? e.message : 'Failed to sync Asana Portfolios');
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    void fetchPortfolios();
    // Auto-refresh every 6 hours
    const id = setInterval(() => { void fetchPortfolios(); }, 6 * 60 * 60 * 1000);
    return () => clearInterval(id);
  }, [companyId, fetchPortfolios]);

  return { portfolios, loading, error, lastSyncedAt, configured, refresh: fetchPortfolios };
}