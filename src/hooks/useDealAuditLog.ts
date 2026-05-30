import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface DealAuditEntry {
  id: string;
  deal_id: string;
  user_id: string | null;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  metadata: Record<string, any>;
  created_at: string;
  // joined
  user_display_name?: string;
  user_avatar_url?: string;
}

const PAGE_SIZE = 50;

export function useDealAuditLog(dealId: string | undefined) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<DealAuditEntry[]>([]);
  const [unresolvedStageEntries, setUnresolvedStageEntries] = useState<DealAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  const fetchEntries = useCallback(async (pageNum: number, append = false) => {
    if (!dealId || !user) return;
    setLoading(true);
    try {
      const from = pageNum * PAGE_SIZE;
      const [{ data, error }, { data: callData, error: callError }, stageRes, pipelinesRes] = await Promise.all([
        (supabase as any)
          .from('deal_audit_log')
          .select('*')
          .eq('deal_id', dealId)
          .order('created_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1),
        supabase
          .from('activity_logs')
          .select('id, deal_id, user_id, user_display_name, activity_type, description, metadata, created_at')
          .eq('deal_id', dealId)
          .eq('activity_type', 'claap_recording_linked')
          .order('created_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1),
        // Stage changes: history is normally small per deal, fetch all once on page 0 and ignore on subsequent pages.
        pageNum === 0
          ? supabase
              .from('deal_stage_history')
              .select('id, deal_id, pipeline_id, from_stage, to_stage, to_stage_id, to_stage_label_raw, unresolved_stage_label, changed_at, changed_by, source')
              .eq('deal_id', dealId)
              .order('changed_at', { ascending: false })
          : Promise.resolve({ data: [] as any[], error: null }),
        pageNum === 0
          ? supabase.from('deal_pipelines').select('id, name, stages')
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);

      if (error) throw error;
      if (callError) throw callError;

      const auditRows = (data || []) as DealAuditEntry[];
      const callRows: DealAuditEntry[] = (callData || []).map((entry) => ({
        id: `claap-${entry.id}`,
        deal_id: entry.deal_id,
        user_id: entry.user_id,
        action_type: 'claap_recording_linked',
        entity_type: 'call',
        entity_id: (entry.metadata as Record<string, any> | null)?.claap_id || entry.id,
        entity_name: entry.description,
        metadata: (entry.metadata as Record<string, any>) || {},
        created_at: entry.created_at,
        user_display_name: entry.user_display_name || 'System',
        user_avatar_url: null,
      }));

      // Build pipeline → stage label map for friendly stage names
      const pipelineStageLabels: Record<string, string> = {};
      for (const p of (pipelinesRes?.data || []) as any[]) {
        const stages = Array.isArray(p?.stages) ? p.stages : [];
        for (const s of stages) {
          if (s && typeof s.id === 'string') {
            pipelineStageLabels[`${p.id}::${s.id}`] = s.label || s.id;
            // also store an unscoped fallback
            if (!pipelineStageLabels[s.id]) pipelineStageLabels[s.id] = s.label || s.id;
          }
        }
      }
      const labelFor = (pipelineId: string | null, stageId: string | null) => {
        if (!stageId) return '—';
        if (pipelineId && pipelineStageLabels[`${pipelineId}::${stageId}`]) return pipelineStageLabels[`${pipelineId}::${stageId}`];
        return pipelineStageLabels[stageId] || stageId.replace(/-/g, ' ');
      };

      const stageRowsRaw: DealAuditEntry[] = ((stageRes?.data || []) as any[]).map((row) => {
        const fromLabel = labelFor(row.pipeline_id, row.from_stage);
        // Prefer resolved stage id for label; fall back to raw to_stage text.
        const resolvedToId = row.to_stage_id || null;
        const toLabel = resolvedToId
          ? labelFor(row.pipeline_id, resolvedToId)
          : (row.to_stage_label_raw || row.to_stage || '');
        return {
          id: `stage-${row.id}`,
          deal_id: row.deal_id,
          user_id: row.changed_by,
          action_type: 'stage_changed',
          entity_type: 'stage_change',
          entity_id: row.id,
          entity_name: toLabel,
          metadata: {
            from_stage: row.from_stage,
            to_stage: row.to_stage,
            to_stage_id: resolvedToId,
            to_stage_label_raw: row.to_stage_label_raw || null,
            unresolved_stage_label: row.unresolved_stage_label || null,
            from_label: fromLabel,
            to_label: toLabel,
            pipeline_id: row.pipeline_id,
            source: row.source || null,
          },
          created_at: row.changed_at,
        };
      });

      // Split out unresolved backfill stage rows — they MUST NOT render in the
      // default Activity feed (silence beats wrong data). They surface in a
      // separate admin-only "Unresolved stage events" list.
      const isUnresolvedBackfill = (row: DealAuditEntry) =>
        row.metadata?.source === 'backfill' && !row.metadata?.to_stage_id;
      const unresolvedStageRows = stageRowsRaw.filter(isUnresolvedBackfill);
      const renderableStageRows = stageRowsRaw.filter((r) => !isUnresolvedBackfill(r));

      // Dedupe stage rows by (deal_id, to_stage, calendar date) — prefer
      // non-backfill (live) rows when both exist for the same day.
      const stageDedupeMap = new Map<string, DealAuditEntry>();
      for (const row of renderableStageRows) {
        const day = (row.created_at || '').slice(0, 10);
        const key = `${row.deal_id}::${row.metadata?.to_stage_id || row.metadata?.to_stage || ''}::${day}`;
        const existing = stageDedupeMap.get(key);
        if (!existing) { stageDedupeMap.set(key, row); continue; }
        const existingIsBackfill = existing.metadata?.source === 'backfill';
        const incomingIsBackfill = row.metadata?.source === 'backfill';
        if (existingIsBackfill && !incomingIsBackfill) stageDedupeMap.set(key, row);
      }
      const stageRows = Array.from(stageDedupeMap.values());

      const rows = [...auditRows, ...callRows, ...stageRows].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      // Fetch user profiles for display names
      const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))] as string[];
      const { data: profiles } = userIds.length
        ? await supabase
            .from('profiles')
            .select('user_id, display_name, avatar_url')
            .in('user_id', userIds)
        : { data: [] as Array<{ user_id: string; display_name: string | null; avatar_url: string | null }> };

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
      const enriched = rows.map(r => ({
        ...r,
        user_display_name: r.user_display_name || (r.user_id ? profileMap.get(r.user_id)?.display_name : null) || 'System',
        user_avatar_url: r.user_id ? profileMap.get(r.user_id)?.avatar_url || null : null,
      }));

      const uniqueEntries = Array.from(new Map(enriched.map(entry => [entry.id, entry])).values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      if (append) {
        setEntries(prev => Array.from(new Map([...prev, ...uniqueEntries].map(entry => [entry.id, entry])).values()).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ));
      } else {
        setEntries(uniqueEntries);
        setUnresolvedStageEntries(unresolvedStageRows);
      }
      // Stage history is only fetched on page 0; pagination is driven by audit + call streams.
      setHasMore(auditRows.length === PAGE_SIZE || callRows.length === PAGE_SIZE);
    } catch (err) {
      console.error('Error fetching audit log:', err);
    } finally {
      setLoading(false);
    }
  }, [dealId, user]);

  useEffect(() => {
    setPage(0);
    setEntries([]);
    fetchEntries(0);
  }, [fetchEntries]);

  const loadMore = useCallback(() => {
    const next = page + 1;
    setPage(next);
    fetchEntries(next, true);
  }, [page, fetchEntries]);

  const logAuditAction = useCallback(async (
    actionType: string,
    entityType: string,
    entityId?: string,
    entityName?: string,
    metadata?: Record<string, any>,
  ) => {
    if (!user || !dealId) return;
    try {
      await (supabase as any).from('deal_audit_log').insert({
        deal_id: dealId,
        user_id: user.id,
        action_type: actionType,
        entity_type: entityType,
        entity_id: entityId || null,
        entity_name: entityName || null,
        metadata: metadata || {},
      });
    } catch (err) {
      console.error('Error logging audit action:', err);
    }
  }, [user, dealId]);

  // Realtime subscription for new entries
  useEffect(() => {
    if (!dealId) return;
    const channel = supabase
      .channel(`deal-audit-${dealId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'deal_audit_log',
        filter: `deal_id=eq.${dealId}`,
      }, async (payload) => {
        const newEntry = payload.new as DealAuditEntry;
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, avatar_url')
          .eq('user_id', newEntry.user_id)
          .single();
        setEntries(prev => [{
          ...newEntry,
          user_display_name: profile?.display_name || 'Unknown',
          user_avatar_url: profile?.avatar_url || null,
        }, ...prev]);
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'activity_logs',
        filter: `deal_id=eq.${dealId}`,
      }, (payload) => {
        const newEntry = payload.new as {
          id: string;
          deal_id: string;
          user_id: string | null;
          user_display_name: string | null;
          activity_type: string;
          description: string;
          metadata: Record<string, any> | null;
          created_at: string;
        };

        if (newEntry.activity_type !== 'claap_recording_linked') return;

        setEntries(prev => [{
          id: `claap-${newEntry.id}`,
          deal_id: newEntry.deal_id,
          user_id: newEntry.user_id,
          action_type: 'claap_recording_linked',
          entity_type: 'call',
          entity_id: newEntry.metadata?.claap_id || newEntry.id,
          entity_name: newEntry.description,
          metadata: newEntry.metadata || {},
          created_at: newEntry.created_at,
          user_display_name: newEntry.user_display_name || 'System',
          user_avatar_url: null,
        }, ...prev]);
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'deal_stage_history',
        filter: `deal_id=eq.${dealId}`,
      }, async (payload) => {
        const row = payload.new as {
          id: string; deal_id: string; pipeline_id: string | null;
          from_stage: string | null; to_stage: string;
          changed_at: string; changed_by: string | null; source?: string | null;
        };
        let displayName: string | null = null;
        let avatar: string | null = null;
        if (row.changed_by) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name, avatar_url')
            .eq('user_id', row.changed_by)
            .maybeSingle();
          displayName = profile?.display_name || null;
          avatar = profile?.avatar_url || null;
        }
        setEntries(prev => [{
          id: `stage-${row.id}`,
          deal_id: row.deal_id,
          user_id: row.changed_by,
          action_type: 'stage_changed',
          entity_type: 'stage_change',
          entity_id: row.id,
          entity_name: row.to_stage,
          metadata: {
            from_stage: row.from_stage,
            to_stage: row.to_stage,
            from_label: (row.from_stage || '—').replace(/-/g, ' '),
            to_label: (row.to_stage || '').replace(/-/g, ' '),
            pipeline_id: row.pipeline_id,
            source: row.source || null,
          },
          created_at: row.changed_at,
          user_display_name: displayName || 'System',
          user_avatar_url: avatar,
        }, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [dealId]);

  return { entries, unresolvedStageEntries, loading, hasMore, loadMore, logAuditAction, refetch: () => fetchEntries(0) };
}
