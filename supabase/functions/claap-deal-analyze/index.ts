// Analyze a Claap recording in the context of a single deal — DRAFT-FOR-REVIEW mode.
// Pipeline (action='draft', default):
//   1. Resolve transcript (cached on claap_meetings, fall back to live Claap API).
//   2. Extract via Anthropic Claude tool-use.
//   3. Return markdown + structured insights + suggested tasks. NOTHING IS WRITTEN.
//
// Pipeline (action='post'):
//   - Insert ONE activity_logs row with the user-confirmed summary markdown.
//   - Insert tasks for each confirmed action item (idempotent on recording_id).
//
// Per project memory: AI writes require explicit user approval (human-in-the-loop).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { anthropicFetch } from "../_shared/anthropicUsage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ActionItem {
  owner: string;
  title: string;
  due_hint?: string;
  priority?: "low" | "medium" | "high";
}

interface ExtractedInsights {
  attendees: Array<{ name: string; role?: string }>;
  key_discussion_points: string[];
  deal_terms_discussed: Array<{ term: string; value: string }>;
  decisions: string[];
  open_questions: string[];
  action_items: ActionItem[];
  next_steps: string[];
}

interface DraftBody {
  action?: "draft";
  deal_id: string;
  recording_id: string;
  recording_title?: string | null;
  recording_url?: string | null;
  recorded_at?: string | null;
}

interface PostBody {
  action: "post";
  deal_id: string;
  recording_id: string;
  recording_title?: string | null;
  recording_url?: string | null;
  recorded_at?: string | null;
  summary_markdown: string;
  insights: ExtractedInsights;
  // Subset of action items the user confirmed for task creation.
  confirmed_action_items?: ActionItem[];
}

function fmtDate(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function buildMarkdown(title: string, dateLabel: string, url: string | null, x: ExtractedInsights): string {
  const lines: string[] = [];
  lines.push(`**Meeting Summary — ${dateLabel} — ${title}**`);
  if (url) lines.push(`[Open in Claap](${url})`);
  lines.push("");

  lines.push(`### Attendees`);
  if (x.attendees.length === 0) lines.push(`_Not captured in transcript._`);
  else for (const a of x.attendees) lines.push(`- ${a.name}${a.role ? ` — ${a.role}` : ""}`);
  lines.push("");

  lines.push(`### Key Discussion Points`);
  if (x.key_discussion_points.length === 0) lines.push(`_None extracted._`);
  else for (const p of x.key_discussion_points) lines.push(`- ${p}`);
  lines.push("");

  lines.push(`### Deal Terms Discussed`);
  if (x.deal_terms_discussed.length === 0) lines.push(`_No specific terms discussed._`);
  else {
    lines.push(`| Term | Value |`);
    lines.push(`|------|-------|`);
    for (const t of x.deal_terms_discussed) lines.push(`| ${t.term} | ${t.value} |`);
  }
  lines.push("");

  if (x.decisions.length > 0) {
    lines.push(`### Decisions Made`);
    for (const d of x.decisions) lines.push(`- ${d}`);
    lines.push("");
  }

  if (x.open_questions.length > 0) {
    lines.push(`### Open Questions`);
    for (const q of x.open_questions) lines.push(`- ${q}`);
    lines.push("");
  }

  lines.push(`### Action Items`);
  if (x.action_items.length === 0) lines.push(`_None identified._`);
  else for (const a of x.action_items) {
    const due = a.due_hint ? ` _(${a.due_hint})_` : "";
    const pri = a.priority && a.priority !== "medium" ? ` [${a.priority}]` : "";
    lines.push(`- **${a.owner}**: ${a.title}${due}${pri}`);
  }
  lines.push("");

  lines.push(`### Next Steps`);
  if (x.next_steps.length === 0) lines.push(`_None._`);
  else for (const s of x.next_steps) lines.push(`- ${s}`);

  return lines.join("\n");
}

async function fetchTranscript(supabaseAdmin: any, claapAuth: string, recordingId: string): Promise<string | null> {
  const { data: meetingRow } = await supabaseAdmin
    .from("claap_meetings")
    .select("transcript")
    .eq("claap_id", recordingId)
    .maybeSingle();
  if (meetingRow?.transcript) return meetingRow.transcript as string;

  if (!claapAuth) return null;
  try {
    const resp = await fetch(`https://api.claap.io/v1/recordings/${recordingId}/transcript?format=text`, {
      headers: { Authorization: claapAuth, "Content-Type": "application/json" },
    });
    if (!resp.ok) {
      console.warn("Claap transcript fetch failed", resp.status, await resp.text());
      return null;
    }
    const data = await resp.json();
    return data?.result?.transcript ?? null;
  } catch (e) {
    console.warn("Claap transcript fetch error", e);
    return null;
  }
}

function inferDueDate(hint?: string | null): string | null {
  const h = (hint || "").toLowerCase();
  if (!h) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const addDays = (n: number) => {
    const d = new Date(today); d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  if (/\btomorrow\b|\beod tomorrow\b/.test(h)) return addDays(1);
  if (/\btoday\b|\beod\b/.test(h)) return addDays(0);
  if (/\bnext week\b/.test(h)) return addDays(7);
  if (/\bthis week\b|\bby friday\b|\bend of week\b/.test(h)) {
    const dow = today.getDay();
    const toFri = (5 - dow + 7) % 7 || 5;
    return addDays(toFri);
  }
  if (/\bnext month\b/.test(h)) return addDays(30);
  return null;
}

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const claapApiKey = Deno.env.get("CLAAP_API_KEY") || "";
    const claapAuth = claapApiKey.startsWith("Bearer ") ? claapApiKey : (claapApiKey ? `Bearer ${claapApiKey}` : "");

    const supabaseUser = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const raw = await req.json();
    const action = (raw?.action as string) || "draft";

    if (!raw?.deal_id || !raw?.recording_id) {
      return new Response(JSON.stringify({ error: "deal_id and recording_id are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============================================================
    // ACTION: post (commit user-reviewed draft)
    // ============================================================
    if (action === "post") {
      const body = raw as PostBody;
      if (!body.summary_markdown || !body.insights) {
        return new Response(JSON.stringify({ error: "summary_markdown and insights are required to post" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: linkRow } = await supabaseUser
        .from("deal_claap_recordings")
        .select("recording_title, recording_url, linked_at")
        .eq("deal_id", body.deal_id)
        .eq("recording_id", body.recording_id)
        .maybeSingle();

      const title = body.recording_title || linkRow?.recording_title || "Claap Recording";
      const url = body.recording_url || linkRow?.recording_url || null;

      // Idempotency: if a summary already exists for this recording, refuse.
      const { data: existing } = await supabaseUser
        .from("activity_logs")
        .select("id")
        .eq("deal_id", body.deal_id)
        .eq("activity_type", "meeting_summary")
        .contains("metadata", { recording_id: body.recording_id })
        .limit(1);
      if (existing && existing.length > 0) {
        return new Response(JSON.stringify({ ok: false, error: "A summary for this recording is already posted." }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: profile } = await supabaseUser.from("profiles").select("display_name, email").eq("user_id", user.id).maybeSingle();
      const userDisplayName = profile?.display_name || profile?.email || "naitive AI";

      const { data: activityRow, error: actErr } = await supabaseUser
        .from("activity_logs")
        .insert({
          deal_id: body.deal_id,
          user_id: user.id,
          user_display_name: `${userDisplayName} (via naitive AI)`,
          activity_type: "meeting_summary",
          description: body.summary_markdown,
          metadata: {
            source: "claap_deal_analyze",
            recording_id: body.recording_id,
            recording_title: title,
            recording_url: url,
            recorded_at: body.recorded_at || linkRow?.linked_at || null,
            insights: body.insights,
            posted_by_user: true,
          },
        })
        .select("id, created_at")
        .single();

      if (actErr) {
        return new Response(JSON.stringify({ error: actErr.message || "Failed to save summary" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Confirmed tasks (defaults to none if user didn't pick any).
      const confirmed = body.confirmed_action_items || [];
      let created_tasks: Array<{ id: string; title: string; due_date: string | null; priority: string; owner_label: string }> = [];

      if (confirmed.length > 0) {
        const recordingMarker = `[claap:${body.recording_id}]`;
        const { data: existingTasks } = await supabaseUser
          .from("tasks")
          .select("id, title")
          .eq("deal_id", body.deal_id)
          .ilike("description", `%${recordingMarker}%`);
        const existingTitles = new Set((existingTasks || []).map((t: any) => (t.title || "").trim().toLowerCase()));

        const rowsToInsert = confirmed
          .filter((a) => a?.title && !existingTitles.has(truncate(a.title, 200).trim().toLowerCase()))
          .map((a) => ({
            deal_id: body.deal_id,
            assigned_to: user.id,
            assigned_by: user.id,
            title: truncate(a.title, 200),
            description: `Confirmed by user from Claap recording: ${title}${a.owner ? `\nOriginal owner mentioned: ${a.owner}` : ""}${a.due_hint ? `\nDue hint: ${a.due_hint}` : ""}\n\n${recordingMarker}`,
            priority: a.priority || "medium",
            status: "not_started",
            task_type: "task",
            due_date: inferDueDate(a.due_hint),
          }));

        if (rowsToInsert.length > 0) {
          const { data: inserted, error: taskErr } = await supabaseUser
            .from("tasks")
            .insert(rowsToInsert)
            .select("id, title, due_date, priority");
          if (taskErr) {
            console.warn("Confirmed task insert failed:", taskErr);
          } else {
            created_tasks = (inserted || []).map((t: any, i: number) => ({
              id: t.id,
              title: t.title,
              due_date: t.due_date,
              priority: t.priority,
              owner_label: confirmed[i]?.owner || "Team",
            }));
          }
        }
      }

      return new Response(JSON.stringify({
        ok: true,
        action: "post",
        activity_log_id: activityRow.id,
        created_tasks,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ============================================================
    // ACTION: draft (default — generate, return, write nothing)
    // ============================================================
    const body = raw as DraftBody;

    // Surface if a summary already exists so the UI can show "already posted".
    const { data: existing } = await supabaseUser
      .from("activity_logs")
      .select("id, created_at")
      .eq("deal_id", body.deal_id)
      .eq("activity_type", "meeting_summary")
      .contains("metadata", { recording_id: body.recording_id })
      .limit(1)
      .maybeSingle();

    const { data: linkRow } = await supabaseUser
      .from("deal_claap_recordings")
      .select("recording_title, recording_url, linked_at")
      .eq("deal_id", body.deal_id)
      .eq("recording_id", body.recording_id)
      .maybeSingle();

    const title = body.recording_title || linkRow?.recording_title || "Claap Recording";
    const url = body.recording_url || linkRow?.recording_url || null;
    const dateLabel = fmtDate(body.recorded_at || linkRow?.linked_at);

    const transcriptRaw = await fetchTranscript(supabaseAdmin, claapAuth, body.recording_id);
    if (!transcriptRaw || transcriptRaw.trim().length < 40) {
      return new Response(JSON.stringify({ error: "Transcript not available for this recording" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const transcript = transcriptRaw.slice(0, 20000);

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "Anthropic API key not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const extractToolSchema = {
      name: "extract_deal_meeting",
      description: "Structured extraction from a deal meeting transcript",
      input_schema: {
        type: "object",
        properties: {
          attendees: {
            type: "array",
            items: { type: "object", properties: { name: { type: "string" }, role: { type: "string" } }, required: ["name"] },
          },
          key_discussion_points: { type: "array", items: { type: "string" } },
          deal_terms_discussed: {
            type: "array",
            items: { type: "object", properties: { term: { type: "string" }, value: { type: "string" } }, required: ["term", "value"] },
            description: "Concrete terms mentioned: rates (e.g. SOFR+450), advance rates, deal size, tenor, fees, covenants, close timeline.",
          },
          decisions: { type: "array", items: { type: "string" } },
          open_questions: { type: "array", items: { type: "string" } },
          action_items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                owner: { type: "string", description: "Name of the person responsible (or 'Team' if unclear)." },
                title: { type: "string", description: "Imperative task title." },
                due_hint: { type: "string", description: "Natural-language due hint if mentioned. Empty if none." },
                priority: { type: "string", enum: ["low", "medium", "high"] },
              },
              required: ["owner", "title"],
            },
          },
          next_steps: { type: "array", items: { type: "string" } },
        },
        required: ["attendees", "key_discussion_points", "deal_terms_discussed", "decisions", "open_questions", "action_items", "next_steps"],
      },
    };

    const aiResp = await anthropicFetch({ feature: "claap-deal-analyze" }, {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        temperature: 0.2,
        system: `You are a senior associate at a private credit / debt advisory firm summarizing a recorded call for the deal team. Be concise, factual, and use the lender/sponsor's exact terms (rates, advance rates, sizes, dates) when present. Never invent numbers.`,
        tools: [extractToolSchema],
        tool_choice: { type: "tool", name: "extract_deal_meeting" },
        messages: [
          {
            role: "user",
            content: `Recording title: "${title}"\nDeal context: an active credit/lender deal.\n\nTranscript:\n---\n${transcript}\n---\n\nExtract the structured fields. For deal_terms_discussed capture every quoted rate, advance rate, deal size, tenor, fee, covenant, or timeline. For action_items, infer the owner from the speaker; if unclear use "Team".`,
          },
        ],
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("Anthropic error", aiResp.status, errText);
      const status = aiResp.status === 429 ? 429 : aiResp.status === 402 ? 402 : 502;
      const msg = aiResp.status === 429 ? "Claude rate limit exceeded, please try again later."
        : aiResp.status === 402 ? "Anthropic credits exhausted."
        : "AI extraction failed.";
      return new Response(JSON.stringify({ error: msg }), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const toolUseBlock = (aiJson?.content || []).find((c: any) => c?.type === "tool_use" && c?.name === "extract_deal_meeting");
    if (!toolUseBlock?.input || typeof toolUseBlock.input !== "object") {
      console.error("No tool_use block returned", JSON.stringify(aiJson).slice(0, 500));
      return new Response(JSON.stringify({ error: "AI did not return structured data" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const insights: ExtractedInsights = toolUseBlock.input as ExtractedInsights;
    insights.attendees ??= [];
    insights.key_discussion_points ??= [];
    insights.deal_terms_discussed ??= [];
    insights.decisions ??= [];
    insights.open_questions ??= [];
    insights.action_items ??= [];
    insights.next_steps ??= [];

    const markdown = buildMarkdown(title, dateLabel, url, insights);

    // Suggested tasks — NOT inserted. UI presents these for user review.
    const suggested_tasks = insights.action_items.map((a, i) => ({
      key: `${body.recording_id}:${i}`,
      title: truncate(a.title, 200),
      owner_label: a.owner,
      due_hint: a.due_hint || null,
      priority: a.priority || "medium",
      inferred_due_date: inferDueDate(a.due_hint),
    }));

    return new Response(JSON.stringify({
      ok: true,
      action: "draft",
      deal_id: body.deal_id,
      recording_id: body.recording_id,
      already_posted: !!existing,
      already_posted_activity_id: existing?.id || null,
      summary_markdown: markdown,
      insights,
      suggested_tasks,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("claap-deal-analyze error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
