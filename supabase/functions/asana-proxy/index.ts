import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ASANA_API = "https://app.asana.com/api/1.0";

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
          result = { success: true, milestones, project_count: projects.length };
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error fetching portfolio milestones";
          result = { success: false, error: msg, milestones: [] };
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
