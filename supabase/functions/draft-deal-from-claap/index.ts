// draft-deal-from-claap — fills the "Create new deal" queue payload
// (narrative, amount, status note, contact) from a Claap recording that
// synced AFTER the queue item was created by detect-sales-call-deals.
//
// Called on-demand from CreateDealApprovalCard when the payload narrative
// is empty but a Claap meeting/recording can be resolved for the event.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const queueId: string | undefined = body?.queue_id;
    const claapMeetingId: string | undefined = body?.claap_meeting_id;
    const claapRecordingId: string | undefined = body?.claap_recording_id;
    if (!queueId) return json({ error: "queue_id is required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // The queue row is readable by the user (RLS) — confirm access first.
    const { data: item, error: itemErr } = await userClient
      .from("ai_action_queue")
      .select("id, payload, source, deal_name")
      .eq("id", queueId)
      .maybeSingle();
    if (itemErr || !item) return json({ error: "Queue item not found" }, 404);

    const payload = (item.payload ?? {}) as Record<string, unknown>;
    const source = (item.source ?? {}) as Record<string, unknown>;
    const company = (source.company_name as string) || (item.deal_name as string) || "";
    const eventTitle = (source.event_title as string) || "";

    // Resolve transcript/summary from the meeting, falling back to the
    // local claap_recordings mirror.
    let transcript = "";
    let aiSummary = "";
    let keyDecisions: string[] = [];
    let nextSteps: string[] = [];
    let usedId: string | null = null;

    const meetingId = claapMeetingId || (source.claap_meeting_id as string) || null;
    if (meetingId) {
      const { data: m } = await admin
        .from("claap_meetings")
        .select("id, transcript, ai_summary, key_decisions, next_steps, title")
        .eq("id", meetingId)
        .maybeSingle();
      if (m) {
        usedId = m.id;
        transcript = (m.transcript as string) || "";
        aiSummary = (m.ai_summary as string) || "";
        keyDecisions = Array.isArray(m.key_decisions) ? (m.key_decisions as string[]) : [];
        nextSteps = Array.isArray(m.next_steps) ? (m.next_steps as string[]) : [];
      }
    }

    if (!transcript && !aiSummary) {
      let q = admin
        .from("claap_recordings")
        .select("id, title, summary, synthesized_note, key_takeaways, action_items")
        .limit(1);
      q = claapRecordingId ? q.eq("id", claapRecordingId) : q.ilike("title", (eventTitle || company).trim());
      const { data: r } = await q.maybeSingle();
      if (r) {
        usedId = usedId || r.id;
        aiSummary = (r.summary as string) || (r.synthesized_note as string) || "";
        keyDecisions = Array.isArray(r.key_takeaways) ? (r.key_takeaways as string[]) : [];
        nextSteps = Array.isArray(r.action_items) ? (r.action_items as string[]) : [];
      }
    }

    // Transcript chunks are the richest source when the meeting row has none.
    if (!transcript && usedId) {
      const { data: chunks } = await admin
        .from("claap_transcript_chunks")
        .select("content")
        .eq("recording_id", usedId)
        .limit(40);
      if (chunks?.length) transcript = chunks.map((c: any) => c.content).join("\n").slice(0, 12000);
    }

    if (!transcript && !aiSummary) {
      return json({ ok: false, reason: "no_transcript" });
    }
    if (!LOVABLE_API_KEY) return json({ ok: false, reason: "no_ai_key" });

    const system =
      "You are the Deal Admin Agent for a debt-advisory firm (5th Line). " +
      "Given a sales-call transcript, extract the fields needed to create a new deal. " +
      "Return STRICT JSON only, no prose. Unknown fields must be empty strings. " +
      "Do not invent numbers — if the amount isn't clearly stated, leave dealAmount empty.";
    const user =
      `Company: ${company}\nCall title: ${eventTitle}\n` +
      (aiSummary ? `Summary:\n${aiSummary}\n\n` : "") +
      (keyDecisions.length ? `Key decisions:\n- ${keyDecisions.join("\n- ")}\n\n` : "") +
      (nextSteps.length ? `Next steps:\n- ${nextSteps.join("\n- ")}\n\n` : "") +
      (transcript ? `Transcript excerpt:\n${transcript.slice(0, 12000)}\n` : "") +
      `\nReturn JSON with keys: dealName, dealAmount, contactName, contactInfo, dealStatusNote, narrative, referralName, referralEmail.\n` +
      `dealAmount is a plain number string. dealStatusNote is a one-sentence current-state summary. narrative is 2–4 sentences on the business + capital need.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (resp.status === 429) return json({ ok: false, reason: "rate_limited" }, 429);
    if (resp.status === 402) return json({ ok: false, reason: "payment_required" }, 402);
    if (!resp.ok) return json({ ok: false, reason: `ai_error_${resp.status}` }, 502);

    const data = await resp.json();
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content || "{}");

    const drafted = {
      dealName: (payload.dealName as string) || parsed.dealName || company,
      dealAmount: (payload.dealAmount as string) || String(parsed.dealAmount || "").replace(/[^0-9]/g, ""),
      contactName: (payload.contactName as string) || parsed.contactName || "",
      contactInfo: (payload.contactInfo as string) || parsed.contactInfo || "",
      dealStatusNote: parsed.dealStatusNote || (payload.dealStatusNote as string) || "",
      narrative: parsed.narrative || "",
      referralName: (payload.referralName as string) || parsed.referralName || "",
      referralEmail: (payload.referralEmail as string) || parsed.referralEmail || "",
    };

    const nextPayload = { ...payload, ...drafted };
    await admin
      .from("ai_action_queue")
      .update({
        payload: nextPayload,
        new_values: nextPayload,
        source: { ...source, claap_meeting_id: meetingId ?? source.claap_meeting_id ?? null, drafted_from_claap_at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      })
      .eq("id", queueId);

    return json({ ok: true, drafted });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
