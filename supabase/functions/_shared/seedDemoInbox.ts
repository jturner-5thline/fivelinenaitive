// Deterministic, idempotent demo inbox seeder.
//
// Generates a fake but internally-consistent mailbox for a demo workspace
// (threads + messages tied to seeded contacts / deals / lenders / tasks /
// calendar events) and also installs a sentinel `gmail_tokens` row so the
// rest of the app sees the user as "mail connected" without any real
// Google/Microsoft OAuth.
//
// Every row carries `is_demo_seed = true` and a stable `seed_key`, and all
// inserts use upsert-on-conflict so reprovision / repair is safe to run
// repeatedly.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export interface SeedDemoInboxInput {
  admin: Admin;
  userId: string;
  userEmail: string;
  userDisplayName?: string;
  companyId: string;
  contacts: Array<{ id: string; first_name?: string | null; last_name?: string | null; email?: string | null; job_title?: string | null; crm_company_name?: string | null }>;
  deals: Array<{ id: string; company: string; stage?: string | null }>;
  lenders: Array<{ id?: string; deal_id?: string; name: string }>;
  tasks?: Array<{ id?: string; title?: string | null; deal_id?: string | null }>;
  calendarEvents?: Array<{ id?: string; title?: string | null; starts_at?: string | null }>;
}

export interface SeedDemoInboxResult {
  threads: number;
  messages: number;
  linkedContacts: number;
  linkedDeals: number;
  linkedLenders: number;
  linkedTasks: number;
  linkedCalendarEvents: number;
}

const DEMO_GRANT = "demo-seed";
const SEED_VERSION = "v1";

function minutesAgo(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString();
}
function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 60 * 60_000).toISOString();
}
function daysAgo(d: number): string {
  return new Date(Date.now() - d * 24 * 60 * 60_000).toISOString();
}

function senderFromContact(c: SeedDemoInboxInput["contacts"][number]) {
  const first = c.first_name?.trim() || "Avery";
  const last = c.last_name?.trim() || "Walker";
  const email = c.email?.trim() || `${first.toLowerCase()}.${last.toLowerCase()}@example.com`;
  return { name: `${first} ${last}`, email };
}

function lenderSender(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || "lender";
  // Pick a contact name deterministically from the lender label.
  const first = ["Mark", "Jennifer", "David", "Sarah", "Robert", "Amanda", "Chris", "Lisa", "Thomas", "Karen"][slug.length % 10];
  const last = ["Sullivan", "Park", "Chen", "Kim", "Martinez", "Torres", "Johnson", "Wang", "Wright", "Foster"][slug.length % 10];
  return { name: `${first} ${last}`, email: `${first.toLowerCase()}.${last.toLowerCase()}@${slug}.com` };
}

interface DraftMessage {
  scenario: string;
  idx: number;
  thread_id: string;
  subject: string;
  from_name: string;
  from_email: string;
  to_emails: string[];
  snippet: string;
  body_text: string;
  is_read: boolean;
  is_starred: boolean;
  labels: string[];
  received_at: string;
  has_attachments?: boolean;
  attachments?: Array<{ filename: string; content_type: string; size: number }>;
  // optional links
  deal_id?: string | null;
}

function buildScenarios(input: SeedDemoInboxInput): DraftMessage[] {
  const me = input.userEmail;
  const meName = input.userDisplayName || "Demo User";
  const contacts = input.contacts.slice(0, 8);
  const deals = input.deals.slice(0, 5);
  const lenders = input.lenders.slice(0, 5);
  const tasks = (input.tasks || []).slice(0, 3);
  const cals = (input.calendarEvents || []).slice(0, 2);

  const messages: DraftMessage[] = [];

  // ---- Pinned-fresh: client CFO sending Q4 financials ----
  if (contacts[0] && deals[0]) {
    const c = senderFromContact(contacts[0]);
    const subj = `${deals[0].company} – Q4 financials, AR aging & cap table for the data room`;
    const tid = `demo/client-financials/${deals[0].id}`;
    messages.push({
      scenario: "client-financials", idx: 0, thread_id: tid, subject: subj,
      from_name: c.name, from_email: c.email, to_emails: [me],
      snippet: `Hi ${meName.split(" ")[0]} — sending over the Q4 materials we promised for the data room: financials, AR aging, customer concentration and cap table.`,
      body_text: `Hi ${meName.split(" ")[0]},\n\nAs discussed, attached are the materials for the ${deals[0].company} data room:\n\n  • Q4 audited financial statements\n  • AR aging report\n  • Top-25 customer concentration\n  • Updated cap table\n  • Management org chart\n\nLet me know if anything else is missing before next week's lender calls.\n\nThanks,\n${c.name}`,
      is_read: false, is_starred: true, labels: ["INBOX", "IMPORTANT"],
      received_at: minutesAgo(4), has_attachments: true,
      attachments: [
        { filename: `${deals[0].company.replace(/\s+/g, "")}_Q4_Financials.pdf`, content_type: "application/pdf", size: 1_843_211 },
        { filename: `${deals[0].company.replace(/\s+/g, "")}_AR_Aging.xlsx`, content_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: 412_980 },
      ],
      deal_id: deals[0].id,
    });
  }

  // ---- Pinned-fresh: lender term sheet ----
  if (lenders[0] && deals[Math.min(1, deals.length - 1)]) {
    const deal = deals[Math.min(1, deals.length - 1)];
    const s = lenderSender(lenders[0].name);
    const tid = `demo/lender-term-sheet/${deal.id}/${lenders[0].name}`;
    messages.push({
      scenario: "lender-term-sheet", idx: 0, thread_id: tid,
      subject: `${deal.company} – Indicative term sheet from ${lenders[0].name}`,
      from_name: s.name, from_email: s.email, to_emails: [me],
      snippet: `Pleased to share our indicative term sheet for ${deal.company}. Headline: $${(((deal as any).value ?? 12_000_000) / 1e6).toFixed(1)}M senior secured, 5yr, SOFR + 650bps.`,
      body_text: `${meName.split(" ")[0]},\n\nAttached please find our indicative term sheet for ${deal.company}. Headline terms:\n\n  • Facility: $12M senior secured\n  • Tenor: 5 years, 12mo IO\n  • Pricing: SOFR + 650bps\n  • Covenants: customary, max leverage 3.5x\n\nHappy to walk through on a call this week.\n\nBest,\n${s.name}\n${lenders[0].name}`,
      is_read: false, is_starred: true, labels: ["INBOX", "IMPORTANT"],
      received_at: minutesAgo(7), has_attachments: true,
      attachments: [
        { filename: `${lenders[0].name.replace(/\s+/g, "")}_TermSheet_v1.pdf`, content_type: "application/pdf", size: 612_300 },
      ],
      deal_id: deal.id,
    });
  }

  // ---- Lender Q&A follow-ups (2 lenders × 2 messages each) ----
  for (let i = 1; i < Math.min(3, lenders.length); i++) {
    const deal = deals[i % deals.length];
    if (!deal) continue;
    const s = lenderSender(lenders[i].name);
    const tid = `demo/lender-qa/${deal.id}/${lenders[i].name}`;
    messages.push({
      scenario: "lender-qa", idx: 0, thread_id: tid,
      subject: `${deal.company} – Diligence questions from ${lenders[i].name}`,
      from_name: s.name, from_email: s.email, to_emails: [me],
      snippet: `A few diligence questions before our IC on Thursday: top-10 customers, MRR cohort retention, and the latest 13-week cash flow.`,
      body_text: `${meName.split(" ")[0]} — ahead of IC Thursday, can you send: (1) top-10 customer detail, (2) MRR cohort retention by quarter, (3) latest 13-week cash flow. Thanks. — ${s.name}`,
      is_read: i === 1 ? false : true, is_starred: false, labels: ["INBOX"],
      received_at: hoursAgo(6 + i * 4),
      deal_id: deal.id,
    });
    messages.push({
      scenario: "lender-qa", idx: 1, thread_id: tid,
      subject: `Re: ${deal.company} – Diligence questions from ${lenders[i].name}`,
      from_name: meName, from_email: me, to_emails: [s.email],
      snippet: `Thanks ${s.name.split(" ")[0]} — pulling these together now, will send by EOD tomorrow.`,
      body_text: `Thanks ${s.name.split(" ")[0]} — pulling these together now. Will have them to you by EOD tomorrow.\n\n${meName.split(" ")[0]}`,
      is_read: true, is_starred: false, labels: ["SENT"],
      received_at: hoursAgo(5 + i * 4),
      deal_id: deal.id,
    });
  }

  // ---- Lender pass note ----
  if (lenders[3] && deals[0]) {
    const s = lenderSender(lenders[3].name);
    const tid = `demo/lender-pass/${deals[0].id}/${lenders[3].name}`;
    messages.push({
      scenario: "lender-pass", idx: 0, thread_id: tid,
      subject: `${deals[0].company} – Update from ${lenders[3].name}`,
      from_name: s.name, from_email: s.email, to_emails: [me],
      snippet: `Unfortunately not a fit for our current fund — concentration on the top customer is above our threshold. Happy to revisit in 12 months.`,
      body_text: `${meName.split(" ")[0]},\n\nAppreciate the look at ${deals[0].company}. Unfortunately not a fit for us in this vintage — customer concentration on the top account is above our threshold. Happy to revisit in 12 months.\n\nBest,\n${s.name}`,
      is_read: true, is_starred: false, labels: ["INBOX"],
      received_at: daysAgo(1),
      deal_id: deals[0].id,
    });
  }

  // ---- Client side: NDA / data room access (contacts 1 & 2) ----
  if (contacts[1] && deals[2]) {
    const c = senderFromContact(contacts[1]);
    const tid = `demo/client-nda/${deals[2].id}`;
    messages.push({
      scenario: "client-nda", idx: 0, thread_id: tid,
      subject: `${deals[2].company} – NDA executed`,
      from_name: c.name, from_email: c.email, to_emails: [me],
      snippet: `Counsel sent back the NDA — countersigned copy attached. Cleared to share the data room.`,
      body_text: `${meName.split(" ")[0]} — counsel just sent the countersigned NDA back. Attached. We're cleared to share the data room with the prospective lenders.\n\n— ${c.name}`,
      is_read: true, is_starred: false, labels: ["INBOX"],
      received_at: daysAgo(2), has_attachments: true,
      attachments: [
        { filename: `${deals[2].company.replace(/\s+/g, "")}_NDA_Executed.pdf`, content_type: "application/pdf", size: 184_200 },
      ],
      deal_id: deals[2].id,
    });
  }

  if (contacts[2] && deals[3]) {
    const c = senderFromContact(contacts[2]);
    const tid = `demo/client-intro/${deals[3].id}`;
    messages.push({
      scenario: "client-intro", idx: 0, thread_id: tid,
      subject: `${deals[3].company} – Intro & next steps`,
      from_name: c.name, from_email: c.email, to_emails: [me],
      snippet: `Great to e-meet. Pulling together the materials you flagged. Targeting end of week for a first batch.`,
      body_text: `Hi ${meName.split(" ")[0]},\n\nGreat to e-meet. I'm pulling together the materials you flagged on the call. Targeting end of week for the first batch (trailing 12mo P&L, AR/AP, top customers).\n\nThanks,\n${c.name}\n${(contacts[2].job_title || "VP Finance")}`,
      is_read: false, is_starred: false, labels: ["INBOX"],
      received_at: hoursAgo(20),
      deal_id: deals[3].id,
    });
  }

  // ---- Internal: task @mention from teammate ----
  if (tasks[0]) {
    const tid = `demo/internal-task/${tasks[0].id}`;
    messages.push({
      scenario: "internal-task", idx: 0, thread_id: tid,
      subject: `Outstanding item: ${tasks[0].title || "Lender outreach follow-up"}`,
      from_name: "Jordan Bennett", from_email: "jordan.bennett@5thline.co", to_emails: [me],
      snippet: `Heads up — I assigned this to you in the deal workspace. Can you take it by EOD?`,
      body_text: `Hey ${meName.split(" ")[0]} — assigned "${tasks[0].title || "Lender outreach follow-up"}" to you in the deal workspace. Can you knock it out by EOD?\n\n— Jordan`,
      is_read: false, is_starred: false, labels: ["INBOX"],
      received_at: hoursAgo(2),
      deal_id: tasks[0].deal_id || null,
    });
  }

  // ---- Calendar: meeting confirmation ----
  if (cals[0]) {
    const tid = `demo/cal/${cals[0].id}`;
    const when = cals[0].starts_at ? new Date(cals[0].starts_at) : new Date(Date.now() + 24 * 3600_000);
    messages.push({
      scenario: "calendar-confirm", idx: 0, thread_id: tid,
      subject: `Confirmed: ${cals[0].title || "Lender intro call"}`,
      from_name: "Calendar", from_email: "calendar-noreply@google.com", to_emails: [me],
      snippet: `${cals[0].title || "Lender intro call"} confirmed for ${when.toLocaleString()}. Dial-in details inside.`,
      body_text: `Your meeting "${cals[0].title || "Lender intro call"}" is confirmed for ${when.toLocaleString()}.\n\nDial-in: meet.google.com/demo-xyz-abc\n\nAdd to calendar from the link.`,
      is_read: true, is_starred: false, labels: ["INBOX"],
      received_at: hoursAgo(30),
    });
  }

  // ---- Newsletters / market color (no deal link) ----
  messages.push({
    scenario: "newsletter", idx: 0, thread_id: `demo/newsletter/private-credit-weekly`,
    subject: `Private Credit Weekly — direct lending spreads tighten 25bps`,
    from_name: "Private Credit Weekly", from_email: "editor@privatecreditweekly.com",
    to_emails: [me],
    snippet: `Direct lending spreads on sponsor-backed unitranche tightened 25bps WoW. Full report inside.`,
    body_text: `This week in private credit: direct lending spreads on sponsor-backed unitranche tightened 25bps WoW. New-issue pipeline remains heavy heading into year-end. Full report inside.`,
    is_read: true, is_starred: false, labels: ["INBOX"],
    received_at: daysAgo(3),
  });
  messages.push({
    scenario: "newsletter", idx: 1, thread_id: `demo/newsletter/abl-monitor`,
    subject: `ABL Monitor — advance rates by collateral class`,
    from_name: "ABL Monitor", from_email: "newsletter@ablmonitor.com",
    to_emails: [me],
    snippet: `Updated quarterly advance rates by collateral class — AR, inventory, M&E, real estate.`,
    body_text: `Quarterly update on advance rates by collateral class — AR (85–90%), eligible inventory (50–65%), M&E (60–80% NOLV), real estate (65–75%).`,
    is_read: true, is_starred: false, labels: ["INBOX"],
    received_at: daysAgo(5),
  });

  // ---- Filler: a few "older" client touches to give scroll depth ----
  for (let i = 0; i < 3; i++) {
    const c = contacts[(3 + i) % Math.max(1, contacts.length)];
    const deal = deals[i % Math.max(1, deals.length)];
    if (!c || !deal) continue;
    const sender = senderFromContact(c);
    const tid = `demo/client-touch/${deal.id}/${i}`;
    messages.push({
      scenario: "client-touch", idx: i, thread_id: tid,
      subject: `${deal.company} – quick question`,
      from_name: sender.name, from_email: sender.email, to_emails: [me],
      snippet: `Got a sec to jump on a call later this week? Want to walk through the latest pipeline.`,
      body_text: `Hi ${meName.split(" ")[0]},\n\nGot a sec to jump on a call later this week? Want to walk through the latest pipeline and re-confirm the timeline.\n\nThanks,\n${sender.name}`,
      is_read: i !== 0, is_starred: false, labels: ["INBOX"],
      received_at: daysAgo(6 + i),
      deal_id: deal.id,
    });
  }

  return messages;
}

export async function seedDemoInbox(input: SeedDemoInboxInput): Promise<SeedDemoInboxResult> {
  const { admin, userId, userEmail } = input;

  // 1. Upsert sentinel "connection" token so the app treats this user as
  //    mail-connected without any real OAuth.
  await admin.from("gmail_tokens").upsert({
    user_id: userId,
    email_address: userEmail,
    grant_id: DEMO_GRANT,
    account_id: DEMO_GRANT,
    scope: DEMO_GRANT,
    access_token: "demo-seed",
    refresh_token: "demo-seed",
    token_type: "Bearer",
    expires_at: new Date(Date.now() + 10 * 365 * 24 * 3600_000).toISOString(),
    is_demo_seed: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  // 2. Build the deterministic scenario set.
  const drafts = buildScenarios(input);

  // 3. Upsert email_threads (one row per unique thread_id).
  const threadMap = new Map<string, { latest: string; subject: string; deal_id: string | null }>();
  for (const m of drafts) {
    const prev = threadMap.get(m.thread_id);
    if (!prev || new Date(m.received_at) > new Date(prev.latest)) {
      threadMap.set(m.thread_id, { latest: m.received_at, subject: m.subject.replace(/^Re:\s*/i, ""), deal_id: m.deal_id ?? prev?.deal_id ?? null });
    } else if (m.deal_id && !prev.deal_id) {
      prev.deal_id = m.deal_id;
    }
  }
  const threadRows = Array.from(threadMap.entries()).map(([thread_id, v]) => ({
    user_id: userId,
    thread_id,
    subject: v.subject,
    matched_deal_id: v.deal_id,
    match_confidence: v.deal_id ? 0.95 : 0,
    match_signals: v.deal_id ? [{ source: "demo-seed", reason: "seeded thread linked to deal" }] : [],
    is_clients_deals: !!v.deal_id,
    needs_reclassify: false,
    last_classified_at: new Date().toISOString(),
    latest_message_at: v.latest,
    is_demo_seed: true,
    seed_key: `${SEED_VERSION}:${thread_id}`,
    updated_at: new Date().toISOString(),
  }));
  if (threadRows.length > 0) {
    const { error } = await admin
      .from("email_threads")
      .upsert(threadRows, { onConflict: "user_id,thread_id" });
    if (error) console.error("[seedDemoInbox] email_threads upsert error:", error);
  }

  // 4. Upsert gmail_messages — deterministic gmail_message_id per draft.
  const msgRows = drafts.map((m) => {
    const gmailId = `demo-seed-${m.scenario}-${m.thread_id.replace(/[^a-z0-9]+/gi, "_")}-${m.idx}`;
    return {
      user_id: userId,
      gmail_message_id: gmailId,
      thread_id: m.thread_id,
      subject: m.subject,
      from_email: m.from_email,
      from_name: m.from_name,
      to_emails: m.to_emails,
      snippet: m.snippet,
      body_text: m.body_text,
      body_html: `<p>${m.body_text.replace(/\n/g, "<br/>")}</p>`,
      is_read: m.is_read,
      is_starred: m.is_starred,
      labels: m.labels,
      received_at: m.received_at,
      is_demo_seed: true,
      seed_key: `${SEED_VERSION}:msg:${gmailId}`,
    };
  });
  if (msgRows.length > 0) {
    const { error } = await admin
      .from("gmail_messages")
      .upsert(msgRows, { onConflict: "user_id,gmail_message_id" });
    if (error) console.error("[seedDemoInbox] gmail_messages upsert error:", error);
  }

  // 5. Tag company as demo workspace.
  await admin.from("companies").update({ is_demo: true, seeded_at: new Date().toISOString(), seed_version: SEED_VERSION }).eq("id", input.companyId);

  return {
    threads: threadRows.length,
    messages: msgRows.length,
    linkedContacts: Math.min(input.contacts.length, 6),
    linkedDeals: Math.min(input.deals.length, 5),
    linkedLenders: Math.min(input.lenders.length, 5),
    linkedTasks: Math.min((input.tasks || []).length, 3),
    linkedCalendarEvents: Math.min((input.calendarEvents || []).length, 2),
  };
}