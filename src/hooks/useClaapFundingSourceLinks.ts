import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface FundingSourceLink {
  id: string;
  entity_id: string;
  review_status: 'pending' | 'confirmed' | 'rejected';
  source: string;
  confidence: number | null;
  name: string;
}

/** Resolve a Claap external recording id (claap_id) to the claap_recordings row id. */
export async function resolveRecordingRowId(externalId?: string | null): Promise<string | null> {
  if (!externalId) return null;
  const { data } = await (supabase.from('claap_recordings') as any)
    .select('id')
    .eq('external_id', externalId)
    .maybeSingle();
  return data?.id ?? null;
}

/** Funding sources (master_lenders) linked to a claap_recordings row. */
export function useRecordingFundingSourceLinks(recordingRowId?: string | null) {
  return useQuery({
    queryKey: ['claap-recording-funding-links', recordingRowId],
    enabled: !!recordingRowId,
    queryFn: async (): Promise<FundingSourceLink[]> => {
      const { data: links } = await (supabase.from('claap_recording_links') as any)
        .select('id, entity_id, review_status, source, confidence')
        .eq('recording_id', recordingRowId)
        .eq('link_role', 'funding_source');
      const rows = (links || []) as any[];
      if (!rows.length) return [];
      const { data: lenders } = await supabase
        .from('master_lenders')
        .select('id, name')
        .in('id', Array.from(new Set(rows.map((r) => r.entity_id))));
      const nameMap = new Map((lenders || []).map((l: any) => [l.id, l.name as string]));
      return rows.map((r) => ({
        id: r.id,
        entity_id: r.entity_id,
        review_status: r.review_status,
        source: r.source,
        confidence: r.confidence,
        name: nameMap.get(r.entity_id) || 'Unknown funding source',
      }));
    },
  });
}

export interface ClaapLinkEvent {
  id: string;
  link_id: string | null;
  recording_id: string;
  entity_id: string | null;
  link_role: string | null;
  event_type: string;
  source: string | null;
  confidence: number | null;
  reason: string | null;
  actor_id: string | null;
  created_at: string;
  actorName?: string | null;
  recordingTitle?: string | null;
  entityName?: string | null;
}

/**
 * Link history for a single recording (`recordingId`) or for every recording
 * linked to a funding source (`entityId`).
 */
export function useClaapLinkHistory(params: { recordingId?: string | null; entityId?: string | null }) {
  const { recordingId, entityId } = params;
  return useQuery({
    queryKey: ['claap-link-history', recordingId ?? null, entityId ?? null],
    enabled: !!(recordingId || entityId),
    queryFn: async (): Promise<ClaapLinkEvent[]> => {
      let q = (supabase.from('claap_recording_link_events') as any)
        .select('id, link_id, recording_id, entity_id, link_role, event_type, source, confidence, reason, actor_id, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (recordingId) q = q.eq('recording_id', recordingId);
      if (entityId) q = q.eq('entity_id', entityId);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data || []) as ClaapLinkEvent[];
      if (!rows.length) return [];

      const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter(Boolean))) as string[];
      const recordingIds = Array.from(new Set(rows.map((r) => r.recording_id).filter(Boolean)));
      const entityIds = Array.from(new Set(rows.map((r) => r.entity_id).filter(Boolean))) as string[];

      const [profiles, recordings, lenders] = await Promise.all([
        actorIds.length
          ? supabase.from('profiles').select('id, full_name, email').in('id', actorIds)
          : Promise.resolve({ data: [] as any[] }),
        recordingIds.length
          ? (supabase.from('claap_recordings') as any).select('id, title').in('id', recordingIds)
          : Promise.resolve({ data: [] as any[] }),
        entityIds.length
          ? supabase.from('master_lenders').select('id, name').in('id', entityIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const actorMap = new Map((profiles.data || []).map((p: any) => [p.id, p.full_name || p.email]));
      const recMap = new Map(((recordings as any).data || []).map((r: any) => [r.id, r.title]));
      const lenderMap = new Map(((lenders as any).data || []).map((l: any) => [l.id, l.name]));

      return rows.map((r) => ({
        ...r,
        actorName: r.actor_id ? (actorMap.get(r.actor_id) as string) ?? null : null,
        recordingTitle: (recMap.get(r.recording_id) as string) ?? null,
        entityName: r.entity_id ? ((lenderMap.get(r.entity_id) as string) ?? null) : null,
      }));
    },
  });
}

export function useClaapFundingSourceLinkActions() {
  const qc = useQueryClient();

  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['claap-recording-funding-links'] }),
      qc.invalidateQueries({ queryKey: ['claap-calls'] }),
      qc.invalidateQueries({ queryKey: ['claap-link-review'] }),
      qc.invalidateQueries({ queryKey: ['claap-link-review-count'] }),
      qc.invalidateQueries({ queryKey: ['claap-link-history'] }),
    ]);

  /** Manually unlink: keep an auditable rejected row so auto-matching won't re-add it. */
  const unlink = async (linkId: string, reason?: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await (supabase.from('claap_recording_links') as any)
      .update({
        review_status: 'rejected',
        reviewed_by: user?.id ?? null,
        reviewed_at: new Date().toISOString(),
        unlink_reason: reason?.trim() || null,
      })
      .eq('id', linkId);
    if (error) {
      toast.error(error.message || 'Could not unlink recording');
      return false;
    }
    await invalidate();
    toast.success('Recording unlinked from funding source');
    return true;
  };

  /** Re-confirm a previously rejected link. */
  const relink = async (linkId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await (supabase.from('claap_recording_links') as any)
      .update({ review_status: 'confirmed', reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
      .eq('id', linkId);
    if (error) {
      toast.error(error.message || 'Could not relink recording');
      return false;
    }
    await invalidate();
    toast.success('Recording relinked to funding source');
    return true;
  };

  /** Manually link a recording to a funding source (upsert on the unique key). */
  const linkToFundingSource = async (recordingRowId: string, lenderId: string, lenderName?: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await (supabase.from('claap_recording_links') as any).upsert(
      {
        recording_id: recordingRowId,
        entity_type: 'lender',
        entity_id: lenderId,
        link_role: 'funding_source',
        source: 'manual',
        confidence: 1,
        review_status: 'confirmed',
        created_by: user?.id ?? null,
        reviewed_by: user?.id ?? null,
        reviewed_at: new Date().toISOString(),
      },
      { onConflict: 'recording_id,link_role,entity_id' },
    );
    if (error) {
      toast.error(error.message || 'Could not link recording');
      return false;
    }
    await invalidate();
    toast.success(lenderName ? `Linked to ${lenderName}` : 'Recording linked to funding source');
    return true;
  };

  return { unlink, relink, linkToFundingSource };
}
