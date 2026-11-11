import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { JsonValue, ToolContext } from "@lovable.dev/mcp-js";

/**
 * Build a user-scoped Supabase client from the verified OAuth bearer token.
 * RLS runs as the signed-in naitive user; never use SERVICE_ROLE here.
 */
export function supabaseForUser(ctx: ToolContext): SupabaseClient {
  const runtime = globalThis as typeof globalThis & { Deno?: { env?: { get?: (key: string) => string | undefined } }; process?: { env?: Record<string, string | undefined> } };
  const env = (key: string) => runtime.Deno?.env?.get?.(key) ?? runtime.process?.env?.[key];
  const url = env("SUPABASE_URL") ?? env("VITE_SUPABASE_URL");
  let anon = env("SUPABASE_PUBLISHABLE_KEY") ?? env("VITE_SUPABASE_PUBLISHABLE_KEY");
  const keys = env("SUPABASE_PUBLISHABLE_KEYS");
  if (!anon && keys) {
    try {
      const parsed: unknown = JSON.parse(keys);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        anon = Object.values(parsed).find((value): value is string => typeof value === "string" && value.startsWith("sb_publishable_"));
      }
    } catch { /* Fall through to legacy public key. */ }
  }
  anon ??= env("SUPABASE_ANON_KEY") ?? env("VITE_SUPABASE_ANON_KEY");
  const token = ctx.getToken();
  if (!ctx.isAuthenticated() || !token) throw new Error("A verified OAuth caller is required.");
  if (!url || !anon) throw new Error("Funding-source service configuration is missing.");
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function requireAuth(ctx: ToolContext) {
  if (!ctx.isAuthenticated()) {
    return { content: [{ type: "text" as const, text: "Not authenticated" }], isError: true as const };
  }
  return null;
}

export function textResult(payload: unknown, structured?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    ...(structured ? { structuredContent: buildStructured(payload, structured) } : {}),
  };
}

/**
 * Clients (e.g. Claude) prefer structuredContent over the text block, so the
 * structured result must carry the full payload, not just metadata. Payload keys
 * win over metadata keys on conflict; non-object payloads go under `data`.
 */
export function buildStructured(payload: unknown, structured: Record<string, unknown>): JsonValue {
  const body =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : { data: payload };
  return toJsonValue({ ...structured, ...body });
}

/** Map unknown query records into the SDK's JSON contract without unsafe casts. */
export function toJsonValue(value: unknown): JsonValue {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (typeof value === "object") {
    const result: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(value)) if (entry !== undefined) result[key] = toJsonValue(entry);
    return result;
  }
  return null;
}

export function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

/**
 * Distinguish "deal doesn't exist / RLS hides it from this caller" from
 * "deal exists and is empty". Returns a forbidden result payload when the
 * caller cannot see the parent deal, or null when access is confirmed.
 *
 * Logs auth.uid(), the deal's company_id, and the outcome so membership
 * mismatches surface in edge-function logs.
 */
export async function assertDealAccess(
  sb: ReturnType<typeof supabaseForUser>,
  ctx: ToolContext,
  deal_id: string,
  toolName: string,
) {
  const caller_uid = ctx.getUserId?.() ?? null;
  const { data: deal, error } = await sb
    .from("deals")
    .select("id, company, user_id, company_id")
    .eq("id", deal_id)
    .maybeSingle();
  if (error) {
    console.error(`[${toolName}] deal access probe error`, {
      deal_id,
      caller_uid,
      message: error.message,
    });
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { error: "forbidden", reason: error.message, deal_id },
            null,
            2,
          ),
        },
      ],
      structuredContent: { error: "forbidden", reason: error.message, deal_id },
      isError: true as const,
    };
  }
  if (!deal) {
    console.warn(`[${toolName}] rls-denied`, {
      deal_id,
      caller_uid,
      deal_visible: false,
    });
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              error: "forbidden",
              reason: "caller lacks RLS access to this deal's company",
              deal_id,
            },
            null,
            2,
          ),
        },
      ],
      structuredContent: {
        error: "forbidden",
        reason: "caller lacks RLS access to this deal's company",
        deal_id,
      },
      isError: true as const,
    };
  }
  console.log(`[${toolName}] deal access ok`, {
    deal_id,
    caller_uid,
    deal_company_id: deal.company_id ?? null,
    deal_owner_uid: deal.user_id ?? null,
  });
  return null;
}
/**
 * Deal `stage` columns store pipeline-scoped stage IDs that are frequently
 * overloaded (e.g. the "In Development" pipeline labels `agreement-pending`
 * as "Deal Had to be Benched"). Raw IDs therefore mislead API consumers.
 * These helpers resolve the human label from the deal's assigned pipeline,
 * exactly as the UI does.
 */
type PipelineStage = { id?: string; label?: string };

export async function loadPipelineStageMaps(
  sb: ReturnType<typeof supabaseForUser>,
  pipelineIds: (string | null | undefined)[],
) {
  const ids = Array.from(new Set(pipelineIds.filter(Boolean))) as string[];
  const byPipeline = new Map<string, { name: string | null; labels: Map<string, string> }>();
  if (ids.length === 0) return byPipeline;
  const { data } = await sb.from("deal_pipelines").select("id, name, stages").in("id", ids);
  for (const row of data ?? []) {
    const labels = new Map<string, string>();
    const stages = Array.isArray((row as { stages?: PipelineStage[] }).stages)
      ? ((row as { stages?: PipelineStage[] }).stages as PipelineStage[])
      : [];
    for (const s of stages) if (s?.id) labels.set(s.id, s.label ?? s.id);
    byPipeline.set((row as { id: string }).id, { name: (row as { name?: string }).name ?? null, labels });
  }
  return byPipeline;
}

/** Adds `stage_label` + `pipeline_name` to deal rows that carry stage/pipeline_id. */
export async function withStageLabels<T extends { stage?: string | null; pipeline_id?: string | null }>(
  sb: ReturnType<typeof supabaseForUser>,
  rows: T[],
): Promise<(T & { stage_label: string | null; pipeline_name: string | null })[]> {
  const maps = await loadPipelineStageMaps(sb, rows.map((r) => r.pipeline_id));
  return rows.map((r) => {
    const pipeline = r.pipeline_id ? maps.get(r.pipeline_id) : undefined;
    return {
      ...r,
      stage_label: r.stage ? pipeline?.labels.get(r.stage) ?? r.stage : null,
      pipeline_name: pipeline?.name ?? null,
    };
  });
}

/** Resolves a stage label OR id into the stage id stored on the deal row. */
export async function resolveStageInput(
  sb: ReturnType<typeof supabaseForUser>,
  pipelineId: string | null | undefined,
  input: string,
): Promise<string> {
  if (!pipelineId) return input;
  const maps = await loadPipelineStageMaps(sb, [pipelineId]);
  const pipeline = maps.get(pipelineId);
  if (!pipeline) return input;
  if (pipeline.labels.has(input)) return input;
  const wanted = input.trim().toLowerCase();
  for (const [id, label] of pipeline.labels) {
    if ((label ?? "").trim().toLowerCase() === wanted) return id;
  }
  return input;
}
