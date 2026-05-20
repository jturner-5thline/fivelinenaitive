import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─────────────────────────────────────────────────────────────────────────────
// extract-lender-fit
//
// For each requested lender, reads ALL lender notes/tags/history/pass patterns,
// summarizes them with an LLM, and extracts:
//   - positive_signals     (what they like)
//   - negative_signals     (what they avoid but isn't a hard exclusion)
//   - exclusions           (hard dis-fit patterns — used as hard filters)
//   - nuanced_preferences  (style/operator/context preferences)
//   - summary              (narrative profile)
//   - embedding            (semantic vector over the narrative profile)
//
// Idempotent via source_hash so we don't re-call the LLM unless the underlying
// notes/profile changed. Skips lenders that have no qualitative signal.
//
// Body: { lenderIds?: string[], lenderNames?: string[], force?: boolean }
//   - If neither provided, runs for ALL master_lenders in caller's company
//     (capped at 200/run; primarily a maintenance call).
// ─────────────────────────────────────────────────────────────────────────────

const MODEL_VERSION = "gemini-2.5-flash+text-embedding-3-small";
const EXTRACTION_MODEL = "google/gemini-2.5-flash";
const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const EMBEDDING_DIM = 1536;

const lc = (v: unknown) => String(v ?? "").trim().toLowerCase();
const arr = (v: unknown): string[] => Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface FitExtraction {
  summary: string;
  positive_signals: { signal: string; confidence: number }[];
  negative_signals: { signal: string; confidence: number }[];
  exclusions: { pattern: string; confidence: number }[];
  nuanced_preferences: { preference: string; confidence: number }[];
}

const EMPTY_EXTRACTION: FitExtraction = {
  summary: "",
  positive_signals: [],
  negative_signals: [],
  exclusions: [],
  nuanced_preferences: [],
};

function buildSourceText(lender: any, notes: any[], passReasons: string[], patterns: any[]): string {
  const parts: string[] = [];
  parts.push(`Name: ${lender.name}`);
  if (lender.lender_type) parts.push(`Type: ${lender.lender_type}`);
  if (Array.isArray(lender.loan_types) && lender.loan_types.length) parts.push(`Loan types: ${lender.loan_types.join(", ")}`);
  if (Array.isArray(lender.industries) && lender.industries.length) parts.push(`Industries: ${lender.industries.join(", ")}`);
  if (Array.isArray(lender.industries_to_avoid) && lender.industries_to_avoid.length) parts.push(`Industries to avoid: ${lender.industries_to_avoid.join(", ")}`);
  if (lender.geo) parts.push(`Geography: ${lender.geo}`);
  if (lender.min_deal || lender.max_deal) parts.push(`Deal size band: ${lender.min_deal ?? "?"} - ${lender.max_deal ?? "?"}`);
  if (lender.min_revenue) parts.push(`Min revenue: ${lender.min_revenue}`);
  if (lender.ebitda_min) parts.push(`Min EBITDA: ${lender.ebitda_min}`);
  if (lender.sponsorship) parts.push(`Sponsorship: ${lender.sponsorship}`);
  if (lender.cash_burn) parts.push(`Cash burn stance: ${lender.cash_burn}`);
  if (lender.b2b_b2c) parts.push(`B2B/B2C: ${lender.b2b_b2c}`);
  if (lender.refinancing) parts.push(`Refi stance: ${lender.refinancing}`);
  if (Array.isArray(lender.tags) && lender.tags.length) parts.push(`Tags: ${lender.tags.join(", ")}`);
  if (lender.deal_structure_notes) parts.push(`Structure notes:\n${lender.deal_structure_notes}`);
  if (lender.company_requirements) parts.push(`Company requirements:\n${lender.company_requirements}`);

  if (notes.length) {
    parts.push("Internal notes:");
    for (const n of notes.slice(0, 40)) {
      const flag = n.is_flag ? "[FLAG] " : "";
      const tags = arr(n.tags).length ? ` [${arr(n.tags).join(",")}]` : "";
      parts.push(`- ${flag}${(n.body ?? "").slice(0, 600)}${tags}`);
    }
  }
  if (passReasons.length) {
    parts.push("Recent pass reasons (last 90d, across deals):");
    for (const r of passReasons.slice(0, 20)) parts.push(`- ${r}`);
  }
  if (patterns.length) {
    parts.push("Repeating pass patterns (system-detected):");
    for (const p of patterns.slice(0, 20)) {
      parts.push(`- ${p.reason_category}: ${p.pattern_value} (conf ${p.confidence_score}, n=${p.occurrence_count})`);
    }
  }
  return parts.join("\n");
}

async function extractWithLLM(source: string, lenderName: string): Promise<FitExtraction | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return null;

  const system = `You analyze qualitative records about a private-credit / commercial lender and extract reusable fit attributes. Read EVERY note, tag, structure note, requirement, pass reason, and pattern. Extract specific, concrete signals that would help match this lender to future deals — write each as a short phrase that captures the situational nuance (e.g. "founder-led consumer brands with seasonal inventory pressure", "avoids turnaround situations despite broad ABL mandate", "prefers operators who've raised institutional equity before").

Categories:
- positive_signals: situations / industries / structures / borrower profiles this lender ACTIVELY likes or has funded.
- negative_signals: situations they tend to pass on, dislike, or struggle with (soft penalty).
- exclusions: HARD disqualifiers — patterns where they reliably will not engage (e.g. "pre-revenue", "cannabis", "consumer hardware", "<$5M EBITDA"). Use sparingly; only when evidence is clear.
- nuanced_preferences: style/process/relationship preferences (e.g. "wants warm intros", "prefers sponsor-backed deals", "needs audited financials").

Confidence ∈ [0,1]: 1.0 = stated directly and repeated; 0.7 = clearly implied by one strong note; 0.4 = weak inference.
Summary: 2-3 sentences capturing the lender's actual operating posture in plain English.

If the source text has very little signal, return mostly-empty arrays — do NOT fabricate.

Respond with STRICT JSON only, no prose:
{"summary":"...","positive_signals":[{"signal":"...","confidence":0.x}],"negative_signals":[...],"exclusions":[{"pattern":"...","confidence":0.x}],"nuanced_preferences":[{"preference":"...","confidence":0.x}]}`;

  const userMsg = `LENDER: ${lenderName}\n\nSOURCE RECORDS:\n${source}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify({
      model: EXTRACTION_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
    }),
  });
  if (!res.ok) {
    console.error("extract LLM error", res.status, await res.text());
    return null;
  }
  const j = await res.json();
  const text: string = j?.choices?.[0]?.message?.content ?? "";
  try {
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : text);
    return {
      summary: String(parsed.summary ?? "").slice(0, 2000),
      positive_signals: Array.isArray(parsed.positive_signals) ? parsed.positive_signals.slice(0, 20).map((x: any) => ({ signal: String(x.signal ?? "").slice(0, 220), confidence: Math.min(1, Math.max(0, Number(x.confidence) || 0.5)) })).filter((x: any) => x.signal) : [],
      negative_signals: Array.isArray(parsed.negative_signals) ? parsed.negative_signals.slice(0, 20).map((x: any) => ({ signal: String(x.signal ?? "").slice(0, 220), confidence: Math.min(1, Math.max(0, Number(x.confidence) || 0.5)) })).filter((x: any) => x.signal) : [],
      exclusions: Array.isArray(parsed.exclusions) ? parsed.exclusions.slice(0, 15).map((x: any) => ({ pattern: String(x.pattern ?? "").slice(0, 220), confidence: Math.min(1, Math.max(0, Number(x.confidence) || 0.5)) })).filter((x: any) => x.pattern) : [],
      nuanced_preferences: Array.isArray(parsed.nuanced_preferences) ? parsed.nuanced_preferences.slice(0, 15).map((x: any) => ({ preference: String(x.preference ?? "").slice(0, 220), confidence: Math.min(1, Math.max(0, Number(x.confidence) || 0.5)) })).filter((x: any) => x.preference) : [],
    };
  } catch (e) {
    console.error("extract parse failed", text.slice(0, 400));
    return null;
  }
}

async function embedText(text: string): Promise<number[] | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY || !text.trim()) return null;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text.slice(0, 8000),
      dimensions: EMBEDDING_DIM,
    }),
  });
  if (!res.ok) {
    console.error("embed error", res.status, await res.text());
    return null;
  }
  const j = await res.json();
  const vec = j?.data?.[0]?.embedding;
  return Array.isArray(vec) ? vec : null;
}

function buildProfileText(lender: any, extraction: FitExtraction): string {
  const parts: string[] = [];
  parts.push(lender.name);
  if (lender.lender_type) parts.push(lender.lender_type);
  if (Array.isArray(lender.loan_types)) parts.push(lender.loan_types.join(", "));
  if (Array.isArray(lender.industries)) parts.push("Industries: " + lender.industries.join(", "));
  if (lender.geo) parts.push("Geo: " + lender.geo);
  if (extraction.summary) parts.push(extraction.summary);
  if (extraction.positive_signals.length) parts.push("Likes: " + extraction.positive_signals.map((s) => s.signal).join("; "));
  if (extraction.negative_signals.length) parts.push("Avoids: " + extraction.negative_signals.map((s) => s.signal).join("; "));
  if (extraction.exclusions.length) parts.push("Will not do: " + extraction.exclusions.map((s) => s.pattern).join("; "));
  if (extraction.nuanced_preferences.length) parts.push("Style: " + extraction.nuanced_preferences.map((s) => s.preference).join("; "));
  return parts.filter(Boolean).join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const force = !!body?.force;
    let { lenderIds, lenderNames }: { lenderIds?: string[]; lenderNames?: string[] } = body || {};

    // Load lenders
    let lendersQuery = supabase
      .from("master_lenders")
      .select("id, name, company_id, lender_type, loan_types, industries, industries_to_avoid, geo, min_deal, max_deal, min_revenue, ebitda_min, sponsorship, cash_burn, b2b_b2c, refinancing, tags, deal_structure_notes, company_requirements");

    if (Array.isArray(lenderIds) && lenderIds.length) {
      lendersQuery = lendersQuery.in("id", lenderIds.slice(0, 50));
    } else if (Array.isArray(lenderNames) && lenderNames.length) {
      lendersQuery = lendersQuery.in("name", lenderNames.slice(0, 50));
    } else {
      lendersQuery = lendersQuery.limit(200);
    }
    const { data: lenders, error: lErr } = await lendersQuery;
    if (lErr) throw lErr;
    if (!lenders?.length) {
      return new Response(JSON.stringify({ processed: 0, results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ids = lenders.map((l) => l.id);
    const names = lenders.map((l) => l.name);

    const [{ data: notesById }, { data: notesByName }, { data: existing }, { data: passPatterns }, { data: recentRows }] = await Promise.all([
      supabase.from("lender_notes").select("master_lender_id, body, tags, is_flag, updated_at").in("master_lender_id", ids),
      supabase.from("lender_notes").select("lender_name, body, tags, is_flag, updated_at").in("lender_name", names).is("master_lender_id", null),
      supabase.from("lender_fit_attributes").select("master_lender_id, lender_name, source_hash, id").in("master_lender_id", ids),
      supabase.from("lender_pass_patterns").select("master_lender_id, lender_name, reason_category, pattern_value, confidence_score, occurrence_count").in("master_lender_id", ids),
      supabase.from("deal_lenders").select("name, pass_reason, updated_at").gte("updated_at", new Date(Date.now() - 90 * 86400000).toISOString()).in("name", names).limit(2000),
    ]);

    const notesByIdMap = new Map<string, any[]>();
    (notesById ?? []).forEach((n: any) => {
      const list = notesByIdMap.get(n.master_lender_id) ?? [];
      list.push(n); notesByIdMap.set(n.master_lender_id, list);
    });
    const notesByNameMap = new Map<string, any[]>();
    (notesByName ?? []).forEach((n: any) => {
      const k = lc(n.lender_name);
      const list = notesByNameMap.get(k) ?? [];
      list.push(n); notesByNameMap.set(k, list);
    });
    const passPatternsByLender = new Map<string, any[]>();
    (passPatterns ?? []).forEach((p: any) => {
      const k = p.master_lender_id;
      const list = passPatternsByLender.get(k) ?? [];
      list.push(p); passPatternsByLender.set(k, list);
    });
    const passReasonsByName = new Map<string, string[]>();
    (recentRows ?? []).forEach((r: any) => {
      if (!r?.pass_reason) return;
      const k = lc(r.name);
      const list = passReasonsByName.get(k) ?? [];
      if (list.length < 30) list.push(String(r.pass_reason).slice(0, 200));
      passReasonsByName.set(k, list);
    });
    const existingByLender = new Map<string, any>();
    (existing ?? []).forEach((e: any) => existingByLender.set(e.master_lender_id, e));

    const results: { lender: string; status: string; signals?: number }[] = [];

    // Process serially with bounded concurrency
    const concurrency = 5;
    const queue = [...lenders];
    async function worker() {
      while (queue.length) {
        const lender = queue.shift();
        if (!lender) break;
        try {
          const notes = [
            ...(notesByIdMap.get(lender.id) ?? []),
            ...(notesByNameMap.get(lc(lender.name)) ?? []),
          ];
          const passReasons = passReasonsByName.get(lc(lender.name)) ?? [];
          const patterns = passPatternsByLender.get(lender.id) ?? [];
          const source = buildSourceText(lender, notes, passReasons, patterns);
          const hash = await sha256Hex(source);
          const prior = existingByLender.get(lender.id);
          if (!force && prior?.source_hash === hash) {
            results.push({ lender: lender.name, status: "cached" });
            continue;
          }

          // Skip very low-signal lenders (only structured fields, no notes/tags/passes)
          const hasQualitative = notes.length > 0 || passReasons.length > 0 || patterns.length > 0
            || (lender.deal_structure_notes && lender.deal_structure_notes.length > 30)
            || (lender.company_requirements && lender.company_requirements.length > 30)
            || (Array.isArray(lender.tags) && lender.tags.length > 0);
          let extraction: FitExtraction = EMPTY_EXTRACTION;
          if (hasQualitative) {
            const e = await extractWithLLM(source, lender.name);
            if (e) extraction = e;
          } else {
            extraction = { ...EMPTY_EXTRACTION, summary: `${lender.name} — ${lender.lender_type ?? "lender"}; ${(lender.loan_types ?? []).join(", ") || "no published loan types"}.` };
          }

          const profileText = buildProfileText(lender, extraction);
          const embedding = await embedText(profileText);

          const payload: any = {
            master_lender_id: lender.id,
            lender_name: lender.name,
            company_id: lender.company_id,
            summary: extraction.summary,
            positive_signals: extraction.positive_signals,
            negative_signals: extraction.negative_signals,
            exclusions: extraction.exclusions,
            nuanced_preferences: extraction.nuanced_preferences,
            source_hash: hash,
            model_version: MODEL_VERSION,
            extracted_at: new Date().toISOString(),
          };
          if (embedding) payload.embedding = embedding;

          if (prior?.id) {
            const { error } = await supabase
              .from("lender_fit_attributes")
              .update(payload).eq("id", prior.id);
            if (error) throw error;
          } else {
            const { error } = await supabase
              .from("lender_fit_attributes")
              .insert(payload);
            if (error) throw error;
          }
          results.push({
            lender: lender.name,
            status: "updated",
            signals: extraction.positive_signals.length + extraction.negative_signals.length + extraction.exclusions.length + extraction.nuanced_preferences.length,
          });
        } catch (e) {
          console.error("extract failed for", lender.name, e);
          results.push({ lender: lender.name, status: "error" });
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    return new Response(
      JSON.stringify({ processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("extract-lender-fit error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});