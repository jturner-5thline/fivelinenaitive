import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { buildFrom } from '../_shared/resendFrom.ts';
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotifyPayload {
  notification_id: string;
  deal_id: string;
  status: "approved" | "denied";
  user_email?: string;
  lender_name?: string;
  company_name?: string;
  denial_message?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Validate JWT
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      console.error("No authorization header provided");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: { headers: { Authorization: authHeader } },
      }
    );

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload: NotifyPayload = await req.json();
    console.log("Processing info request response notification:", payload);

    // Validate required fields
    if (!payload.notification_id || !payload.deal_id || !payload.status) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get admin client for database operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get deal info to verify ownership
    const { data: deal, error: dealError } = await supabaseAdmin
      .from("deals")
      .select("company, user_id")
      .eq("id", payload.deal_id)
      .maybeSingle();

    if (dealError || !deal) {
      console.error("Deal not found:", dealError);
      return new Response(JSON.stringify({ error: "Deal not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user owns this deal or is in the same company
    if (deal.user_id !== user.id) {
      const { data: isSameCompany } = await supabaseAdmin.rpc('is_same_company_as_user', {
        _current_user_id: user.id,
        _deal_owner_id: deal.user_id
      });
      
      if (!isSameCompany) {
        console.error("User not authorized for this deal");
        return new Response(JSON.stringify({ error: "Not authorized" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Get user profile for the response
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name, first_name, email")
      .eq("user_id", user.id)
      .maybeSingle();

    const responderName = profile?.display_name || profile?.first_name || profile?.email || "Team Member";

    // Get the naitive/Flex deal ID from sync history
    const { data: syncHistory, error: syncError } = await supabaseAdmin
      .from("flex_sync_history")
      .select("flex_deal_id")
      .eq("deal_id", payload.deal_id)
      .eq("status", "success")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (syncError) {
      console.error("Error fetching flex_deal_id:", syncError);
    }

    const flexDealId = syncHistory?.flex_deal_id;
    
    if (!flexDealId) {
      console.log("No flex_deal_id found for deal, using internal deal_id");
    }

    // Get Flex info request API key
    const flexInfoRequestApiKey = Deno.env.get("FLEX_INFO_REQUEST_API_KEY");
    const webhookUrl = "https://ndbrliydrlgtxcyfgyok.supabase.co/functions/v1/handle-info-request-response";

    let flexNotified = false;
    let flexResponse = null;

    // Send notification to naitive Flex webhook
    if (flexInfoRequestApiKey && flexDealId) {
      try {
        console.log("Sending info response notification to naitive Flex...", {
          flexDealId,
          status: payload.status,
        });
        
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": flexInfoRequestApiKey,
          },
          body: JSON.stringify({
            event: "info_request_response",
            deal_id: flexDealId,
            response: payload.status,
          }),
        });

        if (response.ok) {
          flexResponse = await response.json();
          flexNotified = true;
          console.log("naitive Flex notified successfully:", flexResponse);
        } else {
          const errorText = await response.text();
          console.error("naitive Flex webhook error:", response.status, errorText);
        }
      } catch (flexError) {
        console.error("Error calling naitive Flex webhook:", flexError);
      }
    } else {
      if (!flexInfoRequestApiKey) {
        console.log("FLEX_INFO_REQUEST_API_KEY not configured, skipping webhook notification");
      }
      if (!flexDealId) {
        console.log("No flex_deal_id found, skipping webhook notification");
      }
    }

    // Log the response as an activity
    const { error: logError } = await supabaseAdmin
      .from("activity_logs")
      .insert({
        deal_id: payload.deal_id,
        activity_type: payload.status === "approved" ? "flex_info_request_approved" : "flex_info_request_denied",
        description: `${responderName} ${payload.status} info request from ${payload.lender_name || payload.user_email || "lender"}`,
        user_id: user.id,
        metadata: {
          source: "naitive",
          notification_id: payload.notification_id,
          status: payload.status,
          lender_name: payload.lender_name,
          user_email: payload.user_email,
          company_name: payload.company_name,
          denial_message: payload.denial_message || null,
          flex_notified: flexNotified,
          flex_response: flexResponse,
          responder_name: responderName,
          responder_email: profile?.email,
        },
      });

    if (logError) {
      console.error("Failed to log activity:", logError);
    }

    // Send denial email to the lender if message provided
    let denialEmailSent = false;
    if (payload.status === "denied" && payload.denial_message && payload.user_email) {
      try {
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        if (resendApiKey) {
          const resend = new Resend(resendApiKey);

          // Get deal company name
          const { data: dealInfo } = await supabaseAdmin
            .from("deals")
            .select("company")
            .eq("id", payload.deal_id)
            .maybeSingle();

          const dealName = dealInfo?.company || "a deal";
          const lenderFirstName = payload.lender_name?.split(" ")[0] || "there";
          const messageHtml = payload.denial_message.replace(/\n/g, "<br>");
          const appUrl = "https://naitive.co";

          await resend.emails.send({
            from: buildFrom("Naitive"),
            reply_to: profile?.email || "support@naitive.co",
            to: [payload.user_email],
            subject: `naitive: Update on your information request for ${dealName}`,
            text: `Hi ${lenderFirstName},\n\n${payload.denial_message}\n\nBest regards,\n${responderName}`,
            html: `
              <!DOCTYPE html>
              <html lang="en">
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Information Request Update</title>
              </head>
              <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f5f5f5;">
                  <tr>
                    <td align="center" style="padding: 40px 20px;">
                      <table role="presentation" width="500" cellspacing="0" cellpadding="0" border="0" style="max-width: 500px; background: #ffffff; border-radius: 8px; overflow: hidden;">
                        <tr>
                          <td style="background: linear-gradient(135deg, #8B5CF6 0%, #D946EF 100%); padding: 24px 40px; text-align: center;">
                            <span style="font-size: 36px;">📋</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 32px 40px;">
                            <h1 style="color: #1a1a1a; font-size: 20px; font-weight: 600; margin: 0 0 16px 0;">Information Request Update</h1>
                            <p style="color: #4a4a4a; font-size: 15px; line-height: 1.7; margin: 0 0 16px 0;">Hi ${lenderFirstName},</p>
                            <div style="background-color: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 24px; border-left: 3px solid #8B5CF6;">
                              <p style="color: #4a4a4a; font-size: 15px; line-height: 1.7; margin: 0;">${messageHtml}</p>
                            </div>
                            <p style="color: #6b7280; font-size: 14px; margin: 0;">Best regards,<br><strong>${responderName}</strong></p>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 24px 40px; border-top: 1px solid #eeeeee; text-align: center;">
                            <p style="color: #888888; font-size: 12px; margin: 0;">&copy; ${new Date().getFullYear()} naitive. All rights reserved.</p>
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

          denialEmailSent = true;
          console.log(`Denial email sent to ${payload.user_email}`);
        } else {
          console.log("RESEND_API_KEY not configured, skipping denial email to lender");
        }
      } catch (emailError) {
        console.error("Failed to send denial email to lender:", emailError);
        // Return error so the client knows the email failed
        return new Response(
          JSON.stringify({ error: "Failed to send denial message to lender" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log("Info request response processed successfully", {
      status: payload.status,
      flexNotified,
      denialEmailSent,
    });

    return new Response(
      JSON.stringify({
        success: true,
        flex_notified: flexNotified,
        message: flexNotified 
          ? `Info request ${payload.status} and Flex notified` 
          : `Info request ${payload.status} (Flex API not configured)`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error processing info response:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
