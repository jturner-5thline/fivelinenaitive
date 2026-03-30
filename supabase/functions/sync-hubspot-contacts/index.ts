import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

async function hubspotRequest(endpoint: string, accessToken: string): Promise<any> {
  const url = `${HUBSPOT_API_BASE}${endpoint}`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });
  const text = await response.text();
  if (!response.ok) {
    console.error(`[sync-hubspot-contacts] API error ${response.status}: ${text.slice(0, 300)}`);
    throw new Error(`HubSpot API error: ${response.status}`);
  }
  return text ? JSON.parse(text) : null;
}

// Map HubSpot property names to EXISTING contacts table columns
const KNOWN_MAPPINGS: Record<string, string> = {
  firstname: 'first_name',
  lastname: 'last_name',
  email: 'email',
  phone: 'phone_work',
  mobilephone: 'phone_mobile',
  jobtitle: 'job_title',
  company: 'hs_company_name',
  lifecyclestage: 'lifecycle_stage',
  hs_lead_status: 'status',
  address: 'hs_address',
  city: 'hs_city',
  state: 'hs_state',
  zip: 'hs_zip',
  country: 'hs_country',
  website: 'website_url',
  linkedin_url: 'linkedin_url',
  description: 'description',
  department: 'department',
  seniority: 'seniority',
  hs_timezone: 'timezone',
  hs_language: 'locale',
  notes_last_updated: 'hs_notes_last_updated',
  hs_additional_emails: 'hs_additional_emails_raw',
};

// Essential properties to request from HubSpot
const ESSENTIAL_PROPERTIES = [
  ...Object.keys(KNOWN_MAPPINGS),
  'hs_lead_status', 'hs_buying_role', 'associatedcompanyid',
  'num_associated_deals', 'recent_deal_amount', 'recent_deal_close_date',
  'hs_analytics_source', 'hs_analytics_first_url', 'utm_source', 'utm_medium', 'utm_campaign',
].join(',');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const accessToken = Deno.env.get('HUBSPOT_ACCESS_TOKEN');
    if (!accessToken) {
      console.error('[sync-hubspot-contacts] HUBSPOT_ACCESS_TOKEN not set');
      return new Response(JSON.stringify({ error: 'HUBSPOT_ACCESS_TOKEN not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse optional resume cursor
    let resumeAfter: string | undefined;
    let skipDelete = false;
    try {
      const body = await req.json();
      resumeAfter = body?.after;
      skipDelete = !!body?.after;
    } catch { /* no body */ }

    // Get caller info & org (same pattern as sync-hubspot-companies)
    let callerUserId: string | null = null;
    const authHeader = req.headers.get('authorization');
    if (authHeader) {
      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      callerUserId = user?.id || null;
    }

    let orgCompanyId: string | null = null;
    if (callerUserId) {
      const { data: membership } = await supabase
        .from('company_members').select('company_id')
        .eq('user_id', callerUserId).limit(1).single();
      if (membership) orgCompanyId = membership.company_id;
    }
    if (!orgCompanyId) {
      const { data: integration } = await supabase
        .from('integrations').select('company_id')
        .eq('provider', 'hubspot').limit(1).single();
      if (integration) orgCompanyId = integration.company_id;
    }
    if (!orgCompanyId) {
      const { data: co } = await supabase
        .from('companies').select('id')
        .or('primary_domain.eq.5thline.co,name.ilike.%5th Line%')
        .limit(1).single();
      if (co) orgCompanyId = co.id;
    }
    if (!orgCompanyId) {
      console.error('[sync-hubspot-contacts] Could not determine org company');
      return new Response(JSON.stringify({ error: 'Could not determine org company' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[sync-hubspot-contacts] Org: ${orgCompanyId}, resume: ${resumeAfter || 'none'}`);

    // Delete existing contacts on first pass
    if (!skipDelete) {
      console.log('[sync-hubspot-contacts] Deleting existing contacts...');
      const { error: deleteError } = await supabase
        .from('contacts').delete().eq('org_company_id', orgCompanyId);
      if (deleteError) {
        console.error(`[sync-hubspot-contacts] Delete error: ${deleteError.message}`);
      } else {
        console.log('[sync-hubspot-contacts] Cleared existing contacts');
      }
    }

    // Fetch and insert contacts with time budget
    const startTime = Date.now();
    const MAX_RUNTIME_MS = 120_000;
    let after = resumeAfter;
    let totalFetched = 0;
    let totalInserted = 0;
    let lastAfter: string | undefined;
    let timedOut = false;

    do {
      if (Date.now() - startTime > MAX_RUNTIME_MS) {
        console.log(`[sync-hubspot-contacts] Time budget exceeded at ${totalFetched} contacts`);
        timedOut = true;
        break;
      }

      let endpoint = `/crm/v3/objects/contacts?limit=100&properties=${encodeURIComponent(ESSENTIAL_PROPERTIES)}`;
      if (after) endpoint += `&after=${after}`;

      const data = await hubspotRequest(endpoint, accessToken);
      const results = data.results || [];
      totalFetched += results.length;
      lastAfter = data.paging?.next?.after;

      if (results.length > 0) {
        const mapped = results.map((hs: any) => {
          const props = hs.properties || {};
          const record: Record<string, any> = {
            hubspot_contact_id: String(hs.id),
            source_system: 'hubspot',
            synced_with_hubspot: true,
            migrated_from_hubspot: true,
            org_company_id: orgCompanyId,
            created_by: callerUserId,
            custom_fields: { hubspot_raw_properties: props },
          };

          // Map known HubSpot properties to real columns
          for (const [hsKey, colName] of Object.entries(KNOWN_MAPPINGS)) {
            const val = props[hsKey];
            if (val === undefined || val === null || val === '') continue;
            record[colName] = val;
          }

          return record;
        });

        // Insert in sub-batches of 50
        for (let i = 0; i < mapped.length; i += 50) {
          const batch = mapped.slice(i, i + 50);
          const { data: insertData, error: insertError } = await supabase
            .from('contacts').insert(batch).select('id');
          if (insertError) {
            console.error(`[sync-hubspot-contacts] Batch insert error: ${insertError.message}`);
            // Fallback: insert one by one
            for (const row of batch) {
              const { error: singleError } = await supabase.from('contacts').insert(row);
              if (singleError) {
                console.warn(`[sync-hubspot-contacts] Skip contact ${row.hubspot_contact_id}: ${singleError.message}`);
              } else {
                totalInserted++;
              }
            }
          } else {
            totalInserted += (insertData || []).length;
          }
        }
      }

      after = lastAfter;
      if (totalFetched % 500 === 0) {
        console.log(`[sync-hubspot-contacts] Progress: ${totalFetched} fetched, ${totalInserted} inserted`);
      }
    } while (after);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[sync-hubspot-contacts] Done: ${totalInserted}/${totalFetched} in ${duration}s, timedOut=${timedOut}`);

    return new Response(JSON.stringify({
      success: true,
      count: totalInserted,
      total_fetched: totalFetched,
      columns_created: [],
      duration_seconds: parseFloat(duration),
      timed_out: timedOut,
      resume_after: timedOut ? lastAfter : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error(`[sync-hubspot-contacts] Fatal: ${err.message}\n${err.stack}`);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
