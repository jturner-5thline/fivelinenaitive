// Edge function: email-ai-search
// Phase 4 of inbox search work. Centralizes the AI search prompt server-side
// so we can iterate on it without shipping a client release, and adds
// structured logging for query quality auditing.
//
// Request body:
//   {
//     query:       string,                   // user's natural-language query
//     candidates:  CandidateEmail[],         // pre-filtered list (folder/category)
//     today?:      string                    // optional ISO date for tests
//   }
//
// Response body:
//   {
//     results:        Array<{ id: string, reason: string }>,
//     parsedFilters:  ParsedFilters,
//     executedQuery:  string,                // exactly what we sent to the model
//     latencyMs:      number,
//     model:          string
//   }

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const DEFAULT_MODEL = "google/gemini-2.5-flash";
const MAX_CANDIDATES = 200;

interface CandidateEmail {
  id: string;
  from?: string;
  subject?: string;
  snippet?: string;
  received_at?: string;
  folder?: string;
  is_read?: boolean;
  needs_response?: boolean;
  labels?: string[];
  category?: string;
  deal_name?: string;
  has_attachments?: boolean;
  attachment_names?: string[];
}

interface ParsedFilters {
  sender: string | null;
  senderRole: "lender" | "client" | "internal" | "prospect" | null;
  dateRange: string | null;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
  category: string | null;
  topics: string[];
  hasAttachments: boolean | null;
}

function buildSystemPrompt(today: string): string {
  return `You are an email search assistant. Today is ${today}. Given a user's natural-language search query and a JSON list of candidate emails, you must:

1. Infer the user's intent (sender, time range, category, topics, action state).
2. Return ALL emails that genuinely match the intent — favor recall over precision. Semantic matches are allowed.
3. Rank by relevance first, then recency.
4. For each result, give a SHORT (max ~8 words) reason.

TERM MAPPING — apply these expansions when interpreting the query:

- "signed" / "executed" / "countersigned" / "fully signed" →
    match if ANY of: \`labels\` contains "Signed" (case-insensitive), \`subject\` or \`snippet\` mentions signed/executed/countersigned/DocuSign/HelloSign,
    OR any \`attachment_names\` entry matches /signed|executed|countersigned|_fully|-fully|fully[_-]signed/i.
- "NDA" / "non-disclosure" → \`subject\`/\`snippet\`/\`attachment_names\` mentions NDA, non-disclosure, mutual NDA, MNDA, confidentiality.
- "lender" / "lenders" / "from lenders" → sender is a lender. Match if ANY of:
    \`category\` is "lender", \`labels\` contains "Lender", or the sender's name/domain looks like a lending institution
    (bank, capital, credit, finance, fund, lending, partners, mezzanine, ventures-debt). Do NOT require the literal token "lender" in the email.
- "client" / "clients" → \`category\` is "deal" or "prospect", or \`deal_name\` is set.
- "last week" → received_at within the last 7 days from today (inclusive).
  "this week" → received_at since the start of the current ISO week.
  "last month" / "this month" / "today" / "yesterday" → analogous calendar windows.
  "recent" / "lately" → last 14 days.
- "needs response" / "to reply to" / "waiting on me" → \`needs_response\` is true.
- "with attachments" / "files" / "documents" → \`has_attachments\` is true.
- "from <name>" / "by <name>" → fuzzy match on sender name, email local-part, or sender domain.

Combine constraints with AND. If the query says "signed NDAs from lenders in the last week", a result must satisfy ALL of:
(signed) AND (NDA) AND (lender sender) AND (last 7 days). Do not drop a constraint silently — instead return fewer results.

Respond ONLY with a single JSON object inside a \`\`\`json code block. Schema:

{
  "interpretation": "Plain-English summary of what you searched for",
  "filters": {
    "sender": "string or null",
    "senderRole": "lender | client | internal | prospect | null",
    "dateRange": "today | yesterday | this_week | last_week | this_month | last_month | last_2_days | last_7_days | last_14_days | last_30_days | all",
    "dateRangeStart": "YYYY-MM-DD or null",
    "dateRangeEnd": "YYYY-MM-DD or null",
    "category": "calendar | asana_projects | clients_deals | invoices | scheduling | needs_response | null",
    "topics": ["short topic tags, e.g. 'NDA', 'signed', 'term sheet'"],
    "hasAttachments": true | false | null
  },
  "results": [
    { "id": "<email_id>", "reason": "short reason" }
  ]
}

Rules:
- Return at most 50 results.
- If nothing matches, return an empty results array (do not invent matches).
- Use the email ids exactly as provided.
- Do not include any prose outside the JSON code block.`;
}

function extractJsonBlock(text: string): any | null {
  if (!text) return null;
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  try {
    return JSON.parse(raw.trim());
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeFilters(raw: any): ParsedFilters {
  return {
    sender: typeof raw?.sender === "string" ? raw.sender : null,
    senderRole: ["lender", "client", "internal", "prospect"].includes(raw?.senderRole)
      ? raw.senderRole
      : null,
    dateRange: typeof raw?.dateRange === "string" ? raw.dateRange : null,
    dateRangeStart: typeof raw?.dateRangeStart === "string" ? raw.dateRangeStart : null,
    dateRangeEnd: typeof raw?.dateRangeEnd === "string" ? raw.dateRangeEnd : null,
    category: typeof raw?.category === "string" ? raw.category : null,
    topics: Array.isArray(raw?.topics)
      ? raw.topics.filter((t: unknown) => typeof t === "string").slice(0, 10)
      : [],
    hasAttachments: typeof raw?.hasAttachments === "boolean" ? raw.hasAttachments : null,
  };
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = Date.now();
  const reqId = crypto.randomUUID();

  try {
    // Auth gate — required for all calls. We use the user's JWT to instantiate
    // a scoped client so RLS is honored if we ever query the DB later.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
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
    const userId = userData.user.id;

    if (!LOVABLE_API_KEY) {
      console.error(`[email-ai-search ${reqId}] missing LOVABLE_API_KEY`);
      return new Response(JSON.stringify({ error: "AI gateway not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse + validate body.
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const query: string = typeof body?.query === "string" ? body.query.trim() : "";
    const candidatesRaw: unknown = body?.candidates;
    const today: string =
      typeof body?.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.today)
        ? body.today
        : new Date().toISOString().slice(0, 10);

    if (!query || query.length < 2) {
      return new Response(JSON.stringify({ error: "query is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!Array.isArray(candidatesRaw) || candidatesRaw.length === 0) {
      return new Response(
        JSON.stringify({ error: "candidates must be a non-empty array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const candidates: CandidateEmail[] = (candidatesRaw as CandidateEmail[])
      .filter((c) => c && typeof c.id === "string")
      .slice(0, MAX_CANDIDATES);

    const validIds = new Set(candidates.map((c) => c.id));
    const userContent =
      `Query: ${query}\n\nCandidate emails (JSON):\n` + JSON.stringify(candidates);

    // Call Lovable AI Gateway (OpenAI-compatible).
    const aiStartedAt = Date.now();
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        temperature: 0.2,
        messages: [
          { role: "system", content: buildSystemPrompt(today) },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (aiResp.status === 429) {
      await aiResp.text();
      return new Response(
        JSON.stringify({ error: "Rate limited — please retry shortly." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (aiResp.status === 402) {
      await aiResp.text();
      return new Response(
        JSON.stringify({ error: "AI credits exhausted. Add funds in Settings → Workspace → Usage." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error(`[email-ai-search ${reqId}] gateway ${aiResp.status}: ${errText}`);
      return new Response(
        JSON.stringify({ error: "AI gateway error" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiJson = await aiResp.json();
    const aiText: string = aiJson?.choices?.[0]?.message?.content ?? "";
    const parsed = extractJsonBlock(aiText);

    if (!parsed || !Array.isArray(parsed.results)) {
      console.error(`[email-ai-search ${reqId}] invalid model response`, {
        sample: aiText?.slice(0, 240),
      });
      return new Response(
        JSON.stringify({ error: "AI returned an invalid response" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const results: Array<{ id: string; reason: string }> = [];
    for (const r of parsed.results) {
      if (r && typeof r.id === "string" && validIds.has(r.id)) {
        results.push({
          id: r.id,
          reason: typeof r.reason === "string" ? r.reason : "",
        });
      }
      if (results.length >= 50) break;
    }

    const parsedFilters = normalizeFilters(parsed.filters);
    const interpretation: string =
      typeof parsed.interpretation === "string" && parsed.interpretation.trim()
        ? parsed.interpretation.trim()
        : `Showing results for "${query}"`;

    const totalLatency = Date.now() - startedAt;
    const aiLatency = Date.now() - aiStartedAt;

    // Structured log line for query auditing / quality tracking.
    console.log(
      JSON.stringify({
        evt: "email-ai-search",
        req_id: reqId,
        user_id: userId,
        query,
        today,
        candidate_count: candidates.length,
        result_count: results.length,
        parsed_filters: parsedFilters,
        ai_latency_ms: aiLatency,
        total_latency_ms: totalLatency,
        model: DEFAULT_MODEL,
      }),
    );

    return new Response(
      JSON.stringify({
        results,
        parsedFilters,
        interpretation,
        executedQuery: query,
        latencyMs: totalLatency,
        model: DEFAULT_MODEL,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[email-ai-search ${reqId}] unhandled`, msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});