import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_URL = "https://naitive.co";
// Link directly to the Insights workspace where the Weekly Rundown lives.
// If the user is not authenticated (or lacks Insights access) the
// ProtectedRoute / InsightsAccessGuard will bounce them to /login while
// preserving this path via ?redirect=, so they land back here after sign-in.
const INSIGHTS_URL = `${APP_URL}/insights`;

function buildHtml(name: string | null): string {
  // Light-theme layout mirroring the existing "Daily Briefing" email
  // (`_shared/transactional-email-templates/daily-briefing-ready.tsx`) so
  // both Naitive emails share a consistent visual language.
  const dateString = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const greeting = name ? `Good morning, ${name}.` : 'Good morning.';
  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Your Weekly Rundown is Ready</title>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:'Inter','Helvetica Neue',Arial,sans-serif;color:#0f172a;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your weekly rundown is ready — ${dateString}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
          <tr>
            <td align="center" style="padding:0 0 8px 0;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#0f172a;letter-spacing:-0.5px;">naitive</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0;">
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
            </td>
          </tr>
          <tr>
            <td>
              <h1 style="margin:0 0 8px;font-size:26px;font-weight:600;color:#0f172a;line-height:1.3;">${greeting}</h1>
              <p style="margin:0 0 24px;font-size:14px;color:#94a3b8;font-weight:500;">${dateString}</p>
              <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">Your Weekly Rundown has been prepared and is ready to review.</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:32px 0 16px 0;">
              <a href="${INSIGHTS_URL}" style="display:inline-block;background-color:#0f172a;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:14px 32px;border-radius:8px;">View Weekly Rundown</a>
            </td>
          </tr>
          <tr>
            <td style="padding:0;">
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
            </td>
          </tr>
          <tr>
            <td align="center">
              <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">Naitive · Weekly Rundown · Sent every Tuesday</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: require a Bearer token. Accept CRON_SECRET, the project's anon key,
  // publishable key, or any user JWT. Reject only if no Bearer is present.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not configured");
    const resend = new Resend(resendKey);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Optional one-off test override: { testRecipient: "x@y.com" }
    let body: any = {};
    try { body = await req.json(); } catch { /* ignore */ }
    let list: Array<{ email: string; name: string | null }>;
    if (body?.testRecipient && typeof body.testRecipient === "string") {
      list = [{ email: body.testRecipient, name: body.testName ?? null }];
    } else {
      const { data: recipients, error } = await supabase
        .from("weekly_rundown_recipients")
        .select("email, name, active")
        .eq("active", true);
      if (error) throw error;
      list = (recipients ?? []).map((r: any) => ({ email: r.email, name: r.name }));
    }
    console.log(`Sending Weekly Rundown to ${list.length} recipients`);

    const results: Array<{ email: string; ok: boolean; error?: string }> = [];
    for (const r of list) {
      try {
        const { error: sendErr } = await resend.emails.send({
          from: "naitive <noreply@updates.naitive.co>",
          reply_to: "support@naitive.co",
          to: [r.email],
          subject: "Your Weekly Rundown is Ready",
          html: buildHtml(r.name ?? null),
        });
        if (sendErr) throw sendErr;
        results.push({ email: r.email, ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`Failed to send to ${r.email}:`, msg);
        results.push({ email: r.email, ok: false, error: msg });
      }
    }

    return new Response(JSON.stringify({ sent: results.filter(r => r.ok).length, total: list.length, results }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("send-weekly-rundown error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);