import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_STALE_DAYS = 14;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log("Starting stale deal alerts check...");

    // Get all users with stale alerts enabled
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('user_id, display_name, notify_stale_alerts, email_notifications')
      .eq('email_notifications', true)
      .eq('notify_stale_alerts', true);

    if (profilesError) {
      throw profilesError;
    }

    console.log(`Found ${profiles?.length || 0} users with stale alerts enabled`);

    const results = [];
    const now = new Date();

    for (const profile of profiles || []) {
      try {
        // Get user email
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(profile.user_id);
        if (!userData.user?.email) continue;

        // Get active deals for this user that haven't been updated
        const { data: deals, error: dealsError } = await supabaseAdmin
          .from('deals')
          .select('id, company, stage, value, updated_at')
          .eq('user_id', profile.user_id)
          .neq('status', 'archived')
          .order('updated_at', { ascending: true });

        if (dealsError) {
          console.error(`Error fetching deals for user ${profile.user_id}:`, dealsError);
          continue;
        }

        if (!deals || deals.length === 0) continue;

        // Filter stale deals (using default of 14 days, could be made configurable per user)
        const staleDeals = deals.filter(deal => {
          const updatedAt = new Date(deal.updated_at);
          const daysSinceUpdate = Math.floor((now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24));
          return daysSinceUpdate >= DEFAULT_STALE_DAYS;
        });

        if (staleDeals.length === 0) continue;

        console.log(`User ${profile.user_id} has ${staleDeals.length} stale deals`);

        // Build email content
        const dealsList = staleDeals.slice(0, 10).map(deal => {
          const updatedAt = new Date(deal.updated_at);
          const daysSinceUpdate = Math.floor((now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24));
          return `<tr>
            <td style="padding: 12px; border-bottom: 1px solid #eee;">
              <strong>${deal.company}</strong><br>
              <span style="color: #666; font-size: 14px;">${deal.stage}</span>
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; color: #dc2626;">
              ${daysSinceUpdate} days ago
            </td>
          </tr>`;
        }).join('');

        const emailResponse = await resend.emails.send({
          from: "nAItive <onboarding@resend.dev>",
          to: [userData.user.email],
          subject: `nAItive: ${staleDeals.length} Deal${staleDeals.length !== 1 ? 's' : ''} Need Attention`,
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px; background-color: #f5f5f5;">
              <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 8px;">Stale Deals Alert</h1>
                <p style="color: #666; font-size: 16px; margin-bottom: 24px;">
                  Hi ${profile.display_name || 'there'}, the following deals haven't been updated in ${DEFAULT_STALE_DAYS}+ days:
                </p>
                
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                  <thead>
                    <tr style="background: #f5f5f5;">
                      <th style="padding: 12px; text-align: left; font-weight: 600;">Deal</th>
                      <th style="padding: 12px; text-align: right; font-weight: 600;">Last Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${dealsList}
                  </tbody>
                </table>

                ${staleDeals.length > 10 ? `<p style="color: #666; font-size: 14px; margin-bottom: 24px;">...and ${staleDeals.length - 10} more deals</p>` : ''}

                <a href="https://lovable.dev/deals" style="display: inline-block; background: linear-gradient(135deg, #8B5CF6 0%, #D946EF 100%); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600;">
                  Review Deals
                </a>

                <p style="color: #999; font-size: 14px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 24px;">
                  You can disable stale deal alerts in your notification preferences.
                </p>
              </div>
            </body>
            </html>
          `,
        });

        results.push({ user_id: profile.user_id, stale_count: staleDeals.length, success: true });
        console.log(`Stale deal alert sent to ${userData.user.email}`);
      } catch (userError: any) {
        console.error(`Error processing user ${profile.user_id}:`, userError);
        results.push({ user_id: profile.user_id, success: false, error: userError.message });
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in check-stale-deals:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
