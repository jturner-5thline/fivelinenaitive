import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// FLEx activity types and their weights for scoring
const FLEX_ACTIVITY_TYPES = [
  'flex_deal_view',
  'flex_dataroom_access',
  'flex_info_request',
  'flex_term_sheet_request',
  'flex_nda_request',
  'flex_document_download',
  'flex_interest_expressed',
  'flex_meeting_scheduled',
  'flex_follow_up',
];

const SCORE_WEIGHTS: Record<string, number> = {
  'flex_deal_view': 1,
  'flex_dataroom_access': 3,
  'flex_info_request': 5,
  'flex_document_download': 2,
  'flex_interest_expressed': 8,
  'flex_term_sheet_request': 15,
  'flex_nda_request': 10,
  'flex_meeting_scheduled': 12,
  'flex_follow_up': 4,
};

interface DealSummary {
  deal_id: string;
  deal_name: string;
  total_views: number;
  unique_lenders: number;
  info_requests: number;
  term_sheet_requests: number;
  nda_requests: number;
  document_downloads: number;
  engagement_score: number;
  engagement_level: 'hot' | 'warm' | 'cold' | 'none';
  top_lenders: Array<{ name: string; score: number }>;
}

function calculateEngagementLevel(score: number): 'hot' | 'warm' | 'cold' | 'none' {
  if (score >= 30) return 'hot';
  if (score >= 15) return 'warm';
  if (score >= 5) return 'cold';
  return 'none';
}

function getEngagementEmoji(level: string): string {
  switch (level) {
    case 'hot': return '🔥';
    case 'warm': return '🌡️';
    case 'cold': return '❄️';
    default: return '⚪';
  }
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate cron secret for scheduled invocations
    const authHeader = req.headers.get("Authorization");
    const cronSecret = Deno.env.get("CRON_SECRET");
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.log("Unauthorized request - invalid cron secret");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log("Starting FLEx weekly summary email job...");

    // Get date range for last 7 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    // Get all users with weekly summary enabled
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('user_id, email, first_name, display_name, weekly_summary_email, email_notifications')
      .eq('weekly_summary_email', true)
      .eq('email_notifications', true);

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      throw profilesError;
    }

    console.log(`Found ${profiles?.length || 0} users with weekly summary enabled`);

    const results: Array<{ user_id: string; success: boolean; error?: string }> = [];

    for (const profile of profiles || []) {
      try {
        // Get user's email from auth
        const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(profile.user_id);
        
        if (userError || !userData.user?.email) {
          console.log(`Skipping user ${profile.user_id} - no email found`);
          results.push({ user_id: profile.user_id, success: false, error: "No email found" });
          continue;
        }

        const userEmail = userData.user.email;
        const userName = profile.first_name || profile.display_name || 'there';

        // Get user's deals
        const { data: deals, error: dealsError } = await supabaseAdmin
          .from('deals')
          .select('id, company')
          .eq('user_id', profile.user_id)
          .neq('status', 'archived');

        if (dealsError) {
          console.error(`Error fetching deals for user ${profile.user_id}:`, dealsError);
          results.push({ user_id: profile.user_id, success: false, error: dealsError.message });
          continue;
        }

        if (!deals || deals.length === 0) {
          console.log(`User ${profile.user_id} has no active deals`);
          results.push({ user_id: profile.user_id, success: true, error: "No active deals" });
          continue;
        }

        const dealIds = deals.map(d => d.id);

        // Get FLEx activity for user's deals in the last 7 days
        const { data: activities, error: activitiesError } = await supabaseAdmin
          .from('activity_logs')
          .select('*')
          .in('deal_id', dealIds)
          .in('activity_type', FLEX_ACTIVITY_TYPES)
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString())
          .order('created_at', { ascending: false });

        if (activitiesError) {
          console.error(`Error fetching activities for user ${profile.user_id}:`, activitiesError);
          results.push({ user_id: profile.user_id, success: false, error: activitiesError.message });
          continue;
        }

        // If no FLEx activity, skip this user
        if (!activities || activities.length === 0) {
          console.log(`User ${profile.user_id} has no FLEx activity this week`);
          results.push({ user_id: profile.user_id, success: true, error: "No FLEx activity" });
          continue;
        }

        // Aggregate activity by deal
        const dealSummaries: Map<string, DealSummary> = new Map();
        const lenderScores: Map<string, Map<string, number>> = new Map(); // deal_id -> lender_name -> score

        for (const activity of activities) {
          const dealId = activity.deal_id;
          const deal = deals.find(d => d.id === dealId);
          if (!deal) continue;

          // Initialize deal summary if not exists
          if (!dealSummaries.has(dealId)) {
            dealSummaries.set(dealId, {
              deal_id: dealId,
              deal_name: deal.company,
              total_views: 0,
              unique_lenders: 0,
              info_requests: 0,
              term_sheet_requests: 0,
              nda_requests: 0,
              document_downloads: 0,
              engagement_score: 0,
              engagement_level: 'none',
              top_lenders: [],
            });
            lenderScores.set(dealId, new Map());
          }

          const summary = dealSummaries.get(dealId)!;
          const dealLenderScores = lenderScores.get(dealId)!;
          
          // Extract lender name from metadata
          const metadata = activity.metadata as Record<string, any> | null;
          const lenderName = metadata?.lender_name || metadata?.lender || 'Unknown Lender';
          
          // Update counts based on activity type
          const weight = SCORE_WEIGHTS[activity.activity_type] || 1;
          summary.engagement_score += weight;

          // Track lender scores
          const currentLenderScore = dealLenderScores.get(lenderName) || 0;
          dealLenderScores.set(lenderName, currentLenderScore + weight);

          switch (activity.activity_type) {
            case 'flex_deal_view':
              summary.total_views++;
              break;
            case 'flex_info_request':
              summary.info_requests++;
              break;
            case 'flex_term_sheet_request':
              summary.term_sheet_requests++;
              break;
            case 'flex_nda_request':
              summary.nda_requests++;
              break;
            case 'flex_document_download':
              summary.document_downloads++;
              break;
          }
        }

        // Calculate unique lenders and top lenders for each deal
        for (const [dealId, summary] of dealSummaries) {
          const dealLenderScores = lenderScores.get(dealId)!;
          summary.unique_lenders = dealLenderScores.size;
          summary.engagement_level = calculateEngagementLevel(summary.engagement_score);
          
          // Get top 3 lenders by score
          summary.top_lenders = Array.from(dealLenderScores.entries())
            .map(([name, score]) => ({ name, score }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);
        }

        // Sort deals by engagement score
        const sortedDeals = Array.from(dealSummaries.values())
          .sort((a, b) => b.engagement_score - a.engagement_score);

        // Calculate totals
        const totalViews = sortedDeals.reduce((sum, d) => sum + d.total_views, 0);
        const totalUniqueLenders = new Set(
          activities
            .map(a => (a.metadata as Record<string, any>)?.lender_name || (a.metadata as Record<string, any>)?.lender)
            .filter(Boolean)
        ).size;
        const totalInfoRequests = sortedDeals.reduce((sum, d) => sum + d.info_requests, 0);
        const totalTermSheetRequests = sortedDeals.reduce((sum, d) => sum + d.term_sheet_requests, 0);
        const totalNdaRequests = sortedDeals.reduce((sum, d) => sum + d.nda_requests, 0);

        // Generate email HTML
        const appUrl = "https://fivelinenaitive.lovable.app";
        
        const dealRowsHtml = sortedDeals.slice(0, 10).map(deal => `
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #eeeeee;">
              <a href="${appUrl}/deals/${deal.deal_id}?tab=deal-management#flex-engagement-section" style="color: #8B5CF6; text-decoration: none; font-weight: 500;">${deal.deal_name}</a>
            </td>
            <td style="padding: 12px 16px; border-bottom: 1px solid #eeeeee; text-align: center;">
              ${getEngagementEmoji(deal.engagement_level)} ${deal.engagement_level.charAt(0).toUpperCase() + deal.engagement_level.slice(1)}
            </td>
            <td style="padding: 12px 16px; border-bottom: 1px solid #eeeeee; text-align: center;">${formatNumber(deal.unique_lenders)}</td>
            <td style="padding: 12px 16px; border-bottom: 1px solid #eeeeee; text-align: center;">${formatNumber(deal.total_views)}</td>
            <td style="padding: 12px 16px; border-bottom: 1px solid #eeeeee; text-align: center;">
              ${deal.term_sheet_requests > 0 ? `<span style="color: #22c55e; font-weight: 600;">${deal.term_sheet_requests} TSR</span>` : '-'}
              ${deal.nda_requests > 0 ? `<span style="color: #3b82f6; font-weight: 600; margin-left: 8px;">${deal.nda_requests} NDA</span>` : ''}
            </td>
          </tr>
        `).join('');

        const emailHtml = `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta name="color-scheme" content="light">
            <meta name="supported-color-schemes" content="light">
            <title>Weekly FLEx Engagement Summary</title>
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
            <div style="display: none; max-height: 0; overflow: hidden;">
              Your deals received ${totalViews} views from ${totalUniqueLenders} lenders this week
              &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
            </div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f5f5f5;">
              <tr>
                <td align="center" style="padding: 40px 20px;">
                  <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; background: #ffffff; border-radius: 8px;">
                    <!-- Header -->
                    <tr>
                      <td style="padding: 40px 40px 24px 40px;">
                        <h1 style="color: #1a1a1a; font-size: 24px; font-weight: 600; margin: 0 0 8px 0; line-height: 1.3;">
                          🔥 Weekly FLEx Engagement Summary
                        </h1>
                        <p style="color: #666666; font-size: 14px; margin: 0;">
                          ${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </td>
                    </tr>
                    
                    <!-- Greeting -->
                    <tr>
                      <td style="padding: 0 40px 24px 40px;">
                        <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0;">
                          Hi ${userName},<br><br>
                          Here's a summary of lender engagement on your deals via FLEx this week.
                        </p>
                      </td>
                    </tr>
                    
                    <!-- Summary Stats -->
                    <tr>
                      <td style="padding: 0 40px 24px 40px;">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background: linear-gradient(135deg, #8B5CF6 0%, #D946EF 100%); border-radius: 8px;">
                          <tr>
                            <td style="padding: 24px; text-align: center;">
                              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                  <td style="text-align: center; width: 25%;">
                                    <p style="color: rgba(255,255,255,0.8); font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase;">Views</p>
                                    <p style="color: #ffffff; font-size: 28px; font-weight: 700; margin: 0;">${formatNumber(totalViews)}</p>
                                  </td>
                                  <td style="text-align: center; width: 25%;">
                                    <p style="color: rgba(255,255,255,0.8); font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase;">Lenders</p>
                                    <p style="color: #ffffff; font-size: 28px; font-weight: 700; margin: 0;">${formatNumber(totalUniqueLenders)}</p>
                                  </td>
                                  <td style="text-align: center; width: 25%;">
                                    <p style="color: rgba(255,255,255,0.8); font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase;">Term Sheets</p>
                                    <p style="color: #ffffff; font-size: 28px; font-weight: 700; margin: 0;">${formatNumber(totalTermSheetRequests)}</p>
                                  </td>
                                  <td style="text-align: center; width: 25%;">
                                    <p style="color: rgba(255,255,255,0.8); font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase;">NDAs</p>
                                    <p style="color: #ffffff; font-size: 28px; font-weight: 700; margin: 0;">${formatNumber(totalNdaRequests)}</p>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    
                    <!-- Deal Breakdown -->
                    <tr>
                      <td style="padding: 0 40px 24px 40px;">
                        <h2 style="color: #1a1a1a; font-size: 18px; font-weight: 600; margin: 0 0 16px 0;">Deal Breakdown</h2>
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border: 1px solid #eeeeee; border-radius: 8px; overflow: hidden;">
                          <tr style="background-color: #f9fafb;">
                            <th style="padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase;">Deal</th>
                            <th style="padding: 12px 16px; text-align: center; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase;">Status</th>
                            <th style="padding: 12px 16px; text-align: center; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase;">Lenders</th>
                            <th style="padding: 12px 16px; text-align: center; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase;">Views</th>
                            <th style="padding: 12px 16px; text-align: center; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase;">Requests</th>
                          </tr>
                          ${dealRowsHtml}
                        </table>
                      </td>
                    </tr>
                    
                    <!-- CTA Button -->
                    <tr>
                      <td style="padding: 0 40px 32px 40px; text-align: center;">
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                          <tr>
                            <td style="border-radius: 8px; background: linear-gradient(135deg, #8B5CF6 0%, #D946EF 100%);">
                              <a href="${appUrl}/deals" target="_blank" style="display: inline-block; padding: 14px 28px; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none;">View All Deals</a>
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
        `;

        const plainText = `
Weekly FLEx Engagement Summary
${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}

Hi ${userName},

Here's a summary of lender engagement on your deals via FLEx this week.

SUMMARY
- Total Views: ${totalViews}
- Unique Lenders: ${totalUniqueLenders}
- Term Sheet Requests: ${totalTermSheetRequests}
- NDA Requests: ${totalNdaRequests}

DEAL BREAKDOWN
${sortedDeals.slice(0, 10).map(deal => 
  `- ${deal.deal_name}: ${deal.engagement_level} engagement, ${deal.unique_lenders} lenders, ${deal.total_views} views`
).join('\n')}

View all deals: ${appUrl}/deals

---
nAItive - Manage preferences: ${appUrl}/settings | Unsubscribe: ${appUrl}/unsubscribe
        `;

        // Send email
        const emailResponse = await resend.emails.send({
          from: "nAItive <noreply@updates.naitive.co>",
          reply_to: "support@naitive.co",
          to: [userEmail],
          subject: `🔥 Weekly FLEx Summary: ${totalViews} views from ${totalUniqueLenders} lenders`,
          headers: {
            "List-Unsubscribe": `<${appUrl}/unsubscribe>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
          text: plainText,
          html: emailHtml,
        });

        console.log(`Email sent successfully to ${userEmail}:`, emailResponse);
        results.push({ user_id: profile.user_id, success: true });

      } catch (userError: any) {
        console.error(`Error processing user ${profile.user_id}:`, userError);
        results.push({ user_id: profile.user_id, success: false, error: userError.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`FLEx weekly summary complete. Success: ${successCount}, Failed: ${failCount}`);

    return new Response(JSON.stringify({ 
      success: true, 
      processed: results.length,
      successful: successCount,
      failed: failCount,
      results 
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error: any) {
    console.error("Error in send-flex-weekly-summary:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
