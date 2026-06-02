import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { buildFrom } from '../_shared/resendFrom.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function createHmacToken(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { company_id, user_id, user_email, user_name, note } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Get company name
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("name")
      .eq("id", company_id)
      .single();

    const companyName = company?.name || "Unknown Company";

    // Get the join request ID (most recent pending one for this user+company)
    const { data: joinReq } = await supabaseAdmin
      .from("company_join_requests")
      .select("id")
      .eq("user_id", user_id)
      .eq("company_id", company_id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const requestId = joinReq?.id;

    // Get company admins
    const { data: admins } = await supabaseAdmin
      .from("company_members")
      .select("user_id")
      .eq("company_id", company_id)
      .in("role", ["owner", "admin"]);

    if (!admins || admins.length === 0) {
      console.log("No admins found for company", company_id);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get admin emails
    const adminUserIds = admins.map((a) => a.user_id);
    const { data: adminProfiles } = await supabaseAdmin
      .from("profiles")
      .select("email, display_name, user_id")
      .in("user_id", adminUserIds);

    if (!adminProfiles || adminProfiles.length === 0) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build action URLs for each admin
    const actionBaseUrl = `${supabaseUrl}/functions/v1/handle-join-request-action`;

    // Send email to each admin
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (resendApiKey && requestId) {
      for (const admin of adminProfiles) {
        if (!admin.email) continue;

        // Generate HMAC tokens for this admin
        const approveToken = await createHmacToken(`${requestId}:approve:${admin.user_id}`, serviceRoleKey);
        const rejectToken = await createHmacToken(`${requestId}:reject:${admin.user_id}`, serviceRoleKey);

        const approveUrl = `${actionBaseUrl}?request_id=${requestId}&action=approve&admin_id=${admin.user_id}&token=${approveToken}`;
        const rejectUrl = `${actionBaseUrl}?request_id=${requestId}&action=reject&admin_id=${admin.user_id}&token=${rejectToken}`;

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: buildFrom("naitive"),
            to: [admin.email],
            subject: `New join request for ${companyName}`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; padding: 32px;">
                <h2 style="font-size: 20px; color: #111; margin: 0 0 20px;">New Join Request</h2>
                <p style="font-size: 15px; color: #333; line-height: 1.6; margin: 0 0 8px;">
                  <strong>${user_name || user_email}</strong> (${user_email}) has requested to join <strong>${companyName}</strong> on naitive.
                </p>
                ${note ? `<p style="font-size: 14px; color: #555; line-height: 1.5; margin: 8px 0 0;"><strong>Reason:</strong> ${note}</p>` : ""}
                <div style="margin: 28px 0 24px; text-align: center;">
                  <a href="${approveUrl}" style="display: inline-block; background: #22c55e; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 6px; margin-right: 12px;">Allow Access</a>
                  <a href="${rejectUrl}" style="display: inline-block; background: #ef4444; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 6px;">Decline Access</a>
                </div>
                <p style="font-size: 12px; color: #999; margin: 0;">Or log in to naitive to manage this request.</p>
                <br/>
                <p style="color: #999; font-size: 12px; margin: 0;">— naitive team</p>
              </div>
            `,
          }),
        });
      }
    } else if (resendApiKey && !requestId) {
      // Fallback: no request ID found, send email without buttons
      for (const admin of adminProfiles) {
        if (!admin.email) continue;
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: buildFrom("naitive"),
            to: [admin.email],
            subject: `New join request for ${companyName}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>New Join Request</h2>
                <p><strong>${user_name || user_email}</strong> (${user_email}) has requested to join <strong>${companyName}</strong> on naitive.</p>
                ${note ? `<p><strong>Reason:</strong> ${note}</p>` : ""}
                <p>Please log in to naitive to approve or reject this request.</p>
                <br/>
                <p style="color: #666; font-size: 12px;">— naitive team</p>
              </div>
            `,
          }),
        });
      }
    }

    // Create in-app notifications for each admin/owner
    for (const admin of admins) {
      await supabaseAdmin.from("notification_instances").insert({
        trigger_key: "company_join_request",
        recipient_user_id: admin.user_id,
        channel_type: "in_app",
        status: "sent",
        title: `New join request for ${companyName}`,
        body: `${user_name || user_email} has requested to join ${companyName}.`,
        actor_user_id: user_id,
        context: { company_id, user_email, note: note || null },
        sent_at: new Date().toISOString(),
      });
    }

    console.log(
      `Join request notification sent to ${adminProfiles.length} admin(s) for company ${companyName}`
    );

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in notify-company-join-request:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
