import { create } from 'zustand';
import type { TeamData, RepData, ViewMode, TabName, CustomMember } from './salesModelTypes';
import { REPS_DATA, DEFAULT_ACTIVE_REPS, computeTeamData } from './salesModelData';

interface SalesModelState {
  activeTab: TabName;
  viewMode: ViewMode;
  sidebarOpen: boolean;
  chartsOpen: boolean;
  addMemberOpen: boolean;
  activeYears: Set<number>;
  activeQuarters: Set<string>;
  activeReps: string[];
  customMembers: CustomMember[];
  repsData: Record<string, RepData>;
  teamData: TeamData;

  setActiveTab: (tab: TabName) => void;
  setViewMode: (mode: ViewMode) => void;
  toggleSidebar: () => void;
  toggleCharts: () => void;
  setAddMemberOpen: (open: boolean) => void;
  toggleYear: (year: number) => void;
  toggleQuarter: (q: string) => void;
  addMember: (name: string, includeInTeam: boolean) => void;
  removeMember: (name: string) => void;
}

export const useSalesModelStore = create<SalesModelState>((set, get) => ({
  activeTab: 'TEAM',
  viewMode: 'monthly',
  sidebarOpen: true,
  chartsOpen: false,
  addMemberOpen: false,
  activeYears: new Set([2025, 2026, 2027]),
  activeQuarters: new Set(['Q1', 'Q2', 'Q3', 'Q4']),
  activeReps: [...DEFAULT_ACTIVE_REPS],
  customMembers: [],
  repsData: { ...REPS_DATA },
  teamData: computeTeamData(DEFAULT_ACTIVE_REPS, REPS_DATA),

  setActiveTab: (tab) => set({ activeTab: tab }),
  setViewMode: (mode) => set({ viewMode: mode }),
  toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
  toggleCharts: () => set(s => ({ chartsOpen: !s.chartsOpen })),
  setAddMemberOpen: (open) => set({ addMemberOpen: open }),
  toggleYear: (year) => set(s => {
    const next = new Set(s.activeYears);
    next.has(year) ? next.delete(year) : next.add(year);
    return { activeYears: next };
  }),
  toggleQuarter: (q) => set(s => {
    const next = new Set(s.activeQuarters);
    next.has(q) ? next.delete(q) : next.add(q);
    return { activeQuarters: next };
  }),
  addMember: (name, includeInTeam) => {
    const { buildRepData } = require('./salesModelData');
    // Create blank rep data
    const blankRep: RepData = {
      ...REPS_DATA.EMPLOYEE2,
      // Deep clone with zeros
      plan: Object.fromEntries(Object.entries(REPS_DATA.EMPLOYEE2.plan).map(([k, v]) => [k, new Array(36).fill(0)])) as any,
      revenue: Object.fromEntries(Object.entries(REPS_DATA.EMPLOYEE2.revenue).map(([k, v]) => [k, new Array(36).fill(0)])) as any,
      rep_cost: Object.fromEntries(Object.entries(REPS_DATA.EMPLOYEE2.rep_cost).map(([k, v]) => [k, new Array(36).fill(0)])) as any,
      net_rep_profit: new Array(36).fill(0),
      ttm_revenue: new Array(36).fill(0),
      ytd_revenue: new Array(36).fill(0),
      sidebar: { ...REPS_DATA.EMPLOYEE2.sidebar },
    };

    set(s => {
      const newRepsData = { ...s.repsData, [name]: blankRep };
      const newActiveReps = includeInTeam ? [...s.activeReps, name] : s.activeReps;
      const newCustom = [...s.customMembers, { name, includeInTeam, data: blankRep }];
      return {
        repsData: newRepsData,
        activeReps: newActiveReps,
        customMembers: newCustom,
        teamData: computeTeamData(newActiveReps, newRepsData),
        activeTab: name,
        addMemberOpen: false,
      };
    });
  },
  removeMember: (name) => {
    set(s => {
      const newRepsData = { ...s.repsData };
      delete newRepsData[name];
      const newActiveReps = s.activeReps.filter(n => n !== name);
      const newCustom = s.customMembers.filter(m => m.name !== name);
      return {
        repsData: newRepsData,
        activeReps: newActiveReps,
        customMembers: newCustom,
        teamData: computeTeamData(newActiveReps, newRepsData),
        activeTab: 'TEAM',
      };
    });
  },
}));
