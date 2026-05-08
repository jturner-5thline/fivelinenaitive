import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  companyId: string;
  accountType?: string; // defaults to "Client"
  notes?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: authData } = await userClient.auth.getUser();
    if (!authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const caller = authData.user;

    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", caller.id).eq("role", "admin").maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const body = (await req.json()) as Body;
    if (!body?.companyId) {
      return new Response(JSON.stringify({ error: "companyId is required" }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const accountType = (body.accountType || "Client").trim();
    const now = new Date().toISOString();

    const { data: updated, error: updErr } = await admin
      .from("companies")
      .update({
        account_type: accountType,
        subscription_status: "active",
        trial_ends_at: null,
        converted_at: now,
        converted_by: caller.id,
        notes: body.notes ?? undefined,
      })
      .eq("id", body.companyId)
      .select("id, name")
      .single();

    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Reactivate any previously revoked profiles for this company.
    const { data: members } = await admin
      .from("company_members").select("user_id").eq("company_id", body.companyId);
    const userIds = (members ?? []).map((m: any) => m.user_id);
    if (userIds.length > 0) {
      await admin.from("profiles").update({ is_active: true }).in("user_id", userIds);
    }

    // Audit
    await admin.from("user_activity_log").insert([{
      user_id: caller.id,
      company_id: body.companyId,
      event_type: "feature_used",
      event_data: { feature: "demo_converted_to_client", account_type: accountType, members: userIds.length },
    }]);

    return new Response(JSON.stringify({ success: true, company: updated }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[convert-demo-to-client]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});