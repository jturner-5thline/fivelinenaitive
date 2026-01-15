import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FlexAlertPayload {
  alert_type: 'term_sheet_request' | 'nda_request' | 'hot_engagement' | 'info_request';
  deal_id: string;
  deal_name: string;
  lender_name?: string;
  lender_email?: string;
  message?: string;
  engagement_score?: number;
  user_id: string;
}

const alertTemplates: Record<string, { subject: string; emoji: string; getMessage: (data: FlexAlertPayload) => string }> = {
  term_sheet_request: {
    subject: '🎯 Term Sheet Request Received!',
    emoji: '🎯',
    getMessage: (data) => `Great news! <strong>${data.lender_name || 'A lender'}</strong> has requested a term sheet for your deal <strong>"${data.deal_name}"</strong> on FLEx. This is a high-intent signal - consider following up promptly!`,
  },
  nda_request: {
    subject: '📋 NDA Request Received',
    emoji: '📋',
    getMessage: (data) => `<strong>${data.lender_name || 'A lender'}</strong> has requested an NDA for your deal <strong>"${data.deal_name}"</strong> on FLEx. This indicates serious interest in moving forward.`,
  },
  hot_engagement: {
    subject: '🔥 Deal is Hot on FLEx!',
    emoji: '🔥',
    getMessage: (data) => `Your deal <strong>"${data.deal_name}"</strong> has reached <strong>hot</strong> engagement status on FLEx with an engagement score of ${data.engagement_score}! Multiple lenders are showing strong interest.`,
  },
  info_request: {
    subject: '💬 Information Request Received',
    emoji: '💬',
    getMessage: (data) => {
      const lender = data.lender_name || 'A lender';
      const messagePreview = data.message 
        ? `<br><br><em>"${data.message.substring(0, 200)}${data.message.length > 200 ? '...' : ''}"</em>`
        : '';
      return `<strong>${lender}</strong> has requested more information about your deal <strong>"${data.deal_name}"</strong> on FLEx.${messagePreview}`;
    },
  },
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const payload: FlexAlertPayload = await req.json();
    console.log("Processing FLEx alert:", payload);

    // Validate required fields
    if (!payload.alert_type || !payload.deal_id || !payload.user_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Get user profile and email
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(payload.user_id);
    if (userError || !userData.user?.email) {
      console.log("User not found or no email:", userError);
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Check user notification preferences
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('user_id', payload.user_id)
      .single();

    if (profileError || !profile) {
      console.log("Profile error:", profileError);
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Check if email notifications are enabled
    const profileData = profile as Record<string, unknown>;
    if (!profileData.email_notifications) {
      console.log("Email notifications disabled for user");
      return new Response(JSON.stringify({ skipped: true, reason: "notifications_disabled" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Check if FLEx alerts are enabled (default to true if not set)
    const flexAlertsEnabled = profileData.notify_flex_alerts !== false;
    if (!flexAlertsEnabled) {
      console.log("FLEx alerts disabled for user");
      return new Response(JSON.stringify({ skipped: true, reason: "flex_alerts_disabled" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Check if info request emails are enabled specifically (default to true if not set)
    if (payload.alert_type === 'info_request') {
      const infoRequestEmailsEnabled = profileData.notify_info_request_emails !== false;
      if (!infoRequestEmailsEnabled) {
        console.log("Info request emails disabled for user");
        return new Response(JSON.stringify({ skipped: true, reason: "info_request_emails_disabled" }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    const template = alertTemplates[payload.alert_type];
    if (!template) {
      console.log("Unknown alert type:", payload.alert_type);
      return new Response(JSON.stringify({ error: "Unknown alert type" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const message = template.getMessage(payload);
    const appUrl = "https://fivelinenaitive.lovable.app";
    const dealUrl = `${appUrl}/deal/${payload.deal_id}?tab=deal-management`;
    const userName = profileData.first_name || profileData.display_name || 'there';

    const emailResponse = await resend.emails.send({
      from: "nAItive <noreply@updates.naitive.co>",
      reply_to: "support@naitive.co",
      to: [userData.user.email],
      subject: `nAItive: ${template.subject}`,
      headers: {
        "List-Unsubscribe": `<${appUrl}/unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      text: `${template.subject}\n\nHi ${userName},\n\n${message.replace(/<[^>]*>/g, '')}\n\nView Deal: ${dealUrl}\n\n---\nnAItive - Manage preferences: ${appUrl}/settings | Unsubscribe: ${appUrl}/unsubscribe`,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta name="color-scheme" content="light">
          <meta name="supported-color-schemes" content="light">
          <title>${template.subject}</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
          <div style="display: none; max-height: 0; overflow: hidden;">
            ${message.replace(/<[^>]*>/g, '').substring(0, 100)}...
            &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
          </div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f5f5f5;">
            <tr>
              <td align="center" style="padding: 40px 20px;">
                <table role="presentation" width="500" cellspacing="0" cellpadding="0" border="0" style="max-width: 500px; background: #ffffff; border-radius: 8px; overflow: hidden;">
                  <!-- Gradient Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #8B5CF6 0%, #D946EF 100%); padding: 24px 40px; text-align: center;">
                      <span style="font-size: 48px;">${template.emoji}</span>
                    </td>
                  </tr>
                  <!-- Content -->
                  <tr>
                    <td style="padding: 32px 40px;">
                      <h1 style="color: #1a1a1a; font-size: 22px; font-weight: 600; margin: 0 0 16px 0; line-height: 1.3;">
                        ${template.subject.replace(/^[^\s]+\s/, '')}
                      </h1>
                      <p style="color: #4a4a4a; font-size: 15px; line-height: 1.7; margin: 0 0 24px 0;">
                        Hi ${userName},
                      </p>
                      <p style="color: #4a4a4a; font-size: 15px; line-height: 1.7; margin: 0 0 24px 0;">
                        ${message}
                      </p>
                      ${payload.lender_email ? `
                        <div style="background-color: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                          <p style="color: #6b7280; font-size: 13px; margin: 0 0 4px 0;">Lender Contact</p>
                          <p style="color: #1a1a1a; font-size: 15px; margin: 0; font-weight: 500;">
                            ${payload.lender_name || 'Unknown'} 
                            <a href="mailto:${payload.lender_email}" style="color: #8B5CF6;">&lt;${payload.lender_email}&gt;</a>
                          </p>
                        </div>
                      ` : ''}
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                        <tr>
                          <td style="border-radius: 8px; background: linear-gradient(135deg, #8B5CF6 0%, #D946EF 100%);">
                            <a href="${dealUrl}" target="_blank" style="display: inline-block; padding: 14px 28px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none;">View Deal Activity</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <!-- Footer -->
                  <tr>
                    <td style="padding: 24px 40px; border-top: 1px solid #eeeeee; text-align: center;">
                      <p style="color: #888888; font-size: 12px; margin: 0 0 8px 0;">
                        © ${new Date().getFullYear()} nAItive. All rights reserved.
                      </p>
                      <p style="color: #888888; font-size: 12px; margin: 0;">
                        <a href="${appUrl}/settings" style="color: #8B5CF6; text-decoration: underline;">Manage preferences</a>
                        &nbsp;|&nbsp;
                        <a href="${appUrl}/unsubscribe" style="color: #8B5CF6; text-decoration: underline;">Unsubscribe</a>
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    });

    console.log("FLEx alert email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in send-flex-alert:", error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
