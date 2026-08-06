import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isKickOffCall } from '@/lib/claap/clientActionItems';

export interface CallOutstandingContext {
  companyName: string | null;
  dealName: string | null;
  /** Lender names attached to the deal (requester options). */
  lenderNames: string[];
  /** Names of internal (5th Line / nAItive) participants on the call. */
  internalNames: string[];
  /** Lender identified on the calendar invite by attendee email domain. */
  lenderOnCall: string | null;
  isKickOff: boolean;
}

const EMPTY: CallOutstandingContext = {
  companyName: null,
  dealName: null,
  lenderNames: [],
  internalNames: [],
  lenderOnCall: null,
  isKickOff: false,
};

function domainOf(value?: string | null): string | null {
  if (!value) return null;
  const raw = String(value).trim().toLowerCase();
  const email = raw.includes('@') ? raw.split('@').pop() : raw;
  return (email || '')
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .trim() || null;
}

/**
 * Resolves who was on a Claap call so client action items can be routed to
 * Outstanding Items with the right requester (the lender on the invite, or
 * 5th Line for kick-off calls).
 */
export function useCallOutstandingContext(
  recordingId?: string | null,
  dealId?: string | null,
  meetingTitle?: string | null,
): CallOutstandingContext {
  const [ctx, setCtx] = useState<CallOutstandingContext>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    if (!dealId) { setCtx(EMPTY); return; }

    (async () => {
      const next: CallOutstandingContext = { ...EMPTY, isKickOff: isKickOffCall(meetingTitle) };

      const [{ data: deal }, { data: dealLenders }] = await Promise.all([
        (supabase.from('deals') as any).select('company, company_url').eq('id', dealId).maybeSingle(),
        (supabase.from('deal_lenders') as any).select('id, name, master_lender_id').eq('deal_id', dealId),
      ]);

      next.companyName = deal?.company ?? null;
      next.dealName = deal?.company ?? null;
      const lenders: Array<{ id: string; name: string; master_lender_id: string | null }> = dealLenders ?? [];
      next.lenderNames = lenders.map((l) => l.name).filter(Boolean);

      // Lender domains from the master directory + lender contacts.
      const masterIds = lenders.map((l) => l.master_lender_id).filter(Boolean) as string[];
      const domainsByLender = new Map<string, Set<string>>();
      const addDomain = (lenderName: string, value?: string | null) => {
        const d = domainOf(value);
        if (!d) return;
        if (!domainsByLender.has(lenderName)) domainsByLender.set(lenderName, new Set());
        domainsByLender.get(lenderName)!.add(d);
      };

      if (masterIds.length) {
        const [{ data: masters }, { data: contacts }] = await Promise.all([
          (supabase.from('master_lenders') as any).select('id, website, email').in('id', masterIds),
          (supabase.from('lender_contacts') as any).select('lender_id, email').in('lender_id', masterIds),
        ]);
        const nameByMaster = new Map(lenders.filter((l) => l.master_lender_id).map((l) => [l.master_lender_id as string, l.name]));
        for (const m of masters ?? []) {
          const n = nameByMaster.get(m.id);
          if (!n) continue;
          addDomain(n, m.website);
          addDomain(n, m.email);
        }
        for (const c of contacts ?? []) {
          const n = nameByMaster.get(c.lender_id);
          if (n) addDomain(n, c.email);
        }
      }

      // Calendar/Claap participants for this recording.
      if (recordingId) {
        const { data: mtg } = await (supabase.from('claap_meetings') as any)
          .select('id, title')
          .eq('claap_id', recordingId)
          .maybeSingle();
        if (mtg?.title && !next.isKickOff) next.isKickOff = isKickOffCall(mtg.title);
        if (mtg?.id) {
          const { data: parts } = await (supabase.from('claap_meeting_participants') as any)
            .select('name, email, domain, is_internal')
            .eq('meeting_id', mtg.id);
          const participants = parts ?? [];
          next.internalNames = participants
            .filter((p: any) => p.is_internal)
            .map((p: any) => p.name)
            .filter(Boolean);

          const externalDomains = participants
            .filter((p: any) => !p.is_internal)
            .map((p: any) => domainOf(p.domain || p.email))
            .filter(Boolean) as string[];

          for (const [lenderName, domains] of domainsByLender) {
            if (externalDomains.some((d) => domains.has(d))) { next.lenderOnCall = lenderName; break; }
          }
          // Fallback: match lender name tokens against the attendee domain.
          if (!next.lenderOnCall) {
            for (const lenderName of next.lenderNames) {
              const toks = lenderName.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
              if (toks.length && externalDomains.some((d) => toks.some((t) => d.includes(t)))) {
                next.lenderOnCall = lenderName;
                break;
              }
            }
          }
        }
      }

      if (!cancelled) setCtx(next);
    })().catch((err) => console.warn('useCallOutstandingContext failed', err));

    return () => { cancelled = true; };
  }, [recordingId, dealId, meetingTitle]);

  return ctx;
}
