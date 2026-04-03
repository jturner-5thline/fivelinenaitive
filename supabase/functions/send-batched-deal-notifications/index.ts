import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_WINDOW_MINUTES = 15;

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

interface DealRow {
  id: string;
  company: string;
  manager: string | null;
  analyst: string | null;
  deal_owner: string | null;
  company_id: string;
  value: number | null;
  stage: string | null;
  status: string | null;
  pipeline_id: string | null;
}

function resolveLabel(val: string | null | undefined, labels: Record<string, string>): string {
  if (!val) return '—';
  if (labels[val]) return labels[val];
  if (val.match(/^[a-z0-9-]+$/) && val.includes('-')) {
    return val.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
  return val;
}

function formatCurrency(val: number | null | undefined): string {
  if (!val) return '—';
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}

function statusColor(status: string | null): string {
  switch (status) {
    case 'on-track': return '#22c55e';
    case 'at-risk': return '#f59e0b';
    case 'off-track': return '#ef4444';
    case 'on-hold': return '#94a3b8';
    default: return '#64748b';
  }
}

function statusDot(status: string | null, labels: Record<string, string>): string {
  const color = statusColor(status);
  const label = resolveLabel(status, labels);
  return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:6px;vertical-align:middle;"></span><span style="color:${color};font-size:12px;font-weight:600;">${label}</span>`;
}

function stageBadge(stage: string | null, labels: Record<string, string>): string {
  return `<span style="background:#334155;color:#e2e8f0;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:500;display:inline-block;">${resolveLabel(stage, labels)}</span>`;
}

function trackingBadge(status: string, labels: Record<string, string>): string {
  const colors: Record<string, string> = {
    'active': '#22c55e', 'on-hold': '#f59e0b', 'on-deck': '#3b82f6', 'passed': '#64748b',
  };
  const c = colors[status] || '#64748b';
  return `<span style="background:${c}22;color:${c};padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;display:inline-block;">${resolveLabel(status, labels)}</span>`;
}

function changeBadge(from: string, to: string, labels: Record<string, string>): string {
  return `<span style="color:#94a3b8;font-size:11px;">${resolveLabel(from, labels)}</span> <span style="color:#64748b;font-size:11px;">→</span> <span style="color:#f1f5f9;font-size:11px;font-weight:600;">${resolveLabel(to, labels)}</span>`;
}

interface DealLenderInfo {
  total: number;
  active: number;
  passed: number;
  onDeck: number;
}

// Build detailed activity block for a deal
function buildActivityBlock(notifications: PendingNotification[], labels: Record<string, string>): string {
  if (!notifications || notifications.length === 0) return '';
  
  const items: string[] = [];
  
  for (const n of notifications) {
    const cs = n.change_summary || {};
    const byName = n.changed_by_name ? `<span style="color:#94a3b8;font-size:11px;"> by ${n.changed_by_name}</span>` : '';
    
    if (n.event_type === 'lender_added') {
      items.push(`<tr><td style="padding:4px 0;vertical-align:top;"><span style="color:#22c55e;font-size:12px;font-weight:600;">＋</span></td><td style="padding:4px 0 4px 8px;font-size:12px;color:#e2e8f0;"><strong>${n.entity_name || 'Lender'}</strong> added${byName}</td></tr>`);
    } else if (n.event_type === 'lender_removed') {
      items.push(`<tr><td style="padding:4px 0;vertical-align:top;"><span style="color:#ef4444;font-size:12px;font-weight:600;">−</span></td><td style="padding:4px 0 4px 8px;font-size:12px;color:#e2e8f0;"><strong>${n.entity_name || 'Lender'}</strong> removed${byName}</td></tr>`);
    } else if (n.event_type === 'lender_updated') {
      const changes: string[] = [];
      if (cs.stage) changes.push(`Stage: ${changeBadge(cs.stage.from, cs.stage.to, labels)}`);
      if (cs.substage) changes.push(`Substage: ${changeBadge(cs.substage.from, cs.substage.to, labels)}`);
      if (cs.tracking_status) changes.push(`Tracking: ${changeBadge(cs.tracking_status.from, cs.tracking_status.to, labels)}`);
      if (cs.score) changes.push(`Score: <span style="color:#f59e0b;font-size:11px;">${cs.score.from || '—'} → ${cs.score.to || '—'}</span>`);
      if (cs.notes) changes.push(`<span style="color:#94a3b8;font-size:11px;">Notes updated</span>`);
      if (changes.length === 0) changes.push(`<span style="color:#94a3b8;font-size:11px;">Updated</span>`);
      items.push(`<tr><td style="padding:4px 0;vertical-align:top;"><span style="color:#8B5CF6;font-size:11px;">●</span></td><td style="padding:4px 0 4px 8px;font-size:12px;color:#e2e8f0;"><strong>${n.entity_name || 'Lender'}</strong>: ${changes.join(' · ')}${byName}</td></tr>`);
    } else if (n.event_type === 'deal_updated' || n.event_type === 'stage_changed') {
      const changes: string[] = [];
      if (cs.stage) changes.push(`Stage: ${changeBadge(cs.stage.from, cs.stage.to, labels)}`);
      if (cs.status) changes.push(`Status: ${changeBadge(cs.status.from, cs.status.to, labels)}`);
      if (cs.value) changes.push(`Value: ${formatCurrency(cs.value.from)} → ${formatCurrency(cs.value.to)}`);
      if (cs.manager) changes.push(`Manager: ${cs.manager.from || '—'} → ${cs.manager.to || '—'}`);
      if (cs.analyst) changes.push(`Analyst: ${cs.analyst.from || '—'} → ${cs.analyst.to || '—'}`);
      if (cs.engagement_type) changes.push(`Engagement: ${changeBadge(cs.engagement_type.from, cs.engagement_type.to, labels)}`);
      // Catch any other field changes
      for (const [field, val] of Object.entries(cs)) {
        if (['stage','status','value','manager','analyst','engagement_type'].includes(field)) continue;
        const v = val as any;
        if (v?.from !== undefined || v?.to !== undefined) {
          const fieldLabel = field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          changes.push(`${fieldLabel}: ${changeBadge(String(v.from || '—'), String(v.to || '—'), labels)}`);
        }
      }
      if (changes.length > 0) {
        items.push(`<tr><td style="padding:4px 0;vertical-align:top;"><span style="color:#3b82f6;font-size:11px;">●</span></td><td style="padding:4px 0 4px 8px;font-size:12px;color:#e2e8f0;">${changes.join('<br/>')}${byName}</td></tr>`);
      }
    } else if (n.event_type === 'milestone_completed') {
      items.push(`<tr><td style="padding:4px 0;vertical-align:top;"><span style="font-size:12px;">✅</span></td><td style="padding:4px 0 4px 8px;font-size:12px;color:#e2e8f0;"><strong>${n.entity_name || 'Milestone'}</strong> completed${byName}</td></tr>`);
    } else if (n.event_type === 'milestone_missed') {
      items.push(`<tr><td style="padding:4px 0;vertical-align:top;"><span style="font-size:12px;">⚠️</span></td><td style="padding:4px 0 4px 8px;font-size:12px;color:#e2e8f0;"><strong>${n.entity_name || 'Milestone'}</strong> missed deadline${byName}</td></tr>`);
    } else if (n.event_type === 'milestone_added') {
      items.push(`<tr><td style="padding:4px 0;vertical-align:top;"><span style="color:#22c55e;font-size:12px;">＋</span></td><td style="padding:4px 0 4px 8px;font-size:12px;color:#e2e8f0;">Milestone added: <strong>${n.entity_name || 'New'}</strong>${byName}</td></tr>`);
    } else if (n.event_type === 'deal_created') {
      items.push(`<tr><td style="padding:4px 0;vertical-align:top;"><span style="color:#22c55e;font-size:12px;">★</span></td><td style="padding:4px 0 4px 8px;font-size:12px;color:#e2e8f0;">Deal created${byName}</td></tr>`);
    } else {
      const label = n.event_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      items.push(`<tr><td style="padding:4px 0;vertical-align:top;"><span style="color:#64748b;font-size:11px;">●</span></td><td style="padding:4px 0 4px 8px;font-size:12px;color:#e2e8f0;">${label}${n.entity_name ? `: ${n.entity_name}` : ''}${byName}</td></tr>`);
    }
  }
  
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;">${items.join('')}</table>`;
}

// Build a deal card for the email
function buildDealCard(deal: DealRow, labels: Record<string, string>, activity: PendingNotification[], lenderInfo: DealLenderInfo | null): string {
  const hasActivity = activity.length > 0;
  const borderColor = hasActivity ? '#8B5CF6' : '#1e293b';
  
  // Deal header row
  let lenderLine = '';
  if (lenderInfo && lenderInfo.total > 0) {
    const parts: string[] = [];
    parts.push(`<span style="color:#e2e8f0;font-weight:600;">${lenderInfo.total}</span> <span style="color:#94a3b8;">total</span>`);
    if (lenderInfo.active > 0) parts.push(`<span style="color:#22c55e;font-weight:600;">${lenderInfo.active}</span> <span style="color:#94a3b8;">active</span>`);
    if (lenderInfo.onDeck > 0) parts.push(`<span style="color:#3b82f6;font-weight:600;">${lenderInfo.onDeck}</span> <span style="color:#94a3b8;">on deck</span>`);
    if (lenderInfo.passed > 0) parts.push(`<span style="color:#64748b;font-weight:600;">${lenderInfo.passed}</span> <span style="color:#94a3b8;">passed</span>`);
    lenderLine = `<div style="margin-top:6px;font-size:11px;">Lenders: ${parts.join(' · ')}</div>`;
  }

  const activityHtml = buildActivityBlock(activity, labels);
  const activitySection = activityHtml
    ? `<tr><td style="padding:0 16px 12px 16px;"><div style="background:#0f172a;border-radius:6px;padding:10px 12px;border:1px solid #1e293b;">${activityHtml}</div></td></tr>`
    : '';
  
  const actBadge = hasActivity
    ? `<span style="background:#8B5CF622;color:#c4b5fd;font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;margin-left:8px;">${activity.length} UPDATE${activity.length !== 1 ? 'S' : ''}</span>`
    : '';

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#1a1a2e;border-radius:8px;border:1px solid ${borderColor};margin-bottom:12px;">
    <tr>
      <td style="padding:14px 16px 8px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td>
              <a href="https://fivelinenaitive.lovable.app/deal/${deal.id}" style="color:#f1f5f9;text-decoration:none;font-weight:700;font-size:14px;">${deal.company}</a>${actBadge}
            </td>
            <td style="text-align:right;white-space:nowrap;">
              <span style="color:#e2e8f0;font-weight:600;font-size:13px;">${formatCurrency(deal.value)}</span>
            </td>
          </tr>
        </table>
        <div style="margin-top:8px;">
          ${stageBadge(deal.stage, labels)}
          <span style="margin-left:6px;">${statusDot(deal.status, labels)}</span>
          ${deal.manager ? `<span style="color:#64748b;font-size:11px;margin-left:10px;">👤 ${deal.manager}</span>` : ''}
        </div>
        ${lenderLine}
      </td>
    </tr>
    ${activitySection}
  </table>`;
}

function buildDigestEmailHtml(
  recipientName: string,
  deals: DealRow[],
  activityByDeal: Record<string, PendingNotification[]>,
  labels: Record<string, string>,
  isAdmin: boolean,
  lenderInfoByDeal?: Record<string, DealLenderInfo>,
): string {
  const year = new Date().getFullYear();
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' });

  const dealsWithActivity = deals.filter(d => activityByDeal[d.id]?.length > 0).length;
  const totalActivity = Object.values(activityByDeal).reduce((sum, a) => sum + a.length, 0);
  
  // Count lender stats
  const totalLenders = Object.values(lenderInfoByDeal || {}).reduce((s, l) => s + l.total, 0);
  const activeLenders = Object.values(lenderInfoByDeal || {}).reduce((s, l) => s + l.active, 0);

  // Count event types for summary
  const allEvents = Object.values(activityByDeal).flat();
  const lendersAdded = allEvents.filter(e => e.event_type === 'lender_added').length;
  const lendersUpdated = allEvents.filter(e => e.event_type === 'lender_updated').length;
  const stageChanges = allEvents.filter(e => e.event_type === 'stage_changed' || (e.event_type === 'deal_updated' && e.change_summary?.stage)).length;
  const milestonesCompleted = allEvents.filter(e => e.event_type === 'milestone_completed').length;

  const subtitle = totalActivity > 0
    ? `${dealsWithActivity} deal${dealsWithActivity !== 1 ? 's' : ''} with recent activity · ${totalActivity} update${totalActivity !== 1 ? 's' : ''}`
    : 'No recent activity';

  // Sort: deals with activity first, then alphabetically
  const sorted = [...deals].sort((a, b) => {
    const aAct = (activityByDeal[a.id]?.length || 0) > 0 ? 0 : 1;
    const bAct = (activityByDeal[b.id]?.length || 0) > 0 ? 0 : 1;
    if (aAct !== bAct) return aAct - bAct;
    return a.company.localeCompare(b.company);
  });

  // Split deals into active and quiet
  const activeDeals = sorted.filter(d => (activityByDeal[d.id]?.length || 0) > 0);
  const quietDeals = sorted.filter(d => (activityByDeal[d.id]?.length || 0) === 0);

  const activeDealCards = activeDeals.map(d =>
    buildDealCard(d, labels, activityByDeal[d.id] || [], lenderInfoByDeal?.[d.id] || null)
  ).join('');

  // Quiet deals as compact table
  const quietRows = quietDeals.map(d => {
    const li = lenderInfoByDeal?.[d.id];
    const lenderCol = li ? `${li.active}/${li.total}` : '—';
    return `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #1e293b;font-size:12px;">
        <a href="https://fivelinenaitive.lovable.app/deal/${d.id}" style="color:#cbd5e1;text-decoration:none;font-weight:500;">${d.company}</a>
      </td>
      <td style="padding:6px 6px;border-bottom:1px solid #1e293b;white-space:nowrap;">${stageBadge(d.stage, labels)}</td>
      <td style="padding:6px 6px;border-bottom:1px solid #1e293b;white-space:nowrap;">${statusDot(d.status, labels)}</td>
      <td style="padding:6px 6px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:11px;text-align:center;" title="Active / Total lenders">${lenderCol}</td>
      <td style="padding:6px 6px;border-bottom:1px solid #1e293b;color:#cbd5e1;font-size:11px;text-align:right;white-space:nowrap;">${formatCurrency(d.value)}</td>
    </tr>`;
  }).join('');

  // Activity summary chips
  const summaryChips: string[] = [];
  if (lendersAdded > 0) summaryChips.push(`<span style="background:#22c55e22;color:#4ade80;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-right:6px;">＋${lendersAdded} Lender${lendersAdded !== 1 ? 's' : ''} Added</span>`);
  if (lendersUpdated > 0) summaryChips.push(`<span style="background:#8B5CF622;color:#c4b5fd;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-right:6px;">${lendersUpdated} Lender Update${lendersUpdated !== 1 ? 's' : ''}</span>`);
  if (stageChanges > 0) summaryChips.push(`<span style="background:#3b82f622;color:#93c5fd;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-right:6px;">${stageChanges} Stage Change${stageChanges !== 1 ? 's' : ''}</span>`);
  if (milestonesCompleted > 0) summaryChips.push(`<span style="background:#22c55e22;color:#4ade80;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-right:6px;">✅ ${milestonesCompleted} Milestone${milestonesCompleted !== 1 ? 's' : ''}</span>`);
  const chipsHtml = summaryChips.length > 0 ? `<div style="margin-top:10px;">${summaryChips.join('')}</div>` : '';

  const quietSection = quietDeals.length > 0 ? `
    <!-- Quiet Deals -->
    <tr>
      <td style="padding:16px 24px 0 24px;">
        <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;font-weight:600;">Other Active Deals (${quietDeals.length})</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0f172a;border-radius:8px;border:1px solid #1e293b;">
          <thead>
            <tr>
              <th style="padding:6px 10px;text-align:left;font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #1e293b;font-weight:600;">Deal</th>
              <th style="padding:6px 6px;text-align:left;font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #1e293b;font-weight:600;">Stage</th>
              <th style="padding:6px 6px;text-align:left;font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #1e293b;font-weight:600;">Status</th>
              <th style="padding:6px 6px;text-align:center;font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #1e293b;font-weight:600;">Lenders</th>
              <th style="padding:6px 6px;text-align:right;font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #1e293b;font-weight:600;">Value</th>
            </tr>
          </thead>
          <tbody>${quietRows}</tbody>
        </table>
      </td>
    </tr>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#0f172a;">
  <div style="display:none;max-height:0;overflow:hidden;">
    ${deals.length} Active Deals — ${subtitle}
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#0f172a;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;width:100%;">

          <!-- Logo -->
          <tr>
            <td style="padding:0 0 24px 0;text-align:center;">
              <span style="font-size:22px;font-weight:700;color:#f8fafc;letter-spacing:-0.5px;">naitive</span>
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td style="background:#1a1a2e;border-radius:12px;border:1px solid #2d2d52;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <!-- Header -->
                <tr>
                  <td style="padding:24px 24px 0 24px;">
                    <p style="margin:0 0 4px;font-size:11px;color:#64748b;font-weight:500;">${dateStr} · ${timeStr}</p>
                    <p style="margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#8B5CF6;font-weight:700;">Deal Activity Digest</p>
                    <h1 style="margin:0;font-size:18px;font-weight:600;color:#f1f5f9;">Hi ${recipientName || 'there'},</h1>
                    <p style="margin:6px 0 0;color:#94a3b8;font-size:13px;">${isAdmin ? 'Here\'s your full pipeline overview' : 'Here\'s an overview of your deals'}. ${subtitle}.</p>
                    ${chipsHtml}
                  </td>
                </tr>

                <!-- Summary Stats -->
                <tr>
                  <td style="padding:16px 24px 0 24px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;">
                      <tr>
                        <td style="padding:0 3px 0 0;width:25%;">
                          <div style="background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:10px 12px;text-align:center;">
                            <div style="font-size:20px;font-weight:700;color:#f1f5f9;">${deals.length}</div>
                            <div style="font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Active Deals</div>
                          </div>
                        </td>
                        <td style="padding:0 3px;width:25%;">
                          <div style="background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:10px 12px;text-align:center;">
                            <div style="font-size:20px;font-weight:700;color:#22c55e;">${dealsWithActivity}</div>
                            <div style="font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">With Activity</div>
                          </div>
                        </td>
                        <td style="padding:0 3px;width:25%;">
                          <div style="background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:10px 12px;text-align:center;">
                            <div style="font-size:20px;font-weight:700;color:#c4b5fd;">${totalActivity}</div>
                            <div style="font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Updates</div>
                          </div>
                        </td>
                        <td style="padding:0 0 0 3px;width:25%;">
                          <div style="background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:10px 12px;text-align:center;">
                            <div style="font-size:20px;font-weight:700;color:#60a5fa;">${activeLenders}<span style="color:#64748b;font-size:13px;">/${totalLenders}</span></div>
                            <div style="font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Lenders Active</div>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                ${activeDeals.length > 0 ? `
                <!-- Deals with Activity -->
                <tr>
                  <td style="padding:20px 24px 0 24px;">
                    <p style="margin:0 0 10px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#8B5CF6;font-weight:600;">Recent Activity (${activeDeals.length} deal${activeDeals.length !== 1 ? 's' : ''})</p>
                    ${activeDealCards}
                  </td>
                </tr>` : ''}

                ${quietSection}

                <!-- CTA -->
                <tr>
                  <td style="padding:24px 24px 24px 24px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td align="center">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td style="border-radius:8px;background:linear-gradient(135deg,#8B5CF6 0%,#D946EF 100%);">
                                <a href="https://fivelinenaitive.lovable.app/deals" target="_blank" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">View Pipeline</a>
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
            <td style="padding:24px 0 0 0;text-align:center;">
              <p style="color:#475569;font-size:12px;margin:0 0 6px 0;">© ${year} naitive. All rights reserved.</p>
              <p style="color:#475569;font-size:12px;margin:0;">
                <a href="https://fivelinenaitive.lovable.app/settings" style="color:#8B5CF6;text-decoration:underline;">Manage preferences</a>
                &nbsp;|&nbsp;
                <a href="https://fivelinenaitive.lovable.app/unsubscribe" style="color:#8B5CF6;text-decoration:underline;">Unsubscribe</a>
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

// Merge multiple notifications for the same entity
function mergeByEntity(notifications: PendingNotification[]): PendingNotification[] {
  const byKey: Record<string, PendingNotification[]> = {};
  for (const n of notifications) {
    const key = `${n.event_type}:${n.entity_id || n.entity_name || 'deal'}`;
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push(n);
  }

  const merged: PendingNotification[] = [];
  for (const group of Object.values(byKey)) {
    if (group.length === 1) { merged.push(group[0]); continue; }
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
    for (const [field, val] of Object.entries(mergedChanges)) {
      if ((val as any).from === (val as any).to) delete mergedChanges[field];
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

// Test data generator
function generateTestData() {
  const labels: Record<string, string> = {
    'qualification': 'Qualification', 'due-diligence': 'Due Diligence', 'term-sheet': 'Term Sheet',
    'closing': 'Closing', 'on-track': 'On Track', 'at-risk': 'At Risk', 'off-track': 'Off Track',
    'reviewing-drl': 'Reviewing DRL', 'management-call-set': 'Mgmt Call Set',
    'management-call-completed': 'Mgmt Call Done', 'draft-terms': 'Draft Terms',
  };

  const deals: DealRow[] = [
    { id: '00000000-0000-0000-0000-000000000001', company: 'Phospholutions', manager: 'James Turner', analyst: 'Franco Fustinoni', deal_owner: 'James Turner', company_id: 'test', value: 12500000, stage: 'due-diligence', status: 'on-track', pipeline_id: null },
    { id: '00000000-0000-0000-0000-000000000002', company: 'Acme Software', manager: 'James Turner', analyst: null, deal_owner: 'James Turner', company_id: 'test', value: 5000000, stage: 'term-sheet', status: 'at-risk', pipeline_id: null },
    { id: '00000000-0000-0000-0000-000000000003', company: 'TechServe Holdings', manager: 'James Turner', analyst: 'Franco Fustinoni', deal_owner: 'James Turner', company_id: 'test', value: 8200000, stage: 'qualification', status: 'on-track', pipeline_id: null },
    { id: '00000000-0000-0000-0000-000000000004', company: 'CloudOps Inc.', manager: 'James Turner', analyst: null, deal_owner: 'James Turner', company_id: 'test', value: 3500000, stage: 'closing', status: 'on-track', pipeline_id: null },
    { id: '00000000-0000-0000-0000-000000000005', company: 'DataFlow Analytics', manager: 'James Moffitt', analyst: null, deal_owner: 'James Moffitt', company_id: 'test', value: 6000000, stage: 'due-diligence', status: 'off-track', pipeline_id: null },
  ];

  const now = new Date().toISOString();
  const oneHourAgo = new Date(Date.now() - 60 * 60000).toISOString();

  const activityByDeal: Record<string, PendingNotification[]> = {
    '00000000-0000-0000-0000-000000000001': [
      { id: '1', deal_id: '1', company_id: 'test', event_type: 'lender_updated', entity_name: 'Trinity Capital', entity_id: '2', change_summary: { stage: { from: 'reviewing-drl', to: 'management-call-set' } }, changed_by: null, changed_by_name: 'Franco Fustinoni', metadata: {}, created_at: oneHourAgo },
      { id: '2', deal_id: '1', company_id: 'test', event_type: 'milestone_completed', entity_name: 'NDA Executed', entity_id: '4', change_summary: {}, changed_by: null, changed_by_name: 'Franco Fustinoni', metadata: {}, created_at: now },
    ],
    '00000000-0000-0000-0000-000000000002': [
      { id: '3', deal_id: '2', company_id: 'test', event_type: 'lender_updated', entity_name: 'Hercules Capital', entity_id: '5', change_summary: { stage: { from: 'management-call-completed', to: 'draft-terms' } }, changed_by: null, changed_by_name: 'James Turner', metadata: {}, created_at: oneHourAgo },
    ],
  };

  return { deals, activityByDeal, labels };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let isTestMode = false;
    let testEmail = '';
    try {
      const body = await req.json();
      if (body?.test === true) {
        isTestMode = true;
        testEmail = body.email || 'jturner@5thline.co';
      }
    } catch { /* cron mode */ }

    if (isTestMode) {
      console.log(`Test mode: sending sample digest to ${testEmail}`);
      const { deals, activityByDeal, labels } = generateTestData();

      const emailHtml = buildDigestEmailHtml('James', deals, activityByDeal, labels, true);

      await resend.emails.send({
        from: "naitive <noreply@updates.naitive.co>",
        to: [testEmail],
        subject: `[Test] Pipeline Digest — ${deals.length} Active Deals`,
        html: emailHtml,
        headers: {
          "List-Unsubscribe": "<https://fivelinenaitive.lovable.app/unsubscribe>",
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });

      return new Response(JSON.stringify({ success: true, test: true, email: testEmail }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // ── Normal batched processing mode ──
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log("Processing batched deal notifications...");

    const cutoff = new Date(Date.now() - BATCH_WINDOW_MINUTES * 60 * 1000).toISOString();

    // Fetch pending notifications
    const { data: pending, error: fetchError } = await supabaseAdmin
      .from('pending_deal_notifications')
      .select('*')
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true });

    if (fetchError) throw fetchError;

    // Also fetch legacy lender notifications
    const { data: oldPending } = await supabaseAdmin
      .from('pending_lender_notifications')
      .select('*')
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true });

    const allPending: PendingNotification[] = (pending || []) as PendingNotification[];
    if (oldPending && oldPending.length > 0) {
      for (const old of oldPending) {
        allPending.push({
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

    // Group notifications by company
    const byCompany: Record<string, PendingNotification[]> = {};
    for (const n of allPending) {
      if (!byCompany[n.company_id]) byCompany[n.company_id] = [];
      byCompany[n.company_id].push(n);
    }

    // Get all companies that have any deals (even if no notifications)
    // We need to send digests to managers/admins with their full deal list
    const companyIds = new Set(Object.keys(byCompany));

    // Also get companies from notifications
    const results: any[] = [];

    for (const companyId of companyIds) {
      try {
        const companyNotifications = byCompany[companyId] || [];

        // Merge notifications by entity per deal
        const activityByDeal: Record<string, PendingNotification[]> = {};
        for (const n of companyNotifications) {
          if (!activityByDeal[n.deal_id]) activityByDeal[n.deal_id] = [];
          activityByDeal[n.deal_id].push(n);
        }
        for (const dealId of Object.keys(activityByDeal)) {
          activityByDeal[dealId] = mergeByEntity(activityByDeal[dealId]).filter(n => !(n as any)._cleanup_only);
        }

        // Load labels
        const labels: Record<string, string> = {
          'active': 'Active', 'on-hold': 'On Hold', 'on-deck': 'On Deck',
          'passed': 'Passed', 'not-a-fit': 'Not a Fit', 'excluded': 'Excluded',
          'on-track': 'On Track', 'at-risk': 'At Risk', 'off-track': 'Off Track', 'archived': 'Archived',
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

        const { data: pipelines } = await supabaseAdmin.from('deal_pipelines').select('id, stages, is_default').eq('company_id', companyId);
        if (pipelines) {
          for (const p of pipelines) {
            if (p.stages && Array.isArray(p.stages)) {
              for (const s of p.stages as any[]) { if (s.id && s.label) labels[s.id] = s.label; }
            }
          }
        }

        // Find the default pipeline
        const defaultPipeline = pipelines?.find(p => p.is_default) || pipelines?.[0];
        const defaultPipelineId = defaultPipeline?.id || null;

        // Get ALL active deals (not on-hold, not archived) in the default pipeline
        let allDealsQuery = supabaseAdmin
          .from('deals')
          .select('id, company, manager, analyst, deal_owner, company_id, value, stage, status, pipeline_id')
          .eq('company_id', companyId)
          .not('status', 'in', '("on-hold","archived")');

        if (defaultPipelineId) {
          allDealsQuery = allDealsQuery.eq('pipeline_id', defaultPipelineId);
        }

        const { data: allDeals } = await allDealsQuery;
        if (!allDeals || allDeals.length === 0) {
          console.log(`No active deals for company ${companyId}, skipping`);
          continue;
        }

        // Get members and profiles
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

        const emailMap: Record<string, string> = {};
        const nameToUserId: Record<string, string> = {};
        for (const member of members) {
          const { data: userData } = await supabaseAdmin.auth.admin.getUserById(member.user_id);
          if (userData?.user?.email) {
            emailMap[member.user_id] = userData.user.email;
          }
        }
        for (const p of profiles) {
          if (p.display_name) nameToUserId[p.display_name.toLowerCase()] = p.user_id;
        }

        // For each member, determine their deal list
        for (const member of members) {
          const profile = profiles.find(p => p.user_id === member.user_id);
          if (!profile) continue;
          if (!profile.email_notifications) continue;
          if (!profile.deal_updates_email && !profile.lender_updates_email) continue;

          const recipientEmail = emailMap[member.user_id];
          if (!recipientEmail) continue;

          const isAdmin = member.role === 'admin' || member.role === 'owner';
          const displayName = profile.display_name || 'there';

          // Determine which deals this user sees
          let userDeals: DealRow[];
          if (isAdmin) {
            // Admins see all active deals in the default pipeline
            userDeals = allDeals as DealRow[];
          } else {
            // Deal managers/analysts see only their deals
            userDeals = (allDeals as DealRow[]).filter(d =>
              (d.manager && nameToUserId[d.manager.toLowerCase()] === member.user_id) ||
              (d.analyst && nameToUserId[d.analyst.toLowerCase()] === member.user_id) ||
              (d.deal_owner && nameToUserId[d.deal_owner.toLowerCase()] === member.user_id)
            );
          }

          if (userDeals.length === 0) continue;

          // Filter activity to only this user's deals, and exclude self-made changes
          const userActivity: Record<string, PendingNotification[]> = {};
          let hasAnyActivity = false;
          for (const deal of userDeals) {
            const dealAct = (activityByDeal[deal.id] || []).filter(n => n.changed_by !== member.user_id);
            if (dealAct.length > 0) {
              userActivity[deal.id] = dealAct;
              hasAnyActivity = true;
            }
          }

          // Only send if there's at least some activity to report
          if (!hasAnyActivity) continue;

          try {
            const emailHtml = buildDigestEmailHtml(displayName, userDeals, userActivity, labels, isAdmin);

            const activityCount = Object.values(userActivity).reduce((sum, a) => sum + a.length, 0);
            const subject = `Pipeline Digest — ${userDeals.length} Deals · ${activityCount} Update${activityCount !== 1 ? 's' : ''}`;

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

            results.push({ company_id: companyId, email: recipientEmail, deals: userDeals.length, updates: activityCount, success: true });
            console.log(`Digest sent to ${recipientEmail}: ${userDeals.length} deals, ${activityCount} updates`);
          } catch (sendError: any) {
            console.error(`Error sending digest to ${recipientEmail}:`, sendError);
            results.push({ email: recipientEmail, success: false, error: sendError.message });
          }
        }

        // Cleanup processed notifications
        const allNewIds = companyNotifications
          .filter(n => !(n as any)._legacy)
          .map(n => (n as any)._all_ids || [n.id])
          .flat();

        const uniqueNewIds = [...new Set(allNewIds)];
        if (uniqueNewIds.length > 0) {
          await supabaseAdmin.from('pending_deal_notifications').delete().in('id', uniqueNewIds);
        }

        if (oldPending && oldPending.length > 0) {
          const legacyIds = oldPending.filter(o => o.company_id === companyId).map(o => o.id);
          if (legacyIds.length > 0) {
            await supabaseAdmin.from('pending_lender_notifications').delete().in('id', legacyIds);
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
