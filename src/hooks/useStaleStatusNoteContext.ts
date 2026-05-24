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

      // Recent emails for the deal (last 10)
      const recentClientEmails: StatusNudgeContext['recentClientEmails'] = [];
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
            // Direction: if from_email matches contactInfo loosely, treat as inbound
            const contact = (deal.contactInfo || '').toLowerCase();
            const fromE = (m.from_email || '').toLowerCase();
            const direction: 'in' | 'out' = contact && fromE && contact.includes(fromE) ? 'in' : 'out';
            recentClientEmails.push({
              direction,
              subject: m.subject || null,
              at: fmtDate(m.received_at),
            });
          }
        }
      } catch {
        /* swallow */
      }

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