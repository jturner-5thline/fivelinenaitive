import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { company_id, user_id, user_email, user_name, note } = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get company name
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("name")
      .eq("id", company_id)
      .single();

    const companyName = company?.name || "Unknown Company";

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
      .select("email, display_name")
      .in("user_id", adminUserIds);

    if (!adminProfiles || adminProfiles.length === 0) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send email to each admin
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (resendApiKey) {
      for (const admin of adminProfiles) {
        if (!admin.email) continue;

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "naitive <noreply@notify.flexfi.ai>",
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
