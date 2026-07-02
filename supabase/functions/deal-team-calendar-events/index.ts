import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NYLAS_API_KEY = Deno.env.get("NYLAS_API_KEY");
const NYLAS_API_URI = "https://api.us.nylas.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const FREE_PROVIDERS = new Set([
  "gmail.com","googlemail.com","yahoo.com","yahoo.co.uk","hotmail.com","outlook.com",
  "live.com","msn.com","aol.com","icloud.com","me.com","mac.com","mail.com",
  "protonmail.com","proton.me","gmx.com","gmx.net","yandex.com","zoho.com",
]);

function domainOf(email?: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase().trim();
}

function normalizeUrlToDomain(input?: string | null): string | null {
  if (!input) return null;
  try {
    let s = input.toLowerCase().trim();
    s = s.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    if (!s.includes(".")) return null;
    return s;
  } catch {
    return null;
  }
}

/**
 * Derive candidate domains from a company name when company_url is absent.
 * e.g. "Gabb Wireless" -> ["gabbwireless.com","gabbwireless.io","gabbwireless.co","gabbwireless.ai"]
 */
function candidateDomainsFromName(name?: string | null): string[] {
  if (!name) return [];
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (slug.length < 3) return [];
  return [".com", ".io", ".co", ".ai"].map((tld) => slug + tld);
}

/**
 * Significant name tokens for title matching. Lowercased, ≥4 chars, drops
 * generic suffixes so "Gabb Wireless" matches events titled just "Gabb / 5L".
 */
const NAME_STOPWORDS = new Set([
  "inc","llc","corp","corporation","co","company","ltd","limited","holdings",
  "group","the","and","of","wireless","technologies","tech","systems","solutions",
  "labs","studio","studios","capital","partners","ventures","global","international",
  "services","industries","enterprises","networks","network","software","platform",
]);
function significantTokens(name?: string | null): string[] {
  if (!name) return [];
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !NAME_STOPWORDS.has(t));
}

interface ReqBody {
  deal_id: string;
  time_min: string;
  time_max: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!NYLAS_API_KEY) {
      return new Response(JSON.stringify({ events: [], error: "Nylas not configured" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: claimsData, error: authError } = await supabase.auth.getClaims(token);
    if (authError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = claimsData.claims.sub as string;
    const callerEmail = (claimsData.claims.email as string | undefined) || null;

    const body: ReqBody = await req.json();
    if (!body.deal_id || !body.time_min || !body.time_max) {
      return new Response(JSON.stringify({ error: "deal_id, time_min, time_max required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve caller domain
    let callerDomain = domainOf(callerEmail);
    if (!callerDomain) {
      const { data: p } = await supabase
        .from("profiles").select("email").eq("user_id", callerId).maybeSingle();
      callerDomain = domainOf(p?.email);
    }
    if (!callerDomain) {
      return new Response(JSON.stringify({ events: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch deal
    const { data: deal, error: dealErr } = await supabase
      .from("deals")
      .select("id, company, company_url")
      .eq("id", body.deal_id)
      .maybeSingle();
    if (dealErr || !deal) {
      return new Response(JSON.stringify({ events: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const companyName = ((deal as any).company || "").trim();
    const companyDomain = normalizeUrlToDomain((deal as any).company_url);
    const primaryDomain = companyDomain && !FREE_PROVIDERS.has(companyDomain) ? companyDomain : null;
    // Fall back to inferred domains when the deal has no company_url on file.
    const fallbackDomains = primaryDomain ? [] : candidateDomainsFromName(companyName);
    const matchDomains = new Set<string>([primaryDomain, ...fallbackDomains].filter(Boolean) as string[]);
    const nameLower = companyName && companyName.length >= 3 ? companyName.toLowerCase() : null;
    const tokens = significantTokens(companyName);
    if (matchDomains.size === 0 && !nameLower && tokens.length === 0) {
      return new Response(JSON.stringify({ events: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Same-domain teammates with grants
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, email, display_name, first_name, last_name, avatar_url");
    const sameDomain = (profiles || []).filter(
      (p: any) => domainOf(p.email) === callerDomain,
    );
    const ids = sameDomain.map((p: any) => p.user_id);
    if (ids.length === 0) {
      return new Response(JSON.stringify({ events: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: tokenRows } = await supabase
      .from("gmail_tokens").select("user_id, grant_id").in("user_id", ids);
    const grantByUser = new Map<string, string>();
    for (const t of tokenRows || []) if ((t as any).grant_id) grantByUser.set((t as any).user_id, (t as any).grant_id);
    const profByUser = new Map<string, any>();
    for (const p of sameDomain) profByUser.set(p.user_id, p);

    const startUnix = Math.floor(new Date(body.time_min).getTime() / 1000);
    const endUnix = Math.floor(new Date(body.time_max).getTime() / 1000);

    const results = await Promise.all(Array.from(grantByUser.entries()).map(async ([userId, grantId]) => {
      try {
        const raw: any[] = [];
        let cursor: string | null = null;
        for (let page = 0; page < 6; page += 1) {
          const url = new URL(`${NYLAS_API_URI}/v3/grants/${grantId}/events`);
          url.searchParams.set("calendar_id", "primary");
          url.searchParams.set("start", String(startUnix));
          url.searchParams.set("end", String(endUnix));
          url.searchParams.set("limit", "200");
          url.searchParams.set("expand_recurring", "true");
          if (cursor) url.searchParams.set("page_token", cursor);
          const resp = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${NYLAS_API_KEY}`, Accept: "application/json" },
          });
          if (!resp.ok) break;
          const data = await resp.json();
          const batch = (data?.data || []) as any[];
          raw.push(...batch);
          cursor = data?.next_cursor || null;
          if (!cursor || batch.length === 0) break;
        }
        const prof = profByUser.get(userId);
        return raw
          .filter((e: any) => e.status !== "cancelled")
          .map((e: any) => {
            const title = String(e.title || "");
            const participants = Array.isArray(e.participants) ? e.participants : [];
            const participantEmails = participants
              .map((pt: any) => (pt?.email || "").toLowerCase())
              .filter(Boolean);
            const titleLower = title.toLowerCase();
            const fullNameHit = nameLower ? titleLower.includes(nameLower) : false;
            // Token-based fallback: any distinctive ≥4-char token in the title.
            const tokenHit = !fullNameHit && tokens.some((t) => titleLower.includes(t));
            const titleHit = fullNameHit || tokenHit;
            const domainHit = matchDomains.size > 0
              ? participantEmails.some((em: string) => {
                  const d = domainOf(em);
                  return d ? matchDomains.has(d) : false;
                })
              : false;
            if (!titleHit && !domainHit) return null;
            const w = e.when || {};
            const isAllDay = !w.start_time && !!w.start_date;
            const start = w.start_time ? new Date(w.start_time * 1000).toISOString() : (w.start_date || "");
            const end = w.end_time ? new Date(w.end_time * 1000).toISOString() : (w.end_date || "");
            return {
              id: `${userId}:${e.id}`,
              nylas_id: e.id,
              title: title || "Busy",
              start, end, all_day: isAllDay,
              location: e.location || null,
              html_link: e.html_link || null,
              hangout_link: e.conferencing?.details?.url || null,
              participants: participantEmails,
              match: { title: titleHit, domain: domainHit },
              teammate: {
                user_id: userId,
                email: prof?.email || null,
                display_name: prof?.display_name
                  || [prof?.first_name, prof?.last_name].filter(Boolean).join(" ")
                  || prof?.email
                  || "Teammate",
                avatar_url: prof?.avatar_url || null,
              },
            };
          })
          .filter(Boolean);
      } catch (err) {
        console.error("[deal-team-calendar-events] teammate fetch failed", userId, (err as any)?.message);
        return [];
      }
    }));

    // Dedupe by nylas_id (same event on multiple teammate calendars).
    const seen = new Map<string, any>();
    for (const arr of results) {
      for (const ev of arr as any[]) {
        const key = ev.nylas_id;
        if (!seen.has(key)) seen.set(key, ev);
      }
    }
    const events = Array.from(seen.values());

    return new Response(JSON.stringify({ events }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[deal-team-calendar-events] error:", e?.message || e);
    return new Response(JSON.stringify({ error: e?.message || "Internal error", events: [] }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});