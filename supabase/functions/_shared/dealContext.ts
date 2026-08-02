// Deterministic deal-context builder.
//
// Assembles a compact, normalized JSON payload for a single deal from the
// existing internal data layer (deals, notes, documents, activity, emails,
// recordings, funding sources). Callers pass this payload to Claude in place
// of ad-hoc prose dumps: it stays small, stable, and citable (`sources[].id`
// references anchor Claude answers to real rows the UI can link back to).
//
// Every fetch is RLS-scoped via the caller's user client, so the payload
// only ever contains rows the requesting user is already allowed to see.

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export interface DealContextSource {
  /** Stable citation id Claude can reference (e.g. `doc:<uuid>`, `note:<uuid>`). */
  id: string;
  kind: "deal" | "note" | "document" | "recording" | "email" | "activity" | "funding_source" | "lender";
  label: string;
  /** Optional href the client UI can turn into a link. */
  href?: string | null;
}

export interface DealContextPayload {
  deal: {
    id: string;
    company: string | null;
    value: number | null;
    stage: string | null;
    status: string | null;
    deal_type?: string | null;
    manager?: string | null;
    notes_excerpt?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  };
  funding_sources: Array<{
    id: string;
    name: string;
    stage: string | null;
    tracking_status: string | null;
    score?: number | null;
    notes_excerpt?: string | null;
  }>;
  notes: Array<{
    id: string;
    title?: string | null;
    excerpt: string;
    updated_at: string | null;
  }>;
  documents: Array<{
    id: string;
    name: string;
    content_type?: string | null;
    text_excerpt?: string | null;
  }>;
  recordings: Array<{
    id: string;
    title: string;
    duration_seconds?: number | null;
    happened_at?: string | null;
    notes_excerpt?: string | null;
  }>;
  emails: Array<{
    id: string;
    subject: string | null;
    from: string | null;
    happened_at: string | null;
    excerpt: string;
  }>;
  activity: Array<{
    id: string;
    type: string;
    summary: string;
    happened_at: string | null;
  }>;
  /** Flat list of all cite-able rows for Claude to reference by id. */
  sources: DealContextSource[];
  /** Approximate serialized size, useful for logging/budget checks. */
  approx_chars: number;
  /** True when sections were dropped/shortened to fit the char budget. */
  truncated?: boolean;
}

export interface BuildDealContextOptions {
  include?: {
    fundingSources?: boolean;
    notes?: boolean;
    documents?: boolean;
    recordings?: boolean;
    emails?: boolean;
    activity?: boolean;
  };
  limits?: {
    notes?: number;
    documents?: number;
    recordings?: number;
    emails?: number;
    activity?: number;
    fundingSources?: number;
    /** Max chars kept for any single excerpt. */
    excerptChars?: number;
    /** Hard cap on the serialized payload. Default 60000 chars (~15k tokens). */
    totalChars?: number;
  };
}

const DEFAULT_LIMITS = {
  notes: 8,
  documents: 12,
  recordings: 6,
  emails: 10,
  activity: 10,
  fundingSources: 20,
  excerptChars: 400,
  totalChars: 60000,
};

function trim(s: unknown, max: number): string {
  if (typeof s !== "string") return "";
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Strip null/undefined/empty-string fields so the JSON stays lean. */
function compact<T extends Record<string, any>>(obj: T): T {
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === "") continue;
    out[k] = v;
  }
  return out as T;
}

/**
 * Fetch a compact, citable JSON snapshot of a deal. All queries run through
 * the supplied user-scoped Supabase client, so RLS is enforced.
 */
export async function buildDealContext(
  supabase: SupabaseClient,
  dealId: string,
  opts: BuildDealContextOptions = {},
): Promise<DealContextPayload> {
  const include = {
    fundingSources: true,
    notes: true,
    documents: true,
    recordings: true,
    emails: true,
    activity: true,
    ...opts.include,
  };
  const limits = { ...DEFAULT_LIMITS, ...opts.limits };

  const [dealRes, fsRes, notesRes, docsRes, recRes, emailRes, actRes] = await Promise.all([
    supabase
      .from("deals")
      .select("id, company, value, stage, status, deal_type, manager, notes, created_at, updated_at")
      .eq("id", dealId)
      .maybeSingle(),
    include.fundingSources
      ? supabase
          .from("deal_lenders")
          .select("id, name, stage, tracking_status, score, notes, updated_at")
          .eq("deal_id", dealId)
          .order("updated_at", { ascending: false })
          .limit(limits.fundingSources)
      : Promise.resolve({ data: [] }),
    include.notes
      ? supabase
          .from("deal_space_notes")
          .select("id, title, content, updated_at")
          .eq("deal_id", dealId)
          .order("updated_at", { ascending: false })
          .limit(limits.notes)
      : Promise.resolve({ data: [] }),
    include.documents
      ? supabase
          .from("deal_space_documents")
          .select("id, name, content_type, extracted_text, created_at")
          .eq("deal_id", dealId)
          .order("created_at", { ascending: false })
          .limit(limits.documents)
      : Promise.resolve({ data: [] }),
    include.recordings
      ? supabase
          .from("deal_claap_recordings")
          .select("id, recording_title, duration_seconds, linked_at, notes")
          .eq("deal_id", dealId)
          .order("linked_at", { ascending: false })
          .limit(limits.recordings)
      : Promise.resolve({ data: [] }),
    include.emails
      ? supabase
          .from("deal_emails")
          .select("id, gmail_message_id, notes, linked_at, gmail_messages(subject, from_email, snippet, received_at)")
          .eq("deal_id", dealId)
          .order("linked_at", { ascending: false })
          .limit(limits.emails)
      : Promise.resolve({ data: [] }),
    include.activity
      ? supabase
          .from("deal_activity")
          .select("id, action_type, source, before, after, created_at")
          .eq("deal_id", dealId)
          .order("created_at", { ascending: false })
          .limit(limits.activity)
      : Promise.resolve({ data: [] }),
  ]);

  const deal = (dealRes as any)?.data;
  if (!deal) {
    throw new Error(`Deal ${dealId} not found or not accessible`);
  }

  const sources: DealContextSource[] = [
    { id: `deal:${deal.id}`, kind: "deal", label: deal.company ?? "Deal", href: `/deals/${deal.id}` },
  ];

  const funding_sources = ((fsRes as any).data ?? []).map((r: any) => {
    sources.push({ id: `lender:${r.id}`, kind: "funding_source", label: r.name });
    return compact({
      id: `lender:${r.id}`,
      name: r.name,
      stage: r.stage ?? null,
      tracking_status: r.tracking_status ?? null,
      score: r.score ?? null,
      notes_excerpt: r.notes ? trim(r.notes, limits.excerptChars) : null,
    });
  });

  const notes = ((notesRes as any).data ?? []).map((r: any) => {
    sources.push({ id: `note:${r.id}`, kind: "note", label: r.title ?? "Note" });
    return compact({
      id: `note:${r.id}`,
      title: r.title ?? null,
      excerpt: trim(r.content, limits.excerptChars),
      updated_at: r.updated_at ?? null,
    });
  });

  const documents = ((docsRes as any).data ?? []).map((r: any) => {
    sources.push({ id: `doc:${r.id}`, kind: "document", label: r.name });
    return compact({
      id: `doc:${r.id}`,
      name: r.name,
      content_type: r.content_type ?? null,
      text_excerpt: r.extracted_text ? trim(r.extracted_text, limits.excerptChars) : null,
    });
  });

  const recordings = ((recRes as any).data ?? []).map((r: any) => {
    sources.push({ id: `rec:${r.id}`, kind: "recording", label: r.recording_title ?? "Recording" });
    return compact({
      id: `rec:${r.id}`,
      title: r.recording_title ?? "Untitled",
      duration_seconds: r.duration_seconds ?? null,
      happened_at: r.linked_at ?? null,
      notes_excerpt: r.notes ? trim(r.notes, limits.excerptChars) : null,
    });
  });

  const emails = ((emailRes as any).data ?? []).map((r: any) => {
    const gm = Array.isArray(r.gmail_messages) ? r.gmail_messages[0] : r.gmail_messages;
    const subject = gm?.subject ?? null;
    sources.push({ id: `email:${r.id}`, kind: "email", label: subject ?? "Email" });
    return compact({
      id: `email:${r.id}`,
      subject,
      from: gm?.from_email ?? null,
      happened_at: gm?.received_at ?? r.linked_at ?? null,
      excerpt: trim(gm?.snippet ?? r.notes ?? "", limits.excerptChars),
    });
  });

  const activity = ((actRes as any).data ?? []).map((r: any) => {
    const summary = `${r.action_type ?? "change"}${r.source ? ` (${r.source})` : ""}`;
    sources.push({ id: `act:${r.id}`, kind: "activity", label: summary });
    const diff = r.before || r.after
      ? `before=${JSON.stringify(r.before ?? null)} after=${JSON.stringify(r.after ?? null)}`
      : "";
    return compact({
      id: `act:${r.id}`,
      type: r.action_type ?? "activity",
      summary: trim(`${summary}${diff ? ` — ${diff}` : ""}`, Math.min(limits.excerptChars, 240)),
      happened_at: r.created_at ?? null,
    });
  });

  const payload: DealContextPayload = {
    deal: compact({
      id: deal.id,
      company: deal.company ?? null,
      value: deal.value ?? null,
      stage: deal.stage ?? null,
      status: deal.status ?? null,
      deal_type: deal.deal_type ?? null,
      manager: deal.manager ?? null,
      notes_excerpt: deal.notes ? trim(deal.notes, limits.excerptChars) : null,
      created_at: deal.created_at ?? null,
      updated_at: deal.updated_at ?? null,
    }) as DealContextPayload["deal"],
    funding_sources,
    notes,
    documents,
    recordings,
    emails,
    activity,
    sources,
    approx_chars: 0,
  };
  return enforceBudget(payload, limits.totalChars);
}

/**
 * Shrink the payload until its serialized size fits `budget` chars.
 * Sections are trimmed in reverse-importance order (activity → emails →
 * recordings → notes → documents → funding sources), and `sources` is pruned
 * to only the rows that survived so citations never point at dropped data.
 */
function enforceBudget(payload: DealContextPayload, budget: number): DealContextPayload {
  const size = () => JSON.stringify(payload).length;
  const order: Array<keyof DealContextPayload> = [
    "activity",
    "emails",
    "recordings",
    "notes",
    "documents",
    "funding_sources",
  ];
  let truncated = false;

  for (const key of order) {
    while (size() > budget) {
      const arr = payload[key] as any[];
      if (!Array.isArray(arr) || arr.length === 0) break;
      arr.pop();
      truncated = true;
    }
    if (size() <= budget) break;
  }

  if (truncated) {
    const keptIds = new Set<string>([`deal:${payload.deal.id}`]);
    for (const key of order) {
      for (const row of (payload[key] as any[]) ?? []) keptIds.add(row.id);
    }
    payload.sources = payload.sources.filter((s) => keptIds.has(s.id));
    payload.truncated = true;
  }

  payload.approx_chars = size();
  return payload;
}

/**
 * Shared system-prompt fragment instructing Claude to interpret ONLY the
 * structured JSON payload it is given, and to cite the `sources[].id`
 * anchors when referencing facts. Prepend this to any per-feature prompt.
 */
export const DEAL_CONTEXT_SYSTEM_FRAGMENT = `You are given a compact JSON snapshot of a deal under <deal_context>...</deal_context>. Interpret ONLY the facts inside that payload — do not invent numbers, lender names, documents, notes, emails, or recordings that are not present.

When you cite a fact, reference the matching entry from \`sources\` using its \`id\` in the form [cite:<id>], e.g. [cite:doc:abc-123]. Prefer citing the most specific row (a document, note, recording, email, or funding source) over the top-level deal. If a claim has no supporting source in the payload, say so plainly instead of guessing.

Keep responses tight and deal-specific. If asked for raw data the payload already contains, quote it back verbatim rather than paraphrasing.`;

/**
 * Render the payload for injection into a Claude system prompt. The result
 * stays inside a single tagged block so the model can locate it reliably.
 */
export function renderDealContextBlock(payload: DealContextPayload): string {
  return `<deal_context>\n${JSON.stringify(payload)}\n</deal_context>`;
}