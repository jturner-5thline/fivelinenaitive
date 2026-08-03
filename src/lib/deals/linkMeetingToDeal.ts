import { supabase } from '@/integrations/supabase/client';

/**
 * Canonical "link a calendar meeting to a deal" writer.
 *
 * A link is only real when ALL of these happen:
 *   1. `meeting_deal_links` row (source of truth for the EOD / agenda UI)
 *   2. `deal_calendar_items` entry so the meeting shows on the deal calendar
 *   3. `deal_audit_log` entry so it shows in the deal activity feed
 *   4. any Claap recording attached to the event (`event_claap_recordings`)
 *      is mirrored into `deal_claap_recordings`
 *
 * Every step is idempotent — re-linking the same meeting is a no-op.
 */
export interface LinkMeetingToDealArgs {
  eventId: string;
  eventTitle: string;
  /** ISO start timestamp of the meeting, when known. */
  eventStartISO?: string | null;
  dealId: string;
  dealName?: string | null;
  orgCompanyId: string;
  userId: string;
  /** Existing (active) meeting_deal_links row id to supersede. */
  existingLinkId?: string | null;
}

export interface LinkMeetingToDealResult {
  calendarItemId: string | null;
  claapRecordingsLinked: number;
}

function splitLocalDateTime(iso?: string | null): { date: string | null; time: string | null } {
  if (!iso) return { date: null, time: null };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: null, time: null };
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}:00`,
  };
}

export async function linkMeetingToDeal(
  args: LinkMeetingToDealArgs,
): Promise<LinkMeetingToDealResult> {
  const {
    eventId, eventTitle, eventStartISO, dealId, dealName,
    orgCompanyId, userId, existingLinkId,
  } = args;

  // (1) canonical link ------------------------------------------------------
  if (existingLinkId) {
    await (supabase.from('meeting_deal_links') as any)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', existingLinkId);
  }
  const { error: linkError } = await (supabase.from('meeting_deal_links') as any).insert({
    meeting_external_id: eventId,
    deal_id: dealId,
    org_company_id: orgCompanyId,
    linked_by_user_id: userId,
  });
  if (linkError) throw linkError;

  // (2) deal calendar entry -------------------------------------------------
  let calendarItemId: string | null = null;
  const { date, time } = splitLocalDateTime(eventStartISO);
  if (date) {
    try {
      const { data: existingItem } = await supabase
        .from('deal_calendar_items')
        .select('id')
        .eq('deal_id', dealId)
        .eq('date', date)
        .eq('title', eventTitle)
        .limit(1)
        .maybeSingle();
      if (existingItem?.id) {
        calendarItemId = existingItem.id as string;
      } else {
        const { data: created } = await supabase
          .from('deal_calendar_items')
          .insert({
            deal_id: dealId,
            title: eventTitle,
            date,
            time,
            notes: null,
            type: 'meeting',
            created_by: userId,
          } as never)
          .select('id')
          .single();
        calendarItemId = (created as { id: string } | null)?.id ?? null;
      }

      if (calendarItemId) {
        // Provenance backlink (idempotent on the same tuple).
        const { data: existingSource } = await supabase
          .from('calendar_item_sources')
          .select('id')
          .eq('deal_id', dealId)
          .eq('source_module', 'rundown_item')
          .eq('source_record_id', eventId)
          .limit(1)
          .maybeSingle();
        if (!existingSource?.id) {
          await supabase.from('calendar_item_sources').insert({
            deal_id: dealId,
            deal_calendar_item_id: calendarItemId,
            source_module: 'rundown_item',
            source_record_id: eventId,
            source_timestamp: eventStartISO ?? new Date().toISOString(),
            source_text: eventTitle,
            created_by: userId,
          } as never);
        }
      }
    } catch (e) {
      console.warn('[linkMeetingToDeal] calendar item write failed', e);
    }
  }

  // (4) mirror Claap recordings attached to the event ----------------------
  let claapRecordingsLinked = 0;
  try {
    const { data: ecr } = await (supabase.from('event_claap_recordings') as any)
      .select('recording_id, recording_title, recording_url, thumbnail_url, duration_seconds, recorder_name, recorder_email')
      .eq('org_company_id', orgCompanyId)
      .eq('event_id', eventId);
    const rows = (ecr || []) as Array<Record<string, any>>;
    if (rows.length) {
      const { error: recErr } = await supabase
        .from('deal_claap_recordings')
        .upsert(
          rows.map(r => ({
            deal_id: dealId,
            recording_id: r.recording_id,
            recording_title: r.recording_title ?? null,
            recording_url: r.recording_url ?? null,
            thumbnail_url: r.thumbnail_url ?? null,
            duration_seconds: Number.isFinite(r.duration_seconds) ? r.duration_seconds : 0,
            recorder_name: r.recorder_name ?? null,
            recorder_email: r.recorder_email ?? null,
            linked_by: userId,
            notes: null,
          })) as never,
          { onConflict: 'deal_id,recording_id' },
        );
      if (!recErr) claapRecordingsLinked = rows.length;
    }
  } catch (e) {
    console.warn('[linkMeetingToDeal] claap mirror failed', e);
  }

  // (3) deal activity -------------------------------------------------------
  try {
    await supabase.from('deal_audit_log').insert({
      deal_id: dealId,
      user_id: userId,
      action_type: 'meeting_linked',
      entity_type: 'meeting',
      entity_id: eventId,
      entity_name: eventTitle,
      source: 'end_of_day',
      metadata: {
        event_id: eventId,
        event_start: eventStartISO ?? null,
        deal_name: dealName ?? null,
        calendar_item_id: calendarItemId,
        claap_recordings_linked: claapRecordingsLinked,
      },
    } as never);
  } catch (e) {
    console.warn('[linkMeetingToDeal] audit log write failed', e);
  }

  return { calendarItemId, claapRecordingsLinked };
}