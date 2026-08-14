import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Determine org_company_id from caller or request body
    let orgCompanyId: string | null = null;
    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }
    orgCompanyId = body?.org_company_id || null;

    if (!orgCompanyId) {
      const authHeader = req.headers.get('authorization');
      if (authHeader) {
        const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: { user } } = await userClient.auth.getUser();
        if (user?.id) {
          const { data: membership } = await admin
            .from('company_members').select('company_id')
            .eq('user_id', user.id).limit(1).single();
          if (membership) orgCompanyId = membership.company_id;
        }
      }
    }

    if (!orgCompanyId) {
      // Fallback to 5th Line
      const { data: co } = await admin.from('companies').select('id')
        .or('primary_domain.eq.5thline.co,name.ilike.%5th Line%').limit(1).single();
      if (co) orgCompanyId = co.id;
    }

    if (!orgCompanyId) {
      return new Response(JSON.stringify({ error: 'Could not determine org' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[match-contacts] Running SQL-based domain matching for org ${orgCompanyId}...`);

    const normalize = (v: string | null | undefined) =>
      (v || '')
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .split(/[/?#]/)[0]
        .trim();

    // Preview mode: compute what WOULD be matched without writing anything.
    if (body?.dry_run) {
      const { data: companies, error: compErr } = await admin
        .from('crm_companies')
        .select('id, name, domain')
        .eq('org_company_id', orgCompanyId)
        .not('domain', 'is', null)
        .limit(10000);
      if (compErr) throw compErr;

      const byDomain = new Map<string, { id: string; name: string | null }>();
      for (const c of companies || []) {
        const d = normalize((c as any).domain);
        if (d && !byDomain.has(d)) byDomain.set(d, { id: (c as any).id, name: (c as any).name ?? null });
      }

      const { data: unmatched, error: unmErr } = await admin
        .from('contacts')
        .select('id, full_name, email')
        .eq('org_company_id', orgCompanyId)
        .is('crm_company_id', null)
        .not('email', 'is', null)
        .limit(20000);
      if (unmErr) throw unmErr;

      const samples: Array<{ contact: string; email: string; company: string }> = [];
      let wouldMatch = 0;
      for (const c of unmatched || []) {
        const domain = normalize(String((c as any).email || '').split('@')[1] || '');
        if (!domain) continue;
        const hit = byDomain.get(domain);
        if (!hit) continue;
        wouldMatch++;
        if (samples.length < 10) {
          samples.push({
            contact: (c as any).full_name || (c as any).email,
            email: (c as any).email,
            company: hit.name || domain,
          });
        }
      }

      return new Response(
        JSON.stringify({
          dry_run: true,
          would_match: wouldMatch,
          unmatched_total: (unmatched || []).length,
          samples,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Scoped to the same org_company_id
    const matchSql = `
      WITH contact_domains AS (
        SELECT
          c.id AS contact_id,
          lower(
            regexp_replace(
              regexp_replace(
                split_part(c.email, '@', 2),
                '^www\\.', ''
              ),
              '/$', ''
            )
          ) AS email_domain
        FROM contacts c
        WHERE c.email IS NOT NULL
          AND c.crm_company_id IS NULL
          AND c.org_company_id = '${orgCompanyId}'
          AND split_part(c.email, '@', 2) != ''
      ),
      company_domains AS (
        SELECT
          cc.id AS company_id,
          lower(
            regexp_replace(
              regexp_replace(
                regexp_replace(cc.domain, '^https?://', ''),
                '^www\\.', ''
              ),
              '/$', ''
            )
          ) AS norm_domain
        FROM crm_companies cc
        WHERE cc.domain IS NOT NULL AND cc.domain != ''
          AND cc.org_company_id = '${orgCompanyId}'
      ),
      matches AS (
        SELECT DISTINCT ON (cd.contact_id)
          cd.contact_id,
          comp.company_id
        FROM contact_domains cd
        JOIN company_domains comp ON cd.email_domain = comp.norm_domain
        ORDER BY cd.contact_id
      )
      UPDATE contacts
      SET crm_company_id = m.company_id
      FROM matches m
      WHERE contacts.id = m.contact_id;
    `;

    const { error: execErr } = await admin.rpc('exec_sql', { sql: matchSql });
    if (execErr) throw execErr;

    // Get counts scoped to this org
    const { count: totalContacts } = await admin
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('org_company_id', orgCompanyId)
      .not('email', 'is', null);

    const { count: matchedCount } = await admin
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('org_company_id', orgCompanyId)
      .not('crm_company_id', 'is', null);

    const { count: unmatchedCount } = await admin
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('org_company_id', orgCompanyId)
      .not('email', 'is', null)
      .is('crm_company_id', null);

    const summary = {
      matched: matchedCount ?? 0,
      unmatched: unmatchedCount ?? 0,
      total: totalContacts ?? 0,
    };

    console.log('[match-contacts] Done:', summary);

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
