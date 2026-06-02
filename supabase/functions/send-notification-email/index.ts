import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { buildFrom } from '../_shared/resendFrom.ts';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
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
  type: 'deal_created' | 'deal_updated' | 'stage_changed' | 'lender_added' | 'lender_updated' | 'milestone_added' | 'milestone_completed' | 'milestone_missed' | 'new_suggestions' | 'flex_lender_sync' | 'task_assigned';
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

// Priority badge colors
function getPriorityConfig(priority: string): { label: string; color: string; bg: string } {
  switch ((priority || '').toLowerCase()) {
    case 'urgent': return { label: 'Urgent', color: '#DC2626', bg: '#FEE2E2' };
    case 'high': return { label: 'High', color: '#EA580C', bg: '#FFF7ED' };
    case 'low': return { label: 'Low', color: '#6B7280', bg: '#F3F4F6' };
    default: return { label: 'Normal', color: '#2563EB', bg: '#EFF6FF' };
  }
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return dateStr; }
}

// Build the enriched task_assigned email HTML
function buildTaskAssignedHtml(data: NotificationPayload, actionUrl: string, appUrl: string): string {
  const meta = (data.metadata || {}) as Record<string, any>;
  const priority = getPriorityConfig(meta.priority);
  const year = new Date().getFullYear();

  // Build context rows for the deal card
  let dealCardHtml = '';
  if (meta.deal_name) {
    const dealRows: string[] = [];
    const addRow = (label: string, value: string | null | undefined) => {
      if (value) dealRows.push(`
        <tr>
          <td style="padding: 6px 0; color: #94a3b8; font-size: 13px; width: 110px; vertical-align: top;">${label}</td>
          <td style="padding: 6px 0; color: #e2e8f0; font-size: 13px; font-weight: 500;">${value}</td>
        </tr>`);
    };
    addRow('Deal', meta.deal_name);
    if (meta.deal_value) addRow('Value', formatCurrency(meta.deal_value));
    if (meta.deal_stage) addRow('Stage', meta.deal_stage);
    if (meta.deal_status) addRow('Status', meta.deal_status.charAt(0).toUpperCase() + meta.deal_status.slice(1));
    if (meta.deal_pipeline) addRow('Pipeline', meta.deal_pipeline);
    if (meta.deal_manager) addRow('Manager', meta.deal_manager);

    if (dealRows.length > 0) {
      dealCardHtml = `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 20px 0 0 0; background: #1e293b; border-radius: 8px; border: 1px solid #334155;">
          <tr>
            <td style="padding: 16px 20px 6px 20px;">
              <p style="margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; font-weight: 600;">Deal Context</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 4px 20px 16px 20px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                ${dealRows.join('')}
              </table>
            </td>
          </tr>
        </table>`;
    }
  }

  // Lender card
  let lenderCardHtml = '';
  if (meta.lender_name) {
    const lenderRows: string[] = [];
    const addRow = (label: string, value: string | null | undefined) => {
      if (value) lenderRows.push(`
        <tr>
          <td style="padding: 6px 0; color: #94a3b8; font-size: 13px; width: 110px; vertical-align: top;">${label}</td>
          <td style="padding: 6px 0; color: #e2e8f0; font-size: 13px; font-weight: 500;">${value}</td>
        </tr>`);
    };
    addRow('Lender', meta.lender_name);
    if (meta.lender_status) addRow('Status', meta.lender_status);
    if (meta.lender_stage) addRow('Stage', meta.lender_stage);

    lenderCardHtml = `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 12px 0 0 0; background: #1e293b; border-radius: 8px; border: 1px solid #334155;">
        <tr>
          <td style="padding: 16px 20px 6px 20px;">
            <p style="margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; font-weight: 600;">Lender Context</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 4px 20px 16px 20px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              ${lenderRows.join('')}
            </table>
          </td>
        </tr>
      </table>`;
  }

  // Task description section
  const descriptionHtml = meta.task_description
    ? `<p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 12px 0 0 0; padding: 12px 16px; background: #1e293b; border-radius: 6px; border-left: 3px solid #8B5CF6;">${meta.task_description}</p>`
    : '';

  // Due date row
  const dueDateHtml = meta.due_date
    ? `<tr>
        <td style="padding: 10px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="padding-right: 8px; vertical-align: middle; color: #94a3b8; font-size: 16px;">📅</td>
              <td style="color: #94a3b8; font-size: 13px;">Due: <strong style="color: #e2e8f0;">${formatDate(meta.due_date)}</strong></td>
            </tr>
          </table>
        </td>
      </tr>`
    : '';

  // Subtask count
  const subtaskHtml = meta.subtask_count && meta.subtask_count > 0
    ? `<tr>
        <td style="padding: 4px 0 10px 0; color: #94a3b8; font-size: 13px;">
          📋 ${meta.subtask_count} subtask${meta.subtask_count > 1 ? 's' : ''}
        </td>
      </tr>`
    : '';

  // Task type badge
  const taskTypeBadge = meta.task_type && meta.task_type !== 'task'
    ? `<span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; color: #a78bfa; background: rgba(139,92,246,0.15); margin-left: 8px; vertical-align: middle; text-transform: uppercase; letter-spacing: 0.5px;">${meta.task_type}</span>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <title>New Task Assigned</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0f172a;">
  <div style="display: none; max-height: 0; overflow: hidden;">
    ${meta.assigner_name || 'A team member'} assigned you: ${meta.task_title || 'a task'}${data.deal_name ? ` on ${data.deal_name}` : ''}
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #0f172a;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width: 560px; width: 100%;">

          <!-- Logo / Header -->
          <tr>
            <td style="padding: 0 0 24px 0; text-align: center;">
              <span style="font-size: 22px; font-weight: 700; color: #f8fafc; letter-spacing: -0.5px;">naitive</span>
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td style="background: #1a1a2e; border-radius: 12px; border: 1px solid #2d2d52;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">

                <!-- Header bar -->
                <tr>
                  <td style="padding: 28px 28px 0 28px;">
                    <p style="margin: 0 0 16px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #8B5CF6; font-weight: 700;">New Task Assigned</p>
                    <h1 style="margin: 0; font-size: 20px; font-weight: 600; color: #f1f5f9; line-height: 1.3;">
                      ${meta.task_title || 'Untitled Task'}${taskTypeBadge}
                    </h1>
                  </td>
                </tr>

                <!-- Priority + Due date row -->
                <tr>
                  <td style="padding: 16px 28px 0 28px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="padding-right: 12px;">
                          <span style="display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; color: ${priority.color}; background: ${priority.bg};">${priority.label} Priority</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Description -->
                <tr>
                  <td style="padding: 4px 28px 0 28px;">
                    ${descriptionHtml}
                  </td>
                </tr>

                <!-- Meta info: due date, subtasks -->
                <tr>
                  <td style="padding: 12px 28px 0 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      ${dueDateHtml}
                      ${subtaskHtml}
                    </table>
                  </td>
                </tr>

                <!-- Context cards (deal, lender) -->
                <tr>
                  <td style="padding: 4px 28px 0 28px;">
                    ${dealCardHtml}
                    ${lenderCardHtml}
                  </td>
                </tr>

                <!-- Assigned by -->
                <tr>
                  <td style="padding: 20px 28px 0 28px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="width: 36px; height: 36px; border-radius: 18px; background: linear-gradient(135deg, #8B5CF6, #D946EF); text-align: center; vertical-align: middle; color: #fff; font-size: 15px; font-weight: 600;">${(meta.assigner_name || 'T').charAt(0).toUpperCase()}</td>
                        <td style="padding-left: 12px; vertical-align: middle;">
                          <p style="margin: 0; color: #e2e8f0; font-size: 14px; font-weight: 500;">${meta.assigner_name || 'A team member'}</p>
                          ${meta.assigner_email ? `<p style="margin: 2px 0 0 0; color: #64748b; font-size: 12px;">${meta.assigner_email}</p>` : ''}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- CTA Button -->
                <tr>
                  <td style="padding: 24px 28px 28px 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td align="center">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td style="border-radius: 8px; background: linear-gradient(135deg, #8B5CF6 0%, #D946EF 100%);">
                                <a href="${actionUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none;">View Task in Naitive</a>
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
                You're receiving this because you have task assignment notifications enabled.
              </p>
              <p style="color: #475569; font-size: 12px; margin: 0 0 6px 0;">
                © ${year} naitive. All rights reserved.
              </p>
              <p style="color: #475569; font-size: 12px; margin: 0;">
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
</html>`;
}

// Build enriched deal_updated email HTML (dark theme, matching task_assigned style)
function buildDealUpdatedHtml(data: NotificationPayload, actionUrl: string, appUrl: string): string {
  const actor = data.changed_by || 'Someone';
  const year = new Date().getFullYear();
  const timestamp = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const deal = (data as any)._deal_details as Record<string, any> | undefined;

  // Build changes table
  let changesTableHtml = '';
  if (data.changes && data.changes.length > 0) {
    const changeRows = data.changes.map(c => {
      const fieldLabel = c.field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const oldVal = c.old || '—';
      const newVal = c.new || '—';
      return `
        <tr>
          <td style="padding: 10px 14px; border-bottom: 1px solid #2d2d52; color: #94a3b8; font-size: 13px; font-weight: 600; white-space: nowrap; width: 120px; vertical-align: top;">${fieldLabel}</td>
          <td style="padding: 10px 14px; border-bottom: 1px solid #2d2d52; color: #ef4444; font-size: 13px; text-decoration: line-through; opacity: 0.7; vertical-align: top;">${oldVal}</td>
          <td style="padding: 10px 14px; border-bottom: 1px solid #2d2d52; vertical-align: top;">
            <span style="color: #22c55e; font-size: 13px; font-weight: 600;">${newVal}</span>
          </td>
        </tr>`;
    }).join('');

    changesTableHtml = `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 20px 0 0 0; background: #1e293b; border-radius: 8px; border: 1px solid #334155; overflow: hidden;">
        <tr>
          <td style="padding: 14px 14px 6px 14px;">
            <p style="margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; font-weight: 600;">📝 What Changed</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 0 0 4px 0;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <thead>
                <tr style="background: #0f172a;">
                  <th style="padding: 8px 14px; text-align: left; font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; border-bottom: 1px solid #2d2d52;">Field</th>
                  <th style="padding: 8px 14px; text-align: left; font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; border-bottom: 1px solid #2d2d52;">Before</th>
                  <th style="padding: 8px 14px; text-align: left; font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; border-bottom: 1px solid #2d2d52;">After</th>
                </tr>
              </thead>
              <tbody>
                ${changeRows}
              </tbody>
            </table>
          </td>
        </tr>
      </table>`;
  }

  // Build deal context card from enriched data
  let dealCardHtml = '';
  if (deal) {
    const fmtCurrency = (val: number | null | undefined) => val != null
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val)
      : null;
    const dealFields: Array<[string, string | null]> = [
      ['Company', deal.company || null],
      ['Amount', fmtCurrency(deal.value)],
      ['Stage', deal.stage ? deal.stage.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) : null],
      ['Status', deal.status ? deal.status.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) : null],
      ['Manager', deal.manager || null],
      ['Deal Owner', deal.deal_owner || null],
      ['Analyst', deal.analyst || null],
      ['Engagement', deal.engagement_type ? deal.engagement_type.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) : null],
      ['Contact', deal.contact || null],
      ['Referred By', deal.referred_by || null],
    ];
    const visible = dealFields.filter(([, v]) => v != null && v !== '');

    if (visible.length > 0) {
      // Build two-column grid for deal fields
      const rows: string[] = [];
      for (let i = 0; i < visible.length; i += 2) {
        const left = visible[i];
        const right = visible[i + 1];
        rows.push(`
          <tr>
            <td style="padding: 5px 0; color: #64748b; font-size: 12px; width: 80px; vertical-align: top;">${left[0]}</td>
            <td style="padding: 5px 12px 5px 0; color: #e2e8f0; font-size: 13px; font-weight: 500; vertical-align: top;">${left[1]}</td>
            ${right ? `
              <td style="padding: 5px 0; color: #64748b; font-size: 12px; width: 80px; vertical-align: top;">${right[0]}</td>
              <td style="padding: 5px 0; color: #e2e8f0; font-size: 13px; font-weight: 500; vertical-align: top;">${right[1]}</td>
            ` : '<td></td><td></td>'}
          </tr>`);
      }

      dealCardHtml = `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 20px 0 0 0; background: #1e293b; border-radius: 8px; border: 1px solid #334155;">
          <tr>
            <td style="padding: 14px 20px 6px 20px;">
              <p style="margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; font-weight: 600;">📋 Current Deal Snapshot</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 4px 20px 16px 20px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                ${rows.join('')}
              </table>
            </td>
          </tr>
          ${deal.narrative ? `
          <tr>
            <td style="padding: 0 20px 16px 20px; border-top: 1px solid #334155;">
              <p style="margin: 10px 0 4px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 600;">Narrative</p>
              <p style="margin: 0; color: #94a3b8; font-size: 13px; line-height: 1.5;">${(deal.narrative as string).substring(0, 300)}${(deal.narrative as string).length > 300 ? '…' : ''}</p>
            </td>
          </tr>` : ''}
        </table>`;
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <title>Deal Updated</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0f172a;">
  <div style="display: none; max-height: 0; overflow: hidden;">
    ${actor} updated ${data.deal_name || 'a deal'}${data.changes && data.changes.length > 0 ? ': ' + data.changes.map(c => c.field).join(', ') : ''}
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #0f172a;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width: 560px; width: 100%;">

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
                    <p style="margin: 0 0 6px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #8B5CF6; font-weight: 700;">Deal Updated</p>
                    <h1 style="margin: 0; font-size: 22px; font-weight: 600; color: #f1f5f9; line-height: 1.3;">${data.deal_name || 'Untitled Deal'}</h1>
                  </td>
                </tr>

                <!-- Actor + Timestamp -->
                <tr>
                  <td style="padding: 16px 28px 0 28px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="width: 32px; height: 32px; border-radius: 16px; background: linear-gradient(135deg, #8B5CF6, #D946EF); text-align: center; vertical-align: middle; color: #fff; font-size: 14px; font-weight: 600;">${actor.charAt(0).toUpperCase()}</td>
                        <td style="padding-left: 10px; vertical-align: middle;">
                          <p style="margin: 0; color: #e2e8f0; font-size: 14px; font-weight: 500;">${actor}</p>
                          <p style="margin: 2px 0 0 0; color: #64748b; font-size: 12px;">${timestamp}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Changes Table -->
                <tr>
                  <td style="padding: 4px 28px 0 28px;">
                    ${changesTableHtml || '<p style="color: #94a3b8; font-size: 14px; margin: 16px 0 0 0;">Deal details were updated.</p>'}
                  </td>
                </tr>

                <!-- Deal Context Card -->
                <tr>
                  <td style="padding: 4px 28px 0 28px;">
                    ${dealCardHtml}
                  </td>
                </tr>

                <!-- CTA Button -->
                <tr>
                  <td style="padding: 24px 28px 28px 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td align="center">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td style="border-radius: 8px; background: linear-gradient(135deg, #8B5CF6 0%, #D946EF 100%);">
                                <a href="${actionUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none;">View Deal in Naitive</a>
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
                You're receiving this because you have deal update notifications enabled.
              </p>
              <p style="color: #475569; font-size: 12px; margin: 0 0 6px 0;">
                © ${year} naitive. All rights reserved.
              </p>
              <p style="color: #475569; font-size: 12px; margin: 0;">
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
</html>`;
}

const notificationTemplates: Record<string, { subject: string; getMessage: (data: NotificationPayload) => string; buildDetailHtml?: (data: Record<string, any>) => string }> = {
  deal_created: {
    subject: 'New Deal Created',
    getMessage: (data) => buildChangeSummary(data) || `A new deal "${data.deal_name}" has been created.`,
    buildDetailHtml: (data: Record<string, any>) => {
      const deal = data._deal_details as Record<string, any> | undefined;
      if (!deal) return '';

      const fmtCurrency = (val: number | null | undefined) => val != null
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val)
        : null;

      const fields: Array<[string, string | null]> = [
        ['Deal Name', deal.company || data.deal_name || null],
        ['Amount', fmtCurrency(deal.value)],
        ['Deal Type', deal.deal_type],
        ['Stage', deal.stage],
        ['Manager', deal.manager],
        ['Deal Owner', deal.deal_owner],
        ['Analyst', deal.analyst],
        ['Engagement', deal.engagement_type],
        ['Business Model', deal.business_model],
        ['Contact', deal.contact],
        ['Contact Info', deal.contact_info],
        ['Referred By', deal.referred_by],
        ['Sourced Via', deal.sourced_via],
      ];
      const visibleFields = fields.filter(([, v]) => v != null && v !== '');

      const narrativeHtml = deal.narrative
        ? `<tr><td style="padding: 12px 16px; border-top: 1px solid #eee;">
            <p style="margin: 0 0 4px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; font-weight: 600;">Narrative</p>
            <p style="margin: 0; color: #4a4a4a; font-size: 14px; line-height: 1.6;">${deal.narrative}</p>
          </td></tr>`
        : '';

      return `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 20px 0 0 0; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background: #f3f0ff; padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
              <strong style="color: #1a1a1a; font-size: 15px;">📋 Deal Details</strong>
            </td>
          </tr>
          ${visibleFields.length > 0 ? `<tr><td style="padding: 12px 16px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              ${visibleFields.map(([label, value]) => `<tr>
                <td style="padding: 5px 0; color: #6b7280; font-size: 13px; width: 120px; vertical-align: top; font-weight: 600;">${label}</td>
                <td style="padding: 5px 0; color: #1a1a1a; font-size: 13px; vertical-align: top;">${value}</td>
              </tr>`).join('')}
            </table>
          </td></tr>` : ''}
          ${narrativeHtml}
        </table>`;
    },
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
    buildDetailHtml: (data: Record<string, any>) => {
      const summaries = data.lender_summaries as Array<Record<string, any>> | undefined;
      if (!summaries || summaries.length === 0) return '';

      const submittedAt = data.submitted_at
        ? new Date(data.submitted_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
        : null;

      const fmtCurrency = (val: number | null | undefined) => val != null ? `$${Number(val).toLocaleString()}` : null;
      const fmtArray = (arr: string[] | null | undefined) => arr && arr.length > 0 ? arr.join(', ') : null;

      let html = submittedAt
        ? `<p style="color: #888; font-size: 12px; margin: 0 0 16px 0;">Submitted: ${submittedAt}</p>`
        : '';

      for (const lender of summaries) {
        const fields: Array<[string, string | null]> = [
          ['Type', lender.lender_type],
          ['Contact', [lender.contact_name, lender.contact_title].filter(Boolean).join(', ') || null],
          ['Email', lender.email],
          ['Loan Types', fmtArray(lender.loan_types)],
          ['Deal Size', lender.min_deal != null || lender.max_deal != null
            ? `${fmtCurrency(lender.min_deal) || '—'} – ${fmtCurrency(lender.max_deal) || '—'}`
            : null],
          ['Min Revenue', fmtCurrency(lender.min_revenue)],
          ['Geography', lender.geo],
          ['Tier', lender.tier],
          ['Industries', fmtArray(lender.industries)],
        ];
        const visibleFields = fields.filter(([, v]) => v != null);

        html += `
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 16px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
            <tr>
              <td style="background: #f3f0ff; padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
                <strong style="color: #1a1a1a; font-size: 15px;">${lender.name}</strong>
              </td>
            </tr>
            ${visibleFields.length > 0 ? `<tr><td style="padding: 12px 16px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                ${visibleFields.map(([label, value]) => `<tr>
                  <td style="padding: 4px 0; color: #6b7280; font-size: 13px; width: 110px; vertical-align: top;">${label}</td>
                  <td style="padding: 4px 0; color: #1a1a1a; font-size: 13px; vertical-align: top;">${value}</td>
                </tr>`).join('')}
              </table>
            </td></tr>` : ''}
          </table>`;
      }
      return html;
    },
  },
  task_assigned: {
    subject: 'New Task Assigned',
    getMessage: (data) => {
      const meta = (data.metadata || {}) as Record<string, any>;
      const assigner = meta.assigner_name || 'A team member';
      const taskTitle = meta.task_title || 'a task';
      let msg = `${assigner} assigned you a task: "${taskTitle}"`;
      if (data.deal_name) msg += ` on deal "${data.deal_name}"`;
      msg += '.';
      if (meta.task_description) msg += ` Details: ${meta.task_description}`;
      if (meta.due_date) msg += ` Due: ${meta.due_date}.`;
      return msg;
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
  task_assigned: 'email_task_assigned',
};

// Event types that should be batched into the digest email instead of sent immediately
const BATCHED_EVENT_TYPES = new Set([
  'deal_created', 'deal_updated', 'stage_changed',
  'lender_added', 'lender_updated',
  'milestone_added', 'milestone_completed', 'milestone_missed',
]);

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

    // --- BATCHING: Queue deal-related events into pending_deal_notifications ---
    if (BATCHED_EVENT_TYPES.has(payload.type) && payload.deal_id) {
      // Resolve company_id from the deal
      const { data: dealData } = await supabaseAdmin
        .from('deals')
        .select('company_id, company')
        .eq('id', payload.deal_id)
        .single();

      if (dealData?.company_id) {
        // Resolve actor name
        let actorName = payload.changed_by || null;
        let actorId: string | null = null;

        // Try to resolve the actor user ID from changed_by display name
        if (payload.changed_by) {
          const { data: actorProfile } = await supabaseAdmin
            .from('profiles')
            .select('user_id')
            .ilike('display_name', payload.changed_by)
            .maybeSingle();
          if (actorProfile) actorId = actorProfile.user_id;
        }
        if (!actorId) actorId = payload.user_id || null;

        // Build change_summary from payload.changes array
        const changeSummary: Record<string, any> = {};
        if (payload.changes) {
          for (const c of payload.changes) {
            changeSummary[c.field] = { from: c.old || null, to: c.new || null };
          }
        }
        // For stage_changed, add old/new values
        if (payload.type === 'stage_changed' && payload.old_value && payload.new_value) {
          changeSummary['stage'] = { from: payload.old_value, to: payload.new_value };
        }

        const entityName = payload.lender_name || payload.milestone_title || dealData.company || null;
        const entityId = (payload.metadata as any)?.lender_id || (payload.metadata as any)?.milestone_id || null;

        const { error: insertError } = await supabaseAdmin
          .from('pending_deal_notifications')
          .insert({
            deal_id: payload.deal_id,
            company_id: dealData.company_id,
            event_type: payload.type,
            entity_name: entityName,
            entity_id: entityId,
            change_summary: changeSummary,
            changed_by: actorId,
            changed_by_name: actorName,
            metadata: {
              deal_name: payload.deal_name || dealData.company,
              ...(payload.metadata || {}),
            },
          });

        if (insertError) {
          console.error("Error queuing deal notification:", insertError);
        } else {
          console.log(`Queued ${payload.type} notification for deal ${payload.deal_id} into batch`);
        }

        return new Response(JSON.stringify({ success: true, queued: true, type: payload.type }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }
    // --- END BATCHING ---

    // --- Resolve recipients ---
    // For lender events: send to ALL admins + deal manager + deal analyst
    // For deal_updated: send to original user + deal analyst
    const isLenderEvent = payload.type === 'lender_added' || payload.type === 'lender_updated';
    const isDealUpdated = payload.type === 'deal_updated';

    interface Recipient { email: string; user_id: string; profile: Record<string, any> }
    const recipients: Recipient[] = [];

    if (isLenderEvent && payload.deal_id) {
      // 1. Fetch deal to get manager, analyst, deal_owner, company_id
      const { data: dealData } = await supabaseAdmin
        .from('deals')
        .select('company, manager, analyst, deal_owner, company_id')
        .eq('id', payload.deal_id)
        .single();

      const companyId = dealData?.company_id;
      const dealManagerName = dealData?.manager || dealData?.deal_owner || null;
      const dealAnalystName = dealData?.analyst || null;

      // 2. Find all admin/owner members for the company
      if (companyId) {
        const { data: adminMembers } = await supabaseAdmin
          .from('company_members')
          .select('user_id, role')
          .eq('company_id', companyId)
          .in('role', ['admin', 'owner']);

        if (adminMembers) {
          for (const m of adminMembers) {
            const { data: p } = await supabaseAdmin.from('profiles').select('*').eq('user_id', m.user_id).single();
            if (p) {
              const { data: u } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
              if (u?.user?.email) {
                recipients.push({ email: u.user.email, user_id: m.user_id, profile: p as Record<string, any> });
              }
            }
          }
        }
      }

      // 3. Find deal manager by display_name match
      if (dealManagerName) {
        const { data: managerProfiles } = await supabaseAdmin
          .from('profiles')
          .select('*')
          .ilike('display_name', dealManagerName);
        if (managerProfiles) {
          for (const p of managerProfiles) {
            if (!recipients.some(r => r.user_id === p.user_id)) {
              const { data: u } = await supabaseAdmin.auth.admin.getUserById(p.user_id);
              if (u?.user?.email) {
                recipients.push({ email: u.user.email, user_id: p.user_id, profile: p as Record<string, any> });
              }
            }
          }
        }
      }

      // 4. Find deal analyst by display_name match
      if (dealAnalystName) {
        const { data: analystProfiles } = await supabaseAdmin
          .from('profiles')
          .select('*')
          .ilike('display_name', dealAnalystName);
        if (analystProfiles) {
          for (const p of analystProfiles) {
            if (!recipients.some(r => r.user_id === p.user_id)) {
              const { data: u } = await supabaseAdmin.auth.admin.getUserById(p.user_id);
              if (u?.user?.email) {
                recipients.push({ email: u.user.email, user_id: p.user_id, profile: p as Record<string, any> });
              }
            }
          }
        }
      }

      // 5. Always include the original user_id (deal creator) as fallback
      if (!recipients.some(r => r.user_id === payload.user_id)) {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(payload.user_id);
        const { data: p } = await supabaseAdmin.from('profiles').select('*').eq('user_id', payload.user_id).single();
        if (u?.user?.email && p) {
          recipients.push({ email: u.user.email, user_id: payload.user_id, profile: p as Record<string, any> });
        }
      }

      console.log(`Lender event: resolved ${recipients.length} recipients for deal ${payload.deal_id}`);
    } else if (isDealUpdated && payload.deal_id) {
      // Deal updated: send to original user + analyst(s) tagged on the deal
      // 1. Add the original user (deal owner / person who triggered)
      const { data: origUser } = await supabaseAdmin.auth.admin.getUserById(payload.user_id);
      const { data: origProfile } = await supabaseAdmin.from('profiles').select('*').eq('user_id', payload.user_id).single();
      if (origUser?.user?.email && origProfile) {
        recipients.push({ email: origUser.user.email, user_id: payload.user_id, profile: origProfile as Record<string, any> });
      }

      // 2. Fetch deal analyst name
      const { data: dealData } = await supabaseAdmin
        .from('deals')
        .select('analyst')
        .eq('id', payload.deal_id)
        .single();

      const dealAnalystName = dealData?.analyst || null;

      // 3. Resolve analyst by display_name match and add if not already a recipient
      if (dealAnalystName) {
        const { data: analystProfiles } = await supabaseAdmin
          .from('profiles')
          .select('*')
          .ilike('display_name', dealAnalystName);
        if (analystProfiles) {
          for (const p of analystProfiles) {
            if (!recipients.some(r => r.user_id === p.user_id)) {
              const { data: u } = await supabaseAdmin.auth.admin.getUserById(p.user_id);
              if (u?.user?.email) {
                recipients.push({ email: u.user.email, user_id: p.user_id, profile: p as Record<string, any> });
              }
            }
          }
        }
      }

      console.log(`Deal updated: resolved ${recipients.length} recipients for deal ${payload.deal_id}`);
    } else {
      // Non-lender, non-deal-updated events: single recipient (original behavior)
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
      recipients.push({ email: userData.user.email, user_id: payload.user_id, profile: profileData });
    }

    if (recipients.length === 0) {
      console.log("No recipients resolved");
      return new Response(JSON.stringify({ skipped: true, reason: "no_recipients" }), {
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

    // Enrich deal_created and deal_updated with full deal details from DB
    if ((payload.type === 'deal_created' || payload.type === 'deal_updated') && payload.deal_id) {
      try {
        const { data: dealData } = await supabaseAdmin
          .from('deals')
          .select('company, value, deal_type, stage, status, manager, deal_owner, analyst, engagement_type, business_model, contact, contact_info, narrative, referred_by, sourced_via')
          .eq('id', payload.deal_id)
          .single();
        if (dealData) {
          (payload as any)._deal_details = dealData;
        }
      } catch (e) {
        console.log("Could not fetch deal details for enrichment:", e);
      }
    }

    // --- Resolve human-readable labels for stage IDs ---
    // Build label maps from company config + deal pipeline stages + hardcoded defaults
    const labelMap: Record<string, string> = {
      // Default deal stages
      'final-credit-items': 'Final Credit Items',
      'client-strategy-review': 'Client Strategy Review',
      'write-up-pending': 'Write-Up Pending',
      'submitted-to-lenders': 'Submitted to Lenders',
      'lenders-in-review': 'Lenders in Review',
      'terms-issued': 'Terms Issued',
      'in-due-diligence': 'In Due Diligence',
      'funded-invoiced': 'Funded / Invoiced',
      'closed-won': 'Closed Won',
      'closed-lost': 'Closed Lost',
      'on-hold': 'On Hold',
      // Default lender stages
      'reviewing-drl': 'Reviewing DRL',
      'management-call-set': 'Management Call Set',
      'management-call-completed': 'Management Call Completed',
      'draft-terms': 'Draft Terms',
      'term-sheets': 'Term Sheets',
      // Default lender tracking statuses
      'active': 'Active',
      'on-deck': 'On Deck',
      'passed': 'Passed',
      'not-a-fit': 'Not a Fit',
      'excluded': 'Excluded',
      'direct': 'Direct',
      // Deal statuses
      'on-track': 'On Track',
      'at-risk': 'At Risk',
      'off-track': 'Off Track',
      'archived': 'Archived',
    };

    // Try to load company-specific stage configs
    try {
      let companyId: string | null = null;
      if (payload.deal_id) {
        const { data: d } = await supabaseAdmin.from('deals').select('company_id, pipeline_id').eq('id', payload.deal_id).single();
        companyId = d?.company_id || null;

        // Load pipeline stages for this deal's pipeline
        if (d?.pipeline_id) {
          const { data: pipeline } = await supabaseAdmin.from('deal_pipelines').select('stages').eq('id', d.pipeline_id).single();
          if (pipeline?.stages && Array.isArray(pipeline.stages)) {
            for (const s of pipeline.stages as any[]) {
              if (s.id && s.label) labelMap[s.id] = s.label;
            }
          }
        }

        // Load all company pipeline stages as fallback
        if (companyId) {
          const { data: pipelines } = await supabaseAdmin.from('deal_pipelines').select('stages').eq('company_id', companyId);
          if (pipelines) {
            for (const p of pipelines) {
              if (p.stages && Array.isArray(p.stages)) {
                for (const s of p.stages as any[]) {
                  if (s.id && s.label && !labelMap[s.id]) labelMap[s.id] = s.label;
                }
              }
            }
          }

          // Load company deal stages from company_settings
          const { data: cs } = await supabaseAdmin.from('company_settings').select('deal_stages').eq('company_id', companyId).maybeSingle();
          if (cs?.deal_stages && Array.isArray(cs.deal_stages)) {
            for (const s of cs.deal_stages as any[]) {
              if (s.id && s.label && !labelMap[s.id]) labelMap[s.id] = s.label;
            }
          }

          // Load lender stage configs
          const { data: lc } = await supabaseAdmin.from('lender_stage_configs').select('stages, substages, tracking_statuses').eq('company_id', companyId).maybeSingle();
          if (lc) {
            for (const s of ((lc.stages as any[]) || [])) {
              if (s.id && s.label) labelMap[s.id] = s.label;
            }
            for (const s of ((lc.substages as any[]) || [])) {
              if (s.id && s.label) labelMap[s.id] = s.label;
            }
            for (const s of ((lc.tracking_statuses as any[]) || [])) {
              if (s.id && s.label) labelMap[s.id] = s.label;
            }
          }
        }
      }
    } catch (e) {
      console.log("Could not load stage label configs:", e);
    }

    // Helper to resolve a value to its label
    const resolveLabel = (val: string | undefined | null): string | undefined | null => {
      if (!val) return val;
      if (labelMap[val]) return labelMap[val];
      // Fallback: convert kebab-case to Title Case
      if (val.match(/^[a-z0-9-]+$/) && val.includes('-')) {
        return val.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      }
      return val;
    };

    // Resolve labels in changes array
    if (payload.changes) {
      for (const c of payload.changes) {
        const fieldLower = c.field.toLowerCase();
        if (fieldLower.includes('stage') || fieldLower.includes('status') || fieldLower === 'tracking' || fieldLower === 'milestone') {
          c.old = resolveLabel(c.old) ?? c.old;
          c.new = resolveLabel(c.new) ?? c.new;
        }
      }
    }

    // Resolve labels in old_value/new_value (used for stage_changed)
    if (payload.old_value) payload.old_value = resolveLabel(payload.old_value) ?? payload.old_value;
    if (payload.new_value) payload.new_value = resolveLabel(payload.new_value) ?? payload.new_value;

    // Resolve deal snapshot stage
    if ((payload as any)._deal_details?.stage) {
      (payload as any)._deal_details.stage = resolveLabel((payload as any)._deal_details.stage) ?? (payload as any)._deal_details.stage;
    }
    if ((payload as any)._deal_details?.status) {
      (payload as any)._deal_details.status = resolveLabel((payload as any)._deal_details.status) ?? (payload as any)._deal_details.status;
    }

    const message = template.getMessage(payload);
    const changesHtml = buildChangesHtml(payload.changes);
    const changesText = buildChangesText(payload.changes);
    const appUrl = "https://naitive.co";
    const dealUrl = payload.deal_id ? `${appUrl}/deal/${payload.deal_id}` : null;
    let actionUrl: string | null = dealUrl;
    let actionLabel = 'View Deal';
    let emailSubject = `naitive: ${template.subject}${payload.deal_name ? ` – ${payload.deal_name}` : ''}`;

    if (payload.type === 'task_assigned') {
      const meta = (payload.metadata || {}) as Record<string, any>;
      actionUrl = meta.action_url || `${appUrl}/tasks`;
      actionLabel = 'View Task in Naitive';
      emailSubject = `[Naitive] New Task: ${meta.task_title || 'Untitled'}${payload.deal_name ? ` — ${payload.deal_name}` : ''}`;
    } else if (payload.type === 'new_suggestions') {
      actionUrl = payload.agent_suggestion_count && payload.agent_suggestion_count > 0
        ? `${appUrl}/agents`
        : `${appUrl}/workflows`;
      actionLabel = 'View Recommendations';
    } else if (payload.type === 'flex_lender_sync') {
      actionUrl = `${appUrl}/lenders`;
      actionLabel = 'Review Sync Requests';
    }

    // Build HTML body — use enriched template for task_assigned, standard for others
    let emailHtml: string;

    if (payload.type === 'task_assigned') {
      emailHtml = buildTaskAssignedHtml(payload, actionUrl || appUrl, appUrl);
    } else if (payload.type === 'deal_updated') {
      emailHtml = buildDealUpdatedHtml(payload, actionUrl || appUrl, appUrl);
    } else {
      const actorHtml = payload.changed_by
        ? `<p style="color: #888; font-size: 13px; margin: 0 0 16px 0;">By: <strong style="color: #555;">${payload.changed_by}</strong> · ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>`
        : '';

      emailHtml = `
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
                      ${'buildDetailHtml' in template && typeof template.buildDetailHtml === 'function' ? template.buildDetailHtml(payload) : ''}
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
      `;
    }

    // --- Send to all recipients ---
    const preferenceKey = preferenceMap[payload.type];
    const results: any[] = [];
    // Defense-in-depth: when this notification is a workflow follow-up
    // (subject prefixed "Follow-up:" or type === 'workflow_action'),
    // never deliver to internal @5thline.co addresses. Briefings, weekly
    // summaries and other intentional-internal emails use different types
    // and are not affected.
    const suppressionEnabled =
      (Deno.env.get("EMAIL_INTERNAL_SUPPRESSION_ENABLED") ?? "true").toLowerCase() !== "false";
    const isWorkflowFollowup =
      (payload as any).type === "workflow_action" ||
      /^Follow-?up:/i.test(String((payload as any)?.metadata?.subject || ""));
    for (const recipient of recipients) {
      if (
        suppressionEnabled &&
        isWorkflowFollowup &&
        recipient.email.toLowerCase().endsWith("@5thline.co")
      ) {
        console.log(
          `[email] internal_user_suppressed recipient=${recipient.email} subject="${emailSubject}" deal_id=${payload.deal_id ?? ""}`
        );
        try {
          await supabaseAdmin.from("email_suppression_log").insert({
            intended_recipient: recipient.email.toLowerCase(),
            reason: "internal_user_suppressed",
            template: (payload as any)?.metadata?.template ?? null,
            function_name: "send-notification-email",
            deal_id: payload.deal_id ?? null,
            subject: emailSubject,
            metadata: { payload_type: payload.type },
          });
        } catch (logErr) {
          console.error("[email] suppression_log insert failed:", logErr);
        }
        results.push({ email: recipient.email, skipped: true, reason: "internal_user_suppressed" });
        continue;
      }
      // Check per-recipient notification preferences
      const profileData = recipient.profile;
      if (!profileData.email_notifications || (preferenceKey && !profileData[preferenceKey])) {
        console.log(`Skipping ${recipient.email}: notifications disabled`);
        results.push({ email: recipient.email, skipped: true, reason: 'notifications_disabled' });
        continue;
      }

      try {
        const emailResponse = await resend.emails.send({
          from: buildFrom("naitive"),
          reply_to: "support@naitive.co",
          to: [recipient.email],
          subject: emailSubject,
          headers: {
            "List-Unsubscribe": `<${appUrl}/unsubscribe>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
          text: `${template.subject}\n\n${message}${payload.changed_by ? `\nBy: ${payload.changed_by}` : ''}${changesText}\n\n${dealUrl ? `View Deal: ${dealUrl}\n\n` : ''}---\nnaitive - Manage preferences: ${appUrl}/settings | Unsubscribe: ${appUrl}/unsubscribe`,
          html: emailHtml,
        });
        console.log(`Email sent to ${recipient.email}:`, emailResponse);
        results.push({ email: recipient.email, success: true, emailResponse });
      } catch (sendErr: any) {
        console.error(`Failed to send to ${recipient.email}:`, sendErr);
        results.push({ email: recipient.email, success: false, error: sendErr.message });
      }
    }

    return new Response(JSON.stringify({ success: true, recipients: results.length, results }), {
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
