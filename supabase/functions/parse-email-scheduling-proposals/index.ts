import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

interface ProposedSlot {
  /** ISO 8601 start in UTC. */
  start_iso: string;
  /** ISO 8601 end in UTC. */
  end_iso: string;
  /** IANA timezone the slot was originally expressed in (best guess). */
  source_timezone: string;
  /** Human label as it appeared in the email, e.g. "Wed Jun 24, 11am–12pm PT". */
  label: string;
  /** Optional verbatim quote from the email. */
  quote?: string;
}

interface ReplySuggestion {
  label: string;
  body: string;
  slot_index?: number;
}

interface ParseResult {
  detected: boolean;
  sender_timezone: string | null;
  user_timezone: string;
  slots: ProposedSlot[];
  reply_suggestions: ReplySuggestion[];
  notes?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const threadText: string = String(body?.thread_text || "").slice(0, 24000);
    const subject: string = String(body?.subject || "");
    const userTimezone: string = String(body?.user_timezone || "America/New_York");
    const nowIso: string = String(body?.now_iso || new Date().toISOString());

    if (!threadText.trim()) {
      const empty: ParseResult = {
        detected: false,
        sender_timezone: null,
        user_timezone: userTimezone,
        slots: [],
        reply_suggestions: [],
        notes: "No thread text",
      };
      return new Response(JSON.stringify(empty), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const system = `You extract scheduling proposals from email threads.
Return a JSON object with this shape:
{
  "detected": boolean,
  "sender_timezone": IANA tz string or null (best guess from the email body, signature, or explicit abbreviation like PT/ET/CT/MT/GMT/BST),
  "slots": [
    {
      "start_iso": ISO 8601 in UTC,
      "end_iso": ISO 8601 in UTC,
      "source_timezone": IANA tz the slot was originally in,
      "label": human label as written (e.g. "Wed Jun 24, 11am–12pm PT"),
      "quote": optional verbatim phrase from the email
    }
  ],
  "reply_suggestions": [
    { "label": short button label, "body": full reply body in 1-3 short paragraphs, "slot_index": index into slots if it commits to one slot }
  ],
  "notes": optional one-sentence explanation if no slots were found.
}

Rules:
- Read the WHOLE thread, not just the latest message. The most recent scheduling proposal wins if there are several.
- If only a date and a time-range are given without a year, assume the next future occurrence relative to "now" (${nowIso}).
- If a standalone time is given ("11am"), produce a 60-minute slot ending at the next hour boundary.
- If a range is given ("11am-1pm PT"), produce a single slot covering the whole range; downstream code will split it into 60-minute candidate windows.
- If multiple options appear in one sentence or bullet ("Thursday 11am or 1pm-3pm"), emit a slot per option.
- NATURAL-LANGUAGE TIME WINDOWS: Phrases like "Wednesday afternoon", "Tuesday morning", "Thursday evening", "later this week", "early next week", or "sometime Friday" ARE valid scheduling proposals. Never set detected=false just because the sender gave a soft window instead of an exact time. Treat the window as a search range and emit 3 concrete 30-minute candidate slots spaced ~30–60 minutes apart inside it. Use these defaults (in the sender_timezone, or user_timezone if no tz is given):
    • morning   = 09:00–12:00
    • afternoon = 12:00–18:00
    • evening   = 18:00–21:00
    • "end of day" / "late afternoon" = 15:00–18:00
    • "early"  before a day part shifts to the first 90 min of that part
    • bare day with no part ("Wednesday") = 10:00, 13:30, 15:30 candidates
  For each candidate emit its own ProposedSlot (30 minutes long) with label like "Wed May 20, 4:30 PM EDT" and a quote of the original phrase. This lets downstream calendar logic verify each slot individually and surface only the ones that are actually free.
- Always convert to UTC for start_iso/end_iso. Preserve the original timezone in source_timezone (default to America/Los_Angeles for PT/PDT/PST, America/New_York for ET/EDT/EST, America/Chicago for CT, America/Denver for MT, Europe/London for GMT/BST).
- Reply suggestions should sound like the user (5th Line capital markets, warm + concise). Do NOT include greetings like "Hi <name>" or sign-offs — those are added by the user. Just the body.
- Always include at least these three suggestion shapes when slots were detected:
  1) Accept the single best slot ("I'm available on <day> at <time> <tz>.")
  2) Compare two slots ("<day1> works, but <day2> <time> is better.")
  3) Decline and propose alternatives ("None of these windows work; could we try <alt1> or <alt2>?")
- When the sender gave a soft window (morning/afternoon/etc.) rather than specific times, REPLACE suggestion #1 with an "Offer 2–3 specific times" reply that lists the candidate slots as Markdown bullets, one per line, in this exact format:
    - <Weekday>, <Month> <D> at <h:MM> <AM/PM> <TZ abbrev>
  Example body:
    "A few times that work on my side — let me know which is easiest:\n\n- Wednesday, May 20 at 4:30 PM EDT\n- Wednesday, May 20 at 5:00 PM EDT\n- Wednesday, May 20 at 5:30 PM EDT"
  Never return an empty reply_suggestions array when slots were emitted.
- If no clear scheduling proposal exists, set detected=false and slots=[] and explain why in notes.`;

    const userMsg = `User timezone: ${userTimezone}
Now: ${nowIso}
Subject: ${subject}

Thread (oldest → newest):
${threadText}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": LOVABLE_API_KEY,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      return new Response(JSON.stringify({ error: "AI gateway failed", detail: txt }), {
        status: aiResp.status === 429 || aiResp.status === 402 ? aiResp.status : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const content = aiJson?.choices?.[0]?.message?.content || "{}";
    let parsed: ParseResult;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {
        detected: false,
        sender_timezone: null,
        user_timezone: userTimezone,
        slots: [],
        reply_suggestions: [],
        notes: "AI returned non-JSON",
      };
    }

    // Ensure required shape.
    parsed.detected = !!parsed.detected && Array.isArray(parsed.slots) && parsed.slots.length > 0;
    parsed.user_timezone = userTimezone;
    parsed.slots = (parsed.slots || []).filter(
      (s) => s && typeof s.start_iso === "string" && typeof s.end_iso === "string",
    );
    parsed.reply_suggestions = parsed.reply_suggestions || [];

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[parse-email-scheduling-proposals] error", e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});