import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

export interface AsanaGoalRow {
  id: string;            // local row id (asana_gid)
  asanaGid: string;
  workspaceGid: string | null;
  teamGid: string | null;
  title: string;
  owner: string;
  ownerEmail: string | null;
  status: 'On Track' | 'At Risk' | 'Behind' | 'Achieved';
  rawStatus: string | null;
  due: string;           // YYYY-MM-DD
  url: string | null;
  syncedAt: string;      // ISO
  source: 'asana';
  /** Asana time period display name (e.g. "Q2 FY26", "H1 FY26", "Q2 2026"). May be null. */
  timePeriod: string | null;
}

function mapStatus(raw: string | null | undefined, isCompleted = false): AsanaGoalRow['status'] {
  if (isCompleted) return 'Achieved';
  const v = (raw || '').toLowerCase();
  if (!v) return 'On Track';
  if (v.includes('achieved') || v.includes('complete') || v === 'green_complete') return 'Achieved';
  if (v.includes('on_track') || v === 'on track' || v === 'green' || v.includes('on-track')) return 'On Track';
  if (v.includes('at_risk') || v.includes('at risk') || v === 'yellow') return 'At Risk';
  if (v.includes('off_track') || v.includes('off track') || v.includes('behind') || v.includes('blocked') || v === 'red') return 'Behind';
  if (v.includes('missed') || v.includes('dropped')) return 'Behind';
  // Closest equivalent fallback
  return 'On Track';
}

interface AsanaGoalApi {
  gid: string;
  name?: string;
  due_on?: string | null;
  permalink_url?: string | null;
  owner?: { name?: string; email?: string; gid?: string } | null;
  team?: { name?: string; gid?: string } | null;
  status?: string | null;
  progress_status?: string | null;
  current_status_update?: { status_type?: string; title?: string } | null;
  time_period?: { display_name?: string | null; gid?: string } | null;
}

export interface UseAsanaGoalsResult {
  goals: AsanaGoalRow[];
  loading: boolean;
  error: string | null;
  lastSyncedAt: string | null;
  configured: boolean;          // Asana is connected
  refresh: () => Promise<void>;
}

/** Fetch & normalize Asana Goals for the current company. */
export function useAsanaGoals(): UseAsanaGoalsResult {
  const { company } = useCompany();
  const companyId = company?.id ?? null;
  const [goals, setGoals] = useState<AsanaGoalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const inFlight = useRef(false);

  const fetchGoals = useCallback(async () => {
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
        setGoals([]);
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
          action: 'list_goals',
          integration_id: integration.id,
          workspace_gid: workspaceGid,
        },
      });

      if (fnErr) throw fnErr;
      if (!data?.success) {
        throw new Error(data?.error || 'Failed to fetch Asana Goals');
      }

      const now = new Date().toISOString();
      const normalized: AsanaGoalRow[] = (data.goals as AsanaGoalApi[]).map((g) => {
        const rawStatus =
          g.current_status_update?.status_type ||
          g.progress_status ||
          g.status ||
          null;
        const status = mapStatus(rawStatus);
        return {
          id: g.gid,
          asanaGid: g.gid,
          workspaceGid,
          teamGid: g.team?.gid || null,
          title: g.name || '(Untitled goal)',
          owner: g.owner?.name || '—',
          ownerEmail: g.owner?.email || null,
          status,
          rawStatus,
          due: g.due_on || '',
          url: g.permalink_url || null,
          syncedAt: now,
          source: 'asana',
          timePeriod: g.time_period?.display_name || null,
        };
      });

      setGoals(normalized);
      setLastSyncedAt(now);
    } catch (e) {
      console.error('[AsanaGoals] sync failed:', e);
      setError(e instanceof Error ? e.message : 'Failed to sync Asana Goals');
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    void fetchGoals();
    const id = setInterval(() => { void fetchGoals(); }, 6 * 60 * 60 * 1000);
    return () => clearInterval(id);
  }, [companyId, fetchGoals]);

  return { goals, loading, error, lastSyncedAt, configured, refresh: fetchGoals };
}