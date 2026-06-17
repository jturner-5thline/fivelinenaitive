/**
 * Demo storyline fixtures for the demo@5thline.co tenant.
 *
 * The demo experience pretends Google (Gmail + Calendar) is already
 * connected and pre-populated with a believable working state. The two
 * pinned emails drive the headline AI workflows:
 *
 *   #1 — Coastal Brands client sends financial materials so the user
 *        can run "add to data room" and watch the documents appear.
 *   #2 — Greenfield Capital lender sends an indicative term sheet for
 *        Vertex Cloud Solutions so the user can run "update deal +
 *        lender stage" and watch the pipeline move forward.
 *
 * Everything below is local, deterministic, and reset on every demo
 * login. Production tenants never read from this module.
 */

export const DEMO_EMAIL_1_ID = 'demo-email-client-docs';
export const DEMO_EMAIL_2_ID = 'demo-email-term-sheet';

/** Real deal records in the demo company that the storyline maps to. */
export const DEMO_DEAL_CLIENT_DOCS = {
  id: 'be58e352-b451-44a6-b960-1b5f0585fdba',
  name: 'Coastal Brands Inc',
};

export const DEMO_DEAL_TERM_SHEET = {
  id: '7e03bb68-a254-4b28-a1e9-1ac6d22056ab',
  name: 'Vertex Cloud Solutions',
};

/** Pre-baked AI analysis the dashboard / intelligence panel renders without
 *  hitting the analyze-emails edge function. Shape matches EmailAnalysis. */
export const DEMO_EMAIL_ANALYSIS: Record<
  string,
  {
    deal_id: string;
    deal_name: string;
    category: string;
    sentiment: string;
    priority: string;
    summary: string;
    suggested_action: string;
    follow_up_needed: boolean;
    follow_up_by: string | null;
    extracted_data: Record<string, unknown>;
    signals: string[];
  }
> = {
  [DEMO_EMAIL_1_ID]: {
    deal_id: DEMO_DEAL_CLIENT_DOCS.id,
    deal_name: DEMO_DEAL_CLIENT_DOCS.name,
    category: 'due_diligence',
    sentiment: 'positive',
    priority: 'high',
    summary:
      'Rachel Patel (CFO, Coastal Brands) sent the promised data-room package: Q4 financials, AR aging, customer concentration, cap table, and org chart. Ready to ingest into the Coastal Brands data room.',
    suggested_action:
      'Add the 5 attached documents to the Coastal Brands data room and notify the lender group.',
    follow_up_needed: true,
    follow_up_by: new Date(Date.now() + 24 * 3600000).toISOString(),
    extracted_data: {
      counterparty: 'Coastal Brands Inc.',
      counterparty_role: 'client',
      attachments_count: 5,
      target_data_room: 'Coastal Brands Inc / Lender Diligence',
      document_categories: ['Financials', 'AR aging', 'Customer concentration', 'Cap table', 'Org chart'],
    },
    signals: ['client_materials_received', 'data_room_ingest_ready'],
  },
  [DEMO_EMAIL_2_ID]: {
    deal_id: DEMO_DEAL_TERM_SHEET.id,
    deal_name: DEMO_DEAL_TERM_SHEET.name,
    category: 'terms_discussion',
    sentiment: 'positive',
    priority: 'high',
    summary:
      'Greenfield Capital sent an indicative term sheet on Vertex Cloud Solutions: $18M senior secured (Revolver $5M + TL $13M), SOFR + 450, 4-yr tenor, 1.10x FCCR, 3.50x leverage. Ready to advance to credit committee on the 22nd.',
    suggested_action:
      'Update the Vertex Cloud Solutions deal with the term-sheet economics and move Greenfield Capital to the "Term Sheet Received" lender stage.',
    follow_up_needed: true,
    follow_up_by: new Date(Date.now() + 48 * 3600000).toISOString(),
    extracted_data: {
      counterparty: 'Greenfield Capital',
      counterparty_role: 'lender',
      lender_name: 'Greenfield Capital',
      facility_size_usd: 18_000_000,
      facility_structure: { revolver_usd: 5_000_000, term_loan_usd: 13_000_000 },
      pricing: 'SOFR + 450 bps',
      tenor_years: 4,
      amortization: '5%/yr, bullet at maturity',
      covenants: { fccr_min: 1.10, total_leverage_max: 3.50, min_liquidity_usd: 2_000_000 },
      collateral: 'First lien on all assets',
      fees: { upfront_bps: 100, unused_bps: 50 },
      target_lender_stage: 'Term Sheet Received',
      committee_date: new Date(Date.now() + 14 * 86400000).toISOString(),
    },
    signals: ['term_sheet_received', 'lender_stage_advance_pending'],
  },
};

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

function startOfWeek(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0 = Sun
  x.setDate(x.getDate() - day + 1); // Monday
  return x;
}

function dayAt(weekStart: Date, dayOffset: number, hour: number, minute = 0): Date {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** Dense, realistic schedule for the current week, pre-tied to the
 *  storyline emails so the dashboard / morning briefing references them. */
export function buildDemoCalendarEvents(opts?: { selfEmail?: string; selfName?: string }) {
  const selfEmail = opts?.selfEmail || 'demo@5thline.co';
  const selfName = opts?.selfName || 'Demo (5th Line)';
  const week = startOfWeek();

  type E = {
    id: string;
    summary: string;
    description?: string;
    location?: string | null;
    start: Date;
    end: Date;
    attendees?: { email: string; display_name?: string }[];
  };

  const raw: E[] = [
    // Monday
    { id: 'demo-evt-1', summary: 'Internal pipeline standup', location: 'Zoom',
      start: dayAt(week, 0, 9, 0), end: dayAt(week, 0, 9, 30),
      attendees: [{ email: 'team@5thline.co', display_name: '5th Line Team' }] },
    { id: 'demo-evt-2', summary: 'Coastal Brands — diligence kickoff',
      description: 'Walk through the materials Rachel sent over (Q4 financials, AR aging, cap table) and align on data room structure.',
      location: 'Google Meet',
      start: dayAt(week, 0, 11, 0), end: dayAt(week, 0, 12, 0),
      attendees: [
        { email: 'rachel.patel@coastalbrands.com', display_name: 'Rachel Patel (Coastal Brands)' },
        { email: 'demo@5thline.co' },
      ] },
    { id: 'demo-evt-3', summary: 'Vertex Cloud — Greenfield term sheet review',
      description: 'Review Greenfield Capital indicative term sheet ($18M senior secured) and align on response.',
      location: 'Zoom',
      start: dayAt(week, 0, 15, 0), end: dayAt(week, 0, 16, 0),
      attendees: [
        { email: 'mike.rodriguez@greenfieldcap.com', display_name: 'Mike Rodriguez (Greenfield Capital)' },
        { email: 'lisa.thompson@vertexcloud.io', display_name: 'Lisa Thompson (Vertex Cloud)' },
        { email: 'demo@5thline.co' },
      ] },
    // Tuesday
    { id: 'demo-evt-4', summary: 'Pinnacle Data — Meridian DD response prep',
      start: dayAt(week, 1, 10, 0), end: dayAt(week, 1, 11, 0),
      attendees: [{ email: 'jennifer.wu@meridianbank.com', display_name: 'Jennifer Wu (Meridian Bank)' }] },
    { id: 'demo-evt-5', summary: '1:1 — David Park',
      start: dayAt(week, 1, 13, 30), end: dayAt(week, 1, 14, 0),
      attendees: [{ email: 'david.park@5thline.co', display_name: 'David Park' }] },
    { id: 'demo-evt-6', summary: 'Summit Capital intro call (Vertex Cloud)',
      description: 'Inbound interest from Amanda Foster — Vertex Cloud opportunity overview.',
      start: dayAt(week, 1, 16, 0), end: dayAt(week, 1, 16, 30),
      attendees: [{ email: 'amanda.foster@summitcap.com', display_name: 'Amanda Foster (Summit Capital)' }] },
    // Wednesday
    { id: 'demo-evt-7', summary: 'Coastal Brands — lender Q&A session',
      description: 'Live Q&A with the Coastal Brands lender group on the data room contents.',
      start: dayAt(week, 2, 10, 0), end: dayAt(week, 2, 11, 0),
      attendees: [
        { email: 'rachel.patel@coastalbrands.com', display_name: 'Rachel Patel (Coastal Brands)' },
        { email: 'jennifer.wu@meridianbank.com', display_name: 'Jennifer Wu (Meridian Bank)' },
      ] },
    { id: 'demo-evt-8', summary: 'Internal deal review — current pipeline',
      start: dayAt(week, 2, 14, 0), end: dayAt(week, 2, 15, 0) },
    // Thursday
    { id: 'demo-evt-9', summary: 'Summit Hospitality — lender update call',
      description: 'Quarterly lender update call with Summit Hospitality management.',
      start: dayAt(week, 3, 14, 0), end: dayAt(week, 3, 15, 0),
      attendees: [{ email: 'david.park@5thline.co', display_name: 'David Park' }] },
    { id: 'demo-evt-10', summary: 'Redwood Manufacturing — covenant waiver review',
      start: dayAt(week, 3, 16, 0), end: dayAt(week, 3, 16, 45),
      attendees: [{ email: 'robert.james@unioncreditgroup.com', display_name: 'Robert James (Union Credit Group)' }] },
    // Friday
    { id: 'demo-evt-11', summary: 'Vertex Cloud — Greenfield credit committee prep',
      description: 'Final prep for the Greenfield Capital credit committee on Vertex Cloud Solutions.',
      start: dayAt(week, 4, 11, 0), end: dayAt(week, 4, 12, 0),
      attendees: [{ email: 'mike.rodriguez@greenfieldcap.com', display_name: 'Mike Rodriguez (Greenfield Capital)' }] },
    { id: 'demo-evt-12', summary: 'Weekly wrap-up & next-week planning',
      start: dayAt(week, 4, 15, 30), end: dayAt(week, 4, 16, 0) },
  ];

  // ------------------------------------------------------------------
  // Procedurally generated long-range schedule (-30 .. +60 days)
  // ------------------------------------------------------------------
  const TEMPLATES: Array<{
    title: string; durationMin: number; type: string; location: string;
    description: string; attendees: { email: string; display_name?: string }[];
  }> = [
    { title: 'Internal pipeline standup', durationMin: 30, type: 'standup', location: 'Zoom',
      description: 'Weekly internal pipeline standup — review active deals and blockers.',
      attendees: [{ email: 'team@5thline.co', display_name: '5th Line Team' }] },
    { title: 'Product & roadmap sync', durationMin: 45, type: 'internal', location: 'naitive HQ',
      description: 'Roadmap review with the product team.',
      attendees: [{ email: 'team@5thline.co', display_name: '5th Line Team' }] },
    { title: 'Intro call — Harbor Foods', durationMin: 30, type: 'intro', location: 'Google Meet',
      description: 'Initial intro with Harbor Foods CFO; assess fit for senior debt facility.',
      attendees: [{ email: 'cfo@harborfoods.com', display_name: 'Harbor Foods (CFO)' }] },
    { title: 'Lender call — Greenfield Capital x Vertex Cloud', durationMin: 45, type: 'lender', location: 'Zoom',
      description: 'Walk Greenfield Capital through the latest Vertex Cloud financials.',
      attendees: [
        { email: 'mike.rodriguez@greenfieldcap.com', display_name: 'Mike Rodriguez (Greenfield)' },
        { email: 'lisa.thompson@vertexcloud.io', display_name: 'Lisa Thompson (Vertex Cloud)' },
      ] },
    { title: 'Lender call — Meridian Bank x Pinnacle Data', durationMin: 45, type: 'lender', location: 'Zoom',
      description: 'Meridian Bank DD follow-up on Pinnacle Data Systems.',
      attendees: [{ email: 'jennifer.wu@meridianbank.com', display_name: 'Jennifer Wu (Meridian)' }] },
    { title: 'Diligence call — Coastal Brands', durationMin: 60, type: 'diligence', location: 'Google Meet',
      description: 'Detailed financial diligence walkthrough.',
      attendees: [{ email: 'rachel.patel@coastalbrands.com', display_name: 'Rachel Patel (Coastal Brands)' }] },
    { title: 'Borrower follow-up — Summit Hospitality', durationMin: 30, type: 'borrower', location: 'Phone',
      description: 'Follow-up on outstanding diligence items.',
      attendees: [{ email: 'cfo@summithospitality.com', display_name: 'Summit Hospitality (CFO)' }] },
    { title: 'IC prep — Vertex Cloud Solutions', durationMin: 60, type: 'ic', location: 'naitive HQ',
      description: 'Final investment committee preparation for Vertex Cloud.',
      attendees: [{ email: 'team@5thline.co', display_name: '5th Line Team' }] },
    { title: 'Investment Committee — weekly', durationMin: 60, type: 'ic', location: 'naitive HQ',
      description: 'Weekly IC — review pipeline and pending term sheets.',
      attendees: [{ email: 'team@5thline.co', display_name: '5th Line Team' }] },
    { title: 'Document review — Coastal Brands data room', durationMin: 45, type: 'docs', location: 'naitive HQ',
      description: 'Review uploaded financials and AR aging package.',
      attendees: [] },
    { title: 'Post-term-sheet check-in — Vertex Cloud', durationMin: 30, type: 'check-in', location: 'Zoom',
      description: 'Confirm next steps following Greenfield term sheet.',
      attendees: [{ email: 'lisa.thompson@vertexcloud.io', display_name: 'Lisa Thompson (Vertex Cloud)' }] },
    { title: 'Team standup', durationMin: 15, type: 'standup', location: 'Zoom',
      description: 'Daily team standup.',
      attendees: [{ email: 'team@5thline.co', display_name: '5th Line Team' }] },
    { title: 'Borrower follow-up — Redwood Manufacturing', durationMin: 30, type: 'borrower', location: 'Phone',
      description: 'Covenant waiver discussion.',
      attendees: [{ email: 'robert.james@unioncreditgroup.com', display_name: 'Robert James (Union Credit)' }] },
    { title: 'Pipeline review — leadership', durationMin: 45, type: 'internal', location: 'naitive HQ',
      description: 'Leadership pipeline review and prioritization.',
      attendees: [{ email: 'team@5thline.co', display_name: '5th Line Team' }] },
  ];

  const generated: E[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Recurring weekly Monday 9:00 internal standup, -4 .. +8 weeks
  for (let w = -4; w <= 8; w++) {
    const monday = new Date(today);
    monday.setDate(monday.getDate() - monday.getDay() + 1 + w * 7);
    monday.setHours(9, 0, 0, 0);
    const end = new Date(monday.getTime() + 30 * 60_000);
    generated.push({
      id: `demo-evt-gen-standup-${w}`,
      summary: 'Internal pipeline standup',
      description: 'Recurring weekly pipeline standup.',
      location: 'Zoom',
      start: monday,
      end,
      attendees: [{ email: 'team@5thline.co', display_name: '5th Line Team' }],
    });
  }

  // Recurring weekly Thursday 14:00 Investment Committee
  for (let w = -4; w <= 8; w++) {
    const thu = new Date(today);
    thu.setDate(thu.getDate() - thu.getDay() + 4 + w * 7);
    thu.setHours(14, 0, 0, 0);
    const end = new Date(thu.getTime() + 60 * 60_000);
    generated.push({
      id: `demo-evt-gen-ic-${w}`,
      summary: 'Investment Committee — weekly',
      description: 'Weekly IC — review pipeline and pending term sheets.',
      location: 'naitive HQ',
      start: thu,
      end,
      attendees: [{ email: 'team@5thline.co', display_name: '5th Line Team' }],
    });
  }

  // Scatter 3-5 meetings per business day from -30 to +60 days
  for (let offset = -30; offset <= 60; offset++) {
    const day = new Date(today);
    day.setDate(day.getDate() + offset);
    const dow = day.getDay();
    if (dow === 0 || dow === 6) continue; // skip weekends
    // Deterministic count 2..4 per day based on offset
    const count = 2 + Math.abs((offset * 7) % 3);
    for (let i = 0; i < count; i++) {
      const tplIdx = Math.abs((offset * 31 + i * 13)) % TEMPLATES.length;
      const tpl = TEMPLATES[tplIdx];
      if (tpl.title === 'Internal pipeline standup' && dow === 1) continue; // dedupe Mon standup
      if (tpl.title === 'Investment Committee — weekly' && dow === 4) continue; // dedupe Thu IC
      const hour = 9 + ((offset + i * 2) % 8); // 9..16
      const start = new Date(day);
      start.setHours(hour, ((offset + i) % 2) * 30, 0, 0);
      const end = new Date(start.getTime() + tpl.durationMin * 60_000);
      generated.push({
        id: `demo-evt-gen-${offset}-${i}`,
        summary: tpl.title,
        description: tpl.description,
        location: tpl.location,
        start,
        end,
        attendees: tpl.attendees,
      });
    }
  }

  const all = [...raw, ...generated];

  return all.map((e) => ({
    id: e.id,
    calendar_id: 'primary',
    summary: e.summary,
    description: e.description ?? null,
    location: e.location ?? null,
    start: e.start.toISOString(),
    end: e.end.toISOString(),
    all_day: false,
    status: 'confirmed',
    updated: new Date().toISOString(),
    created: new Date(Date.now() - 7 * 86400000).toISOString(),
    html_link: null,
    hangout_link: null,
    attendees: (e.attendees || []).map((a) => ({
      email: a.email,
      display_name: a.display_name ?? null,
      response_status: 'accepted',
      organizer: a.email === selfEmail,
      self: a.email === selfEmail,
    })),
    organizer: { email: selfEmail, displayName: selfName },
    color_id: null,
  }));
}

export const DEMO_PRIMARY_CALENDAR = {
  id: 'primary',
  summary: 'demo@5thline.co',
  description: 'Demo workspace primary calendar',
  primary: true,
  background_color: '#3b82f6',
  foreground_color: '#ffffff',
  access_role: 'owner',
  time_zone: 'America/New_York',
};