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

export const FUNDING_SOURCE_ACTIVITY_TYPES = [
  'lender_added',
  'lender_updated',
  'lender_removed',
  'lender_deleted',
  'lender_stage_change',
  'lender_substage_change',
  'lender_status_change',
  'lender_notes_updated',
  'lender_passed',
  'lender_terms_received',
];

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
      const [{ data, error }, { data: callData, error: callError }, stageRes, pipelinesRes, dealRes, fundingRes, taskRes] = await Promise.all([
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
              .select('id, deal_id, pipeline_id, from_stage, to_stage, to_stage_id, from_stage_id, to_stage_label_raw, from_stage_label_raw, unresolved_stage_label, changed_at, exited_at, changed_by, source, event_type')
              .eq('deal_id', dealId)
              .order('changed_at', { ascending: false })
          : Promise.resolve({ data: [] as any[], error: null }),
        pageNum === 0
          ? supabase.from('deal_pipelines').select('id, name, stages')
          : Promise.resolve({ data: [] as any[], error: null }),
        pageNum === 0
          ? supabase.from('deals').select('id, created_at').eq('id', dealId).maybeSingle()
          : Promise.resolve({ data: null as any, error: null }),
        pageNum === 0
          ? supabase
              .from('activity_logs')
              .select('id, deal_id, user_id, user_display_name, activity_type, description, metadata, created_at')
              .eq('deal_id', dealId)
              .in('activity_type', FUNDING_SOURCE_ACTIVITY_TYPES)
              .order('created_at', { ascending: false })
              .limit(200)
          : Promise.resolve({ data: [] as any[], error: null }),
        pageNum === 0
          ? (supabase as any)
              .from('tasks')
              .select('id, title, description, status, priority, due_date, due_at, created_at, updated_at, completed_at, archived_at, created_by, assigned_by, assigned_to, completed_by')
              .eq('deal_id', dealId)
              .order('created_at', { ascending: false })
              .limit(200)
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
        const isExit = row.event_type === 'stage_exit';
        const fromLabel = labelFor(row.pipeline_id, row.from_stage_id || row.from_stage);
        const resolvedToId = row.to_stage_id || null;
        const resolvedFromId = row.from_stage_id || null;
        const toLabel = resolvedToId
          ? labelFor(row.pipeline_id, resolvedToId)
          : (row.to_stage_label_raw || row.to_stage || '');
        // For exits, the "anchor" stage label is the from-stage they left
        const exitStageLabel = resolvedFromId
          ? labelFor(row.pipeline_id, resolvedFromId)
          : (row.from_stage_label_raw || row.from_stage || '');
        const ts = isExit ? (row.exited_at || row.changed_at) : row.changed_at;
        return {
          id: `stage-${row.id}`,
          deal_id: row.deal_id,
          user_id: row.changed_by,
          action_type: isExit ? 'stage_exited' : 'stage_changed',
          entity_type: 'stage_change',
          entity_id: row.id,
          entity_name: isExit ? exitStageLabel : toLabel,
          metadata: {
            event_type: row.event_type || (isExit ? 'stage_exit' : 'stage_enter'),
            from_stage: row.from_stage,
            to_stage: row.to_stage,
            to_stage_id: resolvedToId,
            from_stage_id: resolvedFromId,
            to_stage_label_raw: row.to_stage_label_raw || null,
            from_stage_label_raw: row.from_stage_label_raw || null,
            unresolved_stage_label: row.unresolved_stage_label || null,
            from_label: fromLabel,
            to_label: toLabel,
            exit_stage_label: exitStageLabel,
            pipeline_id: row.pipeline_id,
            source: row.source || null,
          },
          created_at: ts,
        };
      });

      // Split out unresolved backfill stage rows — they MUST NOT render in the
      // default Activity feed (silence beats wrong data). They surface in a
      // separate admin-only "Unresolved stage events" list. Covers both
      // backfilled entries (no to_stage_id) AND backfilled exits (no
      // from_stage_id).
      const isUnresolvedBackfill = (row: DealAuditEntry) => {
        const src = row.metadata?.source;
        if (src !== 'backfill' && src !== 'backfill_exit') return false;
        const evt = row.metadata?.event_type;
        return evt === 'stage_exit'
          ? !row.metadata?.from_stage_id
          : !row.metadata?.to_stage_id;
      };
      const unresolvedStageRows = stageRowsRaw.filter(isUnresolvedBackfill);
      const renderableStageRows = stageRowsRaw.filter((r) => !isUnresolvedBackfill(r));

      // Dedupe stage rows by (deal_id, event_type, stage_id, calendar date)
      // — prefer live rows over backfill duplicates on the same day.
      const stageDedupeMap = new Map<string, DealAuditEntry>();
      for (const row of renderableStageRows) {
        const day = (row.created_at || '').slice(0, 10);
        const evt = row.metadata?.event_type || 'stage_enter';
        const stageKey = evt === 'stage_exit'
          ? (row.metadata?.from_stage_id || row.metadata?.from_stage || '')
          : (row.metadata?.to_stage_id || row.metadata?.to_stage || '');
        const key = `${row.deal_id}::${evt}::${stageKey}::${day}`;
        const existing = stageDedupeMap.get(key);
        if (!existing) { stageDedupeMap.set(key, row); continue; }
        const existingIsBackfill = (existing.metadata?.source || '').startsWith('backfill');
        const incomingIsBackfill = (row.metadata?.source || '').startsWith('backfill');
        if (existingIsBackfill && !incomingIsBackfill) stageDedupeMap.set(key, row);
      }
      const stageRows = Array.from(stageDedupeMap.values());

      const dealCreatedRows: DealAuditEntry[] = pageNum === 0 && dealRes?.data?.created_at
        ? [{
            id: `deal-created-${dealId}`,
            deal_id: dealId,
            user_id: null,
            action_type: 'deal_created',
            entity_type: 'deal',
            entity_id: dealId,
            entity_name: 'Deal',
            metadata: { source: 'deals.created_at' },
            created_at: dealRes.data.created_at,
            user_display_name: 'System',
            user_avatar_url: null,
          }]
        : [];

      const fundingRows: DealAuditEntry[] = ((fundingRes?.data || []) as any[]).map((entry) => ({
        id: `funding-${entry.id}`,
        deal_id: entry.deal_id,
        user_id: entry.user_id,
        action_type: entry.activity_type,
        entity_type: 'funding_source',
        entity_id: (entry.metadata as Record<string, any> | null)?.lender_id || entry.id,
        entity_name: (entry.metadata as Record<string, any> | null)?.lender_name || entry.description,
        metadata: { ...(entry.metadata || {}), description: entry.description },
        created_at: entry.created_at,
        user_display_name: entry.user_display_name || 'System',
        user_avatar_url: null,
      }));

      const taskRows: DealAuditEntry[] = [];
      for (const t of ((taskRes?.data || []) as any[])) {
        const base = {
          deal_id: dealId!,
          entity_type: 'task',
          entity_id: t.id,
          entity_name: t.title,
        };
        const meta = {
          title: t.title,
          description: t.description,
          status: t.status,
          priority: t.priority,
          due_date: t.due_date || t.due_at || null,
          assigned_to: t.assigned_to,
        };
        taskRows.push({
          ...base,
          id: `task-created-${t.id}`,
          user_id: t.created_by || t.assigned_by || null,
          action_type: 'task_created',
          metadata: meta,
          created_at: t.created_at,
        } as DealAuditEntry);
        if (t.completed_at) {
          taskRows.push({
            ...base,
            id: `task-completed-${t.id}`,
            user_id: t.completed_by || null,
            action_type: 'task_completed',
            metadata: meta,
            created_at: t.completed_at,
          } as DealAuditEntry);
        }
        if (t.archived_at) {
          taskRows.push({
            ...base,
            id: `task-removed-${t.id}`,
            user_id: null,
            action_type: 'task_removed',
            metadata: meta,
            created_at: t.archived_at,
          } as DealAuditEntry);
        }
        const updatedTs = t.updated_at ? new Date(t.updated_at).getTime() : 0;
        const createdTs = t.created_at ? new Date(t.created_at).getTime() : 0;
        const completedTs = t.completed_at ? new Date(t.completed_at).getTime() : 0;
        const archivedTs = t.archived_at ? new Date(t.archived_at).getTime() : 0;
        if (
          updatedTs - createdTs > 60_000 &&
          Math.abs(updatedTs - completedTs) > 60_000 &&
          Math.abs(updatedTs - archivedTs) > 60_000
        ) {
          taskRows.push({
            ...base,
            id: `task-updated-${t.id}`,
            user_id: t.assigned_by || t.created_by || null,
            action_type: 'task_updated',
            metadata: meta,
            created_at: t.updated_at,
          } as DealAuditEntry);
        }
      }

      const rows = [...auditRows, ...callRows, ...stageRows, ...dealCreatedRows, ...fundingRows, ...taskRows].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      // Fetch user profiles for display names
      const userIds = [...new Set([
        ...rows.map(r => r.user_id),
        ...rows.map(r => (r.entity_type === 'task' ? r.metadata?.assigned_to : null)),
      ].filter(Boolean))] as string[];
      const { data: profiles } = userIds.length
        ? await supabase
            .from('profiles')
            .select('user_id, display_name, avatar_url')
            .in('user_id', userIds)
        : { data: [] as Array<{ user_id: string; display_name: string | null; avatar_url: string | null }> };

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
      const enriched = rows.map(r => ({
        ...r,
        metadata: r.entity_type === 'task' && r.metadata?.assigned_to
          ? { ...r.metadata, assignee_name: profileMap.get(r.metadata.assigned_to)?.display_name || null }
          : r.metadata,
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
    // Depend on stable user id — the `user` object reference from AuthContext
    // can change (e.g., TOKEN_REFRESHED) even when the underlying identity is
    // the same, which would otherwise cause this hook to re-fire and make the
    // Activity tab visibly reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId, user?.id]);

  useEffect(() => {
    setPage(0);
    setEntries([]);
    fetchEntries(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId, user?.id]);

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
