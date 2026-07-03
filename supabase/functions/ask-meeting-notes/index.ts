import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type NoteRow = {
  id: string;
  event_title: string | null;
  event_start: string | null;
  attendee_names: string[] | null;
  attendee_emails: string[] | null;
  note_text: string;
  linked_deal_id: string | null;
};

function excerpt(text: string, n = 240): string {
  const t = (text || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const question: string = (body?.question || "").toString().trim();
    if (!question) {
      return new Response(JSON.stringify({ error: "Question is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pull a candidate set: broad recency + keyword-ish match on note_text/title/attendees.
    // Keep the size bounded so the model prompt stays small.
    const like = `%${question.replace(/[%_]/g, "").slice(0, 80)}%`;
    const { data: matched } = await supabase
      .from("user_meeting_notes")
      .select("id,event_title,event_start,attendee_names,attendee_emails,note_text,linked_deal_id")
      .eq("user_id", userId)
      .or(`note_text.ilike.${like},event_title.ilike.${like}`)
      .order("event_start", { ascending: false, nullsFirst: false })
      .limit(20);

    const { data: recent } = await supabase
      .from("user_meeting_notes")
      .select("id,event_title,event_start,attendee_names,attendee_emails,note_text,linked_deal_id")
      .eq("user_id", userId)
      .order("event_start", { ascending: false, nullsFirst: false })
      .limit(20);

    const seen = new Set<string>();
    const notes: NoteRow[] = [];
    for (const row of [...(matched ?? []), ...(recent ?? [])]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      notes.push(row as NoteRow);
      if (notes.length >= 25) break;
    }

    // Resolve linked deal names for context/citation display.
    const dealIds = Array.from(
      new Set(notes.map((n) => n.linked_deal_id).filter(Boolean) as string[]),
    );
    const dealMap: Record<string, string> = {};
    if (dealIds.length) {
      const { data: dealRows } = await supabase
        .from("deals")
        .select("id, company")
        .in("id", dealIds);
      for (const d of (dealRows ?? []) as { id: string; company: string | null }[]) {
        dealMap[d.id] = d.company ?? "Untitled deal";
      }
    }

    if (notes.length === 0) {
      return new Response(
        JSON.stringify({
          answer: "I couldn't find any of your saved meeting notes that relate to that question.",
          citations: [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Number notes for citation. The model must cite as [n] where n is 1-based index below.
    const numbered = notes.map((n, i) => ({ n: i + 1, ...n }));
    const contextBlock = numbered
      .map((n) => {
        const when = n.event_start ? new Date(n.event_start).toISOString().slice(0, 16).replace("T", " ") : "unknown date";
        const who = (n.attendee_names ?? []).slice(0, 8).join(", ") || "no attendees listed";
        const deal = n.linked_deal_id ? dealMap[n.linked_deal_id] || "linked deal" : "no linked deal";
        return `[${n.n}] ${n.event_title || "Untitled meeting"} — ${when}
Attendees: ${who}
Deal: ${deal}
Notes: ${excerpt(n.note_text, 700)}`;
      })
      .join("\n\n");

    const systemPrompt = `You answer questions about the user's own meeting notes.

RULES:
- Use ONLY the numbered notes provided below.
- Cite every factual claim inline using square-bracket numbers like [1], [2]. Multiple citations look like [1][3].
- Prefer specific dates, attendee names, and short quotes from the notes.
- If nothing in the notes answers the question, say so plainly and do not invent details.
- Keep the answer under 180 words unless a list is clearly needed.`;

    const userPrompt = `QUESTION: ${question}

NOTES:
${contextBlock}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: false,
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResp.text();
      throw new Error(`AI gateway error ${aiResp.status}: ${errText}`);
    }

    const aiJson = await aiResp.json();
    const answer: string = aiJson?.choices?.[0]?.message?.content ?? "";

    // Only include citations actually referenced by the model.
    const cited = new Set<number>();
    for (const m of answer.matchAll(/\[(\d+)\]/g)) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) cited.add(n);
    }
    const citations = numbered
      .filter((n) => cited.has(n.n))
      .map((n) => ({
        n: n.n,
        id: n.id,
        event_title: n.event_title,
        event_start: n.event_start,
        attendee_names: n.attendee_names ?? [],
        linked_deal_id: n.linked_deal_id,
        linked_deal_name: n.linked_deal_id ? dealMap[n.linked_deal_id] ?? null : null,
        snippet: excerpt(n.note_text, 200),
      }));

    return new Response(JSON.stringify({ answer, citations }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ask-meeting-notes error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});