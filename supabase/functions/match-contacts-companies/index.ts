import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 500;

/** Strip www., http(s)://, trailing slash, lowercase */
function normalizeDomain(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
    .trim();
}

/** Levenshtein distance */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    console.log('[match-contacts] Starting domain matching...');

    // 1. Load ALL companies with domains
    const { data: allCompanies, error: compErr } = await admin
      .from('crm_companies')
      .select('id, name, domain, additional_domains')
      .not('domain', 'is', null);

    if (compErr) throw compErr;
    console.log(`[match-contacts] Loaded ${allCompanies?.length ?? 0} companies with domains`);

    // 2. Build exact-match map (normalized domain -> company id)
    const exactMap = new Map<string, string>();
    const allNormalized: { id: string; domain: string }[] = [];

    for (const c of allCompanies || []) {
      if (c.domain) {
        const nd = normalizeDomain(c.domain);
        if (nd) {
          exactMap.set(nd, c.id);
          allNormalized.push({ id: c.id, domain: nd });
        }
      }
      const additional = c.additional_domains as string[] | null;
      if (additional?.length) {
        for (const d of additional) {
          const nd = normalizeDomain(d);
          if (nd) {
            exactMap.set(nd, c.id);
            allNormalized.push({ id: c.id, domain: nd });
          }
        }
      }
    }
    console.log(`[match-contacts] Built domain map with ${exactMap.size} exact entries`);

    // 3. Process unmatched contacts in batches
    let matched = 0;
    let unmatched = 0;
    let total = 0;
    let offset = 0;
    const FUZZY_THRESHOLD = 0.85;

    while (true) {
      const { data: contacts, error: cErr } = await admin
        .from('contacts')
        .select('id, email')
        .not('email', 'is', null)
        .is('crm_company_id', null)
        .range(offset, offset + BATCH_SIZE - 1);

      if (cErr) throw cErr;
      if (!contacts?.length) break;

      const updates: { id: string; crm_company_id: string }[] = [];

      for (const contact of contacts) {
        total++;
        const email = (contact.email as string).toLowerCase();
        const atIdx = email.lastIndexOf('@');
        if (atIdx < 0) { unmatched++; continue; }

        const emailDomain = normalizeDomain(email.substring(atIdx + 1));
        if (!emailDomain) { unmatched++; continue; }

        // Try exact match first (O(1))
        const exactId = exactMap.get(emailDomain);
        if (exactId) {
          updates.push({ id: contact.id, crm_company_id: exactId });
          matched++;
          continue;
        }

        // Fuzzy match (scan all company domains)
        let bestId: string | null = null;
        let bestSim = 0;
        for (const entry of allNormalized) {
          const sim = similarity(emailDomain, entry.domain);
          if (sim >= FUZZY_THRESHOLD && sim > bestSim) {
            bestSim = sim;
            bestId = entry.id;
          }
        }

        if (bestId) {
          updates.push({ id: contact.id, crm_company_id: bestId });
          matched++;
        } else {
          unmatched++;
        }
      }

      // Bulk update matched contacts
      if (updates.length > 0) {
        // Use individual updates in small batches for reliability
        const CHUNK = 100;
        for (let i = 0; i < updates.length; i += CHUNK) {
          const chunk = updates.slice(i, i + CHUNK);
          const ids = chunk.map(u => u.id);
          // Group by company ID for efficient bulk updates
          const byCompany = new Map<string, string[]>();
          for (const u of chunk) {
            if (!byCompany.has(u.crm_company_id)) byCompany.set(u.crm_company_id, []);
            byCompany.get(u.crm_company_id)!.push(u.id);
          }
          for (const [companyId, contactIds] of byCompany) {
            const { error: uErr } = await admin
              .from('contacts')
              .update({ crm_company_id: companyId } as any)
              .in('id', contactIds);
            if (uErr) console.error(`[match-contacts] Update error: ${uErr.message}`);
          }
        }
        console.log(`[match-contacts] Batch updated ${updates.length} contacts (offset ${offset})`);
      }

      // If we got fewer than BATCH_SIZE, we've exhausted the unmatched contacts
      if (contacts.length < BATCH_SIZE) break;
      // Don't increment offset — matched contacts won't appear in next query
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
