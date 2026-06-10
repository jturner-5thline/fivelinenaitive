import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { buildFrom } from '../_shared/resendFrom.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ApprovalNotification {
  user_email: string;
  user_name?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    
    if (!resendApiKey) {
      console.log("RESEND_API_KEY not configured, skipping email");
      return new Response(
        JSON.stringify({ success: true, message: "Email skipped - no API key" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { user_email, user_name } = await req.json() as ApprovalNotification;

    if (!user_email) {
      return new Response(
        JSON.stringify({ error: "Missing user_email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const displayName = user_name || user_email.split("@")[0];

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Account Approved</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background-color: #f5f5f5;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 32px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 24px;">
              <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #22c55e, #16a34a); border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 32px;">✓</span>
              </div>
              <h1 style="color: #1a1a1a; margin: 0;">Welcome to naitive!</h1>
            </div>
            
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
              Hi ${displayName},
            </p>
            
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
              Great news! Your account has been approved by an administrator. You now have full access to naitive.
            </p>
            
            <div style="text-align: center; margin: 32px 0;">
              <a href="https://naitive.co/dashboard" style="display: inline-block; background: #2563eb; color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 500;">
                Go to Dashboard
              </a>
            </div>
            
            <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
              If you have any questions or need help getting started, please don't hesitate to reach out to our team.
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
            
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">
              © 2024 5th Line Capital. All rights reserved.
            </p>
          </div>
        </body>
      </html>
    `;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: buildFrom("Naitive"),
        to: [user_email],
        subject: "Your naitive Account Has Been Approved!",
        headers: {
          "List-Unsubscribe": "<https://naitive.co/unsubscribe>",
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        text: `Hi ${displayName},\n\nGreat news! Your account has been approved by an administrator. You now have full access to naitive.\n\nGo to Dashboard: https://naitive.co/dashboard\n\nIf you have any questions, please don't hesitate to reach out.\n\n— The naitive Team\n\n---\nnaitive | Unsubscribe: https://naitive.co/unsubscribe`,
        html: emailHtml,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("Failed to send approval email:", errorText);
      // Don't fail hard - email is a notification, not critical
      return new Response(
        JSON.stringify({ success: true, message: "User approved but email delivery failed", emailError: errorText }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await emailResponse.json();
    console.log("Approval email sent to:", user_email, result);

    return new Response(
      JSON.stringify({ success: true, emailId: result.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in notify-user-approved:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
