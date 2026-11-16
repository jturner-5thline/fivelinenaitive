import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { canSyncHarvest, HARVEST_COMPANY_ID, HARVEST_START } from './logic.ts';

const schema = z.object({ action: z.enum(['status', 'sync']) }).strict();
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
export async function handleHarvest(req: Request) {
  if (req.method === 'OPTIONS') return response('ok');
  if (req.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !service) return response({ error: 'Service unavailable' }, 503);
  const auth = req.headers.get('Authorization');
  if (!auth) return response({ error: 'Sign in required' }, 401);
  const client = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: userData, error: authError } = await client.auth.getUser();
  if (authError || !userData.user) return response({ error: 'Sign in required' }, 401);
  const { data: member, error: memberError } = await client.from('company_members').select('role').eq('user_id', userData.user.id).eq('company_id', HARVEST_COMPANY_ID).maybeSingle();
  if (memberError || !member) return response({ error: 'Harvest is restricted to the 5th Line workspace' }, 403);
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return response({ error: 'Invalid Harvest request' }, 400);
    const key = Deno.env.get('UDC_HARVEST_API_KEY');
    const gatewayKey = Deno.env.get('LOVABLE_API_KEY');
    const { data: state, error: stateError } = await client.from('harvest_sync_state').select('*').eq('company_id', HARVEST_COMPANY_ID).maybeSingle();
    if (stateError) throw stateError;
    if (parsed.data.action === 'status') return response({ connected: Boolean(key && gatewayKey), canSync: canSyncHarvest(HARVEST_COMPANY_ID, member.role), state });
    if (!canSyncHarvest(HARVEST_COMPANY_ID, member.role)) return response({ error: 'Only workspace owners and admins can sync Harvest' }, 403);
    if (!key || !gatewayKey) return response({ error: 'Harvest connection is not configured' }, 503);
    const db = createClient(url, service);
    const run = state?.pending_run ?? crypto.randomUUID();
    const page = state?.pending_run ? state.next_page : 1;
    const through = state?.pending_run ? state.sync_through : new Date().toISOString().slice(0, 10);
    // Each request imports one bounded page; the existing complete snapshot stays visible until the last page.
    const upstream = await fetch(`https://connector-gateway.lovable.dev/udc_harvest/v2/time_entries?from=${HARVEST_START}&to=${through}&per_page=2000&page=${page}`, {
      headers: { Authorization: `Bearer ${gatewayKey}`, 'X-Connection-Api-Key': key, 'Harvest-Account-Id': '1772323', 'User-Agent': 'Naitive Harvest Integration' },
      signal: AbortSignal.timeout(45000),
    });
    if (!upstream.ok) {
      const details = await upstream.text();
      return response({ error: 'Harvest request failed', status: upstream.status, details }, upstream.status);
    }
    const payload = await upstream.json();
    if (!Array.isArray(payload.time_entries)) return response({ error: 'Invalid Harvest response' }, 502);
    const rows = payload.time_entries.map((e: Record<string, any>) => ({
      company_id: HARVEST_COMPANY_ID, sync_run: run, harvest_id: e.id,
      spent_date: e.spent_date, hours: e.hours, billable: e.billable,
      billable_rate: e.billable_rate, currency: e.client?.currency,
      client_id: e.client?.id, client_name: e.client?.name,
      project_id: e.project?.id, project_name: e.project?.name, task_name: e.task?.name,
      user_id: e.user?.id, user_name: e.user?.name, notes: e.notes,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from('harvest_time_entries').upsert(rows.slice(i, i + 500), { onConflict: 'company_id,sync_run,harvest_id' });
      if (error) throw error;
    }
    const done = !payload.next_page;
    const nextState = {
      company_id: HARVEST_COMPANY_ID, account_id: '1772323',
      active_run: done ? run : state?.active_run ?? null,
      pending_run: done ? null : run, next_page: done ? 1 : payload.next_page,
      sync_through: through, last_synced_at: done ? new Date().toISOString() : state?.last_synced_at ?? null,
      total_entries: done ? payload.total_entries : state?.total_entries ?? 0,
      last_error: null, updated_at: new Date().toISOString(),
    };
    const { error } = await db.from('harvest_sync_state').upsert(nextState);
    if (error) throw error;
    return response({ done, page, totalPages: payload.total_pages, totalEntries: payload.total_entries });
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : 'Harvest sync failed' }, 500);
  }
}
if (import.meta.main) Deno.serve(handleHarvest);