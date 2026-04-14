import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ASANA_API = "https://app.asana.com/api/1.0";
const PORTFOLIO_GID = "1211488283335033";

async function asanaFetch(path: string, token: string) {
  const res = await fetch(`${ASANA_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Asana API [${res.status}]: ${text}`);
  }
  return res.json();
}

async function asanaFetchAll(path: string, token: string): Promise<any[]> {
  let all: any[] = [];
  let url = `${ASANA_API}${path}`;
  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Asana API [${res.status}]: ${text}`);
    }
    const json = await res.json();
    all = all.concat(json.data || []);
    url = json.next_page?.uri || null;
  }
  return all;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const authHeader = req.headers.get("Authorization") || "";
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find user's Asana integration
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get user's company
    const { data: membership } = await serviceClient
      .from("company_members")
      .select("company_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership?.company_id) {
      return new Response(JSON.stringify({ error: "No company found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get Asana integration token
    const { data: integration } = await serviceClient
      .from("integrations")
      .select("id, config")
      .eq("company_id", membership.company_id)
      .eq("type", "asana")
      .eq("status", "connected")
      .maybeSingle();

    if (!integration?.config?.api_token) {
      return new Response(JSON.stringify({ 
        error: "No Asana integration configured",
        summary: { total_projects: 0, overdue_count: 0, due_today_count: 0, upcoming_milestones_count: 0, total_open_tasks: 0 },
        projects: [],
        overdue_tasks: [],
        overdue_milestones: [],
        today_items: [],
        upcoming_milestones: [],
        upcoming_tasks: [],
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = integration.config.api_token as string;

    // 1. Fetch portfolio items (projects)
    const portfolioItems = await asanaFetchAll(
      `/portfolios/${PORTFOLIO_GID}/items?opt_fields=name,owner.name,owner.email,due_on,start_on,current_status_update.title,current_status_update.status_type,current_status_update.text,color,completed,archived`,
      token
    );

    const activeProjects = portfolioItems.filter((p: any) => !p.archived && !p.completed);

    // 2. For each active project, fetch tasks (limit to first 10 projects for perf)
    const projectsToFetch = activeProjects.slice(0, 10);
    const allTasks: any[] = [];
    const projectMap: Record<string, string> = {};

    await Promise.all(projectsToFetch.map(async (project: any) => {
      try {
        const tasks = await asanaFetchAll(
          `/tasks?project=${project.gid}&opt_fields=name,completed,due_on,assignee.name,assignee.email,resource_subtype,notes,tags.name,created_at,modified_at&completed_since=now`,
          token
        );
        for (const t of tasks) {
          t._project_name = project.name;
          t._project_gid = project.gid;
          projectMap[project.gid] = project.name;
          allTasks.push(t);
        }
      } catch (e) {
        console.error(`Failed to fetch tasks for project ${project.name}:`, e);
      }
    }));

    // Separate milestones vs tasks
    const milestones = allTasks.filter((t: any) => t.resource_subtype === 'milestone');
    const regularTasks = allTasks.filter((t: any) => t.resource_subtype !== 'milestone');

    // Classify by date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    function classifyDate(dueOn: string | null) {
      if (!dueOn) return 'no_date';
      if (dueOn < todayStr) return 'overdue';
      if (dueOn === todayStr) return 'today';
      return 'upcoming';
    }

    function daysOverdue(dueOn: string): number {
      const due = new Date(dueOn);
      const diff = today.getTime() - due.getTime();
      return Math.floor(diff / (1000 * 60 * 60 * 24));
    }

    // Build structured response
    const projects = activeProjects.map((p: any) => ({
      gid: p.gid,
      name: p.name,
      owner: p.owner?.name || null,
      owner_email: p.owner?.email || null,
      due_on: p.due_on || null,
      start_on: p.start_on || null,
      color: p.color || null,
      status_type: p.current_status_update?.status_type || null,
      status_title: p.current_status_update?.title || null,
      status_text: p.current_status_update?.text || null,
    }));

    const formatTask = (t: any) => ({
      gid: t.gid,
      name: t.name,
      assignee: t.assignee?.name || null,
      assignee_email: t.assignee?.email || null,
      due_on: t.due_on || null,
      completed: t.completed || false,
      is_milestone: t.resource_subtype === 'milestone',
      project_name: t._project_name,
      project_gid: t._project_gid,
      date_class: classifyDate(t.due_on),
      days_overdue: t.due_on && classifyDate(t.due_on) === 'overdue' ? daysOverdue(t.due_on) : 0,
      tags: (t.tags || []).map((tag: any) => tag.name),
    });

    const overdueTasks = regularTasks
      .filter((t: any) => classifyDate(t.due_on) === 'overdue')
      .map(formatTask)
      .sort((a: any, b: any) => b.days_overdue - a.days_overdue);

    const overdueMilestones = milestones
      .filter((t: any) => classifyDate(t.due_on) === 'overdue')
      .map(formatTask)
      .sort((a: any, b: any) => b.days_overdue - a.days_overdue);

    const todayTasks = [...regularTasks, ...milestones]
      .filter((t: any) => classifyDate(t.due_on) === 'today')
      .map(formatTask);

    const upcomingMilestones = milestones
      .filter((t: any) => classifyDate(t.due_on) === 'upcoming')
      .map(formatTask)
      .sort((a: any, b: any) => (a.due_on || '').localeCompare(b.due_on || ''));

    const upcomingTasks = regularTasks
      .filter((t: any) => classifyDate(t.due_on) === 'upcoming')
      .map(formatTask)
      .sort((a: any, b: any) => (a.due_on || '').localeCompare(b.due_on || ''))
      .slice(0, 20);

    // Summary counts
    const summary = {
      total_projects: activeProjects.length,
      overdue_count: overdueTasks.length + overdueMilestones.length,
      due_today_count: todayTasks.length,
      upcoming_milestones_count: upcomingMilestones.length,
      total_open_tasks: regularTasks.length,
    };

    return new Response(JSON.stringify({
      summary,
      projects,
      overdue_tasks: overdueTasks,
      overdue_milestones: overdueMilestones,
      today_items: todayTasks,
      upcoming_milestones: upcomingMilestones,
      upcoming_tasks: upcomingTasks,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("briefing-operational error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
      fallback: true,
      summary: { total_projects: 0, overdue_count: 0, due_today_count: 0, upcoming_milestones_count: 0, total_open_tasks: 0 },
      projects: [],
      overdue_tasks: [],
      overdue_milestones: [],
      today_items: [],
      upcoming_milestones: [],
      upcoming_tasks: [],
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
