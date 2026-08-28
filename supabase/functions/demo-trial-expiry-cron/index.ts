import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Daily cron job that:
 *  1. Sends a 3-day warning email to demo/pilot company admins (once).
 *  2. Auto-revokes access (deactivates profiles + sets subscription_status='revoked')
 *     when trial_ends_at has passed for trialing demo/pilot companies.
 *
 * Invoked by pg_cron daily. No body required.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const now = new Date();
    const in3Days = new Date(now.getTime() + 3 * 24 * 3600 * 1000);

    // Pull all trialing demo/pilot companies
    const { data: companies, error } = await admin
      .from("companies")
      .select("id, name, account_type, trial_ends_at, subscription_status, demo_warning_sent_at")
      .eq("subscription_status", "trialing")
      .not("trial_ends_at", "is", null);

    if (error) throw error;

    let warned = 0;
    let revoked = 0;
    const errors: string[] = [];

    for (const c of companies ?? []) {
      const trialEnds = new Date(c.trial_ends_at as string);
      const accountType = String(c.account_type || "").toLowerCase();
      if (!["demo", "pilot", "trial", "partner"].includes(accountType)) continue;

      // ---------- Auto-revoke after expiry ----------
      if (trialEnds <= now) {
        try {
          const { data: members } = await admin
            .from("company_members").select("user_id").eq("company_id", c.id);
          const ids = (members ?? []).map((m: any) => m.user_id);
          if (ids.length > 0) {
            await admin.from("profiles").update({ is_active: false }).in("user_id", ids);
          }
          await admin
            .from("companies")
            .update({ subscription_status: "revoked" })
            .eq("id", c.id);
          await admin.from("user_activity_log").insert([{
            user_id: ids[0] ?? null,
            company_id: c.id,
            event_type: "feature_used",
            event_data: { feature: "demo_auto_revoked", reason: "trial_expired" },
          }]);
          revoked++;
        } catch (e) {
          errors.push(`revoke ${c.id}: ${(e as Error).message}`);
        }
        continue;
      }

      // ---------- 3-day warning ----------
      if (trialEnds <= in3Days && !c.demo_warning_sent_at) {
        try {
          // First admin/owner email
          const { data: members } = await admin
            .from("company_members")
            .select("user_id, role")
            .eq("company_id", c.id);
          const adminMembers = (members ?? []).filter((m: any) =>
            m.role === "owner" || m.role === "admin"
          );
          const targetIds = (adminMembers.length ? adminMembers : (members ?? [])).map((m: any) => m.user_id);
          if (targetIds.length === 0) continue;

          const { data: profiles } = await admin
            .from("profiles")
            .select("user_id, email, full_name, display_name")
            .in("user_id", targetIds);

          const daysRemaining = Math.max(1, Math.ceil((trialEnds.getTime() - now.getTime()) / (24 * 3600 * 1000)));

          for (const p of profiles ?? []) {
            if (!p.email) continue;
            try {
              await admin.functions.invoke("send-app-email", {
                body: {
                  templateName: "demo-trial-warning",
                  recipientEmail: p.email,
                  idempotencyKey: `demo-trial-warning-${c.id}-${trialEnds.toISOString().slice(0, 10)}`,
                  templateData: {
                    name: p.full_name || p.display_name || null,
                    companyName: c.name,
                    trialEndsAt: c.trial_ends_at,
                    daysRemaining,
                    contactEmail: "team@naitive.co",
                  },
                },
              });
            } catch (sendErr) {
              console.warn("[demo-trial-expiry-cron] warning email failed", p.email, sendErr);
            }
          }

          await admin
            .from("companies")
            .update({ demo_warning_sent_at: now.toISOString() })
            .eq("id", c.id);
          warned++;
        } catch (e) {
          errors.push(`warn ${c.id}: ${(e as Error).message}`);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, warned, revoked, errors }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[demo-trial-expiry-cron] fatal", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});