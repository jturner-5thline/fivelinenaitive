import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * claap-draft-qa
 * --------------
 * Turns a linked Claap call into:
 *   1. an accurately extracted Q&A log (each lender question paired with the
 *      client's answer, with the speaker when identifiable),
 *   2. a short human-style call summary,
 *   3. outstanding / open items,
 *   4. a ready-to-send lender follow-up email (subject + body).
 *
 * The Q&A extraction is logged to `activity_logs` when the meeting is tied to
 * a deal, so the pairing is auditable.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { meeting_id, recording_id, title, draft_mode } = await req.json();
    const clientSummary = draft_mode === "client_summary";
    if (!meeting_id && !recording_id && !title) {
      return json({ error: "meeting_id, recording_id or title required" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const cols =
      "id, claap_id, title, transcript, ai_summary, next_steps, key_decisions, organizer_email, started_at, deal_id, recording_url";

    let meeting: any = null;
    if (meeting_id) {
      const { data } = await admin.from("claap_meetings").select(cols).eq("id", meeting_id).maybeSingle();
      meeting = data;
    }
    if (!meeting && recording_id) {
      const { data } = await admin.from("claap_meetings").select(cols).eq("claap_id", recording_id).maybeSingle();
      meeting = data;
    }
    if (!meeting && title) {
      const { data } = await admin
        .from("claap_meetings")
        .select(cols)
        .ilike("title", `%${String(title).slice(0, 80)}%`)
        .order("started_at", { ascending: false })
        .limit(1);
      meeting = data?.[0] || null;
    }
    if (!meeting) return json({ error: "Recording not found" }, 404);

    const transcript: string = (meeting.transcript || "").toString();
    if (!transcript.trim() && !meeting.ai_summary) {
      return json({ error: "This recording has no transcript yet — try again once Claap finishes processing." }, 422);
    }

    // Deal + client context for a more human, specific draft.
    let dealName: string | null = null;
    if (meeting.deal_id) {
      const { data: deal } = await admin.from("deals").select("name").eq("id", meeting.deal_id).maybeSingle();
      dealName = deal?.name ?? null;
    }
    const { data: participants } = await admin
      .from("claap_meeting_participants")
      .select("name, email")
      .eq("meeting_id", meeting.id)
      .limit(25);

    const senderName = (user.user_metadata?.full_name || user.email || "").toString();

    const prompt = [
      `Call title: ${meeting.title || "Untitled call"}`,
      dealName ? `Deal: ${dealName}` : "",
      meeting.started_at ? `Date: ${meeting.started_at}` : "",
      participants?.length
        ? `Participants: ${participants.map((p: any) => `${p.name || ""} <${p.email || ""}>`).join(", ")}`
        : "",
      meeting.ai_summary ? `Existing summary: ${meeting.ai_summary}` : "",
      "",
      "TRANSCRIPT:",
      transcript.slice(0, 120000) || "(no transcript, use the summary)",
    ].filter(Boolean).join("\n");

    const system = clientSummary ? [
      "You are a debt-advisory associate writing a short post-call recap email to the CLIENT (the borrower/company) after a call with a lender/funding source.",
      "Be accurate and grounded in the transcript. Never invent facts.",
      `The email is sent by ${senderName || "the advisor"}. Write in a natural, human, professional tone. No marketing language, no em dashes, no placeholder brackets other than the sign-off name.`,
      "Structure email_body as plain text: a greeting line, a blank line, one short paragraph thanking them for the call and noting it went well, a blank line, 2-3 short sentences summarizing what was discussed, a blank line, a section heading line reading exactly 'Action Items' with one '- ' bullet per request the lender made of the client, a blank line, a section heading line reading exactly 'Next Steps' with one '- ' bullet each, a blank line, then the sign-off on its own lines.",
      "Always separate sections and paragraphs with a blank line. Never run sections together.",
      "Populate 'summary' with the call summary, 'outstanding_items' with the lender's requests/action items for the client, and leave 'qa' as an empty array.",
      "Return ONLY JSON matching the schema.",
    ].join(" ") : [
      "You are a debt-advisory associate preparing lender follow-up material from a recorded call.",
      "Extract every substantive question a lender/funding source asked and pair it with the answer the client (borrower/company) actually gave on the call.",
      "Be accurate: never invent an answer. If a question was asked but not answered, set answer to an empty string and add it to outstanding_items.",
      "Then write a follow-up email to the lender in a natural, human, professional style — short paragraphs, no marketing tone, no em dashes, no placeholder brackets other than the sign-off name.",
      `The email is sent by ${senderName || "the advisor"}. Recap the call briefly, then list the Q&A, then the outstanding items being worked on.`,
      "Format email_body as plain text with clear spacing: a greeting line, a blank line, a short recap paragraph, a blank line, a section heading line reading exactly 'Questions & Answers', then each pair on its own lines as 'Q: ...' and 'A: ...' with a blank line between pairs, a blank line, a section heading line reading exactly 'Outstanding Items' with one '- ' bullet per item, a blank line, then the sign-off on its own lines.",
      "Always separate sections and paragraphs with a blank line. Never run sections together.",
      "Return ONLY JSON matching the schema.",
    ].join(" ");

    const schema = {
      type: "object",
      properties: {
        summary: { type: "string" },
        qa: {
          type: "array",
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              answer: { type: "string" },
              asked_by: { type: "string" },
              answered_by: { type: "string" },
            },
            required: ["question", "answer"],
          },
        },
        outstanding_items: { type: "array", items: { type: "string" } },
        email_subject: { type: "string" },
        email_body: { type: "string" },
      },
      required: ["summary", "qa", "outstanding_items", "email_subject", "email_body"],
    };

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": Deno.env.get("LOVABLE_API_KEY")!,
      },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: { name: "emit_qa_followup", description: "Return the Q&A log and drafted follow-up email", parameters: schema },
        }],
        tool_choice: { type: "function", function: { name: "emit_qa_followup" } },
      }),
    });

    if (aiRes.status === 429) return json({ error: "AI rate limit reached, please retry shortly." }, 429);
    if (aiRes.status === 402) return json({ error: "AI credits exhausted. Add credits to continue." }, 402);
    if (!aiRes.ok) return json({ error: `AI error: ${await aiRes.text()}` }, 502);

    const aiJson = await aiRes.json();
    const call = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    let parsed: any = {};
    try {
      parsed = JSON.parse(call?.function?.arguments || aiJson?.choices?.[0]?.message?.content || "{}");
    } catch {
      return json({ error: "Could not parse AI response" }, 502);
    }

    const result = {
      meeting_id: meeting.id,
      title: meeting.title,
      deal_id: meeting.deal_id,
      deal_name: dealName,
      recording_url: meeting.recording_url,
      summary: parsed.summary || meeting.ai_summary || "",
      qa: Array.isArray(parsed.qa) ? parsed.qa : [],
      outstanding_items: Array.isArray(parsed.outstanding_items) ? parsed.outstanding_items : [],
      email_subject: parsed.email_subject || `Follow-up: ${meeting.title || "our call"}`,
      email_body: parsed.email_body || "",
      suggested_recipients: (participants || [])
        .map((p: any) => p.email)
        .filter((e: string | null) => !!e),
    };

    // Log the extraction so the Q&A pairing is auditable.
    if (meeting.deal_id) {
      await admin.from("activity_logs").insert({
        deal_id: meeting.deal_id,
        user_id: user.id,
        activity_type: "claap_qa_extracted",
        description: `Q&A extracted from "${meeting.title || "call"}" (${result.qa.length} pairs, ${result.outstanding_items.length} outstanding)`,
        metadata: {
          meeting_id: meeting.id,
          recording_url: meeting.recording_url,
          qa: result.qa,
          outstanding_items: result.outstanding_items,
          summary: result.summary,
          tag: "Call Q&A",
        },
      });
    }

    return json(result);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
