import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationPayload {
  type: 'deal_created' | 'deal_updated' | 'stage_changed' | 'lender_added' | 'lender_updated' | 'milestone_added' | 'milestone_completed' | 'milestone_missed';
  user_id: string;
  deal_id?: string;
  deal_name?: string;
  lender_name?: string;
  milestone_title?: string;
  old_value?: string;
  new_value?: string;
  metadata?: Record<string, any>;
}

const notificationTemplates: Record<string, { subject: string; getMessage: (data: NotificationPayload) => string }> = {
  deal_created: {
    subject: 'New Deal Created',
    getMessage: (data) => `A new deal "${data.deal_name}" has been created.`,
  },
  deal_updated: {
    subject: 'Deal Updated',
    getMessage: (data) => `Deal "${data.deal_name}" has been updated.`,
  },
  stage_changed: {
    subject: 'Deal Stage Changed',
    getMessage: (data) => `Deal "${data.deal_name}" stage changed from "${data.old_value}" to "${data.new_value}".`,
  },
  lender_added: {
    subject: 'New Lender Added',
    getMessage: (data) => `Lender "${data.lender_name}" has been added to deal "${data.deal_name}".`,
  },
  lender_updated: {
    subject: 'Lender Updated',
    getMessage: (data) => `Lender "${data.lender_name}" on deal "${data.deal_name}" has been updated.`,
  },
  milestone_added: {
    subject: 'New Milestone Added',
    getMessage: (data) => `Milestone "${data.milestone_title}" has been added to deal "${data.deal_name}".`,
  },
  milestone_completed: {
    subject: 'Milestone Completed',
    getMessage: (data) => `Milestone "${data.milestone_title}" on deal "${data.deal_name}" has been completed.`,
  },
  milestone_missed: {
    subject: 'Milestone Missed',
    getMessage: (data) => `Milestone "${data.milestone_title}" on deal "${data.deal_name}" is past its due date.`,
  },
};

const preferenceMap: Record<string, string> = {
  deal_created: 'notify_activity_deal_created',
  deal_updated: 'deal_updates_email',
  stage_changed: 'notify_activity_stage_changed',
  lender_added: 'notify_activity_lender_added',
  lender_updated: 'notify_activity_lender_updated',
  milestone_added: 'notify_activity_milestone_added',
  milestone_completed: 'notify_activity_milestone_completed',
  milestone_missed: 'notify_activity_milestone_missed',
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

    const payload: NotificationPayload = await req.json();
    console.log("Processing notification:", payload);

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

    // Check if email notifications are enabled globally and for this type
    const preferenceKey = preferenceMap[payload.type];
    const profileData = profile as Record<string, any>;
    if (!profileData.email_notifications || (preferenceKey && !profileData[preferenceKey])) {
      console.log("Notifications disabled for this type:", payload.type);
      return new Response(JSON.stringify({ skipped: true, reason: "notifications_disabled" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const template = notificationTemplates[payload.type];
    if (!template) {
      console.log("Unknown notification type:", payload.type);
      return new Response(JSON.stringify({ error: "Unknown notification type" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const message = template.getMessage(payload);
    const dealUrl = payload.deal_id ? `${Deno.env.get("SUPABASE_URL")?.replace('.supabase.co', '.lovable.app')}/deal/${payload.deal_id}` : null;

    const emailResponse = await resend.emails.send({
      from: "nAItive <updates@naitive.co>",
      to: [userData.user.email],
      subject: `nAItive: ${template.subject}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px; background-color: #f5f5f5;">
          <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 24px;">${template.subject}</h1>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">${message}</p>
            ${dealUrl ? `
              <a href="${dealUrl}" style="display: inline-block; background: linear-gradient(135deg, #8B5CF6 0%, #D946EF 100%); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; margin: 24px 0;">
                View Deal
              </a>
            ` : ''}
            <p style="color: #999; font-size: 14px; margin-top: 32px;">
              You can manage your notification preferences in your account settings.
            </p>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-notification-email:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
