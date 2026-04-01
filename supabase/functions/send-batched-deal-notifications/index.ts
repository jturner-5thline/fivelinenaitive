import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

interface PendingNotification {
  id: string;
  deal_id: string;
  company_id: string;
  event_type: string;
  entity_name: string | null;
  entity_id: string | null;
  change_summary: Record<string, any>;
  changed_by: string | null;
  changed_by_name: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

interface DealInfo {
  id: string;
  company: string;
  manager: string | null;
  analyst: string | null;
  deal_owner: string | null;
  company_id: string;
}

// Merge multiple notifications for the same entity within a deal
function mergeByEntity(notifications: PendingNotification[]): PendingNotification[] {
  const byKey: Record<string, PendingNotification[]> = {};
  for (const n of notifications) {
    const key = `${n.event_type}:${n.entity_id || n.entity_name || 'deal'}`;
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push(n);
  }

  const merged: PendingNotification[] = [];
  for (const group of Object.values(byKey)) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }
    // Merge change_summary: keep earliest "from", latest "to"
    const base = { ...group[0] };
    const mergedChanges: Record<string, any> = { ...(base.change_summary || {}) };
    const allIds: string[] = [base.id];

    for (let i = 1; i < group.length; i++) {
      allIds.push(group[i].id);
      const cs = group[i].change_summary || {};
      for (const [field, val] of Object.entries(cs)) {
        if (mergedChanges[field]) {
          mergedChanges[field] = { from: mergedChanges[field].from, to: (val as any).to };
        } else {
          mergedChanges[field] = val;
        }
      }
    }

    // Remove no-op changes
    for (const [field, val] of Object.entries(mergedChanges)) {
      if ((val as any).from === (val as any).to) {
        delete mergedChanges[field];
      }
    }

    base.change_summary = mergedChanges;
    (base as any)._all_ids = allIds;
    if (Object.keys(mergedChanges).length > 0 || base.event_type === 'lender_added' || base.event_type === 'deal_created') {
      merged.push(base);
    } else {
      (base as any)._cleanup_only = true;
      merged.push(base);
    }
  }
  return merged;
}

function resolveLabel(val: string | null | undefined, labels: Record<string, string>): string {
  if (!val) return '—';
  if (labels[val]) return labels[val];
  if (val.match(/^[a-z0-9-]+$/) && val.includes('-')) {
    return val.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
  return val;
}

// Build the change diff rows HTML for a single entity
function buildChangeRows(changes: Record<string, any>, labels: Record<string, string>): string {
  const rows: string[] = [];
  const fieldOrder = ['stage', 'tracking_status', 'substage', 'status', 'score', 'quote_amount', 'quote_rate', 'quote_term', 'notes', 'pass_reason'];
  const fieldLabels: Record<string, string> = {
    stage: 'Stage', tracking_status: 'Status', substage: 'Milestone', status: 'Deal Status',
    score: 'Score', quote_amount: 'Quote', quote_rate: 'Rate', quote_term: 'Term',
    notes: 'Notes', pass_reason: 'Pass Reason',
  };

  const sortedFields = Object.keys(changes).sort((a, b) => {
    const ai = fieldOrder.indexOf(a);
    const bi = fieldOrder.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  for (const field of sortedFields) {
    const val = changes[field];
    const label = fieldLabels[field] || field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const fromVal = field === 'notes'
      ? (val.from ? `"${(val.from as string).substring(0, 60)}${(val.from as string).length > 60 ? '…' : ''}"` : '—')
      : resolveLabel(val.from, labels);
    const toVal = field === 'notes'
      ? (val.to ? `"${(val.to as string).substring(0, 60)}${(val.to as string).length > 60 ? '…' : ''}"` : '—')
      : resolveLabel(val.to, labels);

    rows.push(`<tr>
      <td style="padding: 4px 12px; color: #94a3b8; font-size: 12px; width: 90px; vertical-align: top;">${label}</td>
      <td style="padding: 4px 12px; color: #ef4444; font-size: 12px; text-decoration: line-through; opacity: 0.7;">${fromVal}</td>
      <td style="padding: 4px 12px; color: #22c55e; font-size: 12px; font-weight: 600;">${toVal}</td>
    </tr>`);
  }
  return rows.join('');
}

// Build a section for one deal's notifications
function buildDealSection(
  dealName: string,
  dealId: string,
  notifications: PendingNotification[],
  labels: Record<string, string>,
): string {
  // Group by event category
  const lenderEvents = notifications.filter(n => n.event_type === 'lender_updated' || n.event_type === 'lender_added');
  const dealEvents = notifications.filter(n => n.event_type === 'deal_updated' || n.event_type === 'stage_changed' || n.event_type === 'deal_created');
  const milestoneEvents = notifications.filter(n => n.event_type.startsWith('milestone_'));

  let html = '';

  // Deal-level changes
  if (dealEvents.length > 0) {
    for (const n of dealEvents) {
      const changeRows = buildChangeRows(n.change_summary || {}, labels);
      const title = n.event_type === 'deal_created' ? '🆕 Deal Created' : '📋 Deal Updated';
      if (changeRows || n.event_type === 'deal_created') {
        html += `
          <div style="border: 1px solid #334155; border-radius: 8px; padding: 14px; margin-bottom: 10px; border-left: 3px solid #3b82f6; background: #1e293b;">
            <strong style="font-size: 13px; color: #e2e8f0;">${title}</strong>
            ${changeRows ? `
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top: 8px;">
                <tbody>${changeRows}</tbody>
              </table>` : ''}
          </div>`;
      }
    }
  }

  // Lender changes
  if (lenderEvents.length > 0) {
    for (const n of lenderEvents) {
      const changeRows = buildChangeRows(n.change_summary || {}, labels);
      const icon = n.event_type === 'lender_added' ? '➕' : '🏦';
      const title = n.event_type === 'lender_added' ? `${icon} ${n.entity_name} added` : `${icon} ${n.entity_name}`;
      html += `
        <div style="border: 1px solid #334155; border-radius: 8px; padding: 14px; margin-bottom: 10px; border-left: 3px solid #8B5CF6; background: #1e293b;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <strong style="font-size: 13px; color: #e2e8f0;">${title}</strong>
          </div>
          ${changeRows ? `
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top: 8px;">
              <tbody>${changeRows}</tbody>
            </table>` : '<p style="margin: 6px 0 0; color: #64748b; font-size: 12px;">Added to deal</p>'}
        </div>`;
    }
  }

  // Milestone changes
  if (milestoneEvents.length > 0) {
    for (const n of milestoneEvents) {
      const icon = n.event_type === 'milestone_completed' ? '✅' : n.event_type === 'milestone_missed' ? '⚠️' : '📌';
      const verb = n.event_type === 'milestone_completed' ? 'completed' : n.event_type === 'milestone_missed' ? 'missed' : 'added';
      html += `
        <div style="border: 1px solid #334155; border-radius: 8px; padding: 14px; margin-bottom: 10px; border-left: 3px solid ${n.event_type === 'milestone_missed' ? '#f59e0b' : '#22c55e'}; background: #1e293b;">
          <strong style="font-size: 13px; color: #e2e8f0;">${icon} Milestone ${verb}: ${n.entity_name || 'Untitled'}</strong>
        </div>`;
    }
  }

  return html;
}

// Build the full digest email HTML
function buildDigestEmailHtml(
  recipientName: string,
  dealSections: Array<{ dealName: string; dealId: string; notifications: PendingNotification[]; labels: Record<string, string> }>,
  changers: string[],
): string {
  const totalDeals = dealSections.length;
  const totalEvents = dealSections.reduce((sum, s) => sum + s.notifications.length, 0);
  const changerText = changers.length === 1 ? changers[0] : changers.slice(0, -1).join(', ') + ' and ' + changers[changers.length - 1];
  const year = new Date().getFullYear();

  const headerTitle = totalDeals === 1
    ? `Deal Update — ${dealSections[0].dealName}`
    : `${totalDeals} Deals Updated`;

  const headerSubtitle = totalDeals === 1
    ? `${totalEvents} update${totalEvents !== 1 ? 's' : ''} by ${changerText}`
    : `${totalEvents} total update${totalEvents !== 1 ? 's' : ''} by ${changerText}`;

  let bodyHtml = '';

  for (const section of dealSections) {
    const emailable = section.notifications.filter(n => !(n as any)._cleanup_only);
    if (emailable.length === 0) continue;

    if (totalDeals > 1) {
      bodyHtml += `
        <div style="margin-top: 20px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #334155;">
          <h2 style="margin: 0; font-size: 16px; color: #f1f5f9; font-weight: 600;">
            <a href="https://fivelinenaitive.lovable.app/deal/${section.dealId}" style="color: #f1f5f9; text-decoration: none;">📁 ${section.dealName}</a>
          </h2>
          <p style="margin: 4px 0 0; color: #64748b; font-size: 12px;">${emailable.length} update${emailable.length !== 1 ? 's' : ''}</p>
        </div>`;
    }

    bodyHtml += buildDealSection(section.dealName, section.dealId, emailable, section.labels);
  }

  const ctaUrl = totalDeals === 1
    ? `https://fivelinenaitive.lovable.app/deal/${dealSections[0].dealId}`
    : 'https://fivelinenaitive.lovable.app/deals';
  const ctaLabel = totalDeals === 1 ? 'View Deal' : 'View All Deals';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0f172a;">
  <div style="display: none; max-height: 0; overflow: hidden;">
    ${headerTitle}: ${headerSubtitle}
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #0f172a;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; width: 100%;">

          <!-- Logo -->
          <tr>
            <td style="padding: 0 0 24px 0; text-align: center;">
              <span style="font-size: 22px; font-weight: 700; color: #f8fafc; letter-spacing: -0.5px;">naitive</span>
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td style="background: #1a1a2e; border-radius: 12px; border: 1px solid #2d2d52;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <!-- Header -->
                <tr>
                  <td style="padding: 28px 28px 0 28px;">
                    <p style="margin: 0 0 12px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #8B5CF6; font-weight: 700;">Deal Activity Digest</p>
                    <h1 style="margin: 0; font-size: 20px; font-weight: 600; color: #f1f5f9; line-height: 1.3;">${headerTitle}</h1>
                    <p style="margin: 6px 0 0; color: #94a3b8; font-size: 13px;">${headerSubtitle}</p>
                  </td>
                </tr>

                <!-- Content -->
                <tr>
                  <td style="padding: 8px 28px 0 28px;">
                    <p style="color: #cbd5e1; font-size: 14px; margin: 12px 0 16px;">
                      Hi ${recipientName || 'there'}, here's a summary of recent deal activity:
                    </p>
                    ${bodyHtml}
                  </td>
                </tr>

                <!-- CTA -->
                <tr>
                  <td style="padding: 24px 28px 28px 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td align="center">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td style="border-radius: 8px; background: linear-gradient(135deg, #8B5CF6 0%, #D946EF 100%);">
                                <a href="${ctaUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none;">${ctaLabel}</a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 0 0 0; text-align: center;">
              <p style="color: #475569; font-size: 12px; margin: 0 0 6px 0;">
                © ${year} naitive. All rights reserved.
              </p>
              <p style="color: #475569; font-size: 12px; margin: 0;">
                <a href="https://fivelinenaitive.lovable.app/settings" style="color: #8B5CF6; text-decoration: underline;">Manage preferences</a>
                &nbsp;|&nbsp;
                <a href="https://fivelinenaitive.lovable.app/unsubscribe" style="color: #8B5CF6; text-decoration: underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
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

    console.log("Processing batched deal notifications...");

    const cutoff = new Date(Date.now() - BATCH_WINDOW_MINUTES * 60 * 1000).toISOString();

    const { data: pending, error: fetchError } = await supabaseAdmin
      .from('pending_deal_notifications')
      .select('*')
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true });

    if (fetchError) throw fetchError;

    if (!pending || pending.length === 0) {
      console.log("No pending deal notifications to process");
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log(`Found ${pending.length} pending notifications`);

    // Also process any old pending_lender_notifications that haven't been migrated
    const { data: oldPending } = await supabaseAdmin
      .from('pending_lender_notifications')
      .select('*')
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true });

    // Convert old lender notifications to new format
    if (oldPending && oldPending.length > 0) {
      console.log(`Also processing ${oldPending.length} legacy lender notifications`);
      for (const old of oldPending) {
        pending.push({
          id: old.id,
          deal_id: old.deal_id,
          company_id: old.company_id,
          event_type: 'lender_updated',
          entity_name: old.lender_name,
          entity_id: old.lender_id,
          change_summary: old.change_summary || {},
          changed_by: old.changed_by,
          changed_by_name: old.changed_by_name,
          metadata: {},
          created_at: old.created_at,
        } as any);
      }
    }

    // Group by company_id first (to batch per recipient scope)
    const byCompany: Record<string, PendingNotification[]> = {};
    for (const n of pending) {
      if (!byCompany[n.company_id]) byCompany[n.company_id] = [];
      byCompany[n.company_id].push(n as PendingNotification);
    }

    const results: any[] = [];

    for (const [companyId, companyNotifications] of Object.entries(byCompany)) {
      try {
        // Group by deal within this company
        const byDeal: Record<string, PendingNotification[]> = {};
        for (const n of companyNotifications) {
          if (!byDeal[n.deal_id]) byDeal[n.deal_id] = [];
          byDeal[n.deal_id].push(n);
        }

        // Merge within each deal
        for (const dealId of Object.keys(byDeal)) {
          byDeal[dealId] = mergeByEntity(byDeal[dealId]);
        }

        // Load label maps for the company
        const labels: Record<string, string> = {
          'active': 'Active', 'on-hold': 'On Hold', 'on-deck': 'On Deck',
          'passed': 'Passed', 'not-a-fit': 'Not a Fit', 'excluded': 'Excluded', 'direct': 'Direct',
          'reviewing-drl': 'Reviewing DRL', 'management-call-set': 'Management Call Set',
          'management-call-completed': 'Management Call Completed', 'draft-terms': 'Draft Terms',
          'term-sheets': 'Term Sheets', 'on-track': 'On Track', 'at-risk': 'At Risk',
          'off-track': 'Off Track', 'archived': 'Archived',
        };

        const { data: lenderConfig } = await supabaseAdmin
          .from('lender_stage_configs')
          .select('stages, substages, tracking_statuses')
          .eq('company_id', companyId)
          .maybeSingle();

        if (lenderConfig) {
          for (const s of ((lenderConfig.stages as any[]) || [])) { if (s.id && s.label) labels[s.id] = s.label; }
          for (const s of ((lenderConfig.substages as any[]) || [])) { if (s.id && s.label) labels[s.id] = s.label; }
          for (const t of ((lenderConfig.tracking_statuses as any[]) || [])) { if (t.id && t.label) labels[t.id] = t.label; }
        }

        const { data: pipelines } = await supabaseAdmin.from('deal_pipelines').select('stages').eq('company_id', companyId);
        if (pipelines) {
          for (const p of pipelines) {
            if (p.stages && Array.isArray(p.stages)) {
              for (const s of p.stages as any[]) { if (s.id && s.label) labels[s.id] = s.label; }
            }
          }
        }

        // Get all deal info
        const dealIds = Object.keys(byDeal);
        const { data: deals } = await supabaseAdmin
          .from('deals')
          .select('id, company, manager, analyst, deal_owner, company_id')
          .in('id', dealIds);

        const dealMap: Record<string, DealInfo> = {};
        for (const d of (deals || [])) {
          dealMap[d.id] = d as DealInfo;
        }

        // Get always-notify emails
        const { data: companySettings } = await supabaseAdmin
          .from('company_settings')
          .select('stale_alert_config')
          .eq('company_id', companyId)
          .maybeSingle();
        const alwaysNotifyEmails: string[] = (companySettings?.stale_alert_config as any)?.always_notify_emails || [];

        // Resolve recipients for the company
        const { data: members } = await supabaseAdmin
          .from('company_members')
          .select('user_id, role')
          .eq('company_id', companyId);

        if (!members || members.length === 0) continue;

        const memberIds = members.map(m => m.user_id);
        const { data: profiles } = await supabaseAdmin
          .from('profiles')
          .select('user_id, display_name, email_notifications, deal_updates_email, lender_updates_email')
          .in('user_id', memberIds);

        if (!profiles) continue;

        // Build email and name maps
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
          if (p.display_name) nameToUserId[p.display_name.toLowerCase()] = p.user_id;
        }

        // Determine per-deal recipients, then union them for the digest
        const recipientDeals: Record<string, Set<string>> = {}; // userId -> set of dealIds

        for (const [dealId, notifications] of Object.entries(byDeal)) {
          const deal = dealMap[dealId];
          if (!deal) continue;

          const dealRecipients = new Set<string>();

          // Always-notify emails
          for (const email of alwaysNotifyEmails) {
            const userId = emailToUserId[email.toLowerCase()];
            if (userId) dealRecipients.add(userId);
          }

          // Deal manager
          if (deal.manager) {
            const managerId = nameToUserId[deal.manager.toLowerCase()];
            if (managerId && emailMap[managerId]) dealRecipients.add(managerId);
          }

          // Deal analyst
          if (deal.analyst) {
            const analystId = nameToUserId[deal.analyst.toLowerCase()];
            if (analystId && emailMap[analystId]) dealRecipients.add(analystId);
          }

          // Deal owner
          if (deal.deal_owner) {
            const ownerId = nameToUserId[deal.deal_owner.toLowerCase()];
            if (ownerId && emailMap[ownerId]) dealRecipients.add(ownerId);
          }

          // Admins/owners
          for (const m of members) {
            if (m.role === 'admin' || m.role === 'owner') {
              if (emailMap[m.user_id]) dealRecipients.add(m.user_id);
            }
          }

          for (const uid of dealRecipients) {
            if (!recipientDeals[uid]) recipientDeals[uid] = new Set();
            recipientDeals[uid].add(dealId);
          }
        }

        // Send one digest email per recipient
        for (const [userId, userDealIds] of Object.entries(recipientDeals)) {
          const profile = profiles.find(p => p.user_id === userId);
          if (!profile) continue;

          // Check notification preferences
          if (!profile.email_notifications) continue;
          if (!profile.deal_updates_email && !profile.lender_updates_email) continue;

          const recipientEmail = emailMap[userId];
          if (!recipientEmail) continue;

          // Collect all changers for this user's notifications
          const allChangerNames = new Set<string>();

          // Don't send if all changes are by this user
          let allByThisUser = true;

          // Build deal sections for this recipient
          const dealSections: Array<{ dealName: string; dealId: string; notifications: PendingNotification[]; labels: Record<string, string> }> = [];

          for (const dealId of userDealIds) {
            const deal = dealMap[dealId];
            if (!deal) continue;

            const emailable = byDeal[dealId].filter(n => !(n as any)._cleanup_only);
            if (emailable.length === 0) continue;

            for (const n of emailable) {
              if (n.changed_by_name) allChangerNames.add(n.changed_by_name);
              if (n.changed_by !== userId) allByThisUser = false;
            }

            dealSections.push({
              dealName: deal.company,
              dealId,
              notifications: emailable,
              labels,
            });
          }

          if (dealSections.length === 0 || allByThisUser) continue;

          const changers = [...allChangerNames];
          if (changers.length === 0) changers.push('A team member');

          try {
            const emailHtml = buildDigestEmailHtml(
              profile.display_name || 'there',
              dealSections,
              changers,
            );

            const totalUpdates = dealSections.reduce((sum, s) => sum + s.notifications.length, 0);
            const subject = dealSections.length === 1
              ? `${dealSections[0].dealName} — ${totalUpdates} Update${totalUpdates !== 1 ? 's' : ''}`
              : `${dealSections.length} Deals Updated — ${totalUpdates} Total Changes`;

            await resend.emails.send({
              from: "naitive <noreply@updates.naitive.co>",
              to: [recipientEmail],
              subject,
              html: emailHtml,
              headers: {
                "List-Unsubscribe": "<https://fivelinenaitive.lovable.app/unsubscribe>",
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
            });

            results.push({ company_id: companyId, email: recipientEmail, deals: dealSections.length, updates: totalUpdates, success: true });
            console.log(`Digest email sent to ${recipientEmail}: ${dealSections.length} deals, ${totalUpdates} updates`);
          } catch (sendError: any) {
            console.error(`Error sending digest to ${recipientEmail}:`, sendError);
            results.push({ email: recipientEmail, success: false, error: sendError.message });
          }
        }

        // Cleanup all processed notifications
        const allNewIds = companyNotifications
          .filter(n => !(n as any)._legacy)
          .map(n => {
            if ((n as any)._all_ids) return (n as any)._all_ids;
            return [n.id];
          })
          .flat();

        const uniqueNewIds = [...new Set(allNewIds)];
        if (uniqueNewIds.length > 0) {
          await supabaseAdmin
            .from('pending_deal_notifications')
            .delete()
            .in('id', uniqueNewIds);
        }

        // Clean up legacy lender notifications too
        if (oldPending && oldPending.length > 0) {
          const legacyIds = oldPending
            .filter(o => o.company_id === companyId)
            .map(o => o.id);
          if (legacyIds.length > 0) {
            await supabaseAdmin
              .from('pending_lender_notifications')
              .delete()
              .in('id', legacyIds);
          }
        }

        console.log(`Processed company ${companyId}: ${uniqueNewIds.length} notifications cleaned up`);
      } catch (companyError: any) {
        console.error(`Error processing company ${companyId}:`, companyError);
        results.push({ company_id: companyId, success: false, error: companyError.message });
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-batched-deal-notifications:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
