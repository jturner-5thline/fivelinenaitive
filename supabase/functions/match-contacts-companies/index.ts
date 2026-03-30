import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CONTACT_BATCH = 200;

function normalizeDomain(raw: string): string {
  return raw.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '').trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    // Accept a pre-built domain map from the caller to avoid rebuilding
    let domainMap: Record<string, string> = body.domainMap || {};
    const afterId: string | undefined = body.after;

    // Build domain map on first call only
    if (!Object.keys(domainMap).length) {
      console.log('[match-contacts] Building domain map...');
      let offset = 0;
      while (true) {
        const { data: batch, error } = await admin
          .from('crm_companies')
          .select('id, domain, additional_domains')
          .not('domain', 'is', null)
          .range(offset, offset + 999);
        if (error) throw error;
        if (!batch?.length) break;
        for (const c of batch) {
          if (c.domain) {
            const nd = normalizeDomain(c.domain);
            if (nd) domainMap[nd] = c.id;
          }
          const additional = c.additional_domains as string[] | null;
          if (additional?.length) {
            for (const d of additional) {
              const nd = normalizeDomain(d);
              if (nd) domainMap[nd] = c.id;
            }
          }
        }
        if (batch.length < 1000) break;
        offset += 1000;
      }
      console.log(`[match-contacts] Domain map: ${Object.keys(domainMap).length} entries`);
    }

    // Fetch a batch of unmatched contacts
    let query = admin
      .from('contacts')
      .select('id, email')
      .not('email', 'is', null)
      .is('crm_company_id', null)
      .order('id', { ascending: true })
      .limit(CONTACT_BATCH);

    if (afterId) {
      query = query.gt('id', afterId);
    }

    const { data: contacts, error: cErr } = await query;
    if (cErr) throw cErr;

    let matched = 0;
    let unmatched = 0;
    const updates = new Map<string, string[]>();
    let lastId: string | undefined;

    for (const contact of contacts || []) {
      lastId = contact.id;
      const email = (contact.email as string).toLowerCase();
      const atIdx = email.lastIndexOf('@');
      if (atIdx < 0) { unmatched++; continue; }

      let emailDomain = normalizeDomain(email.substring(atIdx + 1));
      if (!emailDomain) { unmatched++; continue; }

      let companyId = domainMap[emailDomain];

      // Try stripping subdomain
      if (!companyId && emailDomain.split('.').length > 2) {
        const baseDomain = emailDomain.split('.').slice(-2).join('.');
        companyId = domainMap[baseDomain];
      }

      if (companyId) {
        if (!updates.has(companyId)) updates.set(companyId, []);
        updates.get(companyId)!.push(contact.id);
        matched++;
      } else {
        unmatched++;
      }
    }

    // Bulk update
    for (const [companyId, contactIds] of updates) {
      const { error: uErr } = await admin
        .from('contacts')
        .update({ crm_company_id: companyId } as any)
        .in('id', contactIds);
      if (uErr) console.error(`[match-contacts] Update error: ${uErr.message}`);
    }

    const hasMore = (contacts?.length || 0) === CONTACT_BATCH;
    console.log(`[match-contacts] Batch: matched=${matched}, unmatched=${unmatched}, hasMore=${hasMore}`);

    return new Response(JSON.stringify({
      matched,
      unmatched,
      total: (contacts?.length || 0),
      has_more: hasMore,
      resume_after: hasMore ? lastId : undefined,
      domain_map_size: Object.keys(domainMap).length,
      // Pass the domain map back so client can send it on next call
      ...(hasMore ? { domainMap } : {}),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[match-contacts] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
