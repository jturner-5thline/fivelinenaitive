import { useMemo } from 'react';
import { startOfWeek, endOfWeek, parseISO, isAfter, isBefore } from 'date-fns';

export interface AsanaTeamMember {
  name: string;
  assigned: number;     // open + completed this week (any task touched/dued/completed this week)
  completed: number;    // completed this week
  rate: number;
  overdueOpen: number;  // currently overdue
}

export interface AsanaProjectOverdueRow {
  projectGid: string;
  projectName: string;
  overdueCount: number;
  mostOverdueDays: number;
  assignees: string[];
}

export interface AsanaOpsTeamMetrics {
  members: AsanaTeamMember[];
  overdueByProject: AsanaProjectOverdueRow[];
  capacityAlert: string | null;
}

// Canonical team list — names should match the Asana assignee `name` field.
const TEAM = [
  { name: 'James Turner', short: 'James', aliases: ['james turner', 'james'] },
  { name: 'Niki Heikali', short: 'Niki', aliases: ['niki heikali', 'niki'] },
  { name: 'Flor Fustinoni', short: 'Flor', aliases: ['flor fustinoni', 'flor'] },
  { name: 'Paz Piña', short: 'Paz', aliases: ['paz piña', 'paz pina', 'paz'] },
  { name: 'McKenzie Clark', short: 'McKenzie', aliases: ['mckenzie clark', 'mckenzie'] },
];

function canonicalize(asanaName: string | null): string | null {
  if (!asanaName) return null;
  const lower = asanaName.trim().toLowerCase();
  for (const m of TEAM) {
    if (m.aliases.some(a => lower === a || lower.startsWith(a + ' ') || lower.includes(a))) {
      return m.name;
    }
  }
  return null;
}

interface AsanaOpsTask {
  assignee: string | null;
  due_on: string | null;
  completed: boolean;
  completed_at: string | null;
  days_overdue: number;
  project_gid: string;
  project_name: string;
}

interface OperationalLike {
  overdue?: AsanaOpsTask[];
  today?: AsanaOpsTask[];
  upcoming?: AsanaOpsTask[];
  recentlyCompleted?: AsanaOpsTask[];
}

/**
 * Derives Team Completion and Overdue-by-Project metrics directly from the
 * Asana portfolio payload returned by `briefing-operational`.
 *
 * No CRM/wf_tasks/deal_milestones inputs.
 */
export function useAsanaOpsTeamMetrics(data: OperationalLike | null): AsanaOpsTeamMetrics {
  return useMemo(() => {
    const empty: AsanaOpsTeamMetrics = {
      members: TEAM.map(t => ({ name: t.name, assigned: 0, completed: 0, rate: 0, overdueOpen: 0 })),
      overdueByProject: [],
      capacityAlert: null,
    };
    if (!data) return empty;

    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

    const open = [...(data.overdue ?? []), ...(data.today ?? []), ...(data.upcoming ?? [])];
    const completed = data.recentlyCompleted ?? [];

    const stats = new Map<string, { assigned: number; completed: number; overdueOpen: number }>();
    TEAM.forEach(m => stats.set(m.name, { assigned: 0, completed: 0, overdueOpen: 0 }));

    // Open tasks "assigned this week" = due within current week
    open.forEach(t => {
      const member = canonicalize(t.assignee);
      if (!member) return;
      const s = stats.get(member)!;
      if (t.days_overdue && t.days_overdue > 0) s.overdueOpen += 1;
      if (t.due_on) {
        const due = parseISO(t.due_on);
        if (!isBefore(due, weekStart) && !isAfter(due, weekEnd)) {
          s.assigned += 1;
        }
      }
    });

    // Completed this week: due in week OR completed in week
    completed.forEach(t => {
      const member = canonicalize(t.assignee);
      if (!member || !t.completed_at) return;
      const completedAt = parseISO(t.completed_at);
      const inWeek = !isBefore(completedAt, weekStart) && !isAfter(completedAt, weekEnd);
      if (inWeek) {
        const s = stats.get(member)!;
        s.completed += 1;
        s.assigned += 1;
      }
    });

    const members: AsanaTeamMember[] = TEAM.map(t => {
      const s = stats.get(t.name)!;
      return {
        name: t.name,
        assigned: s.assigned,
        completed: s.completed,
        rate: s.assigned > 0 ? s.completed / s.assigned : 0,
        overdueOpen: s.overdueOpen,
      };
    });

    // Overdue by project (from Asana overdue list)
    const projMap = new Map<string, { name: string; count: number; oldest: number; assignees: Set<string> }>();
    (data.overdue ?? []).forEach(t => {
      if (!t.project_gid) return;
      if (!projMap.has(t.project_gid)) {
        projMap.set(t.project_gid, { name: t.project_name || 'Untitled project', count: 0, oldest: 0, assignees: new Set() });
      }
      const p = projMap.get(t.project_gid)!;
      p.count += 1;
      if (t.days_overdue > p.oldest) p.oldest = t.days_overdue;
      if (t.assignee) p.assignees.add(t.assignee);
    });
    const overdueByProject = Array.from(projMap.entries())
      .map(([gid, v]) => ({
        projectGid: gid,
        projectName: v.name,
        overdueCount: v.count,
        mostOverdueDays: v.oldest,
        assignees: Array.from(v.assignees),
      }))
      .sort((a, b) => b.overdueCount - a.overdueCount)
      .slice(0, 25);

    // Capacity alert
    let capacityAlert: string | null = null;
    const overdueArr = members.map(m => m.overdueOpen);
    const max = Math.max(0, ...overdueArr);
    const top = members.find(m => m.overdueOpen === max);
    const others = overdueArr.filter(v => v !== max);
    const othersAvg = others.length ? others.reduce((a, b) => a + b, 0) / others.length : 0;
    if (top && max >= 5 && (max >= othersAvg * 2 || max - othersAvg >= 4)) {
      const short = TEAM.find(t => t.name === top.name)?.short || top.name;
      capacityAlert = `${short} has ${max} overdue Asana tasks — the most on the team. Consider redistributing before adding new assignments.`;
    }

    return { members, overdueByProject, capacityAlert };
  }, [data]);
}
