import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const INTERNAL_DOMAINS = new Set(["5thline.co", "naitive.co", "5l.co"]);
// Only these team calendars are authoritative for the referral-source metric.
// Match both email aliases and display names because older grants do not always
// have a corresponding profile email.
const ALLOWED_OWNER_EMAILS = new Set([
  "ffustinoni@5thline.co",
  "jmoffitt@5thline.co",
  "jturner@5thline.co",
  "nheikali@5thline.co",
  "ppina@5thline.co",
  "swilliams@5thline.co",
  "klawless@5thline.co",
  "klawless@naitive.co",
]);
const ALLOWED_OWNER_NAMES = new Set([
  "flor fustinoni",
  "john moffitt",
  "james turner",
  "niki heikali",
  "paz pina",
  "scott williams",
  "klawless",
]);
// Explicitly excluded calendar owners (local-part of email or display name)
const BLOCKED_OWNER_LOCALPARTS = new Set([
  "abranch",
  "aschiff",
  "cminaldi",
  "crichardson",
  "jraskin",
  "jrivera",
  "sbhangale",
  "kandil",
  "mckenzie.clark",
  "mclark",
]);
const BLOCKED_OWNER_NAMES = new Set([
  "chandler minaldi",
  "mckenzie clark",
]);
const localPartOf = (email?: string | null) => {
  const value = String(email || "").trim().toLowerCase();
  const at = value.lastIndexOf("@");
  return at > 0 ? value.slice(0, at) : value;
};

const NYLAS_API_KEY = Deno.env.get("NYLAS_API_KEY");
const NYLAS_API_URI = "https://api.us.nylas.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

function domainOf(email?: string | null): string | null {
  const value = String(email || "").trim().toLowerCase();
  const at = value.lastIndexOf("@");
  return at > 0 ? value.slice(at + 1).replace(/^www\./, "") : null;
}

function normalizeOwnerName(value?: string | null): string {
  return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeTitle(value?: string | null): string {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleTokens(value: string): Set<string> {
  return new Set(value.split(" ").filter((token) => token.length > 1));
}

function tokenSimilarity(left: string, right: string): number {
  const a = titleTokens(left);
  const b = titleTokens(right);
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const token of a) if (b.has(token)) common += 1;
  return (2 * common) / (a.size + b.size);
}

async function stableUuid(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function eventTimes(event: any): { start: string | null; end: string | null } {
  const when = event?.when || {};
  return {
    start: when.start_time ? new Date(Number(when.start_time) * 1000).toISOString() : (when.start_date || null),
    end: when.end_time ? new Date(Number(when.end_time) * 1000).toISOString() : (when.end_date || null),
  };
}

async function fetchCalendars(grantId: string): Promise<any[]> {
  const response = await fetch(`${NYLAS_API_URI}/v3/grants/${grantId}/calendars`, {
    headers: { Authorization: `Bearer ${NYLAS_API_KEY}`, Accept: "application/json" },
  });
  if (!response.ok) return [{ id: "primary", name: "Primary" }];
  const payload = await response.json();
  const calendars = Array.isArray(payload?.data) ? payload.data : [];
  return calendars.length ? calendars : [{ id: "primary", name: "Primary" }];
}

async function fetchGrantEvents(
  grantId: string,
  user: { id: string; email: string | null; name: string | null },
  startUnix: number,
  endUnix: number,
): Promise<any[]> {
  const calendars = await fetchCalendars(grantId);
  const userEmail = (user.email || "").toLowerCase();
  const prioritized = calendars.filter((calendar: any, index: number) => {
    const id = String(calendar?.id || "").toLowerCase();
    const name = String(calendar?.name || "").toLowerCase();
    return index === 0 || id === "primary" || (!!userEmail && (id === userEmail || name === userEmail || id.includes(userEmail)));
  });
  const selectedCalendars = prioritized.length ? prioritized : calendars;
  const results: any[] = [];

  for (const calendar of selectedCalendars) {
    let cursor: string | null = null;
    for (let page = 0; page < 10; page += 1) {
      const url = new URL(`${NYLAS_API_URI}/v3/grants/${grantId}/events`);
      url.searchParams.set("calendar_id", String(calendar.id));
      url.searchParams.set("start", String(startUnix));
      url.searchParams.set("end", String(endUnix));
      url.searchParams.set("limit", "200");
      url.searchParams.set("expand_recurring", "true");
      if (cursor) url.searchParams.set("page_token", cursor);
      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${NYLAS_API_KEY}`, Accept: "application/json" },
      });
      if (!response.ok) break;
      const payload = await response.json();
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      for (const event of rows) {
        if (!event?.id || event.status === "cancelled") continue;
        const rawTitle = String(event.title || "").trim().toLowerCase();
        // Exclude personal hold/block events
        if (rawTitle === "block" || rawTitle === "blocked") continue;
        const times = eventTimes(event);
        const attendees = (event.participants || event.attendees || [])
          .map((person: any) => ({
            email: person?.email || null,
            display_name: person?.name || person?.display_name || null,
            response_status: person?.status || null,
          }))
          .filter((person: any) => person.email || person.display_name);
        // Exclude solo/no-attendee events (holds, focus time, personal blocks)
        if (attendees.length === 0) continue;
        results.push({

          source_id: String(event.id),
          ical_uid: event.ical_uid || event.master_event_id || null,
          calendar_id: String(calendar.id),
          calendar_name: calendar.name || null,
          title: event.title || "(No title)",
          description: event.description || null,
          start: times.start,
          end: times.end,
          html_link: event.html_link || null,
          hangout_link: event.conferencing?.details?.url || null,
          attendees,
          organizer_email: event.organizer_email || user.email || null,
          owner_user_id: user.id,
          owner_email: user.email,
          owner_name: user.name,
        });
      }
      cursor = payload?.next_cursor || payload?.next_page_token || null;
      if (!cursor || rows.length === 0) break;
    }
  }
  return results;
}

interface ClaapRow {
  id: string;
  title: string | null;
  started_at: string | null;
  recording_url: string | null;
  transcript: string | null;
  matched_contact_id: string | null;
  matched_crm_company_id: string | null;
  organizer_email: string | null;
}

function matchClaap(event: any, byTitle: Map<string, ClaapRow[]>): ClaapRow | null {
  const normalized = normalizeTitle(event.title);
  if (!normalized) return null;
  const candidates = byTitle.get(normalized) || [];
  const eventTime = event.start ? new Date(event.start).getTime() : 0;
  const inWindow = (row: ClaapRow) => {
    if (!eventTime || !row.started_at) return true;
    return Math.abs(new Date(row.started_at).getTime() - eventTime) <= 6 * 60 * 60 * 1000;
  };
  const exact = candidates.filter(inWindow).sort((a, b) =>
    Math.abs(new Date(a.started_at || 0).getTime() - eventTime) - Math.abs(new Date(b.started_at || 0).getTime() - eventTime),
  )[0];
  if (exact) return exact;

  // Calendar titles occasionally gain a suffix or change a separator. Only
  // use fuzzy matching when the title is sufficiently specific and the call
  // happened on the same day, to avoid linking unrelated calls.
  if (normalized.length < 8) return null;
  let best: { row: ClaapRow; score: number; distance: number } | null = null;
  for (const rows of byTitle.values()) {
    for (const row of rows) {
      if (!row.started_at || !eventTime) continue;
      const distance = Math.abs(new Date(row.started_at).getTime() - eventTime);
      if (distance > 24 * 60 * 60 * 1000) continue;
      const score = tokenSimilarity(normalized, normalizeTitle(row.title));
      if (score >= 0.8 && (!best || score > best.score || (score === best.score && distance < best.distance))) {
        best = { row, score, distance };
      }
    }
  }
  return best?.row || null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!NYLAS_API_KEY) return json({ error: "Calendar integration is not configured" }, 500);
    const authorization = req.headers.get("Authorization");
    if (!authorization) return json({ error: "No authorization header" }, 401);
    const token = authorization.replace(/^Bearer\s+/i, "");
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Invalid token" }, 401);

    const body = await req.json().catch(() => ({}));
    const start = new Date(body.time_min);
    const end = new Date(body.time_max);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
      return json({ error: "time_min and time_max must be valid, ordered dates" }, 400);
    }
    const { data: memberships, error: membershipError } = await admin
      .from("company_members").select("company_id").eq("user_id", userData.user.id);
    if (membershipError) throw membershipError;
    const memberCompanyIds = (memberships || []).map((row: any) => row.company_id).filter(Boolean);
    const requestedCompanyId = typeof body.company_id === "string" ? body.company_id : null;
    const companyId = requestedCompanyId && memberCompanyIds.includes(requestedCompanyId)
      ? requestedCompanyId
      : memberCompanyIds[0];
    if (!companyId) return json({ events: [], users: 0 });

    const { data: members, error: membersError } = await admin
      .from("company_members").select("user_id").eq("company_id", companyId);
    if (membersError) throw membersError;
    const userIds = Array.from(new Set((members || []).map((row: any) => row.user_id).filter(Boolean)));
    const [{ data: profiles }, { data: grants }] = await Promise.all([
      admin.from("profiles").select("user_id, email, display_name, full_name").in("user_id", userIds),
      admin.from("gmail_tokens").select("user_id, grant_id, email_address").in("user_id", userIds),
    ]);
    const profileById = new Map<string, any>((profiles || []).map((profile: any) => [profile.user_id, profile]));
    const grantRows = (grants || []).filter((row: any) => {
      if (!row.grant_id || row.grant_id === "demo-seed") return false;
      const profile = profileById.get(row.user_id) || {};
      const emails = [profile.email, row.email_address]
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean);
      const names = [profile.display_name, profile.full_name]
        .map((value) => normalizeOwnerName(value))
        .filter(Boolean);
      if (emails.some((email) => BLOCKED_OWNER_LOCALPARTS.has(localPartOf(email)))) return false;
      if (names.some((name) => BLOCKED_OWNER_NAMES.has(name))) return false;
      return emails.some((email) => ALLOWED_OWNER_EMAILS.has(email))
        || names.some((name) => ALLOWED_OWNER_NAMES.has(name));

    });
    const uniqueGrants = Array.from(new Map(grantRows.map((row: any) => [row.grant_id, row])).values());
    const startUnix = Math.floor(start.getTime() / 1000);
    const endUnix = Math.floor(end.getTime() / 1000);
    const calendarPages = await Promise.all(uniqueGrants.map(async (grant: any) => {
      const profile = profileById.get(grant.user_id) || {};
      const user = {
        id: grant.user_id,
        email: profile.email || grant.email_address || null,
        name: profile.display_name || profile.full_name || grant.email_address || null,
      };
      try { return await fetchGrantEvents(grant.grant_id, user, startUnix, endUnix); }
      catch (error) {
        console.warn("[calendar-meetings-all] calendar read failed", grant.user_id, error instanceof Error ? error.message : error);
        return [];
      }
    }));

    const merged = new Map<string, any>();
    for (const event of calendarPages.flat()) {
      const key = event.ical_uid
        ? `uid:${event.ical_uid}`
        : `event:${normalizeTitle(event.title)}|${event.start || ""}|${event.end || ""}`;
      const current = merged.get(key);
      if (!current) {
        merged.set(key, {
          ...event,
          source_key: key,
          attendees: [...event.attendees],
          owner_emails: event.owner_email ? [event.owner_email] : [],
          internal_emails: [
            ...event.attendees
              .map((person: any) => String(person.email || "").trim().toLowerCase())
              .filter((email: string) => INTERNAL_DOMAINS.has(domainOf(email) || "")),
            ...(event.owner_email && INTERNAL_DOMAINS.has(domainOf(event.owner_email) || "")
              ? [event.owner_email.toLowerCase()]
              : []),
          ],
        });
      } else {
        const emails = new Set(current.attendees.map((person: any) => String(person.email || "").toLowerCase()));
        for (const person of event.attendees) {
          const email = String(person.email || "").toLowerCase();
          if (email && !emails.has(email)) { current.attendees.push(person); emails.add(email); }
        }
        if (event.owner_email && !current.owner_emails.includes(event.owner_email)) current.owner_emails.push(event.owner_email);
        if (event.owner_email && INTERNAL_DOMAINS.has(domainOf(event.owner_email) || "") && !current.internal_emails.includes(event.owner_email.toLowerCase())) current.internal_emails.push(event.owner_email.toLowerCase());
        for (const person of event.attendees) {
          const email = String(person.email || "").trim().toLowerCase();
          if (email && INTERNAL_DOMAINS.has(domainOf(email) || "") && !current.internal_emails.includes(email)) current.internal_emails.push(email);
        }
      }
    }

    const { data: claapRows, error: claapError } = await admin
      .from("claap_meetings")
      .select("id, title, started_at, recording_url, transcript, matched_contact_id, matched_crm_company_id, organizer_email")
      .eq("company_id", companyId)
      .gte("started_at", new Date(start.getTime() - 24 * 60 * 60 * 1000).toISOString())
      .lte("started_at", new Date(end.getTime() + 24 * 60 * 60 * 1000).toISOString())
      .limit(5000);
    if (claapError) throw claapError;
    const byTitle = new Map<string, ClaapRow[]>();
    for (const row of (claapRows || []) as ClaapRow[]) {
      const key = normalizeTitle(row.title);
      if (!key) continue;
      const rows = byTitle.get(key) || [];
      rows.push(row);
      byTitle.set(key, rows);
    }

    // ---- Client exclusions: deals in any pipeline (name in title, or client contact email/domain) ----
    const GENERIC_DOMAINS = new Set([
      "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com",
      "me.com", "msn.com", "live.com", "proton.me", "protonmail.com", "comcast.net",
    ]);
    const clientDomains = new Set<string>();
    const clientEmails = new Set<string>();
    const dealNameTitles: string[] = [];
    const addClientEmail = (value?: string | null) => {
      const email = String(value || "").trim().toLowerCase();
      if (!email.includes("@")) return;
      const domain = domainOf(email);
      if (!domain) return;
      if (INTERNAL_DOMAINS.has(domain)) return;
      clientEmails.add(email);
      if (!GENERIC_DOMAINS.has(domain)) clientDomains.add(domain);
    };
    const addClientDomainFromUrl = (value?: string | null) => {
      const raw = String(value || "").trim().toLowerCase();
      if (!raw) return;
      const host = raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
      if (!host || !host.includes(".")) return;
      if (INTERNAL_DOMAINS.has(host) || GENERIC_DOMAINS.has(host)) return;
      clientDomains.add(host);
    };
    // PostgREST caps one request at 1000 rows, so page through every deal.
    const dealRows: any[] = [];
    for (let page = 0; page < 20; page += 1) {
      const from = page * 1000;
      const { data: chunk } = await admin
        .from("deals")
        .select("id, company, company_url, contact_email, crm_company_id")
        .eq("company_id", companyId)
        .range(from, from + 999);
      if (!chunk || chunk.length === 0) break;
      dealRows.push(...(chunk as any[]));
      if (chunk.length < 1000) break;
    }
    const GENERIC_NAME_TOKENS = new Set([
      "the", "and", "group", "capital", "fund", "funds", "funding", "partners", "partner",
      "holdings", "holding", "company", "co", "corp", "corporation", "inc", "llc", "lp", "llp",
      "ltd", "limited", "media", "ventures", "venture", "management", "advisors", "advisory",
      "solutions", "services", "systems", "technologies", "technology", "labs", "global",
      "international", "industries", "enterprises", "brands", "financial", "finance", "bank",
      "health", "digital", "studio", "studios", "project", "projects", "sync", "review",
    ]);
    const dealIds: string[] = [];
    const crmCompanyIds = new Set<string>();
    const linkedContactIds = new Set<string>();
    const associationCompanyIds = new Set<string>();
    const addContactDetails = (row: any) => {
      addClientEmail(row.email);
      for (const extra of row.additional_emails || []) addClientEmail(extra);
      addClientDomainFromUrl(row.website_url);
      if (row.crm_company_id) crmCompanyIds.add(row.crm_company_id);
    };
    for (const deal of dealRows) {
      dealIds.push(deal.id);
      if (deal.crm_company_id) crmCompanyIds.add(deal.crm_company_id);
      // Deal names are often "Client-Project"; invites usually mention only the
      // client part, so index the full name, the leading segment, and the
      // distinctive first word ("Microvi", "ODK").
      const raw = String(deal.company || "");
      const full = normalizeTitle(raw);
      if (full.replace(/\s/g, "").length >= 4) dealNameTitles.push(full);
      const lead = normalizeTitle(raw.split(/[-–—/|:,]/)[0] || "");
      if (lead && lead !== full && lead.replace(/\s/g, "").length >= 6) dealNameTitles.push(lead);
      const leadToken = (lead || full).split(" ").filter(Boolean)[0] || "";
      if (leadToken.length >= 3 && !GENERIC_NAME_TOKENS.has(leadToken)) dealNameTitles.push(leadToken);
      addClientDomainFromUrl(deal.company_url);
      addClientEmail(deal.contact_email);
    }

    // Resolve all deal contacts in pages, then follow their explicit company
    // associations. This catches an affiliated attendee who is not itself in
    // contact_deals but belongs to the same client company.
    for (let i = 0; i < dealIds.length; i += 500) {
      const { data: links } = await admin
        .from("contact_deals").select("contact_id").in("deal_id", dealIds.slice(i, i + 500));
      for (const link of (links || []) as any[]) if (link.contact_id) linkedContactIds.add(link.contact_id);
    }
    const linkedIds = Array.from(linkedContactIds);
    for (let i = 0; i < linkedIds.length; i += 500) {
      const slice = linkedIds.slice(i, i + 500);
      const [{ data: contactRows }, { data: associations }] = await Promise.all([
        admin.from("contacts").select("email, additional_emails, website_url, crm_company_id").in("id", slice),
        admin.from("contact_company_associations").select("company_id").in("contact_id", slice),
      ]);
      for (const row of (contactRows || []) as any[]) addContactDetails(row);
      for (const association of (associations || []) as any[]) {
        if (association.company_id) associationCompanyIds.add(association.company_id);
      }
    }
    const associatedContactIds = new Set<string>();
    const associationCompanies = Array.from(associationCompanyIds);
    for (let i = 0; i < associationCompanies.length; i += 500) {
      const { data: associations } = await admin
        .from("contact_company_associations").select("contact_id").in("company_id", associationCompanies.slice(i, i + 500));
      for (const association of (associations || []) as any[]) {
        if (association.contact_id) associatedContactIds.add(association.contact_id);
      }
    }
    const affiliatedIds = Array.from(associatedContactIds).filter((id) => !linkedContactIds.has(id));
    for (let i = 0; i < affiliatedIds.length; i += 500) {
      const { data: contactRows } = await admin
        .from("contacts").select("email, additional_emails, website_url, crm_company_id").in("id", affiliatedIds.slice(i, i + 500));
      for (const row of (contactRows || []) as any[]) addContactDetails(row);
    }

    const uniqueCrmIds = Array.from(crmCompanyIds);
    for (let i = 0; i < uniqueCrmIds.length; i += 500) {
      const slice = uniqueCrmIds.slice(i, i + 500);
      const { data: companyRows } = await admin
        .from("crm_companies")
        .select("website_url, domain, domain_normalized, additional_domains, main_contact_email")
        .in("id", slice);
      for (const row of (companyRows || []) as any[]) {
        addClientDomainFromUrl(row.website_url);
        addClientDomainFromUrl(row.domain);
        addClientDomainFromUrl(row.domain_normalized);
        for (const extra of row.additional_domains || []) addClientDomainFromUrl(extra);
        addClientEmail(row.main_contact_email);
      }
      const { data: companyContacts } = await admin
        .from("contacts").select("email, additional_emails, website_url").in("crm_company_id", slice);
      for (const row of (companyContacts || []) as any[]) {
        addClientEmail(row.email);
        for (const extra of row.additional_emails || []) addClientEmail(extra);
        addClientDomainFromUrl(row.website_url);
      }
    }
    const titleMatchesDeal = (title?: string | null) => {
      const normalized = normalizeTitle(title);
      if (!normalized) return false;
      const padded = ` ${normalized} `;
      return dealNameTitles.some((name) => padded.includes(` ${name} `));
    };
    const isClientEvent = (event: any) => {
      if (titleMatchesDeal(event.title)) return true;
      const people = [
        ...(event.attendees || []).map((person: any) => person?.email),
        event.organizer_email,
      ];
      for (const value of people) {
        const email = String(value || "").trim().toLowerCase();
        if (!email) continue;
        if (clientEmails.has(email)) return true;
        const domain = domainOf(email);
        if (domain && clientDomains.has(domain)) return true;
      }
      return false;
    };

    const isBlockedPerson = (email?: string | null) =>
      BLOCKED_OWNER_LOCALPARTS.has(localPartOf(email));
    const mergedEvents = Array.from(merged.values()).filter((event: any) => {
      // Drop anything organized by an excluded calendar owner, and anything whose
      // only internal participants are excluded people.
      if (isBlockedPerson(event.organizer_email)) return false;
      if ((event.owner_emails || []).length > 0
        && (event.owner_emails || []).every((email: string) => isBlockedPerson(email))) return false;
      const internal = (event.internal_emails || []) as string[];
      if (internal.length > 0 && internal.every((email) => isBlockedPerson(email))) return false;
      // Drop internal-only meetings (every attendee is on an internal domain).
      const domains = (event.attendees || [])
        .map((person: any) => domainOf(person?.email))
        .filter(Boolean) as string[];
      if (domains.length > 0 && domains.every((domain) => INTERNAL_DOMAINS.has(domain))) return false;
      // Drop client calls (deal name in the title, or a client contact/domain attending).
      if (isClientEvent(event)) return false;
      return true;

    });

    const events = await Promise.all(mergedEvents.map(async (event) => {
      const claap = matchClaap(event, byTitle);

      return {
        id: claap?.id || await stableUuid(`${companyId}|${event.source_key}`),
        calendar_event_id: event.source_id,
        title: event.title,
        start: event.start,
        end: event.end,
        description: event.description,
        html_link: event.html_link,
        hangout_link: event.hangout_link,
        attendees: event.attendees,
        attendee_domains: Array.from(new Set(event.attendees.map((person: any) => domainOf(person.email)).filter(Boolean))),
        internal_emails: Array.from(new Set(event.internal_emails)),
        organizer_email: event.organizer_email,
        owner_emails: event.owner_emails,
        claap_meeting_id: claap?.id || null,
        claap_title: claap?.title || null,
        recording_url: claap?.recording_url || null,
        transcript: claap?.transcript || null,
        transcript_available: !!claap?.transcript,
        matched_contact_id: claap?.matched_contact_id || null,
        matched_crm_company_id: claap?.matched_crm_company_id || null,
        claap_started_at: claap?.started_at || null,
      };
    }));
    events.sort((a, b) => String(a.start || "").localeCompare(String(b.start || "")));
    return json({ events, users: uniqueGrants.length, source: "google_calendar", claap_matches: events.filter((event) => event.claap_meeting_id).length });
  } catch (error) {
    console.error("[calendar-meetings-all] error", error);
    return json({ error: error instanceof Error ? error.message : "Internal error" }, 500);
  }
});
