// Computes confidence + suggested action + ranked candidates for one or more
// lender_sync_requests and persists the result. Idempotent.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Incoming = Record<string, unknown>;

const LEGAL_SUFFIXES =
  /\b(llc|l\s?l\s?c|inc|incorporated|corp|corporation|co|company|ltd|limited|llp|lp|gp|group|holdings|capital|partners|fund|funding|management|advisors|investments|investment|the)\b/g;

function normalizeName(raw?: string | null): string {
  if (!raw) return '';
  return String(raw)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(LEGAL_SUFFIXES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const p = ` ${s} `;
  for (let i = 0; i < p.length - 1; i++) {
    const bg = p.slice(i, i + 2);
    m.set(bg, (m.get(bg) || 0) + 1);
  }
  return m;
}
function dice(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a), B = bigrams(b);
  let inter = 0;
  for (const [k, v] of A) {
    const o = B.get(k);
    if (o) inter += Math.min(v, o);
  }
  const tot = [...A.values()].reduce((s, v) => s + v, 0) + [...B.values()].reduce((s, v) => s + v, 0);
  return tot > 0 ? (2 * inter) / tot : 0;
}
function domainOf(v?: string | null): string | null {
  if (!v) return null;
  const s = String(v).toLowerCase().trim();
  const at = s.indexOf('@');
  let host = at >= 0 ? s.slice(at + 1) : s;
  host = host.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  return host || null;
}
function digits(v?: string | null): string { return (v || '').replace(/\D+/g, ''); }

interface Existing {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  contact_phone: string | null;
  website: string | null;
  address: string | null;
  geo: string | null;
  contact_name: string | null;
  tags: string[] | null;
  company_id: string | null;
}

function score(incoming: Incoming, e: Existing) {
  const reasons: string[] = [];
  let s = 0;
  const iName = normalizeName(incoming.name as string);
  const eName = normalizeName(e.name);
  if (iName && eName) {
    if (iName === eName) { s = Math.max(s, 1); reasons.push('Exact normalized name match'); }
    else {
      const sim = dice(iName, eName);
      if (sim >= 0.6) { s = Math.max(s, sim * 0.85); reasons.push(`Name similarity ${(sim * 100).toFixed(0)}%`); }
    }
  }
  const iDom = domainOf(incoming.website as string) || domainOf(incoming.email as string);
  const eDom = domainOf(e.website) || domainOf(e.email);
  if (iDom && eDom) {
    if (iDom === eDom) { s = Math.max(s, 0.9); reasons.push(`Domain match: ${iDom}`); }
    else if (iDom.includes(eDom) || eDom.includes(iDom)) { s = Math.max(s, 0.7); reasons.push(`Partial domain match`); }
  }
  const iP = digits(incoming.phone as string || incoming.contact_phone as string);
  const eP = digits(e.phone || e.contact_phone);
  if (iP.length >= 7 && iP === eP) { s = Math.max(s, 0.7); reasons.push('Phone match'); }
  if (incoming.geo && e.geo && String(incoming.geo).toLowerCase() === e.geo.toLowerCase()) s = Math.min(1, s + 0.05);
  if (incoming.contact_name && e.contact_name) {
    const sim = dice(String(incoming.contact_name).toLowerCase(), e.contact_name.toLowerCase());
    if (sim > 0.85) { s = Math.min(1, s + 0.1); reasons.push('Shared primary contact'); }
  }
  return { lender_id: e.id, name: e.name || '(unnamed)', score: Math.min(1, s), reasons, topReason: reasons[0] || 'Weak overlap' };
}

const COMPARE = ['name','email','lender_type','loan_types','min_revenue','ebitda_min','min_deal','max_deal','industries','geo','contact_name','contact_title','tier','website','phone','address','tags'];

function conflicts(inc: Incoming, ex: Record<string, unknown>) {
  let n = 0;
  for (const f of COMPARE) {
    const i = inc[f], e = ex[f];
    const ip = i !== null && i !== undefined && i !== '';
    const ep = e !== null && e !== undefined && e !== '';
    if (ip && ep && JSON.stringify(i) !== JSON.stringify(e)) n++;
  }
  return n;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const body = await req.json().catch(() => ({}));
    const requestIds: string[] | undefined = body.request_ids;
    const backfillAll: boolean = !!body.backfill_all;
    const thresholds = {
      likely: Number(body.likely_threshold) || 0.82,
      possible: Number(body.possible_threshold) || 0.65,
    };

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    let q = admin.from('lender_sync_requests').select('*').eq('status', 'pending');
    if (requestIds && requestIds.length) q = admin.from('lender_sync_requests').select('*').in('id', requestIds);
    else if (!backfillAll) q = q.is('confidence', null);

    const { data: requests, error: reqErr } = await q;
    if (reqErr) throw reqErr;
    if (!requests || requests.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fetch all master lenders once (small enough to load)
    const { data: existingAll } = await admin
      .from('master_lenders')
      .select('id,name,email,phone,contact_phone,website,address,geo,contact_name,tags,company_id');
    const existing = (existingAll || []) as Existing[];

    let processed = 0;
    for (const r of requests) {
      const incoming = (r.incoming_data || {}) as Incoming;
      const scored = existing
        .map((e) => score(incoming, e))
        .filter((x) => x.score >= thresholds.possible * 0.6)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      const top = scored[0];
      let confidence = 'none';
      let suggested = 'add';
      if (top) {
        if (top.score >= 0.98) { confidence = 'exact_duplicate'; suggested = 'merge'; }
        else if (top.score >= thresholds.likely) { confidence = 'likely_duplicate'; suggested = 'merge'; }
        else if (top.score >= thresholds.possible) { confidence = 'possible_match'; suggested = 'review'; }
        else { confidence = 'needs_review'; suggested = 'add'; }
      }

      // Conflict count vs top candidate
      let conflictCount = 0;
      if (top) {
        const ex = existing.find((e) => e.id === top.lender_id);
        if (ex) conflictCount = conflicts(incoming, ex as unknown as Record<string, unknown>);
      }

      await admin.from('lender_sync_requests').update({
        confidence,
        suggested_action: suggested,
        match_candidates: scored,
        match_reason: top?.topReason || null,
        conflict_count: conflictCount,
      }).eq('id', r.id);
      processed++;
    }

    return new Response(JSON.stringify({ processed }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});