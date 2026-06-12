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
  /** Real progress 0-100 from Asana metric, when available. */
  progressPercent: number | null;
  /** Display string for current value (e.g. "42 / 100" or "$1.2M / $5M"). */
  progressDisplay: string | null;
  /** Structured metric details from Asana, when available. */
  metric: {
    currentValue: number | null;
    targetValue: number | null;
    initialValue: number | null;
    unit: string | null;
    progressSource: string | null;
    currentDisplay: string | null;
  } | null;
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
  metric?: {
    current_display_value?: string | null;
    current_number_value?: number | null;
    target_number_value?: number | null;
    initial_number_value?: number | null;
    unit?: string | null;
    precision?: number | null;
    progress_source?: string | null;
  } | null;
}

export interface UseAsanaGoalsResult {
  goals: AsanaGoalRow[];
  loading: boolean;
  error: string | null;
  lastSyncedAt: string | null;
  configured: boolean;          // Asana is connected
  refresh: () => Promise<void>;
  /** Lazily fetch Asana supporting (child) goals for a given parent goal gid. */
  fetchSubgoals: (parentGid: string) => Promise<AsanaGoalRow[]>;
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
  const integrationIdRef = useRef<string | null>(null);
  const workspaceGidRef = useRef<string | null>(null);

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
      integrationIdRef.current = integration.id;
      workspaceGidRef.current = workspaceGid;

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
      if (Array.isArray(data.goals) && data.goals.length > 0) {
        // Diagnostic: verify owner shape coming back from Asana proxy.
        // eslint-disable-next-line no-console
        console.log('[AsanaGoals] first raw goal:', data.goals[0]);
      }
      const normalized: AsanaGoalRow[] = (data.goals as AsanaGoalApi[]).map((g) => {
        const rawStatus =
          g.current_status_update?.status_type ||
          g.progress_status ||
          g.status ||
          null;
        const status = mapStatus(rawStatus);
        const m = g.metric || null;
        let progressPercent: number | null = null;
        if (m && typeof m.current_number_value === 'number' && typeof m.target_number_value === 'number') {
          const start = typeof m.initial_number_value === 'number' ? m.initial_number_value : 0;
          const span = m.target_number_value - start;
          if (span !== 0) {
            const raw = ((m.current_number_value - start) / span) * 100;
            progressPercent = Math.max(0, Math.min(100, Math.round(raw)));
          } else if (m.current_number_value >= m.target_number_value) {
            progressPercent = 100;
          }
        }
        if (progressPercent === null && status === 'Achieved') progressPercent = 100;
        const progressDisplay = m?.current_display_value || (
          m && typeof m.current_number_value === 'number' && typeof m.target_number_value === 'number'
            ? `${m.current_number_value} / ${m.target_number_value}${m.unit && m.unit !== 'none' ? ' ' + m.unit : ''}`
            : null
        );
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
          progressPercent,
          progressDisplay,
          metric: m ? {
            currentValue: typeof m.current_number_value === 'number' ? m.current_number_value : null,
            targetValue: typeof m.target_number_value === 'number' ? m.target_number_value : null,
            initialValue: typeof m.initial_number_value === 'number' ? m.initial_number_value : null,
            unit: m.unit || null,
            progressSource: m.progress_source || null,
            currentDisplay: m.current_display_value || null,
          } : null,
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
  }, [companyId, fetchGoals]);
  useVisibilityAwareInterval(
    () => { void fetchGoals(); },
    companyId ? 6 * 60 * 60 * 1000 : null,
  );

  const fetchSubgoals = useCallback(async (parentGid: string): Promise<AsanaGoalRow[]> => {
    const integrationId = integrationIdRef.current;
    const workspaceGid = workspaceGidRef.current;
    if (!integrationId || !parentGid) return [];
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('asana-proxy', {
        body: {
          action: 'list_supporting_goals',
          integration_id: integrationId,
          parent_gid: parentGid,
        },
      });
      if (fnErr) throw fnErr;
      if (!data?.success) throw new Error(data?.error || 'Failed to fetch subgoals');
      const now = new Date().toISOString();
      const list = (data.goals as AsanaGoalApi[]) || [];
      return list.map((g) => {
        const rawStatus =
          g.current_status_update?.status_type ||
          g.progress_status ||
          g.status ||
          null;
        const status = mapStatus(rawStatus);
        const m = g.metric || null;
        let progressPercent: number | null = null;
        if (m && typeof m.current_number_value === 'number' && typeof m.target_number_value === 'number') {
          const start = typeof m.initial_number_value === 'number' ? m.initial_number_value : 0;
          const span = m.target_number_value - start;
          if (span !== 0) {
            const raw = ((m.current_number_value - start) / span) * 100;
            progressPercent = Math.max(0, Math.min(100, Math.round(raw)));
          } else if (m.current_number_value >= m.target_number_value) {
            progressPercent = 100;
          }
        }
        if (progressPercent === null && status === 'Achieved') progressPercent = 100;
        const progressDisplay = m?.current_display_value || null;
        return {
          id: g.gid,
          asanaGid: g.gid,
          workspaceGid,
          teamGid: g.team?.gid || null,
          title: g.name || '(Untitled subgoal)',
          owner: g.owner?.name || '—',
          ownerEmail: g.owner?.email || null,
          status,
          rawStatus,
          due: g.due_on || '',
          url: g.permalink_url || null,
          syncedAt: now,
          source: 'asana',
          timePeriod: g.time_period?.display_name || null,
          progressPercent,
          progressDisplay,
          metric: m ? {
            currentValue: typeof m.current_number_value === 'number' ? m.current_number_value : null,
            targetValue: typeof m.target_number_value === 'number' ? m.target_number_value : null,
            initialValue: typeof m.initial_number_value === 'number' ? m.initial_number_value : null,
            unit: m.unit || null,
            progressSource: m.progress_source || null,
            currentDisplay: m.current_display_value || null,
          } : null,
        };
      });
    } catch (e) {
      console.error('[AsanaGoals] subgoal fetch failed:', e);
      return [];
    }
  }, []);

  return { goals, loading, error, lastSyncedAt, configured, refresh: fetchGoals, fetchSubgoals };
}