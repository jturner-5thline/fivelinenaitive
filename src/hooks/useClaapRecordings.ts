import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ClaapParticipant {
  attended: boolean;
  email: string;
  id: string;
  name: string;
}

export interface ClaapRecording {
  id: string;
  createdAt: string;
  durationSeconds: number;
  labels: string[];
  recorder: {
    attended: boolean;
    email: string;
    id: string;
    name: string;
  };
  state: string;
  thumbnailUrl: string;
  title: string;
  transcripts: Array<{
    textUrl: string;
    url: string;
    isActive: boolean;
    isTranscript: boolean;
    langIso2: string;
  }>;
  url: string;
  videoUrl?: string;
  embedUrl?: string;
  meeting?: {
    participants: ClaapParticipant[];
    startingAt?: string;
    endingAt?: string;
    type?: string;
    conferenceUrl?: string;
  };
}

export function useClaapRecordings() {
  const [recordings, setRecordings] = useState<ClaapRecording[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchRecordings = useCallback(async (search?: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const params = new URLSearchParams({ action: 'list', limit: '50' });
      if (search) params.set('search', search);

      const response = await supabase.functions.invoke('claap-recordings', {
        body: null,
        headers: {},
      });

      // Use fetch directly for query params
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claap-recordings?${params.toString()}`;
      const fetchResponse = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!fetchResponse.ok) {
        // Treat upstream rate-limits / transient failures as empty results
        // instead of crashing the UI. Edge function returns 200 with cached
        // data when possible; this is a belt-and-suspenders fallback.
        if (fetchResponse.status === 429 || fetchResponse.status >= 500) {
          console.warn('[Claap] upstream', fetchResponse.status, '— returning empty list');
          setRecordings([]);
          return;
        }
        const errorData = await fetchResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch recordings');
      }

      const data = await fetchResponse.json();
      setRecordings(data.recordings || []);
    } catch (err: any) {
      console.error('Error fetching Claap recordings:', err);
      setError(err.message);
      // Avoid noisy toast for rate-limit / transient failures.
      if (!/rate limit|429|fetch/i.test(err?.message || '')) {
        toast({
          title: 'Error',
          description: err.message || 'Failed to fetch Claap recordings',
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const getRecording = useCallback(async (recordingId: string): Promise<ClaapRecording | null> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const params = new URLSearchParams({ action: 'get', recordingId });
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claap-recordings?${params.toString()}`;
      
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch recording');
      }

      const data = await response.json();
      return data.recording || null;
    } catch (err: any) {
      console.error('Error fetching Claap recording:', err);
      toast({
        title: 'Error',
        description: err.message || 'Failed to fetch recording details',
        variant: 'destructive',
      });
      return null;
    }
  }, [toast]);

  const getTranscript = useCallback(async (recordingId: string): Promise<string | null> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const params = new URLSearchParams({ action: 'transcript', recordingId });
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claap-recordings?${params.toString()}`;
      
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch transcript');
      }

      const data = await response.json();
      return data.transcript || null;
    } catch (err: any) {
      console.error('Error fetching transcript:', err);
      toast({
        title: 'Error',
        description: err.message || 'Failed to fetch transcript',
        variant: 'destructive',
      });
      return null;
    }
  }, [toast]);

  return {
    recordings,
    loading,
    error,
    fetchRecordings,
    getRecording,
    getTranscript,
  };
}
