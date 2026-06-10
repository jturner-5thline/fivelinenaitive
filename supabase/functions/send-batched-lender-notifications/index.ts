import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { buildFrom } from '../_shared/resendFrom.ts';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_WINDOW_MINUTES = 15;

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

interface LenderNotification {
  id: string;
  deal_id: string;
  company_id: string;
  lender_id: string | null;
  lender_name: string;
  change_summary: Record<string, any>;
  changed_by: string | null;
  changed_by_name: string | null;
  created_at: string;
}

interface DealInfo {
  id: string;
  company: string;
  manager: string | null;
  analyst: string | null;
  company_id: string;
}

function buildBatchedEmailHtml(
  recipientName: string,
  dealName: string,
  dealId: string,
  notifications: LenderNotification[],
  stageLabels: Record<string, string>,
  trackingLabels: Record<string, string>,
  substageLabels: Record<string, string>,
): string {
  const changedByName = notifications[0]?.changed_by_name || 'A team member';
  const uniqueChangers = [...new Set(notifications.map(n => n.changed_by_name || 'Unknown'))];
  const changerText = uniqueChangers.length === 1 ? uniqueChangers[0] : uniqueChangers.join(', ');

  const lenderRows = notifications.map(n => {
    const changes = n.change_summary || {};
    const changeDetails: string[] = [];

    if (changes.stage) {
      const fromLabel = stageLabels[changes.stage.from] || changes.stage.from || '—';
      const toLabel = stageLabels[changes.stage.to] || changes.stage.to || '—';
      changeDetails.push(`<tr>
        <td style="padding: 4px 12px; color: #6b7280; font-size: 12px;">Stage</td>
        <td style="padding: 4px 12px; color: #ef4444; font-size: 12px; text-decoration: line-through;">${fromLabel}</td>
        <td style="padding: 4px 12px; color: #22c55e; font-size: 12px; font-weight: 600;">${toLabel}</td>
      </tr>`);
    }
    if (changes.tracking_status) {
      const fromLabel = trackingLabels[changes.tracking_status.from] || changes.tracking_status.from || '—';
      const toLabel = trackingLabels[changes.tracking_status.to] || changes.tracking_status.to || '—';
      changeDetails.push(`<tr>
        <td style="padding: 4px 12px; color: #6b7280; font-size: 12px;">Status</td>
        <td style="padding: 4px 12px; color: #ef4444; font-size: 12px; text-decoration: line-through;">${fromLabel}</td>
        <td style="padding: 4px 12px; color: #22c55e; font-size: 12px; font-weight: 600;">${toLabel}</td>
      </tr>`);
    }
    if (changes.substage) {
      const fromLabel = substageLabels[changes.substage.from] || changes.substage.from || '—';
      const toLabel = substageLabels[changes.substage.to] || changes.substage.to || '—';
      changeDetails.push(`<tr>
        <td style="padding: 4px 12px; color: #6b7280; font-size: 12px;">Milestone</td>
        <td style="padding: 4px 12px; color: #ef4444; font-size: 12px; text-decoration: line-through;">${fromLabel}</td>
        <td style="padding: 4px 12px; color: #22c55e; font-size: 12px; font-weight: 600;">${toLabel}</td>
      </tr>`);
    }
    if (changes.notes) {
      changeDetails.push(`<tr>
        <td style="padding: 4px 12px; color: #6b7280; font-size: 12px;">Notes</td>
        <td colspan="2" style="padding: 4px 12px; color: #374151; font-size: 12px; font-style: italic;">${(changes.notes.to || '').substring(0, 100)}${(changes.notes.to || '').length > 100 ? '…' : ''}</td>
      </tr>`);
    }
    if (changes.score) {
      changeDetails.push(`<tr>
        <td style="padding: 4px 12px; color: #6b7280; font-size: 12px;">Score</td>
        <td style="padding: 4px 12px; color: #ef4444; font-size: 12px; text-decoration: line-through;">${changes.score.from ?? '—'}</td>
        <td style="padding: 4px 12px; color: #22c55e; font-size: 12px; font-weight: 600;">${changes.score.to ?? '—'}</td>
      </tr>`);
    }
    if (changes.quote_amount) {
      changeDetails.push(`<tr>
        <td style="padding: 4px 12px; color: #6b7280; font-size: 12px;">Quote</td>
        <td style="padding: 4px 12px; color: #ef4444; font-size: 12px; text-decoration: line-through;">${changes.quote_amount.from ?? '—'}</td>
        <td style="padding: 4px 12px; color: #22c55e; font-size: 12px; font-weight: 600;">${changes.quote_amount.to ?? '—'}</td>
      </tr>`);
    }
    if (changes.pass_reason) {
      changeDetails.push(`<tr>
        <td style="padding: 4px 12px; color: #6b7280; font-size: 12px;">Pass Reason</td>
        <td colspan="2" style="padding: 4px 12px; color: #374151; font-size: 12px;">${changes.pass_reason.to || '—'}</td>
      </tr>`);
    }

    const changesTable = changeDetails.length > 0 ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top: 8px;">
        <thead>
          <tr style="background: #f9fafb;">
            <th style="padding: 4px 12px; text-align: left; font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px;">Field</th>
            <th style="padding: 4px 12px; text-align: left; font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px;">Before</th>
            <th style="padding: 4px 12px; text-align: left; font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px;">After</th>
          </tr>
        </thead>
        <tbody>
          ${changeDetails.join('')}
        </tbody>
      </table>` : '<p style="margin: 8px 0 0; color: #9ca3af; font-size: 12px;">Details updated</p>';

    return `
      <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; margin-bottom: 10px; border-left: 3px solid #8B5CF6;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <strong style="font-size: 14px; color: #111827;">🏦 ${n.lender_name}</strong>
          <span style="font-size: 11px; color: #9ca3af; margin-left: auto;">${formatDate(n.created_at)}</span>
        </div>
        ${changesTable}
      </div>`;
  }).join('');

  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px; background-color: #f5f5f5; margin: 0;">
  <div style="max-width: 640px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); overflow: hidden;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); padding: 28px 32px;">
      <h1 style="margin: 0; color: white; font-size: 20px; font-weight: 700;">Lender Updates — ${dealName}</h1>
      <p style="margin: 8px 0 0; color: rgba(255,255,255,0.85); font-size: 14px;">
        ${notifications.length} lender${notifications.length !== 1 ? 's' : ''} updated by ${changerText}
      </p>
    </div>

    <!-- Body -->
    <div style="padding: 28px 32px;">
      <p style="color: #374151; font-size: 15px; margin: 0 0 20px;">
        Hi ${recipientName || 'there'}, the following lenders were updated on <strong>${dealName}</strong>:
      </p>

      ${lenderRows}

      <div style="text-align: center; margin-top: 24px;">
        <a href="https://fivelinenaitive.lovable.app/deals/${dealId}" style="display: inline-block; background: linear-gradient(135deg, #8B5CF6 0%, #D946EF 100%); color: white; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
          View Deal
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding: 20px 32px; border-top: 1px solid #f3f4f6; background: #fafafa;">
      <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
        naitive — Lender Update Notification &nbsp;|&nbsp; © ${year}
        <br/>
        <a href="https://fivelinenaitive.lovable.app/preferences" style="color: #8B5CF6; text-decoration: underline;">Manage preferences</a>
      </p>
    </div>
  </div>
</body>
</html>`;
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

    console.log("Processing batched lender notifications...");

    // Get pending notifications older than the batch window
    const cutoff = new Date(Date.now() - BATCH_WINDOW_MINUTES * 60 * 1000).toISOString();

    const { data: pending, error: fetchError } = await supabaseAdmin
      .from('pending_lender_notifications')
      .select('*')
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true });

    if (fetchError) throw fetchError;

    if (!pending || pending.length === 0) {
      console.log("No pending lender notifications to process");
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log(`Found ${pending.length} pending notifications`);

    // Group by deal_id, then merge multiple notifications for the same lender
    const byDeal: Record<string, LenderNotification[]> = {};
    for (const n of pending) {
      if (!byDeal[n.deal_id]) byDeal[n.deal_id] = [];
      byDeal[n.deal_id].push(n as LenderNotification);
    }

    // For each deal, merge notifications for the same lender into one
    for (const dealId of Object.keys(byDeal)) {
      const notifications = byDeal[dealId];
      const byLender: Record<string, LenderNotification[]> = {};
      for (const n of notifications) {
        const key = n.lender_id || n.lender_name;
        if (!byLender[key]) byLender[key] = [];
        byLender[key].push(n);
      }

      const merged: LenderNotification[] = [];
      for (const lenderNotifs of Object.values(byLender)) {
        if (lenderNotifs.length === 1) {
          merged.push(lenderNotifs[0]);
        } else {
          // Merge all change_summary objects into one, keeping earliest "from" and latest "to"
          const base = { ...lenderNotifs[0] };
          const mergedChanges: Record<string, any> = { ...(base.change_summary || {}) };
          for (let i = 1; i < lenderNotifs.length; i++) {
            const cs = lenderNotifs[i].change_summary || {};
            for (const [field, val] of Object.entries(cs)) {
              if (mergedChanges[field]) {
                // Keep the original "from" but take the latest "to"
                mergedChanges[field] = { from: mergedChanges[field].from, to: (val as any).to };
              } else {
                mergedChanges[field] = val;
              }
            }
            // Collect all IDs for cleanup
          }
          // Remove no-op changes where from === to after merging
          for (const [field, val] of Object.entries(mergedChanges)) {
            if ((val as any).from === (val as any).to) {
              delete mergedChanges[field];
            }
          }
          base.change_summary = mergedChanges;
          // Keep all original IDs so they all get deleted
          (base as any)._all_ids = lenderNotifs.map(n => n.id);
          if (Object.keys(mergedChanges).length > 0) {
            merged.push(base);
          } else {
            // All changes cancelled out; still need to clean up
            (base as any)._cleanup_only = true;
            merged.push(base);
          }
        }
      }
      byDeal[dealId] = merged;
    }

    const results: any[] = [];

    for (const [dealId, notifications] of Object.entries(byDeal)) {
      try {
        // Get deal info
        const { data: deal } = await supabaseAdmin
          .from('deals')
          .select('id, company, manager, analyst, company_id')
          .eq('id', dealId)
          .single();

        if (!deal) {
          console.log(`Deal ${dealId} not found, skipping`);
          continue;
        }

        // Resolve lender stage/substage/tracking labels from company config
        const stageLabels: Record<string, string> = {};
        const substageLabels: Record<string, string> = {};
        const trackingLabels: Record<string, string> = {
          'active': 'Active', 'on-hold': 'On Hold', 'on-deck': 'On Deck',
          'passed': 'Passed', 'not-a-fit': 'Not a Fit', 'excluded': 'Excluded', 'direct': 'Direct',
        };

        const { data: lenderConfig } = await supabaseAdmin
          .from('lender_stage_configs')
          .select('stages, substages, tracking_statuses')
          .eq('company_id', deal.company_id)
          .maybeSingle();

        if (lenderConfig) {
          const stages = (lenderConfig.stages as any[]) || [];
          for (const s of stages) {
            if (s.id && s.label) stageLabels[s.id] = s.label;
          }
          const substages = (lenderConfig.substages as any[]) || [];
          for (const s of substages) {
            if (s.id && s.label) substageLabels[s.id] = s.label;
          }
          const trackings = (lenderConfig.tracking_statuses as any[]) || [];
          for (const t of trackings) {
            if (t.id && t.label) trackingLabels[t.id] = t.label;
          }
        }

        // Hardcoded fallbacks for default lender stages
        const defaultStages: Record<string, string> = {
          'reviewing-drl': 'Reviewing DRL',
          'management-call-set': 'Management Call Set',
          'management-call-completed': 'Management Call Completed',
          'draft-terms': 'Draft Terms',
          'term-sheets': 'Term Sheets',
        };
        for (const [k, v] of Object.entries(defaultStages)) {
          if (!stageLabels[k]) stageLabels[k] = v;
        }

        // Get company stale_alert_config for always_notify_emails
        const { data: companySettings } = await supabaseAdmin
          .from('company_settings')
          .select('stale_alert_config')
          .eq('company_id', deal.company_id)
          .maybeSingle();

        const alwaysNotifyEmails: string[] = (companySettings?.stale_alert_config as any)?.always_notify_emails || [];

        // Get company members to resolve names → emails
        const { data: members } = await supabaseAdmin
          .from('company_members')
          .select('user_id, role')
          .eq('company_id', deal.company_id);

        if (!members || members.length === 0) continue;

        const memberIds = members.map(m => m.user_id);
        const { data: profiles } = await supabaseAdmin
          .from('profiles')
          .select('user_id, display_name, email_notifications, lender_updates_email')
          .in('user_id', memberIds);

        if (!profiles) continue;

        // Build email map and name→userId map
        const emailMap: Record<string, string> = {};
        const nameToUserId: Record<string, string> = {};
        const emailToUserId: Record<string, string> = {};
        for (const member of members) {
          const { data: userData } = await supabaseAdmin.auth.admin.getUserById(member.user_id);
          if (userData?.user?.email) {
            emailMap[member.user_id] = userData.user.email;
            emailToUserId[userData.user.email.toLowerCase()] = member.user_id;
          }
        }
        for (const p of profiles) {
          if (p.display_name) {
            nameToUserId[p.display_name.toLowerCase()] = p.user_id;
          }
        }

        // Determine recipients
        const recipients: Record<string, { name: string; email: string }> = {};

        // 1. Always-notify emails
        for (const email of alwaysNotifyEmails) {
          const userId = emailToUserId[email.toLowerCase()];
          if (userId) {
            const profile = profiles.find(p => p.user_id === userId);
            recipients[userId] = {
              name: profile?.display_name || 'there',
              email: emailMap[userId],
            };
          }
        }

        // 2. Deal manager
        if (deal.manager) {
          const managerId = nameToUserId[deal.manager.toLowerCase()];
          if (managerId && emailMap[managerId] && !recipients[managerId]) {
            const profile = profiles.find(p => p.user_id === managerId);
            if (profile?.email_notifications && profile?.lender_updates_email) {
              recipients[managerId] = {
                name: profile.display_name || 'there',
                email: emailMap[managerId],
              };
            }
          }
        }

        // 3. Deal analyst
        if (deal.analyst) {
          const analystId = nameToUserId[deal.analyst.toLowerCase()];
          if (analystId && emailMap[analystId] && !recipients[analystId]) {
            const profile = profiles.find(p => p.user_id === analystId);
            if (profile?.email_notifications && profile?.lender_updates_email) {
              recipients[analystId] = {
                name: profile.display_name || 'there',
                email: emailMap[analystId],
              };
            }
          }
        }

        // Filter out cleanup-only entries (changes cancelled out)
        const emailableNotifications = notifications.filter(n => !(n as any)._cleanup_only);

        // Send one email per recipient (only if there are real changes)
        if (emailableNotifications.length > 0) {
          for (const [userId, recipient] of Object.entries(recipients)) {
            // Don't send to the person who made the changes (if all changes are by the same person)
            const allBySameUser = emailableNotifications.every(n => n.changed_by === userId);
            if (allBySameUser) continue;

            try {
              const emailHtml = buildBatchedEmailHtml(
                recipient.name,
                deal.company,
                dealId,
                emailableNotifications,
                stageLabels,
                trackingLabels,
                substageLabels,
              );

              await resend.emails.send({
                from: buildFrom("Naitive"),
                to: [recipient.email],
                subject: `${deal.company} — ${emailableNotifications.length} Lender${emailableNotifications.length !== 1 ? 's' : ''} Updated`,
                html: emailHtml,
              });

              results.push({ deal_id: dealId, email: recipient.email, lender_count: emailableNotifications.length, success: true });
              console.log(`Batched lender email sent to ${recipient.email} for deal ${deal.company} (${emailableNotifications.length} lenders)`);
            } catch (sendError: any) {
              console.error(`Error sending to ${recipient.email}:`, sendError);
              results.push({ deal_id: dealId, email: recipient.email, success: false, error: sendError.message });
            }
          }
        }

        // Delete all processed notifications (including merged ones)
        const allIds: string[] = [];
        for (const n of notifications) {
          if ((n as any)._all_ids) {
            allIds.push(...(n as any)._all_ids);
          } else {
            allIds.push(n.id);
          }
        }
        // Also collect original pending IDs from the raw batch
        const uniqueIds = [...new Set(allIds)];
        if (uniqueIds.length > 0) {
          await supabaseAdmin
            .from('pending_lender_notifications')
            .delete()
            .in('id', uniqueIds);
        }

        console.log(`Cleaned up ${uniqueIds.length} processed notifications for deal ${dealId}`);
      } catch (dealError: any) {
        console.error(`Error processing deal ${dealId}:`, dealError);
        results.push({ deal_id: dealId, success: false, error: dealError.message });
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-batched-lender-notifications:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
