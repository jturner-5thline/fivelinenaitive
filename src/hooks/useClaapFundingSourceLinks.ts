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

export function useClaapFundingSourceLinkActions() {
  const qc = useQueryClient();

  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['claap-recording-funding-links'] }),
      qc.invalidateQueries({ queryKey: ['claap-calls'] }),
      qc.invalidateQueries({ queryKey: ['claap-link-review'] }),
      qc.invalidateQueries({ queryKey: ['claap-link-review-count'] }),
    ]);

  /** Manually unlink: keep an auditable rejected row so auto-matching won't re-add it. */
  const unlink = async (linkId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await (supabase.from('claap_recording_links') as any)
      .update({ review_status: 'rejected', reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
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
