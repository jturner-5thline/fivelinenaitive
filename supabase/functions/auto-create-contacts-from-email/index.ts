// Auto-create CRM contacts from recent Gmail activity for the 5th Line
// allowlist. Scheduled every 15 min via pg_cron. For each allowlisted user we
// scan `email_cache` for messages in the last 30 min, pull every external
// email address off `from_email` / `to_emails` / `cc_emails`, skip anything
// that is internal / a role-inbox / already in `contacts`, and insert a new
// contact row scoped to the owner's org. After insert we invoke
// `field-suggestion-engine` with the raw email as evidence so the approval
// queue receives a `contact_type` proposal for the reviewer.
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
// Local-part patterns that identify role / automation inboxes we should
// never turn into a CRM contact.
const ROLE_INBOX_PATTERNS = [
  /^no[-_.]?reply/i,
  /^donotreply/i,
  /^do[-_.]?not[-_.]?reply/i,
  /^notifications?$/i,
  /^notify$/i,
  /^mailer[-_.]?daemon/i,
  /^bounce/i,
  /^postmaster$/i,
  /^abuse$/i,
  /^calendar[-_.]?server/i,
  /^auto(matic)?[-_.]?reply/i,
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
  /^accounts?$/i,
  /^hr$/i,
  /^ops$/i,
  /^security$/i,
  /^feedback$/i,
  /^newsletter/i,
  /^marketing$/i,
  /^press$/i,
  /^privacy$/i,
  /^legal$/i,
];
const LOOKBACK_MINUTES = 30;

type ExtractedContact = {
  email: string;
  name: string | null;
  sourceMessageId: string;
  sourceSubject: string | null;
  sourceBody: string | null;
  sourceFrom: string | null;
};

function parseAddress(raw: unknown): { email: string; name: string | null } | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Formats: `"Name" <email@x>`, `Name <email@x>`, `email@x`
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

function isSkippableAddress(email: string): boolean {
  const [local, domain] = email.split("@");
  if (!local || !domain) return true;
  if (domain.toLowerCase() === INTERNAL_DOMAIN) return true;
  return ROLE_INBOX_PATTERNS.some((rx) => rx.test(local));
}

function splitName(full: string | null): { first: string; last: string } {
  if (!full) return { first: "", last: "" };
  const cleaned = full.replace(/\s+/g, " ").trim();
  if (!cleaned) return { first: "", last: "" };
  const parts = cleaned.split(" ");
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
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

  // Optional override for backfill.
  let lookbackMin = LOOKBACK_MINUTES;
  try {
    if (req.method === "POST") {
      const body = await req.clone().json().catch(() => null);
      if (body && Number.isFinite(body.lookback_minutes)) {
        lookbackMin = Math.max(5, Math.min(24 * 60, Number(body.lookback_minutes)));
      }
    }
  } catch (_) { /* ignore */ }

  const since = new Date(Date.now() - lookbackMin * 60_000).toISOString();

  // 1. Resolve auth user ids for the allowlist.
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

    // Owner's org.
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

    // Pull recent Gmail messages for this user.
    const { data: emails, error: emailErr } = await admin
      .from("email_cache")
      .select("gmail_message_id, subject, from_email, from_name, to_emails, cc_emails, body_text, snippet, received_at")
      .eq("user_id", userId)
      .gte("received_at", since)
      .order("received_at", { ascending: false })
      .limit(500);
    if (emailErr) {
      perUser.push({ owner: ownerEmail, error: emailErr.message });
      continue;
    }

    // Collect unique external candidates (first email wins for evidence).
    const candidates = new Map<string, ExtractedContact>();
    for (const e of emails || []) {
      const collected: Array<{ raw: string; isFrom: boolean }> = [];
      if (e.from_email) collected.push({ raw: e.from_name ? `${e.from_name} <${e.from_email}>` : e.from_email, isFrom: true });
      for (const t of Array.isArray(e.to_emails) ? e.to_emails : []) collected.push({ raw: String(t), isFrom: false });
      for (const t of Array.isArray(e.cc_emails) ? e.cc_emails : []) collected.push({ raw: String(t), isFrom: false });

      for (const c of collected) {
        const parsed = parseAddress(c.raw);
        if (!parsed) continue;
        if (parsed.email === ownerEmail) continue;
        if (isSkippableAddress(parsed.email)) continue;
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
      perUser.push({ owner: ownerEmail, scanned: (emails || []).length, created: 0 });
      continue;
    }

    // Dedupe against contacts already in this org (email or additional_emails).
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
    // Also check additional_emails matches across the org (separate pass — the
    // .or(...) above only covers `email`).
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

      const { first, last } = splitName(cand.name);
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

      if (insErr) {
        created.push({ email: cand.email, error: insErr.message });
        continue;
      }

      created.push({ email: cand.email, contact_id: inserted?.id });

      // Invoke field-suggestion-engine so a contact_type proposal lands in the
      // approval queue (best-effort, non-blocking on error).
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
      created: created.filter((c) => c.contact_id).length,
      details: created,
    });
  }

  return json({ ok: true, since, per_user: perUser });
});