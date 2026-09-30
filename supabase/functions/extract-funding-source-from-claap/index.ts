// extract-funding-source-from-claap
// Reads a Claap call (summary, takeaways, transcript excerpt) and returns
// SUGGESTED funding-source profile fields. Never writes to the database —
// the user reviews the prefilled form and saves it themselves.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const Body = z.object({
  summary: z.string().max(20000).optional().nullable(),
  keyTakeaways: z.array(z.string().max(2000)).max(50).optional().nullable(),
  meetingRowId: z.string().uuid().optional().nullable(),
  meetingTitle: z.string().max(300).optional().nullable(),
  attendeeName: z.string().max(200).optional().nullable(),
  attendeeEmail: z.string().max(320).optional().nullable(),
  geoOptions: z.array(z.string().max(100)).max(200).default([]),
  industryOptions: z.array(z.string().max(100)).max(200).default([]),
  loanTypeOptions: z.array(z.string().max(100)).max(200).default([]),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Unauthorized" }, 401);

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const b = parsed.data;

    let transcript = "";
    if (b.meetingRowId) {
      const { data: chunks } = await userClient
        .from("claap_transcript_chunks")
        .select("chunk_text")
        .eq("claap_meeting_id", b.meetingRowId)
        .order("chunk_index")
        .limit(40);
      if (chunks?.length) transcript = chunks.map((c: any) => c.chunk_text).join("\n").slice(0, 14000);
    }
    const takeaways = (b.keyTakeaways ?? []).filter(Boolean);
    if (!b.summary && !takeaways.length && !transcript) return json({ ok: false, reason: "no_call_content" });

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI is not configured" }, 500);

    const instructions =
      `You extract a lender / funding source's investment criteria from a call with them. ` +
      `Return STRICT JSON only with keys: name (the funding source firm name), lenderType, contactName, contactTitle, contactPhone, ` +
      `minDeal, maxDeal, sweetSpotMin, sweetSpotMax, minRevenue, ebitdaMin (all dollar integers or null), ` +
      `minGrossMarginPct, maxLeverage (numbers or null), geo (array), industries (array), loanTypes (array), ` +
      `excludedGeographies (array of strings), sponsorRequirement (string), notes (2-4 sentence summary of their appetite and what they avoid). ` +
      `geo MUST only use values from: ${JSON.stringify(b.geoOptions)}. industries MUST only use values from: ${JSON.stringify(b.industryOptions)}. ` +
      `loanTypes MUST only use values from: ${JSON.stringify(b.loanTypeOptions)}. ` +
      `Describe the FUNDING SOURCE's criteria, not the borrower being discussed. Use null / [] / "" when not clearly stated. Never invent numbers.`;
    const input =
      `Return the result as a JSON object.\nMeeting: ${b.meetingTitle ?? ""}\nCounterparty: ${b.attendeeName ?? ""} <${b.attendeeEmail ?? ""}>\n\n` +
      (b.summary ? `Summary:\n${b.summary}\n\n` : "") +
      (takeaways.length ? `Key takeaways:\n- ${takeaways.join("\n- ")}\n\n` : "") +
      (transcript ? `Transcript excerpt:\n${transcript}` : "");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        instructions,
        input,
        stream: true,
        store: false,
        reasoning: { effort: "low", summary: "auto" },
        include: ["reasoning.encrypted_content"],
        text: { format: { type: "json_object" } },
      }),
    });
    if (!res.ok || !res.body) {
      const msg = await res.text().catch(() => "");
      const status = res.status === 402 || res.status === 429 || res.status === 403 ? res.status : 502;
      return json({ error: status === 402 ? "AI credits exhausted" : status === 429 ? "AI is busy, try again shortly" : "AI extraction failed", detail: msg.slice(0, 300) }, status);
    }

    // Consume SSE and collect output text.
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const evt = JSON.parse(data);
          if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") text += evt.delta;
        } catch { /* ignore */ }
      }
    }
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return json({ ok: false, reason: "no_output" });
    const out = JSON.parse(match[0]);
    const keep = (arr: unknown, allowed: string[]) => {
      const set = new Map(allowed.map((a) => [a.toLowerCase(), a]));
      return Array.isArray(arr) ? arr.map((v) => set.get(String(v).toLowerCase())).filter(Boolean) : [];
    };
    out.geo = keep(out.geo, b.geoOptions);
    out.industries = keep(out.industries, b.industryOptions);
    out.loanTypes = keep(out.loanTypes, b.loanTypeOptions);
    return json({ ok: true, fields: out });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
