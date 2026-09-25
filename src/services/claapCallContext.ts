import { supabase } from '@/integrations/supabase/client';

export interface ClaapCallBlock {
  startedAt: string;
  block: string;
}

const asList = (v: any): string[] => {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : typeof v === 'object' ? Object.values(v) : [v];
  return arr
    .map((x: any) => (typeof x === 'string' ? x : x?.text || x?.title || x?.description || x?.content || ''))
    .map((s: string) => String(s).trim())
    .filter(Boolean);
};

/**
 * Recent Claap call summaries for a deal (optionally narrowed to one funding source).
 * Deal calls: explicitly linked via deal_claap_recordings or claap_recording_links (deal).
 * Funding source calls: linked to the lender AND (linked to the deal OR mentions the deal),
 * or deal-linked calls whose participants include the lender's email domains.
 */
export async function fetchClaapCallBlocks(opts: {
  dealIds: string[];
  masterLenderId?: string | null;
  lenderDomains?: Set<string>;
  lenderEmails?: Set<string>;
  dealRefRe?: RegExp | null;
  days?: number;
  limit?: number;
}): Promise<ClaapCallBlock[]> {
  const { dealIds, masterLenderId, lenderDomains, lenderEmails, dealRefRe, days = 90, limit = 3 } = opts;
  if (!dealIds.length) return [];
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const cols = 'id, external_id, title, started_at, summary, key_takeaways, action_items, participants';

  try {
    const [dcr, dealLinks, lenderLinks] = await Promise.all([
      (supabase.from('deal_claap_recordings') as any).select('recording_id').in('deal_id', dealIds),
      (supabase.from('claap_recording_links') as any).select('recording_id, review_status')
        .eq('entity_type', 'deal').in('entity_id', dealIds),
      masterLenderId
        ? (supabase.from('claap_recording_links') as any).select('recording_id, review_status')
            .eq('link_role', 'funding_source').eq('entity_id', masterLenderId)
        : Promise.resolve({ data: [] }),
    ]);
    const extIds = Array.from(new Set((dcr.data || []).map((r: any) => r.recording_id).filter(Boolean))) as string[];
    const okLink = (r: any) => r.recording_id && r.review_status !== 'rejected';
    const dealRowIds = new Set<string>((dealLinks.data || []).filter(okLink).map((r: any) => r.recording_id));
    const lenderRowIds = new Set<string>((lenderLinks.data || []).filter(okLink).map((r: any) => r.recording_id));

    const q = (build: (b: any) => any) =>
      build((supabase.from('claap_recordings') as any).select(cols)).gte('started_at', since).limit(50)
        .then((r: any) => r.data || []).catch(() => []);
    const lists = await Promise.all([
      extIds.length ? q((b) => b.in('external_id', extIds.slice(0, 200))) : [],
      dealRowIds.size ? q((b) => b.in('id', Array.from(dealRowIds).slice(0, 200))) : [],
      lenderRowIds.size ? q((b) => b.in('id', Array.from(lenderRowIds).slice(0, 200))) : [],
    ]);
    const dealRecs = new Map<string, any>();
    [...lists[0], ...lists[1]].forEach((r: any) => dealRecs.set(r.id, r));

    let picked: any[];
    if (masterLenderId !== undefined) {
      const hasLenderAttendee = (r: any) => {
        const p = JSON.stringify(r.participants || []).toLowerCase();
        return (
          Array.from(lenderDomains || []).some((d) => p.includes(`@${d}`)) ||
          Array.from(lenderEmails || []).some((e) => p.includes(e))
        );
      };
      const out = new Map<string, any>();
      for (const r of lists[2] as any[]) {
        const text = `${r.title || ''} ${r.summary || ''} ${asList(r.key_takeaways).join(' ')}`;
        if (dealRecs.has(r.id) || (dealRefRe && dealRefRe.test(text))) out.set(r.id, r);
      }
      dealRecs.forEach((r, id) => { if (hasLenderAttendee(r)) out.set(id, r); });
      picked = Array.from(out.values());
    } else {
      picked = Array.from(dealRecs.values());
    }

    return picked
      .filter((r) => r.summary || asList(r.key_takeaways).length || asList(r.action_items).length)
      .sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))
      .slice(0, limit)
      .map((r) => {
        const d = r.started_at ? new Date(r.started_at).toLocaleDateString('en-US') : '';
        const tk = asList(r.key_takeaways).slice(0, 6).map((s) => `- ${s}`).join('\n');
        const ai = asList(r.action_items).slice(0, 5).map((s) => `- ${s}`).join('\n');
        const block =
          `[${d}] RECORDED CALL — ${r.title || 'Untitled call'}\n` +
          (r.summary ? `Summary: ${String(r.summary).slice(0, 1200)}\n` : '') +
          (tk ? `Key takeaways:\n${tk}\n` : '') +
          (ai ? `Action items:\n${ai}` : '');
        return { startedAt: r.started_at || '', block: block.trim() };
      });
  } catch {
    return [];
  }
}
