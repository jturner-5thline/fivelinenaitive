import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Deal } from '@/types/deal';
import type { StatusNudgeContext } from '@/services/smartStatusNoteSuggestion';
import { stripHtml } from '@/lib/stripHtml';

function fmtDate(d?: string | null): string | null {
  if (!d) return null;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function classifyLender(l: { status?: string | null; trackingStatus?: string | null; stage?: string | null }):
  'sent' | 'passed' | 'other' {
  const all = `${l.status || ''} ${l.trackingStatus || ''} ${l.stage || ''}`.toLowerCase();
  if (/(pass|declin|no.?go|not.a.fit|unrespons)/.test(all)) return 'passed';
  if (/(submit|review|terms|in.diligen|out.?reach|sent|approved|advance)/.test(all)) return 'sent';
  return 'other';
}

/**
 * Aggregates the lightweight context the stale-status nudge needs to
 * generate an AI suggestion. Reuses data already on the `deal` object
 * (lenders) plus a small recent-email query. Disabled until `enabled`
 * is true so we don't fetch on every deal page load.
 */
export function useStaleStatusNoteContext(
  deal: Pick<Deal, 'id' | 'company' | 'name' | 'stage' | 'lenders' | 'notes' | 'contactInfo'> | null | undefined,
  enabled: boolean,
) {
  return useQuery<StatusNudgeContext | null>({
    queryKey: ['stale-status-nudge-ctx', deal?.id, enabled],
    enabled: !!deal?.id && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      if (!deal?.id) return null;

      // Lenders sent / passed from the deal payload itself
      const lendersSent: StatusNudgeContext['lendersSent'] = [];
      const lendersPassed: StatusNudgeContext['lendersPassed'] = [];
      for (const l of deal.lenders || []) {
        const cls = classifyLender(l as any);
        if (cls === 'sent') {
          lendersSent.push({ name: l.name, sentAt: fmtDate((l as any).submittedAt || (l as any).updatedAt) });
        } else if (cls === 'passed') {
          lendersPassed.push({
            name: l.name,
            passedAt: fmtDate((l as any).passedAt || (l as any).updatedAt),
            reason: (l as any).passReason || null,
          });
        }
      }

      // Recent emails for the deal (last 14d, cap 10). Aggregates 3 sources:
      //   1. deal_emails → gmail_messages (canonical user-linked)
      //   2. email_threads where matched_deal_id = deal.id (classifier-linked)
      //   3. email_threads subject ILIKE %companyName% (fallback for the
      //      common case where the classifier has not yet linked threads —
      //      see Czerlonka: 18 plainly-named threads with matched_deal_id NULL)
      type RowWithIso = StatusNudgeContext['recentClientEmails'][number] & { _iso: string | null };
      const collected: RowWithIso[] = [];
      const seenKeys = new Set<string>();
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const pushRow = (key: string, direction: 'in' | 'out', subject: string | null, atISO: string | null) => {
        if (!key || seenKeys.has(key)) return;
        seenKeys.add(key);
        collected.push({ direction, subject, at: fmtDate(atISO), _iso: atISO || null });
      };
      const directionFromSubject = (s: string | null | undefined): 'in' | 'out' => {
        if (!s) return 'out';
        // "Re:" / "Fwd:" / "FW:" anywhere in the first ~30 chars (covers
        // "Out of Office Re: …", "Auto: Re: …", and standard reply prefixes).
        return /\b(Re:|Fwd:|FW:)/i.test(s.slice(0, 30)) ? 'in' : 'out';
      };

      try {
        const { data: dealEmails } = await supabase
          .from('deal_emails')
          .select('gmail_message_id, linked_at')
          .eq('deal_id', deal.id)
          .order('linked_at', { ascending: false })
          .limit(10);
        const ids = (dealEmails || []).map(e => e.gmail_message_id).filter(Boolean);
        if (ids.length) {
          const { data: msgs } = await supabase
            .from('gmail_messages')
            .select('gmail_message_id, subject, from_email, received_at')
            .in('gmail_message_id', ids);
          const map = new Map((msgs || []).map(m => [m.gmail_message_id, m]));
          for (const link of dealEmails || []) {
            const m = map.get(link.gmail_message_id) as any;
            if (!m) continue;
            const contact = (deal.contactInfo || '').toLowerCase();
            const fromE = (m.from_email || '').toLowerCase();
            const direction: 'in' | 'out' =
              contact && fromE && contact.includes(fromE) ? 'in' : 'out';
            pushRow(`gm:${m.gmail_message_id}`, direction, m.subject || null, m.received_at);
          }
        }
      } catch {/* swallow */}

      try {
        const { data: linkedThreads } = await supabase
          .from('email_threads')
          .select('thread_id, subject, latest_message_at')
          .eq('matched_deal_id', deal.id)
          .gte('latest_message_at', since)
          .order('latest_message_at', { ascending: false })
          .limit(10);
        for (const t of linkedThreads || []) {
          pushRow(`th:${t.thread_id}`, directionFromSubject(t.subject), t.subject || null, t.latest_message_at);
        }
      } catch {/* swallow */}

      try {
        const companyName = (deal.company || deal.name || '').trim();
        // Use first token (avoids "& Co" / suffix noise) and require >= 4 chars
        const token = companyName.split(/[\s,&|/]+/).filter(Boolean)[0] || '';
        if (token.length >= 4) {
          const safe = token.replace(/[%_\\]/g, '');
          const { data: subjectThreads } = await supabase
            .from('email_threads')
            .select('thread_id, subject, latest_message_at')
            .ilike('subject', `%${safe}%`)
            .gte('latest_message_at', since)
            .order('latest_message_at', { ascending: false })
            .limit(15);
          for (const t of subjectThreads || []) {
            pushRow(`th:${t.thread_id}`, directionFromSubject(t.subject), t.subject || null, t.latest_message_at);
          }
        }
      } catch {/* swallow */}

      // Sort desc by source ISO date and cap at 10
      collected.sort((a, b) => {
        const av = a._iso ? Date.parse(a._iso) : 0;
        const bv = b._iso ? Date.parse(b._iso) : 0;
        return bv - av;
      });
      const recentClientEmails: StatusNudgeContext['recentClientEmails'] = collected
        .slice(0, 10)
        .map(({ direction, subject, at }) => ({ direction, subject, at }));

      const currentNote = stripHtml(deal.notes || '').slice(0, 600) || null;

      return {
        dealId: deal.id,
        companyName: deal.company || deal.name || null,
        stageLabel: (deal.stage as string) || null,
        daysInStage: null,
        currentNote,
        lendersSent,
        lendersPassed,
        recentClientEmails,
        lastMeetingSummary: null,
        outstandingItems: [],
      } satisfies StatusNudgeContext;
    },
  });
}