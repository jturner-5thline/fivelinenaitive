import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_URL = "https://naitive.co";
const INSIGHTS_URL = `${APP_URL}/insights`;

function buildHtml(name: string | null): string {
  const greeting = name ? `Hi ${name},` : "Hello,";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Your Weekly Rundown is Ready</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#e5e7eb;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0b;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:linear-gradient(180deg,#111114 0%,#0d0d10 100%);border:1px solid #1f1f24;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:32px 40px 8px 40px;">
              <div style="font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:#8b8b94;font-weight:600;">Naitive</div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 40px 0 40px;">
              <h1 style="margin:0;font-size:24px;line-height:1.3;color:#ffffff;font-weight:600;">Your Weekly Rundown is Ready</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 8px 40px;">
              <p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;color:#c7c7cf;">${greeting}</p>
              <p style="margin:0;font-size:15px;line-height:1.6;color:#c7c7cf;">Your weekly pipeline performance analytics are now available. Open the Insights workspace to review trends, drivers, and what changed this week.</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:32px 40px 8px 40px;">
              <a href="${INSIGHTS_URL}" style="display:inline-block;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:10px;box-shadow:0 4px 14px rgba(37,99,235,0.35);">View Weekly Rundown</a>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 40px 32px 40px;">
              <p style="margin:24px 0 0 0;font-size:12px;line-height:1.6;color:#6b6b74;text-align:center;">If the button doesn't work, copy and paste this link:<br/><a href="${INSIGHTS_URL}" style="color:#9ca3af;text-decoration:underline;">${INSIGHTS_URL}</a></p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;background-color:#08080a;border-top:1px solid #1f1f24;">
              <p style="margin:0;font-size:11px;color:#5a5a63;text-align:center;">Naitive · Weekly Rundown · Sent every Tuesday</p>
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

  // Auth: require CRON_SECRET for scheduled invocations
  const authHeader = req.headers.get("Authorization");
  const expectedSecret = Deno.env.get("CRON_SECRET");
  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
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

    const { data: recipients, error } = await supabase
      .from("weekly_rundown_recipients")
      .select("email, name, active")
      .eq("active", true);

    if (error) throw error;

    const list = recipients ?? [];
    console.log(`Sending Weekly Rundown to ${list.length} recipients`);

    const results: Array<{ email: string; ok: boolean; error?: string }> = [];
    for (const r of list) {
      try {
        const { error: sendErr } = await resend.emails.send({
          from: "Naitive <notifications@naitive.co>",
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