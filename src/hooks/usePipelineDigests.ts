import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getDailyBriefingWindow } from '@/utils/dailyBriefingWindow';
import type { Deal } from '@/types/deal';
import type { Deal24hDigest, DigestParagraph, DigestProseSegment } from './useDeal24hDigest';

/**
 * Batched 24h digest builder for the Pipeline & Clients Memo view.
 *
 * Performance:
 *  - 3 queries TOTAL (activities, emails, meetings) regardless of deal count,
 *    instead of 3 × N as the per-deal `useDeal24hDigest` hook does.
 *  - All bucketing happens client-side in a memoized selector.
 *  - Returns a Map keyed by deal id so cards do O(1) lookups.
 *
 * Cache: 60s stale, keyed by the 24h window start so it auto-rotates each day.
 */

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function deriveTagsFromMilestones(deal: Deal): string[] {
  const ms = deal.milestones || [];
  if (ms.length === 0) return [];
  const titleMap: Array<{ match: RegExp; doneLabel: string; pendingLabel: string }> = [
    { match: /ioi|indication of interest/i, doneLabel: 'IOI Calls Complete', pendingLabel: 'IOI Calls Pending' },
    { match: /document|drl|submitted/i, doneLabel: 'Docs Submitted', pendingLabel: 'Docs Pending' },
    { match: /term sheet|term/i, doneLabel: 'Terms Issued', pendingLabel: 'Terms Pending' },
    { match: /diligence|dd/i, doneLabel: 'Diligence Complete', pendingLabel: 'Diligence In Progress' },
    { match: /clos|fund/i, doneLabel: 'Closed', pendingLabel: 'Closing Pending' },
  ];
  const tags: string[] = [];
  for (const m of ms) {
    if (!m.title) continue;
    const mapped = titleMap.find(x => x.match.test(m.title));
    tags.push(mapped ? (m.completed ? mapped.doneLabel : mapped.pendingLabel) : `${m.title}${m.completed ? ' ✓' : ''}`);
  }
  return Array.from(new Set(tags)).slice(0, 8);
}

interface RawActivity {
  id: string;
  deal_id: string | null;
  activity_type: string;
  description: string | null;
  user_display_name: string | null;
  created_at: string;
  metadata: any;
}
interface RawMeeting {
  id: string;
  deal_id: string | null;
  title: string | null;
  ai_summary: string | null;
  started_at: string | null;
}
interface RawEmail {
  id: string;
  subject: string | null;
  snippet: string | null;
  from_name: string | null;
  from_email: string | null;
  received_at: string | null;
}

interface BatchedRaw {
  activities: RawActivity[];
  meetings: RawMeeting[];
  // Emails are not deal-scoped in the cache table, so we keep a flat list and
  // match per deal by company/name keyword. Bounded to 200 rows.
  emails: RawEmail[];
  windowLabel: string;
}

function buildDigestFor(
  deal: Deal,
  bucketActivities: RawActivity[],
  bucketMeetings: RawMeeting[],
  bucketEmails: RawEmail[],
  windowLabel: string,
): Deal24hDigest {
  const stageChanges = bucketActivities.filter(a =>
    ['stage_change', 'lender_stage_change'].includes(a.activity_type),
  );
  const lenderEvents = bucketActivities.filter(a => a.activity_type?.startsWith('lender'));
  const noteEvents = bucketActivities.filter(a => a.activity_type?.includes('note'));
  const flexEvents = bucketActivities.filter(a => a.activity_type?.includes('flex'));

  const prose: DigestParagraph[] = [];

  if (stageChanges.length > 0) {
    const segs: DigestProseSegment[] = [];
    stageChanges.slice(0, 3).forEach((sc, idx) => {
      const meta = (sc.metadata as any) || {};
      const lender = meta.lender_name as string | undefined;
      const from = meta.from as string | undefined;
      const to = meta.to as string | undefined;
      if (idx > 0) segs.push({ text: ' Then ' });
      if (lender) {
        segs.push({ text: lender, bold: true });
        segs.push({ text: ' moved to ' });
        segs.push({ text: to || 'a new stage', bold: true });
        if (from) segs.push({ text: ` from ${from}` });
        segs.push({ text: '.' });
      } else {
        segs.push({ text: 'Deal stage moved to ' });
        segs.push({ text: to || 'a new stage', bold: true });
        segs.push({ text: '.' });
      }
    });
    prose.push({ heading: 'Lender activity', segments: segs });
  }

  if (bucketMeetings.length > 0) {
    const segs: DigestProseSegment[] = [];
    bucketMeetings.slice(0, 3).forEach((m, idx) => {
      if (idx > 0) segs.push({ text: ' ' });
      segs.push({ text: 'Call: ' });
      segs.push({ text: m.title || 'Untitled meeting', bold: true });
      if (m.started_at) segs.push({ text: ` at ${fmtTime(m.started_at)}` });
      if (m.ai_summary) {
        const trimmed = m.ai_summary.length > 180 ? `${m.ai_summary.slice(0, 180)}…` : m.ai_summary;
        segs.push({ text: ` — ${trimmed}` });
      }
      segs.push({ text: '.' });
    });
    prose.push({ heading: 'Conversations', segments: segs });
  }

  if (bucketEmails.length > 0) {
    const segs: DigestProseSegment[] = [];
    bucketEmails.slice(0, 4).forEach((e, idx) => {
      if (idx > 0) segs.push({ text: ' ' });
      segs.push({ text: e.from_name || e.from_email || 'Counterparty', bold: true });
      segs.push({ text: ' — ' });
      segs.push({ text: e.subject || '(no subject)', bold: true });
      if (e.snippet) {
        const snip = e.snippet.length > 140 ? `${e.snippet.slice(0, 140)}…` : e.snippet;
        segs.push({ text: `: ${snip}` });
      }
      segs.push({ text: '.' });
    });
    prose.push({ heading: 'Email thread', segments: segs });
  }

  if (noteEvents.length > 0) {
    const segs: DigestProseSegment[] = [];
    noteEvents.slice(0, 3).forEach((a, idx) => {
      if (idx > 0) segs.push({ text: ' ' });
      if (a.user_display_name) {
        segs.push({ text: a.user_display_name, bold: true });
        segs.push({ text: ': ' });
      }
      segs.push({ text: a.description || '' });
    });
    prose.push({ heading: 'Internal notes', segments: segs });
  }

  if (flexEvents.length > 0) {
    const segs: DigestProseSegment[] = [];
    flexEvents.slice(0, 3).forEach((a, idx) => {
      if (idx > 0) segs.push({ text: ' ' });
      segs.push({ text: a.description || a.activity_type, bold: true });
    });
    prose.push({ heading: 'FLEx', segments: segs });
  }

  if (prose.length === 0) {
    prose.push({
      segments: [
        { text: 'No tracked activity in the last 24 hours. Deal currently at ' },
        { text: deal.stage || 'pipeline stage', bold: true },
        { text: '.' },
      ],
    });
  }

  return {
    prose,
    tags: deriveTagsFromMilestones(deal),
    counts: {
      activities: bucketActivities.length,
      emails: bucketEmails.length,
      meetings: bucketMeetings.length,
      stageChanges: stageChanges.length,
      lenderEvents: lenderEvents.length,
    },
    windowLabel,
  };
}

/**
 * Returns a Map<dealId, Deal24hDigest> built from 3 batched queries.
 * Pass it to memo cards via context or props for O(1) per-card reads.
 */
export interface PipelineDigestRaw {
  activities: RawActivity[];
  meetings: RawMeeting[];
  emails: RawEmail[];
}

export function usePipelineDigests(deals: Deal[], enabled: boolean = true) {
  const window = useMemo(() => getDailyBriefingWindow('interactive'), []);
  const dealIds = useMemo(() => deals.map(d => d.id).filter(Boolean), [deals]);
  // Stable cache key — bucket id list to avoid invalidating on every re-render.
  const idsKey = useMemo(() => dealIds.slice().sort().join(','), [dealIds]);

  const raw = useQuery<BatchedRaw>({
    queryKey: ['pipeline-digests-batched', window.startISO, idsKey],
    enabled: enabled && dealIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { startISO, endISO, label } = window;

      // Chunk deal_ids to keep .in() filter under URL limits (~250 ids per chunk).
      const chunks: string[][] = [];
      for (let i = 0; i < dealIds.length; i += 200) chunks.push(dealIds.slice(i, i + 200));

      const activityChunks = await Promise.all(
        chunks.map(ids =>
          supabase
            .from('activity_logs')
            .select('id, deal_id, activity_type, description, user_display_name, created_at, metadata')
            .in('deal_id', ids)
            .gte('created_at', startISO)
            .lte('created_at', endISO)
            .order('created_at', { ascending: false })
            .limit(500),
        ),
      );
      const meetingChunks = await Promise.all(
        chunks.map(ids =>
          supabase
            .from('claap_meetings')
            .select('id, deal_id, title, ai_summary, started_at')
            .in('deal_id', ids)
            .gte('started_at', startISO)
            .lte('started_at', endISO)
            .order('started_at', { ascending: false })
            .limit(200),
        ),
      );
      const emailRes = await supabase
        .from('email_cache')
        .select('id, subject, snippet, from_name, from_email, received_at')
        .gte('received_at', startISO)
        .lte('received_at', endISO)
        .order('received_at', { ascending: false })
        .limit(200);

      return {
        activities: activityChunks.flatMap(r => r.data || []) as RawActivity[],
        meetings: meetingChunks.flatMap(r => r.data || []) as RawMeeting[],
        emails: (emailRes.data || []) as RawEmail[],
        windowLabel: label || 'Last 24 hours',
      };
    },
  });

  // Bucket once into a Map<dealId, digest>. Recomputes only when raw or
  // deal list changes — not on every card render.
  const { digestMap, rawByDeal } = useMemo(() => {
    const map = new Map<string, Deal24hDigest>();
    const rawMap = new Map<string, PipelineDigestRaw>();
    if (!raw.data) return { digestMap: map, rawByDeal: rawMap };

    const { activities, meetings, emails, windowLabel } = raw.data;

    // Pre-bucket activity & meeting by deal_id for O(N) total work.
    const activityByDeal = new Map<string, RawActivity[]>();
    for (const a of activities) {
      if (!a.deal_id) continue;
      const arr = activityByDeal.get(a.deal_id) || [];
      arr.push(a);
      activityByDeal.set(a.deal_id, arr);
    }
    const meetingsByDeal = new Map<string, RawMeeting[]>();
    for (const m of meetings) {
      if (!m.deal_id) continue;
      const arr = meetingsByDeal.get(m.deal_id) || [];
      arr.push(m);
      meetingsByDeal.set(m.deal_id, arr);
    }

    for (const deal of deals) {
      const needle = ((deal.company || deal.name || '') as string).toLowerCase().trim();
      const dealEmails = needle
        ? emails.filter(e => (e.subject || '').toLowerCase().includes(needle))
        : [];
      const dealActivities = activityByDeal.get(deal.id) || [];
      const dealMeetings = meetingsByDeal.get(deal.id) || [];
      rawMap.set(deal.id, {
        activities: dealActivities,
        meetings: dealMeetings,
        emails: dealEmails,
      });
      map.set(
        deal.id,
        buildDigestFor(
          deal,
          dealActivities,
          dealMeetings,
          dealEmails,
          windowLabel,
        ),
      );
    }
    return { digestMap: map, rawByDeal: rawMap };
  }, [raw.data, deals]);

  return { digestMap, rawByDeal, isLoading: raw.isLoading, isError: raw.isError };
}