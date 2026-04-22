import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ────────────────────────────────────────────────────────────────────────────
// Generic email-domain skip list. We do NOT want public providers like
// "gmail.com" to be treated as a "company domain" worth scanning.
// ────────────────────────────────────────────────────────────────────────────
const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "outlook.com",
  "hotmail.com", "live.com", "icloud.com", "me.com", "aol.com", "msn.com",
  "protonmail.com", "proton.me", "pm.me", "mail.com", "gmx.com", "gmx.de",
  "ymail.com", "duck.com", "fastmail.com", "yandex.com",
]);

function extractDomain(email?: string | null): string | null {
  if (!email) return null;
  const m = email.toLowerCase().trim().match(/@([^>\s,]+)$/);
  return m ? m[1] : null;
}

function looksLikePublicDomain(domain: string | null): boolean {
  if (!domain) return true;
  return PUBLIC_EMAIL_DOMAINS.has(domain);
}

function deriveCompanyNameVariants(domain: string | null, summary?: string): string[] {
  const variants = new Set<string>();
  if (domain && !looksLikePublicDomain(domain)) {
    const root = domain.split(".").slice(-2, -1)[0] || domain.split(".")[0];
    if (root && root.length >= 3) variants.add(root.toLowerCase());
  }
  // Pull capitalised tokens from the meeting subject (e.g. "Printed Aerospace <> 5th Line").
  if (summary) {
    const tokens = summary
      .replace(/[<>|·•]+/g, " ")
      .split(/\s+/)
      .map((t) => t.replace(/[^a-zA-Z0-9&-]/g, ""))
      .filter((t) => t.length >= 3 && /^[A-Z]/.test(t));
    for (const t of tokens) variants.add(t.toLowerCase());
  }
  return [...variants];
}

interface EmailRecord {
  source: "inbox" | "sent";
  gmail_message_id?: string | null;
  thread_id?: string | null;
  subject?: string | null;
  from_email?: string | null;
  from_name?: string | null;
  to_emails?: string[] | null;
  snippet?: string | null;
  body_text?: string | null;
  received_at?: string | null;
}

interface RelationshipFindings {
  searched: boolean;
  reason?: string;
  attendeeMatches: Record<string, EmailRecord[]>;
  domainMatches: Record<string, EmailRecord[]>;
  nameMatches: EmailRecord[];
  lastContactByAttendee: Record<string, string | null>;
  totalDirectThreads: number;
  totalAdjacentThreads: number;
}

async function gatherRelationshipContext(opts: {
  supabaseUrl: string;
  serviceRoleKey: string;
  userJwt: string | null;
  attendees: { email?: string; name?: string }[];
  meetingSummary: string;
  organizerSelfEmail?: string | null;
}): Promise<RelationshipFindings> {
  const empty: RelationshipFindings = {
    searched: false,
    attendeeMatches: {},
    domainMatches: {},
    nameMatches: [],
    lastContactByAttendee: {},
    totalDirectThreads: 0,
    totalAdjacentThreads: 0,
  };

  if (!opts.userJwt) {
    return { ...empty, reason: "No authenticated user — relationship search skipped." };
  }
  if (!opts.supabaseUrl || !opts.serviceRoleKey) {
    return { ...empty, reason: "Backend not configured — relationship search skipped." };
  }

  // Per-request client scoped to the caller's JWT so RLS filters gmail_messages
  // / gmail_sent_messages to their own inbox.
  const supabase = createClient(opts.supabaseUrl, opts.serviceRoleKey, {
    global: { headers: { Authorization: `Bearer ${opts.userJwt}` } },
    auth: { persistSession: false },
  });

  const { data: userResp } = await supabase.auth.getUser(opts.userJwt);
  if (!userResp?.user) {
    return { ...empty, reason: "Could not resolve user from token — relationship search skipped." };
  }

  const externalAttendees = opts.attendees
    .filter((a) => a.email)
    .map((a) => ({ email: a.email!.toLowerCase().trim(), name: a.name || "" }));

  const attendeeEmails = [...new Set(externalAttendees.map((a) => a.email))];
  const candidateDomains = [
    ...new Set(
      externalAttendees
        .map((a) => extractDomain(a.email))
        .filter((d): d is string => !!d && !looksLikePublicDomain(d)),
    ),
  ];
  const nameVariants = deriveCompanyNameVariants(
    candidateDomains[0] || null,
    opts.meetingSummary,
  );

  const findings: RelationshipFindings = { ...empty, searched: true };

  const norm = (rows: any[], source: "inbox" | "sent"): EmailRecord[] =>
    (rows || []).map((r) => ({
      source,
      gmail_message_id: r.gmail_message_id ?? null,
      thread_id: r.thread_id ?? null,
      subject: r.subject ?? null,
      from_email: r.from_email ?? (source === "sent" ? opts.organizerSelfEmail || null : null),
      from_name: r.from_name ?? null,
      to_emails: r.to_emails ?? null,
      snippet: r.snippet ?? null,
      body_text: (r.body_text || "").slice(0, 800),
      received_at: r.received_at ?? r.sent_at ?? r.created_at ?? null,
    }));

  // 1. Direct attendee email matches (inbox + sent).
  for (const email of attendeeEmails) {
    const [{ data: inbox }, { data: sent }] = await Promise.all([
      supabase
        .from("gmail_messages")
        .select(
          "gmail_message_id, thread_id, subject, from_email, from_name, to_emails, snippet, body_text, received_at",
        )
        .or(`from_email.ilike.${email},to_emails.cs.{${email}}`)
        .order("received_at", { ascending: false })
        .limit(8),
      supabase
        .from("gmail_sent_messages")
        .select("gmail_message_id, subject, to_emails, body_text, sent_at, created_at")
        .contains("to_emails", [email])
        .order("sent_at", { ascending: false, nullsFirst: false })
        .limit(8),
    ]);
    const rows = [...norm(inbox || [], "inbox"), ...norm(sent || [], "sent")];
    if (rows.length) {
      findings.attendeeMatches[email] = rows.slice(0, 8);
      findings.lastContactByAttendee[email] =
        rows.map((r) => r.received_at).filter(Boolean).sort().reverse()[0] || null;
      findings.totalDirectThreads += new Set(
        rows.map((r) => r.thread_id || r.gmail_message_id),
      ).size;
    } else {
      findings.lastContactByAttendee[email] = null;
    }
  }

  // 2. Domain matches (other people at the same company).
  for (const domain of candidateDomains) {
    const pattern = `%@${domain}`;
    const { data: inbox } = await supabase
      .from("gmail_messages")
      .select(
        "gmail_message_id, thread_id, subject, from_email, from_name, to_emails, snippet, body_text, received_at",
      )
      .ilike("from_email", pattern)
      .order("received_at", { ascending: false })
      .limit(10);
    const rows = norm(inbox || [], "inbox").filter((r) => {
      const f = (r.from_email || "").toLowerCase();
      return !attendeeEmails.includes(f);
    });
    if (rows.length) {
      findings.domainMatches[domain] = rows.slice(0, 6);
      findings.totalAdjacentThreads += new Set(
        rows.map((r) => r.thread_id || r.gmail_message_id),
      ).size;
    }
  }

  // 3. Company-name variant matches in subject/body (forwarded intros, internal chatter).
  for (const variant of nameVariants) {
    const like = `%${variant}%`;
    const { data: inbox } = await supabase
      .from("gmail_messages")
      .select(
        "gmail_message_id, thread_id, subject, from_email, from_name, to_emails, snippet, body_text, received_at",
      )
      .or(`subject.ilike.${like},body_text.ilike.${like}`)
      .order("received_at", { ascending: false })
      .limit(6);
    const rows = norm(inbox || [], "inbox").filter((r) => {
      const f = (r.from_email || "").toLowerCase();
      const fromDomain = extractDomain(f);
      if (attendeeEmails.includes(f)) return false;
      if (fromDomain && candidateDomains.includes(fromDomain)) return false;
      return true;
    });
    for (const r of rows) {
      const key = r.thread_id || r.gmail_message_id;
      if (
        !findings.nameMatches.find(
          (x) => (x.thread_id || x.gmail_message_id) === key,
        )
      ) {
        findings.nameMatches.push(r);
      }
    }
  }
  findings.nameMatches = findings.nameMatches.slice(0, 6);
  findings.totalAdjacentThreads += findings.nameMatches.length;

  return findings;
}

function summariseEmailForPrompt(r: EmailRecord): string {
  const date = r.received_at
    ? new Date(r.received_at).toISOString().slice(0, 10)
    : "unknown date";
  const dir = r.source === "sent" ? "→ sent" : "← inbox";
  const from = r.from_email || (r.source === "sent" ? "(you)" : "(unknown)");
  const subj = (r.subject || "(no subject)").slice(0, 140);
  const snip = (r.snippet || r.body_text || "").replace(/\s+/g, " ").slice(0, 160);
  return `- [${date}] ${dir} from=${from} | ${subj} | ${snip}`;
}

function buildRelationshipBlock(findings: RelationshipFindings): string {
  if (!findings.searched) {
    return `RELATIONSHIP_SEARCH_STATUS: skipped\nNOTE: ${findings.reason || "No data available."}`;
  }
  const lines: string[] = [];
  lines.push("RELATIONSHIP_SEARCH_STATUS: completed");
  lines.push(`Direct threads found: ${findings.totalDirectThreads}`);
  lines.push(`Adjacent threads found: ${findings.totalAdjacentThreads}`);

  for (const [email, rows] of Object.entries(findings.attendeeMatches)) {
    lines.push("");
    lines.push(`Direct exchanges with ${email} (${rows.length}):`);
    for (const r of rows.slice(0, 5)) lines.push(summariseEmailForPrompt(r));
    const last = findings.lastContactByAttendee[email];
    if (last) {
      lines.push(`Last direct contact: ${new Date(last).toISOString().slice(0, 10)}`);
    }
  }
  const noDirect = Object.entries(findings.lastContactByAttendee)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (noDirect.length) {
    lines.push("");
    lines.push(`No prior direct exchanges with: ${noDirect.join(", ")}`);
  }
  for (const [domain, rows] of Object.entries(findings.domainMatches)) {
    lines.push("");
    lines.push(`Other contacts at @${domain} (${rows.length}):`);
    for (const r of rows.slice(0, 4)) lines.push(summariseEmailForPrompt(r));
  }
  if (findings.nameMatches.length) {
    lines.push("");
    lines.push(
      `Adjacent / forwarded threads mentioning the company (${findings.nameMatches.length}):`,
    );
    for (const r of findings.nameMatches.slice(0, 4)) {
      lines.push(summariseEmailForPrompt(r));
    }
  }
  if (
    findings.totalDirectThreads === 0 &&
    findings.totalAdjacentThreads === 0
  ) {
    lines.push("");
    lines.push("No email relationship history found across inbox or sent folders.");
  }
  return lines.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const { event } = await req.json();

    if (!event || !event.summary) {
      throw new Error("Event data with summary is required");
    }

    // Pull the calling user's JWT so we can scope email queries to them.
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    const userJwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    const attendees: { email?: string; name?: string; is_self?: boolean }[] = Array.isArray(event.attendees)
      ? event.attendees
      : [];
    const externalAttendees = attendees.filter((a) => !a.is_self);
    const selfEmail = attendees.find((a) => a.is_self)?.email || null;

    let relationship: RelationshipFindings;
    try {
      relationship = await gatherRelationshipContext({
        supabaseUrl: SUPABASE_URL,
        serviceRoleKey: SERVICE_ROLE,
        userJwt,
        attendees: externalAttendees,
        meetingSummary: event.summary || "",
        organizerSelfEmail: selfEmail,
      });
    } catch (relErr) {
      console.error("Relationship search failed:", relErr);
      relationship = {
        searched: false,
        reason:
          "Relationship search failed: " +
          (relErr instanceof Error ? relErr.message : "unknown"),
        attendeeMatches: {},
        domainMatches: {},
        nameMatches: [],
        lastContactByAttendee: {},
        totalDirectThreads: 0,
        totalAdjacentThreads: 0,
      };
    }

    const relationshipBlock = buildRelationshipBlock(relationship);

    const eventStr = JSON.stringify(event).slice(0, 5000);

    const systemPrompt = `You are an elite deal intelligence analyst for an investment banking / debt advisory team. When given a calendar event AND a structured block of confirmed email-history facts, you produce a comprehensive pre-meeting intelligence briefing. You must be specific, actionable, and authoritative.

CRITICAL SOURCING RULES:
- The block labelled EMAIL_RELATIONSHIP_FACTS contains CONFIRMED facts pulled directly from the user's connected email (inbox + sent). Treat every line in that block as verified ground truth.
- Anything not in that block — company background, attendee bios, market context, racing dynamics — is INFERRED from public/web research and must be labelled as such ("Likely:" / "Estimated:" / "Inferred from web:").
- Never invent prior email history. If EMAIL_RELATIONSHIP_FACTS says "No email relationship history found", the Relationship Context section MUST say exactly: "No email relationship history found." Do NOT hallucinate intros, threads, or last-contact dates.
- When EMAIL_RELATIONSHIP_FACTS contains entries, the Relationship Context section MUST cite specific dates, sender names, or thread subjects verbatim from those entries.

Your briefing MUST include these sections using markdown:

## 🏢 Company Overview
- What the company does, industry, stage, key products/services
- Founded year, HQ location, employee count (estimate if needed)
- Recent news, funding rounds, or notable events
- Website and LinkedIn presence

## 👥 Key People on the Call
For each attendee:
- Name, title/role (infer from email domain + context)
- LinkedIn profile summary (role, background, notable experience)
- How they likely connect to the deal or relationship

## 📨 Relationship Context (from your email history)
Render this section using ONLY the EMAIL_RELATIONSHIP_FACTS block. Use these exact bullet labels:
- **Intro Source:** Who appears to have introduced you (cite the sender + date), or "Not detected in email."
- **Prior Exchanges:** Per attendee, e.g. "2 direct threads with Jeff McAllister (last Mar 14)", or "No prior direct exchanges with <email>."
- **Last Contact Date:** Most recent direct exchange date per attendee.
- **Related Threads:** 1–3 most relevant thread subjects with dates.
- **Internal Team Involvement:** Colleagues on your side who participated (visible in to/cc lines), if detectable.
- **Open Follow-Ups:** Any unanswered asks or commitments visible in the most recent threads.
If the EMAIL_RELATIONSHIP_FACTS block is empty or says "No email relationship history found", this entire section MUST read: "No email relationship history found."

## 🤝 Inferred Connection & Referral Path (from web/research)
- Likely referral chain or warm-intro path NOT visible in email (label clearly as inferred).
- Shared connections or mutual contacts implied by LinkedIn / company affiliations.
- Relationship strength assessment based on combined email + web evidence.

## 💬 Conversation Context & Racing Threads
- What stage this deal/relationship is likely at
- Key topics that are probably being discussed
- Competitive dynamics: other advisors, lenders, or parties that may be pursuing this deal
- Time-sensitive elements or deadlines
- Leverage points and potential objections

## 📋 Suggested Prep & Talking Points
- 3-5 specific talking points tailored to this meeting
- Questions to ask
- Documents or data to have ready
- Follow-up actions to plan

Be detailed but concise. Use bullet points. If you must speculate, label it as "Likely:" or "Estimated:". Total response under 900 words.`;

    const userPrompt = `Research and prepare an intelligence briefing for this calendar event.

CALENDAR_EVENT (JSON):
${eventStr}

EMAIL_RELATIONSHIP_FACTS (verified ground truth — confirmed facts from the user's connected inbox + sent folder):
${relationshipBlock}

The user is a deal professional at a debt advisory firm (5th Line Capital). Use EMAIL_RELATIONSHIP_FACTS verbatim for the "Relationship Context" section. Use web/public research for the other sections — but clearly label inferred items.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI service error");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "No research available.";

    return new Response(
      JSON.stringify({
        result: content,
        relationship: {
          searched: relationship.searched,
          reason: relationship.reason || null,
          directThreadCount: relationship.totalDirectThreads,
          adjacentThreadCount: relationship.totalAdjacentThreads,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("calendar-event-research error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
