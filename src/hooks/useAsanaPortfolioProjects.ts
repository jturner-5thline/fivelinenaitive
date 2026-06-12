import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useVisibilityAwareInterval } from '@/hooks/useVisibilityAwareInterval';

export interface AsanaPortfolioProjectRow {
  gid: string;
  name: string;
  itemType: 'project' | 'portfolio';
  permalink_url: string | null;
  owner: string | null;
  ownerEmail: string | null;
  ownerSource: string | null;
  ownerCandidates: Array<{ name: string | null; email: string | null; source: string | null }>;
  status: 'On Track' | 'At Risk' | 'Off Track' | 'On Hold' | 'Complete' | 'No Status';
  rawStatus: string | null;
  dueOn: string | null;
  startOn: string | null;
}

function mapStatus(raw: string | null): AsanaPortfolioProjectRow['status'] {
  const v = (raw || '').toLowerCase();
  if (!v) return 'No Status';
  if (v.includes('on_track') || v === 'green') return 'On Track';
  if (v.includes('at_risk') || v === 'yellow') return 'At Risk';
  if (v.includes('off_track') || v === 'red' || v.includes('behind')) return 'Off Track';
  if (v.includes('on_hold') || v.includes('hold')) return 'On Hold';
  if (v.includes('complete') || v.includes('achieved')) return 'Complete';
  return 'No Status';
}

export interface UseAsanaPortfolioProjectsResult {
  projects: AsanaPortfolioProjectRow[];
  loading: boolean;
  error: string | null;
  configured: boolean;
  lastSyncedAt: string | null;
  refresh: () => Promise<void>;
}

/** Fetch projects (items) within a specific Asana portfolio. */
export function useAsanaPortfolioProjects(portfolioGid: string | null): UseAsanaPortfolioProjectsResult {
  const { company } = useCompany();
  const companyId = company?.id ?? null;
  const [projects, setProjects] = useState<AsanaPortfolioProjectRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const inFlight = useRef(false);

  const fetchProjects = useCallback(async () => {
    if (!companyId || !portfolioGid || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const { data: integration, error: intErr } = await supabase
        .from('integrations')
        .select('id')
        .eq('type', 'asana')
        .eq('status', 'connected')
        .eq('company_id', companyId)
        .limit(1)
        .maybeSingle();
      if (intErr) throw intErr;
      if (!integration) {
        setConfigured(false);
        setProjects([]);
        return;
      }
      setConfigured(true);
      const { data, error: fnErr } = await supabase.functions.invoke('asana-proxy', {
        body: {
          action: 'portfolio_projects',
          integration_id: integration.id,
          portfolio_gid: portfolioGid,
        },
      });
      if (fnErr) throw fnErr;
      if (!data?.success) throw new Error(data?.error || 'Failed to fetch portfolio projects');
      const normalized: AsanaPortfolioProjectRow[] = (data.projects || []).map((p: any) => ({
        gid: p.gid,
        name: p.name || '(Untitled project)',
        itemType: p.item_type === 'portfolio' ? 'portfolio' : 'project',
        permalink_url: p.permalink_url || null,
        owner: p.owner || null,
        ownerEmail: p.owner_email || null,
        ownerSource: p.owner_source || null,
        ownerCandidates: Array.isArray(p.owner_candidates) ? p.owner_candidates : [],
        status: mapStatus(p.status_type),
        rawStatus: p.status_type || null,
        dueOn: p.due_on || null,
        startOn: p.start_on || null,
      }));
      setProjects(normalized);
      setLastSyncedAt(new Date().toISOString());
    } catch (e) {
      console.error('[AsanaPortfolioProjects] sync failed:', e);
      setError(e instanceof Error ? e.message : 'Failed to sync portfolio projects');
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [companyId, portfolioGid]);

  useEffect(() => {
    if (!companyId || !portfolioGid) return;
    void fetchProjects();
  }, [companyId, portfolioGid, fetchProjects]);
  useVisibilityAwareInterval(
    () => { void fetchProjects(); },
    companyId && portfolioGid ? 6 * 60 * 60 * 1000 : null,
  );

  return { projects, loading, error, configured, lastSyncedAt, refresh: fetchProjects };
}