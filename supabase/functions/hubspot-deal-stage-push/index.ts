import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FALLBACK_OWNER_ID = Deno.env.get('HUBSPOT_FALLBACK_OWNER_ID') || '42024321'; // jturner@5thline.co

async function resolveHubSpotOwner(
  supabase: any,
  rawValue: string | null | undefined,
  accessToken: string,
): Promise<{ ownerId: string | null; resolvedVia: string; unresolved: boolean; rawValue: string | null }> {
  const value = (rawValue ?? '').toString().trim();
  if (!value) return { ownerId: null, resolvedVia: 'empty', unresolved: false, rawValue: null };
  if (/^\d+$/.test(value)) {
    return { ownerId: value, resolvedVia: 'numeric_id', unresolved: false, rawValue: value };
  }
  let candidateEmail: string | null = null;
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
    candidateEmail = value.toLowerCase();
  } else {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .ilike('display_name', value)
      .maybeSingle();
    if (profile?.email) candidateEmail = profile.email.toLowerCase();
  }
  if (!candidateEmail) {
    return { ownerId: null, resolvedVia: 'no_match', unresolved: true, rawValue: value };
  }
  try {
    const res = await fetch(
      `https://api.hubapi.com/crm/v3/owners?email=${encodeURIComponent(candidateEmail)}&limit=1`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      await res.text();
      return { ownerId: null, resolvedVia: 'api_error', unresolved: true, rawValue: value };
    }
    const body = await res.json();
    const owner = (body.results ?? [])[0];
    if (owner?.id) {
      return { ownerId: String(owner.id), resolvedVia: 'email_match', unresolved: false, rawValue: value };
    }
    return { ownerId: null, resolvedVia: 'no_hubspot_owner', unresolved: true, rawValue: value };
  } catch {
    return { ownerId: null, resolvedVia: 'fetch_failed', unresolved: true, rawValue: value };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const {
      deal_id,
      pipeline_id,
      stage,
      hubspot_deal_id,
      company_id,
      amount,
      deal_owner,
      manager,
      fields_changed,
    } = await req.json();

    // Skip if no HubSpot link
    if (!hubspot_deal_id) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no_hubspot_deal_id' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Look up mapping
    // Normalizes stage strings so kebab-case slugs (e.g. "agreement-pending") and
    // Title Case names (e.g. "Agreement Pending") collapse to the same key.
    const normalize = (s: string) =>
      String(s ?? '')
        .toLowerCase()
        .replace(/[\s_\-/]+/g, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();

    // Pull all candidate mappings for the pipeline once, then match in-memory using
    // both exact (case-insensitive) and normalized comparisons. This avoids the
    // strict-equality miss that was silently skipping every stage-push.
    const { data: candidates, error: mapError } = await supabase
      .from('hubspot_pipeline_stage_map')
      .select('hubspot_pipeline_id, hubspot_dealstage_id, naitive_stage_name')
      .eq('naitive_pipeline_id', pipeline_id);

    if (mapError) {
      console.error('[hubspot-deal-stage-push] Map lookup error:', mapError.message);
      await logSync(supabase, { company_id, deal_id, hubspot_deal_id, action: 'stage_push', status: 'error', error_message: `Map lookup: ${mapError.message}` });
      return new Response(JSON.stringify({ error: mapError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const targetNorm = normalize(stage);
    const mapping =
      (candidates ?? []).find(
        (c) => String(c.naitive_stage_name).toLowerCase() === String(stage).toLowerCase(),
      ) ??
      (candidates ?? []).find((c) => normalize(c.naitive_stage_name) === targetNorm) ??
      null;

    if (!mapping) {
      const available = (candidates ?? []).map((c) => c.naitive_stage_name).join(', ');
      const msg = `No mapping for pipeline=${pipeline_id}, stage=${stage}. Available stages: [${available}]`;
      console.warn('[hubspot-deal-stage-push]', msg);
      await logSync(supabase, { company_id, deal_id, hubspot_deal_id, action: 'stage_push', status: 'skipped', error_message: msg });
      return new Response(JSON.stringify({ skipped: true, reason: 'no_mapping', pipeline_id, stage }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get HubSpot token
    const accessToken = Deno.env.get('HUBSPOT_ACCESS_TOKEN');
    if (!accessToken) {
      await logSync(supabase, { company_id, deal_id, hubspot_deal_id, action: 'stage_push', status: 'error', error_message: 'HUBSPOT_ACCESS_TOKEN not configured' });
      return new Response(JSON.stringify({ error: 'HUBSPOT_ACCESS_TOKEN not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Push to HubSpot
    const properties: Record<string, string> = {
      pipeline: mapping.hubspot_pipeline_id,
      dealstage: mapping.hubspot_dealstage_id,
    };
    if (amount !== undefined && amount !== null) {
      properties.amount = String(amount);
    }

    // Owner resolution
    let ownerResolvedVia: string | null = null;
    if (deal_owner !== undefined) {
      const ownerResolution = await resolveHubSpotOwner(supabase, deal_owner, accessToken);
      ownerResolvedVia = ownerResolution.resolvedVia;
      if (ownerResolution.unresolved) {
        properties.hubspot_owner_id = FALLBACK_OWNER_ID;
        await logSync(supabase, {
          company_id, deal_id, hubspot_deal_id,
          action: 'owner_resolution',
          status: 'error',
          error_message: `Unresolved deal_owner "${ownerResolution.rawValue}" → fell back to ${FALLBACK_OWNER_ID}`,
          request_payload: { field: 'deal_owner', raw: ownerResolution.rawValue, resolved_via: ownerResolution.resolvedVia },
        });
      } else if (ownerResolution.ownerId) {
        properties.hubspot_owner_id = ownerResolution.ownerId;
      }
    }

    if (manager !== undefined) {
      // Allow clearing the manager by sending empty string
      properties.deal_manager = manager == null ? '' : String(manager);
    }

    const hubspotPayload = { properties };
    const fieldsChangedMeta = fields_changed ?? null;

    const hsResponse = await fetch(
      `https://api.hubapi.com/crm/v3/objects/deals/${hubspot_deal_id}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(hubspotPayload),
      }
    );

    const hsBody = await hsResponse.text();

    if (!hsResponse.ok) {
      console.error(`[hubspot-deal-stage-push] HubSpot API ${hsResponse.status}: ${hsBody.slice(0, 500)}`);
      await logSync(supabase, {
        company_id, deal_id, hubspot_deal_id,
        action: 'stage_push', status: 'error',
        request_payload: hubspotPayload,
        response_payload: hsBody.slice(0, 2000),
        error_message: `HubSpot ${hsResponse.status}`,
      });
      return new Response(JSON.stringify({ error: `HubSpot API error ${hsResponse.status}` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[hubspot-deal-stage-push] Pushed deal ${hubspot_deal_id}: pipeline=${mapping.hubspot_pipeline_id}, stage=${mapping.hubspot_dealstage_id}`);
    await logSync(supabase, {
      company_id, deal_id, hubspot_deal_id,
      action: 'stage_push', status: 'success',
      request_payload: hubspotPayload,
    });

    // Update hubspot_last_synced_at on the deal
    await supabase
      .from('deals')
      .update({ hubspot_last_synced_at: new Date().toISOString() })
      .eq('id', deal_id);

    return new Response(JSON.stringify({ success: true, hubspot_deal_id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error(`[hubspot-deal-stage-push] Fatal: ${err.message}`);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function logSync(supabase: any, params: {
  company_id?: string; deal_id?: string; hubspot_deal_id?: string;
  action: string; status: string; request_payload?: any;
  response_payload?: any; error_message?: string;
}) {
  try {
    await supabase.from('hubspot_sync_logs').insert({
      company_id: params.company_id || null,
      deal_id: params.deal_id || null,
      hubspot_deal_id: params.hubspot_deal_id || null,
      direction: 'naitive_to_hubspot',
      action: params.action,
      status: params.status,
      request_payload: params.request_payload || null,
      response_payload: typeof params.response_payload === 'string'
        ? { raw: params.response_payload } : params.response_payload || null,
      error_message: params.error_message || null,
    });
  } catch (e: any) {
    console.error('[hubspot-deal-stage-push] Log insert failed:', e.message);
  }
}
