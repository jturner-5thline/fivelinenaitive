import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ApprovalRequest {
  user_id: string;
  user_email: string;
  user_name?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { user_id, user_email, user_name } = await req.json() as ApprovalRequest;

    if (!user_id || !user_email) {
      return new Response(
        JSON.stringify({ error: "Missing user_id or user_email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all admin users
    const { data: adminRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (rolesError) {
      console.error("Error fetching admin roles:", rolesError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch admins" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!adminRoles || adminRoles.length === 0) {
      console.log("No admin users found to notify");
      return new Response(
        JSON.stringify({ success: true, message: "No admins to notify" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get admin emails from profiles
    const adminUserIds = adminRoles.map((r) => r.user_id);
    const { data: adminProfiles, error: profilesError } = await supabase
      .from("profiles")
      .select("email, display_name")
      .in("user_id", adminUserIds);

    if (profilesError) {
      console.error("Error fetching admin profiles:", profilesError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch admin profiles" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminEmails = adminProfiles?.map((p) => p.email).filter(Boolean) || [];

    if (adminEmails.length === 0) {
      console.log("No admin emails found");
      return new Response(
        JSON.stringify({ success: true, message: "No admin emails to notify" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send email notification if Resend is configured
    if (resendApiKey) {
      const displayName = user_name || user_email.split("@")[0];
      
      const emailHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>New User Approval Required</title>
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background-color: #f5f5f5;">
            <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 32px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <h1 style="color: #1a1a1a; margin-bottom: 24px;">New User Awaiting Approval</h1>
              <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
                A new user has signed up and requires your approval to access nAItive:
              </p>
              <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin: 24px 0;">
                <p style="margin: 0 0 8px 0;"><strong>Name:</strong> ${displayName}</p>
                <p style="margin: 0;"><strong>Email:</strong> ${user_email}</p>
              </div>
              <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
                Please log in to the admin panel to review and approve this user.
              </p>
              <a href="https://fivelinenaitive.lovable.app/admin" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 16px;">
                Review in Admin Panel
              </a>
            </div>
          </body>
        </html>
      `;

      try {
        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: "nAItive <notifications@5thline.co>",
            to: adminEmails,
            subject: `New User Approval Required: ${displayName}`,
            html: emailHtml,
          }),
        });

        if (!emailResponse.ok) {
          const errorText = await emailResponse.text();
          console.error("Failed to send email:", errorText);
        } else {
          console.log(`Approval notification sent to ${adminEmails.length} admin(s)`);
        }
      } catch (emailError) {
        console.error("Error sending email:", emailError);
      }
    } else {
      console.log("RESEND_API_KEY not configured, skipping email notification");
    }

    // Also create in-app notifications for admins
    for (const adminUserId of adminUserIds) {
      await supabase.from("notifications").insert({
        user_id: adminUserId,
        title: "New User Approval Required",
        message: `${user_name || user_email} has signed up and is awaiting approval.`,
        type: "approval_request",
        metadata: { requesting_user_id: user_id, requesting_user_email: user_email },
      });
    }

    return new Response(
      JSON.stringify({ success: true, notified: adminEmails.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in notify-admin-approval:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
