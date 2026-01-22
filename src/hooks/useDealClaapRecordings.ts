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
        });

      if (error) throw error;

      toast({
        title: 'Recording linked',
        description: `"${recording.title || 'Recording'}" has been linked to this deal.`,
      });

      fetchLinkedRecordings();
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
      const { error } = await supabase
        .from('deal_claap_recordings')
        .delete()
        .eq('deal_id', dealId)
        .eq('recording_id', recordingId);

      if (error) throw error;

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
