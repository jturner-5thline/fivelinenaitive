// Auto-create CRM contacts from recent Gmail activity for the 5th Line
// allowlist. Scheduled every 15 min via pg_cron.
//
// STRICT REAL-PERSON FILTERING (Option 2):
//   1. Two-way interaction check — the address must have appeared as a
//      recipient of a message SENT by the owner (i.e., we've actually written
//      to this person), OR the message thread contains a reply from the
//      external address after an owner-sent message. Purely inbound blasts,
//      one-way notifications, and marketing mail never qualify.
//   2. Automated-sender exclusion — local-part role/notification patterns,
//      known automation/service domains (docs.google.com, docusign, stripe,
//      quickbooks, hubspot, mailchimp, sendgrid, etc.), and messages carrying
//      auto-response / list headers (List-Unsubscribe, Auto-Submitted,
//      Precedence: bulk) are skipped.
//   3. Display-name validation — names that look like an entity, team, bot,
//      or "(via Something)" tagline are rejected as non-personal.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INTERNAL_DOMAIN = "5thline.co";
const ALLOWED_OWNER_EMAILS = new Set<string>([
  "jturner@5thline.co",
  "nheikali@5thline.co",
  "jmoffitt@5thline.co",
  "swilliams@5thline.co",
  "ppina@5thline.co",
  "ffustinoni@5thline.co",
]);

// Local-part patterns that identify role / automation inboxes.
const ROLE_INBOX_PATTERNS = [
  /no[-_.]?reply/i,
  /donotreply/i,
  /do[-_.]?not[-_.]?reply/i,
  /^notifications?$/i,
  /^notify$/i,
  /^notification/i,
  /^mailer[-_.]?daemon/i,
  /^bounce/i,
  /^postmaster$/i,
  /^abuse$/i,
  /^calendar[-_.]?server/i,
  /auto(matic)?[-_.]?reply/i,
  /^unsubscribe/i,
  /^support$/i,
  /^help$/i,
  /^helpdesk$/i,
  /^sales$/i,
  /^info$/i,
  /^hello$/i,
  /^hi$/i,
  /^team$/i,
  /^contact$/i,
  /^admin$/i,
  /^billing$/i,
  /^invoicing?$/i,
  /^invoices?$/i,
  /^receipts?$/i,
  /^payments?$/i,
  /^accounts?$/i,
  /^accounting$/i,
  /^ar$/i,
  /^ap$/i,
  /^hr$/i,
  /^ops$/i,
  /^operations$/i,
  /^security$/i,
  /^feedback$/i,
  /^newsletter/i,
  /^news$/i,
  /^marketing$/i,
  /^press$/i,
  /^privacy$/i,
  /^legal$/i,
  /^alerts?$/i,
  /^updates?$/i,
  /^digest/i,
  /^announce/i,
  /^broadcast/i,
  /^campaign/i,
  /^comments?[-_.]?noreply/i,
  /^bot$/i,
  /[-_.]?bot$/i,
  /^system$/i,
  /^automated/i,
  /^auto[-_.]/i,
  /^scheduler/i,
  /^reminders?$/i,
  /^welcome$/i,
  /^onboarding$/i,
  /^membership$/i,
  /^subscriptions?$/i,
  /^orders?$/i,
  /^shipping$/i,
  /^tracking$/i,
  /^delivery$/i,
  /^service$/i,
  /^services$/i,
  /^webmaster$/i,
  /^root$/i,
  /^daemon$/i,
  /^mail$/i,
  /^email$/i,
  /^enquiries$/i,
  /^inquiries$/i,
  /^office$/i,
  /^events$/i,
  /^rsvp$/i,
  /^survey/i,
  /^research$/i,
  /^feedback/i,
  /^calendly$/i,
  /^chilipiper/i,
  /^zoom$/i,
  /^webinar/i,
];

// Full domains / suffixes that indicate automated / service traffic.
const AUTOMATION_DOMAINS = new Set<string>([
  "docs.google.com",
  "drive.google.com",
  "calendar.google.com",
  "accounts.google.com",
  "google.com",
  "googlemail.com",
  "mail.google.com",
  "notify.google.com",
  "docusign.net",
  "docusign.com",
  "hellosign.com",
  "pandadoc.com",
  "dropboxsign.com",
  "adobesign.com",
  "echosign.com",
  "stripe.com",
  "intuit.com",
  "quickbooks.com",
  "qbo.intuit.com",
  "bill.com",
  "hubspot.com",
  "hubspotemail.net",
  "mailchimp.com",
  "mail.mailchimp.com",
  "sendgrid.net",
  "sendgrid.com",
  "mailgun.org",
  "mailgun.net",
  "amazonses.com",
  "ses.amazonaws.com",
  "postmarkapp.com",
  "customer.io",
  "intercom-mail.com",
  "intercom.io",
  "zendesk.com",
  "salesforce.com",
  "salesloft.com",
  "outreach.io",
  "gong.io",
  "chilipiper.com",
  "calendly.com",
  "linkedin.com",
  "e.linkedin.com",
  "linkedinmail.com",
  "twitter.com",
  "x.com",
  "facebookmail.com",
  "notion.so",
  "notion.com",
  "slack.com",
  "slackmail.com",
  "asana.com",
  "atlassian.com",
  "atlassian.net",
  "jira.com",
  "monday.com",
  "airtable.com",
  "loom.com",
  "claap.io",
  "zoom.us",
  "webex.com",
  "gotomeeting.com",
  "gusto.com",
  "rippling.com",
  "bamboohr.com",
  "adp.com",
  "ramp.com",
  "brex.com",
  "mercury.com",
  "chase.com",
  "wellsfargo.com",
  "bankofamerica.com",
  "apple.com",
  "microsoft.com",
  "office.com",
  "adobe.com",
  "info.adobe.com",
  "email.adobe.com",
  "github.com",
  "gitlab.com",
  "figma.com",
  "canva.com",
  "squarespace.com",
  "wix.com",
  "shopify.com",
  "stripe.email",
  "sgcreditpartners.com",
  "totango.com",
  "producthunt.com",
  "medium.com",
  "substack.com",
  "beehiiv.com",
  "convertkit.com",
  "activecampaign.com",
  "klaviyomail.com",
  "klaviyo.com",
  "constantcontact.com",
  "getresponse.com",
  "aweber.com",
  "iterable.com",
  "braze.com",
]);

const AUTOMATION_SUBDOMAIN_HINTS = [
  "noreply.",
  "no-reply.",
  "notifications.",
  "notification.",
  "mail.",
  "email.",
  "e.",
  "news.",
  "newsletter.",
  "alerts.",
  "info.",
  "marketing.",
  "updates.",
  "campaigns.",
  "reply.",
  "auto.",
  "bot.",
];

// Display-name patterns that indicate the sender is not a person.
const NON_PERSONAL_NAME_PATTERNS = [
  /\bvia\b/i,
  /\bteam\b/i,
  /\bsupport\b/i,
  /\bnewsletter/i,
  /\bnotifications?\b/i,
  /\balerts?\b/i,
  /\bupdates?\b/i,
  /\bbilling\b/i,
  /\binvoicing?\b/i,
  /\breceipts?\b/i,
  /\bno[- ]?reply\b/i,
  /\bdo[- ]?not[- ]?reply\b/i,
  /\bbot\b/i,
  /\bautomated?\b/i,
  /\bmarketing\b/i,
  /\bcustomer success\b/i,
  /\bcustomer support\b/i,
  /\bthe\s+\w+\s+team\b/i,
  /\baccount\b/i,
  /\bwelcome\b/i,
  /\bcommunity\b/i,
  /\bhq\b/i,
  /\bcorp$/i,
  /\bllc$/i,
  /\binc$/i,
  /\btrust\s*&\s*safety/i,
];

const LOOKBACK_MINUTES = 30;

type ExtractedContact = {
  email: string;
  name: string | null;
  sourceMessageId: string;
  sourceSubject: string | null;
  sourceBody: string | null;
  sourceFrom: string | null;
  skipReason?: string;
};

function parseAddress(raw: unknown): { email: string; name: string | null } | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const angle = trimmed.match(/^(.*?)<([^>]+)>\s*$/);
  let name: string | null = null;
  let email = trimmed;
  if (angle) {
    name = angle[1].replace(/["']/g, "").trim() || null;
    email = angle[2].trim();
  }
  email = email.toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
  return { email, name };
}

function domainIsAutomated(domain: string): boolean {
  const d = domain.toLowerCase();
  if (AUTOMATION_DOMAINS.has(d)) return true;
  for (const hint of AUTOMATION_SUBDOMAIN_HINTS) {
    if (d.startsWith(hint)) return true;
  }
  // Second-level match (e.g., something.mailchimp.com).
  const parts = d.split(".");
  for (let i = 1; i < parts.length; i++) {
    if (AUTOMATION_DOMAINS.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

function isSkippableAddress(email: string): string | null {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "invalid_format";
  if (domain.toLowerCase() === INTERNAL_DOMAIN) return "internal_domain";
  if (ROLE_INBOX_PATTERNS.some((rx) => rx.test(local))) return "role_inbox";
  if (domainIsAutomated(domain)) return "automation_domain";
  // Local parts with digits-heavy hashed identifiers are almost always
  // transactional (e.g., reply+abc123@intercom-mail.com, u+7d3@notion.so).
  if (/\+/.test(local) && /\d{4,}/.test(local)) return "hashed_reply_alias";
  if (/^[a-f0-9]{16,}$/i.test(local)) return "hex_alias";
  return null;
}

function nameLooksNonPersonal(name: string | null): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (!trimmed) return false;
  return NON_PERSONAL_NAME_PATTERNS.some((rx) => rx.test(trimmed));
}

const NAME_ROLE_LOCALS = new Set([
  "info", "hello", "contact", "support", "billing", "accounts", "accounting", "marketing",
  "sales", "team", "admin", "help", "office", "operations", "payables", "receivables",
  "ap", "ar", "hr", "legal", "press", "news", "noreply", "no-reply", "service", "services",
]);

function capName(word: string): string {
  const w = word.replace(/\d+$/, "").trim();
  if (!w) return "";
  const lower = w.toLowerCase();
  if (lower.startsWith("mc") && lower.length > 2) return "Mc" + lower[2].toUpperCase() + lower.slice(3);
  if (lower.startsWith("o'") && lower.length > 2) return "O'" + lower[2].toUpperCase() + lower.slice(3);
  return lower
    .split("-")
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join("-");
}

function nameFromDisplay(raw: string | null, email: string): { first: string; last: string } | null {
  if (!raw) return null;
  let s = raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/,\s*(CFA|CPA|MBA|MD|PhD|Ph\.D\.|Esq\.?|Jr\.?|Sr\.?|CAIA|JD|III|II|IV)\b\.?/gi, "")
    .replace(/["'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s || s.includes("@") || s.toLowerCase() === email.split("@")[0]) return null;
  if (/\b(llc|inc|corp|group|bank|capital|partners|team|solutions|holdings)\b/i.test(s)) return null;
  const comma = s.match(/^([^,]+),\s*([^,]+)$/);
  if (comma) {
    const last = comma[1].trim().split(" ").map(capName).join(" ");
    const first = comma[2].trim().split(" ")[0];
    return { first: capName(first), last };
  }
  const parts = s.split(" ").filter(Boolean);
  if (parts.length === 1) return { first: capName(parts[0]), last: "" };
  const isUpperOrLower = s === s.toUpperCase() || s === s.toLowerCase();
  const fmt = (w: string) => (isUpperOrLower ? capName(w) : w);
  return { first: fmt(parts[0]), last: parts.slice(1).map(fmt).join(" ") };
}

function nameFromEmailHandle(email: string): { first: string; last: string } | null {
  const local = email.split("@")[0].toLowerCase().split("+")[0];
  if (NAME_ROLE_LOCALS.has(local)) return null;
  const tokens = local.split(/[._-]+/).map((t) => t.replace(/\d+$/, "")).filter(Boolean);
  if (tokens.length === 2 && tokens.every((t) => t.length >= 2 && /^[a-z']+$/.test(t))) {
    return { first: capName(tokens[0]), last: capName(tokens[1]) };
  }
  if (tokens.length === 3 && tokens[1].length === 1 && tokens[0].length >= 2 && tokens[2].length >= 2) {
    return { first: capName(tokens[0]), last: capName(tokens[2]) };
  }
  return null;
}

function nameFromSignature(body: string | null): { first: string; last: string } | null {
  if (!body) return null;
  const m = body.match(
    /(?:best regards|kind regards|warm regards|regards|best|thanks|thank you|sincerely|cheers)[,!.]?\s*\n+\s*([A-Z][a-z'’-]+)\s+([A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+)?)\s*(?:\n|$)/i,
  );
  if (!m) return null;
  return { first: capName(m[1]), last: m[2].split(" ").map(capName).join(" ") };
}

/** Resolve first/last using display name → signature → email handle. */
function resolveName(
  display: string | null,
  email: string,
  body: string | null,
): { first: string; last: string } {
  const d = nameFromDisplay(display, email);
  if (d && d.first && d.last) return d;
  const sig = body ? nameFromSignature(body) : null;
  const handle = nameFromEmailHandle(email);
  // Accept signature only if it agrees with the handle/display first name.
  if (sig && d?.first && sig.first.toLowerCase() === d.first.toLowerCase()) return sig;
  if (handle) return handle;
  if (sig && email.split("@")[0].toLowerCase().includes(sig.last.toLowerCase().split(" ")[0])) return sig;
  return d || { first: "", last: "" };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let lookbackMin = LOOKBACK_MINUTES;
  let dryRun = false;
  try {
    if (req.method === "POST") {
      const body = await req.clone().json().catch(() => null);
      if (body && Number.isFinite(body.lookback_minutes)) {
        lookbackMin = Math.max(5, Math.min(24 * 60 * 30, Number(body.lookback_minutes)));
      }
      if (body && body.dry_run === true) dryRun = true;
    }
  } catch (_) { /* ignore */ }

  const since = new Date(Date.now() - lookbackMin * 60_000).toISOString();

  const { data: users, error: usersErr } = await admin.auth.admin.listUsers({
    page: 1, perPage: 200,
  });
  if (usersErr) return json({ error: usersErr.message }, 500);

  const allowlistedUsers = (users?.users || []).filter((u) =>
    ALLOWED_OWNER_EMAILS.has((u.email || "").toLowerCase()),
  );

  const perUser: any[] = [];

  for (const u of allowlistedUsers) {
    const ownerEmail = (u.email || "").toLowerCase();
    const userId = u.id;

    const { data: membership } = await admin
      .from("company_members")
      .select("company_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    const orgCompanyId = membership?.company_id || null;
    if (!orgCompanyId) {
      perUser.push({ owner: ownerEmail, skipped: "no_company_membership" });
      continue;
    }

    const { data: emails, error: emailErr } = await admin
      .from("email_cache")
      .select("gmail_message_id, thread_id, subject, from_email, from_name, to_emails, cc_emails, body_text, snippet, received_at, labels")
      .eq("user_id", userId)
      .gte("received_at", since)
      .order("received_at", { ascending: false })
      .limit(1000);
    if (emailErr) {
      perUser.push({ owner: ownerEmail, error: emailErr.message });
      continue;
    }

    // Build set of addresses the owner has actively engaged with:
    //   - anyone the owner emailed (owner appears in from_email of a SENT
    //     message) — recipients are trusted
    //   - anyone whose reply landed in a thread where the owner previously
    //     sent (thread contains at least one owner-sent message)
    const engagedAddresses = new Set<string>();
    const ownerSentThreadIds = new Set<string>();

    for (const e of emails || []) {
      const fromLower = (e.from_email || "").toLowerCase();
      const labels: string[] = Array.isArray(e.labels) ? e.labels : [];
      const isSent = fromLower === ownerEmail || labels.includes("SENT");
      if (isSent) {
        if (e.thread_id) ownerSentThreadIds.add(String(e.thread_id));
        for (const t of Array.isArray(e.to_emails) ? e.to_emails : []) {
          const p = parseAddress(String(t));
          if (p) engagedAddresses.add(p.email);
        }
        for (const t of Array.isArray(e.cc_emails) ? e.cc_emails : []) {
          const p = parseAddress(String(t));
          if (p) engagedAddresses.add(p.email);
        }
      }
    }
    // Second pass: replies within owner-sent threads count as engaged too.
    for (const e of emails || []) {
      if (e.thread_id && ownerSentThreadIds.has(String(e.thread_id))) {
        const p = parseAddress(e.from_email || "");
        if (p) engagedAddresses.add(p.email);
      }
    }

    // Detect automated / bulk mail via Gmail labels + body hints.
    function messageIsAutomated(e: any): boolean {
      const labels: string[] = Array.isArray(e.labels) ? e.labels : [];
      if (labels.includes("CATEGORY_PROMOTIONS")) return true;
      if (labels.includes("CATEGORY_UPDATES")) return true;
      if (labels.includes("CATEGORY_FORUMS")) return true;
      if (labels.includes("CATEGORY_SOCIAL")) return true;
      const body = (e.body_text || e.snippet || "").toLowerCase();
      if (body.includes("unsubscribe") && body.includes("http")) return true;
      if (/view (this )?(email|message) in (your )?browser/i.test(body)) return true;
      if (/you (are )?received this (email|message) because/i.test(body)) return true;
      return false;
    }

    // Collect candidates that pass ALL real-person checks.
    const candidates = new Map<string, ExtractedContact>();
    const rejected: Record<string, number> = {};

    for (const e of emails || []) {
      if (messageIsAutomated(e)) continue;

      // Only look at inbound external senders + owner-addressed recipients
      // that the owner also engaged with.
      const collected: Array<{ raw: string; isFrom: boolean }> = [];
      if (e.from_email) collected.push({ raw: e.from_name ? `${e.from_name} <${e.from_email}>` : e.from_email, isFrom: true });
      for (const t of Array.isArray(e.to_emails) ? e.to_emails : []) collected.push({ raw: String(t), isFrom: false });
      for (const t of Array.isArray(e.cc_emails) ? e.cc_emails : []) collected.push({ raw: String(t), isFrom: false });

      for (const c of collected) {
        const parsed = parseAddress(c.raw);
        if (!parsed) continue;
        if (parsed.email === ownerEmail) continue;

        const skip = isSkippableAddress(parsed.email);
        if (skip) { rejected[skip] = (rejected[skip] || 0) + 1; continue; }

        if (nameLooksNonPersonal(parsed.name)) {
          rejected["non_personal_name"] = (rejected["non_personal_name"] || 0) + 1;
          continue;
        }

        // Two-way interaction requirement.
        if (!engagedAddresses.has(parsed.email)) {
          rejected["no_two_way_interaction"] = (rejected["no_two_way_interaction"] || 0) + 1;
          continue;
        }

        if (candidates.has(parsed.email)) continue;
        candidates.set(parsed.email, {
          email: parsed.email,
          name: parsed.name,
          sourceMessageId: e.gmail_message_id,
          sourceSubject: e.subject || null,
          sourceBody: e.body_text || e.snippet || null,
          sourceFrom: c.isFrom ? (e.from_email || null) : ownerEmail,
        });
      }
    }

    if (candidates.size === 0) {
      perUser.push({ owner: ownerEmail, scanned: (emails || []).length, created: 0, rejected });
      continue;
    }

    const emailList = Array.from(candidates.keys());
    const { data: existing } = await admin
      .from("contacts")
      .select("id, email, additional_emails")
      .eq("org_company_id", orgCompanyId)
      .or(`email.in.(${emailList.map((e) => `"${e}"`).join(",")})`);
    const knownEmails = new Set<string>();
    for (const row of existing || []) {
      if (row.email) knownEmails.add(String(row.email).toLowerCase());
      for (const a of Array.isArray(row.additional_emails) ? row.additional_emails : []) {
        if (typeof a === "string") knownEmails.add(a.toLowerCase());
      }
    }
    const { data: addlHits } = await admin
      .from("contacts")
      .select("additional_emails")
      .eq("org_company_id", orgCompanyId)
      .overlaps("additional_emails", emailList);
    for (const row of addlHits || []) {
      for (const a of Array.isArray(row.additional_emails) ? row.additional_emails : []) {
        if (typeof a === "string") knownEmails.add(a.toLowerCase());
      }
    }

    const created: any[] = [];
    for (const cand of candidates.values()) {
      if (knownEmails.has(cand.email)) continue;
      if (dryRun) { created.push({ email: cand.email, dry_run: true, name: cand.name }); continue; }

      const { first, last } = resolveName(
        cand.name,
        cand.email,
        cand.sourceFrom === cand.email ? cand.sourceBody : null,
      );
      const { data: inserted, error: insErr } = await admin
        .from("contacts")
        .insert({
          org_company_id: orgCompanyId,
          email: cand.email,
          first_name: first || null,
          last_name: last || null,
          owner_user_id: userId,
          created_by: userId,
          source_system: "gmail_auto",
          lead_source: "email",
          lead_source_original: "gmail_auto_capture",
          last_activity_date: new Date().toISOString(),
          last_inbound_activity_date: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insErr) { created.push({ email: cand.email, error: insErr.message }); continue; }
      created.push({ email: cand.email, contact_id: inserted?.id });

      try {
        await admin.functions.invoke("field-suggestion-engine", {
          body: {
            contact_id: inserted?.id,
            company_id: orgCompanyId,
            source_type: "gmail_auto_capture",
            source_id: cand.sourceMessageId,
            email_data: {
              from: cand.sourceFrom || cand.email,
              subject: cand.sourceSubject || "",
              body_text: cand.sourceBody || "",
              signature_block: "",
            },
          },
        });
      } catch (e) {
        console.error("[auto-create-contacts-from-email] suggestion invoke failed", e);
      }
    }

    perUser.push({
      owner: ownerEmail,
      scanned: (emails || []).length,
      candidates: candidates.size,
      created: created.filter((c) => c.contact_id || c.dry_run).length,
      rejected,
      details: created,
    });
  }

  return json({ ok: true, since, dry_run: dryRun, per_user: perUser });
});
