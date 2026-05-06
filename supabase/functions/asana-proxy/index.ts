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
        const data = await asanaFetch("/tasks", resolvedToken, {
          method: "POST",
          body: JSON.stringify({ data: params.task_data }),
        });
        console.log("Asana task created:", JSON.stringify(data.data));
        result = { success: true, task: data.data };
        break;
      }

      case "update_task": {
        const resolvedToken = await resolveToken(token, integration_id);
        const data = await asanaFetch(`/tasks/${params.task_gid}`, resolvedToken, {
          method: "PUT",
          body: JSON.stringify({ data: params.data }),
        });
        result = { success: true, task: data.data };
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
                { resource_type: "task", action: "changed", fields: ["completed", "name", "due_on", "assignee"] }
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
        // We use workspace_gid as the primary scope.
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
          const data = await asanaFetch(
            `/goals?workspace=${workspace}&is_workspace_level=true&limit=100&opt_fields=${optFields}`,
            resolvedToken
          );
          result = { success: true, goals: data.data || [] };
        } catch (e) {
          // Fallback: some workspaces require team scope. Return clear error.
          const msg = e instanceof Error ? e.message : "Unknown error fetching goals";
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
            "current_status_update.status_type",
            "current_status_update.title",
            "due_date",
            "due_on",
            "start_on",
          ].join(",");
          const items = await asanaFetch(
            `/portfolios/${portfolioGid}/items?opt_fields=${itemFields}`,
            resolvedToken,
          );
          const projects = (items.data || []).filter(
            (it: any) => it.resource_type === "project" && !it.archived
          ).map((p: any) => ({
            gid: p.gid,
            name: p.name,
            permalink_url: p.permalink_url || null,
            owner: p.owner?.name || null,
            owner_email: p.owner?.email || null,
            status_type: p.current_status_update?.status_type || null,
            status_title: p.current_status_update?.title || null,
            due_on: p.due_on || p.due_date || null,
            start_on: p.start_on || null,
          }));
          result = { success: true, projects };
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
