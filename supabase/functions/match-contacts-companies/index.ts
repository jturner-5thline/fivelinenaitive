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

    console.log('[match-contacts] Running SQL-based domain matching...');

    // Run domain matching entirely in SQL — much more efficient than JS loops
    // This UPDATE joins contacts with crm_companies by extracting the email domain
    // and matching against the normalized company domain
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

    // Get counts
    const { count: totalContacts } = await admin
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .not('email', 'is', null);

    const { count: matchedCount } = await admin
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .not('crm_company_id', 'is', null);

    const { count: unmatchedCount } = await admin
      .from('contacts')
      .select('id', { count: 'exact', head: true })
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
