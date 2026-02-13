import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface DealCallTranscript {
  id: string;
  deal_id: string;
  name: string;
  file_path: string;
  content_type: string | null;
  size_bytes: number;
  call_date: string | null;
  participants: string | null;
  notes: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useDealCallTranscripts(dealId: string) {
  const [transcripts, setTranscripts] = useState<DealCallTranscript[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const fetchTranscripts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('deal_call_transcripts')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTranscripts(data || []);
    } catch (err: any) {
      console.error('Error fetching call transcripts:', err);
    } finally {
      setIsLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    fetchTranscripts();
  }, [fetchTranscripts]);

  const uploadTranscript = useCallback(async (file: File) => {
    setIsUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const filePath = `${dealId}/call-transcripts/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('deal-space')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from('deal_call_transcripts')
        .insert({
          deal_id: dealId,
          name: file.name,
          file_path: filePath,
          content_type: file.type || null,
          size_bytes: file.size,
          user_id: user.id,
        });

      if (dbError) throw dbError;

      toast({ title: 'Transcript uploaded', description: `"${file.name}" has been uploaded.` });
      fetchTranscripts();
    } catch (err: any) {
      console.error('Error uploading transcript:', err);
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  }, [dealId, toast, fetchTranscripts]);

  const deleteTranscript = useCallback(async (transcript: DealCallTranscript) => {
    try {
      await supabase.storage.from('deal-space').remove([transcript.file_path]);

      const { error } = await supabase
        .from('deal_call_transcripts')
        .delete()
        .eq('id', transcript.id);

      if (error) throw error;

      toast({ title: 'Transcript deleted', description: `"${transcript.name}" has been removed.` });
      fetchTranscripts();
    } catch (err: any) {
      console.error('Error deleting transcript:', err);
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
    }
  }, [toast, fetchTranscripts]);

  const getDownloadUrl = useCallback(async (transcript: DealCallTranscript): Promise<string | null> => {
    try {
      const { data, error } = await supabase.storage
        .from('deal-space')
        .createSignedUrl(transcript.file_path, 3600);

      if (error) throw error;
      return data.signedUrl;
    } catch (err: any) {
      console.error('Error getting download URL:', err);
      return null;
    }
  }, []);

  return {
    transcripts,
    isLoading,
    isUploading,
    uploadTranscript,
    deleteTranscript,
    getDownloadUrl,
    refetch: fetchTranscripts,
  };
}
