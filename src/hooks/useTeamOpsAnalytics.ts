import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isExcludedDealName } from '@/utils/excludedDeals';

export interface TeamMemberStats {
  name: string;
  assigned: number;
  completed: number;
  rate: number; // 0..1
  overdueOpen: number;
}

export interface OverdueByDealRow {
  dealId: string;
  dealName: string;
  overdueCount: number;
  mostOverdueDays: number;
  assignees: string[];
}

export interface UpcomingMilestoneRow {
  id: string;
  title: string;
  dealId: string;
  dealName: string;
  dueDate: string;
  status: 'On Track' | 'At Risk' | 'Overdue';
}

export interface TeamOpsAnalytics {
  members: TeamMemberStats[];
  overdueByDeal: OverdueByDealRow[];
  upcomingMilestones: UpcomingMilestoneRow[];
  capacityAlert: string | null;
}

// Canonical team list (display name shown in UI)
const TEAM = [
  { name: 'James Turner', short: 'James', emails: ['jturner@5thline.co'] },
  { name: 'Niki Heikali', short: 'Niki', emails: ['nheikali@5thline.co'] },
  { name: 'Flor Fustinoni', short: 'Flor', emails: ['ffustinoni@5thline.co', 'ffustinoni@naitivefi.co'] },
  { name: 'Paz Piña', short: 'Paz', emails: ['ppina@5thline.co', 'paz@5thline.co'] },
  { name: 'McKenzie Clark', short: 'McKenzie', emails: ['mclark@5thline.co'] },
];

function startOfWeekMonday(d = new Date()): Date {
  const x = new Date(d);
  const day = x.getDay(); // 0 Sun..6 Sat
  const diff = (day === 0 ? -6 : 1 - day);
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysBetween(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / 86400000);
}

function matchTeamFromName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const n = raw.trim().toLowerCase();
  for (const t of TEAM) {
    if (n === t.name.toLowerCase()) return t.name;
    if (n.includes(t.short.toLowerCase())) return t.name;
  }
  return null;
}

export function useTeamOpsAnalytics() {
  return useQuery<TeamOpsAnalytics>({
    queryKey: ['team-ops-analytics'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const weekStart = startOfWeekMonday();
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const in30 = new Date(now.getTime() + 30 * 86400000);

      // Resolve team member ids in profiles + wf_users
      const [{ data: profiles }, { data: wfUsers }] = await Promise.all([
        supabase.from('profiles').select('id, display_name, first_name, last_name, email'),
        supabase.from('wf_users').select('id, name, email'),
      ]);

      const profileToTeam = new Map<string, string>();
      const wfToTeam = new Map<string, string>();
      (profiles || []).forEach((p: any) => {
        const dn = p.display_name || [p.first_name, p.last_name].filter(Boolean).join(' ');
        const m = matchTeamFromName(dn) || (p.email ? TEAM.find(t => t.emails.includes(p.email.toLowerCase()))?.name : null);
        if (m) profileToTeam.set(p.id, m);
      });
      (wfUsers || []).forEach((u: any) => {
        const m = matchTeamFromName(u.name) || (u.email ? TEAM.find(t => t.emails.includes(u.email.toLowerCase()))?.name : null);
        if (m) wfToTeam.set(u.id, m);
      });

      // Pull tasks (CRM) and wf_tasks in parallel
      const [{ data: crmTasks }, { data: wfTasksOpen }, { data: wfTasksDoneThisWeek }, { data: wfTasksCreatedThisWeek }] = await Promise.all([
        supabase
          .from('tasks')
          .select('id, deal_id, title, due_date, status, completed_at, created_at, assigned_to, archived_at')
          .is('archived_at', null),
        supabase
          .from('wf_tasks')
          .select('id, deal_id, title, due_at, status, assignee_id, created_at, updated_at')
          .eq('status', 'open'),
        supabase
          .from('wf_tasks')
          .select('id, assignee_id, status, updated_at, created_at')
          .eq('status', 'done')
          .gte('updated_at', weekStart.toISOString()),
        supabase
          .from('wf_tasks')
          .select('id, assignee_id, created_at')
          .gte('created_at', weekStart.toISOString()),
      ]);

      // Per-member stats
      const stats = new Map<string, TeamMemberStats>();
      TEAM.forEach(t => stats.set(t.name, { name: t.name, assigned: 0, completed: 0, rate: 0, overdueOpen: 0 }));

      const bumpAssigned = (name: string) => { const s = stats.get(name); if (s) s.assigned += 1; };
      const bumpCompleted = (name: string) => { const s = stats.get(name); if (s) s.completed += 1; };
      const bumpOverdue = (name: string) => { const s = stats.get(name); if (s) s.overdueOpen += 1; };

      // CRM tasks
      (crmTasks || []).forEach((t: any) => {
        const member = t.assigned_to ? profileToTeam.get(t.assigned_to) : null;
        if (!member) return;
        if (t.created_at && new Date(t.created_at) >= weekStart) bumpAssigned(member);
        if (t.status === 'complete' && t.completed_at && new Date(t.completed_at) >= weekStart) bumpCompleted(member);
        if (t.status !== 'complete' && t.due_date && t.due_date < todayStr) bumpOverdue(member);
      });
      // wf_tasks
      (wfTasksOpen || []).forEach((t: any) => {
        const member = t.assignee_id ? wfToTeam.get(t.assignee_id) : null;
        if (!member) return;
        if (t.due_at && new Date(t.due_at) < now) bumpOverdue(member);
      });
      (wfTasksCreatedThisWeek || []).forEach((t: any) => {
        const member = t.assignee_id ? wfToTeam.get(t.assignee_id) : null;
        if (!member) return;
        bumpAssigned(member);
      });
      (wfTasksDoneThisWeek || []).forEach((t: any) => {
        const member = t.assignee_id ? wfToTeam.get(t.assignee_id) : null;
        if (!member) return;
        bumpCompleted(member);
      });

      const members = Array.from(stats.values()).map(s => ({
        ...s,
        rate: s.assigned > 0 ? s.completed / s.assigned : 0,
      }));

      // Overdue by deal — use both task sources
      const dealIds = Array.from(new Set([
        ...((crmTasks || []).map((t: any) => t.deal_id).filter(Boolean) as string[]),
        ...((wfTasksOpen || []).map((t: any) => t.deal_id).filter(Boolean) as string[]),
      ]));
      const [{ data: deals }, { data: wfDeals }] = await Promise.all([
        dealIds.length
          ? supabase.from('deals').select('id, company').in('id', dealIds)
          : Promise.resolve({ data: [] as any[] }),
        dealIds.length
          ? supabase.from('wf_deals').select('id, name').in('id', dealIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const dealNameById = new Map<string, string>();
      (deals || []).forEach((d: any) => dealNameById.set(d.id, d.company || ''));
      (wfDeals || []).forEach((d: any) => { if (!dealNameById.has(d.id)) dealNameById.set(d.id, d.name || ''); });

      const dealAgg = new Map<string, { count: number; oldest: number; assignees: Set<string> }>();
      const accumOverdue = (dealId: string | null, due: Date | null, assigneeName: string | null) => {
        if (!dealId || !due) return;
        const name = dealNameById.get(dealId);
        if (!name || isExcludedDealName(name)) return;
        const days = Math.max(0, daysBetween(now, due));
        const cur = dealAgg.get(dealId) || { count: 0, oldest: 0, assignees: new Set<string>() };
        cur.count += 1;
        if (days > cur.oldest) cur.oldest = days;
        if (assigneeName) cur.assignees.add(assigneeName);
        dealAgg.set(dealId, cur);
      };
      (crmTasks || []).forEach((t: any) => {
        if (t.status === 'complete') return;
        if (!t.due_date || t.due_date >= todayStr) return;
        const member = t.assigned_to ? profileToTeam.get(t.assigned_to) : null;
        accumOverdue(t.deal_id, new Date(t.due_date), member);
      });
      (wfTasksOpen || []).forEach((t: any) => {
        if (!t.due_at || new Date(t.due_at) >= now) return;
        const member = t.assignee_id ? wfToTeam.get(t.assignee_id) : null;
        accumOverdue(t.deal_id, new Date(t.due_at), member);
      });

      const overdueByDeal: OverdueByDealRow[] = Array.from(dealAgg.entries())
        .map(([dealId, v]) => ({
          dealId,
          dealName: dealNameById.get(dealId) || 'Untitled deal',
          overdueCount: v.count,
          mostOverdueDays: v.oldest,
          assignees: Array.from(v.assignees),
        }))
        .sort((a, b) => b.overdueCount - a.overdueCount)
        .slice(0, 25);

      // Upcoming milestones (next 30 days) from deal_milestones
      const { data: milestones } = await supabase
        .from('deal_milestones')
        .select('id, title, due_date, completed, status, deals!inner(id, company, status, deal_class)')
        .eq('completed', false)
        .lte('due_date', in30.toISOString())
        .order('due_date', { ascending: true });

      const upcomingMilestones: UpcomingMilestoneRow[] = (milestones || [])
        .map((m: any) => {
          const deal = m.deals;
          if (!deal || isExcludedDealName(deal.company)) return null;
          const due = m.due_date ? new Date(m.due_date) : null;
          if (!due) return null;
          let status: UpcomingMilestoneRow['status'] = 'On Track';
          if (due < now) status = 'Overdue';
          else if (m.status === 'at_risk' || m.status === 'off_track') status = 'At Risk';
          return {
            id: m.id,
            title: m.title,
            dealId: deal.id,
            dealName: deal.company || 'Untitled',
            dueDate: m.due_date,
            status,
          };
        })
        .filter(Boolean) as UpcomingMilestoneRow[];

      // Capacity alert — flag a member with significantly more overdue than the team avg
      let capacityAlert: string | null = null;
      const overdueArr = members.map(m => m.overdueOpen);
      if (overdueArr.length > 0) {
        const max = Math.max(...overdueArr);
        const top = members.find(m => m.overdueOpen === max);
        const others = overdueArr.filter(v => v !== max);
        const othersAvg = others.length ? others.reduce((a, b) => a + b, 0) / others.length : 0;
        if (top && max >= 5 && (max >= othersAvg * 2 || max - othersAvg >= 4)) {
          const short = TEAM.find(t => t.name === top.name)?.short || top.name;
          capacityAlert = `${short} has ${max} overdue tasks — the most on the team. Consider redistributing before adding new assignments.`;
        }
      }

      return { members, overdueByDeal, upcomingMilestones, capacityAlert };
    },
  });
}
