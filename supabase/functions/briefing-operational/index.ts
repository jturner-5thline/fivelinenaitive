import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ASANA_API = "https://app.asana.com/api/1.0";
const PORTFOLIO_GID = "1211488283335033";
const RECENT_COMPLETED_DAYS = 7;
const TASK_FIELDS = [
  'name',
  'assignee',
  'assignee.name',
  'due_on',
  'completed',
  'completed_at',
  'memberships.section.name',
  'permalink_url',
  'modified_at',
  'created_at',
  'resource_subtype',
].join(',');
const PORTFOLIO_ITEM_FIELDS = [
  'name',
  'resource_type',
  'resource_subtype',
  'permalink_url',
  'owner.name',
  'owner.email',
  'due_on',
  'start_on',
  'current_status_update.title',
  'current_status_update.status_type',
  'current_status_update.text',
  'color',
  'completed',
  'archived',
].join(',');

type ProjectRecord = {
  gid: string;
  name: string;
  permalink_url: string | null;
  owner: string | null;
  owner_email: string | null;
  due_on: string | null;
  start_on: string | null;
  color: string | null;
  status_type: string | null;
  status_title: string | null;
  status_text: string | null;
};

type OperationalTask = {
  gid: string;
  name: string;
  assignee: string | null;
  due_on: string | null;
  completed: boolean;
  completed_at: string | null;
  project_name: string;
  project_gid: string;
  project_permalink_url: string | null;
  permalink_url: string | null;
  section_name: string | null;
  is_milestone: boolean;
  days_overdue: number;
  last_activity_at: string | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function emptyPayload(error?: string) {
  return {
    error,
    fallback: Boolean(error),
    counts: {
      projects: 0,
      overdue: 0,
      today: 0,
      upcoming: 0,
    },
    summary: {
      total_projects: 0,
      overdue_count: 0,
      due_today_count: 0,
      upcoming_milestones_count: 0,
      total_open_tasks: 0,
    },
    projects: [],
    overdue: [],
    today: [],
    upcoming: [],
    recentlyCompleted: [],
  };
}

async function asanaFetchAll(pathOrUrl: string, token: string): Promise<any[]> {
  let url = pathOrUrl.startsWith('http') ? pathOrUrl : `${ASANA_API}${pathOrUrl}`;
  const items: any[] = [];

  while (url) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Asana API [${res.status}]: ${text}`);
    }

    const json = await res.json();
    items.push(...(json.data || []));
    url = json.next_page?.uri || '';
  }

  return items;
}

function getTodayString() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.toISOString().split('T')[0];
}

function getDaysOverdue(dueOn: string, todayString: string) {
  const due = new Date(`${dueOn}T00:00:00`);
  const today = new Date(`${todayString}T00:00:00`);
  return Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
}

function buildProjectTasksPath(projectGid: string, completedSince: string) {
  const params = new URLSearchParams({
    opt_fields: TASK_FIELDS,
    completed_since: completedSince,
  });

  return `/projects/${projectGid}/tasks?${params.toString()}`;
}

async function collectProjectsFromPortfolio(
  portfolioGid: string,
  token: string,
  seenPortfolios: Set<string>,
  projectsById: Map<string, ProjectRecord>,
) {
  if (seenPortfolios.has(portfolioGid)) return;
  seenPortfolios.add(portfolioGid);

  const params = new URLSearchParams({ opt_fields: PORTFOLIO_ITEM_FIELDS });
  const items = await asanaFetchAll(`/portfolios/${portfolioGid}/items?${params.toString()}`, token);

  for (const item of items) {
    const itemType = item.resource_type || item.resource_subtype;

    if (itemType === 'portfolio') {
      await collectProjectsFromPortfolio(item.gid, token, seenPortfolios, projectsById);
      continue;
    }

    if (itemType !== 'project' || item.archived || item.completed) continue;

    projectsById.set(item.gid, {
      gid: item.gid,
      name: item.name,
      permalink_url: item.permalink_url || null,
      owner: item.owner?.name || null,
      owner_email: item.owner?.email || null,
      due_on: item.due_on || null,
      start_on: item.start_on || null,
      color: item.color || null,
      status_type: item.current_status_update?.status_type || null,
      status_title: item.current_status_update?.title || null,
      status_text: item.current_status_update?.text || null,
    });
  }
}

function normalizeTask(task: any, project: ProjectRecord, todayString: string): OperationalTask {
  const dueOn = task.due_on || null;
  const isOverdue = Boolean(dueOn && !task.completed && dueOn < todayString);

  return {
    gid: task.gid,
    name: task.name,
    assignee: task.assignee?.name || null,
    due_on: dueOn,
    completed: Boolean(task.completed),
    completed_at: task.completed_at || null,
    project_name: project.name,
    project_gid: project.gid,
    project_permalink_url: project.permalink_url,
    permalink_url: task.permalink_url || null,
    section_name: task.memberships?.find((membership: any) => membership.section?.name)?.section?.name || null,
    is_milestone: task.resource_subtype === 'milestone',
    days_overdue: isOverdue && dueOn ? getDaysOverdue(dueOn, todayString) : 0,
    last_activity_at: task.completed_at || task.modified_at || task.created_at || null,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization') || '';
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: 'Unauthorized', fallback: true }, 401);
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: membership } = await serviceClient
      .from('company_members')
      .select('company_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership?.company_id) {
      return jsonResponse(emptyPayload('No company found'));
    }

    const { data: integration } = await serviceClient
      .from('integrations')
      .select('id, config')
      .eq('company_id', membership.company_id)
      .eq('type', 'asana')
      .eq('status', 'connected')
      .maybeSingle();

    if (!integration?.config?.api_token) {
      return jsonResponse(emptyPayload('No Asana integration configured'));
    }

    const token = integration.config.api_token as string;
    const todayString = getTodayString();
    const recentCutoff = new Date(Date.now() - RECENT_COMPLETED_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const projectsById = new Map<string, ProjectRecord>();
    await collectProjectsFromPortfolio(PORTFOLIO_GID, token, new Set<string>(), projectsById);
    const projects = Array.from(projectsById.values()).sort((a, b) => a.name.localeCompare(b.name));

    const taskGroups = await Promise.all(projects.map(async (project) => {
      const [openTasks, recentTasks] = await Promise.all([
        asanaFetchAll(buildProjectTasksPath(project.gid, 'now'), token),
        asanaFetchAll(buildProjectTasksPath(project.gid, recentCutoff), token),
      ]);

      const tasksById = new Map<string, any>();
      for (const task of [...openTasks, ...recentTasks]) {
        tasksById.set(task.gid, task);
      }

      return {
        project,
        tasks: Array.from(tasksById.values()).map((task) => normalizeTask(task, project, todayString)),
      };
    }));

    const allTasks = taskGroups.flatMap((group) => group.tasks);

    const overdue = allTasks
      .filter((task) => !task.completed && !!task.due_on && task.due_on < todayString)
      .sort((a, b) => b.days_overdue - a.days_overdue || a.name.localeCompare(b.name));

    const today = allTasks
      .filter((task) => !task.completed && task.due_on === todayString)
      .sort((a, b) => a.name.localeCompare(b.name));

    const upcoming = allTasks
      .filter((task) => !task.completed && !!task.due_on && task.due_on > todayString)
      .sort((a, b) => (a.due_on || '').localeCompare(b.due_on || '') || a.name.localeCompare(b.name));

    const recentlyCompleted = allTasks
      .filter((task) => task.completed && !!task.completed_at && task.completed_at >= recentCutoff)
      .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));

    const projectsWithStats = taskGroups.map(({ project, tasks }) => {
      const lastActivityAt = tasks
        .map((task) => task.last_activity_at)
        .filter(Boolean)
        .sort()
        .at(-1) || null;

      return {
        ...project,
        task_count: tasks.length,
        last_activity_at: lastActivityAt,
      };
    });

    const counts = {
      projects: projectsWithStats.length,
      overdue: overdue.length,
      today: today.length,
      upcoming: upcoming.length,
    };

    return jsonResponse({
      counts,
      summary: {
        total_projects: counts.projects,
        overdue_count: counts.overdue,
        due_today_count: counts.today,
        upcoming_milestones_count: counts.upcoming,
        total_open_tasks: overdue.length + today.length + upcoming.length,
      },
      projects: projectsWithStats,
      overdue,
      today,
      upcoming,
      recentlyCompleted,
    });
  } catch (error) {
    console.error('briefing-operational error:', error);
    return jsonResponse(emptyPayload(error instanceof Error ? error.message : 'Unknown error'));
  }
});