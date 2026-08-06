import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ASANA_API = "https://app.asana.com/api/1.0";

// ── In-memory cache for portfolio_milestones ──
// Survives across requests within a warm edge-function instance.
const PORTFOLIO_MILESTONES_TTL_MS = 10 * 60 * 1000; // 10 minutes
const portfolioMilestoneCache = new Map<
  string,
  { data: unknown; expiresAt: number }
>();

async function asanaFetch(path: string, token: string, options: RequestInit = {}) {
  const res = await fetch(`${ASANA_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Asana API error [${res.status}]: ${text}`);
  }

  return res.json();
}

// Fetch variant that returns rich diagnostics (status + parsed body) instead of
// throwing — used by create_task / update_task so the client can persist the
// exact failure reason on the naitive task row.
async function asanaFetchDetailed(path: string, token: string, options: RequestInit = {}) {
  const res = await fetch(`${ASANA_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const rawText = await res.text();
  let parsed: unknown = null;
  try { parsed = rawText ? JSON.parse(rawText) : null; } catch { parsed = { raw: rawText }; }
  return { ok: res.ok, status: res.status, body: parsed as any };
}

function normalizeInitiativeStatus(raw: unknown): { key: string | null; label: string | null } {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!value) return { key: null, label: null };
  if (["on_track", "on track", "green"].includes(value)) return { key: "on_track", label: "On Track" };
  if (["at_risk", "at risk", "yellow", "warning"].includes(value)) return { key: "at_risk", label: "At Risk" };
  if (["off_track", "off track", "behind", "red"].includes(value)) return { key: "off_track", label: "Off Track" };
  if (["on_hold", "on hold", "hold", "paused", "blue"].includes(value)) return { key: "on_hold", label: "On Hold" };
  if (["complete", "completed", "done", "achieved"].includes(value)) return { key: "complete", label: "Complete" };
  if (["dropped", "cancelled", "canceled"].includes(value)) return { key: "dropped", label: "Dropped" };
  return { key: null, label: null };
}

// Resolve token: from request body (test/connect flow) or from DB (stored integration)
async function resolveToken(
  bodyToken: string | undefined,
  integrationId: string | undefined,
): Promise<string> {
  if (bodyToken) return bodyToken;

  if (!integrationId) throw new Error("Either token or integration_id is required");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from("integrations")
    .select("config")
    .eq("id", integrationId)
    .single();

  if (error || !data?.config?.api_token) {
    throw new Error("Integration not found or token missing");
  }

  return data.config.api_token as string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Authentication guard ──
    // Require a valid Supabase user JWT. Without this, anonymous callers can
    // proxy arbitrary Asana operations and look up stored integration tokens.
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const { action, token, integration_id, ...params } = await req.json();

    let result: Record<string, unknown> = {};

    switch (action) {
      case "test": {
        if (!token) {
          return new Response(
            JSON.stringify({ success: false, error: "Token is required for test" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }
        const me = await asanaFetch("/users/me", token);
        const workspaces = me.data?.workspaces || [];
        result = {
          success: true,
          user_name: me.data?.name,
          email: me.data?.email,
          workspace_name: workspaces[0]?.name || null,
          workspace_gid: workspaces[0]?.gid || null,
        };
        break;
      }

      case "workspaces": {
        const resolvedToken = await resolveToken(token, integration_id);
        const me = await asanaFetch("/users/me", resolvedToken);
        result = { success: true, workspaces: me.data?.workspaces || [] };
        break;
      }

      case "projects": {
        const resolvedToken = await resolveToken(token, integration_id);
        const workspace = params.workspace_gid;
        const data = await asanaFetch(
          `/projects?workspace=${workspace}&opt_fields=name,color,archived,created_at`,
          resolvedToken
        );
        result = { success: true, projects: data.data || [] };
        break;
      }

      case "tasks": {
        const resolvedToken = await resolveToken(token, integration_id);
        const project = params.project_gid;
        const data = await asanaFetch(
          `/tasks?project=${project}&opt_fields=name,completed,due_on,assignee.name,assignee.email,notes,tags.name,created_at,modified_at`,
          resolvedToken
        );
        result = { success: true, tasks: data.data || [] };
        break;
      }

      case "sections": {
        const resolvedToken = await resolveToken(token, integration_id);
        const projectGid = params.project_gid;
        if (!projectGid) {
          result = { success: false, error: "project_gid is required" };
          break;
        }
        const data = await asanaFetch(
          `/projects/${projectGid}/sections?opt_fields=name`,
          resolvedToken
        );
        result = { success: true, sections: data.data || [] };
        break;
      }

      case "create_task": {
        const resolvedToken = await resolveToken(token, integration_id);
        console.log("Creating Asana task with data:", JSON.stringify(params.task_data));
        const resp = await asanaFetchDetailed("/tasks", resolvedToken, {
          method: "POST",
          body: JSON.stringify({ data: params.task_data }),
        });
        console.log(
          `[asana-proxy] create_task status=${resp.status} ok=${resp.ok} body=${JSON.stringify(resp.body).slice(0, 800)}`
        );
        if (!resp.ok) {
          result = {
            success: false,
            error: resp.body?.errors?.[0]?.message || `Asana API error [${resp.status}]`,
            http_status: resp.status,
            response_body: resp.body,
          };
          break;
        }
        result = {
          success: true,
          task: resp.body?.data,
          http_status: resp.status,
          response_body: resp.body,
        };
        break;
      }

      case "update_task": {
        const resolvedToken = await resolveToken(token, integration_id);
        const resp = await asanaFetchDetailed(`/tasks/${params.task_gid}`, resolvedToken, {
          method: "PUT",
          body: JSON.stringify({ data: params.data }),
        });
        console.log(
          `[asana-proxy] update_task gid=${params.task_gid} status=${resp.status} ok=${resp.ok}`
        );
        if (!resp.ok) {
          result = {
            success: false,
            error: resp.body?.errors?.[0]?.message || `Asana API error [${resp.status}]`,
            http_status: resp.status,
            response_body: resp.body,
          };
          break;
        }
        result = {
          success: true,
          task: resp.body?.data,
          http_status: resp.status,
          response_body: resp.body,
        };
        break;
      }

      case "workspace_users": {
        const resolvedToken = await resolveToken(token, integration_id);
        const workspace = params.workspace_gid;
        const data = await asanaFetch(
          `/workspaces/${workspace}/users?opt_fields=name,email`,
          resolvedToken
        );
        result = { success: true, users: data.data || [] };
        break;
      }

      case "register_webhook": {
        const resolvedToken = await resolveToken(token, integration_id);
        const projectGid = params.project_gid;
        const targetUrl = params.target_url;

        if (!projectGid || !targetUrl) {
          result = { success: false, error: "project_gid and target_url are required" };
          break;
        }

        const webhookData = await asanaFetch("/webhooks", resolvedToken, {
          method: "POST",
          body: JSON.stringify({
            data: {
              resource: projectGid,
              target: targetUrl,
              filters: [
                {
                  resource_type: "task",
                  action: "changed",
                  // Include both `due_on` (date-only) and `due_at` (date+time).
                  // Asana fires the filter matching the field the user edited,
                  // so we need both or datetime edits are silently dropped.
                  fields: ["completed", "name", "due_on", "due_at", "assignee"],
                },
                { resource_type: "task", action: "added" },
                { resource_type: "task", action: "removed" },
                { resource_type: "task", action: "deleted" }
              ]
            }
          }),
        });

        result = {
          success: true,
          webhook: webhookData.data,
        };
        break;
      }

      case "get_webhook": {
        const resolvedToken = await resolveToken(token, integration_id);
        const webhookGid = params.webhook_gid;
        if (!webhookGid) {
          result = { success: false, error: "webhook_gid is required" };
          break;
        }

        const webhookData = await asanaFetch(
          `/webhooks/${webhookGid}?opt_fields=gid,active,resource.gid,target,last_failure_at,last_failure_content,last_success_at`,
          resolvedToken,
        );
        result = { success: true, webhook: webhookData.data };
        break;
      }

      case "delete_webhook": {
        const resolvedToken = await resolveToken(token, integration_id);
        const webhookGid = params.webhook_gid;
        if (!webhookGid) {
          result = { success: false, error: "webhook_gid is required" };
          break;
        }
        await asanaFetch(`/webhooks/${webhookGid}`, resolvedToken, { method: "DELETE" });
        result = { success: true };
        break;
      }

      case "list_goals": {
        // Fetch Asana Goals (separate from tasks/projects).
        // Asana's Goals API requires either a workspace, team, or portfolio scope.
        // When querying by workspace, the API requires either `is_workspace_level=true`
        // OR a `team` parameter — it will NOT return team-level goals when you only
        // pass `is_workspace_level=true`. To surface every goal a user owns
        // (including James Turner's team-level goals), we fetch BOTH:
        //   1. Workspace-level goals
        //   2. Team-level goals across every team in the workspace
        // Results are deduped by gid.
        const resolvedToken = await resolveToken(token, integration_id);
        const workspace = params.workspace_gid;
        if (!workspace) {
          result = { success: false, error: "workspace_gid is required" };
          break;
        }
        const optFields = [
          "name",
          "notes",
          "html_notes",
          "due_on",
          "start_on",
          "status",
          "progress_status",
          "current_status_update.status_type",
          "current_status_update.title",
          "is_workspace_level",
          "owner.name",
          "owner.email",
          "owner.gid",
          "team.name",
          "team.gid",
          "permalink_url",
          "liked",
          "metric.current_display_value",
          "metric.progress_source",
          "metric.current_number_value",
          "metric.target_number_value",
          "metric.unit",
          "metric.precision",
          "metric.initial_number_value",
          "time_period.display_name",
        ].join(",");

        try {
          const byGid = new Map<string, any>();

          // 1. Workspace-level goals
          try {
            const wsGoals = await asanaFetch(
              `/goals?workspace=${workspace}&is_workspace_level=true&limit=100&opt_fields=${optFields}`,
              resolvedToken
            );
            for (const g of (wsGoals.data || [])) {
              if (g?.gid) byGid.set(g.gid, g);
            }
          } catch (e) {
            console.warn("[list_goals] workspace-level fetch failed:", e);
          }

          // 2. Team-level goals — fetch teams the authenticated user belongs to,
          //    then fetch goals per team.
          try {
            const teamsRes = await asanaFetch(
              `/users/me/teams?workspace=${workspace}&opt_fields=name,gid`,
              resolvedToken
            );
            const teams = teamsRes.data || [];
            const teamGoalLists = await Promise.all(
              teams.map(async (t: { gid: string }) => {
                try {
                  const tg = await asanaFetch(
                    `/goals?team=${t.gid}&limit=100&opt_fields=${optFields}`,
                    resolvedToken
                  );
                  return tg.data || [];
                } catch (e) {
                  console.warn(`[list_goals] team ${t.gid} fetch failed:`, e);
                  return [];
                }
              })
            );
            for (const list of teamGoalLists) {
              for (const g of list) {
                if (g?.gid && !byGid.has(g.gid)) byGid.set(g.gid, g);
              }
            }
          } catch (e) {
            console.warn("[list_goals] team enumeration failed:", e);
          }

          result = { success: true, goals: Array.from(byGid.values()) };
        } catch (e) {
          // Fallback: some workspaces require team scope. Return clear error.
          const msg = e instanceof Error ? e.message : "Unknown error fetching goals";
          result = { success: false, error: msg, goals: [] };
        }
        break;
      }

      case "list_supporting_goals": {
        // Fetch supporting (sub) goals for a given parent goal.
        // Asana exposes /goals/{goal_gid}/supportingWork which returns supporting
        // tasks/projects/portfolios/goals. We filter to goals only.
        const resolvedToken = await resolveToken(token, integration_id);
        const parentGid = params.parent_gid;
        if (!parentGid) {
          result = { success: false, error: "parent_gid is required", goals: [] };
          break;
        }
        const optFields = [
          "name",
          "due_on",
          "start_on",
          "status",
          "progress_status",
          "current_status_update.status_type",
          "current_status_update.title",
          "owner.name",
          "owner.email",
          "owner.gid",
          "team.name",
          "team.gid",
          "permalink_url",
          "metric.current_display_value",
          "metric.current_number_value",
          "metric.target_number_value",
          "metric.initial_number_value",
          "metric.unit",
          "metric.progress_source",
          "time_period.display_name",
          "resource_type",
        ].join(",");
        try {
          const data = await asanaFetch(
            `/goals/${parentGid}/supportingWork?opt_fields=${optFields}&limit=100`,
            resolvedToken
          );
          const goals = (data.data || []).filter(
            (it: any) => it?.resource_type === "goal"
          );
          result = { success: true, goals };
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error fetching supporting goals";
          result = { success: false, error: msg, goals: [] };
        }
        break;
      }

      case "portfolio_milestones": {
        // Fetch milestone-type tasks across all projects in a portfolio.
        const resolvedToken = await resolveToken(token, integration_id);
        const portfolioGid = params.portfolio_gid;
        if (!portfolioGid) {
          result = { success: false, error: "portfolio_gid is required" };
          break;
        }
        const forceRefresh = params.force_refresh === true;
        const cacheKey = `${portfolioGid}:${resolvedToken.slice(-8)}`;
        const now = Date.now();

        if (!forceRefresh) {
          const cached = portfolioMilestoneCache.get(cacheKey);
          if (cached && cached.expiresAt > now) {
            console.log(`[portfolio_milestones] cache HIT (${Math.round((cached.expiresAt - now) / 1000)}s remaining)`);
            result = {
              ...(cached.data as Record<string, unknown>),
              cached: true,
              cache_age_seconds: Math.round(
                (PORTFOLIO_MILESTONES_TTL_MS - (cached.expiresAt - now)) / 1000,
              ),
            };
            break;
          }
        }
        console.log(`[portfolio_milestones] cache MISS — fetching from Asana`);

        try {
          // 1. Get all projects in the portfolio
          const itemsRes = await asanaFetch(
            `/portfolios/${portfolioGid}/items?opt_fields=name,resource_type,archived`,
            resolvedToken
          );
          const projects = (itemsRes.data || []).filter(
            (p: any) => p.resource_type === "project" && !p.archived
          );

          // 2. For each project, fetch milestone tasks in parallel
          const milestoneFields =
            "name,completed,due_on,due_at,resource_subtype,permalink_url,assignee.name,projects.name";
          const perProject = await Promise.all(
            projects.map(async (p: any) => {
              try {
                const t = await asanaFetch(
                  `/tasks?project=${p.gid}&completed_since=now&opt_fields=${milestoneFields}`,
                  resolvedToken
                );
                const milestones = (t.data || []).filter(
                  (task: any) => task.resource_subtype === "milestone"
                );
                return milestones.map((m: any) => ({
                  ...m,
                  project_gid: p.gid,
                  project_name: p.name,
                }));
              } catch (err) {
                console.warn(`[portfolio_milestones] skip project ${p.gid}: ${err}`);
                return [];
              }
            })
          );

          const milestones = perProject.flat();
          const payload = {
            success: true,
            milestones,
            project_count: projects.length,
            fetched_at: new Date().toISOString(),
          };
          portfolioMilestoneCache.set(cacheKey, {
            data: payload,
            expiresAt: now + PORTFOLIO_MILESTONES_TTL_MS,
          });
          result = { ...payload, cached: false };
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error fetching portfolio milestones";
          result = { success: false, error: msg, milestones: [] };
        }
        break;
      }

      case "list_portfolios": {
        // List portfolios the connected user owns/can see in a workspace.
        const resolvedToken = await resolveToken(token, integration_id);
        const workspace = params.workspace_gid;
        if (!workspace) {
          result = { success: false, error: "workspace_gid is required" };
          break;
        }
        try {
          // Asana requires `owner` for /portfolios listing. Use the connected user.
          const me = await asanaFetch("/users/me", resolvedToken);
          const ownerGid = me.data?.gid;
          if (!ownerGid) {
            result = { success: false, error: "Could not resolve Asana user", portfolios: [] };
            break;
          }
          const optFields = [
            "name",
            "color",
            "permalink_url",
            "owner.name",
            "owner.email",
            "current_status_update.status_type",
            "due_on",
            "start_on",
          ].join(",");
          const list = await asanaFetch(
            `/portfolios?workspace=${workspace}&owner=${ownerGid}&limit=100&opt_fields=${optFields}`,
            resolvedToken
          );
          const portfolios = list.data || [];

          // For each portfolio, fetch items (projects) with status to compute on/at-risk/off
          const itemFields = "name,resource_type,archived,current_status_update.status_type,permalink_url";
          const enriched = await Promise.all(
            portfolios.map(async (p: any) => {
              try {
                const items = await asanaFetch(
                  `/portfolios/${p.gid}/items?opt_fields=${itemFields}`,
                  resolvedToken
                );
                const projects = (items.data || []).filter(
                  (it: any) => it.resource_type === "project" && !it.archived
                );
                let onTrack = 0, atRisk = 0, offTrack = 0, noStatus = 0;
                for (const proj of projects) {
                  const st = (proj.current_status_update?.status_type || "").toLowerCase();
                  if (st === "on_track" || st === "green") onTrack++;
                  else if (st === "at_risk" || st === "yellow") atRisk++;
                  else if (st === "off_track" || st === "red" || st === "behind") offTrack++;
                  else noStatus++;
                }
                return {
                  ...p,
                  project_count: projects.length,
                  status_counts: { on_track: onTrack, at_risk: atRisk, off_track: offTrack, no_status: noStatus },
                };
              } catch (err) {
                console.warn(`[list_portfolios] skip portfolio ${p.gid}: ${err}`);
                return { ...p, project_count: 0, status_counts: { on_track: 0, at_risk: 0, off_track: 0, no_status: 0 } };
              }
            })
          );
          result = { success: true, portfolios: enriched };
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error fetching portfolios";
          result = { success: false, error: msg, portfolios: [] };
        }
        break;
      }

      case "portfolio_goals": {
        // Fetch goals supported by a specific portfolio.
        const resolvedToken = await resolveToken(token, integration_id);
        const portfolioGid = params.portfolio_gid;
        if (!portfolioGid) {
          result = { success: false, error: "portfolio_gid is required", goals: [] };
          break;
        }
        const optFields = [
          "name",
          "due_on",
          "permalink_url",
          "owner.name",
          "owner.email",
          "status",
          "progress_status",
          "current_status_update.status_type",
          "metric.current_display_value",
          "metric.current_number_value",
          "metric.target_number_value",
          "metric.initial_number_value",
          "metric.unit",
          "time_period.display_name",
        ].join(",");
        try {
          const data = await asanaFetch(
            `/portfolios/${portfolioGid}/items?opt_fields=${optFields},resource_type`,
            resolvedToken
          );
          const items = (data.data || []).filter((it: any) => it.resource_type === "goal");
          // Some workspaces don't expose goals as portfolio items; fall back to /goals?portfolio=
          let goals = items;
          if (goals.length === 0) {
            try {
              const alt = await asanaFetch(
                `/goals?portfolio=${portfolioGid}&limit=100&opt_fields=${optFields}`,
                resolvedToken
              );
              goals = alt.data || [];
            } catch (_) { /* ignore */ }
          }
          result = { success: true, goals };
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error fetching portfolio goals";
          result = { success: false, error: msg, goals: [] };
        }
        break;
      }

      case "portfolio_activity": {
        // Aggregate recent status updates across all goals supporting a portfolio.
        const resolvedToken = await resolveToken(token, integration_id);
        const portfolioGid = params.portfolio_gid;
        const limit = Math.min(Number(params.limit) || 25, 50);
        if (!portfolioGid) {
          result = { success: false, error: "portfolio_gid is required", activity: [] };
          break;
        }
        try {
          // 1. Get goals attached to portfolio
          const goalFields = "name,permalink_url,resource_type";
          let goals: any[] = [];
          try {
            const items = await asanaFetch(
              `/portfolios/${portfolioGid}/items?opt_fields=${goalFields}`,
              resolvedToken,
            );
            goals = (items.data || []).filter((it: any) => it.resource_type === "goal");
          } catch (_) { /* ignore */ }
          if (goals.length === 0) {
            try {
              const alt = await asanaFetch(
                `/goals?portfolio=${portfolioGid}&limit=100&opt_fields=${goalFields}`,
                resolvedToken,
              );
              goals = alt.data || [];
            } catch (_) { /* ignore */ }
          }

          // 2. Fetch recent status updates per goal in parallel
          const updFields = "created_at,created_by.name,status_type,title,text,resource_subtype";
          const perGoal = await Promise.all(
            goals.slice(0, 25).map(async (g) => {
              try {
                const r = await asanaFetch(
                  `/status_updates?parent=${g.gid}&limit=10&opt_fields=${updFields}`,
                  resolvedToken,
                );
                return ((r.data as any[]) || []).map((u) => ({
                  id: u.gid,
                  created_at: u.created_at,
                  author: u.created_by?.name || null,
                  status_type: u.status_type || null,
                  title: u.title || null,
                  text: u.text || null,
                  goal_gid: g.gid,
                  goal_name: g.name,
                  goal_url: g.permalink_url || null,
                }));
              } catch (_) {
                return [];
              }
            }),
          );

          const flat = perGoal.flat();
          flat.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
          result = { success: true, activity: flat.slice(0, limit) };
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error fetching portfolio activity";
          result = { success: false, error: msg, activity: [] };
        }
        break;
      }

      case "portfolio_projects": {
        // Fetch project items (with status + owner) within a portfolio.
        const resolvedToken = await resolveToken(token, integration_id);
        const portfolioGid = params.portfolio_gid;
        if (!portfolioGid) {
          result = { success: false, error: "portfolio_gid is required", projects: [] };
          break;
        }
        try {
          const itemFields = [
            "name",
            "resource_type",
            "archived",
            "permalink_url",
            "owner.name",
            "owner.email",
            "current_status_update.gid",
            "current_status_update.resource_type",
            "current_status_update.status_type",
            "current_status_update.title",
            "current_status_update.text",
            "current_status_update.created_at",
            "current_status",
            "current_status.color",
            "current_status.title",
            "current_status.text",
            "status",
            "status_color",
            "color",
            "custom_fields.name",
            "custom_fields.display_value",
            "custom_fields.text_value",
            "custom_fields.number_value",
            "custom_fields.enum_value.name",
            "custom_fields.enum_value.color",
            "custom_fields.multi_enum_values.name",
            "custom_fields.multi_enum_values.color",
            "custom_field_settings.custom_field.name",
            "custom_field_settings.custom_field.display_value",
            "custom_field_settings.custom_field.text_value",
            "custom_field_settings.custom_field.number_value",
            "custom_field_settings.custom_field.enum_value.name",
            "custom_field_settings.custom_field.enum_value.color",
            "custom_field_settings.custom_field.multi_enum_values.name",
            "custom_field_settings.custom_field.multi_enum_values.color",
            "due_date",
            "due_on",
            "start_on",
          ].join(",");
          const items = await asanaFetch(
            `/portfolios/${portfolioGid}/items?opt_fields=${itemFields}`,
            resolvedToken,
          );
          const allItems = (items.data || []) as any[];
          const typeCounts: Record<string, number> = {};
          for (const it of allItems) {
            const t = it.resource_type || "unknown";
            typeCounts[t] = (typeCounts[t] || 0) + 1;
          }
          console.log(
            `[portfolio_projects] portfolio=${portfolioGid} total=${allItems.length} types=${JSON.stringify(typeCounts)}`,
          );
          const baseProjects = allItems.filter(
            (it: any) => it.resource_type === "project" && !it.archived,
          );
          const basePortfolios = allItems.filter(
            (it: any) => it.resource_type === "portfolio",
          );

          // Enrich each project with detailed ownership fields (owner, creator,
          // custom field "Owner", etc.). Asana's portfolio item endpoint can return
          // null `owner` for projects whose ownership lives in a custom field, so
          // we need the per-project record to assemble robust owner candidates.
          const detailFields = [
            "name",
            "permalink_url",
            "owner.name",
            "owner.email",
            "created_by.name",
            "created_by.email",
            "team.name",
            "current_status_update.status_type",
            "current_status_update.title",
            "current_status_update.author.name",
            "current_status_update.author.email",
            "custom_fields.name",
            "custom_fields.display_value",
            "custom_fields.people_value.name",
            "custom_fields.people_value.email",
            "due_on",
            "due_date",
            "start_on",
          ].join(",");

          const enriched = await Promise.all(
            baseProjects.map(async (p: any) => {
              try {
                const det = await asanaFetch(
                  `/projects/${p.gid}?opt_fields=${detailFields}`,
                  resolvedToken,
                );
                return { base: p, detail: det.data || {} };
              } catch (_e) {
                return { base: p, detail: {} };
              }
            }),
          );

          const projects = enriched.map(({ base, detail }) => {
            const candidates: Array<{ name: string | null; email: string | null; source: string }> = [];
            const push = (name: any, email: any, source: string) => {
              const n = typeof name === "string" ? name.trim() : null;
              const e = typeof email === "string" ? email.trim() : null;
              if (n || e) candidates.push({ name: n, email: e, source });
            };
            push(detail?.owner?.name, detail?.owner?.email, "owner");
            push(detail?.created_by?.name, detail?.created_by?.email, "creator");
            push(detail?.current_status_update?.author?.name, detail?.current_status_update?.author?.email, "status_author");

            const customFields: any[] = Array.isArray(detail?.custom_fields) ? detail.custom_fields : [];
            for (const cf of customFields) {
              const fname = (cf?.name || "").toString().toLowerCase();
              if (!/owner|lead|dri|responsible|prepared/.test(fname)) continue;
              const people = Array.isArray(cf?.people_value) ? cf.people_value : [];
              if (people.length) {
                for (const person of people) push(person?.name, person?.email, `custom:${cf.name}`);
              } else if (cf?.display_value) {
                push(cf.display_value, null, `custom:${cf.name}`);
              }
            }

            const primary = candidates[0] || { name: null, email: null, source: null };
            return {
              gid: base.gid,
              name: detail?.name || base.name,
              item_type: "project",
              permalink_url: detail?.permalink_url || base.permalink_url || null,
              owner: primary.name,
              owner_email: primary.email,
              owner_source: primary.source,
              owner_candidates: candidates,
              status_type: detail?.current_status_update?.status_type || base.current_status_update?.status_type || null,
              status_title: detail?.current_status_update?.title || base.current_status_update?.title || null,
              due_on: detail?.due_on || detail?.due_date || base.due_on || base.due_date || null,
              start_on: detail?.start_on || base.start_on || null,
            };
          });

          // Also enrich nested portfolios so they appear as initiative rows.
          const portfolioDetailFields = [
            "name",
            "permalink_url",
            "owner.name",
            "owner.email",
            "current_status_update.gid",
            "current_status_update.resource_type",
            "current_status_update.status_type",
            "current_status_update.title",
            "current_status_update.text",
            "current_status_update.html_text",
            "current_status_update.created_at",
            "current_status_update.resource_subtype",
            "current_status",
            "current_status.color",
            "current_status.title",
            "current_status.text",
            "status",
            "status_color",
            "color",
            "custom_fields.name",
            "custom_fields.display_value",
            "custom_fields.text_value",
            "custom_fields.number_value",
            "custom_fields.enum_value.name",
            "custom_fields.enum_value.color",
            "custom_fields.multi_enum_values.name",
            "custom_fields.multi_enum_values.color",
            "custom_fields.people_value.name",
            "custom_fields.people_value.email",
            "custom_fields.resource_subtype",
            "due_on",
            "start_on",
          ].join(",");
          const portfolioRows = await Promise.all(
            basePortfolios.map(async (p: any) => {
              let detail: any = {};
              try {
                const det = await asanaFetch(
                  `/portfolios/${p.gid}?opt_fields=${portfolioDetailFields}`,
                  resolvedToken,
                );
                detail = det.data || {};
              } catch (_e) {
                detail = {};
              }
              const requestedFields = [...new Set([...itemFields.split(","), ...portfolioDetailFields.split(",")])];
              const diagnostics: Record<string, unknown> = {
                base_current_status_update: p.current_status_update ?? null,
                base_current_status: p.current_status ?? null,
                base_status: p.status ?? null,
                base_status_color: p.status_color ?? null,
                base_custom_field_settings: Array.isArray(p?.custom_field_settings)
                  ? p.custom_field_settings.map((setting: any) => ({
                      custom_field: {
                        name: setting?.custom_field?.name ?? null,
                        display_value: setting?.custom_field?.display_value ?? null,
                        text_value: setting?.custom_field?.text_value ?? null,
                        number_value: setting?.custom_field?.number_value ?? null,
                        enum_value: setting?.custom_field?.enum_value
                          ? {
                              name: setting.custom_field.enum_value?.name ?? null,
                              color: setting.custom_field.enum_value?.color ?? null,
                            }
                          : null,
                        multi_enum_values: Array.isArray(setting?.custom_field?.multi_enum_values)
                          ? setting.custom_field.multi_enum_values.map((value: any) => ({
                              name: value?.name ?? null,
                              color: value?.color ?? null,
                            }))
                          : [],
                      },
                    }))
                  : [],
                current_status_update: detail?.current_status_update ?? p.current_status_update ?? null,
                current_status: detail?.current_status ?? p.current_status ?? null,
                status: detail?.status ?? p.status ?? null,
                status_color: detail?.status_color ?? p.status_color ?? null,
                color: detail?.color ?? p.color ?? null,
                custom_fields: Array.isArray(detail?.custom_fields?.length ? detail.custom_fields : p?.custom_fields)
                  ? (detail?.custom_fields?.length ? detail.custom_fields : p.custom_fields).map((cf: any) => ({
                      name: cf?.name ?? null,
                      display_value: cf?.display_value ?? null,
                      text_value: cf?.text_value ?? null,
                      number_value: cf?.number_value ?? null,
                      enum_value: cf?.enum_value
                        ? {
                            name: cf.enum_value?.name ?? null,
                            color: cf.enum_value?.color ?? null,
                          }
                        : null,
                      multi_enum_values: Array.isArray(cf?.multi_enum_values)
                        ? cf.multi_enum_values.map((value: any) => ({
                            name: value?.name ?? null,
                            color: value?.color ?? null,
                          }))
                        : [],
                    }))
                  : [],
              };

              let expandedStatusUpdate: any = null;
              const stubGid = detail?.current_status_update?.gid || p.current_status_update?.gid || null;
              if (stubGid) {
                try {
                  const statusUpdateDetail = await asanaFetch(
                    `/status_updates/${stubGid}?opt_fields=gid,status_type,title,text,html_text,created_at,resource_subtype,parent.name,parent.gid,created_by.name,created_by.email`,
                    resolvedToken,
                  );
                  expandedStatusUpdate = statusUpdateDetail.data || null;
                } catch (e) {
                  console.warn(`[portfolio_projects] current_status_update expand failed for ${p.gid} via ${stubGid}: ${e}`);
                }
              }

              let latestStatusType: string | null = null;
              let latestStatusTitle: string | null = null;
              let rawStatusValue: string | null = null;
              let normalizedStatus: string | null = null;
              let statusSource: string | null = null;

              const applyStatus = (candidate: unknown, source: string, title?: unknown) => {
                if (latestStatusType) return;
                const normalized = normalizeInitiativeStatus(candidate);
                if (!normalized.key) return;
                latestStatusType = normalized.key;
                latestStatusTitle = typeof title === "string" && title.trim() ? title : latestStatusTitle;
                rawStatusValue = typeof candidate === "string" ? candidate : JSON.stringify(candidate);
                normalizedStatus = normalized.label;
                statusSource = source;
              };

              applyStatus(p?.current_status_update?.status_type, "item.current_status_update.status_type", p?.current_status_update?.title);
              applyStatus(detail?.current_status_update?.status_type, "current_status_update.status_type", detail?.current_status_update?.title);
              applyStatus(expandedStatusUpdate?.status_type, "current_status_update.expand.status_type", expandedStatusUpdate?.title);
              applyStatus(p?.current_status?.status_type, "item.current_status.status_type", p?.current_status?.title);
              applyStatus(p?.status, "item.status", p?.current_status?.title);
              applyStatus(p?.status_color, "item.status_color", p?.current_status?.title);
              applyStatus(p?.current_status?.color, "item.current_status.color", p?.current_status?.title);
              applyStatus(detail?.current_status?.status_type, "current_status.status_type", detail?.current_status?.title);
              applyStatus(detail?.status, "status", detail?.current_status?.title);
              applyStatus(detail?.status_color, "status_color", detail?.current_status?.title);
              applyStatus(detail?.current_status?.color, "current_status.color", detail?.current_status?.title);
              applyStatus(detail?.color, "portfolio.color", detail?.current_status?.title);

              const customFields: any[] = Array.isArray(detail?.custom_fields) && detail.custom_fields.length
                ? detail.custom_fields
                : Array.isArray(p?.custom_fields)
                  ? p.custom_fields
                  : [];
              for (const cf of customFields) {
                const fieldName = String(cf?.name || "");
                const fieldKey = fieldName.trim().toLowerCase();
                const isLikelyStatusField = /status|health|rag|state|condition/.test(fieldKey);
                const candidates = [
                  { value: cf?.enum_value?.name, source: `custom_field.enum_value:${fieldName}` },
                  { value: cf?.display_value, source: `custom_field.display_value:${fieldName}` },
                  { value: cf?.text_value, source: `custom_field.text_value:${fieldName}` },
                ];
                if (Array.isArray(cf?.multi_enum_values) && cf.multi_enum_values.length) {
                  for (const option of cf.multi_enum_values) {
                    candidates.push({ value: option?.name, source: `custom_field.multi_enum:${fieldName}` });
                    candidates.push({ value: option?.color, source: `custom_field.multi_enum_color:${fieldName}` });
                  }
                }
                if (cf?.enum_value?.color) {
                  candidates.push({ value: cf.enum_value.color, source: `custom_field.enum_color:${fieldName}` });
                }
                for (const candidate of candidates) {
                  if (!candidate.value) continue;
                  if (!isLikelyStatusField) {
                    const normalized = normalizeInitiativeStatus(candidate.value);
                    if (!normalized.key) continue;
                  }
                  applyStatus(candidate.value, candidate.source, fieldName);
                }
              }

              const baseCustomFieldSettings: any[] = Array.isArray(p?.custom_field_settings) ? p.custom_field_settings : [];
              for (const setting of baseCustomFieldSettings) {
                const fieldName = String(setting?.custom_field?.name || "");
                const fieldKey = fieldName.trim().toLowerCase();
                const isLikelyStatusField = /status|health|rag|state|condition/.test(fieldKey);
                const values = [
                  { value: setting?.custom_field?.enum_value?.name, source: `item.custom_field_settings.enum_value:${fieldName}` },
                  { value: setting?.custom_field?.enum_value?.color, source: `item.custom_field_settings.enum_color:${fieldName}` },
                  { value: setting?.custom_field?.display_value, source: `item.custom_field_settings.display_value:${fieldName}` },
                  { value: setting?.custom_field?.text_value, source: `item.custom_field_settings.text_value:${fieldName}` },
                ];
                if (Array.isArray(setting?.custom_field?.multi_enum_values)) {
                  for (const option of setting.custom_field.multi_enum_values) {
                    values.push({ value: option?.name, source: `item.custom_field_settings.multi_enum:${fieldName}` });
                    values.push({ value: option?.color, source: `item.custom_field_settings.multi_enum_color:${fieldName}` });
                  }
                }
                for (const candidate of values) {
                  if (!candidate.value) continue;
                  if (!isLikelyStatusField) {
                    const normalized = normalizeInitiativeStatus(candidate.value);
                    if (!normalized.key) continue;
                  }
                  applyStatus(candidate.value, candidate.source, fieldName);
                }
              }

              if (!latestStatusType) {
                try {
                  const stUp = await asanaFetch(
                    `/status_updates?parent=${p.gid}&limit=10&opt_fields=gid,status_type,title,text,html_text,created_at,resource_subtype,created_by.name,created_by.email`,
                    resolvedToken,
                  );
                  diagnostics.status_updates_list = stUp.data || [];
                  const latest = (stUp.data || [])[0];
                  if (latest?.status_type) {
                    const normalized = normalizeInitiativeStatus(latest.status_type);
                    latestStatusType = normalized.key || latest.status_type;
                    latestStatusTitle = latest.title || latestStatusTitle;
                    rawStatusValue = latest.status_type;
                    normalizedStatus = normalized.label;
                    statusSource = "status_updates_endpoint";
                  }
                } catch (e) {
                  console.warn(`[portfolio_projects] status_updates fallback failed for ${p.gid}: ${e}`);
                }
              }

              diagnostics.expanded_status_update = expandedStatusUpdate;
              console.log(
                `[portfolio_projects][portfolio][diag] ${JSON.stringify({
                  gid: p.gid,
                  name: detail?.name || p.name,
                  item_type: "portfolio",
                  requested_fields: requestedFields,
                  status_source_used: statusSource || "none",
                  raw_status_value: rawStatusValue,
                  normalized_status: normalizedStatus,
                  available_status_fields: diagnostics,
                })}`,
              );
              const candidates: Array<{ name: string | null; email: string | null; source: string }> = [];
              if (detail?.owner?.name || detail?.owner?.email) {
                candidates.push({
                  name: detail.owner.name || null,
                  email: detail.owner.email || null,
                  source: "owner",
                });
              }
              const primary = candidates[0] || { name: null, email: null, source: null };
              return {
                gid: p.gid,
                name: detail?.name || p.name,
                item_type: "portfolio",
                permalink_url: detail?.permalink_url || p.permalink_url || null,
                owner: primary.name,
                owner_email: primary.email,
                owner_source: primary.source,
                owner_candidates: candidates,
                status_type: latestStatusType,
                status_title: latestStatusTitle,
                due_on: detail?.due_on || p.due_on || p.due_date || null,
                start_on: detail?.start_on || p.start_on || null,
                status_source_used: statusSource,
                raw_status_value: rawStatusValue,
                normalized_status: normalizedStatus,
              };
            }),
          );

          const combined = [...portfolioRows, ...projects];
          console.log(
            `[portfolio_projects] returning ${combined.length} rows (projects=${projects.length}, portfolios=${portfolioRows.length})`,
          );
          result = { success: true, projects: combined, item_counts: typeCounts };
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error fetching portfolio projects";
          result = { success: false, error: msg, projects: [] };
        }
        break;
      }

      default:
        result = { success: false, error: `Unknown action: ${action}` };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Asana proxy error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
