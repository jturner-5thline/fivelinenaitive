import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, token, ...params } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: "Token is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    let result: Record<string, unknown> = {};

    switch (action) {
      case "test": {
        // Verify token by fetching user info and workspaces
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
        const me = await asanaFetch("/users/me", token);
        result = { success: true, workspaces: me.data?.workspaces || [] };
        break;
      }

      case "projects": {
        const workspace = params.workspace_gid;
        const data = await asanaFetch(
          `/projects?workspace=${workspace}&opt_fields=name,color,archived,created_at`,
          token
        );
        result = { success: true, projects: data.data || [] };
        break;
      }

      case "tasks": {
        const project = params.project_gid;
        const data = await asanaFetch(
          `/tasks?project=${project}&opt_fields=name,completed,due_on,assignee.name,assignee.email,notes,tags.name,created_at,modified_at`,
          token
        );
        result = { success: true, tasks: data.data || [] };
        break;
      }

      case "create_task": {
        const data = await asanaFetch("/tasks", token, {
          method: "POST",
          body: JSON.stringify({ data: params.task_data }),
        });
        result = { success: true, task: data.data };
        break;
      }

      case "update_task": {
        const data = await asanaFetch(`/tasks/${params.task_gid}`, token, {
          method: "PUT",
          body: JSON.stringify({ data: params.task_data }),
        });
        result = { success: true, task: data.data };
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
