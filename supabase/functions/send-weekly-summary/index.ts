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
          to: [userData.user.email],
          subject: `nAItive: Your Weekly Summary`,
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px; background-color: #f5f5f5;">
              <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 8px;">Weekly Summary</h1>
                <p style="color: #999; font-size: 14px; margin-bottom: 32px;">Hi ${profile.display_name || 'there'}, here's what happened this week.</p>
                
                <div style="display: flex; gap: 16px; margin-bottom: 24px;">
                  <div style="flex: 1; background: linear-gradient(135deg, #8B5CF6 0%, #D946EF 100%); color: white; padding: 20px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 32px; font-weight: bold;">${totalDeals}</div>
                    <div style="font-size: 14px; opacity: 0.9;">Active Deals</div>
                  </div>
                  <div style="flex: 1; background: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 32px; font-weight: bold; color: #1a1a1a;">${totalActivities}</div>
                    <div style="font-size: 14px; color: #666;">Activities This Week</div>
                  </div>
                  <div style="flex: 1; background: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 32px; font-weight: bold; color: #1a1a1a;">${upcomingCount}</div>
                    <div style="font-size: 14px; color: #666;">Upcoming Milestones</div>
                  </div>
                </div>

                ${newDeals.length > 0 ? `
                  <h2 style="color: #1a1a1a; font-size: 18px; margin-top: 32px;">New Deals</h2>
                  <ul style="color: #666; padding-left: 20px;">
                    ${newDeals.map(d => `<li style="margin-bottom: 8px;"><strong>${d.company}</strong> - ${d.stage}</li>`).join('')}
                  </ul>
                ` : ''}

                ${activitiesHtml}
                ${milestonesHtml}

                <a href="https://lovable.dev" style="display: inline-block; background: linear-gradient(135deg, #8B5CF6 0%, #D946EF 100%); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; margin: 32px 0 0 0;">
                  View Dashboard
                </a>

                <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #eee; text-align: center;">
                  <p style="color: #999; font-size: 12px; margin: 0;">
                    © ${new Date().getFullYear()} nAItive. All rights reserved.
                  </p>
                  <p style="color: #999; font-size: 12px; margin: 8px 0 0 0;">
                    <a href="https://naitive.co/settings" style="color: #8B5CF6; text-decoration: underline;">Manage email preferences</a>
                    &nbsp;|&nbsp;
                    <a href="https://naitive.co/unsubscribe" style="color: #8B5CF6; text-decoration: underline;">Unsubscribe</a>
                  </p>
                </div>
              </div>
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
