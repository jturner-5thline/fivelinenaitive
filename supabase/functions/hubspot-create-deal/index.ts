import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Forward-only cutoff ───────────────────────────────────────────────
// Only deals created on or after this timestamp will be synced to HubSpot.
const HUBSPOT_SYNC_ENABLED_FROM = '2026-04-10T00:00:00Z';

// ─── Hardcoded fallback pipeline mapping by NAME (used only if no DB row) ───
const HUBSPOT_PIPELINE_NAME_FALLBACK: Record<string, string> = {
  'Active Pipeline': 'default',
  'Active Deals': 'default',
  'In Development': '1768501',
};

interface StageResolution {
  hubspotPipelineId: string | null;
  hubspotStageId: string | null;
  source: 'db_map' | 'label_match' | 'none';
  error: string | null;
}

/**
 * Resolve a naitive deal_owner / manager value to a HubSpot owner id.
 * Handles three input shapes:
 *   1. Numeric HubSpot owner id stored directly (e.g. "644662541")
 *   2. Email address (matched against HubSpot owner email)
 *   3. Display name (matched against profiles.display_name → email → HubSpot owner)
 *
 * Returns { ownerId, resolvedVia, unresolved } where unresolved=true means we
 * could not map the value and the caller should fall back + log an error.
 */
async function resolveHubSpotOwner(
  supabase: any,
  rawValue: string | null | undefined,
  accessToken: string,
): Promise<{ ownerId: string | null; resolvedVia: string; unresolved: boolean; rawValue: string | null }> {
  const value = (rawValue ?? '').toString().trim();
  if (!value) return { ownerId: null, resolvedVia: 'empty', unresolved: false, rawValue: null };

  // 1. Numeric → assume it's already a HubSpot owner id
  if (/^\d+$/.test(value)) {
    return { ownerId: value, resolvedVia: 'numeric_id', unresolved: false, rawValue: value };
  }

  // 2. Looks like an email
  let candidateEmail: string | null = null;
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
    candidateEmail = value.toLowerCase();
  } else {
    // 3. Display name → look up via profiles
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, display_name')
      .ilike('display_name', value)
      .maybeSingle();
    if (profile?.email) candidateEmail = profile.email.toLowerCase();
  }

  if (!candidateEmail) {
    return { ownerId: null, resolvedVia: 'no_match', unresolved: true, rawValue: value };
  }

  // Look up owner by email in HubSpot
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

const FALLBACK_OWNER_ID = Deno.env.get('HUBSPOT_FALLBACK_OWNER_ID') || '42024321'; // jturner@5thline.co

/**
 * Look up an existing HubSpot deal by the custom `naitive_deal_id` property.
 * Used as a duplicate-prevention safety net: if a previous sync attempt created
 * the deal in HubSpot but failed to persist `hubspot_deal_id` locally (network
 * blip, crash, race), this lets us recover the link instead of creating a 2nd
 * HubSpot deal.
 *
 * Returns the HubSpot deal id if found, otherwise null. Failures are non-fatal
 * (we just proceed to create) but logged.
 */
async function findExistingHubSpotDealByNaitiveId(
  accessToken: string,
  naitiveDealId: string,
): Promise<string | null> {
  try {
    const res = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filterGroups: [{
          filters: [{
            propertyName: 'naitive_deal_id',
            operator: 'EQ',
            value: naitiveDealId,
          }],
        }],
        properties: ['dealname', 'naitive_deal_id'],
        limit: 1,
      }),
    });
    if (!res.ok) {
      // Most common cause: the `naitive_deal_id` custom property doesn't exist
      // on the portal yet. Treat as "no match" — the create will still go
      // through and the property will be set on it for future lookups.
      return null;
    }
    const body = await res.json();
    const hit = (body.results ?? [])[0];
    return hit?.id ? String(hit.id) : null;
  } catch (err) {
    console.warn('[hubspot-create-deal] dedupe lookup failed:', (err as Error).message);
    return null;
  }
}

/**
 * Resolve HubSpot pipeline + stage:
 * 1. Try the hubspot_pipeline_stage_map DB table (preferred — explicit per-company config).
 * 2. Fall back to fetching HubSpot pipelines and matching stage labels case-insensitively.
 */
async function resolveHubSpotMapping(
  supabase: any,
  params: {
    companyId: string;
    naitivePipelineId: string | null;
    naitivePipelineName: string;
    naitiveStageLabel: string;
    accessToken: string;
  },
): Promise<StageResolution> {
  const { companyId, naitivePipelineId, naitivePipelineName, naitiveStageLabel, accessToken } = params;

  // ── 1. DB map lookup ─────────────────────────────────────────────────
  if (naitivePipelineId) {
    const { data: mapRow } = await supabase
      .from('hubspot_pipeline_stage_map')
      .select('hubspot_pipeline_id, hubspot_dealstage_id')
      .eq('company_id', companyId)
      .eq('naitive_pipeline_id', naitivePipelineId)
      .ilike('naitive_stage_name', naitiveStageLabel)
      .maybeSingle();

    if (mapRow?.hubspot_pipeline_id && mapRow?.hubspot_dealstage_id) {
      return {
        hubspotPipelineId: mapRow.hubspot_pipeline_id,
        hubspotStageId: mapRow.hubspot_dealstage_id,
        source: 'db_map',
        error: null,
      };
    }
  }

  // ── 2. Fallback: use hardcoded pipeline mapping + live HubSpot stage lookup ──
  const hubspotPipelineId = HUBSPOT_PIPELINE_NAME_FALLBACK[naitivePipelineName];
  if (!hubspotPipelineId) {
    return {
      hubspotPipelineId: null,
      hubspotStageId: null,
      source: 'none',
      error: `No HubSpot mapping for Naitive pipeline "${naitivePipelineName}" (stage "${naitiveStageLabel}"). Add a row to hubspot_pipeline_stage_map.`,
    };
  }

  try {
    const res = await fetch(
      `https://api.hubapi.com/crm/v3/pipelines/deals/${hubspotPipelineId}/stages`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const body = await res.text();
    if (!res.ok) {
      return {
        hubspotPipelineId,
        hubspotStageId: null,
        source: 'none',
        error: `HubSpot stages API ${res.status}: ${body.slice(0, 300)}`,
      };
    }
    const parsed = JSON.parse(body);
    const stages: { id: string; label: string }[] = parsed.results ?? parsed;
    const match = stages.find(
      (s) => s.label.toLowerCase().trim() === naitiveStageLabel.toLowerCase().trim(),
    );
    if (!match) {
      return {
        hubspotPipelineId,
        hubspotStageId: null,
        source: 'none',
        error: `No HubSpot stage matching "${naitiveStageLabel}" in pipeline ${hubspotPipelineId}. Available: ${stages.map((s) => s.label).join(', ')}`,
      };
    }
    return {
      hubspotPipelineId,
      hubspotStageId: match.id,
      source: 'label_match',
      error: null,
    };
  } catch (err: any) {
    return {
      hubspotPipelineId,
      hubspotStageId: null,
      source: 'none',
      error: `Stage lookup failed: ${err.message}`,
    };
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
    const { deal_id, force = false } = await req.json();
    if (!deal_id) {
      return new Response(JSON.stringify({ error: 'deal_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Load deal ─────────────────────────────────────────────────────
    const { data: deal, error: dealErr } = await supabase
      .from('deals')
      .select('id, company, value, stage, pipeline_id, created_at, hubspot_deal_id, company_id, deal_owner, manager')
      .eq('id', deal_id)
      .single();

    if (dealErr || !deal) {
      return new Response(JSON.stringify({ error: `Deal not found: ${dealErr?.message}` }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Forward-only guard (skipped on force) ─────────────────────────
    if (!force && deal.created_at < HUBSPOT_SYNC_ENABLED_FROM) {
      await supabase.from('deals').update({
        hubspot_sync_status: 'skipped',
        hubspot_sync_error: 'Skipped historical deal created before HubSpot sync launch',
      }).eq('id', deal_id);

      return new Response(JSON.stringify({ skipped: true, reason: 'historical_deal' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Idempotency guard ─────────────────────────────────────────────
    if (deal.hubspot_deal_id && !force) {
      return new Response(JSON.stringify({
        skipped: true,
        reason: 'already_synced',
        hubspot_deal_id: deal.hubspot_deal_id,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── In-flight lock (prevents duplicate HubSpot deals from concurrent invokes) ──
    // Atomically transition status null/skipped/failed → 'syncing'. If another
    // worker has already claimed this deal we exit early.
    {
      const { data: claimed, error: claimErr } = await supabase
        .from('deals')
        .update({ hubspot_sync_status: 'syncing', hubspot_sync_error: null })
        .eq('id', deal_id)
        .or('hubspot_sync_status.is.null,hubspot_sync_status.in.(skipped,failed)')
        .select('id')
        .maybeSingle();
      if (!claimed && !force) {
        if (claimErr) console.warn('[hubspot-create-deal] claim error:', claimErr.message);
        return new Response(JSON.stringify({
          skipped: true,
          reason: 'already_in_flight_or_synced',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // ── Token check ───────────────────────────────────────────────────
    const accessToken = Deno.env.get('HUBSPOT_ACCESS_TOKEN');
    if (!accessToken) {
      const msg = 'HUBSPOT_ACCESS_TOKEN not configured';
      await supabase.from('deals').update({
        hubspot_sync_status: 'failed',
        hubspot_sync_error: msg,
      }).eq('id', deal_id);
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Resolve Naitive pipeline name + stage label ───────────────────
    let pipelineName = 'Active Pipeline';
    let stageLabel = deal.stage;
    if (deal.pipeline_id) {
      const { data: pipeline } = await supabase
        .from('deal_pipelines')
        .select('name, stages')
        .eq('id', deal.pipeline_id)
        .single();
      if (pipeline) {
        pipelineName = pipeline.name;
        const stages = (pipeline.stages || []) as Array<{ id: string; label: string }>;
        const found = stages.find((s) => s.id === deal.stage);
        if (found) stageLabel = found.label;
      }
    }

    // ── Resolve HubSpot pipeline + stage ──────────────────────────────
    const resolved = await resolveHubSpotMapping(supabase, {
      companyId: deal.company_id,
      naitivePipelineId: deal.pipeline_id,
      naitivePipelineName: pipelineName,
      naitiveStageLabel: stageLabel,
      accessToken,
    });

    if (!resolved.hubspotPipelineId || !resolved.hubspotStageId) {
      console.error(`[hubspot-create-deal] Resolution failed: ${resolved.error}`);
      await supabase.from('deals').update({
        hubspot_sync_status: 'failed',
        hubspot_sync_error: resolved.error,
      }).eq('id', deal_id);

      await logSync(supabase, {
        company_id: deal.company_id,
        deal_id: deal.id,
        action: 'create_deal',
        status: 'error',
        error_message: resolved.error || 'Mapping not found',
      });

      return new Response(JSON.stringify({ error: resolved.error }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Create deal in HubSpot ────────────────────────────────────────
    const numericAmount = Number(String(deal.value ?? 0).replace(/[^0-9.-]/g, '')) || 0;

    // ── Duplicate-prevention lookup ────────────────────────────────────
    // Before creating, search HubSpot for an existing deal already tagged
    // with this naitive deal id. Recovers from prior failures where the
    // HubSpot deal was created but its id wasn't persisted locally.
    const existingHubSpotId = await findExistingHubSpotDealByNaitiveId(accessToken, deal.id);
    if (existingHubSpotId) {
      console.log(`[hubspot-create-deal] Recovered existing HubSpot deal ${existingHubSpotId} for naitive ${deal.id} (dedupe)`);
      await supabase.from('deals').update({
        hubspot_deal_id: existingHubSpotId,
        hubspot_sync_status: 'success',
        hubspot_sync_error: null,
        hubspot_last_synced_at: new Date().toISOString(),
      }).eq('id', deal_id);
      await logSync(supabase, {
        company_id: deal.company_id,
        deal_id: deal.id,
        hubspot_deal_id: existingHubSpotId,
        action: 'create_deal_dedupe',
        status: 'success',
        response_payload: { recovered: true, source: 'naitive_deal_id_lookup' },
      });
      // Fall through to PATCH the existing record so we keep stage/amount/owner in sync.
    }

    // Resolve owner + manager
    const ownerResolution = await resolveHubSpotOwner(supabase, deal.deal_owner, accessToken);
    let ownerId = ownerResolution.ownerId;
    let ownerFallbackWarning: string | null = null;
    if (ownerResolution.unresolved) {
      ownerId = FALLBACK_OWNER_ID;
      ownerFallbackWarning = `Deal Owner "${ownerResolution.rawValue}" could not be resolved to a HubSpot user. Used fallback owner.`;
      await logSync(supabase, {
        company_id: deal.company_id,
        deal_id: deal.id,
        action: 'owner_resolution',
        status: 'error',
        error_message: `Unresolved deal_owner "${ownerResolution.rawValue}" → fell back to ${FALLBACK_OWNER_ID}`,
        request_payload: { field: 'deal_owner', raw: ownerResolution.rawValue, resolved_via: ownerResolution.resolvedVia },
      });
    }

    const properties: Record<string, string> = {
      dealname: deal.company || 'Untitled Deal',
      amount: String(numericAmount),
      pipeline: resolved.hubspotPipelineId,
      dealstage: resolved.hubspotStageId,
      naitive_deal_id: deal.id,
    };
    if (ownerId) properties.hubspot_owner_id = ownerId;
    if (deal.manager) properties.deal_manager = String(deal.manager);

    const hubspotPayload = { properties };

    // If we recovered an existing HubSpot deal, PATCH it; otherwise POST a new one.
    const hsUrl = existingHubSpotId
      ? `https://api.hubapi.com/crm/v3/objects/deals/${existingHubSpotId}`
      : 'https://api.hubapi.com/crm/v3/objects/deals';
    const hsMethod = existingHubSpotId ? 'PATCH' : 'POST';
    const hsResponse = await fetch(hsUrl, {
      method: hsMethod,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(hubspotPayload),
    });

    const hsBody = await hsResponse.text();

    if (!hsResponse.ok) {
      console.error(`[hubspot-create-deal] HubSpot API ${hsResponse.status}: ${hsBody.slice(0, 500)}`);
      await supabase.from('deals').update({
        hubspot_sync_status: 'failed',
        hubspot_sync_error: `HubSpot ${hsResponse.status}: ${hsBody.slice(0, 500)}`,
      }).eq('id', deal_id);

      await logSync(supabase, {
        company_id: deal.company_id,
        deal_id: deal.id,
        action: 'create_deal',
        status: 'error',
        request_payload: hubspotPayload,
        response_payload: hsBody.slice(0, 2000),
        error_message: `HubSpot ${hsResponse.status}`,
      });

      return new Response(JSON.stringify({ error: `HubSpot API error ${hsResponse.status}`, details: hsBody.slice(0, 500) }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const hsResult = JSON.parse(hsBody);
    const hubspotDealId = hsResult.id || existingHubSpotId;

    await supabase.from('deals').update({
      hubspot_deal_id: hubspotDealId,
      hubspot_sync_status: 'success',
      hubspot_sync_error: ownerFallbackWarning,
      hubspot_last_synced_at: new Date().toISOString(),
    }).eq('id', deal_id);

    await logSync(supabase, {
      company_id: deal.company_id,
      deal_id: deal.id,
      hubspot_deal_id: hubspotDealId,
      action: 'create_deal',
      status: 'success',
      request_payload: hubspotPayload,
      response_payload: {
        id: hubspotDealId,
        mapping_source: resolved.source,
        owner_before: null,
        owner_after: ownerId,
        owner_resolved_via: ownerResolution.resolvedVia,
        deal_manager_before: null,
        deal_manager_after: deal.manager || null,
      },
    });

    console.log(`[hubspot-create-deal] Created HubSpot deal ${hubspotDealId} for Naitive deal ${deal_id} via ${resolved.source}`);

    return new Response(JSON.stringify({
      success: true,
      hubspot_deal_id: hubspotDealId,
      mapping_source: resolved.source,
      payload: hubspotPayload,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error(`[hubspot-create-deal] Fatal: ${err.message}`);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
    console.error('[hubspot-create-deal] Log insert failed:', e.message);
  }
}
