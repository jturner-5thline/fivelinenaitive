import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Called by pg_cron internally - verify_jwt=false in config.toml

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all active SLA rules
    const { data: rules, error: rulesError } = await supabase
      .from("deal_sla_rules")
      .select("*")
      .eq("is_active", true);

    if (rulesError) throw rulesError;

    console.log(`Found ${rules?.length || 0} active SLA rules to check`);

    const results = [];

    for (const rule of rules || []) {
      // Check if enough time has passed since last check
      if (rule.last_checked_at) {
        const lastCheck = new Date(rule.last_checked_at);
        const hoursElapsed = (Date.now() - lastCheck.getTime()) / (1000 * 60 * 60);
        if (hoursElapsed < (rule.check_interval_hours || 24)) {
          results.push({ rule_id: rule.id, skipped: true, reason: "interval_not_reached" });
          continue;
        }
      }

      try {
        // Call the gateway to process this SLA rule
        const response = await fetch(`${supabaseUrl}/functions/v1/slack-agent-gateway`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            action: "send_sla_reminder",
            rule_id: rule.id,
          }),
        });

        const result = await response.json();
        results.push({ rule_id: rule.id, ...result });
      } catch (err) {
        console.error(`Error processing rule ${rule.id}:`, err);
        results.push({
          rule_id: rule.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return new Response(
      JSON.stringify({ processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("SLA check error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
