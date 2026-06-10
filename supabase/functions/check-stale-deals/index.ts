import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { buildFrom } from '../_shared/resendFrom.ts';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_STALE_DAYS = 14;

// Hard-suppressed deal statuses/stages: ZERO stale-activity reminders are sent
// for deals in any of these states. Keep in sync with
// src/utils/lenderAttentionEligibility.ts and the DB function
// is_deal_notification_suppressed.
const HARD_SUPPRESSED_DEAL_STATES = new Set<string>([
  'archived',
  'on hold', 'on-hold', 'on_hold',
  'closed won', 'closed-won', 'closed_won', 'won',
  'closed lost', 'closed-lost', 'closed_lost', 'lost',
]);

function normState(v: string | null | undefined): string {
  return String(v ?? '').trim().toLowerCase();
}

function isHardSuppressedDeal(deal: { status?: string | null; stage?: string | null }): {
  suppressed: boolean;
  reason: string | null;
} {
  const status = normState(deal.status);
  const stage = normState(deal.stage);
  if (HARD_SUPPRESSED_DEAL_STATES.has(status)) {
    return { suppressed: true, reason: `deal status ${status}` };
  }
  if (HARD_SUPPRESSED_DEAL_STATES.has(stage)) {
    return { suppressed: true, reason: `deal stage ${stage}` };
  }
  return { suppressed: false, reason: null };
}

// Best-effort audit row when a would-be alert is suppressed, so admins can
// verify the rule is firing.
async function logSuppressedAudit(
  supabase: any,
  args: { trigger_key: string; deal_id: string; reason: string; deal_company?: string | null },
) {
  try {
    await supabase.from('notification_audit').insert({
      trigger_key: args.trigger_key,
      recipient_user_id: null,
      deal_id: args.deal_id,
      channel: 'all',
      status: 'suppressed',
      title: `Suppressed: ${args.reason}`,
      body: `No stale-activity reminders are sent for deals in this state.`,
      metadata: {
        suppression_reason: args.reason,
        deal_company: args.deal_company ?? null,
      },
    });
  } catch (e) {
    console.error('logSuppressedAudit insert failed:', e);
  }
}

interface StaleAlertConfig {
  enabled: boolean;
  threshold_days: number;
  notify_managers: boolean;
  notify_admins: boolean;
  excluded_stages: string[];
  allowed_pipeline_ids: string[] | null;
  always_notify_emails: string[]; // emails that always get ALL deals
  include_flagged: boolean;
  include_lenders_needing_update: boolean;
  lender_stale_days: number; // days since lender was updated
}

const DEFAULT_CONFIG: StaleAlertConfig = {
  enabled: true,
  threshold_days: DEFAULT_STALE_DAYS,
  notify_managers: true,
  notify_admins: true,
  // Hard-suppressed statuses/stages: ZERO stale-activity reminders are ever sent
  // for deals in any of these states (or for any lender attached to them).
  excluded_stages: [
    'archived',
    'on_hold', 'on-hold', 'on hold',
    'closed_won', 'closed-won', 'closed won', 'won',
    'closed_lost', 'closed-lost', 'closed lost', 'lost',
    'in_development',
  ],
  allowed_pipeline_ids: null,
  always_notify_emails: [],
  include_flagged: true,
  include_lenders_needing_update: true,
  lender_stale_days: 14,
};

interface AttentionDeal {
  id: string;
  company: string;
  stage: string;
  value: number | null;
  updated_at: string;
  manager: string | null;
  analyst: string | null;
  status: string;
  deal_type: string | null;
  deal_owner: string | null;
  closing_date: string | null;
  contact: string | null;
  engagement_type: string | null;
  narrative: string | null;
  pipeline_id: string | null;
  is_flagged: boolean;
  flag_notes: string | null;
  latest_status_note: string | null;
  // computed
  attention_reasons: string[];
  stale_lender_count?: number;
}

function formatDealType(dealType: string | null): string {
  if (!dealType) return '';
  try {
    const parsed = JSON.parse(dealType);
    if (Array.isArray(parsed)) {
      return parsed.map((t: string) =>
        t.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      ).join(', ');
    }
  } catch {
    // Not JSON, treat as plain string
  }
  return dealType.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function getDealTypeTags(dealType: string | null): string {
  if (!dealType) return '';
  let types: string[] = [];
  try {
    const parsed = JSON.parse(dealType);
    if (Array.isArray(parsed)) {
      types = parsed;
    } else {
      types = [dealType];
    }
  } catch {
    types = [dealType];
  }
  return types.map(t => {
    const label = t.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return `<span style="display: inline-block; background: #e0f2fe; color: #0369a1; font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 4px; margin-right: 4px;">${label}</span>`;
  }).join('');
}

function formatStageLabel(stage: string): string {
  if (!stage) return '';
  return stage.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

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

function getReasonBadge(reason: string): string {
  const colors: Record<string, { bg: string; text: string }> = {
    'Stale': { bg: '#fef3c7', text: '#92400e' },
    'Flagged': { bg: '#fee2e2', text: '#991b1b' },
    'Lenders Need Updating': { bg: '#fff7ed', text: '#c2410c' },
  };
  const c = colors[reason] || { bg: '#f3f4f6', text: '#374151' };
  return `<span style="display: inline-block; background: ${c.bg}; color: ${c.text}; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; margin-right: 4px;">${reason}</span>`;
}

function buildEmailHtml(
  recipientName: string,
  deals: AttentionDeal[],
  thresholdDays: number,
  isGlobalRecipient: boolean
): string {
  const now = new Date();

  const staleCount = deals.filter(d => d.attention_reasons.includes('Stale')).length;
  const flaggedCount = deals.filter(d => d.attention_reasons.includes('Flagged')).length;
  const lenderCount = deals.filter(d => d.attention_reasons.includes('Lenders Need Updating')).length;

  // Sort: flagged deals first, then by days since update descending
  const sortedDeals = [...deals].sort((a, b) => {
    const aFlagged = a.attention_reasons.includes('Flagged') ? 1 : 0;
    const bFlagged = b.attention_reasons.includes('Flagged') ? 1 : 0;
    if (aFlagged !== bFlagged) return bFlagged - aFlagged;
    return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
  });

  const dealCards = sortedDeals.slice(0, 15).map(deal => {
    const updatedAt = new Date(deal.updated_at);
    const daysSinceUpdate = Math.floor((now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24));
    
    const isFlagged = deal.attention_reasons.includes('Flagged');
    const isStale = deal.attention_reasons.includes('Stale');

    const reasonBadges = deal.attention_reasons.filter(r => r !== 'Lenders Need Updating').map(r => getReasonBadge(r)).join('');
    const hasLendersNeedUpdating = deal.attention_reasons.includes('Lenders Need Updating');
    const lendersBadge = hasLendersNeedUpdating ? getReasonBadge('Lenders Need Updating') : '';

    const dealTypeTags = getDealTypeTags(deal.deal_type);

    const flagNotesHtml = isFlagged
      ? `<div style="margin: 6px 0 0; background: #fef2f2; border: 1px solid #fecaca; border-radius: 4px; padding: 6px 8px;">
          <span style="font-size: 12px; font-weight: 700; color: #dc2626;">🚩 Flagged</span>
          ${deal.flag_notes ? `<span style="font-size: 11px; color: #991b1b; margin-left: 6px;">${deal.flag_notes.substring(0, 120)}${deal.flag_notes.length > 120 ? '…' : ''}</span>` : ''}
        </div>`
      : '';

    const lenderHtml = deal.stale_lender_count && deal.stale_lender_count > 0
      ? `<p style="margin: 2px 0 0; font-size: 11px; color: #1e40af;"><strong>${deal.stale_lender_count}</strong> lender${deal.stale_lender_count > 1 ? 's' : ''} haven't been updated in ${thresholdDays}+ days</p>`
      : '';

    const statusNoteText = deal.latest_status_note || '';
    const statusNoteSnippet = statusNoteText
      ? `<p style="margin: 2px 0 0; font-size: 11px; color: #6b7280; line-height: 1.3;">${statusNoteText.substring(0, 100)}${statusNoteText.length > 100 ? '…' : ''}</p>`
      : '';

    const metaItems: string[] = [];
    if (deal.value) metaItems.push(`<span style="color: #374151; font-size: 11px;"><strong style="color: #6b7280;">Value:</strong> ${formatValue(deal.value)}</span>`);
    if (deal.manager) metaItems.push(`<span style="color: #374151; font-size: 11px;"><strong style="color: #6b7280;">Mgr:</strong> ${deal.manager}</span>`);
    if (deal.closing_date) metaItems.push(`<span style="color: #374151; font-size: 11px;"><strong style="color: #6b7280;">Close:</strong> ${formatDate(deal.closing_date)}</span>`);
    const metaLine = metaItems.length > 0 ? `<div style="margin-top: 4px;">${metaItems.join('<span style="color: #d1d5db; margin: 0 6px;">|</span>')}</div>` : '';

    const tileStyle = isFlagged
      ? 'border: 3px solid #dc2626; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; background: #ffffff;'
      : 'border: 2px solid #7c3aed; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; background: #ffffff;';

    return `
      <div style="${tileStyle}">
        <table style="width: 100%;">
          <tr>
            <td style="vertical-align: middle;">
              <strong style="font-size: 18px; color: #111827; vertical-align: middle;">${deal.company}</strong>
              ${lendersBadge ? `<span style="display: inline-block; vertical-align: middle; margin-left: 6px;">${lendersBadge}</span>` : ''}
            </td>
            <td style="text-align: right; vertical-align: middle; white-space: nowrap;">
              <span style="display: inline-block; background: ${deal.status === 'at-risk' ? '#fef3c7' : deal.status === 'off-track' ? '#fee2e2' : '#dcfce7'}; color: ${deal.status === 'at-risk' ? '#92400e' : deal.status === 'off-track' ? '#991b1b' : '#166534'}; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 4px;">${deal.status === 'on-track' ? 'On Track' : deal.status === 'at-risk' ? 'At Risk' : deal.status === 'off-track' ? 'Off Track' : deal.status === 'on-hold' ? 'On Hold' : deal.status.charAt(0).toUpperCase() + deal.status.slice(1)}</span>
            </td>
          </tr>
          <tr>
            <td style="vertical-align: middle; padding-top: 2px;">
              <span style="display: inline-block; background: #fef3c7; color: #92400e; font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 4px;">Last Update ${daysSinceUpdate} Days Ago</span>
              ${dealTypeTags ? `<span style="margin-left: 4px;">${dealTypeTags}</span>` : ''}
            </td>
            <td style="text-align: right; vertical-align: middle; padding-top: 2px;">
              <span style="display: inline-block; background: #ede9fe; color: #6d28d9; font-size: 10px; font-weight: 500; padding: 1px 6px; border-radius: 4px;">${formatStageLabel(deal.stage)}</span>
            </td>
          </tr>
        </table>
        ${statusNoteSnippet}
        ${metaLine}
        ${flagNotesHtml}
        ${lenderHtml}
        <div style="margin-top: 4px;">
          <a href="https://fivelinenaitive.lovable.app/deals/${deal.id}" style="color: #7c3aed; font-size: 12px; font-weight: 500; text-decoration: none;">View Deal →</a>
        </div>
      </div>`;
  }).join('');

  const subtitle = isGlobalRecipient
    ? `here's a summary of all deals needing your attention`
    : `here's a summary of your deals needing attention`;

  const totalValue = deals.reduce((sum, d) => sum + (d.value || 0), 0);

  // Summary stats
  const summaryItems: string[] = [];
  if (staleCount > 0) summaryItems.push(`
    <td style="padding: 16px; text-align: center; ${summaryItems.length > 0 ? 'border-left: 1px solid #e9d5ff;' : ''}">
      <div style="font-size: 24px; font-weight: 700; color: #f59e0b;">${staleCount}</div>
      <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Stale</div>
    </td>`);
  if (flaggedCount > 0) summaryItems.push(`
    <td style="padding: 16px; text-align: center; border-left: 1px solid #e9d5ff;">
      <div style="font-size: 24px; font-weight: 700; color: #dc2626;">${flaggedCount}</div>
      <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Flagged</div>
    </td>`);
  if (lenderCount > 0) summaryItems.push(`
    <td style="padding: 16px; text-align: center; border-left: 1px solid #e9d5ff;">
      <div style="font-size: 24px; font-weight: 700; color: #3b82f6;">${lenderCount}</div>
      <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Lenders Stale</div>
    </td>`);
  summaryItems.push(`
    <td style="padding: 16px; text-align: center; border-left: 1px solid #e9d5ff;">
      <div style="font-size: 24px; font-weight: 700; color: #7c3aed;">${formatValue(totalValue)}</div>
      <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Total Value</div>
    </td>`);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px; background-color: #f5f5f5;">
      <div style="max-width: 640px; margin: 0 auto; background: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 8px;">Deals Needing Attention</h1>
        <p style="color: #666; font-size: 16px; margin-bottom: 20px;">
          Hi ${recipientName || 'there'}, ${subtitle}:
        </p>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; background: #faf5ff; border-radius: 8px;">
          <tr>${summaryItems.join('')}</tr>
        </table>

        ${dealCards}

        ${deals.length > 15 ? `<p style="color: #666; font-size: 14px; margin-bottom: 24px;">...and ${deals.length - 15} more deals needing attention</p>` : ''}

        <div style="text-align: center; margin-top: 24px;">
          <a href="https://fivelinenaitive.lovable.app/deals" style="display: inline-block; background: linear-gradient(135deg, #8B5CF6 0%, #D946EF 100%); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600;">
            Review All Deals
          </a>
        </div>

        <p style="color: #999; font-size: 14px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 24px;">
          You can configure deal attention alerts in Settings &gt; Automation.
        </p>
      </div>
    </body>
    </html>
  `;
}

/**
 * Returns true if the given date (in America/New_York) is a valid business day
 * for sending "Deals needing attention" emails.
 * Blocked on: Saturday, Sunday, Jan 1, Jul 4, Dec 25.
 */
function shouldSendDealsNeedingAttentionEmail(date: Date, timezone = 'America/New_York'): { send: boolean; reason?: string } {
  const localStr = date.toLocaleDateString('en-US', { timeZone: timezone, weekday: 'long', month: '2-digit', day: '2-digit' });
  // localStr example: "Monday, 07/04"
  const parts = localStr.split(', ');
  const weekday = parts[0]; // e.g. "Monday"
  const monthDay = parts[1]; // e.g. "07/04"

  if (weekday === 'Saturday' || weekday === 'Sunday') {
    return { send: false, reason: `weekend (${weekday})` };
  }

  const holidays: Record<string, string> = { '01/01': 'New Year\'s Day', '07/04': 'Independence Day', '12/25': 'Christmas Day' };
  if (holidays[monthDay]) {
    return { send: false, reason: `holiday (${monthDay} – ${holidays[monthDay]})` };
  }

  return { send: true };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse body once to check for test mode
    let bodyJson: any = {};
    try { bodyJson = await req.json(); } catch { /* no body */ }
    const isTestSend = bodyJson?.test === true;

    const now = new Date();

    // Business-day / holiday guard – skip on non-business days (bypass for test sends)
    if (!isTestSend) {
      const schedule = shouldSendDealsNeedingAttentionEmail(now);
      if (!schedule.send) {
        const msg = `Skipped Deals needing attention email: ${schedule.reason}`;
        console.log(msg);
        return new Response(JSON.stringify({ success: true, skipped: true, reason: msg }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log("Starting deals needing attention check...");

    const { data: companySettings, error: settingsError } = await supabaseAdmin
      .from('company_settings')
      .select('company_id, stale_alert_config');

    if (settingsError) throw settingsError;

    const results: any[] = [];

    for (const settings of companySettings || []) {
      const config: StaleAlertConfig = {
        ...DEFAULT_CONFIG,
        ...(settings.stale_alert_config as any || {}),
      };

      if (!config.enabled) {
        console.log(`Alerts disabled for company ${settings.company_id}`);
        continue;
      }

      // Get all active deals for this company
      let dealsQuery = supabaseAdmin
        .from('deals')
        .select('id, company, stage, value, updated_at, manager, analyst, status, deal_type, deal_owner, closing_date, contact, engagement_type, narrative, pipeline_id, is_flagged, flag_notes')
        .eq('company_id', settings.company_id)
        .order('updated_at', { ascending: true });

      // Filter by allowed pipelines
      if (config.allowed_pipeline_ids && config.allowed_pipeline_ids.length > 0) {
        dealsQuery = dealsQuery.in('pipeline_id', config.allowed_pipeline_ids);
      }

      const { data: deals, error: dealsError } = await dealsQuery;
      if (dealsError) {
        console.error(`Error fetching deals for company ${settings.company_id}:`, dealsError);
        continue;
      }
      if (!deals || deals.length === 0) continue;

      // Exclude archived/on_hold/etc. and test deals
      const activeDeals = deals.filter(deal => {
        // Hard suppression — write an audit row so admins can verify.
        const supp = isHardSuppressedDeal(deal);
        if (supp.suppressed) {
          // fire-and-forget; do not await inside filter
          logSuppressedAudit(supabaseAdmin, {
            trigger_key: 'stale_deal_alert',
            deal_id: deal.id,
            reason: `suppressed: ${supp.reason}`,
            deal_company: deal.company,
          });
          return false;
        }
        // Other configured exclusions (e.g. in_development pipeline name)
        if (config.excluded_stages.includes(deal.status)) return false;
        if (config.excluded_stages.includes(deal.stage)) return false;
        // Globally excluded test/example deals — keep in sync with src/utils/excludedDeals.ts
        const normalized = (deal.company || '').toLowerCase().trim();
        if (!normalized) return true;
        if (normalized === "test - niki's store") return false;
        if (normalized === 'example deal') return false;
        if (normalized === 'test') return false;
        if (normalized.startsWith('test ')) return false;
        if (/^test\b/i.test(normalized)) return false;
        return true;
      });

      if (activeDeals.length === 0) continue;

      // Get lender update status for all deals in one query
      const dealIds = activeDeals.map(d => d.id);
      const { data: lenders } = await supabaseAdmin
        .from('deal_lenders')
        .select('id, deal_id, updated_at, stage, tracking_status')
        .in('deal_id', dealIds);

      // Build a map: deal_id → count of stale lenders (active lenders not updated in X days)
      // Mirrors src/utils/lenderAttentionEligibility.ts — keep in sync.
      const staleLenderCounts: Record<string, number> = {};
      const excludedLenderStages = [
        'on deck', 'on-deck',
        'on hold', 'on-hold',
        'passed',
        'not a fit', 'not-a-fit',
        'unresponsive',
        'excluded',
        'closed & funded', 'closed-funded', 'closed funded',
        'direct',
      ];
      const inactiveTrackingStatuses = [
        'passed', 'on-hold', 'on-deck', 'excluded', 'direct',
        'not_a_fit', 'not-a-fit',
        'closed-funded', 'closed_funded',
      ];
      if (lenders) {
        for (const lender of lenders) {
          const lenderStage = (lender.stage || '').toLowerCase();
          const trackingStatus = (lender.tracking_status || '').toLowerCase();
          if (excludedLenderStages.includes(lenderStage)) continue;
          if (inactiveTrackingStatuses.includes(trackingStatus)) continue;
          if (trackingStatus && trackingStatus !== 'active') continue;
          const lenderUpdated = new Date(lender.updated_at);
          const daysSince = Math.floor((now.getTime() - lenderUpdated.getTime()) / (1000 * 60 * 60 * 24));
          if (daysSince >= (config.lender_stale_days || config.threshold_days)) {
            staleLenderCounts[lender.deal_id] = (staleLenderCounts[lender.deal_id] || 0) + 1;
          }
        }
      }

      // Fetch latest status note per deal
      const { data: statusNotes } = await supabaseAdmin
        .from('deal_status_notes')
        .select('deal_id, note, created_at')
        .in('deal_id', dealIds)
        .order('created_at', { ascending: false });

      const latestStatusNoteMap: Record<string, string> = {};
      if (statusNotes) {
        for (const sn of statusNotes) {
          if (!latestStatusNoteMap[sn.deal_id]) {
            latestStatusNoteMap[sn.deal_id] = sn.note;
          }
        }
      }

      // Determine which deals need attention and why
      const attentionDeals: AttentionDeal[] = [];
      for (const deal of activeDeals) {
        const reasons: string[] = [];

        // Check stale
        const updatedAt = new Date(deal.updated_at);
        const daysSinceUpdate = Math.floor((now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceUpdate >= config.threshold_days) {
          reasons.push('Stale');
        }

        // Check flagged
        if (config.include_flagged !== false && deal.is_flagged) {
          reasons.push('Flagged');
        }

        // Check lenders needing update
        if (config.include_lenders_needing_update !== false && staleLenderCounts[deal.id] > 0) {
          reasons.push('Lenders Need Updating');
        }

        if (reasons.length === 0) continue;

        attentionDeals.push({
          ...deal,
          attention_reasons: reasons,
          stale_lender_count: staleLenderCounts[deal.id] || 0,
          latest_status_note: latestStatusNoteMap[deal.id] || null,
        });
      }

      if (attentionDeals.length === 0) continue;

      console.log(`Company ${settings.company_id}: ${attentionDeals.length} deals need attention`);

      // ─────────────────────────────────────────────────────────────────────
      // PER-USER stale-deal alerts via notification-engine (owner + manager).
      // Fires only when a deal crosses a NEW threshold boundary
      // (config.threshold_days, 2x, 3x, 4x). Dedup is enforced by checking
      // notification_audit for an entry within the last (threshold_days - 1)
      // days for the same (deal, trigger).
      // ─────────────────────────────────────────────────────────────────────
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseSrk = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const baseT = Math.max(1, config.threshold_days || DEFAULT_STALE_DAYS);
        const boundaries = [baseT, baseT * 2, baseT * 3, baseT * 4];
        const dedupWindowDays = Math.max(1, baseT - 1);

        for (const deal of attentionDeals) {
          const updatedAt = new Date(deal.updated_at);
          const daysSince = Math.floor((now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24));
          const matchedBoundary = boundaries.filter((b) => daysSince >= b).pop();
          if (!matchedBoundary) continue;

          // Dedup: skip if we already audited a stale_deal_alert for this deal
          // in the recent window.
          const sinceIso = new Date(now.getTime() - dedupWindowDays * 86400_000).toISOString();
          const { count: recentCount } = await supabaseAdmin
            .from('notification_audit')
            .select('id', { count: 'exact', head: true })
            .eq('deal_id', deal.id)
            .eq('trigger_key', 'stale_deal_alert')
            .gte('created_at', sinceIso);
          if ((recentCount || 0) > 0) continue;

          await fetch(`${supabaseUrl}/functions/v1/notification-engine`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseSrk}`,
            },
            body: JSON.stringify({
              triggerKey: 'stale_deal_alert',
              context: {
                deal_id: deal.id,
                deal_company: deal.company,
                days_since: daysSince,
                threshold_days: matchedBoundary,
              },
            }),
          });
        }
      } catch (perUserErr) {
        console.error('Per-user stale_deal_alert dispatch failed:', perUserErr);
      }

      // Per-deal stale-LENDER alerts (one trigger per deal that has stale
      // lenders). The engine resolves owner+manager and respects channel
      // prefs. Dedup window mirrors stale_deal_alert (boundary-based).
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseSrk = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const lenderT = Math.max(1, config.lender_stale_days || config.threshold_days || DEFAULT_STALE_DAYS);
        const dedupWindowDays = Math.max(1, lenderT - 1);

        for (const deal of attentionDeals) {
          const lenderCount = deal.stale_lender_count || 0;
          if (lenderCount <= 0) continue;

          const sinceIso = new Date(now.getTime() - dedupWindowDays * 86400_000).toISOString();
          const { count: recentCount } = await supabaseAdmin
            .from('notification_audit')
            .select('id', { count: 'exact', head: true })
            .eq('deal_id', deal.id)
            .eq('trigger_key', 'stale_lender_alert')
            .gte('created_at', sinceIso);
          if ((recentCount || 0) > 0) continue;

          await fetch(`${supabaseUrl}/functions/v1/notification-engine`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseSrk}`,
            },
            body: JSON.stringify({
              triggerKey: 'stale_lender_alert',
              context: {
                deal_id: deal.id,
                deal_company: deal.company,
                lender_name: `${lenderCount} lender${lenderCount !== 1 ? 's' : ''}`,
                days_since: lenderT,
              },
            }),
          });
        }
      } catch (lenderErr) {
        console.error('Per-deal stale_lender_alert dispatch failed:', lenderErr);
      }

      // Get company members
      const { data: members } = await supabaseAdmin
        .from('company_members')
        .select('user_id, role')
        .eq('company_id', settings.company_id);

      if (!members || members.length === 0) continue;

      const memberIds = members.map(m => m.user_id);
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('user_id, display_name, email_notifications, notify_stale_alerts')
        .in('user_id', memberIds);

      if (!profiles) continue;

      // Get emails for all members
      const emailMap: Record<string, string> = {};
      const emailToUserId: Record<string, string> = {};
      for (const member of members) {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(member.user_id);
        if (userData?.user?.email) {
          emailMap[member.user_id] = userData.user.email;
          emailToUserId[userData.user.email.toLowerCase()] = member.user_id;
        }
      }

      // Build name → userId lookup
      const nameToUserId: Record<string, string> = {};
      for (const p of profiles) {
        if (p.display_name) {
          nameToUserId[p.display_name.toLowerCase()] = p.user_id;
        }
      }

      // Determine who gets what deals
      const recipientDeals: Record<string, { deals: AttentionDeal[]; isGlobal: boolean; name: string }> = {};

      // 1. Always-notify emails get ALL attention deals (regardless of notification preferences)
      const alwaysNotifyEmails = (config.always_notify_emails || []).map(e => e.toLowerCase());
      for (const email of alwaysNotifyEmails) {
        const userId = emailToUserId[email];
        if (!userId) {
          console.log(`Always-notify email ${email} not found in company members`);
          continue;
        }
        const profile = profiles.find(p => p.user_id === userId);
        recipientDeals[userId] = {
          deals: [...attentionDeals],
          isGlobal: true,
          name: profile?.display_name || 'there',
        };
      }

      // 2. Admins/owners get ALL deals (if enabled and not already an always-notify recipient)
      if (config.notify_admins) {
        for (const member of members) {
          if (member.role === 'owner' || member.role === 'admin') {
            if (recipientDeals[member.user_id]?.isGlobal) continue; // already has all deals
            const profile = profiles.find(p => p.user_id === member.user_id);
            if (!profile || !profile.email_notifications || !profile.notify_stale_alerts) continue;
            if (!emailMap[member.user_id]) continue;

            recipientDeals[member.user_id] = {
              deals: [...attentionDeals],
              isGlobal: true,
              name: profile.display_name || 'there',
            };
          }
        }
      }

      // 3. Deal managers get only THEIR deals
      if (config.notify_managers) {
        for (const deal of attentionDeals) {
          if (!deal.manager) continue;
          const managerId = nameToUserId[deal.manager.toLowerCase()];
          if (!managerId) continue;

          const profile = profiles.find(p => p.user_id === managerId);
          if (!profile || !profile.email_notifications || !profile.notify_stale_alerts) continue;
          if (!emailMap[managerId]) continue;
          if (recipientDeals[managerId]?.isGlobal) continue;

          if (!recipientDeals[managerId]) {
            recipientDeals[managerId] = { deals: [], isGlobal: false, name: profile.display_name || 'there' };
          }
          if (!recipientDeals[managerId].deals.some(d => d.id === deal.id)) {
            recipientDeals[managerId].deals.push(deal);
          }
        }
      }

      // 4. Analysts get only deals they're tagged on
      for (const deal of attentionDeals) {
        if (!deal.analyst) continue;
        const analystId = nameToUserId[deal.analyst.toLowerCase()];
        if (!analystId) continue;

        const profile = profiles.find(p => p.user_id === analystId);
        if (!profile || !profile.email_notifications || !profile.notify_stale_alerts) continue;
        if (!emailMap[analystId]) continue;
        if (recipientDeals[analystId]?.isGlobal) continue;

        if (!recipientDeals[analystId]) {
          recipientDeals[analystId] = { deals: [], isGlobal: false, name: profile.display_name || 'there' };
        }
        if (!recipientDeals[analystId].deals.some(d => d.id === deal.id)) {
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
            recipient.isGlobal
          );

          await resend.emails.send({
            from: buildFrom("Naitive"),
            to: [email],
            subject: `naitive: ${recipient.deals.length} Deal${recipient.deals.length !== 1 ? 's' : ''} Need${recipient.deals.length === 1 ? 's' : ''} Attention`,
            html: emailHtml,
          });

          results.push({ user_id: userId, email, company_id: settings.company_id, deal_count: recipient.deals.length, is_global: recipient.isGlobal, success: true });
          console.log(`Deal attention alert sent to ${email} (${recipient.isGlobal ? 'global' : 'role-based'}, ${recipient.deals.length} deals)`);
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
