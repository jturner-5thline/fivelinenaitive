// deno-lint-ignore-file
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { buildFrom } from '../_shared/resendFrom.ts';
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── ET helpers ──────────────────────────────────────────────────
// Eastern Time is UTC-5 (EST) or UTC-4 (EDT). We compute the current
// offset dynamically so the function works year-round.
function getETOffset(): number {
  // Create a date and check if it falls within DST
  const now = new Date();
  const jan = new Date(now.getFullYear(), 0, 1);
  const jul = new Date(now.getFullYear(), 6, 1);
  const stdOffset = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
  // For US Eastern: std = 300 (UTC-5), DST = 240 (UTC-4)
  // We determine by checking a formatted date in America/New_York
  const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const etDate = new Date(etStr);
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const diffHours = Math.round((etDate.getTime() - utcMs) / 3600000);
  return diffHours; // -5 or -4
}

function nowInET(): Date {
  const now = new Date();
  const offsetHours = getETOffset();
  return new Date(now.getTime() + offsetHours * 3600000 + now.getTimezoneOffset() * 60000);
}

function getDayNameET(d: Date): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[d.getDay()];
}

function isWeekday(d: Date): boolean {
  const day = d.getDay();
  return day >= 1 && day <= 5;
}

function timeStr(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Check if current ET time is within a 15-min window of the target time
function isWithinWindow(currentTimeET: string, targetTime: string): boolean {
  const [ch, cm] = currentTimeET.split(':').map(Number);
  const [th, tm] = targetTime.split(':').map(Number);
  const currentMins = ch * 60 + cm;
  const targetMins = th * 60 + tm;
  return currentMins >= targetMins && currentMins < targetMins + 15;
}

function formatCurrency(val: number | null): string {
  if (!val) return 'N/A';
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}MM`;
  if (val >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}

function formatDateET(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

// ── Email template builder ──────────────────────────────────────
function buildSummaryEmail(
  type: 'daily' | 'weekly',
  userName: string,
  data: { deals: any[]; actionItems: any[]; lenderActivity: any[]; milestoneActivity: any[] }
): { subject: string; html: string; text: string } {
  const periodLabel = type === 'daily' ? 'Daily' : 'Weekly';
  const subject = `naitive ${periodLabel} Deal Summary`;
  const appUrl = 'https://naitive.co';

  // Build sections
  const dealsSection = data.deals.length > 0
    ? `<h2 style="color:#1a1a1a;font-size:18px;margin:24px 0 12px;">Deals Added</h2>
       <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
         <tr style="background:#f9fafb;">
           <th style="text-align:left;padding:10px 12px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Deal</th>
           <th style="text-align:left;padding:10px 12px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Stage</th>
           <th style="text-align:right;padding:10px 12px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Amount</th>
         </tr>
         ${data.deals.map(d => `
           <tr>
             <td style="padding:10px 12px;font-size:14px;color:#1a1a1a;border-bottom:1px solid #f3f4f6;"><strong>${d.company || 'Unnamed'}</strong></td>
             <td style="padding:10px 12px;font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6;">${d.stage || '—'}</td>
             <td style="padding:10px 12px;font-size:13px;color:#1a1a1a;text-align:right;border-bottom:1px solid #f3f4f6;">${formatCurrency(d.value)}</td>
           </tr>`).join('')}
       </table>`
    : '<p style="color:#9ca3af;font-size:14px;margin:16px 0;">No new deals added.</p>';

  const actionSection = data.actionItems.length > 0
    ? `<h2 style="color:#1a1a1a;font-size:18px;margin:24px 0 12px;">Action Items</h2>
       <ul style="color:#4a4a4a;padding-left:20px;margin:0;">
         ${data.actionItems.slice(0, 10).map(a => `<li style="margin-bottom:8px;font-size:14px;line-height:1.5;">${a.title || a.description}${a.deal_name ? ` <span style="color:#9ca3af;">— ${a.deal_name}</span>` : ''}</li>`).join('')}
       </ul>`
    : '<p style="color:#9ca3af;font-size:14px;margin:16px 0;">No action items.</p>';

  const lenderSection = data.lenderActivity.length > 0
    ? `<h2 style="color:#1a1a1a;font-size:18px;margin:24px 0 12px;">Lender Activity</h2>
       <ul style="color:#4a4a4a;padding-left:20px;margin:0;">
         ${data.lenderActivity.slice(0, 10).map(l => `<li style="margin-bottom:8px;font-size:14px;line-height:1.5;">${l.description}${l.deal_name ? ` <span style="color:#9ca3af;">— ${l.deal_name}</span>` : ''}</li>`).join('')}
       </ul>`
    : '<p style="color:#9ca3af;font-size:14px;margin:16px 0;">No lender activity.</p>';

  const milestoneSection = data.milestoneActivity.length > 0
    ? `<h2 style="color:#1a1a1a;font-size:18px;margin:24px 0 12px;">Milestone Activity</h2>
       <ul style="color:#4a4a4a;padding-left:20px;margin:0;">
         ${data.milestoneActivity.slice(0, 10).map(m => `<li style="margin-bottom:8px;font-size:14px;line-height:1.5;">${m.title}${m.deal_name ? ` <span style="color:#9ca3af;">— ${m.deal_name}</span>` : ''}${m.completed ? ' ✓' : ''}</li>`).join('')}
       </ul>`
    : '<p style="color:#9ca3af;font-size:14px;margin:16px 0;">No milestone activity.</p>';

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="color-scheme" content="light"><title>${subject}</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f5f5f5;">
  <div style="display:none;max-height:0;overflow:hidden;">${periodLabel} summary: ${data.deals.length} deals, ${data.actionItems.length} action items, ${data.lenderActivity.length} lender updates.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f5f5f5;">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border-radius:8px;">
        <tr><td style="padding:40px;">
          <h1 style="color:#1a1a1a;font-size:24px;font-weight:600;margin:0 0 4px;">naitive ${periodLabel} Deal Summary</h1>
          <p style="color:#888;font-size:13px;margin:0 0 4px;">Hi ${userName},</p>
          <p style="color:#aaa;font-size:11px;margin:0 0 24px;">All times shown in Eastern Time (ET)</p>

          <!-- Stats -->
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:8px;">
            <tr>
              <td width="25%" style="padding:0 4px 0 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:linear-gradient(135deg,#8B5CF6,#D946EF);border-radius:8px;">
                  <tr><td style="padding:16px;text-align:center;">
                    <div style="font-size:24px;font-weight:bold;color:#fff;">${data.deals.length}</div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.9);">Deals</div>
                  </td></tr>
                </table>
              </td>
              <td width="25%" style="padding:0 4px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f5f5;border-radius:8px;">
                  <tr><td style="padding:16px;text-align:center;">
                    <div style="font-size:24px;font-weight:bold;color:#1a1a1a;">${data.actionItems.length}</div>
                    <div style="font-size:11px;color:#666;">Actions</div>
                  </td></tr>
                </table>
              </td>
              <td width="25%" style="padding:0 4px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f5f5;border-radius:8px;">
                  <tr><td style="padding:16px;text-align:center;">
                    <div style="font-size:24px;font-weight:bold;color:#1a1a1a;">${data.lenderActivity.length}</div>
                    <div style="font-size:11px;color:#666;">Lender</div>
                  </td></tr>
                </table>
              </td>
              <td width="25%" style="padding:0 0 0 4px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f5f5;border-radius:8px;">
                  <tr><td style="padding:16px;text-align:center;">
                    <div style="font-size:24px;font-weight:bold;color:#1a1a1a;">${data.milestoneActivity.length}</div>
                    <div style="font-size:11px;color:#666;">Milestones</div>
                  </td></tr>
                </table>
              </td>
            </tr>
          </table>

          ${dealsSection}
          ${actionSection}
          ${lenderSection}
          ${milestoneSection}

          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:32px;">
            <tr><td style="border-radius:8px;background:linear-gradient(135deg,#8B5CF6,#D946EF);">
              <a href="${appUrl}/deals" target="_blank" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:600;color:#fff;text-decoration:none;">View Dashboard</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:24px 40px;border-top:1px solid #eee;text-align:center;">
          <p style="color:#888;font-size:12px;margin:0 0 8px;">© ${new Date().getFullYear()} naitive. All rights reserved.</p>
          <p style="color:#888;font-size:12px;margin:0;">
            <a href="${appUrl}/settings" style="color:#8B5CF6;text-decoration:underline;">Manage preferences</a>
            &nbsp;|&nbsp;
            <a href="${appUrl}/unsubscribe" style="color:#8B5CF6;text-decoration:underline;">Unsubscribe</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `naitive ${periodLabel} Deal Summary\n\nHi ${userName},\nAll times in ET.\n\nDeals Added: ${data.deals.length}\nAction Items: ${data.actionItems.length}\nLender Activity: ${data.lenderActivity.length}\nMilestones: ${data.milestoneActivity.length}\n\nView Dashboard: ${appUrl}/deals\n\n---\nManage preferences: ${appUrl}/settings`;

  return { subject, html, text };
}

// ── Main handler ────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Parse body for test mode
  let testMode: { enabled: boolean; email?: string; types?: string[] } = { enabled: false };
  let bodyParsed = false;
  try {
    const body = await req.json();
    bodyParsed = true;
    if (body?.test && body?.email) {
      testMode = { enabled: true, email: body.email, types: body.types || ['daily', 'weekly'] };
      console.log(`[deal-summaries] TEST MODE: sending ${testMode.types?.join(', ')} to ${testMode.email}`);
    }
  } catch { /* no body = normal cron mode */ }

  // Auth: service role key or CRON_SECRET (test mode bypasses for internal use)
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '') || '';
  const expectedSecret = Deno.env.get('CRON_SECRET');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const isAuthorized = token === expectedSecret || token === serviceRoleKey || testMode.enabled;
  if (!isAuthorized) {
    console.error('[deal-summaries] Unauthorized');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    console.error('[deal-summaries] RESEND_API_KEY not configured');
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY missing' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const resend = new Resend(resendApiKey);

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const etNow = nowInET();
    const currentTimeET = timeStr(etNow);
    const currentDayET = getDayNameET(etNow);
    const weekday = isWeekday(etNow);

    console.log(`[deal-summaries] Running at ET: ${currentTimeET}, day: ${currentDayET}, weekday: ${weekday}`);

    // Fetch all user deal summary preferences with their company membership
    const { data: allUserPrefs, error: prefsErr } = await supabaseAdmin
      .from('user_deal_summary_preferences')
      .select('*');

    if (prefsErr) throw prefsErr;

    // Fetch all org defaults
    const { data: allOrgDefaults, error: orgErr } = await supabaseAdmin
      .from('org_notification_defaults')
      .select('*');

    if (orgErr) throw orgErr;

    const orgDefaultsMap: Record<string, any> = {};
    (allOrgDefaults || []).forEach((o: any) => { orgDefaultsMap[o.company_id] = o; });

    // Fetch all company memberships
    const { data: allMemberships, error: memberErr } = await supabaseAdmin
      .from('company_members')
      .select('user_id, company_id');

    if (memberErr) throw memberErr;

    const userCompanyMap: Record<string, string> = {};
    (allMemberships || []).forEach((m: any) => { userCompanyMap[m.user_id] = m.company_id; });

    // Build effective preferences for each user
    type EffectivePrefs = {
      userId: string;
      dailyEnabled: boolean;
      dailyTimeET: string;
      dailyWeekdaysOnly: boolean;
      weeklyEnabled: boolean;
      weeklyDayET: string;
      weeklyTimeET: string;
      lastDailySent: string | null;
      lastWeeklySent: string | null;
    };

    // Get unique user IDs: anyone with a pref row or anyone in an org with defaults
    const userIdsWithPrefs = new Set<string>();
    (allUserPrefs || []).forEach((p: any) => userIdsWithPrefs.add(p.user_id));
    // Also include users whose org has defaults enabled
    (allMemberships || []).forEach((m: any) => {
      const orgDef = orgDefaultsMap[m.company_id];
      if (orgDef && (orgDef.daily_deal_summary_enabled || orgDef.weekly_deal_summary_enabled)) {
        userIdsWithPrefs.add(m.user_id);
      }
    });

    const userPrefsMap: Record<string, any> = {};
    (allUserPrefs || []).forEach((p: any) => { userPrefsMap[p.user_id] = p; });

    const effectiveUsers: EffectivePrefs[] = [];

    for (const userId of userIdsWithPrefs) {
      const companyId = userCompanyMap[userId];
      const orgDef = companyId ? orgDefaultsMap[companyId] : null;
      const userPref = userPrefsMap[userId];

      // Resolve effective values: user override ?? org default ?? system default (false)
      const dailyEnabled = userPref?.daily_deal_summary_enabled ?? orgDef?.daily_deal_summary_enabled ?? false;
      const dailyTimeET = userPref?.daily_deal_summary_time_et ?? orgDef?.daily_deal_summary_time_et ?? '18:00';
      const dailyWeekdaysOnly = orgDef?.daily_deal_summary_weekdays_only ?? true;
      const weeklyEnabled = userPref?.weekly_deal_summary_enabled ?? orgDef?.weekly_deal_summary_enabled ?? false;
      const weeklyDayET = userPref?.weekly_deal_summary_day_et ?? orgDef?.weekly_deal_summary_day_et ?? 'saturday';
      const weeklyTimeET = userPref?.weekly_deal_summary_time_et ?? orgDef?.weekly_deal_summary_time_et ?? '08:00';

      effectiveUsers.push({
        userId,
        dailyEnabled,
        dailyTimeET: typeof dailyTimeET === 'string' ? dailyTimeET.substring(0, 5) : '18:00',
        dailyWeekdaysOnly,
        weeklyEnabled,
        weeklyDayET,
        weeklyTimeET: typeof weeklyTimeET === 'string' ? weeklyTimeET.substring(0, 5) : '08:00',
        lastDailySent: userPref?.last_daily_deal_summary_sent_at ?? null,
        lastWeeklySent: userPref?.last_weekly_deal_summary_sent_at ?? null,
      });
    }

    const results: { userId: string; type: string; success: boolean; error?: string }[] = [];
    const todayETStr = `${etNow.getFullYear()}-${String(etNow.getMonth() + 1).padStart(2, '0')}-${String(etNow.getDate()).padStart(2, '0')}`;

    // ── TEST MODE: send with fake sample data ──
    if (testMode.enabled) {
      const useFakeData = testMode.types?.includes('fake') || true; // always use fake for visual testing
      const userName = 'Jordan';

      const fakeDeals = [
        { company: 'Meridian Capital Partners', stage: 'Pre-Credit Needs', value: 12500000, created_at: new Date().toISOString(), contact_email: 'sarah@meridiancap.com', contact_name: 'Sarah Chen' },
        { company: 'Blackstone Realty Group', stage: 'NDA & Materials Sent', value: 8750000, created_at: new Date(Date.now() - 86400000).toISOString(), contact_email: 'mike@blackstonerealty.com', contact_name: 'Mike Rodriguez' },
        { company: 'Summit Ridge Holdings', stage: 'Submitted to Lenders', value: 22000000, created_at: new Date(Date.now() - 172800000).toISOString(), contact_email: 'jlee@summitridge.com', contact_name: 'Jennifer Lee' },
        { company: 'Cornerstone Development LLC', stage: 'Agreement Pending', value: 5200000, created_at: new Date(Date.now() - 259200000).toISOString(), contact_email: 'dave@cornerstonedev.com', contact_name: 'David Park' },
      ];

      const fakeActionItems = [
        { title: 'Follow up on NDA signature — awaiting countersign from borrower counsel', deal_name: 'Meridian Capital Partners' },
        { title: 'Request updated rent roll and T-12 operating statement', deal_name: 'Blackstone Realty Group' },
        { title: 'Schedule pre-credit call with underwriting team', deal_name: 'Summit Ridge Holdings' },
        { title: 'Review and send engagement letter for client approval', deal_name: 'Cornerstone Development LLC' },
        { title: 'Upload environmental Phase I report to data room', deal_name: 'Meridian Capital Partners' },
        { title: 'Confirm property insurance binder with carrier', deal_name: 'Blackstone Realty Group' },
      ];

      const fakeLenderActivity = [
        { description: 'JPMorgan Chase submitted initial term sheet — 5.75% fixed, 75% LTV', deal_name: 'Summit Ridge Holdings' },
        { description: 'Wells Fargo requested additional collateral documentation', deal_name: 'Meridian Capital Partners' },
        { description: 'PNC Bank declined — leverage too high for current program', deal_name: 'Blackstone Realty Group' },
        { description: 'Signature Bank moved to full underwriting review', deal_name: 'Summit Ridge Holdings' },
        { description: 'KeyBank updated rate lock to 6.10% — expires April 15', deal_name: 'Cornerstone Development LLC' },
      ];

      const fakeMilestoneActivity = [
        { title: 'Appraisal ordered with CBRE — estimated delivery April 8', deal_name: 'Summit Ridge Holdings', completed: false },
        { title: 'Title search completed — no liens found', deal_name: 'Meridian Capital Partners', completed: true },
        { title: 'Environmental Phase II cleared — no further action required', deal_name: 'Blackstone Realty Group', completed: true },
        { title: 'Borrower financial statements received and uploaded', deal_name: 'Cornerstone Development LLC', completed: true },
        { title: 'Zoning confirmation letter pending from municipality', deal_name: 'Summit Ridge Holdings', completed: false },
      ];

      const emailData = {
        deals: fakeDeals,
        actionItems: fakeActionItems,
        lenderActivity: fakeLenderActivity,
        milestoneActivity: fakeMilestoneActivity,
      };

      for (const type of (testMode.types || ['daily', 'weekly'])) {
        if (type === 'fake') continue;
        const email = buildSummaryEmail(type as 'daily' | 'weekly', userName, emailData);
        await resend.emails.send({
          from: buildFrom("naitive"),
          reply_to: 'support@naitive.co',
          to: [testMode.email!],
          subject: `[TEST] ${email.subject}`,
          html: email.html,
          text: email.text,
          headers: {
            'List-Unsubscribe': '<https://naitive.co/unsubscribe>',
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        });
        results.push({ userId: 'test', type, success: true });
        console.log(`[deal-summaries] TEST ${type} sent to ${testMode.email}`);
      }

      return new Response(JSON.stringify({ success: true, testMode: true, processed: results.length, results }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    for (const eff of effectiveUsers) {
      // Check daily
      const dailyDue = eff.dailyEnabled
        && (!eff.dailyWeekdaysOnly || weekday)
        && isWithinWindow(currentTimeET, eff.dailyTimeET)
        && (!eff.lastDailySent || eff.lastDailySent.substring(0, 10) < todayETStr);

      // Check weekly
      const weeklyDue = eff.weeklyEnabled
        && currentDayET === eff.weeklyDayET
        && isWithinWindow(currentTimeET, eff.weeklyTimeET)
        && (!eff.lastWeeklySent || daysBetween(eff.lastWeeklySent, new Date().toISOString()) >= 6);

      if (!dailyDue && !weeklyDue) continue;

      try {
        // Get user email
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(eff.userId);
        if (!userData?.user?.email) continue;

        // Get profile
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('display_name, first_name')
          .eq('user_id', eff.userId)
          .maybeSingle();

        const userName = profile?.first_name || profile?.display_name || 'there';

        // Get user's deals
        const { data: deals } = await supabaseAdmin
          .from('deals')
          .select('id, company, stage, value, created_at, contact_email, contact_name')
          .eq('user_id', eff.userId);

        if (!deals || deals.length === 0) continue;

        const dealIds = deals.map(d => d.id);

        // Determine time window
        const windowStart = dailyDue
          ? (eff.lastDailySent || new Date(Date.now() - 86400000).toISOString())
          : (eff.lastWeeklySent || new Date(Date.now() - 7 * 86400000).toISOString());

        // Deals added in window
        const newDeals = deals.filter(d => d.created_at >= windowStart);

        // Action items: open wf_tasks for user's deals
        const { data: actionItems } = await supabaseAdmin
          .from('wf_tasks')
          .select('title, description, deal_id, status')
          .in('deal_id', dealIds)
          .in('status', ['open', 'pending'])
          .limit(20);

        // Enrich action items with deal names
        const dealNameMap: Record<string, string> = {};
        deals.forEach(d => { dealNameMap[d.id] = d.company || 'Unknown'; });
        const enrichedActions = (actionItems || []).map(a => ({
          ...a,
          deal_name: dealNameMap[a.deal_id] || '',
        }));

        // Lender activity
        const { data: lenderActivity } = await supabaseAdmin
          .from('activity_logs')
          .select('description, deal_id, created_at, activity_type')
          .in('deal_id', dealIds)
          .in('activity_type', ['lender_added', 'lender_updated', 'lender_status_changed', 'lender_note_added'])
          .gte('created_at', windowStart)
          .order('created_at', { ascending: false })
          .limit(15);

        const enrichedLender = (lenderActivity || []).map(l => ({
          ...l,
          deal_name: dealNameMap[l.deal_id] || '',
        }));

        // Milestone activity
        const { data: milestoneActivity } = await supabaseAdmin
          .from('activity_logs')
          .select('description, deal_id, created_at, activity_type')
          .in('deal_id', dealIds)
          .in('activity_type', ['milestone_added', 'milestone_completed', 'milestone_updated'])
          .gte('created_at', windowStart)
          .order('created_at', { ascending: false })
          .limit(15);

        const enrichedMilestones = (milestoneActivity || []).map(m => ({
          title: m.description,
          deal_name: dealNameMap[m.deal_id] || '',
          completed: m.activity_type === 'milestone_completed',
        }));

        // Send emails
        if (dailyDue) {
          const email = buildSummaryEmail('daily', userName, {
            deals: newDeals,
            actionItems: enrichedActions,
            lenderActivity: enrichedLender,
            milestoneActivity: enrichedMilestones,
          });

          await resend.emails.send({
            from: buildFrom("naitive"),
            reply_to: 'support@naitive.co',
            to: [userData.user.email],
            subject: email.subject,
            html: email.html,
            text: email.text,
            headers: {
              'List-Unsubscribe': '<https://naitive.co/unsubscribe>',
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          });

          // Update last sent
          await supabaseAdmin
            .from('user_deal_summary_preferences')
            .upsert(
              { user_id: eff.userId, last_daily_deal_summary_sent_at: new Date().toISOString() },
              { onConflict: 'user_id' }
            );

          results.push({ userId: eff.userId, type: 'daily', success: true });
          console.log(`[deal-summaries] Daily sent to ${userData.user.email}`);
        }

        if (weeklyDue) {
          // For weekly, use the longer window
          const weeklyWindowStart = eff.lastWeeklySent || new Date(Date.now() - 7 * 86400000).toISOString();
          const weeklyNewDeals = deals.filter(d => d.created_at >= weeklyWindowStart);

          const { data: weeklyLender } = await supabaseAdmin
            .from('activity_logs')
            .select('description, deal_id, created_at, activity_type')
            .in('deal_id', dealIds)
            .in('activity_type', ['lender_added', 'lender_updated', 'lender_status_changed', 'lender_note_added'])
            .gte('created_at', weeklyWindowStart)
            .order('created_at', { ascending: false })
            .limit(20);

          const { data: weeklyMilestones } = await supabaseAdmin
            .from('activity_logs')
            .select('description, deal_id, created_at, activity_type')
            .in('deal_id', dealIds)
            .in('activity_type', ['milestone_added', 'milestone_completed', 'milestone_updated'])
            .gte('created_at', weeklyWindowStart)
            .order('created_at', { ascending: false })
            .limit(20);

          const email = buildSummaryEmail('weekly', userName, {
            deals: weeklyNewDeals,
            actionItems: enrichedActions,
            lenderActivity: (weeklyLender || []).map(l => ({ ...l, deal_name: dealNameMap[l.deal_id] || '' })),
            milestoneActivity: (weeklyMilestones || []).map(m => ({
              title: m.description,
              deal_name: dealNameMap[m.deal_id] || '',
              completed: m.activity_type === 'milestone_completed',
            })),
          });

          await resend.emails.send({
            from: buildFrom("naitive"),
            reply_to: 'support@naitive.co',
            to: [userData.user.email],
            subject: email.subject,
            html: email.html,
            text: email.text,
            headers: {
              'List-Unsubscribe': '<https://naitive.co/unsubscribe>',
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          });

          await supabaseAdmin
            .from('user_deal_summary_preferences')
            .upsert(
              { user_id: eff.userId, last_weekly_deal_summary_sent_at: new Date().toISOString() },
              { onConflict: 'user_id' }
            );

          results.push({ userId: eff.userId, type: 'weekly', success: true });
          console.log(`[deal-summaries] Weekly sent to ${userData.user.email}`);
        }
      } catch (userErr: any) {
        console.error(`[deal-summaries] Error for user ${eff.userId}:`, userErr);
        results.push({ userId: eff.userId, type: dailyDue ? 'daily' : 'weekly', success: false, error: userErr.message });
      }
    }

    console.log(`[deal-summaries] Complete: ${results.length} emails processed`);

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[deal-summaries] Fatal error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function daysBetween(iso1: string, iso2: string): number {
  const d1 = new Date(iso1);
  const d2 = new Date(iso2);
  return Math.abs(Math.floor((d2.getTime() - d1.getTime()) / 86400000));
}
