// Learn My Cadence - on-demand scan that builds a per-contact email cadence
// profile from the user's already-synced Nylas/Gmail email_cache table.
//
// Trigger: POST /learn-email-cadence  (no body required)
// Auth:    Required. Verifies the caller via supabase.auth.getUser().
// Output:  { jobId, contactsProcessed, messagesScanned }
//
// Why on-demand only: the user explicitly opted in via Settings → Email →
// Learn My Cadence. We never run this on a schedule.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ─────────────────────────────────────────────────────────────────────────
// Domain helpers
// ─────────────────────────────────────────────────────────────────────────
const norm = (e?: string | null) => (e || "").trim().toLowerCase();
const domainOf = (e: string) => e.split("@")[1] || "";

const FREE_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com",
  "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com",
]);

const FORMAL_OPENERS = ["dear ", "good morning", "good afternoon", "good evening"];
const CASUAL_OPENERS = ["hi ", "hey ", "yo ", "morning", "morning,", "morning!"];
const FORMAL_CLOSERS = [
  "best regards", "kind regards", "sincerely", "respectfully",
];
const CASUAL_CLOSERS = ["thanks", "thx", "cheers", "best,", "talk soon"];

function detectFormality(bodies: string[]): "formal" | "casual" | "neutral" {
  let f = 0, c = 0;
  for (const raw of bodies) {
    const b = (raw || "").toLowerCase().slice(0, 800);
    if (FORMAL_OPENERS.some((x) => b.startsWith(x))) f++;
    if (CASUAL_OPENERS.some((x) => b.startsWith(x))) c++;
    if (FORMAL_CLOSERS.some((x) => b.includes(x))) f++;
    if (CASUAL_CLOSERS.some((x) => b.includes(x))) c++;
  }
  if (f === 0 && c === 0) return "neutral";
  if (f >= c * 1.5) return "formal";
  if (c >= f * 1.5) return "casual";
  return "neutral";
}

function commonGreeting(bodies: string[]): string | null {
  const counts = new Map<string, number>();
  for (const b of bodies) {
    const firstLine = (b || "").split(/\r?\n/)[0]?.trim().slice(0, 40) || "";
    const m = firstLine.match(/^(hi|hey|hello|dear|good (morning|afternoon|evening))[^,!\n]*[,!]?/i);
    if (m) {
      const key = m[0].toLowerCase().replace(/\s+/g, " ");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let best: [string, number] | null = null;
  for (const e of counts) if (!best || e[1] > best[1]) best = e;
  return best ? best[0] : null;
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function inferRelationshipType(domain: string, name: string | null): string {
  if (!domain) return "other";
  if (FREE_DOMAINS.has(domain)) return "personal";
  // crude lender heuristic — domains containing common banking words
  if (/(capital|bank|credit|partners|fund|debt|invest)/i.test(domain)) return "lender";
  if (/(co|inc|llc|ai|io|app|tech|labs)/i.test(domain)) return "founder";
  if (name && /(internal|naitive|5thline)/i.test(domain)) return "internal";
  return "other";
}

// ─────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Auth
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing auth" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = userData.user.id;
  const userEmail = norm(userData.user.email);

  // Service-role client for writes
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Create job row
  const { data: jobRow, error: jobErr } = await admin
    .from("email_cadence_jobs")
    .insert({
      user_id: userId,
      status: "running",
      scope: "cache",
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (jobErr || !jobRow) {
    return new Response(JSON.stringify({ error: jobErr?.message || "Job create failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Pull last 180 days of email_cache for this user. We rely on the
    // existing cache rather than re-fetching from Nylas to keep the scan
    // fast and avoid hammering the upstream.
    const cutoff = new Date(Date.now() - 180 * 86400 * 1000).toISOString();
    const { data: rows, error: rowsErr } = await admin
      .from("email_cache")
      .select(
        "gmail_message_id, thread_id, from_email, from_name, to_emails, cc_emails, body_text, snippet, received_at, labels",
      )
      .eq("user_id", userId)
      .gte("received_at", cutoff)
      .order("received_at", { ascending: true })
      .limit(5000);

    if (rowsErr) throw rowsErr;
    const messages = rows || [];

    // Group per contact email. A "contact" = any non-self email address that
    // appears as either the sender or a recipient. We build per-contact
    // streams of:
    //  - outbound timestamps (from = user)
    //  - inbound timestamps (from = contact)
    //  - sample bodies (only outbound — they reveal the user's tone)
    type Bucket = {
      contactEmail: string;
      contactName: string | null;
      outbound: number[]; // ms
      inbound: number[]; // ms
      outboundBodies: string[];
    };
    const buckets = new Map<string, Bucket>();

    const addOut = (addr: string, name: string | null, ts: number, body?: string) => {
      const key = norm(addr);
      if (!key || key === userEmail) return;
      let b = buckets.get(key);
      if (!b) {
        b = { contactEmail: key, contactName: name, outbound: [], inbound: [], outboundBodies: [] };
        buckets.set(key, b);
      }
      b.outbound.push(ts);
      if (body && b.outboundBodies.length < 25) b.outboundBodies.push(body);
      if (!b.contactName && name) b.contactName = name;
    };
    const addIn = (addr: string, name: string | null, ts: number) => {
      const key = norm(addr);
      if (!key || key === userEmail) return;
      let b = buckets.get(key);
      if (!b) {
        b = { contactEmail: key, contactName: name, outbound: [], inbound: [], outboundBodies: [] };
        buckets.set(key, b);
      }
      b.inbound.push(ts);
      if (!b.contactName && name) b.contactName = name;
    };

    for (const m of messages) {
      const ts = new Date(m.received_at as string).getTime();
      if (!Number.isFinite(ts)) continue;
      const from = norm(m.from_email);
      const fromName = (m.from_name as string | null) ?? null;
      const isOutbound = from === userEmail || (m.labels || []).includes("SENT");
      if (isOutbound) {
        for (const t of (m.to_emails || []) as string[]) {
          addOut(t, null, ts, (m.body_text as string) || (m.snippet as string) || "");
        }
        for (const t of (m.cc_emails || []) as string[]) {
          addOut(t, null, ts, (m.body_text as string) || "");
        }
      } else if (from) {
        addIn(from, fromName, ts);
      }
    }

    // Compute per-contact stats. A contact qualifies if there's at least 2
    // outbound or 3 total interactions — anything less is statistical noise.
    const profiles: any[] = [];
    for (const b of buckets.values()) {
      const total = b.outbound.length + b.inbound.length;
      if (b.outbound.length < 2 && total < 3) continue;

      const outSorted = [...b.outbound].sort((a, b2) => a - b2);
      const inSorted = [...b.inbound].sort((a, b2) => a - b2);

      // followup intervals = days between consecutive user-to-contact sends
      const intervals: number[] = [];
      for (let i = 1; i < outSorted.length; i++) {
        const d = (outSorted[i] - outSorted[i - 1]) / 86400000;
        if (d >= 0.04 && d < 120) intervals.push(d); // ignore <1h bursts and >120d gaps
      }

      // response time = for each inbound, time until next outbound to same contact
      const responses: number[] = [];
      for (const inTs of inSorted) {
        const next = outSorted.find((x) => x > inTs);
        if (!next) continue;
        const hrs = (next - inTs) / 3600000;
        if (hrs > 0 && hrs < 24 * 30) responses.push(hrs);
      }

      const lastOut = outSorted.at(-1) ?? null;
      const lastIn = inSorted.at(-1) ?? null;
      const firstAny = Math.min(
        outSorted[0] ?? Number.POSITIVE_INFINITY,
        inSorted[0] ?? Number.POSITIVE_INFINITY,
      );
      const lastAny = Math.max(lastOut ?? 0, lastIn ?? 0);

      const formality = detectFormality(b.outboundBodies);
      const greeting = commonGreeting(b.outboundBodies);
      const lenWords = b.outboundBodies.length
        ? Math.round(
            b.outboundBodies.reduce((s, t) => s + t.split(/\s+/).filter(Boolean).length, 0) /
              b.outboundBodies.length,
          )
        : null;

      const tone = {
        formality,
        common_greeting: greeting,
        avg_length_words: lenWords,
        sample_count: b.outboundBodies.length,
      };

      profiles.push({
        user_id: userId,
        contact_email: b.contactEmail,
        contact_name: b.contactName,
        outbound_count: b.outbound.length,
        inbound_count: b.inbound.length,
        avg_followup_interval_days: avg(intervals)?.toFixed(2) ?? null,
        median_followup_interval_days: median(intervals)?.toFixed(2) ?? null,
        avg_response_time_hours: avg(responses)?.toFixed(2) ?? null,
        first_contact_at: Number.isFinite(firstAny)
          ? new Date(firstAny).toISOString()
          : null,
        last_outbound_at: lastOut ? new Date(lastOut).toISOString() : null,
        last_inbound_at: lastIn ? new Date(lastIn).toISOString() : null,
        last_contact_at: lastAny ? new Date(lastAny).toISOString() : null,
        tone,
        relationship_type: inferRelationshipType(domainOf(b.contactEmail), b.contactName),
        sample_size: total,
        computed_at: new Date().toISOString(),
      });
    }

    // Upsert in chunks to keep request payloads sane
    const chunkSize = 200;
    for (let i = 0; i < profiles.length; i += chunkSize) {
      const chunk = profiles.slice(i, i + chunkSize);
      const { error: upErr } = await admin
        .from("email_cadence_profiles")
        .upsert(chunk, { onConflict: "user_id,contact_email" });
      if (upErr) throw upErr;
    }

    await admin
      .from("email_cadence_jobs")
      .update({
        status: "done",
        contacts_processed: profiles.length,
        messages_scanned: messages.length,
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobRow.id);

    return new Response(
      JSON.stringify({
        jobId: jobRow.id,
        contactsProcessed: profiles.length,
        messagesScanned: messages.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("[learn-email-cadence] error", e);
    await admin
      .from("email_cadence_jobs")
      .update({
        status: "error",
        error_message: e?.message || String(e),
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobRow.id);
    return new Response(
      JSON.stringify({ error: e?.message || "Cadence scan failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});