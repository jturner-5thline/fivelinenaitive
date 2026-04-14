// deno-lint-ignore-file
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TARGET_EMAIL = 'jturner@5thline.co';
const APP_URL = 'https://fivelinenaitive.lovable.app';

// ── ET helpers ──────────────────────────────────────────────────
function getETOffset(): number {
  const now = new Date();
  const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const etDate = new Date(etStr);
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return Math.round((etDate.getTime() - utcMs) / 3600000);
}

function nowInET(): Date {
  const now = new Date();
  const offsetHours = getETOffset();
  return new Date(now.getTime() + offsetHours * 3600000 + now.getTimezoneOffset() * 60000);
}

function timeStr(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function isWithinWindow(currentTimeET: string, targetTime: string): boolean {
  const [ch, cm] = currentTimeET.split(':').map(Number);
  const [th, tm] = targetTime.split(':').map(Number);
  const diff = (ch * 60 + cm) - (th * 60 + tm);
  return diff >= 0 && diff < 15;
}

/** Get briefing window: yesterday 5pm ET → today 7am ET, as UTC ISO strings */
function getBriefingWindow(): { startISO: string; endISO: string } {
  const offsetMs = getETOffset() * 3600000;
  const now = new Date();
  const etNow = nowInET();

  const yesterdayET = new Date(etNow);
  yesterdayET.setDate(yesterdayET.getDate() - 1);

  // 5 PM ET yesterday
  const startET = new Date(yesterdayET.getFullYear(), yesterdayET.getMonth(), yesterdayET.getDate(), 17, 0, 0, 0);
  const startUTC = new Date(startET.getTime() - offsetMs - startET.getTimezoneOffset() * 60000);

  // 7 AM ET today
  const endET = new Date(etNow.getFullYear(), etNow.getMonth(), etNow.getDate(), 7, 0, 0, 0);
  const endUTC = new Date(endET.getTime() - offsetMs - endET.getTimezoneOffset() * 60000);

  return { startISO: startUTC.toISOString(), endISO: endUTC.toISOString() };
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildBriefingEmail(data: {
  activities: any[];
  emails: any[];
  invoices: any[];
  expenses: any[];
  stageChanges: any[];
  milestones: any[];
  newDealNames: string[];
}): { subject: string; html: string; text: string } {
  const today = nowInET();
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const subject = `Daily Briefing — ${dateStr}`;

  const totalRev = data.invoices.reduce((s: number, i: any) => s + (i.total_amt || 0), 0);
  const totalExp = data.expenses.reduce((s: number, e: any) => s + (e.total_amt || 0), 0);

  const sections: string[] = [];

  // Catch Up
  const activityItems = data.activities.slice(0, 8).map((a: any) =>
    `<li style="margin-bottom:6px;color:#d1d5db;">${escHtml(a.description)} <span style="color:#9ca3af;font-size:11px;">— ${escHtml(a.user_display_name || 'System')}</span></li>`
  ).join('');
  sections.push(`
    <div style="margin-bottom:24px;">
      <h2 style="color:#7eb8f7;font-size:16px;margin:0 0 10px;">📋 Catch Up & News</h2>
      ${activityItems ? `<ul style="margin:0;padding-left:18px;list-style:disc;">${activityItems}</ul>` : '<p style="color:#6b7280;">No activity in this window.</p>'}
    </div>
  `);

  // Email
  const emailCount = data.emails.length;
  const emailItems = data.emails.slice(0, 6).map((e: any) =>
    `<li style="margin-bottom:6px;color:#d1d5db;">${escHtml(e.subject || '(no subject)')} <span style="color:#9ca3af;font-size:11px;">— ${escHtml(e.from_name || e.from_email || 'Unknown')}</span></li>`
  ).join('');
  sections.push(`
    <div style="margin-bottom:24px;">
      <h2 style="color:#7eb8f7;font-size:16px;margin:0 0 10px;">📧 Email (${emailCount} emails)</h2>
      ${emailItems ? `<ul style="margin:0;padding-left:18px;list-style:disc;">${emailItems}</ul>` : '<p style="color:#6b7280;">No emails in this window.</p>'}
      ${emailCount > 6 ? `<p style="color:#9ca3af;font-size:12px;">+ ${emailCount - 6} more</p>` : ''}
    </div>
  `);

  // Financial
  sections.push(`
    <div style="margin-bottom:24px;">
      <h2 style="color:#7eb8f7;font-size:16px;margin:0 0 10px;">💰 Financial</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:8px 12px;background:#0d1f2d;border-radius:6px;text-align:center;width:50%;">
            <div style="color:#9ca3af;font-size:11px;">Revenue</div>
            <div style="color:#34d399;font-size:20px;font-weight:700;">$${totalRev.toLocaleString()}</div>
            <div style="color:#6b7280;font-size:10px;">${data.invoices.length} invoices</div>
          </td>
          <td style="width:8px;"></td>
          <td style="padding:8px 12px;background:#0d1f2d;border-radius:6px;text-align:center;width:50%;">
            <div style="color:#9ca3af;font-size:11px;">Expenses</div>
            <div style="color:#f87171;font-size:20px;font-weight:700;">$${totalExp.toLocaleString()}</div>
            <div style="color:#6b7280;font-size:10px;">${data.expenses.length} items</div>
          </td>
        </tr>
      </table>
    </div>
  `);

  // Pipeline
  const newDealList = data.newDealNames.map(n => `<li style="margin-bottom:4px;color:#d1d5db;">${escHtml(n)}</li>`).join('');
  const stageList = data.stageChanges.slice(0, 6).map((sc: any) =>
    `<li style="margin-bottom:4px;color:#d1d5db;">${escHtml(sc.description)}</li>`
  ).join('');
  sections.push(`
    <div style="margin-bottom:24px;">
      <h2 style="color:#7eb8f7;font-size:16px;margin:0 0 10px;">📊 Pipeline & Clients</h2>
      <h3 style="color:#9ca3af;font-size:13px;margin:0 0 6px;">New Opportunities</h3>
      ${newDealList ? `<ul style="margin:0 0 12px;padding-left:18px;list-style:disc;">${newDealList}</ul>` : '<p style="color:#6b7280;margin:0 0 12px;">No new deals.</p>'}
      <h3 style="color:#9ca3af;font-size:13px;margin:0 0 6px;">Stage Changes</h3>
      ${stageList ? `<ul style="margin:0;padding-left:18px;list-style:disc;">${stageList}</ul>` : '<p style="color:#6b7280;">No stage changes.</p>'}
    </div>
  `);

  // Operational
  const overdueList = data.milestones
    .filter((m: any) => m.due_date && new Date(m.due_date) < new Date() && !m.completed)
    .slice(0, 6)
    .map((m: any) => `<li style="margin-bottom:4px;color:#fca5a5;">${escHtml(m.title)} — due ${m.due_date}</li>`)
    .join('');
  const upcomingList = data.milestones
    .filter((m: any) => m.due_date && new Date(m.due_date) >= new Date() && !m.completed)
    .slice(0, 6)
    .map((m: any) => `<li style="margin-bottom:4px;color:#d1d5db;">${escHtml(m.title)} — due ${m.due_date}</li>`)
    .join('');
  sections.push(`
    <div style="margin-bottom:24px;">
      <h2 style="color:#7eb8f7;font-size:16px;margin:0 0 10px;">⚙️ Operational & Projects</h2>
      ${overdueList ? `<h3 style="color:#f87171;font-size:13px;margin:0 0 6px;">Overdue</h3><ul style="margin:0 0 12px;padding-left:18px;list-style:disc;">${overdueList}</ul>` : ''}
      ${upcomingList ? `<h3 style="color:#9ca3af;font-size:13px;margin:0 0 6px;">Upcoming</h3><ul style="margin:0;padding-left:18px;list-style:disc;">${upcomingList}</ul>` : ''}
      ${!overdueList && !upcomingList ? '<p style="color:#6b7280;">No milestones to highlight.</p>' : ''}
    </div>
  `);

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/></head><body style="margin:0;padding:0;background:#0b1118;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:640px;margin:0 auto;padding:32px 24px;">
      <div style="margin-bottom:24px;">
        <h1 style="color:#e5e7eb;font-size:22px;margin:0 0 4px;">Daily Briefing</h1>
        <p style="color:#6b7280;font-size:13px;margin:0;">Since 5 PM ET yesterday • ${escHtml(dateStr)}</p>
      </div>
      ${sections.join('')}
      <div style="border-top:1px solid #1f2937;padding-top:16px;margin-top:16px;text-align:center;">
        <a href="${APP_URL}/dashboard" style="display:inline-block;padding:10px 24px;background:#3b82f6;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Open Dashboard</a>
      </div>
      <p style="color:#4b5563;font-size:11px;text-align:center;margin-top:20px;">naitive • 5th Line Capital Advisors</p>
    </div>
  </body></html>`;

  const text = `Daily Briefing — ${dateStr}\n\nActivities: ${data.activities.length}\nEmails: ${emailCount}\nRevenue: $${totalRev.toLocaleString()}\nExpenses: $${totalExp.toLocaleString()}\nNew deals: ${data.newDealNames.length}\nOverdue tasks: ${data.milestones.filter((m: any) => m.due_date && new Date(m.due_date) < new Date() && !m.completed).length}\n\nOpen dashboard: ${APP_URL}/dashboard`;

  return { subject, html, text };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '') || '';
  const expectedSecret = Deno.env.get('CRON_SECRET');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  let testMode = false;
  try {
    const body = await req.json();
    if (body?.test) testMode = true;
  } catch { /* no body = cron mode */ }

  const isAuthorized = token === expectedSecret || token === serviceRoleKey || testMode;
  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Time check (skip if test mode)
  if (!testMode) {
    const etNow = nowInET();
    const currentTimeET = timeStr(etNow);
    if (!isWithinWindow(currentTimeET, '07:00')) {
      return new Response(JSON.stringify({ skipped: true, reason: `Not 7am ET (current: ${currentTimeET})` }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY missing' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const resend = new Resend(resendApiKey);

    const { startISO, endISO } = getBriefingWindow();
    console.log(`[daily-briefing] Window: ${startISO} → ${endISO}`);

    // Find jturner user
    const { data: userData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const jturner = userData?.users?.find((u: any) => u.email === TARGET_EMAIL);
    if (!jturner) {
      return new Response(JSON.stringify({ error: 'Target user not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch data in parallel
    const [activitiesRes, emailsRes, invoicesRes, expensesRes, stageChangesRes, milestonesRes] = await Promise.all([
      supabaseAdmin.from('activity_logs')
        .select('id, deal_id, activity_type, description, user_display_name, created_at')
        .gte('created_at', startISO).lte('created_at', endISO)
        .order('created_at', { ascending: false }).limit(50),
      supabaseAdmin.from('email_cache')
        .select('id, subject, snippet, from_email, from_name, received_at')
        .eq('user_id', jturner.id)
        .gte('received_at', startISO).lte('received_at', endISO)
        .order('received_at', { ascending: false }).limit(30),
      supabaseAdmin.from('quickbooks_invoices')
        .select('id, txn_date, customer_name, total_amt')
        .gte('txn_date', startISO.slice(0, 10)).lte('txn_date', endISO.slice(0, 10))
        .limit(30),
      supabaseAdmin.from('quickbooks_expenses')
        .select('id, txn_date, total_amt, vendor_name')
        .gte('txn_date', startISO.slice(0, 10)).lte('txn_date', endISO.slice(0, 10))
        .limit(30),
      supabaseAdmin.from('activity_logs')
        .select('id, deal_id, activity_type, description, created_at')
        .in('activity_type', ['stage_change', 'lender_stage_change', 'deal_created'])
        .gte('created_at', startISO).lte('created_at', endISO)
        .order('created_at', { ascending: false }).limit(20),
      supabaseAdmin.from('deal_milestones')
        .select('id, deal_id, title, status, due_date, completed')
        .eq('completed', false)
        .order('due_date', { ascending: true }).limit(50),
    ]);

    // New deal names
    const newDealIds = (stageChangesRes.data || [])
      .filter((sc: any) => sc.activity_type === 'deal_created')
      .map((sc: any) => sc.deal_id);
    let newDealNames: string[] = [];
    if (newDealIds.length > 0) {
      const { data: deals } = await supabaseAdmin.from('deals')
        .select('company').in('id', newDealIds);
      newDealNames = (deals || []).map((d: any) => d.company);
    }

    const emailData = {
      activities: activitiesRes.data || [],
      emails: emailsRes.data || [],
      invoices: invoicesRes.data || [],
      expenses: expensesRes.data || [],
      stageChanges: stageChangesRes.data || [],
      milestones: milestonesRes.data || [],
      newDealNames,
    };

    const email = buildBriefingEmail(emailData);

    await resend.emails.send({
      from: 'naitive <noreply@updates.naitive.co>',
      reply_to: 'support@naitive.co',
      to: [TARGET_EMAIL],
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: {
        'List-Unsubscribe': '<https://naitive.co/unsubscribe>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });

    console.log(`[daily-briefing] Sent to ${TARGET_EMAIL}`);
    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[daily-briefing] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
