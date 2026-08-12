import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const action = body.action || "run";

    if (action === "get-settings") {
      // Get sync settings for a user
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: settings } = await supabase
        .from("sync_schedule_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      return new Response(JSON.stringify({
        settings: settings || {
          qb_enabled: false,
          hs_enabled: false,
          interval_hours: 48,
          last_qb_sync: null,
          last_hs_sync: null,
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update-settings") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { qb_enabled, hs_enabled, interval_hours } = body;

      const { data, error } = await supabase
        .from("sync_schedule_settings")
        .upsert({
          user_id: user.id,
          qb_enabled: qb_enabled ?? false,
          hs_enabled: hs_enabled ?? false,
          interval_hours: interval_hours ?? 48,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" })
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ settings: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // action === "run" — triggered by pg_cron
    // Find all users with auto-sync enabled and whose interval has elapsed
    const { data: schedules, error: schedError } = await supabase
      .from("sync_schedule_settings")
      .select("*")
      .or("qb_enabled.eq.true,hs_enabled.eq.true");

    if (schedError) throw schedError;

    const now = new Date();
    const results: { userId: string; qbSynced: boolean; hsSynced: boolean }[] = [];

    for (const schedule of schedules || []) {
      const intervalMs = (schedule.interval_hours || 48) * 60 * 60 * 1000;
      let qbSynced = false;
      let hsSynced = false;

      // Check QB sync
      if (schedule.qb_enabled) {
        const lastQb = schedule.last_qb_sync ? new Date(schedule.last_qb_sync) : null;
        if (!lastQb || now.getTime() - lastQb.getTime() >= intervalMs) {
          try {
            // Get user's QB tokens to find realm IDs
            const { data: tokens } = await supabase
              .from("quickbooks_tokens")
              .select("realm_id")
              .eq("user_id", schedule.user_id);

            // Sync each scope separately to avoid edge function timeouts
            const scopes = ["customers", "invoices", "payments", "expenses", "accounts", "vendors", "bills"];
            for (const token of tokens || []) {
              for (const scope of scopes) {
                try {
                  await fetch(`${supabaseUrl}/functions/v1/quickbooks-sync`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "Authorization": `Bearer ${supabaseServiceKey}`,
                      "x-sync-user-id": schedule.user_id,
                    },
                    body: JSON.stringify({
                      syncType: scope,
                      realmId: token.realm_id,
                      userId: schedule.user_id,
                    }),
                  });
                } catch (e) {
                  console.error(`QB ${scope} sync failed for user ${schedule.user_id}:`, e);
                }
              }
            }

            await supabase
              .from("sync_schedule_settings")
              .update({ last_qb_sync: now.toISOString() })
              .eq("user_id", schedule.user_id);

            qbSynced = true;
          } catch (e) {
            console.error(`QB sync failed for user ${schedule.user_id}:`, e);
          }
        }
      }

      // Check HS sync
      if (schedule.hs_enabled) {
        const lastHs = schedule.last_hs_sync ? new Date(schedule.last_hs_sync) : null;
        if (!lastHs || now.getTime() - lastHs.getTime() >= intervalMs) {
          try {
            await fetch(`${supabaseUrl}/functions/v1/hubspot-sync`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseServiceKey}`,
                "x-sync-user-id": schedule.user_id,
              },
              body: JSON.stringify({ action: "syncDeals", userId: schedule.user_id }),
            });

            await supabase
              .from("sync_schedule_settings")
              .update({ last_hs_sync: now.toISOString() })
              .eq("user_id", schedule.user_id);

            hsSynced = true;
          } catch (e) {
            console.error(`HS sync failed for user ${schedule.user_id}:`, e);
          }
        }
      }

      results.push({ userId: schedule.user_id, qbSynced, hsSynced });
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
