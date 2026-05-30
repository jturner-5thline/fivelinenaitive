import type { Database, Json } from '@/integrations/supabase/types';

export type MeetingClaapSource = 'claap' | 'synthesized' | 'none';

export interface SynthesizedMeetingNoteContent {
  summary_md: string;
  action_items: string[];
  key_takeaways: string[];
}

export interface MeetingClaapRecordingRef {
  id: string;
  rowId?: string | null;
  title: string | null;
  url: string | null;
  meetingRowId: string | null;
  linkedNote: string | null;
}

export interface MeetingClaapDebugInfo {
  querySql: string | null;
  eventLinkRecordingId?: string | null;
  meetingMatchId?: string | null;
  recordingExternalId?: string | null;
  recordingRowId?: string | null;
  hookSource?: string | null;
}

export interface MeetingClaapContextValue {
  recording: MeetingClaapRecordingRef | null;
  summary: string | null;
  actionItems: string[];
  keyTakeaways: string[];
  source: MeetingClaapSource;
  transcriptAvailable: boolean;
  debug: MeetingClaapDebugInfo | null;
  isLoading: boolean;
  fetching: boolean;
  error: string | null;
}

export type EventClaapRecordingRow = Pick<
  Database['public']['Tables']['event_claap_recordings']['Row'],
  'recording_id' | 'recording_title' | 'recording_url' | 'notes'
>;

export type ClaapRecordingRow = Pick<
  Database['public']['Tables']['claap_recordings']['Row'],
  'external_id' | 'summary' | 'action_items' | 'key_takeaways' | 'synthesized_note'
>;

export type ClaapMeetingRow = Pick<
  Database['public']['Tables']['claap_meetings']['Row'],
  'id' | 'claap_id' | 'ai_summary' | 'next_steps' | 'key_decisions'
>;

export type MeetingSynthesizedNoteRow = Pick<
  Database['public']['Tables']['meeting_synthesized_notes']['Row'],
  'meeting_id' | 'content' | 'model' | 'updated_at'
>;

export function asStringArray(value: Json | string[] | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : String(entry ?? '').trim()))
    .filter(Boolean);
}

export function asSynthesizedContent(value: Json | null | undefined): SynthesizedMeetingNoteContent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, Json | undefined>;
  const summary = typeof record.summary_md === 'string' ? record.summary_md.trim() : '';
  const actionItems = asStringArray(record.action_items);
  const keyTakeaways = asStringArray(record.key_takeaways);
  if (!summary && actionItems.length === 0 && keyTakeaways.length === 0) return null;
  return {
    summary_md: summary,
    action_items: actionItems,
    key_takeaways: keyTakeaways,
  };
}