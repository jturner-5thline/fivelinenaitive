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
      
      // Build a note that surfaces this recording in the Deal Space "Notes" section.
      const startedAt = recording.createdAt ? new Date(recording.createdAt) : null;
      const durationMin = recording.durationSeconds ? Math.round(recording.durationSeconds / 60) : null;
      const noteTitle = `🎥 ${recording.title || 'Claap Recording'}`;
      const metaLines: string[] = [];
      if (startedAt && !isNaN(startedAt.getTime())) {
        metaLines.push(`<p><strong>Recorded:</strong> ${startedAt.toLocaleString()}</p>`);
      }
      if (durationMin != null) {
        metaLines.push(`<p><strong>Duration:</strong> ${durationMin} min</p>`);
      }
      if (recording.recorder?.name || recording.recorder?.email) {
        metaLines.push(`<p><strong>Recorded by:</strong> ${recording.recorder.name || recording.recorder.email}</p>`);
      }
      if (recording.url) {
        metaLines.push(`<p><a href="${recording.url}" target="_blank" rel="noreferrer">▶ Watch in Claap</a></p>`);
      }
      const noteContent = `<p><em>Claap recording linked to this deal.</em></p>${metaLines.join('')}<p><br/></p>`;

      let linkedNoteId: string | null = null;
      const { data: noteRow, error: noteErr } = await supabase
        .from('deal_space_notes')
        .insert({
          deal_id: dealId,
          user_id: user?.id,
          title: noteTitle,
          content: noteContent,
        })
        .select('id')
        .single();
      if (noteErr) {
        console.warn('Could not create linked note for recording:', noteErr);
      } else {
        linkedNoteId = noteRow?.id ?? null;
      }

      const { error } = await supabase
        .from('deal_claap_recordings')
        .insert({
          deal_id: dealId,
          recording_id: recording.id,
          recording_title: recording.title,
          recording_url: recording.url,
          thumbnail_url: recording.thumbnailUrl,
          duration_seconds: recording.durationSeconds,
          recorder_name: recording.recorder?.name,
          recorder_email: recording.recorder?.email,
          linked_by: user?.id,
          notes: linkedNoteId,
        });

      if (error) throw error;

      toast({
        title: 'Recording linked',
        description: `"${recording.title || 'Recording'}" is now in Deal Space → Notes.`,
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
      // Find the linked note id (stored in the `notes` column) so we can remove it too.
      const { data: existing } = await supabase
        .from('deal_claap_recordings')
        .select('notes')
        .eq('deal_id', dealId)
        .eq('recording_id', recordingId)
        .maybeSingle();

      const { error } = await supabase
        .from('deal_claap_recordings')
        .delete()
        .eq('deal_id', dealId)
        .eq('recording_id', recordingId);

      if (error) throw error;

      if (existing?.notes) {
        // Best-effort: remove the auto-created note. Silently ignore if the user
        // has edited/renamed it away or lacks permission.
        await supabase.from('deal_space_notes').delete().eq('id', existing.notes);
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
