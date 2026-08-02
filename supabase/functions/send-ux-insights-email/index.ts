import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { anthropicFetch } from "../_shared/anthropicUsage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ReportKey = "weekly-insights" | "platform-update";

interface ReportConfig {
  id: string;
  report_key: string;
  name: string;
  recipient: string;
  frequency: string;
  enabled: boolean;
}

const j = (status: number, body: any) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cronSecret = Deno.env.get("CRON_SECRET");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

    if (!RESEND_API_KEY) return j(500, { error: "RESEND_API_KEY not configured" });

    // ── Auth: cron (anon/CRON_SECRET) OR authenticated admin ──
    const authHeader = req.headers.get("Authorization") || "";
    const isCron = authHeader === `Bearer ${cronSecret}` || authHeader === `Bearer ${anonKey}`;
    let triggeredBy: "cron" | "manual" = isCron ? "cron" : "manual";
    let triggeredByUser: string | null = null;

    if (!isCron) {
      const sb = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user }, error } = await sb.auth.getUser();
      if (error || !user) return j(401, { error: "Unauthorized" });
      triggeredByUser = user.id;
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const resend = new Resend(RESEND_API_KEY);

    // ── Parse request: { report_key, override_recipient?, dry_run?, period_days? } ──
    let body: any = {};
    try { body = await req.json(); } catch { /* allow empty body */ }
    const reportKey: ReportKey = body.report_key || "weekly-insights";
    const overrideRecipient: string | undefined = body.override_recipient;
    const dryRun: boolean = body.dry_run === true;

    // ── Load config from recurring_reports ──
    const { data: configRow } = await supabase
      .from("recurring_reports")
      .select("id, report_key, name, recipient, frequency, enabled")
      .eq("report_key", reportKey)
      .maybeSingle();

    if (!configRow) return j(404, { error: `Unknown report_key '${reportKey}'` });
    const config = configRow as ReportConfig;

    // Cron-triggered runs respect the enabled flag; manual previews/tests run regardless.
    if (isCron && !config.enabled) {
      return j(200, { skipped: true, reason: "report disabled" });
    }

    const recipient = overrideRecipient || config.recipient;
    const periodDays: number = body.period_days || (reportKey === "weekly-insights" ? 7 : 2);
    const periodMs = periodDays * 24 * 60 * 60 * 1000;
    const periodStart = new Date(Date.now() - periodMs);
    const priorStart = new Date(Date.now() - 2 * periodMs);
    const periodEnd = new Date();
    const sinceISO = periodStart.toISOString();
    const priorISO = priorStart.toISOString();

    // ── Gather data ──
    const [
      aiRes, aiPrevRes, featRes, featPrevRes,
      clientErrRes, uxErrRes, errLogsRes,
      dealsUpdatedRes, dealLendersRes, tasksRes, emailLogRes, activityRes,
    ] = await Promise.all([
      supabase.from("ai_usage_logs").select("feature, status").gte("created_at", sinceISO),
      supabase.from("ai_usage_logs").select("feature, status").gte("created_at", priorISO).lt("created_at", sinceISO),
      supabase.from("ux_feature_usage").select("feature_name, action_type").gte("created_at", sinceISO).limit(5000),
      supabase.from("ux_feature_usage").select("feature_name").gte("created_at", priorISO).lt("created_at", sinceISO).limit(5000),
      supabase.from("client_error_log").select("feature_area, error_type, message, url, created_at").gte("created_at", sinceISO).limit(500),
      supabase.from("ux_client_errors").select("page_path, error_type, error_message, component_name, created_at").gte("created_at", sinceISO).limit(500),
      supabase.from("error_logs").select("error_type, message, source, created_at").gte("created_at", sinceISO).limit(500),
      supabase.from("deals").select("id, company, stage, status, updated_at").gte("updated_at", sinceISO).limit(500),
      supabase.from("deal_lenders").select("stage, tracking_status, updated_at").gte("updated_at", sinceISO).limit(500),
      supabase.from("tasks").select("id, title, status, created_at").gte("created_at", sinceISO).limit(500),
      supabase.from("email_send_log").select("status").gte("created_at", sinceISO).limit(2000),
      supabase.from("activity_logs").select("activity_type").gte("created_at", sinceISO).limit(2000),
    ]);

    // Aggregate AI usage by canonical feature buckets
    const AI_BUCKETS: Record<string, RegExp> = {
      "AI chat queries": /chat|claude|copilot|ask/i,
      "Email drafts generated": /email|polish|draft/i,
      "Agent runs": /agent|workflow|automation/i,
      "Deal Space lookups": /deal[_-]?space|deal[_-]?ai|vdr|rag|spreadsheet/i,
    };
    const bucketize = (rows: any[]) => {
      const out: Record<string, number> = { "AI chat queries": 0, "Email drafts generated": 0, "Agent runs": 0, "Deal Space lookups": 0 };
      for (const r of rows || []) {
        const f = String(r.feature || "");
        for (const [name, re] of Object.entries(AI_BUCKETS)) {
          if (re.test(f)) { out[name]++; break; }
        }
      }
      return out;
    };
    const aiNow = bucketize(aiRes.data || []);
    const aiPrev = bucketize(aiPrevRes.data || []);
    const aiTotalNow = (aiRes.data || []).length;
    const aiTotalPrev = (aiPrevRes.data || []).length;
    const pct = (cur: number, prev: number) => prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100);

    // Feature engagement
    const featCounts: Record<string, number> = {};
    for (const r of featRes.data || []) featCounts[r.feature_name] = (featCounts[r.feature_name] || 0) + 1;
    const prevFeatCounts: Record<string, number> = {};
    for (const r of featPrevRes.data || []) prevFeatCounts[r.feature_name] = (prevFeatCounts[r.feature_name] || 0) + 1;

    // Track every feature we know exists, even if not seen this period
    const KNOWN_FEATURES = [
      "email_widget", "cash_flow", "deal_rundown", "write_up", "deal_space_ai",
      "schedule_meeting", "lender_sync", "vdr", "agreement_drafter",
      "calendar", "tasks", "agents", "claude_chat", "morning_briefing",
    ];
    for (const f of KNOWN_FEATURES) if (!(f in featCounts)) featCounts[f] = 0;

    const featSorted = Object.entries(featCounts).sort((a, b) => b[1] - a[1]);
    const topFeatures = featSorted.slice(0, 5);
    const zeroUsage = featSorted.filter(([, c]) => c === 0).map(([n]) => n);
    const drops = Object.entries(featCounts)
      .map(([name, cur]) => ({ name, cur, prev: prevFeatCounts[name] || 0, delta: cur - (prevFeatCounts[name] || 0) }))
      .filter(d => d.prev > 5 && d.cur < d.prev * 0.6)
      .sort((a, b) => a.delta - b.delta)
      .slice(0, 5);

    // Errors aggregation
    type ErrAgg = { feature_area: string; error_type: string; sample: string; count: number };
    const errMap = new Map<string, ErrAgg>();
    const addErr = (area: string, type: string, msg: string) => {
      const key = `${area}::${type}::${msg.slice(0, 60)}`;
      const cur = errMap.get(key);
      if (cur) cur.count++;
      else errMap.set(key, { feature_area: area, error_type: type, sample: msg, count: 1 });
    };
    for (const e of clientErrRes.data || []) addErr(e.feature_area || "frontend", e.error_type, e.message || "");
    for (const e of uxErrRes.data || []) addErr(e.component_name || e.page_path || "frontend", e.error_type, e.error_message || "");
    for (const e of errLogsRes.data || []) addErr(e.source || "backend", e.error_type, e.message || "");
    const errors = [...errMap.values()].sort((a, b) => b.count - a.count).slice(0, 25);
    const totalErrors = errors.reduce((s, e) => s + e.count, 0);

    // Deal activity
    const dealsUpdated = (dealsUpdatedRes.data || []).length;
    const lendersContacted = (dealLendersRes.data || []).filter((dl: any) =>
      dl.tracking_status && !["pending", "not_started"].includes(String(dl.tracking_status).toLowerCase())
    ).length;
    const tasksCreated = (tasksRes.data || []).length;
    const emailsSent = (emailLogRes.data || []).filter((e: any) => e.status === "sent").length;
    const activitySummary: Record<string, number> = {};
    for (const a of activityRes.data || []) activitySummary[a.activity_type] = (activitySummary[a.activity_type] || 0) + 1;

    // ── AI improvement opportunities (Claude) ──
    let suggestions: { title: string; rationale: string; priority: "high" | "medium" | "low" }[] = [];
    const usageContext = {
      period_days: periodDays,
      ai_usage: { current: aiNow, previous: aiPrev, total_current: aiTotalNow, total_previous: aiTotalPrev },
      feature_usage_top: topFeatures.map(([n, c]) => ({ feature: n, uses: c })),
      feature_usage_zero: zeroUsage,
      feature_engagement_drops: drops,
      errors_top: errors.slice(0, 10),
      deals_activity: { dealsUpdated, lendersContacted, tasksCreated, emailsSent },
    };

    if (ANTHROPIC_API_KEY) {
      try {
        const claudeReq = {
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 1500,
          system:
            "You are a senior product analytics expert for a B2B deal management platform called naitive. " +
            "Given platform usage data, return EXACTLY 3-5 specific, actionable improvement suggestions. " +
            "Each suggestion must reference real numbers from the data (e.g., 'Schedule Meeting was used 0 times'). " +
            "Respond ONLY as a JSON array of objects with keys: title (string), rationale (string, 1-2 sentences), priority ('high'|'medium'|'low'). " +
            "No prose, no markdown — only the JSON array.",
          messages: [{ role: "user", content: `Usage data:\n\n${JSON.stringify(usageContext, null, 2)}` }],
        };
        const resp = await anthropicFetch({ feature: "send-ux-insights-email" }, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(claudeReq),
        });
        if (resp.ok) {
          const out = await resp.json();
          const text = out?.content?.[0]?.text || "";
          const match = text.match(/\[[\s\S]*\]/);
          if (match) suggestions = JSON.parse(match[0]);
        } else {
          console.error("[reports] Claude error", resp.status, await resp.text());
        }
      } catch (e) {
        console.error("[reports] Claude exception", e);
      }
    }
    if (suggestions.length === 0) {
      // Deterministic fallback
      if (zeroUsage.length > 0) {
        suggestions.push({
          title: `${zeroUsage[0].replace(/_/g, " ")} had zero usage this period`,
          rationale: `Consider improving discoverability or removing from the navigation.`,
          priority: "medium",
        });
      }
      if (totalErrors > 5) {
        suggestions.push({
          title: `${totalErrors} errors logged — most common: ${errors[0]?.error_type || "n/a"}`,
          rationale: `Investigate ${errors[0]?.feature_area || "the affected area"}.`,
          priority: "high",
        });
      }
      if (drops.length > 0) {
        suggestions.push({
          title: `${drops[0].name.replace(/_/g, " ")} engagement dropped ${drops[0].cur}/${drops[0].prev}`,
          rationale: `Engagement is down materially vs prior period.`,
          priority: "medium",
        });
      }
      if (suggestions.length === 0) {
        suggestions.push({ title: "Insufficient data for suggestions", rationale: "Continue collecting usage data.", priority: "low" });
      }
    }

    // ── Render emails ──
    const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const dateRange = `${fmtDate(periodStart)} – ${fmtDate(periodEnd)}`;
    const dateOnly = fmtDate(periodEnd);

    let subject = "";
    let html = "";
    let text = "";

    if (reportKey === "weekly-insights") {
      subject = `naitive Weekly Insights — ${dateRange}`;
      html = renderWeeklyInsightsHtml({
        dateRange, aiNow, aiPrev, aiTotalNow, aiTotalPrev, pct,
        topFeatures, zeroUsage, errors, totalErrors,
        dealsUpdated, lendersContacted, tasksCreated, emailsSent,
        suggestions,
      });
      text = `naitive Weekly Insights — ${dateRange}\n\nSee HTML version for full report.`;
    } else {
      subject = `naitive Platform Update — ${dateOnly} — Action Required`;
      const payload = {
        report: "platform-update",
        period: { start: periodStart.toISOString(), end: periodEnd.toISOString(), days: periodDays },
        bugs_detected: errors.map(e => ({ feature_area: e.feature_area, error_type: e.error_type, message: e.sample, count: e.count })),
        feature_engagement_drops: drops,
        zero_usage_features: zeroUsage,
        new_user_feedback: [], // hook for ux_user_feedback comments — left empty if none
        ai_suggestions: suggestions,
        deals_activity: { dealsUpdated, lendersContacted, tasksCreated, emailsSent },
      };
      // Pull recent feedback comments
      const { data: fb } = await supabase
        .from("ux_user_feedback")
        .select("page_path, rating, comment, category, created_at")
        .gte("created_at", sinceISO)
        .not("comment", "is", null)
        .limit(50);
      payload.new_user_feedback = (fb || []).map((f: any) => ({
        page: f.page_path, rating: f.rating, category: f.category, comment: f.comment, at: f.created_at,
      }));

      text = renderPlatformUpdateText(payload);
      html = `<pre style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;background:#0f172a;color:#e2e8f0;padding:20px;border-radius:8px;white-space:pre-wrap;">${escapeHtml(text)}</pre>`;
    }

    // ── Send via Resend ──
    let sendStatus = "sent";
    let sendError: string | null = null;
    let sendId: string | null = null;
    if (!dryRun) {
      const send = await resend.emails.send({
        from: "naitive Reports <reports@notify.naitive.co>",
        to: [recipient],
        subject,
        html,
        text,
      });
      if ((send as any).error) {
        sendStatus = "failed";
        sendError = JSON.stringify((send as any).error);
      } else {
        sendId = (send as any).data?.id || null;
      }
    } else {
      sendStatus = "preview";
    }

    // ── Persist run ──
    await supabase.from("recurring_report_runs").insert({
      report_key: reportKey,
      recipient,
      subject,
      status: sendStatus,
      error_message: sendError,
      rendered_html: html,
      rendered_text: text,
      data_snapshot: usageContext,
      ai_summary: { suggestions },
      triggered_by: triggeredBy,
      triggered_by_user: triggeredByUser,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
    });

    // Update recurring_reports cache
    if (!dryRun) {
      await supabase.from("recurring_reports").update({
        last_run_at: new Date().toISOString(),
        last_subject: subject,
        last_status: sendStatus,
        last_error: sendError,
        last_preview_html: html,
        last_preview_text: text,
      }).eq("report_key", reportKey);
    }

    return j(200, { ok: true, report_key: reportKey, recipient, status: sendStatus, send_id: sendId, dry_run: dryRun });
  } catch (e: any) {
    console.error("[reports] fatal", e);
    return j(500, { error: e?.message || "Unknown error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Renderers
// ─────────────────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function renderWeeklyInsightsHtml(args: any): string {
  const {
    dateRange, aiNow, aiPrev, aiTotalNow, aiTotalPrev, pct,
    topFeatures, zeroUsage, errors, totalErrors,
    dealsUpdated, lendersContacted, tasksCreated, emailsSent,
    suggestions,
  } = args;

  const aiRows = Object.entries(aiNow).map(([k, v]: [string, any]) => {
    const p = pct(v as number, (aiPrev as any)[k] || 0);
    const color = p > 0 ? "#22c55e" : p < 0 ? "#ef4444" : "#94a3b8";
    const arrow = p > 0 ? "▲" : p < 0 ? "▼" : "●";
    return `<tr>
      <td style="padding:8px 12px;color:#cbd5e1;border-bottom:1px solid #1e293b;">${k}</td>
      <td style="padding:8px 12px;color:#f1f5f9;font-weight:600;border-bottom:1px solid #1e293b;text-align:right;">${v}</td>
      <td style="padding:8px 12px;color:${color};font-weight:600;border-bottom:1px solid #1e293b;text-align:right;">${arrow} ${p > 0 ? "+" : ""}${p}%</td>
    </tr>`;
  }).join("");

  const featRows = topFeatures.map(([n, c]: [string, number]) =>
    `<tr><td style="padding:6px 12px;color:#cbd5e1;border-bottom:1px solid #1e293b;">${escapeHtml(n.replace(/_/g, " "))}</td>
         <td style="padding:6px 12px;color:#f1f5f9;font-weight:600;text-align:right;border-bottom:1px solid #1e293b;">${c}</td></tr>`
  ).join("");

  const zeroBadges = zeroUsage.length === 0
    ? `<span style="color:#22c55e;font-size:12px;">No zero-usage features</span>`
    : zeroUsage.slice(0, 8).map((f: string) =>
        `<span style="display:inline-block;background:rgba(239,68,68,0.15);color:#fca5a5;padding:3px 8px;border-radius:4px;font-size:11px;margin:2px;">${escapeHtml(f.replace(/_/g, " "))}</span>`
      ).join("");

  const errorRows = errors.length === 0
    ? `<tr><td colspan="3" style="padding:14px;color:#22c55e;text-align:center;font-size:13px;">No errors detected this period 🎉</td></tr>`
    : errors.slice(0, 8).map((e: any) =>
        `<tr>
          <td style="padding:6px 10px;color:#fca5a5;font-size:12px;border-bottom:1px solid #1e293b;">${escapeHtml(e.feature_area)}</td>
          <td style="padding:6px 10px;color:#cbd5e1;font-size:12px;border-bottom:1px solid #1e293b;">${escapeHtml(e.error_type)}: ${escapeHtml(e.sample.slice(0, 80))}</td>
          <td style="padding:6px 10px;color:#f1f5f9;font-weight:600;text-align:right;border-bottom:1px solid #1e293b;">${e.count}</td>
        </tr>`
      ).join("");

  const sugRows = suggestions.map((s: any) => {
    const color = s.priority === "high" ? "#ef4444" : s.priority === "medium" ? "#f59e0b" : "#64748b";
    const bg = s.priority === "high" ? "rgba(239,68,68,0.12)" : s.priority === "medium" ? "rgba(245,158,11,0.12)" : "rgba(100,116,139,0.12)";
    return `<tr>
      <td style="padding:0 0 12px 0;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1e293b;border:1px solid #334155;border-left:3px solid ${color};border-radius:6px;">
          <tr><td style="padding:14px 18px;">
            <span style="display:inline-block;background:${bg};color:${color};padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">${s.priority}</span>
            <p style="margin:8px 0 4px;color:#f1f5f9;font-size:14px;font-weight:600;">${escapeHtml(s.title)}</p>
            <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;">${escapeHtml(s.rationale)}</p>
          </td></tr>
        </table>
      </td></tr>`;
  }).join("");

  const aiDelta = pct(aiTotalNow, aiTotalPrev);
  const aiDeltaColor = aiDelta > 0 ? "#22c55e" : aiDelta < 0 ? "#ef4444" : "#94a3b8";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>naitive Weekly Insights</title></head>
<body style="margin:0;padding:0;background:#0a0f1c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e2e8f0;">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0a0f1c;padding:32px 16px;">
  <tr><td align="center">
    <table cellpadding="0" cellspacing="0" border="0" width="640" style="max-width:640px;background:#0f172a;border:1px solid #1e293b;border-radius:12px;overflow:hidden;">
      <tr><td style="padding:28px 32px 20px;border-bottom:1px solid #1e293b;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);">
        <p style="margin:0;color:#60a5fa;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">5th Line · naitive</p>
        <h1 style="margin:6px 0 4px;color:#f1f5f9;font-size:22px;font-weight:700;">Weekly Insights</h1>
        <p style="margin:0;color:#94a3b8;font-size:13px;">${dateRange}</p>
      </td></tr>

      <tr><td style="padding:24px 32px;">
        <p style="margin:0 0 6px;color:#60a5fa;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Executive Summary</p>
        <p style="margin:0 0 20px;color:#cbd5e1;font-size:14px;line-height:1.6;">
          AI usage was <strong style="color:${aiDeltaColor};">${aiDelta > 0 ? "+" : ""}${aiDelta}%</strong> vs. the prior period
          (${aiTotalNow} total interactions). The team updated <strong>${dealsUpdated}</strong> deals,
          contacted <strong>${lendersContacted}</strong> lenders, created <strong>${tasksCreated}</strong> tasks,
          and sent <strong>${emailsSent}</strong> emails. ${totalErrors === 0 ? "No errors were logged." : `<strong style="color:#fca5a5;">${totalErrors}</strong> errors were detected.`}
        </p>
      </td></tr>

      <tr><td style="padding:0 32px 8px;">
        <p style="margin:0 0 10px;color:#60a5fa;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">AI Usage</p>
        <table width="100%" style="border-collapse:collapse;background:#0f172a;border:1px solid #1e293b;border-radius:6px;overflow:hidden;">
          <thead><tr><th style="text-align:left;padding:8px 12px;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;background:#1e293b;">Metric</th>
          <th style="text-align:right;padding:8px 12px;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;background:#1e293b;">Count</th>
          <th style="text-align:right;padding:8px 12px;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;background:#1e293b;">vs Prior</th></tr></thead>
          <tbody>${aiRows}</tbody>
        </table>
      </td></tr>

      <tr><td style="padding:24px 32px 8px;">
        <p style="margin:0 0 10px;color:#60a5fa;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Feature Engagement — Top 5</p>
        <table width="100%" style="border-collapse:collapse;background:#0f172a;border:1px solid #1e293b;border-radius:6px;overflow:hidden;">
          <tbody>${featRows || `<tr><td style="padding:14px;color:#94a3b8;text-align:center;font-size:13px;">No feature usage tracked this period</td></tr>`}</tbody>
        </table>
        <p style="margin:14px 0 6px;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Zero-usage features</p>
        <div>${zeroBadges}</div>
      </td></tr>

      <tr><td style="padding:24px 32px 8px;">
        <p style="margin:0 0 10px;color:#60a5fa;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Errors & Bugs Detected</p>
        <table width="100%" style="border-collapse:collapse;background:#0f172a;border:1px solid #1e293b;border-radius:6px;overflow:hidden;">
          <tbody>${errorRows}</tbody>
        </table>
      </td></tr>

      <tr><td style="padding:24px 32px 8px;">
        <p style="margin:0 0 10px;color:#60a5fa;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Deal Activity</p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="width:25%;padding:14px;background:#1e293b;border-radius:6px;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:1px;">Deals updated</p>
              <p style="margin:4px 0 0;color:#f1f5f9;font-size:22px;font-weight:700;">${dealsUpdated}</p>
            </td>
            <td style="width:6px;"></td>
            <td style="width:25%;padding:14px;background:#1e293b;border-radius:6px;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:1px;">Lenders contacted</p>
              <p style="margin:4px 0 0;color:#f1f5f9;font-size:22px;font-weight:700;">${lendersContacted}</p>
            </td>
            <td style="width:6px;"></td>
            <td style="width:25%;padding:14px;background:#1e293b;border-radius:6px;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:1px;">Tasks created</p>
              <p style="margin:4px 0 0;color:#f1f5f9;font-size:22px;font-weight:700;">${tasksCreated}</p>
            </td>
            <td style="width:6px;"></td>
            <td style="width:25%;padding:14px;background:#1e293b;border-radius:6px;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:1px;">Emails sent</p>
              <p style="margin:4px 0 0;color:#f1f5f9;font-size:22px;font-weight:700;">${emailsSent}</p>
            </td>
          </tr>
        </table>
      </td></tr>

      <tr><td style="padding:24px 32px 28px;">
        <p style="margin:0 0 12px;color:#60a5fa;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Improvement Opportunities</p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0"><tbody>${sugRows}</tbody></table>
      </td></tr>

      <tr><td style="padding:18px 32px;background:#0a0f1c;border-top:1px solid #1e293b;text-align:center;">
        <p style="margin:0;color:#64748b;font-size:11px;">Generated automatically by naitive · 5th Line</p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

function renderPlatformUpdateText(p: any): string {
  const lines: string[] = [];
  lines.push(`naitive Platform Update — ${new Date(p.period.end).toUTCString()}`);
  lines.push(`Period: ${p.period.start} → ${p.period.end} (${p.period.days}d)`);
  lines.push("");
  lines.push("=== BUGS DETECTED ===");
  if (p.bugs_detected.length === 0) lines.push("(none)");
  for (const b of p.bugs_detected) {
    lines.push(`• [${b.feature_area}] ${b.error_type} ×${b.count}`);
    lines.push(`    ${b.message}`);
  }
  lines.push("");
  lines.push("=== FEATURE ENGAGEMENT DROPS ===");
  if (p.feature_engagement_drops.length === 0) lines.push("(none)");
  for (const d of p.feature_engagement_drops) {
    lines.push(`• ${d.name}: ${d.cur} (was ${d.prev}, Δ ${d.delta})`);
  }
  lines.push("");
  lines.push("=== ZERO-USAGE FEATURES ===");
  if (p.zero_usage_features.length === 0) lines.push("(none)");
  for (const f of p.zero_usage_features) lines.push(`• ${f}`);
  lines.push("");
  lines.push("=== NEW USER FEEDBACK ===");
  if (p.new_user_feedback.length === 0) lines.push("(none)");
  for (const f of p.new_user_feedback) {
    lines.push(`• [${f.page || "?"}] (${f.rating ?? "-"}/5) ${f.category || ""}`);
    lines.push(`    "${f.comment}"`);
  }
  lines.push("");
  lines.push("=== AI-SUGGESTED ACTIONS ===");
  for (const s of p.ai_suggestions) {
    lines.push(`• [${s.priority.toUpperCase()}] ${s.title}`);
    lines.push(`    → ${s.rationale}`);
  }
  lines.push("");
  lines.push("=== DEALS ACTIVITY ===");
  lines.push(`Deals updated: ${p.deals_activity.dealsUpdated}`);
  lines.push(`Lenders contacted: ${p.deals_activity.lendersContacted}`);
  lines.push(`Tasks created: ${p.deals_activity.tasksCreated}`);
  lines.push(`Emails sent: ${p.deals_activity.emailsSent}`);
  lines.push("");
  lines.push("--- Use this list to build new subtasks under '5th Line Technology Roadmap' in Asana ---");
  return lines.join("\n");
}
