import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { ClaapRecording } from './useClaapRecordings';

export interface LinkedClaapRecording {
  id: string;
  deal_id: string;
  recording_id: string;
  recording_title: string | null;
  recording_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  recorder_name: string | null;
  recorder_email: string | null;
  linked_at: string;
  linked_by: string | null;
  notes: string | null;
}

export function useDealClaapRecordings(dealId: string) {
  const [linkedRecordings, setLinkedRecordings] = useState<LinkedClaapRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchLinkedRecordings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('deal_claap_recordings')
        .select('*')
        .eq('deal_id', dealId)
        .order('linked_at', { ascending: false });

      if (error) throw error;
      setLinkedRecordings(data || []);
    } catch (err: any) {
      console.error('Error fetching linked recordings:', err);
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    fetchLinkedRecordings();
  }, [fetchLinkedRecordings]);

  const linkRecording = useCallback(async (recording: ClaapRecording) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      // Linking a Claap recording is a lightweight association — it must NOT
      // create a fake Deal Space note / meeting "event". The recording surfaces
      // in the deal's Meetings section via `deal_claap_recordings` directly.
      // Use upsert on (deal_id, recording_id) so a second click on the same
      // meeting (e.g. from the picker) is a no-op success instead of a
      // silent unique-constraint failure.
      const { error } = await supabase
        .from('deal_claap_recordings')
        .upsert(
          {
            deal_id: dealId,
            recording_id: recording.id,
            recording_title: recording.title,
            recording_url: recording.url,
            thumbnail_url: recording.thumbnailUrl,
            duration_seconds: recording.durationSeconds,
            recorder_name: recording.recorder?.name,
            recorder_email: recording.recorder?.email,
            linked_by: user?.id,
            notes: null,
          },
          { onConflict: 'deal_id,recording_id', ignoreDuplicates: true },
        );

      if (error) throw error;

      toast({
        title: 'Recording linked',
        description: `"${recording.title || 'Recording'}" is linked to this deal.`,
      });

      fetchLinkedRecordings();

      // NOTE: Per project memory ("AI writes require explicit human approval"),
      // we do NOT auto-run analysis or auto-post summaries / tasks here.
      // The user opens "Analyze Recording" on the Data Room entry to review
      // and confirm the AI draft before anything is written to the deal.
    } catch (err: any) {
      console.error('Error linking recording:', err);
      toast({
        title: 'Error',
        description: err.message || 'Failed to link recording',
        variant: 'destructive',
      });
    }
  }, [dealId, toast, fetchLinkedRecordings]);

  const unlinkRecording = useCallback(async (recordingId: string) => {
    try {
      // Legacy rows may have a linked deal_space_notes id stored in `notes`
      // (older builds auto-created a note when linking). Clean it up on unlink
      // so no ghost "meeting" note is left behind.
      const { data: existing } = await supabase
        .from('deal_claap_recordings')
        .select('notes')
        .eq('deal_id', dealId)
        .eq('recording_id', recordingId)
        .maybeSingle();

      // Only treat `notes` as a note id if it looks like a UUID (legacy path).
      const legacyNoteId =
        existing?.notes && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(existing.notes)
          ? existing.notes
          : null;

      const { error } = await supabase
        .from('deal_claap_recordings')
        .delete()
        .eq('deal_id', dealId)
        .eq('recording_id', recordingId);

      if (error) throw error;

      if (legacyNoteId) {
        // Best-effort: remove the auto-created legacy note. Silently ignore.
        await supabase.from('deal_space_notes').delete().eq('id', legacyNoteId);
      }

      toast({
        title: 'Recording unlinked',
        description: 'The recording has been removed from this deal.',
      });

      fetchLinkedRecordings();
    } catch (err: any) {
      console.error('Error unlinking recording:', err);
      toast({
        title: 'Error',
        description: err.message || 'Failed to unlink recording',
        variant: 'destructive',
      });
    }
  }, [dealId, toast, fetchLinkedRecordings]);

  const updateNotes = useCallback(async (recordingId: string, notes: string) => {
    try {
      const { error } = await supabase
        .from('deal_claap_recordings')
        .update({ notes })
        .eq('deal_id', dealId)
        .eq('recording_id', recordingId);

      if (error) throw error;
      fetchLinkedRecordings();
    } catch (err: any) {
      console.error('Error updating notes:', err);
    }
  }, [dealId, fetchLinkedRecordings]);

  return {
    linkedRecordings,
    linkedRecordingIds: linkedRecordings.map(r => r.recording_id),
    loading,
    linkRecording,
    unlinkRecording,
    updateNotes,
    refetch: fetchLinkedRecordings,
  };
}
