import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface FetchClaapRecordingsOptions {
  live?: boolean;
  from?: string;
  to?: string;
  limit?: number;
  /** Skip the 60s live-list cache and refetch from Claap right now. */
  bypassLiveCache?: boolean;
}

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

function mapLocalRecording(row: any): ClaapRecording {
  const payload = (row.source_payload && typeof row.source_payload === 'object') ? row.source_payload : {};
  const participants: ClaapParticipant[] = Array.isArray(row.participants)
    ? row.participants.map((p: any) => ({
        attended: !!p?.attended,
        email: String(p?.email || ''),
        id: String(p?.id || p?.email || ''),
        name: String(p?.name || p?.displayName || ''),
      }))
    : [];

  return {
    id: row.external_id,
    title: row.title || '',
    createdAt: row.started_at || '',
    durationSeconds: typeof payload.durationSeconds === 'number' ? payload.durationSeconds : 0,
    labels: Array.isArray(payload.labels) ? payload.labels : [],
    recorder: {
      attended: false,
      email: row.organizer_email || '',
      id: row.organizer_email || '',
      name: payload?.recorder?.name || row.organizer_email || '',
    },
    state: payload.state || 'ready',
    thumbnailUrl: payload.thumbnailUrl || '',
    transcripts: Array.isArray(payload.transcripts) ? payload.transcripts : [],
    url: payload.url || row.recording_url || '',
    meeting: {
      participants,
      startingAt: row.started_at || undefined,
    },
  } as ClaapRecording;
}

function mapApiRecording(r: any): ClaapRecording | null {
  if (!r?.id) return null;
  return {
    id: String(r.id),
    title: r.title || '',
    createdAt: r.meeting?.startingAt || r.createdAt || '',
    durationSeconds: typeof r.durationSeconds === 'number' ? r.durationSeconds : 0,
    labels: Array.isArray(r.labels) ? r.labels : [],
    recorder: {
      attended: !!r.recorder?.attended,
      email: r.recorder?.email || '',
      id: r.recorder?.id || r.recorder?.email || '',
      name: r.recorder?.name || r.recorder?.email || '',
    },
    state: r.state || 'ready',
    thumbnailUrl: r.thumbnailUrl || '',
    transcripts: Array.isArray(r.transcripts) ? r.transcripts : [],
    url: r.url || r.videoUrl || r.video?.url || '',
    videoUrl: r.videoUrl || r.video?.url,
    embedUrl: r.embedUrl,
    meeting: {
      participants: Array.isArray(r.meeting?.participants)
        ? r.meeting.participants.map((p: any) => ({
            attended: !!p?.attended,
            email: String(p?.email || ''),
            id: String(p?.id || p?.email || ''),
            name: String(p?.name || ''),
          }))
        : [],
      startingAt: r.meeting?.startingAt || undefined,
      endingAt: r.meeting?.endingAt || undefined,
      type: r.meeting?.type,
      conferenceUrl: r.meeting?.conferenceUrl,
    },
  };
}

function mergeByRecordingId(primary: ClaapRecording[], secondary: ClaapRecording[]) {
  const byId = new Map<string, ClaapRecording>();
  for (const rec of primary) if (rec.id) byId.set(rec.id, rec);
  for (const rec of secondary) {
    if (!rec.id) continue;
    const existing = byId.get(rec.id);
    if (!existing) {
      byId.set(rec.id, rec);
      continue;
    }
    const existingParticipants = existing.meeting?.participants || [];
    const liveParticipants = rec.meeting?.participants || [];
    if (existingParticipants.length === 0 && liveParticipants.length > 0) {
      byId.set(rec.id, {
        ...existing,
        durationSeconds: existing.durationSeconds || rec.durationSeconds,
        labels: existing.labels.length ? existing.labels : rec.labels,
        recorder: existing.recorder?.email ? existing.recorder : rec.recorder,
        state: existing.state || rec.state,
        thumbnailUrl: existing.thumbnailUrl || rec.thumbnailUrl,
        transcripts: existing.transcripts.length ? existing.transcripts : rec.transcripts,
        url: existing.url || rec.url,
        videoUrl: existing.videoUrl || rec.videoUrl,
        embedUrl: existing.embedUrl || rec.embedUrl,
        meeting: {
          ...existing.meeting,
          ...rec.meeting,
          startingAt: existing.meeting?.startingAt || rec.meeting?.startingAt,
        },
      });
    }
  }
  return Array.from(byId.values()).sort((a, b) => {
    const at = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bt = b.createdAt ? Date.parse(b.createdAt) : 0;
    return bt - at;
  });
}

const LIVE_RECORDINGS_CACHE_TTL_MS = 60_000;
const liveRecordingsCache = new Map<string, {
  at: number;
  recordings: ClaapRecording[];
  promise?: Promise<ClaapRecording[]>;
}>();

function recordingMatchesSearch(recording: ClaapRecording, search?: string): boolean {
  const q = search?.trim().toLowerCase();
  if (!q) return true;
  const participants = recording.meeting?.participants || [];
  return (
    recording.title?.toLowerCase().includes(q) ||
    recording.recorder?.name?.toLowerCase().includes(q) ||
    recording.recorder?.email?.toLowerCase().includes(q) ||
    participants.some((p) => p.name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q)) ||
    recording.labels?.some((l) => l.toLowerCase().includes(q))
  );
}

async function fetchLiveRecordings(search?: string, bypassCache = false): Promise<ClaapRecording[]> {
  // The Claap list endpoint only returns recent recordings; the edge function
  // filters the same list when `search` is supplied. Fetch the live list once
  // per minute and filter locally so multiple meeting cards do not fire one
  // live Claap request per distinct meeting title.
  const cacheKey = '__all__';
  const cached = liveRecordingsCache.get(cacheKey);
  const now = Date.now();

  if (!bypassCache && cached?.promise) return (await cached.promise).filter((r) => recordingMatchesSearch(r, search));
  if (!bypassCache && cached && now - cached.at < LIVE_RECORDINGS_CACHE_TTL_MS) {
    return cached.recordings.filter((r) => recordingMatchesSearch(r, search));
  }

  const promise = (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return [];

    // Bump to 200 so today's meetings on busy workspaces (>100 recordings/week)
    // are still reachable through the "Add meeting" picker.
    const params = new URLSearchParams({ action: 'list', limit: '200' });
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claap-recordings?${params.toString()}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) return [];

    const apiData = await response.json();
    return (Array.isArray(apiData?.recordings) ? apiData.recordings : [])
      .map(mapApiRecording)
      .filter(Boolean) as ClaapRecording[];
  })();

  liveRecordingsCache.set(cacheKey, { at: now, recordings: cached?.recordings || [], promise });

  try {
    const recordings = await promise;
    liveRecordingsCache.set(cacheKey, { at: Date.now(), recordings });
    return recordings.filter((r) => recordingMatchesSearch(r, search));
  } catch (err) {
    liveRecordingsCache.delete(cacheKey);
    throw err;
  }
}

export function useClaapRecordings() {
  const [recordings, setRecordings] = useState<ClaapRecording[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchRecordings = useCallback(async (search?: string, options: FetchClaapRecordingsOptions = {}) => {
    const { live = true, from, to, limit = 200, bypassLiveCache = false } = options;
    setLoading(true);
    setError(null);
    
    try {
      // Read from the local `claap_recordings` mirror (populated by the
      // claap sync edge function). This is ~10–100x faster than hitting
      // the Claap API on every picker open. Single recording details and
      // transcripts still go through the edge function on demand.
      let query = supabase
        .from('claap_recordings')
        .select('external_id, title, started_at, organizer_email, participants, source_payload, transcript_url, recording_url')
        .order('started_at', { ascending: false, nullsFirst: false })
        .limit(limit);

      if (from) query = query.gte('started_at', from);
      if (to) query = query.lte('started_at', to);

      if (search && search.trim().length > 0) {
        const q = search.trim().replace(/[%,]/g, ' ');
        query = query.or(`title.ilike.%${q}%,organizer_email.ilike.%${q}%`);
      }

      const { data, error: qErr } = await query;
      if (qErr) throw qErr;

      const localRecordings: ClaapRecording[] = (data || []).map(mapLocalRecording);
      setRecordings(localRecordings);

      if (!live) return localRecordings;

      // Also hydrate from the live Claap API. The local mirror can lag behind
      // when someone else on the team owned the recorder, but the current user
      // was an attendee; merging live results lets them find and link/sync it.
      const liveRecordings = await fetchLiveRecordings(search, bypassLiveCache);
      if (liveRecordings.length > 0) {
        const merged = mergeByRecordingId(localRecordings, liveRecordings);
        setRecordings(merged);
        return merged;
      }
      return localRecordings;
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
      return [];
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
        if (response.status === 429 || response.status >= 500) {
          console.warn('[Claap] recording details unavailable', response.status, '— returning null');
          return null;
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch recording');
      }

      const data = await response.json();
      if (data?.rateLimited) {
        console.warn('[Claap] edge fallback', data.upstreamStatus, data.warning || 'showing cached recording');
      }
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
        if (response.status === 429 || response.status >= 500) {
          console.warn('[Claap] transcript unavailable', response.status, '— returning null');
          return null;
        }
        const errorData = await response.json().catch(() => ({}));
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
