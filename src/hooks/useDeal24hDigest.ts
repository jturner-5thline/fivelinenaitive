import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getDailyBriefingWindow } from '@/utils/dailyBriefingWindow';
import { useMemo } from 'react';
import type { Deal } from '@/types/deal';

/**
 * Last-24h digest for a single deal, used by the Pipeline Memo card
 * (Daily Briefing → Pipeline & Clients → Memo view).
 *
 * Aggregates:
 *  • activity_logs (stage changes, lender activity, notes, flex events…)
 *  • email_cache + email_analysis (relevant inbound/outbound emails)
 *  • claap_meetings (recorded calls touching the deal)
 *
 * Returns:
 *  • prose: Array of structured paragraphs (with bold key facts)
 *  • tags:  Array of milestone-derived chips (IOI Calls Complete, Docs Submitted…)
 *  • counts: raw counts so the card can show "0 updates" empty state cleanly
 */

export interface DigestProseSegment {
  text: string;
  bold?: boolean;
}

export interface DigestParagraph {
  /** Section heading shown above the prose, e.g. "Lender Activity". */
  heading?: string;
  /** Inline segments — render bold ones as <strong>. */
  segments: DigestProseSegment[];
}

export interface Deal24hDigest {
  prose: DigestParagraph[];
  tags: string[];
  counts: {
    activities: number;
    emails: number;
    meetings: number;
    stageChanges: number;
    lenderEvents: number;
  };
  windowLabel: string;
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function deriveTagsFromMilestones(deal: Deal | undefined): string[] {
  const tags: string[] = [];
  const ms = deal?.milestones || [];
  if (ms.length === 0) return tags;

  // Generate tags from the milestone titles + completion state.
  // We map a few well-known phrases to canonical chip labels and otherwise
  // pass the title through verbatim with a status suffix.
  const titleMap: Array<{ match: RegExp; doneLabel: string; pendingLabel: string }> = [
    { match: /ioi|indication of interest/i, doneLabel: 'IOI Calls Complete', pendingLabel: 'IOI Calls Pending' },
    { match: /document|drl|submitted/i, doneLabel: 'Docs Submitted', pendingLabel: 'Docs Pending' },
    { match: /term sheet|term/i, doneLabel: 'Terms Issued', pendingLabel: 'Terms Pending' },
    { match: /diligence|dd/i, doneLabel: 'Diligence Complete', pendingLabel: 'Diligence In Progress' },
    { match: /clos|fund/i, doneLabel: 'Closed', pendingLabel: 'Closing Pending' },
  ];

  for (const m of ms) {
    if (!m.title) continue;
    const mapped = titleMap.find(x => x.match.test(m.title));
    if (mapped) {
      tags.push(m.completed ? mapped.doneLabel : mapped.pendingLabel);
    } else {
      tags.push(`${m.title}${m.completed ? ' ✓' : ''}`);
    }
  }
  // Dedupe while preserving order
  return Array.from(new Set(tags)).slice(0, 8);
}

export function useDeal24hDigest(deal: Deal | undefined) {
  const window = useMemo(() => getDailyBriefingWindow('interactive'), []);

  return useQuery<Deal24hDigest>({
    queryKey: ['deal-24h-digest', deal?.id, window.startISO],
    enabled: !!deal?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const dealId = deal!.id;
      const { startISO, endISO, label } = window;

      const [activityRes, emailRes, meetingsRes] = await Promise.all([
        supabase
          .from('activity_logs')
          .select('id, activity_type, description, user_display_name, created_at, metadata')
          .eq('deal_id', dealId)
          .gte('created_at', startISO)
          .lte('created_at', endISO)
          .order('created_at', { ascending: false })
          .limit(40),
        supabase
          .from('email_cache')
          .select('id, subject, snippet, from_name, from_email, received_at')
          .ilike('subject', `%${deal!.company || deal!.name}%`)
          .gte('received_at', startISO)
          .lte('received_at', endISO)
          .order('received_at', { ascending: false })
          .limit(20),
        supabase
          .from('claap_meetings')
          .select('id, title, ai_summary, started_at, deal_id')
          .eq('deal_id', dealId)
          .gte('started_at', startISO)
          .lte('started_at', endISO)
          .order('started_at', { ascending: false })
          .limit(10),
      ]);

      const activities = activityRes.data || [];
      const emails = emailRes.data || [];
      const meetings = meetingsRes.data || [];

      const stageChanges = activities.filter(a =>
        ['stage_change', 'lender_stage_change'].includes(a.activity_type),
      );
      const lenderEvents = activities.filter(a => a.activity_type?.startsWith('lender'));
      const noteEvents = activities.filter(a => a.activity_type?.includes('note'));
      const flexEvents = activities.filter(a => a.activity_type?.includes('flex'));

      const prose: DigestParagraph[] = [];

      // ─── Lender / pipeline movement ────────────────────────
      if (stageChanges.length > 0) {
        const top = stageChanges.slice(0, 3);
        const segs: DigestProseSegment[] = [];
        top.forEach((sc, idx) => {
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

      // ─── Meetings ─────────────────────────────────────────
      if (meetings.length > 0) {
        const segs: DigestProseSegment[] = [];
        meetings.slice(0, 3).forEach((m, idx) => {
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

      // ─── Emails ───────────────────────────────────────────
      if (emails.length > 0) {
        const segs: DigestProseSegment[] = [];
        emails.slice(0, 4).forEach((e, idx) => {
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

      // ─── Notes & internal updates ─────────────────────────
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

      // ─── FLEx / external requests ─────────────────────────
      if (flexEvents.length > 0) {
        const segs: DigestProseSegment[] = [];
        flexEvents.slice(0, 3).forEach((a, idx) => {
          if (idx > 0) segs.push({ text: ' ' });
          segs.push({ text: a.description || a.activity_type, bold: true });
        });
        prose.push({ heading: 'FLEx', segments: segs });
      }

      // ─── Empty state ──────────────────────────────────────
      if (prose.length === 0) {
        prose.push({
          segments: [
            { text: 'No tracked activity in the last 24 hours. Deal currently at ' },
            { text: deal?.stage || 'pipeline stage', bold: true },
            { text: '.' },
          ],
        });
      }

      return {
        prose,
        tags: deriveTagsFromMilestones(deal),
        counts: {
          activities: activities.length,
          emails: emails.length,
          meetings: meetings.length,
          stageChanges: stageChanges.length,
          lenderEvents: lenderEvents.length,
        },
        windowLabel: label || 'Last 24 hours',
      };
    },
  });
}