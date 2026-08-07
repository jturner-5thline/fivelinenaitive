import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ASANA_API = "https://app.asana.com/api/1.0";
const OPT_FIELDS = "name,completed,completed_at,due_on,due_at,modified_at,created_at,assignee.email";

async function asanaPost(token: string, path: string, body: unknown) {
  const res = await fetch(`${ASANA_API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data: body }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Asana ${res.status}: ${JSON.stringify(json?.errors || json)}`);
  return json?.data;
}

/** email -> Asana user gid for the workspace (fetched once per run). */
async function fetchWorkspaceUsers(token: string, workspaceGid: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const res = await fetch(
      `${ASANA_API}/users?workspace=${workspaceGid}&opt_fields=email,gid&limit=100`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const json = await res.json().catch(() => ({}));
    for (const u of json?.data || []) {
      if (u?.email) map.set(String(u.email).toLowerCase(), String(u.gid));
    }
  } catch (e) {
    console.warn("[asana-link-orphans] workspace user lookup failed:", e);
  }
  return map;
}

/** First enabled project filter configured for this integration, if any. */
async function resolveTargetProject(
  supabase: any,
  integrationId: string,
): Promise<{ projectGid: string | null; sectionGid: string | null }> {
  const { data: cfg } = await supabase
    .from("asana_sync_config")
    .select("id")
    .eq("integration_id", integrationId)
    .maybeSingle();
  if (!cfg?.id) return { projectGid: null, sectionGid: null };
  const { data: filter } = await supabase
    .from("asana_project_filters")
    .select("asana_project_gid, asana_section_gid")
    .eq("sync_config_id", cfg.id)
    .eq("is_enabled", true)
    .limit(1)
    .maybeSingle();
  return {
    projectGid: filter?.asana_project_gid || null,
    sectionGid: filter?.asana_section_gid || null,
  };
}

/** Words that carry no identifying signal when comparing task titles. */
const STOPWORDS = new Set([
  "a","an","the","and","or","of","to","for","on","in","with","at","by","from","re",
  "check","checking","follow","followup","following","up","ping","reach","out","touch",
  "base","circle","back","status","update","updates","confirm","confirmation","send",
  "email","call","review","reviewing","get","need","needs","please","asap","w","vs",
  "task","todo","do","make","sure","new","next","this","that","it","is","are","be",
]);

function significantTokens(title: string): Set<string> {
  return new Set(
    (title || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );
}

/** Containment score: how much of the smaller token set is covered by the other. */
function titleScore(a: string, b: string): number {
  const ta = significantTokens(a);
  const tb = significantTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size);
}

function sharedCount(a: string, b: string): number {
  const ta = significantTokens(a);
  const tb = significantTokens(b);
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared;
}

/**
 * Guard against "one title is a tiny subset of a much longer one" false
 * positives (e.g. "Follow up with Bryan Hunt" vs a long meeting-notes task that
 * merely mentions Bryan Hunt). Titles must be of comparable specificity.
 */
function comparableLength(a: string, b: string): boolean {
  const sa = significantTokens(a).size;
  const sb = significantTokens(b).size;
  return Math.max(sa, sb) <= Math.min(sa, sb) + 2;
}

const isCompleteStatus = (s: string | null) => s === "complete" || s === "completed";

interface AsanaTask {
  gid: string;
  name: string;
  completed?: boolean;
  completed_at?: string | null;
  due_on?: string | null;
  due_at?: string | null;
  modified_at?: string | null;
  assignee?: { email?: string } | null;
}

async function asanaGet(path: string, token: string) {
  const res = await fetch(`${ASANA_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Asana API error [${res.status}] on ${path}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

/**
 * Pull tasks per workspace member. Far cheaper than walking every project:
 * one paginated query per assignee instead of one per project.
 */
async function fetchWorkspaceTasks(token: string, workspaceGid: string, sinceISO: string) {
  const usersResp = await asanaGet(
    `/users?workspace=${workspaceGid}&opt_fields=name,email&limit=100`,
    token,
  );
  const users: { gid: string; email?: string }[] = usersResp?.data || [];

  const byGid = new Map<string, AsanaTask>();
  const completedSince = sinceISO;

  const fetchForUser = async (userGid: string) => {
    let offset: string | null = null;
    do {
      const url =
        `/tasks?assignee=${userGid}&workspace=${workspaceGid}&opt_fields=${OPT_FIELDS}&limit=100` +
        `&modified_since=${encodeURIComponent(sinceISO)}` +
        `&completed_since=${encodeURIComponent(completedSince)}` +
        (offset ? `&offset=${offset}` : "");
      let page: any;
      try {
        page = await asanaGet(url, token);
      } catch (e) {
        console.error(`[asana-link-orphans] assignee ${userGid} page failed:`, e);
        break;
      }
      for (const t of (page?.data || []) as AsanaTask[]) byGid.set(t.gid, t);
      offset = page?.next_page?.offset || null;
    } while (offset);
  };

  // Bounded concurrency over members.
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, users.length) }, async () => {
      while (cursor < users.length) {
        const u = users[cursor++];
        await fetchForUser(u.gid);
      }
    }),
  );

  return Array.from(byGid.values());
}

Deno.serve(async (req) => {
  // placeholder-anchor
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;
    // When true, local-only tasks with no Asana counterpart are created in Asana.
    const push = body?.push === true;
    const days = Number(body?.days) > 0 ? Number(body.days) : 180;
    const minScore = Number(body?.min_score) > 0 ? Number(body.min_score) : 0.75;
    const sinceISO = new Date(Date.now() - days * 86400000).toISOString();

    const { data: integrations, error: intErr } = await supabase
      .from("integrations")
      .select("id, company_id, config, status")
      .eq("type", "asana");
    if (intErr) throw intErr;

    const results: Record<string, unknown>[] = [];

    for (const integration of integrations || []) {
      const cfg = (integration as any)?.config || {};
      const token = cfg.api_token as string | undefined;
      const workspaceGid = cfg.workspace_gid as string | undefined;
      if (!token || !workspaceGid || (integration as any).status !== "connected") {
        results.push({ integration_id: integration.id, skipped: "no_token_workspace_or_disconnected" });
        continue;
      }

      // Local orphans: no Asana GID yet.
      let orphanQuery = supabase
        .from("tasks")
        .select("id, title, status, due_date, assigned_to, created_at")
        .is("asana_task_gid", null)
        .is("archived_at", null)
        .gte("created_at", sinceISO)
        .limit(2000);
      if ((integration as any).company_id) {
        orphanQuery = orphanQuery.eq("company_id", (integration as any).company_id);
      }
      const { data: orphans, error: orphanErr } = await orphanQuery;
      if (orphanErr) throw orphanErr;

      // GIDs already claimed locally, so we never double-link.
      const { data: linkedRows } = await supabase
        .from("tasks")
        .select("asana_task_gid")
        .not("asana_task_gid", "is", null)
        .limit(20000);
      const claimed = new Set((linkedRows || []).map((r: any) => String(r.asana_task_gid)));

      const asanaTasks = (await fetchWorkspaceTasks(token, workspaceGid, sinceISO))
        .filter((t) => !claimed.has(t.gid));

      let linked = 0, updated = 0, ambiguous = 0;
      const duplicates: Record<string, unknown>[] = [];
      const matches: Record<string, unknown>[] = [];
      const skipped: Record<string, unknown>[] = [];
      const pushCandidates: any[] = [];

      for (const orphan of (orphans || []) as any[]) {
        const allScored = asanaTasks
          .map((t) => ({ t, score: titleScore(orphan.title, t.name), shared: sharedCount(orphan.title, t.name) }))
          .filter((s) => s.score >= minScore && s.shared >= 2 && comparableLength(orphan.title, s.t.name))
          .sort((a, b) => b.score - a.score);

        const scored = allScored.filter((s) => !claimed.has(s.t.gid));

        if (scored.length === 0) {
          // The best Asana counterpart is already linked to a different local
          // row: this orphan is a local duplicate of an already-synced task.
          if (allScored.length > 0) {
            duplicates.push({
              task_id: orphan.id,
              title: orphan.title,
              due_date: orphan.due_date,
              status: orphan.status,
              duplicate_of_asana_title: allScored[0].t.name,
              duplicate_of_gid: allScored[0].t.gid,
            });
            if (!dryRun) {
              // Flag for human review instead of silently linking or archiving.
              await supabase
                .from("tasks")
                .update({
                  asana_duplicate_of_gid: allScored[0].t.gid,
                  asana_duplicate_of_title: allScored[0].t.name,
                  asana_duplicate_status: "pending",
                })
                .eq("id", orphan.id)
                .is("asana_duplicate_status", null);
            }
          } else {
            pushCandidates.push(orphan);
          }
          continue;
        }
        // Reject when the top two candidates are indistinguishable.
        if (scored.length > 1 && scored[1].score >= scored[0].score) {
          ambiguous++;
          skipped.push({ task_id: orphan.id, title: orphan.title, reason: "ambiguous", candidates: scored.slice(0, 3).map((s) => s.t.name) });
          continue;
        }

        const best = scored[0].t;
        claimed.add(best.gid);

        const asanaDue = best.due_at ? String(best.due_at).slice(0, 10) : (best.due_on || null);
        const localDue = orphan.due_date ? String(orphan.due_date).slice(0, 10) : null;
        const asanaComplete = best.completed === true;

        const updateData: Record<string, unknown> = {
          asana_task_gid: best.gid,
          asana_sync_status: "synced",
          asana_synced_at: new Date().toISOString(),
          sync_source: "asana",
          updated_at: new Date().toISOString(),
        };
        if (asanaDue !== localDue) updateData.due_date = asanaDue;
        if (asanaComplete !== isCompleteStatus(orphan.status)) {
          updateData.status = asanaComplete ? "complete" : "not_started";
          updateData.completed_at = asanaComplete ? (best.completed_at || new Date().toISOString()) : null;
        }

        matches.push({
          task_id: orphan.id,
          local_title: orphan.title,
          asana_title: best.name,
          gid: best.gid,
          score: Number(scored[0].score.toFixed(2)),
          local_due: localDue,
          asana_due: asanaDue,
          asana_completed: asanaComplete,
        });

        if (dryRun) continue;

        const { error: upErr } = await supabase.from("tasks").update(updateData).eq("id", orphan.id);
        if (upErr) {
          console.error(`[asana-link-orphans] update failed for ${orphan.id}:`, upErr.message);
          continue;
        }
        linked++;
        if (updateData.due_date !== undefined || updateData.status !== undefined) updated++;

        await supabase.from("asana_sync_log").insert({
          task_id: orphan.id,
          asana_task_gid: best.gid,
          action: "orphan_link",
          success: true,
          payload: { local_title: orphan.title, asana_title: best.name, score: scored[0].score },
          company_id: (integration as any).company_id || null,
        });
      }

      results.push({
        integration_id: integration.id,
        orphans_scanned: orphans?.length || 0,
        asana_candidates: asanaTasks.length,
        linked,
        field_updates: updated,
        ambiguous,
        duplicate_of_linked: duplicates.length,
        duplicates,
        ...(await maybePushOrphans({
          supabase,
          token,
          workspaceGid,
          integration,
          push,
          dryRun,
          pushCandidates,
        })),
        ...(dryRun ? { dry_run: true, matches, skipped } : { matches }),
      });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[asana-link-orphans] fatal:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
