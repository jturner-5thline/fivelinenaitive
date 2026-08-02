// agent-learn-from-feedback
// Synthesizes "learned rules" for the Admin Agent (and any future agent) by
// inspecting the workspace's recent feedback signals: approval-queue
// approvals (with edits), rejections (with reasons), and dismissals. Uses
// Claude to propose concise, generalizable operating rules and writes them
// to public.agent_learned_rules with status = 'proposed' for human review.
//
// Trigger: invoked manually from the Admin Agent config ("Train now") and on
// a weekly schedule (see pg_cron). Idempotent — duplicate proposals are
// merged by rule_text.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { anthropicFetch } from "../_shared/anthropicUsage.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = "claude-sonnet-4-5-20250929";

type Signal = {
  decision: string;
  was_edited: boolean | null;
  rejection_reason: string | null;
  action_type: string | null;
  title: string | null;
  rationale: string | null;
  old_values: any;
  new_values: any;
  deal_name: string | null;
  created_at: string;
};

function authClient(req: Request) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } },
  );
}
function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function loadSignals(admin: ReturnType<typeof adminClient>, companyId: string, lookbackDays: number): Promise<Signal[]> {
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  // Join audit -> queue to get action_type/title/rationale/deal_name context.
  const { data: audits } = await admin
    .from("approval_queue_audit")
    .select("action_queue_id, decision, was_edited, rejection_reason, old_values, new_values, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(400);

  const ids = (audits || []).map((a: any) => a.action_queue_id).filter(Boolean);
  let queueRows: Record<string, any> = {};
  if (ids.length) {
    const { data: q } = await admin
      .from("ai_action_queue")
      .select("id, action_type, title, rationale, deal_name, deal_id, payload, user_id")
      .in("id", ids);
    // Scope to this company by joining via user → company_members
    const userIds = Array.from(new Set((q || []).map((r: any) => r.user_id).filter(Boolean)));
    let companyUsers = new Set<string>();
    if (userIds.length) {
      const { data: cm } = await admin
        .from("company_members")
        .select("user_id")
        .eq("company_id", companyId)
        .in("user_id", userIds);
      companyUsers = new Set((cm || []).map((r: any) => r.user_id));
    }
    for (const row of q || []) {
      if (row.user_id && companyUsers.has(row.user_id)) queueRows[row.id] = row;
    }
  }

  return (audits || [])
    .filter((a: any) => queueRows[a.action_queue_id])
    .map((a: any) => {
      const q = queueRows[a.action_queue_id];
      return {
        decision: a.decision,
        was_edited: a.was_edited,
        rejection_reason: a.rejection_reason,
        action_type: q.action_type,
        title: q.title,
        rationale: q.rationale,
        old_values: a.old_values,
        new_values: a.new_values,
        deal_name: q.deal_name,
        created_at: a.created_at,
      } satisfies Signal;
    });
}

async function callClaude(signals: Signal[], existingRules: string[]): Promise<{ rules: Array<{ rule_text: string; confidence: number; evidence_summary: string }> }> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing");

  const compact = signals.slice(0, 200).map((s) => ({
    type: s.action_type,
    title: s.title,
    rationale: s.rationale?.slice(0, 240) ?? null,
    decision: s.decision,
    edited: !!s.was_edited,
    reject: s.rejection_reason?.slice(0, 240) ?? null,
    diff: s.was_edited && s.old_values && s.new_values
      ? { old: JSON.stringify(s.old_values).slice(0, 280), new: JSON.stringify(s.new_values).slice(0, 280) }
      : null,
    deal: s.deal_name,
  }));

  const system = `You analyze how operators interact with an AI Admin Agent's approval queue and synthesize concise, generalizable OPERATING RULES the agent should follow next time.

Look for patterns across many events — not one-offs. A rule is worth proposing when the SAME correction, edit, or rejection reason appears repeatedly, or when a consistent class of items is always edited the same way before approval.

Output rules that are:
- Specific enough to act on (mention the action_type or condition)
- General enough to apply across deals (do not name specific deals unless the pattern is deal-specific)
- Phrased as imperatives ("Never propose X when Y", "Always phrase rationale as ...", "Prefer Unresponsive over On-Hold")
- NOT duplicates of existing rules listed below

Return STRICT JSON: {"rules":[{"rule_text":"...","confidence":0.0-1.0,"evidence_summary":"short why"}]}
If no strong patterns, return {"rules":[]}.`;

  const user = `Existing active rules (do NOT propose duplicates):\n${existingRules.length ? existingRules.map((r,i)=>`${i+1}. ${r}`).join("\n") : "(none yet)"}\n\nRecent feedback signals (newest first):\n${JSON.stringify(compact, null, 2)}`;

  const resp = await anthropicFetch({ feature: "agent-learn-from-feedback" }, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: system + "\n\nRespond with ONLY the JSON object.",
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!resp.ok) throw new Error(`anthropic ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const j = await resp.json();
  const raw: string = Array.isArray(j?.content)
    ? j.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("")
    : "";
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned || "{}");
    return { rules: Array.isArray(parsed?.rules) ? parsed.rules : [] };
  } catch {
    return { rules: [] };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supa = authClient(req);
    const { data: userData, error: userErr } = await supa.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const companyId: string | undefined = body?.company_id;
    const lookbackDays: number = Math.max(1, Math.min(60, Number(body?.lookback_days) || 14));
    const agentKey: string = body?.agent_key || "admin_agent";
    if (!companyId) {
      return new Response(JSON.stringify({ error: "company_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = adminClient();

    // Verify caller is a member of the company.
    const { data: membership } = await admin
      .from("company_members")
      .select("user_id")
      .eq("company_id", companyId)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!membership) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const signals = await loadSignals(admin, companyId, lookbackDays);
    if (signals.length < 3) {
      return new Response(JSON.stringify({ ok: true, proposed: 0, reason: "not enough feedback signals yet" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Existing rules — custom + active learned — to avoid duplicate proposals.
    const { data: settings } = await admin
      .from("admin_agent_settings")
      .select("custom_rules")
      .eq("company_id", companyId)
      .maybeSingle();
    const custom: string[] = Array.isArray((settings as any)?.custom_rules)
      ? ((settings as any).custom_rules as any[])
          .map((r) => (typeof r === "string" ? r : r?.text))
          .filter((t: any) => typeof t === "string" && t.trim().length > 0)
      : [];
    const { data: existingLearned } = await admin
      .from("agent_learned_rules")
      .select("rule_text, status")
      .eq("company_id", companyId)
      .eq("agent_key", agentKey)
      .in("status", ["active", "proposed"]);
    const existingTexts = [...custom, ...((existingLearned || []).map((r: any) => r.rule_text))];

    const { rules } = await callClaude(signals, existingTexts);

    let proposed = 0;
    for (const r of rules) {
      const text = (r?.rule_text || "").trim();
      if (!text) continue;
      // Dedupe by exact text (case-insensitive) for this company+agent.
      const { data: dup } = await admin
        .from("agent_learned_rules")
        .select("id, occurrences")
        .eq("company_id", companyId)
        .eq("agent_key", agentKey)
        .ilike("rule_text", text)
        .maybeSingle();
      if (dup) {
        await admin
          .from("agent_learned_rules")
          .update({
            occurrences: (dup.occurrences || 1) + 1,
            last_synthesized_at: new Date().toISOString(),
            confidence: Math.min(0.99, Number(r?.confidence) || 0.5),
          })
          .eq("id", dup.id);
        continue;
      }
      const { error: insErr } = await admin.from("agent_learned_rules").insert({
        company_id: companyId,
        agent_key: agentKey,
        rule_text: text,
        confidence: Math.min(0.99, Math.max(0, Number(r?.confidence) || 0.5)),
        evidence: { summary: r?.evidence_summary || "", lookback_days: lookbackDays, signal_count: signals.length },
        source: "approval_feedback",
        status: "proposed",
      });
      if (!insErr) proposed += 1;
    }

    return new Response(JSON.stringify({ ok: true, proposed, signals_analyzed: signals.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[agent-learn-from-feedback]", e);
    return new Response(JSON.stringify({ error: e?.message || "internal" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});