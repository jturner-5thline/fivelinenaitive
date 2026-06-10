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
    case 'on-track': return '#16a34a';
    case 'at-risk': return '#d97706';
    case 'off-track': return '#dc2626';
    case 'on-hold': return '#6b7280';
    default: return '#6b7280';
  }
}

function statusPill(status: string | null, labels: Record<string, string>): string {
  const color = statusColor(status);
  const label = resolveLabel(status, labels);
  const bgMap: Record<string, string> = {
    '#16a34a': '#f0fdf4', '#d97706': '#fffbeb', '#dc2626': '#fef2f2', '#6b7280': '#f3f4f6',
  };
  const bg = bgMap[color] || '#f3f4f6';
  return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;color:${color};background:${bg};line-height:1.4;">${label}</span>`;
}

function stagePill(stage: string | null, labels: Record<string, string>): string {
  return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:500;color:#4338ca;background:#eef2ff;line-height:1.4;">${resolveLabel(stage, labels)}</span>`;
}

function trackingBadge(status: string, labels: Record<string, string>): string {
  const colors: Record<string, { text: string; bg: string }> = {
    'active': { text: '#16a34a', bg: '#f0fdf4' },
    'on-hold': { text: '#d97706', bg: '#fffbeb' },
    'on-deck': { text: '#2563eb', bg: '#eff6ff' },
    'passed': { text: '#6b7280', bg: '#f3f4f6' },
  };
  const c = colors[status] || { text: '#6b7280', bg: '#f3f4f6' };
  return `<span style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:10px;font-weight:600;color:${c.text};background:${c.bg};line-height:1.5;">${resolveLabel(status, labels)}</span>`;
}

function changeBadge(from: string, to: string, labels: Record<string, string>): string {
  return `<span style="color:#9ca3af;font-size:11px;">${resolveLabel(from, labels)}</span> <span style="color:#9ca3af;font-size:11px;">→</span> <span style="color:#111827;font-size:11px;font-weight:600;">${resolveLabel(to, labels)}</span>`;
}

interface DealLenderInfo {
  total: number;
  active: number;
  passed: number;
  onDeck: number;
}

// Event type icon + color mapping
function eventIcon(type: string): { icon: string; color: string } {
  switch (type) {
    case 'lender_added': return { icon: '+', color: '#16a34a' };
    case 'lender_removed': return { icon: '−', color: '#dc2626' };
    case 'lender_updated': return { icon: '●', color: '#7c3aed' };
    case 'deal_updated': case 'stage_changed': return { icon: '●', color: '#2563eb' };
    case 'milestone_completed': return { icon: '✓', color: '#16a34a' };
    case 'milestone_missed': return { icon: '!', color: '#d97706' };
    case 'milestone_added': return { icon: '+', color: '#16a34a' };
    case 'deal_created': return { icon: '★', color: '#7c3aed' };
    default: return { icon: '●', color: '#6b7280' };
  }
}

// Build detailed activity block for a deal
function buildActivityBlock(notifications: PendingNotification[], labels: Record<string, string>): string {
  if (!notifications || notifications.length === 0) return '';

  const items: string[] = [];

  for (const n of notifications) {
    const cs = n.change_summary || {};
    const byName = n.changed_by_name ? `<span style="color:#9ca3af;font-size:11px;"> · ${n.changed_by_name}</span>` : '';
    const { icon, color } = eventIcon(n.event_type);

    if (n.event_type === 'lender_added') {
      items.push(`<tr><td style="padding:3px 0;width:18px;vertical-align:top;"><span style="color:${color};font-size:13px;font-weight:700;line-height:1;">${icon}</span></td><td style="padding:3px 0 3px 6px;font-size:12px;color:#374151;line-height:1.4;"><strong style="color:#111827;">${n.entity_name || 'Lender'}</strong> added${byName}</td></tr>`);
    } else if (n.event_type === 'lender_removed') {
      items.push(`<tr><td style="padding:3px 0;width:18px;vertical-align:top;"><span style="color:${color};font-size:13px;font-weight:700;line-height:1;">${icon}</span></td><td style="padding:3px 0 3px 6px;font-size:12px;color:#374151;line-height:1.4;"><strong style="color:#111827;">${n.entity_name || 'Lender'}</strong> removed${byName}</td></tr>`);
    } else if (n.event_type === 'lender_updated') {
      const changes: string[] = [];
      if (cs.stage) changes.push(`Stage: ${changeBadge(cs.stage.from, cs.stage.to, labels)}`);
      if (cs.substage) changes.push(`Substage: ${changeBadge(cs.substage.from, cs.substage.to, labels)}`);
      if (cs.tracking_status) changes.push(`Tracking: ${changeBadge(cs.tracking_status.from, cs.tracking_status.to, labels)}`);
      if (cs.score) changes.push(`Score: <span style="color:#d97706;font-size:11px;">${cs.score.from || '—'} → ${cs.score.to || '—'}</span>`);
      if (cs.notes) changes.push(`<span style="color:#6b7280;font-size:11px;">Notes updated</span>`);
      if (changes.length === 0) changes.push(`<span style="color:#6b7280;font-size:11px;">Updated</span>`);
      items.push(`<tr><td style="padding:3px 0;width:18px;vertical-align:top;"><span style="color:${color};font-size:11px;line-height:1.6;">${icon}</span></td><td style="padding:3px 0 3px 6px;font-size:12px;color:#374151;line-height:1.4;"><strong style="color:#111827;">${n.entity_name || 'Lender'}</strong> · ${changes.join(' · ')}${byName}</td></tr>`);
    } else if (n.event_type === 'deal_updated' || n.event_type === 'stage_changed') {
      const changes: string[] = [];
      if (cs.stage) changes.push(`Stage: ${changeBadge(cs.stage.from, cs.stage.to, labels)}`);
      if (cs.status) changes.push(`Status: ${changeBadge(cs.status.from, cs.status.to, labels)}`);
      if (cs.value) changes.push(`Value: ${formatCurrency(cs.value.from)} → ${formatCurrency(cs.value.to)}`);
      if (cs.manager) changes.push(`Manager: ${cs.manager.from || '—'} → ${cs.manager.to || '—'}`);
      if (cs.analyst) changes.push(`Analyst: ${cs.analyst.from || '—'} → ${cs.analyst.to || '—'}`);
      if (cs.engagement_type) changes.push(`Engagement: ${changeBadge(cs.engagement_type.from, cs.engagement_type.to, labels)}`);
      for (const [field, val] of Object.entries(cs)) {
        if (['stage','status','value','manager','analyst','engagement_type'].includes(field)) continue;
        const v = val as any;
        if (v?.from !== undefined || v?.to !== undefined) {
          const fieldLabel = field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          changes.push(`${fieldLabel}: ${changeBadge(String(v.from || '—'), String(v.to || '—'), labels)}`);
        }
      }
      if (changes.length > 0) {
        items.push(`<tr><td style="padding:3px 0;width:18px;vertical-align:top;"><span style="color:${color};font-size:11px;line-height:1.6;">${icon}</span></td><td style="padding:3px 0 3px 6px;font-size:12px;color:#374151;line-height:1.4;">${changes.join('<br/>')}${byName}</td></tr>`);
      }
    } else if (n.event_type === 'milestone_completed') {
      items.push(`<tr><td style="padding:3px 0;width:18px;vertical-align:top;"><span style="color:${color};font-size:13px;font-weight:700;line-height:1;">${icon}</span></td><td style="padding:3px 0 3px 6px;font-size:12px;color:#374151;line-height:1.4;"><strong style="color:#111827;">${n.entity_name || 'Milestone'}</strong> completed${byName}</td></tr>`);
    } else if (n.event_type === 'milestone_missed') {
      items.push(`<tr><td style="padding:3px 0;width:18px;vertical-align:top;"><span style="color:${color};font-size:13px;font-weight:700;line-height:1;">${icon}</span></td><td style="padding:3px 0 3px 6px;font-size:12px;color:#374151;line-height:1.4;"><strong style="color:#111827;">${n.entity_name || 'Milestone'}</strong> missed deadline${byName}</td></tr>`);
    } else if (n.event_type === 'milestone_added') {
      items.push(`<tr><td style="padding:3px 0;width:18px;vertical-align:top;"><span style="color:${color};font-size:13px;font-weight:700;line-height:1;">${icon}</span></td><td style="padding:3px 0 3px 6px;font-size:12px;color:#374151;line-height:1.4;">Milestone added: <strong style="color:#111827;">${n.entity_name || 'New'}</strong>${byName}</td></tr>`);
    } else if (n.event_type === 'deal_created') {
      items.push(`<tr><td style="padding:3px 0;width:18px;vertical-align:top;"><span style="color:${color};font-size:13px;line-height:1;">${icon}</span></td><td style="padding:3px 0 3px 6px;font-size:12px;color:#374151;line-height:1.4;">Deal created${byName}</td></tr>`);
    } else {
      const label = n.event_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      items.push(`<tr><td style="padding:3px 0;width:18px;vertical-align:top;"><span style="color:${color};font-size:11px;line-height:1.6;">${icon}</span></td><td style="padding:3px 0 3px 6px;font-size:12px;color:#374151;line-height:1.4;">${label}${n.entity_name ? `: <strong style="color:#111827;">${n.entity_name}</strong>` : ''}${byName}</td></tr>`);
    }
  }

  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;">${items.join('')}</table>`;
}

// Build a deal card for the email
function buildDealCard(deal: DealRow, labels: Record<string, string>, activity: PendingNotification[], lenderInfo: DealLenderInfo | null): string {
  const hasActivity = activity.length > 0;

  // Lender counts metadata line
  let lenderLine = '';
  if (lenderInfo) {
    const ac = lenderInfo.active;
    const od = lenderInfo.onDeck;
    const pa = lenderInfo.passed;
    lenderLine = `<tr><td style="padding:0 20px 4px 20px;font-size:11px;color:#6b7280;">Active: <strong style="color:#16a34a;">${ac}</strong> lender${ac === 1 ? '' : 's'}<span style="color:#d1d5db;margin:0 6px;">|</span>On deck: <strong style="color:#ea580c;">${od}</strong> lender${od === 1 ? '' : 's'}<span style="color:#d1d5db;margin:0 6px;">|</span>Passed: <strong style="color:#dc2626;">${pa}</strong> lender${pa === 1 ? '' : 's'}</td></tr>`;
  }

  const activityHtml = buildActivityBlock(activity, labels);
  const activitySection = activityHtml
    ? `<tr><td style="padding:8px 20px 4px 20px;"><div style="background:#f9fafb;border-radius:8px;padding:10px 12px;border:1px solid #f3f4f6;">${activityHtml}</div></td></tr>`
    : '';

  const updateBadge = hasActivity
    ? `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;color:#7c3aed;background:#f5f3ff;margin-left:8px;line-height:1.5;">${activity.length} update${activity.length !== 1 ? 's' : ''}</span>`
    : '';

  // Metadata row
  const metaParts: string[] = [];
  if (deal.manager) metaParts.push(`<span style="color:#6b7280;font-size:11px;">Owner: <strong style="color:#374151;">${deal.manager}</strong></span>`);
  if (deal.value) metaParts.push(`<span style="color:#6b7280;font-size:11px;">Amount: <strong style="color:#374151;">${formatCurrency(deal.value)}</strong></span>`);
  const metaRow = metaParts.length > 0
    ? `<tr><td style="padding:4px 20px 0 20px;font-size:11px;">${metaParts.join('<span style="color:#d1d5db;margin:0 6px;">|</span>')}</td></tr>`
    : '';

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff;border-radius:10px;border:1px solid #e5e7eb;margin-bottom:12px;">
    <tr>
      <td style="padding:16px 20px 6px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td style="vertical-align:middle;">
              <a href="https://fivelinenaitive.lovable.app/deal/${deal.id}" style="color:#111827;text-decoration:none;font-weight:700;font-size:15px;line-height:1.3;">${deal.company}</a>${updateBadge}
            </td>
            <td style="text-align:right;white-space:nowrap;vertical-align:middle;">
              <span style="color:#111827;font-weight:700;font-size:14px;">${formatCurrency(deal.value)}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:6px 20px 0 20px;">
        ${stagePill(deal.stage, labels)}
        <span style="margin-left:6px;">${statusPill(deal.status, labels)}</span>
      </td>
    </tr>
    ${metaRow}
    ${lenderLine}
    ${activitySection}
    <tr><td style="padding:0 0 14px 0;"></td></tr>
  </table>`;
}

function buildDigestEmailHtml(
  recipientName: string,
  deals: DealRow[],
  activityByDeal: Record<string, PendingNotification[]>,
  labels: Record<string, string>,
  isAdmin: boolean,
  lenderInfoByDeal?: Record<string, DealLenderInfo>,
  labelsForDeal?: (deal: DealRow) => Record<string, string>,
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

  const getDealLabels = (d: DealRow) => labelsForDeal ? labelsForDeal(d) : labels;

  const activeDealCards = activeDeals.map(d =>
    buildDealCard(d, getDealLabels(d), activityByDeal[d.id] || [], lenderInfoByDeal?.[d.id] || null)
  ).join('');

  // Quiet deals as compact table
  const quietRows = quietDeals.map(d => {
    const dl = getDealLabels(d);
    const li = lenderInfoByDeal?.[d.id];
    const qActive = li ? String(li.active) : '—';
    const qOnDeck = li ? String(li.onDeck) : '—';
    const qPassed = li ? String(li.passed) : '—';
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;">
        <a href="https://fivelinenaitive.lovable.app/deal/${d.id}" style="color:#111827;text-decoration:none;font-weight:500;">${d.company}</a>
      </td>
      <td style="padding:8px 8px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">${stagePill(d.stage, dl)}</td>
      <td style="padding:8px 8px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">${statusPill(d.status, dl)}</td>
      <td style="padding:8px 8px;border-bottom:1px solid #f3f4f6;color:#9ca3af;font-size:11px;text-align:center;">${qActive}</td>
      <td style="padding:8px 8px;border-bottom:1px solid #f3f4f6;color:#9ca3af;font-size:11px;text-align:center;">${qOnDeck}</td>
      <td style="padding:8px 8px;border-bottom:1px solid #f3f4f6;color:#9ca3af;font-size:11px;text-align:center;">${qPassed}</td>
      <td style="padding:8px 8px;border-bottom:1px solid #f3f4f6;color:#111827;font-size:12px;text-align:right;white-space:nowrap;font-weight:500;">${formatCurrency(d.value)}</td>
    </tr>`;
  }).join('');

  // Activity summary chips
  const summaryChips: string[] = [];
  if (lendersAdded > 0) summaryChips.push(`<span style="display:inline-block;background:#f0fdf4;color:#16a34a;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;margin-right:6px;margin-bottom:4px;">+${lendersAdded} Lender${lendersAdded !== 1 ? 's' : ''} Added</span>`);
  if (lendersUpdated > 0) summaryChips.push(`<span style="display:inline-block;background:#f5f3ff;color:#7c3aed;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;margin-right:6px;margin-bottom:4px;">${lendersUpdated} Lender Update${lendersUpdated !== 1 ? 's' : ''}</span>`);
  if (stageChanges > 0) summaryChips.push(`<span style="display:inline-block;background:#eff6ff;color:#2563eb;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;margin-right:6px;margin-bottom:4px;">${stageChanges} Stage Change${stageChanges !== 1 ? 's' : ''}</span>`);
  if (milestonesCompleted > 0) summaryChips.push(`<span style="display:inline-block;background:#f0fdf4;color:#16a34a;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;margin-right:6px;margin-bottom:4px;">✓ ${milestonesCompleted} Milestone${milestonesCompleted !== 1 ? 's' : ''}</span>`);
  const chipsHtml = summaryChips.length > 0 ? `<div style="margin-top:12px;">${summaryChips.join('')}</div>` : '';

  const quietSectionHtml = quietDeals.length > 0 ? `
    <tr>
      <td style="padding:24px 28px 0 28px;">
        <p style="margin:0 0 10px;font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:#9ca3af;font-weight:600;">Other Active Deals (${quietDeals.length})</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff;border-radius:10px;border:1px solid #e5e7eb;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:8px 12px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;font-weight:600;">Deal</th>
              <th style="padding:8px 8px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;font-weight:600;">Stage</th>
              <th style="padding:8px 8px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;font-weight:600;">Status</th>
              <th style="padding:8px 8px;text-align:center;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;font-weight:600;">Active</th>
              <th style="padding:8px 8px;text-align:center;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;font-weight:600;">On Deck</th>
              <th style="padding:8px 8px;text-align:center;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;font-weight:600;">Passed</th>
              <th style="padding:8px 8px;text-align:right;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;font-weight:600;">Value</th>
            </tr>
          </thead>
          <tbody>${quietRows}</tbody>
        </table>
      </td>
    </tr>` : '';

  // KPI card helper
  const kpiCard = (value: string, label: string, color: string) => `
    <td style="padding:0 4px;width:25%;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 10px;text-align:center;">
        <div style="font-size:22px;font-weight:800;color:${color};line-height:1.2;">${value}</div>
        <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;font-weight:500;">${label}</div>
      </div>
    </td>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <!--[if mso]><style>table{border-collapse:collapse;}td{font-family:Arial,sans-serif;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f4f5f7;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;">
    ${subtitle}
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4f5f7;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;">

          <!-- Logo -->
          <tr>
            <td style="padding:0 0 24px 0;text-align:center;">
              <span style="font-size:20px;font-weight:700;color:#111827;letter-spacing:-0.5px;">naitive</span>
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td style="background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <!-- Header -->
                <tr>
                  <td style="padding:28px 28px 0 28px;">
                    <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;font-weight:500;">${dateStr} · ${timeStr}</p>
                    <p style="margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:1.2px;color:#7c3aed;font-weight:700;">Deal Activity Digest</p>
                    <h1 style="margin:0;font-size:20px;font-weight:600;color:#111827;line-height:1.3;">Hi ${recipientName || 'there'},</h1>
                    <p style="margin:6px 0 0;color:#6b7280;font-size:13px;line-height:1.5;">${isAdmin ? 'Here\'s your full pipeline overview' : 'Here\'s an overview of your deals'}. ${subtitle}.</p>
                    ${chipsHtml}
                  </td>
                </tr>

                <!-- KPI Summary Strip -->
                <tr>
                  <td style="padding:20px 24px 0 24px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;">
                      <tr>
                        ${kpiCard(String(deals.length), 'Active Deals', '#111827')}
                        ${kpiCard(String(dealsWithActivity), 'With Activity', '#16a34a')}
                        ${kpiCard(String(totalActivity), 'Updates', '#7c3aed')}
                        ${kpiCard(`${activeLenders}<span style="color:#9ca3af;font-size:14px;font-weight:500;">/${totalLenders}</span>`, 'Lenders Active', '#2563eb')}
                      </tr>
                    </table>
                  </td>
                </tr>

                ${activeDeals.length > 0 ? `
                <!-- Recent Activity -->
                <tr>
                  <td style="padding:24px 28px 0 28px;">
                    <p style="margin:0 0 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:#7c3aed;font-weight:600;">Recent Activity (${activeDeals.length} deal${activeDeals.length !== 1 ? 's' : ''})</p>
                    ${activeDealCards}
                  </td>
                </tr>` : ''}

                ${quietSectionHtml}

                <!-- CTA -->
                <tr>
                  <td style="padding:28px 28px 28px 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td align="center">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td style="border-radius:8px;background:#7c3aed;">
                                <a href="https://fivelinenaitive.lovable.app/deals" target="_blank" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;line-height:1;">View Pipeline</a>
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
              <p style="color:#9ca3af;font-size:12px;margin:0 0 6px 0;">&copy; ${year} naitive. All rights reserved.</p>
              <p style="color:#9ca3af;font-size:12px;margin:0;">
                <a href="https://fivelinenaitive.lovable.app/settings" style="color:#7c3aed;text-decoration:underline;">Manage preferences</a>
                &nbsp;|&nbsp;
                <a href="https://fivelinenaitive.lovable.app/unsubscribe" style="color:#7c3aed;text-decoration:underline;">Unsubscribe</a>
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
    'active': 'Active', 'on-hold': 'On Hold', 'on-deck': 'On Deck', 'passed': 'Passed',
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
      { id: '6', deal_id: '1', company_id: 'test', event_type: 'lender_added', entity_name: 'SLR Capital', entity_id: '10', change_summary: {}, changed_by: null, changed_by_name: 'James Turner', metadata: {}, created_at: now },
    ],
    '00000000-0000-0000-0000-000000000002': [
      { id: '3', deal_id: '2', company_id: 'test', event_type: 'lender_updated', entity_name: 'Hercules Capital', entity_id: '5', change_summary: { stage: { from: 'management-call-completed', to: 'draft-terms' }, tracking_status: { from: 'on-deck', to: 'active' } }, changed_by: null, changed_by_name: 'James Turner', metadata: {}, created_at: oneHourAgo },
      { id: '7', deal_id: '2', company_id: 'test', event_type: 'deal_updated', entity_name: null, entity_id: null, change_summary: { status: { from: 'on-track', to: 'at-risk' } }, changed_by: null, changed_by_name: 'James Turner', metadata: {}, created_at: now },
    ],
  };

  const lenderInfoByDeal: Record<string, DealLenderInfo> = {
    '00000000-0000-0000-0000-000000000001': { total: 6, active: 4, passed: 1, onDeck: 1 },
    '00000000-0000-0000-0000-000000000002': { total: 4, active: 3, passed: 0, onDeck: 1 },
    '00000000-0000-0000-0000-000000000003': { total: 3, active: 2, passed: 0, onDeck: 1 },
    '00000000-0000-0000-0000-000000000004': { total: 2, active: 2, passed: 0, onDeck: 0 },
    '00000000-0000-0000-0000-000000000005': { total: 5, active: 3, passed: 2, onDeck: 0 },
  };

  return { deals, activityByDeal, labels, lenderInfoByDeal };
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

    // DST-aware guard: cron fires at both 23:00 and 00:00 UTC to cover EDT/EST.
    // Only proceed if it's actually 7pm (19:00) in America/New_York.
    if (!isTestMode) {
      const etHour = new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' });
      const currentETHour = parseInt(etHour, 10);
      if (currentETHour !== 19) {
        console.log(`Skipping: current ET hour is ${currentETHour}, waiting for 19 (7pm ET)`);
        return new Response(JSON.stringify({ skipped: true, reason: `ET hour is ${currentETHour}, not 19` }), {
          status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      // Also skip weekends (Sat=6, Sun=0) as extra safety
      const etDay = new Date().toLocaleString('en-US', { weekday: 'short', timeZone: 'America/New_York' });
      if (etDay === 'Sat' || etDay === 'Sun') {
        console.log(`Skipping: ${etDay} is a weekend in ET`);
        return new Response(JSON.stringify({ skipped: true, reason: `Weekend: ${etDay}` }), {
          status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    if (isTestMode) {
      console.log(`Test mode: sending sample digest to ${testEmail}`);
      const { deals, activityByDeal, labels, lenderInfoByDeal } = generateTestData();

      const emailHtml = buildDigestEmailHtml('James', deals, activityByDeal, labels, true, lenderInfoByDeal);

      await resend.emails.send({
        from: buildFrom("Naitive"),
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
        
        // Build per-pipeline stage label maps so overloaded stage IDs resolve correctly
        const pipelineStageLabels: Record<string, Record<string, string>> = {};
        if (pipelines) {
          for (const p of pipelines) {
            if (p.stages && Array.isArray(p.stages)) {
              const pLabels: Record<string, string> = {};
              for (const s of p.stages as any[]) { if (s.id && s.label) pLabels[s.id] = s.label; }
              pipelineStageLabels[p.id] = pLabels;
            }
          }
        }
        
        // Helper: get labels for a specific deal by merging base labels with pipeline-specific stage labels
        const getLabelsForDeal = (deal: DealRow): Record<string, string> => {
          const pipelineId = deal.pipeline_id;
          if (pipelineId && pipelineStageLabels[pipelineId]) {
            return { ...labels, ...pipelineStageLabels[pipelineId] };
          }
          // Fallback: use default pipeline labels
          const defaultPl = pipelines?.find(p => p.is_default) || pipelines?.[0];
          if (defaultPl && pipelineStageLabels[defaultPl.id]) {
            return { ...labels, ...pipelineStageLabels[defaultPl.id] };
          }
          return labels;
        };

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

        // Fetch lender counts per deal
        const dealIds = allDeals.map(d => d.id);
        const { data: dealLenders } = await supabaseAdmin
          .from('deal_lenders')
          .select('deal_id, tracking_status')
          .in('deal_id', dealIds);

        const lenderInfoByDeal: Record<string, DealLenderInfo> = {};
        for (const d of allDeals) {
          const dl = (dealLenders || []).filter(l => l.deal_id === d.id);
          lenderInfoByDeal[d.id] = {
            total: dl.length,
            active: dl.filter(l => l.tracking_status === 'active').length,
            passed: dl.filter(l => l.tracking_status === 'passed' || l.tracking_status === 'not-a-fit' || l.tracking_status === 'excluded').length,
            onDeck: dl.filter(l => l.tracking_status === 'on-deck').length,
          };
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

        // Determine which members get digests:
        // - Admins/owners get full pipeline digest
        // - Deal managers get digest for their managed deals
        const adminMemberIds = new Set(
          members.filter(m => m.role === 'admin' || m.role === 'owner').map(m => m.user_id)
        );

        // Find non-admin members who are tagged as manager on at least one deal
        const managerUserIds = new Set<string>();
        for (const deal of allDeals as DealRow[]) {
          if (deal.manager) {
            const uid = nameToUserId[deal.manager.toLowerCase()];
            if (uid && !adminMemberIds.has(uid)) managerUserIds.add(uid);
          }
        }

        // Combine: admins + deal managers (deduplicated)
        const digestRecipientIds = new Set([...adminMemberIds, ...managerUserIds]);

        for (const userId of digestRecipientIds) {
          const member = members.find(m => m.user_id === userId);
          if (!member) continue;
          const profile = profiles.find(p => p.user_id === userId);
          if (!profile) continue;
          if (!profile.email_notifications) continue;

          const recipientEmail = emailMap[userId];
          if (!recipientEmail) continue;

          const isAdmin = adminMemberIds.has(userId);
          const displayName = profile.display_name || 'there';

          // Determine which deals this user sees
          let userDeals: DealRow[];
          if (isAdmin) {
            // Admins see all active deals in the default pipeline
            userDeals = allDeals as DealRow[];
          } else {
            // Deal managers see only deals where they are the manager
            userDeals = (allDeals as DealRow[]).filter(d =>
              d.manager && nameToUserId[d.manager.toLowerCase()] === userId
            );
          }

          if (userDeals.length === 0) continue;

          // Filter activity to only this user's deals, and exclude self-made changes
          const userActivity: Record<string, PendingNotification[]> = {};
          let hasAnyActivity = false;
          for (const deal of userDeals) {
            const dealAct = (activityByDeal[deal.id] || []).filter(n => n.changed_by !== userId);
            if (dealAct.length > 0) {
              userActivity[deal.id] = dealAct;
              hasAnyActivity = true;
            }
          }

          // Only send if there's at least some activity to report
          if (!hasAnyActivity) continue;

          try {
            const emailHtml = buildDigestEmailHtml(displayName, userDeals, userActivity, labels, isAdmin, lenderInfoByDeal, getLabelsForDeal);

            const activityCount = Object.values(userActivity).reduce((sum, a) => sum + a.length, 0);
            const subject = `Pipeline Digest — ${userDeals.length} Deals · ${activityCount} Update${activityCount !== 1 ? 's' : ''}`;

            await resend.emails.send({
              from: buildFrom("Naitive"),
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
