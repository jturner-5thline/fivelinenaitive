import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const now = new Date().toISOString();
  const { data: due, error } = await supabase
    .from("scheduled_followup_actions")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_for", now)
    .limit(50);

  if (error) {
    console.error("[followup-scheduled] fetch error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }

  let fired = 0, failed = 0;
  for (const row of due ?? []) {
    try {
      // Re-validate the deal still exists + isn't archived
      const { data: deal } = await supabase
        .from("deals")
        .select("id, company, company_id, status, stage")
        .eq("id", row.deal_id)
        .maybeSingle();

      if (!deal || deal.status === "archived") {
        await supabase.from("scheduled_followup_actions")
          .update({ status: "cancelled", fired_at: new Date().toISOString() })
          .eq("id", row.id);
        continue;
      }

      const { error: invokeErr } = await supabase.functions.invoke("notification-engine", {
        body: {
          triggerKey: row.trigger_key,
          context: {
            deal_id: deal.id,
            deal_name: deal.company,
            stage: deal.stage,
            company_id: deal.company_id,
            ...(row.context as Record<string, unknown>),
          },
        },
      });

      if (invokeErr) throw invokeErr;

      await supabase.from("scheduled_followup_actions")
        .update({ status: "fired", fired_at: new Date().toISOString() })
        .eq("id", row.id);
      fired++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase.from("scheduled_followup_actions")
        .update({ status: "failed", fired_at: new Date().toISOString(), error_message: msg })
        .eq("id", row.id);
      failed++;
    }
  }

  console.log(`[followup-scheduled] fired=${fired} failed=${failed} considered=${due?.length ?? 0}`);
  return new Response(JSON.stringify({ fired, failed, considered: due?.length ?? 0 }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
