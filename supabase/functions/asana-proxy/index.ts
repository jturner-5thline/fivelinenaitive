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
            "current_status_update.status_type",
            "current_status_update.title",
            "current_status_update.text",
            "current_status_update.created_at",
            "current_status.color",
            "current_status.title",
            "current_status.text",
            "color",
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
              // Fallback: fetch latest status update from dedicated endpoint
              // (Asana portfolios sometimes don't return current_status_update inline)
              let latestStatusType: string | null =
                detail?.current_status_update?.status_type ||
                p.current_status_update?.status_type ||
                null;
              let latestStatusTitle: string | null =
                detail?.current_status_update?.title ||
                p.current_status_update?.title ||
                null;
              let statusSource = latestStatusType ? "current_status_update" : null;
              // Legacy current_status.color mapping
              if (!latestStatusType && (detail?.current_status?.color || detail?.color)) {
                const colorRaw = (detail?.current_status?.color || detail?.color || "").toLowerCase();
                const colorMap: Record<string, string> = {
                  green: "on_track",
                  yellow: "at_risk",
                  red: "off_track",
                  blue: "on_hold",
                  complete: "complete",
                };
                if (colorMap[colorRaw]) {
                  latestStatusType = colorMap[colorRaw];
                  latestStatusTitle = detail?.current_status?.title || latestStatusTitle;
                  statusSource = "current_status.color";
                }
              }
              if (!latestStatusType) {
                try {
                  const stUp = await asanaFetch(
                    `/status_updates?parent=${p.gid}&limit=1&opt_fields=status_type,title,text,created_at`,
                    resolvedToken,
                  );
                  const latest = (stUp.data || [])[0];
                  if (latest?.status_type) {
                    latestStatusType = latest.status_type;
                    latestStatusTitle = latest.title || latestStatusTitle;
                    statusSource = "status_updates_endpoint";
                  }
                } catch (e) {
                  console.warn(`[portfolio_projects] status_updates fallback failed for ${p.gid}: ${e}`);
                }
              }
              console.log(
                `[portfolio_projects][portfolio] gid=${p.gid} name=${detail?.name || p.name} status_type=${latestStatusType} source=${statusSource || "none"}`,
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
