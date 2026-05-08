import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request): Promise<Response> => {
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
      .from("user_roles").select("role")
      .eq("user_id", caller.id).eq("role", "admin").maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { companyId } = await req.json();
    if (!companyId) {
      return new Response(JSON.stringify({ error: "companyId required" }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Fetch unaccepted invitations for this company
    const { data: invites } = await admin
      .from("company_invitations")
      .select("id, email, role, token, accepted_at, company_id")
      .eq("company_id", companyId)
      .is("accepted_at", null);

    const { data: company } = await admin
      .from("companies").select("name").eq("id", companyId).single();

    const inviterName =
      (caller.user_metadata as Record<string, unknown> | null)?.full_name as string | undefined ||
      (caller.email?.split("@")[0] ?? "An admin");

    let sent = 0;
    for (const inv of invites ?? []) {
      try {
        await admin.functions.invoke("send-invite", {
          body: {
            invitationId: inv.id,
            email: inv.email,
            companyName: company?.name ?? "",
            inviterName,
            role: inv.role,
            token: inv.token,
          },
          headers: { Authorization: authHeader },
        });
        sent++;
      } catch (e) {
        console.warn("[resend-demo-invite] send failed", inv.email, e);
      }
    }

    return new Response(JSON.stringify({ success: true, sent, total: invites?.length ?? 0 }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});