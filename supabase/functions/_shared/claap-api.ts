// Shared thin wrapper around the Claap REST API.
// Reads CLAAP_API_TOKEN (preferred) and falls back to legacy CLAAP_API_KEY.
// Claap auth header is `X-Claap-Key: <token>` (verified empirically against
// https://api.claap.io/v1/recordings/<id>).

export const CLAAP_API_BASE = "https://api.claap.io/v1";

export function getClaapToken(): string | null {
  return (
    Deno.env.get("CLAAP_API_TOKEN") ||
    Deno.env.get("CLAAP_API_KEY") ||
    null
  );
}

export function hasClaapToken(): boolean {
  return !!getClaapToken();
}

function authHeaders(token: string): HeadersInit {
  return {
    "X-Claap-Key": token,
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export interface ClaapActionItem {
  text: string;
  assignee?: string | null;
  due?: string | null;
  checked?: boolean;
}

export interface NormalizedClaapRecording {
  external_id: string;
  title: string | null;
  url: string | null;
  summary_md: string | null;
  action_items: ClaapActionItem[];
  key_takeaways: string[];
  transcript_url: string | null;
  recording_url: string | null;
  chapters: unknown[];
  raw: unknown;
}

/**
 * Recording URL slug pattern: /{workspace}/{slug}-c-{shareId}-{recordingId}
 * Claap's API key is the FINAL segment after the last '-'. We extract that.
 * Accepts a raw recording id, a slug, or a full URL.
 */
export function extractClaapExternalId(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  // Strip query/hash.
  const cleaned = trimmed.split("?")[0].split("#")[0];
  // If it's a URL, take the last path segment.
  let slug = cleaned;
  try {
    if (/^https?:\/\//i.test(cleaned)) {
      const u = new URL(cleaned);
      const parts = u.pathname.split("/").filter(Boolean);
      slug = parts[parts.length - 1] || cleaned;
    }
  } catch {
    // fall through
  }
  // The recording id is whatever is after the last '-c-' marker, but Claap's
  // internal id is actually the final token after the last '-'.
  if (slug.includes("-c-")) {
    slug = slug.split("-c-").slice(-1)[0];
  }
  const tokens = slug.split("-");
  const last = tokens[tokens.length - 1];
  return last || slug || null;
}

export async function claapGetRecording(externalId: string): Promise<NormalizedClaapRecording | null> {
  const token = getClaapToken();
  if (!token) throw new Error("CLAAP_API_TOKEN not configured");
  const resp = await fetch(`${CLAAP_API_BASE}/recordings/${encodeURIComponent(externalId)}`, {
    headers: authHeaders(token),
  });
  if (resp.status === 404) {
    await resp.text();
    return null;
  }
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Claap getRecording ${resp.status}: ${body.slice(0, 200)}`);
  }
  const json = await resp.json();
  const r = json?.result?.recording ?? json?.recording ?? json;
  if (!r || typeof r !== "object") return null;
  return normalizeRecording(r);
}

function normalizeRecording(r: any): NormalizedClaapRecording {
  // Prefer the rich `outlines[0].text` markdown (that's the actual summary
  // Claap renders in-app). Fallback to any string `summary`.
  const outlines: any[] = Array.isArray(r?.outlines) ? r.outlines : [];
  const summaryFromOutlines = outlines
    .map((o) => (typeof o?.text === "string" ? o.text : ""))
    .filter(Boolean)
    .join("\n\n")
    .trim();
  const summary_md =
    summaryFromOutlines ||
    (typeof r?.summary === "string" ? r.summary : null) ||
    null;

  const action_items: ClaapActionItem[] = [];
  const aiBlocks: any[] = Array.isArray(r?.actionItems) ? r.actionItems : [];
  for (const block of aiBlocks) {
    const items: any[] = Array.isArray(block?.items) ? block.items : [];
    for (const it of items) {
      const text = typeof it?.description === "string"
        ? it.description
        : typeof it?.text === "string"
          ? it.text
          : null;
      if (!text) continue;
      action_items.push({
        text,
        assignee: it?.assignee?.name || it?.assignee?.email || it?.owner || null,
        due: it?.dueDate || it?.due || null,
        checked: Boolean(it?.isChecked),
      });
    }
  }

  const ktBlocks: any[] = Array.isArray(r?.keyTakeaways) ? r.keyTakeaways : [];
  const key_takeaways: string[] = ktBlocks
    .map((b) => (typeof b?.text === "string" ? b.text : null))
    .filter((s): s is string => !!s);

  const transcripts: any[] = Array.isArray(r?.transcripts) ? r.transcripts : [];
  const transcript_url =
    transcripts[0]?.url ||
    transcripts[0]?.downloadUrl ||
    null;

  const recording_url =
    r?.url ||
    r?.video?.url ||
    r?.video?.downloadUrl ||
    null;

  const chapters = Array.isArray(r?.chapters) ? r.chapters : [];

  return {
    external_id: String(r?.id || ""),
    title: typeof r?.title === "string" ? r.title : null,
    url: typeof r?.url === "string" ? r.url : null,
    summary_md,
    action_items,
    key_takeaways,
    transcript_url,
    recording_url,
    chapters,
    raw: r,
  };
}

export async function claapListRecordings(opts: { since?: string; limit?: number } = {}): Promise<any[]> {
  const token = getClaapToken();
  if (!token) throw new Error("CLAAP_API_TOKEN not configured");
  const url = new URL(`${CLAAP_API_BASE}/recordings`);
  if (opts.since) url.searchParams.set("since", opts.since);
  if (opts.limit) url.searchParams.set("limit", String(opts.limit));
  const resp = await fetch(url.toString(), { headers: authHeaders(token) });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Claap listRecordings ${resp.status}: ${body.slice(0, 200)}`);
  }
  const json = await resp.json();
  const items = json?.result?.recordings ?? json?.recordings ?? json?.result ?? json;
  return Array.isArray(items) ? items : [];
}