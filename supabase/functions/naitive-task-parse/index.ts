import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ─────────────────── tiny fuzzy match ───────────────────
function norm(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}
function tokenScore(needle: string, hay: string): number {
  const n = norm(needle); const h = norm(hay);
  if (!n || !h) return 0;
  if (h === n) return 1;
  if (h.startsWith(n) || h.includes(` ${n}`)) return 0.92;
  if (h.includes(n)) return 0.85;
  // token overlap
  const nt = new Set(n.split(" ").filter(Boolean));
  const ht = new Set(h.split(" ").filter(Boolean));
  let overlap = 0;
  for (const t of nt) if (ht.has(t)) overlap++;
  return overlap > 0 ? 0.55 + 0.1 * overlap : 0;
}
function bestMatch<T extends { name?: string | null; display_name?: string | null; company?: string | null; first_name?: string | null; last_name?: string | null }>(
  needle: string,
  rows: T[],
  fields: (keyof T)[]
): { row: T; score: number } | null {
  if (!needle) return null;
  let best: { row: T; score: number } | null = null;
  for (const row of rows) {
    let s = 0;
    for (const f of fields) {
      const v = (row as any)[f];
      if (typeof v === "string") s = Math.max(s, tokenScore(needle, v));
    }
    // composite for first+last
    const fn = (row as any).first_name; const ln = (row as any).last_name;
    if (fn || ln) {
      const composite = `${fn || ""} ${ln || ""}`.trim();
      if (composite) s = Math.max(s, tokenScore(needle, composite));
    }
    if (!best || s > best.score) best = { row, score: s };
  }
  return best;
}

// ─────────────────── date helpers ───────────────────
function todayInTZ(tz: string): Date {
  // Use the user's timezone to anchor "today"
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    });
    const parts = fmt.formatToParts(new Date());
    const y = +parts.find((p) => p.type === "year")!.value;
    const m = +parts.find((p) => p.type === "month")!.value;
    const d = +parts.find((p) => p.type === "day")!.value;
    return new Date(Date.UTC(y, m - 1, d));
  } catch {
    const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d;
  }
}

// ─────────────────── handler ───────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;

    const body = await req.json().catch(() => ({}));
    const text: string = (body.text || "").toString().slice(0, 1000);
    const tz: string = body.tz || "America/New_York";
    const ctx = body.context || {};

    if (!text.trim()) {
      return new Response(JSON.stringify({ error: "text is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Resolve user's company
    const { data: member } = await admin
      .from("company_members")
      .select("company_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    const companyId = member?.company_id || null;

    // Pull candidate entities (cap each list)
    const [dealsRes, lendersRes, contactsRes, teamRes] = await Promise.all([
      companyId
        ? admin.from("deals").select("id, company").eq("company_id", companyId).neq("status", "archived").limit(200)
        : Promise.resolve({ data: [] as any[] }),
      companyId
        ? admin.from("master_lenders").select("id, name").eq("company_id", companyId).limit(200)
        : Promise.resolve({ data: [] as any[] }),
      companyId
        ? admin.from("contacts").select("id, first_name, last_name, email").eq("org_company_id", companyId).limit(200)
        : Promise.resolve({ data: [] as any[] }),
      companyId
        ? admin.rpc("get_team_members_for_mention", { _user_id: user.id })
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const deals = (dealsRes as any).data || [];
    const lenders = (lendersRes as any).data || [];
    const contacts = (contactsRes as any).data || [];
    const team = ((teamRes as any).data || []).map((p: any) => ({
      user_id: p.user_id,
      display_name: p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" "),
      first_name: p.first_name,
      last_name: p.last_name,
      email: p.email,
    }));

    const today = todayInTZ(tz);
    const todayStr = today.toISOString().slice(0, 10);
    const weekday = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][today.getUTCDay()];

    // Compact candidate lists for the model (names only)
    const dealNames = deals.map((d: any) => d.company).filter(Boolean).slice(0, 120);
    const lenderNames = lenders.map((l: any) => l.name).filter(Boolean).slice(0, 120);
    const teamNames = team.map((t: any) => t.display_name).filter(Boolean);

    const systemPrompt = `You convert short natural-language requests into a structured TaskDraft JSON.

Today is ${todayStr} (${weekday}, timezone ${tz}).
Resolve relative phrases like "tomorrow", "Tuesday", "end of day", "next Friday", "in 3 days" to absolute YYYY-MM-DD using TODAY as anchor. If a weekday is mentioned without "next", choose the next future occurrence (today does not count).

Return ONLY valid JSON with this shape:
{
  "title": string (short imperative, <= 90 chars, no trailing period),
  "description": string | null,
  "due_date": "YYYY-MM-DD" | null,
  "due_time": "HH:MM" | null,
  "priority": "low" | "normal" | "high" | "urgent" | null,
  "owner_hint": string | null,           // raw owner phrase from the text, e.g. "me", "Niki", null if none
  "deal_hint": string | null,            // raw deal/company phrase
  "lender_hint": string | null,          // raw lender phrase
  "contact_hint": string | null,         // raw contact person phrase
  "type": "follow_up" | "call" | "email" | "review" | "send_doc" | "meeting" | "general",
  "is_recurring": boolean,
  "recurrence_rule": string | null,      // e.g. "FREQ=WEEKLY;BYDAY=FR" if recurring; else null
  "confidence": number                   // 0..1, your overall confidence
}

Rules:
- DO NOT invent deal/lender/contact names. Only set the *_hint fields if the user actually said something matching it. Leave null otherwise.
- "me", "myself", "I" → owner_hint = "me"
- If priority is unclear, return null (not a guess).
- If the date is vague ("later", "soon"), set due_date null and lower confidence.
- "end of day" / "EOD" → today, due_time "17:00".
- "tomorrow morning" → tomorrow, due_time "09:00".
- "weekly", "every Friday", "Fridays at 9" → is_recurring true with RRULE.
- Distinguish lenders (capital sources / banks / funds — match against LENDERS list) from contacts (people — first/last names). When a name appears in the LENDERS list, set lender_hint, NOT contact_hint. Contact names are typically a person's first or full name not present in LENDERS.
- The DEAL is usually the borrower / portfolio company (matches DEALS). Lenders fund deals, contacts work at deals.

Examples:
- "follow up with Prospeq on Upflex DD" → deal_hint="Upflex", lender_hint="Prospeq" (Prospeq is a fund, Upflex is the deal).
- "call Ted Cavan about Canela NDA tomorrow" → contact_hint="Ted Cavan", deal_hint="Canela".
- "send Steven the dd checklist" → contact_hint="Steven".

Known candidate lists (for context only, you may still leave hints null):
DEALS: ${JSON.stringify(dealNames)}
LENDERS: ${JSON.stringify(lenderNames)}
TEAM: ${JSON.stringify(teamNames)}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        // Lite is plenty for short NL → TaskDraft extraction and noticeably
        // faster — matters because this fires on every debounced keystroke.
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (aiResp.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit. Try again." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiResp.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiResp.ok) {
      const errText = await aiResp.text().catch(() => "");
      console.error("[naitive-task-parse] AI error", aiResp.status, errText);
      return new Response(JSON.stringify({ error: "AI parse failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const raw = aiJson?.choices?.[0]?.message?.content || "{}";
    let cleaned = String(raw).trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    let parsed: any;
    try { parsed = JSON.parse(cleaned); } catch {
      const a = cleaned.indexOf("{"); const b = cleaned.lastIndexOf("}");
      parsed = a >= 0 && b > a ? JSON.parse(cleaned.slice(a, b + 1)) : {};
    }

    // ───── Resolve hints to IDs ─────
    let owner_id: string | null = null;
    let owner_label: string | null = null;
    let owner_ambiguous: { id: string; label: string }[] | null = null;
    if (parsed.owner_hint) {
      const h = String(parsed.owner_hint).trim();
      if (/^(me|myself|i)$/i.test(h)) {
        owner_id = user.id; owner_label = "Me";
      } else {
        // collect all good matches
        const scored = team.map((t: any) => ({
          row: t,
          score: Math.max(
            tokenScore(h, t.display_name || ""),
            tokenScore(h, `${t.first_name || ""} ${t.last_name || ""}`.trim()),
            tokenScore(h, t.email || "")
          ),
        })).filter((x: any) => x.score >= 0.55).sort((a: any, b: any) => b.score - a.score);
        if (scored.length === 1 && scored[0].score >= 0.7) {
          owner_id = scored[0].row.user_id; owner_label = scored[0].row.display_name;
        } else if (scored.length > 1 && scored[0].score - (scored[1]?.score || 0) < 0.15) {
          owner_ambiguous = scored.slice(0, 4).map((s: any) => ({ id: s.row.user_id, label: s.row.display_name }));
        } else if (scored.length >= 1 && scored[0].score >= 0.7) {
          owner_id = scored[0].row.user_id; owner_label = scored[0].row.display_name;
        }
      }
    }

    let deal_id: string | null = ctx.deal_id || null;
    let deal_label: string | null = null;
    if (!deal_id && parsed.deal_hint) {
      const m = bestMatch(parsed.deal_hint, deals as any[], ["company"]);
      if (m && m.score >= 0.7) { deal_id = (m.row as any).id; deal_label = (m.row as any).company; }
    } else if (deal_id) {
      const found = deals.find((d: any) => d.id === deal_id);
      if (found) deal_label = found.company;
    }

    let lender_id: string | null = null;
    let lender_label: string | null = null;
    if (parsed.lender_hint) {
      const m = bestMatch(parsed.lender_hint, lenders as any[], ["name"]);
      if (m && m.score >= 0.7) { lender_id = (m.row as any).id; lender_label = (m.row as any).name; }
    }

    let contact_id: string | null = ctx.contact_id || null;
    let contact_label: string | null = null;
    if (!contact_id && parsed.contact_hint) {
      const m = bestMatch(parsed.contact_hint, contacts as any[], ["first_name", "last_name", "email"]);
      if (m && m.score >= 0.7) {
        contact_id = (m.row as any).id;
        contact_label = `${(m.row as any).first_name || ""} ${(m.row as any).last_name || ""}`.trim() || (m.row as any).email;
      }
    } else if (contact_id) {
      const found = contacts.find((c: any) => c.id === contact_id);
      if (found) contact_label = `${found.first_name || ""} ${found.last_name || ""}`.trim() || found.email;
    }

    const draft = {
      title: (parsed.title || text).toString().slice(0, 200),
      description: parsed.description ?? null,
      due_date: parsed.due_date || null,
      due_time: parsed.due_time || null,
      priority: parsed.priority || null,
      type: parsed.type || "general",
      is_recurring: !!parsed.is_recurring,
      recurrence_rule: parsed.recurrence_rule || null,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.6,

      owner_id, owner_label, owner_ambiguous,
      deal_id, deal_label,
      lender_id, lender_label,
      contact_id, contact_label,

      source_thread_id: ctx.thread_id || null,
      hints: {
        owner: parsed.owner_hint || null,
        deal: parsed.deal_hint || null,
        lender: parsed.lender_hint || null,
        contact: parsed.contact_hint || null,
      },
    };

    return new Response(JSON.stringify({ draft }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[naitive-task-parse] error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unexpected error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});