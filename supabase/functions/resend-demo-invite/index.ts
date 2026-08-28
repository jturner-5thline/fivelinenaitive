import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateDemoPassword(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const randomPart = Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("");
  return `Naitive-${Date.now().toString(36)}-${randomPart}!A7`;
}

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

    const { companyId, email: singleEmail } = await req.json();
    if (!companyId) {
      return new Response(JSON.stringify({ error: "companyId required" }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: company } = await admin
      .from("companies").select("id, name").eq("id", companyId).single();
    if (!company) {
      return new Response(JSON.stringify({ error: "Company not found" }), {
        status: 404, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Fetch members of this demo company
    const { data: members } = await admin
      .from("company_members")
      .select("user_id")
      .eq("company_id", companyId);
    const memberIds = (members ?? []).map((m) => m.user_id as string);
    if (memberIds.length === 0) {
      return new Response(JSON.stringify({ error: "No members found for this company" }), {
        status: 404, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: profiles } = await admin
      .from("profiles")
      .select("user_id, email, full_name, display_name")
      .in("user_id", memberIds);

    const inviterName =
      (caller.user_metadata as Record<string, unknown> | null)?.full_name as string | undefined ||
      (caller.email?.split("@")[0] ?? "An admin");

    const PLATFORM_URL = Deno.env.get("APP_URL") ?? "https://naitive.co";

    const targets = (profiles ?? []).filter((p) =>
      singleEmail ? (p.email ?? "").toLowerCase() === String(singleEmail).toLowerCase() : true
    );

    const results: Array<{ email: string; sent: boolean; error: string | null }> = [];
    for (const p of targets) {
      const email = (p.email ?? "").toLowerCase();
      const name = (p.full_name as string) || (p.display_name as string) || email;
      const demoPassword = generateDemoPassword();
      if (!email) continue;

      // Ensure password is current so the prefilled login works.
      try {
        await admin.auth.admin.updateUserById(p.user_id as string, {
          password: demoPassword,
          email_confirm: true,
        });
      } catch (e) {
        console.warn("[resend-demo-invite] password reset failed", email, e);
      }

      const loginUrl = `${PLATFORM_URL}/login?email=${encodeURIComponent(email)}&password=${encodeURIComponent(demoPassword)}&demo=1&redirect=${encodeURIComponent("/deals")}`;

      try {
        const { error: txErr } = await admin.functions.invoke("send-app-email", {
          headers: { Authorization: authHeader },
          body: {
            templateName: "demo-invite",
            recipientEmail: email,
            idempotencyKey: `demo-access-resend-${company.id}-${p.user_id}-${Date.now()}`,
            templateData: {
              name,
              companyName: company.name,
              inviterName,
              acceptUrl: loginUrl,
              role: "Member",
            },
          },
        });
        if (txErr) throw txErr;
        results.push({ email, sent: true, error: null });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn("[resend-demo-invite] send failed", email, msg);
        results.push({ email, sent: false, error: msg });
      }
    }

    const sent = results.filter((r) => r.sent).length;
    return new Response(
      JSON.stringify({ success: true, sent, total: results.length, results }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});