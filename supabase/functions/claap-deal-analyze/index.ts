// Analyze a Claap recording in the context of a single deal.
// Pipeline:
//   1. Resolve transcript: prefer the cached one on claap_meetings, fall back
//      to the live Claap API (action=transcript on claap-recordings).
//   2. Run the transcript through Lovable AI with a tool-call schema that
//      extracts: attendees, key_discussion_points, deal_terms, action_items,
//      decisions, open_questions, next_steps.
//   3. Render a markdown summary and insert ONE row into activity_logs
//      (activity_type='meeting_summary') tagged
//      "Meeting Summary — <date> — <recording title>".
//   4. Return suggested_tasks (from action_items) so the UI can show
//      one-click confirm cards. We do NOT auto-create tasks — per platform
//      rule, AI writes require human approval.
//
// Auth: requires the caller's JWT. We use a user-scoped supabase client so
// RLS on activity_logs/deals is enforced (only deal members can attach).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AnalyzeBody {
  deal_id: string;
  recording_id: string;
  recording_title?: string | null;
  recording_url?: string | null;
  recorded_at?: string | null; // ISO
  // When invoked from the auto-trigger right after linking, set true so we
  // skip if a summary already exists for (deal, recording).
  skip_if_exists?: boolean;
}

interface ExtractedInsights {
  attendees: Array<{ name: string; role?: string }>;
  key_discussion_points: string[];
  deal_terms_discussed: Array<{ term: string; value: string }>;
  decisions: string[];
  open_questions: string[];
  action_items: Array<{
    owner: string;
    title: string;
    due_hint?: string;
    priority?: "low" | "medium" | "high";
  }>;
  next_steps: string[];
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
  // 1. Cached on claap_meetings (claap_id matches the Claap recording id).
  const { data: meetingRow } = await supabaseAdmin
    .from("claap_meetings")
    .select("transcript")
    .eq("claap_id", recordingId)
    .maybeSingle();
  if (meetingRow?.transcript) return meetingRow.transcript as string;

  // 2. Live Claap API.
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

    const body = (await req.json()) as AnalyzeBody;
    if (!body?.deal_id || !body?.recording_id) {
      return new Response(JSON.stringify({ error: "deal_id and recording_id are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency check for the auto-trigger path: don't double-summarize.
    if (body.skip_if_exists) {
      const { data: existing } = await supabaseUser
        .from("activity_logs")
        .select("id")
        .eq("deal_id", body.deal_id)
        .eq("activity_type", "meeting_summary")
        .contains("metadata", { recording_id: body.recording_id })
        .limit(1);
      if (existing && existing.length > 0) {
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: "summary_exists" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Pull the linked-recording row for canonical title/url if missing in body.
    const { data: linkRow } = await supabaseUser
      .from("deal_claap_recordings")
      .select("recording_title, recording_url, linked_at")
      .eq("deal_id", body.deal_id)
      .eq("recording_id", body.recording_id)
      .maybeSingle();

    const title = body.recording_title || linkRow?.recording_title || "Claap Recording";
    const url = body.recording_url || linkRow?.recording_url || null;
    const dateLabel = fmtDate(body.recorded_at || linkRow?.linked_at);

    // 1. Resolve transcript.
    const transcriptRaw = await fetchTranscript(supabaseAdmin, claapAuth, body.recording_id);
    if (!transcriptRaw || transcriptRaw.trim().length < 40) {
      return new Response(JSON.stringify({ error: "Transcript not available for this recording" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const transcript = transcriptRaw.slice(0, 20000); // token guard

    // 2. Extract via Lovable AI tool-calling.
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI gateway not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a senior associate at a private credit / debt advisory firm summarizing a recorded call for the deal team. Be concise, factual, and use the lender/sponsor's exact terms (rates, advance rates, sizes, dates) when present. Never invent numbers.`,
          },
          {
            role: "user",
            content: `Recording title: "${title}"\nDeal context: an active credit/lender deal.\n\nTranscript:\n---\n${transcript}\n---\n\nExtract the structured fields using the provided tool. For deal_terms_discussed, capture every quoted rate, advance rate, deal size, tenor, fee, covenant, or timeline mentioned. For action_items, infer the owner from the speaker; if unclear, use "Team".`,
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_deal_meeting",
            description: "Structured extraction from a deal meeting transcript",
            parameters: {
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
                      title: { type: "string", description: "Imperative task title, e.g. 'Send updated financial model to TriplePoint'." },
                      due_hint: { type: "string", description: "Natural-language due hint if mentioned, e.g. 'by Friday', 'next week', 'EOD tomorrow'. Empty if none." },
                      priority: { type: "string", enum: ["low", "medium", "high"] },
                    },
                    required: ["owner", "title"],
                  },
                },
                next_steps: { type: "array", items: { type: "string" } },
              },
              required: ["attendees", "key_discussion_points", "deal_terms_discussed", "decisions", "open_questions", "action_items", "next_steps"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_deal_meeting" } },
        temperature: 0.2,
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI gateway error", aiResp.status, errText);
      const status = aiResp.status === 429 ? 429 : aiResp.status === 402 ? 402 : 502;
      const msg = aiResp.status === 429 ? "Rate limit exceeded, please try again later."
        : aiResp.status === 402 ? "AI credits exhausted. Please add credits."
        : "AI extraction failed.";
      return new Response(JSON.stringify({ error: msg }), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("No tool call returned", JSON.stringify(aiJson).slice(0, 500));
      return new Response(JSON.stringify({ error: "AI did not return structured data" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let insights: ExtractedInsights;
    try {
      insights = JSON.parse(toolCall.function.arguments);
    } catch {
      return new Response(JSON.stringify({ error: "AI returned malformed JSON" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize defensively.
    insights.attendees ??= [];
    insights.key_discussion_points ??= [];
    insights.deal_terms_discussed ??= [];
    insights.decisions ??= [];
    insights.open_questions ??= [];
    insights.action_items ??= [];
    insights.next_steps ??= [];

    // 3. Build markdown + insert activity log.
    const markdown = buildMarkdown(title, dateLabel, url, insights);

    // Resolve display name for the activity row.
    const { data: profile } = await supabaseUser.from("profiles").select("display_name, email").eq("user_id", user.id).maybeSingle();
    const userDisplayName = profile?.display_name || profile?.email || "naitive AI";

    const { data: activityRow, error: actErr } = await supabaseUser
      .from("activity_logs")
      .insert({
        deal_id: body.deal_id,
        user_id: user.id,
        user_display_name: `${userDisplayName} (via naitive AI)`,
        activity_type: "meeting_summary",
        description: markdown,
        metadata: {
          source: "claap_deal_analyze",
          recording_id: body.recording_id,
          recording_title: title,
          recording_url: url,
          recorded_at: body.recorded_at || linkRow?.linked_at || null,
          insights,
        },
      })
      .select("id, created_at")
      .single();

    if (actErr) {
      console.error("Failed to insert activity_logs row", actErr);
      return new Response(JSON.stringify({ error: actErr.message || "Failed to save summary" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Return suggested tasks (NOT auto-created — UI confirms each one).
    const suggested_tasks = insights.action_items.map((a, i) => ({
      key: `${activityRow.id}:${i}`,
      title: a.title.length > 200 ? a.title.slice(0, 197) + "…" : a.title,
      owner_label: a.owner,
      due_hint: a.due_hint || null,
      priority: a.priority || "medium",
    }));

    return new Response(JSON.stringify({
      ok: true,
      deal_id: body.deal_id,
      recording_id: body.recording_id,
      activity_log_id: activityRow.id,
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