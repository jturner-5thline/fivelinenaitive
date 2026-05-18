import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FIFTH_LINE_COMPANY_ID = "44556c46-9127-4b12-b14e-d6fee784afcf";

const RECIPIENTS = [
  "ppina@5thline.co",
  "jturner@5thline.co",
  "ffustinoni@5thline.co",
  "jmoffitt@5thline.co",
];

/**
 * Canonical app base URL for links embedded in outbound emails.
 *
 * We never want to link recipients back to:
 *   - the Lovable editor (lovable.dev/projects/...)
 *   - the preview sandbox (id-preview--*.lovable.app)
 *
 * Preference order:
 *   1. APP_BASE_URL env var (lets ops point links at a custom domain).
 *   2. The request's Origin header, only if it matches the production
 *      Naitive domain or the deployed published lovable.app domain.
 *   3. Hardcoded production fallback: https://naitive.co
 */
function getAppBaseUrl(req: Request): string {
  const envOverride = Deno.env.get("APP_BASE_URL");
  if (envOverride && /^https?:\/\//.test(envOverride)) {
    return envOverride.replace(/\/$/, "");
  }

  const ALLOWED_HOSTS = new Set([
    "naitive.co",
    "www.naitive.co",
    "fivelinenaitive.lovable.app",
  ]);

  const origin = req.headers.get("origin");
  if (origin && /^https?:\/\//.test(origin)) {
    try {
      const host = new URL(origin).host.toLowerCase();
      if (ALLOWED_HOSTS.has(host)) return origin.replace(/\/$/, "");
    } catch {
      /* fall through to production default */
    }
  }

  return "https://naitive.co";
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: "America/New_York",
      dateStyle: "long",
      timeStyle: "short",
    }) + " ET";
  } catch {
    return iso;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  } as Record<string, string>)[c]!);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    )!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;

    const body = await req.json();
    const {
      filters = {},
      period_type = null,
      period_key = null,
      period_label = null,
      snapshot = {},
    } = body || {};

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify 5th Line membership
    const { data: membership } = await admin
      .from("company_members")
      .select("user_id")
      .eq("user_id", user.id)
      .eq("company_id", FIFTH_LINE_COMPANY_ID)
      .maybeSingle();
    if (!membership) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve submitter name
    const { data: profile } = await admin
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle();
    const submitterName = profile?.display_name ||
      (user.email ? user.email.split("@")[0] : "Someone");
    const submitterEmail = user.email || null;

    const submittedAtIso = new Date().toISOString();

    const { data: inserted, error: insertErr } = await admin
      .from("naitive_pipeline_reports")
      .insert({
        company_id: FIFTH_LINE_COMPANY_ID,
        submitted_by: user.id,
        submitter_name: submitterName,
        submitter_email: submitterEmail,
        recipients: RECIPIENTS,
        period_type,
        period_key,
        period_label,
        filters,
        snapshot: { ...snapshot, submitted_at: submittedAtIso },
      })
      .select("id, created_at")
      .single();

    if (insertErr || !inserted) {
      console.error("[submit-naitive-pipeline-report] insert error", insertErr);
      return new Response(
        JSON.stringify({ error: insertErr?.message || "insert_failed" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const appBaseUrl = getAppBaseUrl(req);
    const viewUrl = `${appBaseUrl}/naitive-pipeline/reports/${inserted.id}`;
    const submittedAtPretty = formatTimestamp(inserted.created_at);
    const periodPretty = period_label ? `${period_label}` : "";

    let emailSent = false;
    let emailError: string | null = null;

    if (RESEND_API_KEY) {
      const html = `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:20px;background:#f5f5f5;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;box-shadow:0 2px 4px rgba(0,0,0,0.08);">
    <h1 style="color:#1a1a1a;margin:0 0 16px;font-size:22px;">Your naitive Pipeline Report</h1>
    <p style="color:#4a4a4a;font-size:15px;line-height:1.6;margin:0 0 20px;">
      ${escapeHtml(submitterName)} submitted a naitive Pipeline Report snapshot${
        periodPretty ? ` for <strong>${escapeHtml(periodPretty)}</strong>` : ""
      }.
    </p>
    <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin:0 0 24px;font-size:14px;color:#333;">
      <p style="margin:0 0 6px;"><strong>Submitted by:</strong> ${escapeHtml(submitterName)}</p>
      <p style="margin:0 0 6px;"><strong>Submitted at:</strong> ${escapeHtml(submittedAtPretty)}</p>
      ${periodPretty ? `<p style="margin:0;"><strong>Period:</strong> ${escapeHtml(periodPretty)}</p>` : ""}
    </div>
    <p style="color:#4a4a4a;font-size:14px;line-height:1.6;margin:0 0 24px;">
      Open the snapshot below to view the report exactly as it was submitted. The link captures the report at this moment and will not change as the live dashboard updates.
    </p>
    <a href="${viewUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">View Report</a>
    <p style="color:#999;font-size:12px;margin:32px 0 0;">— naitive</p>
  </div>
</body></html>`;

      try {
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: "naitive <noreply@updates.naitive.co>",
            to: RECIPIENTS,
            subject: "Your naitive Pipeline Report",
            html,
            text:
              `${submitterName} submitted a naitive Pipeline Report snapshot${
                periodPretty ? ` for ${periodPretty}` : ""
              }.\n\nSubmitted at: ${submittedAtPretty}\nSubmitted by: ${submitterName}\n\nView report: ${viewUrl}\n\n— naitive`,
          }),
        });
        if (!resp.ok) {
          emailError = await resp.text();
          console.error("[submit-naitive-pipeline-report] email error", emailError);
        } else {
          emailSent = true;
        }
      } catch (e) {
        emailError = String(e);
        console.error("[submit-naitive-pipeline-report] email exception", e);
      }
    } else {
      emailError = "RESEND_API_KEY not configured";
    }

    if (emailSent || emailError) {
      await admin
        .from("naitive_pipeline_reports")
        .update({ email_sent: emailSent, email_error: emailError })
        .eq("id", inserted.id);
    }

    return new Response(
      JSON.stringify({
        id: inserted.id,
        url: viewUrl,
        email_sent: emailSent,
        email_error: emailError,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("[submit-naitive-pipeline-report] fatal", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});