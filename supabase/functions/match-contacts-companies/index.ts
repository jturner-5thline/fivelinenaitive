import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 500;
const TIMEOUT_MS = 120_000; // 2 min per invocation

/** Strip www., http(s)://, trailing slash, lowercase */
function normalizeDomain(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
    .trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startTime = Date.now();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    console.log('[match-contacts] Starting domain matching...');

    // 1. Load ALL companies with domains (paginated to handle >1000)
    const exactMap = new Map<string, string>(); // normalized domain -> company id
    let compOffset = 0;
    while (true) {
      const { data: batch, error } = await admin
        .from('crm_companies')
        .select('id, domain, additional_domains')
        .not('domain', 'is', null)
        .range(compOffset, compOffset + 999);
      if (error) throw error;
      if (!batch?.length) break;
      for (const c of batch) {
        if (c.domain) {
          const nd = normalizeDomain(c.domain);
          if (nd) exactMap.set(nd, c.id);
        }
        const additional = c.additional_domains as string[] | null;
        if (additional?.length) {
          for (const d of additional) {
            const nd = normalizeDomain(d);
            if (nd) exactMap.set(nd, c.id);
          }
        }
      }
      if (batch.length < 1000) break;
      compOffset += 1000;
    }
    console.log(`[match-contacts] Built domain map with ${exactMap.size} entries`);

    // Also add variants without TLD suffix for common cases (e.g. "company.com" also matches "company.co.uk")
    // And strip subdomains: "mail.company.com" -> also check "company.com"

    // 2. Process unmatched contacts in batches
    let matched = 0;
    let unmatched = 0;
    let total = 0;

    while (true) {
      if (Date.now() - startTime > TIMEOUT_MS) {
        console.log(`[match-contacts] Timeout reached, returning partial results`);
        return new Response(JSON.stringify({ matched, unmatched, total, timed_out: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Always fetch from offset 0 since matched contacts drop out of the query
      const { data: contacts, error: cErr } = await admin
        .from('contacts')
        .select('id, email')
        .not('email', 'is', null)
        .is('crm_company_id', null)
        .range(0, BATCH_SIZE - 1);

      if (cErr) throw cErr;
      if (!contacts?.length) break;

      const updates = new Map<string, string[]>(); // company_id -> contact_ids

      let batchUnmatched = 0;
      for (const contact of contacts) {
        total++;
        const email = (contact.email as string).toLowerCase();
        const atIdx = email.lastIndexOf('@');
        if (atIdx < 0) { batchUnmatched++; continue; }

        const emailDomain = normalizeDomain(email.substring(atIdx + 1));
        if (!emailDomain) { batchUnmatched++; continue; }

        // Try exact match
        let companyId = exactMap.get(emailDomain);

        // Try stripping subdomain: "mail.company.com" -> "company.com"
        if (!companyId && emailDomain.split('.').length > 2) {
          const parts = emailDomain.split('.');
          const baseDomain = parts.slice(-2).join('.');
          companyId = exactMap.get(baseDomain);
        }

        if (companyId) {
          if (!updates.has(companyId)) updates.set(companyId, []);
          updates.get(companyId)!.push(contact.id);
          matched++;
        } else {
          batchUnmatched++;
        }
      }
      unmatched += batchUnmatched;

      // Bulk update
      for (const [companyId, contactIds] of updates) {
        const { error: uErr } = await admin
          .from('contacts')
          .update({ crm_company_id: companyId } as any)
          .in('id', contactIds);
        if (uErr) console.error(`[match-contacts] Update error: ${uErr.message}`);
      }

      console.log(`[match-contacts] Batch: ${updates.size} companies, ${matched} matched so far`);

      // If all contacts in this batch were unmatched, we've exhausted matchable contacts
      if (updates.size === 0) break;
    }

    const summary = { matched, unmatched, total };
    console.log(`[match-contacts] Done:`, summary);

    return new Response(JSON.stringify(summary), {
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