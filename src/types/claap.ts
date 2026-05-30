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

/**
 * Remove Claap inline timestamp citations like `%[16:03]()` or `%[01:23:45]()`
 * that the API embeds for in-app deep-linking. They are noise in plain-text
 * targets like the Add Note textarea.
 */
export function stripClaapTimestamps(input: string | null | undefined): string {
  if (!input) return '';
  return String(input)
    .replace(/%\[(\d{1,2}:\d{2}(?::\d{2})?)\]\(\)/g, '')
    // collapse the double-spaces those substitutions can leave behind.
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+(\n)/g, '$1')
    .trim();
}

/**
 * Format a single action_item entry from Claap.
 * Supported shapes:
 *  - { text, assignee?, due?, completed? | checked? }       (our canonical / current Claap API)
 *  - { content, owner?, deadline? }                          (legacy alt naming)
 *  - string                                                  (plain markdown)
 * Anything else is logged once and skipped.
 */
export function formatActionItem(item: unknown): string | null {
  if (item == null) return null;
  if (typeof item === 'string') {
    const stripped = stripClaapTimestamps(item);
    return stripped ? `- ${stripped}` : null;
  }
  if (typeof item !== 'object') return null;
  const rec = item as Record<string, unknown>;
  const rawText =
    (typeof rec.text === 'string' && rec.text) ||
    (typeof rec.content === 'string' && rec.content) ||
    (typeof rec.description === 'string' && rec.description) ||
    null;
  if (!rawText) {
    try {
      // eslint-disable-next-line no-console
      console.warn('[claap] action item shape not recognised', JSON.stringify(item).slice(0, 200));
    } catch {
      // ignore
    }
    return null;
  }
  const text = stripClaapTimestamps(rawText);
  if (!text) return null;
  const assignee =
    (typeof rec.assignee === 'string' && rec.assignee) ||
    (typeof rec.owner === 'string' && rec.owner) ||
    null;
  const due =
    (typeof rec.due === 'string' && rec.due) ||
    (typeof rec.deadline === 'string' && rec.deadline) ||
    (typeof rec.dueDate === 'string' && rec.dueDate) ||
    null;
  const assigneeSuffix = assignee ? ` (@${assignee})` : '';
  const dueSuffix = due ? ` — due ${due}` : '';
  return `- ${text}${assigneeSuffix}${dueSuffix}`;
}

export function asStringArray(value: Json | string[] | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string') {
      const stripped = stripClaapTimestamps(entry);
      if (stripped) out.push(stripped);
      continue;
    }
    if (entry && typeof entry === 'object') {
      const formatted = formatActionItem(entry);
      if (formatted) {
        // Strip the leading "- " — callers add their own bullet.
        out.push(formatted.replace(/^- /, ''));
      }
      continue;
    }
  }
  return out;
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