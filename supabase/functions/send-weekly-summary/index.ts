import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate CRON_SECRET for scheduled function authentication
  const authHeader = req.headers.get('Authorization');
  const expectedSecret = Deno.env.get('CRON_SECRET');
  if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
    console.error('Unauthorized request - invalid or missing CRON_SECRET');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get all users who have weekly summary enabled
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('user_id, display_name')
      .eq('email_notifications', true)
      .eq('weekly_summary_email', true);

    if (profilesError) {
      throw profilesError;
    }

    console.log(`Processing weekly summary for ${profiles?.length || 0} users`);

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const results = [];

    for (const profile of profiles || []) {
      try {
        // Get user email
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(profile.user_id);
        if (!userData.user?.email) continue;

        // Get deals for this user
        const { data: deals } = await supabaseAdmin
          .from('deals')
          .select('id, company, stage, value, created_at, updated_at')
          .eq('user_id', profile.user_id);

        if (!deals || deals.length === 0) continue;

        const dealIds = deals.map(d => d.id);

        // Get activity logs from the past week
        const { data: activities } = await supabaseAdmin
          .from('activity_logs')
          .select('activity_type, description, created_at')
          .in('deal_id', dealIds)
          .gte('created_at', oneWeekAgo.toISOString())
          .order('created_at', { ascending: false });

        // Get milestones coming up in the next week
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        
        const { data: upcomingMilestones } = await supabaseAdmin
          .from('deal_milestones')
          .select('title, due_date, deals(company)')
          .in('deal_id', dealIds)
          .eq('completed', false)
          .gte('due_date', new Date().toISOString())
          .lte('due_date', nextWeek.toISOString())
          .order('due_date', { ascending: true });

        // Get new deals from the past week
        const newDeals = deals.filter(d => new Date(d.created_at) >= oneWeekAgo);

        // Summary stats
        const totalDeals = deals.length;
        const totalActivities = activities?.length || 0;
        const upcomingCount = upcomingMilestones?.length || 0;

        // Build email content
        let activitiesHtml = '';
        if (activities && activities.length > 0) {
          const recentActivities = activities.slice(0, 10);
          activitiesHtml = `
            <h2 style="color: #1a1a1a; font-size: 18px; margin-top: 32px;">Recent Activity</h2>
            <ul style="color: #666; padding-left: 20px;">
              ${recentActivities.map(a => `<li style="margin-bottom: 8px;">${a.description}</li>`).join('')}
            </ul>
          `;
        }

        let milestonesHtml = '';
        if (upcomingMilestones && upcomingMilestones.length > 0) {
          milestonesHtml = `
            <h2 style="color: #1a1a1a; font-size: 18px; margin-top: 32px;">Upcoming Milestones</h2>
            <ul style="color: #666; padding-left: 20px;">
              ${upcomingMilestones.map(m => {
                const dueDate = new Date(m.due_date).toLocaleDateString();
                const dealName = (m.deals as any)?.company || 'Unknown Deal';
                return `<li style="margin-bottom: 8px;"><strong>${m.title}</strong> - ${dealName} (Due: ${dueDate})</li>`;
              }).join('')}
            </ul>
          `;
        }

        const emailResponse = await resend.emails.send({
          from: "nAItive <noreply@updates.naitive.co>",
          reply_to: "support@naitive.co",
          to: [userData.user.email],
          subject: "nAItive: Your Weekly Summary",
          headers: {
            "List-Unsubscribe": "<https://naitive.co/unsubscribe>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
          text: `Weekly Summary\n\nHi ${profile.display_name || 'there'}, here's what happened this week.\n\nActive Deals: ${totalDeals}\nActivities This Week: ${totalActivities}\nUpcoming Milestones: ${upcomingCount}\n\nView Dashboard: https://naitive.co/deals\n\n---\nnAItive - Manage preferences: https://naitive.co/settings | Unsubscribe: https://naitive.co/unsubscribe`,
          html: `
            <!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <meta name="color-scheme" content="light">
              <meta name="supported-color-schemes" content="light">
              <title>Your Weekly Summary</title>
            </head>
            <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
              <!-- Preheader text -->
              <div style="display: none; max-height: 0; overflow: hidden;">
                ${totalDeals} active deals, ${totalActivities} activities this week, ${upcomingCount} upcoming milestones.
                &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
              </div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f5f5f5;">
                <tr>
                  <td align="center" style="padding: 40px 20px;">
                    <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; background: #ffffff; border-radius: 8px;">
                      <tr>
                        <td style="padding: 40px;">
                          <h1 style="color: #1a1a1a; font-size: 24px; font-weight: 600; margin: 0 0 8px 0;">Weekly Summary</h1>
                          <p style="color: #888888; font-size: 14px; margin: 0 0 32px 0;">Hi ${profile.display_name || 'there'}, here's what happened this week.</p>
                          
                          <!-- Stats Grid -->
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 24px;">
                            <tr>
                              <td width="33%" style="padding: 0 8px 0 0;">
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background: linear-gradient(135deg, #8B5CF6 0%, #D946EF 100%); border-radius: 8px;">
                                  <tr>
                                    <td style="padding: 20px; text-align: center;">
                                      <div style="font-size: 28px; font-weight: bold; color: #ffffff;">${totalDeals}</div>
                                      <div style="font-size: 12px; color: rgba(255,255,255,0.9);">Active Deals</div>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                              <td width="33%" style="padding: 0 4px;">
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background: #f5f5f5; border-radius: 8px;">
                                  <tr>
                                    <td style="padding: 20px; text-align: center;">
                                      <div style="font-size: 28px; font-weight: bold; color: #1a1a1a;">${totalActivities}</div>
                                      <div style="font-size: 12px; color: #666666;">Activities</div>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                              <td width="33%" style="padding: 0 0 0 8px;">
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background: #f5f5f5; border-radius: 8px;">
                                  <tr>
                                    <td style="padding: 20px; text-align: center;">
                                      <div style="font-size: 28px; font-weight: bold; color: #1a1a1a;">${upcomingCount}</div>
                                      <div style="font-size: 12px; color: #666666;">Milestones</div>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>

                          ${newDeals.length > 0 ? `
                            <h2 style="color: #1a1a1a; font-size: 18px; font-weight: 600; margin: 32px 0 16px 0;">New Deals</h2>
                            <ul style="color: #4a4a4a; padding-left: 20px; margin: 0;">
                              ${newDeals.map(d => `<li style="margin-bottom: 8px; line-height: 1.5;"><strong>${d.company}</strong> - ${d.stage}</li>`).join('')}
                            </ul>
                          ` : ''}

                          ${activitiesHtml}
                          ${milestonesHtml}

                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top: 32px;">
                            <tr>
                              <td style="border-radius: 8px; background: linear-gradient(135deg, #8B5CF6 0%, #D946EF 100%);">
                                <a href="https://naitive.co/deals" target="_blank" style="display: inline-block; padding: 14px 28px; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none;">View Dashboard</a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 24px 40px; border-top: 1px solid #eeeeee; text-align: center;">
                          <p style="color: #888888; font-size: 12px; margin: 0 0 8px 0;">
                            © ${new Date().getFullYear()} nAItive. All rights reserved.
                          </p>
                          <p style="color: #888888; font-size: 12px; margin: 0;">
                            <a href="https://naitive.co/settings" style="color: #8B5CF6; text-decoration: underline;">Manage preferences</a>
                            &nbsp;|&nbsp;
                            <a href="https://naitive.co/unsubscribe" style="color: #8B5CF6; text-decoration: underline;">Unsubscribe</a>
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

        results.push({ user_id: profile.user_id, success: true });
        console.log(`Weekly summary sent to ${userData.user.email}`);
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
    console.error("Error in send-weekly-summary:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
