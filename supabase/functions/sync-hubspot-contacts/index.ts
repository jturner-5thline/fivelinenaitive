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

// Known mappings: HubSpot property name -> existing contacts column
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
  hs_buying_role: 'buying_role',
  hs_content_membership_notes: 'description',
  notes_last_updated: 'hs_notes_last_updated',
  hs_additional_emails: 'hs_additional_emails_raw',
};

// Properties to skip (internal HubSpot IDs or non-useful)
const SKIP_PROPERTIES = new Set([
  'hs_object_id', 'hs_createdate', 'hs_lastmodifieddate', 'createdate', 'lastmodifieddate',
]);

function sanitizeColumnName(hsName: string): string {
  return 'hs_' + hsName.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/__+/g, '_').replace(/^_|_$/g, '');
}

function mapHubSpotTypeToPg(hsType: string, hsFieldType: string): string {
  if (hsType === 'number') return 'NUMERIC';
  if (hsType === 'datetime' || hsType === 'date') return 'TIMESTAMPTZ';
  if (hsType === 'bool') return 'BOOLEAN';
  return 'TEXT';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const accessToken = Deno.env.get('HUBSPOT_ACCESS_TOKEN');
    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'HUBSPOT_ACCESS_TOKEN not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse optional cursor for resumable sync
    let resumeAfter: string | undefined;
    let skipDelete = false;
    let skipSchemaSetup = false;
    let columnMap: Record<string, string> | undefined;
    try {
      const body = await req.json();
      resumeAfter = body?.after;
      skipDelete = !!body?.after;
      skipSchemaSetup = !!body?.after;
      columnMap = body?.columnMap;
    } catch { /* no body */ }

    // Get caller info & org
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
      return new Response(JSON.stringify({ error: 'Could not determine org company' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[sync-hubspot-contacts] Org: ${orgCompanyId}, resume: ${resumeAfter || 'none'}`);

    // ========== STEP A: Fetch all HubSpot contact property definitions ==========
    let allProperties: any[] = [];
    if (!skipSchemaSetup || !columnMap) {
      console.log('[sync-hubspot-contacts] Fetching HubSpot property definitions...');
      const propsData = await hubspotRequest('/crm/v3/properties/contacts', accessToken);
      allProperties = propsData.results || [];
      console.log(`[sync-hubspot-contacts] Found ${allProperties.length} HubSpot properties`);
    }

    // ========== STEP B: Introspect current contacts columns ==========
    let existingColumns = new Set<string>();
    const columnsCreated: string[] = [];

    if (!skipSchemaSetup) {
      let colRows: any = null;
      let colError: any = null;
      try {
        const result = await supabase.rpc('exec_sql_readonly', {
          sql: "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'contacts'"
        });
        colRows = result.data;
        colError = result.error;
      } catch {
        colError = { message: 'rpc not found' };
      }

      // Fallback: try a dummy select to see what columns exist
      if (!colRows) {
        // We'll just rely on KNOWN_MAPPINGS + IF NOT EXISTS for safety
        console.log('[sync-hubspot-contacts] Could not introspect columns, will use IF NOT EXISTS');
      } else if (Array.isArray(colRows)) {
        for (const r of colRows) {
          existingColumns.add(r.column_name);
        }
      }

      // ========== STEP C: Build column mapping & create missing columns ==========
      columnMap = {};
      const alterStatements: string[] = [];

      for (const prop of allProperties) {
        const hsName = prop.name;
        if (SKIP_PROPERTIES.has(hsName)) continue;

        // Check if there's a known mapping
        if (KNOWN_MAPPINGS[hsName]) {
          const targetCol = KNOWN_MAPPINGS[hsName];
          // If the known mapping target doesn't exist yet, create it
          if (existingColumns.size > 0 && !existingColumns.has(targetCol)) {
            const pgType = mapHubSpotTypeToPg(prop.type, prop.fieldType);
            alterStatements.push(`ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS "${targetCol}" ${pgType};`);
            columnsCreated.push(targetCol);
          }
          columnMap[hsName] = targetCol;
        } else {
          // Generate hs_ prefixed column name
          const colName = sanitizeColumnName(hsName);
          if (existingColumns.size > 0 && !existingColumns.has(colName)) {
            const pgType = mapHubSpotTypeToPg(prop.type, prop.fieldType);
            alterStatements.push(`ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS "${colName}" ${pgType};`);
            columnsCreated.push(colName);
          } else if (existingColumns.size === 0) {
            // Can't check, always try ADD COLUMN IF NOT EXISTS
            const pgType = mapHubSpotTypeToPg(prop.type, prop.fieldType);
            alterStatements.push(`ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS "${colName}" ${pgType};`);
          }
          columnMap[hsName] = colName;
        }
      }

      // Execute ALTER TABLE statements in batches
      if (alterStatements.length > 0) {
        console.log(`[sync-hubspot-contacts] Creating ${alterStatements.length} columns...`);
        // Execute in batches of 20 to avoid too-long SQL
        for (let i = 0; i < alterStatements.length; i += 20) {
          const batch = alterStatements.slice(i, i + 20).join('\n');
          let alterError: any = null;
          try {
            const result = await supabase.rpc('exec_sql', { sql: batch });
            alterError = result.error;
          } catch {
            // Fallback: execute one at a time via raw SQL
            for (const stmt of alterStatements.slice(i, i + 20)) {
              try {
                const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${supabaseServiceKey}`,
                    'apikey': supabaseServiceKey,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ sql: stmt }),
                });
                if (!resp.ok) {
                  console.warn(`[sync-hubspot-contacts] ALTER failed: ${stmt.slice(0, 100)}`);
                }
              } catch (e: any) {
                console.warn(`[sync-hubspot-contacts] ALTER error: ${e.message}`);
              }
            }
          }
          if (alterError) {
            console.warn(`[sync-hubspot-contacts] Batch ALTER error: ${alterError.message}`);
          }
        }
        console.log(`[sync-hubspot-contacts] Column creation complete`);
      }

      // ========== Upsert field metadata ==========
      console.log('[sync-hubspot-contacts] Upserting field metadata...');
      const metadataRows = allProperties
        .filter(p => !SKIP_PROPERTIES.has(p.name))
        .map(prop => ({
          object_type: 'contact',
          internal_name: prop.name,
          label: prop.label || prop.name,
          hubspot_type: prop.type || null,
          hubspot_field_type: prop.fieldType || null,
          options: prop.options && prop.options.length > 0 ? prop.options : null,
          group_name: prop.groupName || null,
          is_read_only: prop.modificationMetadata?.readOnlyValue || false,
          is_system: prop.hubspotDefined || false,
          mapped_column_name: columnMap![prop.name] || null,
          mapped_column_type: mapHubSpotTypeToPg(prop.type, prop.fieldType),
          is_mapped: true,
          company_id: orgCompanyId,
          updated_at: new Date().toISOString(),
        }));

      // Batch upsert metadata in chunks of 50
      for (let i = 0; i < metadataRows.length; i += 50) {
        const chunk = metadataRows.slice(i, i + 50);
        const { error: metaError } = await supabase
          .from('hubspot_field_metadata')
          .upsert(chunk, { onConflict: 'object_type,internal_name,company_id' });
        if (metaError) {
          console.warn(`[sync-hubspot-contacts] Metadata upsert error: ${metaError.message}`);
        }
      }
      console.log(`[sync-hubspot-contacts] Upserted ${metadataRows.length} field metadata rows`);
    }

    if (!columnMap) {
      return new Response(JSON.stringify({ error: 'columnMap missing on resume' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========== STEP D & E: Fetch and insert contacts ==========
    // Build properties list for HubSpot API
    const propertyNames = Object.keys(columnMap);
    const propertiesParam = propertyNames.join(',');

    // Delete existing if fresh sync
    if (!skipDelete) {
      const { error: deleteError } = await supabase
        .from('contacts').delete().eq('org_company_id', orgCompanyId);
      if (deleteError) console.error(`[sync-hubspot-contacts] Delete error: ${deleteError.message}`);
      else console.log('[sync-hubspot-contacts] Cleared existing contacts');
    }

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

      // HubSpot limits properties param length, so we'll use POST search API for large property lists
      let endpoint = `/crm/v3/objects/contacts?limit=100&properties=${encodeURIComponent(propertiesParam)}`;
      if (after) endpoint += `&after=${after}`;

      let data: any;
      try {
        data = await hubspotRequest(endpoint, accessToken);
      } catch (e) {
        // If URL too long, fall back to fewer properties
        console.warn(`[sync-hubspot-contacts] Fetch error, trying with fewer properties: ${e.message}`);
        const minProps = 'firstname,lastname,email,phone,jobtitle,company,lifecyclestage,hs_lead_status,mobilephone';
        endpoint = `/crm/v3/objects/contacts?limit=100&properties=${minProps}`;
        if (after) endpoint += `&after=${after}`;
        data = await hubspotRequest(endpoint, accessToken);
      }

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
            full_name: [props.firstname, props.lastname].filter(Boolean).join(' ') || null,
            custom_fields: { hubspot_raw_properties: props },
          };

          // Map each HubSpot property to its column
          for (const [hsKey, colName] of Object.entries(columnMap!)) {
            if (props[hsKey] === undefined || props[hsKey] === null || props[hsKey] === '') continue;
            // Skip if we already set it directly above
            if (['hubspot_contact_id', 'source_system', 'synced_with_hubspot', 'migrated_from_hubspot', 'org_company_id', 'created_by', 'full_name', 'custom_fields'].includes(colName)) continue;
            record[colName] = props[hsKey];
          }

          return record;
        });

        // Insert in sub-batches of 50
        for (let i = 0; i < mapped.length; i += 50) {
          const batch = mapped.slice(i, i + 50);
          const { data: insertData, error: insertError } = await supabase
            .from('contacts').insert(batch).select('id');
          if (insertError) {
            console.error(`[sync-hubspot-contacts] Insert error: ${insertError.message}`);
            // Try inserting one by one on error to skip bad rows
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
    console.log(`[sync-hubspot-contacts] Done: ${totalInserted}/${totalFetched} in ${duration}s, timedOut=${timedOut}, newColumns=${columnsCreated.length}`);

    return new Response(JSON.stringify({
      success: true,
      count: totalInserted,
      total_fetched: totalFetched,
      columns_created: columnsCreated,
      total_properties: propertyNames.length,
      duration_seconds: parseFloat(duration),
      timed_out: timedOut,
      resume_after: timedOut ? lastAfter : undefined,
      column_map: timedOut ? columnMap : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(`[sync-hubspot-contacts] Fatal: ${err.message}`);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
