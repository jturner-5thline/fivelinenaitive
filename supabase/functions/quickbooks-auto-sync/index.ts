import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STALE_MS = 48 * 60 * 60 * 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const now = Date.now();

    // Build the candidate set of (user_id, realm_id) pairs from BOTH the
    // integrations table (per spec) and quickbooks_tokens (actual source of
    // truth — the integrations table has historically not been populated for QB).
    type Candidate = { user_id: string; realm_id: string; integration_id?: string };
    const candidates = new Map<string, Candidate>();

    const { data: integrationRows } = await supabase
      .from("integrations")
      .select("id, user_id, config, last_sync_at")
      .eq("type", "quickbooks")
      .eq("status", "connected");

    for (const row of integrationRows ?? []) {
      const realm = (row as any).config?.realm_id || (row as any).config?.realmId;
      if (!realm || !row.user_id) continue;
      candidates.set(`${row.user_id}:${realm}`, {
        user_id: row.user_id,
        realm_id: String(realm),
        integration_id: row.id,
      });
    }

    const { data: tokenRows } = await supabase
      .from("quickbooks_tokens")
      .select("user_id, realm_id");

    for (const row of tokenRows ?? []) {
      if (!row.user_id || !row.realm_id) continue;
      const k = `${row.user_id}:${row.realm_id}`;
      if (!candidates.has(k)) {
        candidates.set(k, { user_id: row.user_id, realm_id: row.realm_id });
      }
    }

    // Determine staleness from quickbooks_sync_history per realm.
    const { data: history } = await supabase
      .from("quickbooks_sync_history")
      .select("realm_id, completed_at")
      .eq("status", "success")
      .order("completed_at", { ascending: false });

    const lastByRealm = new Map<string, number>();
    for (const h of history ?? []) {
      if (!h.realm_id || !h.completed_at) continue;
      if (!lastByRealm.has(h.realm_id)) {
        lastByRealm.set(h.realm_id, new Date(h.completed_at).getTime());
      }
    }

    const triggered: Array<{ user_id: string; realm_id: string; ageHours: number | null }> = [];
    const skipped: Array<{ user_id: string; realm_id: string; ageHours: number }> = [];
    const errors: Array<{ user_id: string; realm_id: string; error: string }> = [];

    for (const c of candidates.values()) {
      const lastTs = lastByRealm.get(c.realm_id) ?? null;
      const ageHours = lastTs == null ? null : (now - lastTs) / 3_600_000;
      const isStale = lastTs == null || now - lastTs > STALE_MS;

      if (!isStale) {
        skipped.push({ user_id: c.user_id, realm_id: c.realm_id, ageHours: ageHours! });
        continue;
      }

      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/quickbooks-sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            "x-sync-user-id": c.user_id,
          },
          body: JSON.stringify({ realmId: c.realm_id }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          errors.push({ user_id: c.user_id, realm_id: c.realm_id, error: `HTTP ${res.status}: ${txt.slice(0, 200)}` });
          continue;
        }
        triggered.push({ user_id: c.user_id, realm_id: c.realm_id, ageHours });
        if (c.integration_id) {
          await supabase
            .from("integrations")
            .update({ last_sync_at: new Date().toISOString() })
            .eq("id", c.integration_id);
        }
      } catch (e) {
        errors.push({ user_id: c.user_id, realm_id: c.realm_id, error: String((e as Error).message ?? e) });
      }
    }

    const summary = {
      ok: true,
      candidates: candidates.size,
      triggered: triggered.length,
      skipped: skipped.length,
      errors: errors.length,
      details: { triggered, skipped, errors },
    };
    console.log("[quickbooks-auto-sync]", JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[quickbooks-auto-sync] error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});