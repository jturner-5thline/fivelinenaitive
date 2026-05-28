import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ASANA_API = "https://app.asana.com/api/1.0";
const PORTFOLIO_GID = "1211488283335033";
const RECENT_COMPLETED_DAYS = 7;
const BATCH_SIZE = 3; // Process 3 projects at a time
const DELAY_MS = 200; // 200ms between batches
const MAX_RETRIES = 3;

const TASK_FIELDS = [
  'name', 'assignee', 'assignee.name', 'due_on', 'completed', 'completed_at',
  'memberships.section.name', 'permalink_url', 'modified_at', 'created_at', 'resource_subtype',
].join(',');

const PORTFOLIO_ITEM_FIELDS = [
  'name', 'resource_type', 'resource_subtype', 'permalink_url',
  'owner.name', 'owner.email', 'due_on', 'start_on',
  'current_status_update.title', 'current_status_update.status_type', 'current_status_update.text',
  'color', 'completed', 'archived',
].join(',');

type ProjectRecord = {
  gid: string; name: string; permalink_url: string | null;
  owner: string | null; owner_email: string | null;
  due_on: string | null; start_on: string | null; color: string | null;
  status_type: string | null; status_title: string | null; status_text: string | null;
};

type OperationalTask = {
  gid: string; name: string; assignee: string | null; due_on: string | null;
  completed: boolean; completed_at: string | null;
  project_name: string; project_gid: string; project_permalink_url: string | null;
  permalink_url: string | null; section_name: string | null;
  is_milestone: boolean; days_overdue: number; last_activity_at: string | null;
};

// ── In-memory cache (keyed by assignee filter so different users don't bleed) ──
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cacheByKey = new Map<string, { data: unknown; timestamp: number }>();

function getCached(key: string): unknown | null {
  const entry = cacheByKey.get(key);
  if (entry && (Date.now() - entry.timestamp) < CACHE_TTL_MS) {
    return entry.data;
  }
  if (entry) cacheByKey.delete(key);
  return null;
}

function setCache(key: string, data: unknown) {
  cacheByKey.set(key, { data, timestamp: Date.now() });
}

// Allow-list mirror of briefing-for-user (src/constants/nikiBriefing.ts).
// Callers in NIKI_BRIEFING_ALLOWED_EMAILS may request the Niki Heikali
// assignee filter — including Niki herself for her own briefing.
const DELEGATE_ACCESS: Record<string, Set<string>> = {
  'jturner@5thline.co': new Set(['Niki Heikali', 'John Moffitt']),
  'nheikali@5thline.co': new Set(['Niki Heikali']),
  'ppina@5thline.co': new Set(['Niki Heikali']),
  'ffustinoni@5thline.co': new Set(['Niki Heikali']),
  'jmoffitt@5thline.co': new Set(['John Moffitt']),
};

function isAllowedAssigneeDelegate(callerEmail: string | undefined, assigneeName: string): boolean {
  if (!callerEmail) return false;
  const allowed = DELEGATE_ACCESS[callerEmail.toLowerCase()];
  return !!allowed && allowed.has(assigneeName);
}

// ── Helpers ──────────────────────────────────────────────────
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function emptyPayload(error?: string) {
  return {
    error, fallback: Boolean(error),
    counts: { projects: 0, overdue: 0, today: 0, upcoming: 0 },
    summary: { total_projects: 0, overdue_count: 0, due_today_count: 0, upcoming_milestones_count: 0, total_open_tasks: 0 },
    projects: [], overdue: [], today: [], upcoming: [], recentlyCompleted: [],
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Asana fetch with retry + backoff ─────────────────────────
async function asanaFetchWithRetry(url: string, token: string, attempt = 0): Promise<Response> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });

  if (res.status === 429 && attempt < MAX_RETRIES) {
    const retryAfter = res.headers.get('Retry-After');
    const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, attempt) * 1000;
    console.log(`Rate limited, retry ${attempt + 1}/${MAX_RETRIES} after ${waitMs}ms`);
    await sleep(waitMs);
    return asanaFetchWithRetry(url, token, attempt + 1);
  }

  return res;
}

async function asanaFetchAll(pathOrUrl: string, token: string): Promise<any[]> {
  let url = pathOrUrl.startsWith('http') ? pathOrUrl : `${ASANA_API}${pathOrUrl}`;
  const items: any[] = [];

  while (url) {
    const res = await asanaFetchWithRetry(url, token);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Asana API [${res.status}]: ${text}`);
    }

    const json = await res.json();
    items.push(...(json.data || []));
    url = json.next_page?.uri || '';

    // Small delay between pagination calls
    if (url) await sleep(100);
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

// ── Portfolio collection (recursive, with delays) ────────────
async function collectProjectsFromPortfolio(
  portfolioGid: string, token: string,
  seenPortfolios: Set<string>, projectsById: Map<string, ProjectRecord>,
) {
  if (seenPortfolios.has(portfolioGid)) return;
  seenPortfolios.add(portfolioGid);

  const params = new URLSearchParams({ opt_fields: PORTFOLIO_ITEM_FIELDS });
  const items = await asanaFetchAll(`/portfolios/${portfolioGid}/items?${params.toString()}`, token);

  for (const item of items) {
    const itemType = item.resource_type || item.resource_subtype;

    if (itemType === 'portfolio') {
      await sleep(DELAY_MS);
      await collectProjectsFromPortfolio(item.gid, token, seenPortfolios, projectsById);
      continue;
    }

    if (itemType !== 'project' || item.archived || item.completed) continue;

    projectsById.set(item.gid, {
      gid: item.gid, name: item.name,
      permalink_url: item.permalink_url || null,
      owner: item.owner?.name || null, owner_email: item.owner?.email || null,
      due_on: item.due_on || null, start_on: item.start_on || null, color: item.color || null,
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
    gid: task.gid, name: task.name, assignee: task.assignee?.name || null,
    due_on: dueOn, completed: Boolean(task.completed), completed_at: task.completed_at || null,
    project_name: project.name, project_gid: project.gid,
    project_permalink_url: project.permalink_url, permalink_url: task.permalink_url || null,
    section_name: task.memberships?.find((m: any) => m.section?.name)?.section?.name || null,
    is_milestone: task.resource_subtype === 'milestone',
    days_overdue: isOverdue && dueOn ? getDaysOverdue(dueOn, todayString) : 0,
    last_activity_at: task.completed_at || task.modified_at || task.created_at || null,
  };
}

// ── Fetch tasks for a single project (1 API call instead of 2) ──
async function fetchProjectTasks(project: ProjectRecord, token: string, recentCutoff: string) {
  // completed_since=recentCutoff returns all incomplete tasks PLUS tasks completed after the cutoff
  const params = new URLSearchParams({ opt_fields: TASK_FIELDS, completed_since: recentCutoff });
  const tasks = await asanaFetchAll(`/projects/${project.gid}/tasks?${params}`, token);
  return tasks;
}

// ── Main handler ─────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Read optional targetAssigneeName from query string OR body
    const url = new URL(req.url);
    let targetAssigneeName = url.searchParams.get('targetAssigneeName') || '';

    if (!targetAssigneeName && (req.method === 'POST' || req.method === 'PUT')) {
      try {
        const body = await req.clone().json();
        if (typeof body?.targetAssigneeName === 'string') {
          targetAssigneeName = body.targetAssigneeName;
        }
      } catch {
        // ignore non-JSON bodies
      }
    }

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

    // If a targetAssigneeName is requested, verify the caller is allow-listed
    // for that assignee. Otherwise default to the caller's own briefing.
    if (targetAssigneeName && !isAllowedAssigneeDelegate(user.email, targetAssigneeName)) {
      console.warn(
        `[briefing-operational] DENIED assignee delegation: caller=${user.email} target=${targetAssigneeName}`
      );
      return jsonResponse({ error: 'Not authorized to view this user\'s operational briefing' }, 403);
    }

    // Cache key: per assignee filter so James's view and Niki's view stay separate
    const cacheKey = targetAssigneeName ? `assignee:${targetAssigneeName}` : 'self';
    const cached = getCached(cacheKey);
    if (cached) {
      console.log(`Returning cached operational data (${cacheKey})`);
      return jsonResponse(cached);
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: membership } = await serviceClient
      .from('company_members').select('company_id').eq('user_id', user.id).maybeSingle();

    if (!membership?.company_id) {
      return jsonResponse(emptyPayload('No company found'));
    }

    const { data: integration } = await serviceClient
      .from('integrations').select('id, config')
      .eq('company_id', membership.company_id).eq('type', 'asana').eq('status', 'connected')
      .maybeSingle();

    if (!integration?.config?.api_token) {
      return jsonResponse(emptyPayload('No Asana integration configured'));
    }

    const token = integration.config.api_token as string;
    const todayString = getTodayString();
    const recentCutoff = new Date(Date.now() - RECENT_COMPLETED_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Step 1: Collect all projects from portfolio tree
    const projectsById = new Map<string, ProjectRecord>();
    await collectProjectsFromPortfolio(PORTFOLIO_GID, token, new Set<string>(), projectsById);
    const projects = Array.from(projectsById.values()).sort((a, b) => a.name.localeCompare(b.name));

    console.log(`Found ${projects.length} projects, fetching tasks in batches of ${BATCH_SIZE}`);

    // Step 2: Fetch tasks in small sequential batches with delays
    const allTaskGroups: { project: ProjectRecord; tasks: OperationalTask[] }[] = [];
    const errors: string[] = [];

    for (let i = 0; i < projects.length; i += BATCH_SIZE) {
      const batch = projects.slice(i, i + BATCH_SIZE);

      // Process batch (small parallel within batch)
      const batchResults = await Promise.allSettled(
        batch.map(async (project) => {
          const rawTasks = await fetchProjectTasks(project, token, recentCutoff);
          return {
            project,
            tasks: rawTasks.map((t) => normalizeTask(t, project, todayString)),
          };
        })
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          allTaskGroups.push(result.value);
        } else {
          const errMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
          console.error('Batch project fetch failed:', errMsg);
          errors.push(errMsg);
        }
      }

      // Delay between batches (skip after last batch)
      if (i + BATCH_SIZE < projects.length) {
        await sleep(DELAY_MS);
      }
    }

    // Step 3: Classify tasks
    let allTasks = allTaskGroups.flatMap((g) => g.tasks);

    // If a target assignee was requested, filter tasks to that assignee only.
    if (targetAssigneeName) {
      const wanted = targetAssigneeName.toLowerCase();
      allTasks = allTasks.filter((t) => (t.assignee || '').toLowerCase() === wanted);
    }


    const overdue = allTasks
      .filter((t) => !t.completed && !!t.due_on && t.due_on < todayString)
      .sort((a, b) => b.days_overdue - a.days_overdue || a.name.localeCompare(b.name));

    const today = allTasks
      .filter((t) => !t.completed && t.due_on === todayString)
      .sort((a, b) => a.name.localeCompare(b.name));

    const upcoming = allTasks
      .filter((t) => !t.completed && !!t.due_on && t.due_on > todayString)
      .sort((a, b) => (a.due_on || '').localeCompare(b.due_on || '') || a.name.localeCompare(b.name));

    const recentlyCompleted = allTasks
      .filter((t) => t.completed && !!t.completed_at && t.completed_at >= recentCutoff)
      .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));

    // When filtering by assignee, project task_count should reflect ONLY the
    // visible (filtered) tasks so the project list lines up with what's shown.
    const filteredTaskGids = new Set(allTasks.map((t) => t.gid));
    const projectsWithStats = allTaskGroups.map(({ project, tasks }) => {
      const visibleTasks = targetAssigneeName
        ? tasks.filter((t) => filteredTaskGids.has(t.gid))
        : tasks;
      const lastActivityAt = visibleTasks.map((t) => t.last_activity_at).filter(Boolean).sort().at(-1) || null;
      return { ...project, task_count: visibleTasks.length, last_activity_at: lastActivityAt };
    });

    // Add projects that had errors with 0 task count
    const fetchedProjectGids = new Set(allTaskGroups.map((g) => g.project.gid));
    for (const project of projects) {
      if (!fetchedProjectGids.has(project.gid)) {
        projectsWithStats.push({ ...project, task_count: 0, last_activity_at: null });
      }
    }

    projectsWithStats.sort((a, b) => a.name.localeCompare(b.name));

    const counts = {
      projects: projectsWithStats.length,
      overdue: overdue.length,
      today: today.length,
      upcoming: upcoming.length,
    };

    const responseData = {
      counts,
      summary: {
        total_projects: counts.projects,
        overdue_count: counts.overdue,
        due_today_count: counts.today,
        upcoming_milestones_count: counts.upcoming,
        total_open_tasks: overdue.length + today.length + upcoming.length,
      },
      projects: projectsWithStats,
      overdue, today, upcoming, recentlyCompleted,
      // Include partial error info if some projects failed but we have data
      ...(errors.length > 0 && allTaskGroups.length > 0
        ? { partial: true, partialErrors: errors.length }
        : {}),
    };

    // Cache successful response per assignee key
    setCache(cacheKey, responseData);

    return jsonResponse(responseData);
  } catch (error) {
    console.error('briefing-operational error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';

    // Friendly rate limit message
    const isRateLimit = msg.includes('429') || msg.toLowerCase().includes('rate limit');
    const friendlyMsg = isRateLimit
      ? 'Asana data is temporarily unavailable due to rate limits. Please try again in a moment.'
      : msg;

    return jsonResponse(emptyPayload(friendlyMsg));
  }
});
