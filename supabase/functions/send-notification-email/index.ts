import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ChangeDetail {
  field: string;
  old?: string;
  new?: string;
}

interface NotificationPayload {
  type: 'deal_created' | 'deal_updated' | 'stage_changed' | 'lender_added' | 'lender_updated' | 'milestone_added' | 'milestone_completed' | 'milestone_missed' | 'new_suggestions' | 'flex_lender_sync';
  user_id: string;
  deal_id?: string;
  deal_name?: string;
  lender_name?: string;
  milestone_title?: string;
  old_value?: string;
  new_value?: string;
  metadata?: Record<string, unknown>;
  suggestion_count?: number;
  agent_suggestion_count?: number;
  changed_by?: string;
  changes?: ChangeDetail[];
  sync_request_type?: 'new_lender' | 'update_existing' | 'merge_conflict';
  sync_count?: number;
}

// Build a human-readable summary from changes
function buildChangeSummary(data: NotificationPayload): string {
  const lines: string[] = [];
  const actor = data.changed_by || 'Someone';

  // Base message
  switch (data.type) {
    case 'lender_added':
      lines.push(`${actor} added lender "${data.lender_name}" to deal "${data.deal_name}".`);
      break;
    case 'lender_updated':
      lines.push(`${actor} updated lender "${data.lender_name}" on deal "${data.deal_name}".`);
      break;
    case 'deal_created':
      lines.push(`${actor} created a new deal "${data.deal_name}".`);
      break;
    case 'stage_changed':
      lines.push(`${actor} moved deal "${data.deal_name}" from "${data.old_value}" to "${data.new_value}".`);
      break;
    case 'deal_updated':
      lines.push(`${actor} updated deal "${data.deal_name}".`);
      break;
    default:
      return '';
  }

  return lines.join(' ');
}

// Build HTML table for change details
function buildChangesHtml(changes?: ChangeDetail[]): string {
  if (!changes || changes.length === 0) return '';

  let rows = '';
  for (const c of changes) {
    if (c.old && c.new) {
      rows += `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #666; font-weight: 600; font-size: 14px; white-space: nowrap;">${c.field}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #999; font-size: 14px; text-decoration: line-through;">${c.old}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #1a1a1a; font-size: 14px; font-weight: 500;">${c.new}</td>
        </tr>`;
    } else if (c.new) {
      rows += `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #666; font-weight: 600; font-size: 14px; white-space: nowrap;">${c.field}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #999; font-size: 14px;">—</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #1a1a1a; font-size: 14px; font-weight: 500;">${c.new}</td>
        </tr>`;
    }
  }

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 16px 0 24px 0; border: 1px solid #eee; border-radius: 8px; border-collapse: collapse;">
      <thead>
        <tr style="background-color: #f9f9f9;">
          <th style="padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #888; letter-spacing: 0.5px; border-bottom: 1px solid #eee;">Field</th>
          <th style="padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #888; letter-spacing: 0.5px; border-bottom: 1px solid #eee;">Before</th>
          <th style="padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #888; letter-spacing: 0.5px; border-bottom: 1px solid #eee;">After</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>`;
}

// Build plain-text version of changes
function buildChangesText(changes?: ChangeDetail[]): string {
  if (!changes || changes.length === 0) return '';
  let text = '\nWhat changed:\n';
  for (const c of changes) {
    if (c.old && c.new) {
      text += `  • ${c.field}: ${c.old} → ${c.new}\n`;
    } else if (c.new) {
      text += `  • ${c.field}: ${c.new}\n`;
    }
  }
  return text;
}

const notificationTemplates: Record<string, { subject: string; getMessage: (data: NotificationPayload) => string }> = {
  deal_created: {
    subject: 'New Deal Created',
    getMessage: (data) => buildChangeSummary(data) || `A new deal "${data.deal_name}" has been created.`,
  },
  deal_updated: {
    subject: 'Deal Updated',
    getMessage: (data) => buildChangeSummary(data) || `Deal "${data.deal_name}" has been updated.`,
  },
  stage_changed: {
    subject: 'Deal Stage Changed',
    getMessage: (data) => buildChangeSummary(data) || `Deal "${data.deal_name}" stage changed from "${data.old_value}" to "${data.new_value}".`,
  },
  lender_added: {
    subject: 'New Lender Added',
    getMessage: (data) => buildChangeSummary(data) || `Lender "${data.lender_name}" has been added to deal "${data.deal_name}".`,
  },
  lender_updated: {
    subject: 'Lender Updated',
    getMessage: (data) => buildChangeSummary(data) || `Lender "${data.lender_name}" on deal "${data.deal_name}" has been updated.`,
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
  new_suggestions: {
    subject: 'New AI Recommendations Available',
    getMessage: (data) => {
      const parts: string[] = [];
      if (data.suggestion_count && data.suggestion_count > 0) {
        parts.push(`${data.suggestion_count} workflow suggestion${data.suggestion_count > 1 ? 's' : ''}`);
      }
      if (data.agent_suggestion_count && data.agent_suggestion_count > 0) {
        parts.push(`${data.agent_suggestion_count} agent recommendation${data.agent_suggestion_count > 1 ? 's' : ''}`);
      }
      return `Based on your recent activity, we've identified ${parts.join(' and ')} that could help optimize your workflow.`;
    },
  },
  flex_lender_sync: {
    subject: 'New Lender Sync Requests from Flex',
    getMessage: (data) => {
      const count = data.sync_count || 1;
      const typeLabel = data.sync_request_type === 'new_lender'
        ? 'new lender'
        : data.sync_request_type === 'merge_conflict'
          ? 'merge conflict'
          : 'update';
      if (count === 1) {
        return `A ${typeLabel} request for "${data.lender_name}" has been received from Flex and is awaiting your review.`;
      }
      return `${count} lender sync requests have been received from Flex and are awaiting your review.`;
    },
  },
};

const preferenceMap: Record<string, string> = {
  deal_created: 'deal_updates_email',
  deal_updated: 'deal_updates_email',
  stage_changed: 'deal_updates_email',
  lender_added: 'lender_updates_email',
  lender_updated: 'lender_updates_email',
  milestone_added: 'deal_updates_email',
  milestone_completed: 'deal_updates_email',
  milestone_missed: 'deal_updates_email',
  new_suggestions: 'email_notifications',
  flex_lender_sync: 'lender_updates_email',
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
    console.log("Processing notification:", payload.type, "changed_by:", payload.changed_by);

    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(payload.user_id);
    if (userError || !userData.user?.email) {
      console.log("User not found or no email:", userError);
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

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
    const changesHtml = buildChangesHtml(payload.changes);
    const changesText = buildChangesText(payload.changes);
    const appUrl = "https://naitive.co";
    const dealUrl = payload.deal_id ? `${appUrl}/deal/${payload.deal_id}` : null;
    let actionUrl: string | null = dealUrl;
    let actionLabel = 'View Deal';

    if (payload.type === 'new_suggestions') {
      actionUrl = payload.agent_suggestion_count && payload.agent_suggestion_count > 0
        ? `${appUrl}/agents`
        : `${appUrl}/workflows`;
      actionLabel = 'View Recommendations';
    } else if (payload.type === 'flex_lender_sync') {
      actionUrl = `${appUrl}/lenders`;
      actionLabel = 'Review Sync Requests';
    }

    // Build actor badge
    const actorHtml = payload.changed_by
      ? `<p style="color: #888; font-size: 13px; margin: 0 0 16px 0;">By: <strong style="color: #555;">${payload.changed_by}</strong> · ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>`
      : '';

    const emailResponse = await resend.emails.send({
      from: "naitive <noreply@updates.naitive.co>",
      reply_to: "support@naitive.co",
      to: [userData.user.email],
      subject: `naitive: ${template.subject}${payload.deal_name ? ` – ${payload.deal_name}` : ''}`,
      headers: {
        "List-Unsubscribe": `<${appUrl}/unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      text: `${template.subject}\n\n${message}${payload.changed_by ? `\nBy: ${payload.changed_by}` : ''}${changesText}\n\n${dealUrl ? `View Deal: ${dealUrl}\n\n` : ''}---\nnaitive - Manage preferences: ${appUrl}/settings | Unsubscribe: ${appUrl}/unsubscribe`,
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
            ${message.substring(0, 100)}...
            &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
          </div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f5f5f5;">
            <tr>
              <td align="center" style="padding: 40px 20px;">
                <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width: 560px; background: #ffffff; border-radius: 8px;">
                  <tr>
                    <td style="padding: 40px;">
                      <h1 style="color: #1a1a1a; font-size: 22px; font-weight: 600; margin: 0 0 8px 0; line-height: 1.3;">${template.subject}</h1>
                      ${actorHtml}
                      <p style="color: #4a4a4a; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">${message}</p>
                      ${changesHtml}
                      ${actionUrl ? `
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                          <tr>
                            <td style="border-radius: 8px; background: linear-gradient(135deg, #8B5CF6 0%, #D946EF 100%);">
                              <a href="${actionUrl}" target="_blank" style="display: inline-block; padding: 14px 28px; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none;">${actionLabel}</a>
                            </td>
                          </tr>
                        </table>
                      ` : ''}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 24px 40px; border-top: 1px solid #eeeeee; text-align: center;">
                      <p style="color: #888888; font-size: 12px; margin: 0 0 8px 0;">
                        © ${new Date().getFullYear()} naitive. All rights reserved.
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
