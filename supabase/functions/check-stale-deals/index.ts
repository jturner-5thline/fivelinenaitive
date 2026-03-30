import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_STALE_DAYS = 14;

interface StaleAlertConfig {
  enabled: boolean;
  threshold_days: number;
  notify_managers: boolean;
  notify_admins: boolean;
  excluded_stages: string[];
}

const DEFAULT_CONFIG: StaleAlertConfig = {
  enabled: true,
  threshold_days: DEFAULT_STALE_DAYS,
  notify_managers: true,
  notify_admins: true,
  excluded_stages: ['archived', 'on_hold', 'closed_lost', 'in_development'],
};

function formatValue(value: number | null): string {
  if (!value) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function buildEmailHtml(
  recipientName: string,
  staleDeals: any[],
  thresholdDays: number,
  isAdmin: boolean
): string {
  const now = new Date();

  const dealCards = staleDeals.slice(0, 10).map(deal => {
    const updatedAt = new Date(deal.updated_at);
    const daysSinceUpdate = Math.floor((now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24));
    const urgencyColor = daysSinceUpdate >= thresholdDays * 2 ? '#dc2626' : daysSinceUpdate >= thresholdDays * 1.5 ? '#ea580c' : '#f59e0b';

    const detailRows: string[] = [];
    if (deal.value) detailRows.push(`<td style="padding: 4px 0; color: #374151; font-size: 13px;"><strong style="color: #6b7280;">Value:</strong> ${formatValue(deal.value)}</td>`);
    if (deal.deal_type) detailRows.push(`<td style="padding: 4px 0; color: #374151; font-size: 13px;"><strong style="color: #6b7280;">Type:</strong> ${deal.deal_type}</td>`);
    if (deal.manager) detailRows.push(`<td style="padding: 4px 0; color: #374151; font-size: 13px;"><strong style="color: #6b7280;">Manager:</strong> ${deal.manager}</td>`);
    if (deal.deal_owner) detailRows.push(`<td style="padding: 4px 0; color: #374151; font-size: 13px;"><strong style="color: #6b7280;">Owner:</strong> ${deal.deal_owner}</td>`);
    if (deal.closing_date) detailRows.push(`<td style="padding: 4px 0; color: #374151; font-size: 13px;"><strong style="color: #6b7280;">Closing:</strong> ${formatDate(deal.closing_date)}</td>`);
    if (deal.contact) detailRows.push(`<td style="padding: 4px 0; color: #374151; font-size: 13px;"><strong style="color: #6b7280;">Contact:</strong> ${deal.contact}</td>`);
    if (deal.engagement_type) detailRows.push(`<td style="padding: 4px 0; color: #374151; font-size: 13px;"><strong style="color: #6b7280;">Engagement:</strong> ${deal.engagement_type}</td>`);

    // Build 2-column detail grid
    let detailGrid = '';
    for (let i = 0; i < detailRows.length; i += 2) {
      detailGrid += `<tr>${detailRows[i]}${detailRows[i + 1] || '<td></td>'}</tr>`;
    }

    const narrativeSnippet = deal.narrative
      ? `<p style="margin: 8px 0 0; font-size: 12px; color: #6b7280; line-height: 1.4; border-top: 1px solid #f3f4f6; padding-top: 8px;">${deal.narrative.substring(0, 120)}${deal.narrative.length > 120 ? '…' : ''}</p>`
      : '';

    return `
      <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 12px; border-left: 4px solid ${urgencyColor};">
        <table style="width: 100%;">
          <tr>
            <td>
              <strong style="font-size: 16px; color: #111827;">${deal.company}</strong>
            </td>
            <td style="text-align: right;">
              <span style="background: ${urgencyColor}15; color: ${urgencyColor}; font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 12px;">
                ${daysSinceUpdate} days inactive
              </span>
            </td>
          </tr>
        </table>
        <div style="margin-top: 4px; margin-bottom: 8px;">
          <span style="display: inline-block; background: #f3f4f6; color: #374151; font-size: 12px; padding: 2px 8px; border-radius: 4px; margin-right: 6px;">${deal.stage}</span>
          <span style="display: inline-block; background: #f0fdf4; color: #166534; font-size: 12px; padding: 2px 8px; border-radius: 4px;">${deal.status}</span>
        </div>
        ${detailGrid ? `<table style="width: 100%; border-collapse: collapse;">${detailGrid}</table>` : ''}
        ${narrativeSnippet}
        <div style="margin-top: 10px;">
          <a href="https://fivelinenaitive.lovable.app/deals/${deal.id}" style="color: #7c3aed; font-size: 13px; font-weight: 500; text-decoration: none;">View Deal →</a>
        </div>
      </div>`;
  }).join('');

  const subtitle = isAdmin
    ? `the following company deals haven't been updated in ${thresholdDays}+ days`
    : `the following deals assigned to you haven't been updated in ${thresholdDays}+ days`;

  // Summary stats
  const totalValue = staleDeals.reduce((sum, d) => sum + (d.value || 0), 0);
  const avgDays = Math.round(staleDeals.reduce((sum, d) => {
    return sum + Math.floor((now.getTime() - new Date(d.updated_at).getTime()) / (1000 * 60 * 60 * 24));
  }, 0) / staleDeals.length);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px; background-color: #f5f5f5;">
      <div style="max-width: 640px; margin: 0 auto; background: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 8px;">Deals Need Attention</h1>
        <p style="color: #666; font-size: 16px; margin-bottom: 20px;">
          Hi ${recipientName || 'there'}, ${subtitle}:
        </p>

        <!-- Summary Bar -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; background: #faf5ff; border-radius: 8px;">
          <tr>
            <td style="padding: 16px; text-align: center; border-right: 1px solid #e9d5ff;">
              <div style="font-size: 24px; font-weight: 700; color: #7c3aed;">${staleDeals.length}</div>
              <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Stale Deals</div>
            </td>
            <td style="padding: 16px; text-align: center; border-right: 1px solid #e9d5ff;">
              <div style="font-size: 24px; font-weight: 700; color: #7c3aed;">${formatValue(totalValue)}</div>
              <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Total Value</div>
            </td>
            <td style="padding: 16px; text-align: center;">
              <div style="font-size: 24px; font-weight: 700; color: #dc2626;">${avgDays}d</div>
              <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Avg Inactive</div>
            </td>
          </tr>
        </table>

        ${dealCards}

        ${staleDeals.length > 10 ? `<p style="color: #666; font-size: 14px; margin-bottom: 24px;">...and ${staleDeals.length - 10} more deals needing attention</p>` : ''}

        <div style="text-align: center; margin-top: 24px;">
          <a href="https://fivelinenaitive.lovable.app/deals" style="display: inline-block; background: linear-gradient(135deg, #8B5CF6 0%, #D946EF 100%); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600;">
            Review All Deals
          </a>
        </div>

        <p style="color: #999; font-size: 14px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 24px;">
          You can configure stale deal alerts in Settings &gt; Automation.
        </p>
      </div>
    </body>
    </html>
  `;
}

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

    // Get all companies with their stale alert config
    const { data: companySettings, error: settingsError } = await supabaseAdmin
      .from('company_settings')
      .select('company_id, stale_alert_config');

    if (settingsError) throw settingsError;

    const results: any[] = [];
    const now = new Date();

    for (const settings of companySettings || []) {
      const config: StaleAlertConfig = {
        ...DEFAULT_CONFIG,
        ...(settings.stale_alert_config as StaleAlertConfig || {}),
      };

      if (!config.enabled) {
        console.log(`Stale alerts disabled for company ${settings.company_id}`);
        continue;
      }

      if (!config.notify_managers && !config.notify_admins) {
        console.log(`No recipients configured for company ${settings.company_id}`);
        continue;
      }

      // Get all active deals for this company
      const { data: deals, error: dealsError } = await supabaseAdmin
        .from('deals')
        .select('id, company, stage, value, updated_at, manager, status, deal_type, deal_owner, closing_date, contact, engagement_type, narrative')
        .eq('company_id', settings.company_id)
        .order('updated_at', { ascending: true });

      if (dealsError) {
        console.error(`Error fetching deals for company ${settings.company_id}:`, dealsError);
        continue;
      }

      if (!deals || deals.length === 0) continue;

      // Filter out excluded statuses/stages and find stale deals
      const staleDeals = deals.filter(deal => {
        if (config.excluded_stages.includes(deal.status)) return false;
        if (config.excluded_stages.includes(deal.stage)) return false;
        const updatedAt = new Date(deal.updated_at);
        const daysSinceUpdate = Math.floor((now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24));
        return daysSinceUpdate >= config.threshold_days;
      });

      if (staleDeals.length === 0) continue;

      console.log(`Company ${settings.company_id}: ${staleDeals.length} stale deals found`);

      // Get company members with roles
      const { data: members } = await supabaseAdmin
        .from('company_members')
        .select('user_id, role')
        .eq('company_id', settings.company_id);

      if (!members || members.length === 0) continue;

      // Get profiles for all members to match display_name to deal.manager
      const memberIds = members.map(m => m.user_id);
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('user_id, display_name, email_notifications, notify_stale_alerts')
        .in('user_id', memberIds);

      if (!profiles) continue;

      // Get emails for all members
      const emailMap: Record<string, string> = {};
      for (const member of members) {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(member.user_id);
        if (userData?.user?.email) {
          emailMap[member.user_id] = userData.user.email;
        }
      }

      // Build a lookup: display_name (lowercased) → user_id
      const nameToUserId: Record<string, string> = {};
      for (const p of profiles) {
        if (p.display_name) {
          nameToUserId[p.display_name.toLowerCase()] = p.user_id;
        }
      }

      // Determine who gets what deals
      const recipientDeals: Record<string, { deals: any[]; isAdmin: boolean; name: string }> = {};

      // Admins/owners get ALL stale deals
      if (config.notify_admins) {
        for (const member of members) {
          if (member.role === 'owner' || member.role === 'admin') {
            const profile = profiles.find(p => p.user_id === member.user_id);
            if (!profile || !profile.email_notifications || !profile.notify_stale_alerts) continue;
            if (!emailMap[member.user_id]) continue;

            recipientDeals[member.user_id] = {
              deals: staleDeals,
              isAdmin: true,
              name: profile.display_name || 'there',
            };
          }
        }
      }

      // Managers get only THEIR deals
      if (config.notify_managers) {
        for (const deal of staleDeals) {
          if (!deal.manager) continue;
          const managerId = nameToUserId[deal.manager.toLowerCase()];
          if (!managerId) continue;

          const profile = profiles.find(p => p.user_id === managerId);
          if (!profile || !profile.email_notifications || !profile.notify_stale_alerts) continue;
          if (!emailMap[managerId]) continue;

          // Skip if already an admin recipient (they already see all deals)
          if (recipientDeals[managerId]?.isAdmin) continue;

          if (!recipientDeals[managerId]) {
            recipientDeals[managerId] = {
              deals: [],
              isAdmin: false,
              name: profile.display_name || 'there',
            };
          }
          recipientDeals[managerId].deals.push(deal);
        }
      }

      // Analysts get only deals they're tagged on
      for (const deal of staleDeals) {
        if (!deal.analyst) continue;
        const analystId = nameToUserId[deal.analyst.toLowerCase()];
        if (!analystId) continue;

        const profile = profiles.find(p => p.user_id === analystId);
        if (!profile || !profile.email_notifications || !profile.notify_stale_alerts) continue;
        if (!emailMap[analystId]) continue;

        // Skip if already an admin recipient (they already see all deals)
        if (recipientDeals[analystId]?.isAdmin) continue;

        if (!recipientDeals[analystId]) {
          recipientDeals[analystId] = {
            deals: [],
            isAdmin: false,
            name: profile.display_name || 'there',
          };
        }
        // Avoid duplicate deal entries if analyst is also the manager
        if (!recipientDeals[analystId].deals.some((d: any) => d.id === deal.id)) {
          recipientDeals[analystId].deals.push(deal);
        }
      }

      // Send emails
      for (const [userId, recipient] of Object.entries(recipientDeals)) {
        if (recipient.deals.length === 0) continue;
        const email = emailMap[userId];
        if (!email) continue;

        try {
          const emailHtml = buildEmailHtml(
            recipient.name,
            recipient.deals,
            config.threshold_days,
            recipient.isAdmin
          );

          await resend.emails.send({
            from: "naitive <noreply@updates.naitive.co>",
            to: [email],
            subject: `naitive: ${recipient.deals.length} Deal${recipient.deals.length !== 1 ? 's' : ''} Need Attention`,
            html: emailHtml,
          });

          results.push({ user_id: userId, company_id: settings.company_id, deal_count: recipient.deals.length, is_admin: recipient.isAdmin, success: true });
          console.log(`Stale deal alert sent to ${email} (${recipient.isAdmin ? 'admin' : 'manager'}, ${recipient.deals.length} deals)`);
        } catch (sendError: any) {
          console.error(`Error sending to ${email}:`, sendError);
          results.push({ user_id: userId, success: false, error: sendError.message });
        }
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
