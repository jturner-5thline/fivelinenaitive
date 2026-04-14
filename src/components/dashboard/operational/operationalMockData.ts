// Mock data matching the Asana Projects Dashboard source layout.
// Architected so each field maps to a future live Naitive entity.

export interface OperationalKPI {
  label: string;
  value: string;
  description: string;
}

export interface MilestoneOwnership {
  assignee: string;
  count: number;
}

export interface OverdueBucket {
  project: string;
  count: number;
}

export interface ProjectOverviewBucket {
  bucket: string;
  onTrack: number;
  atRisk: number;
  offTrack: number;
}

export interface ProjectStatusSlice {
  status: string;
  count: number;
  color: string;
}

export interface ProjectsDueBucket {
  bucket: string;
  count: number;
}

// ── KPI cards ──────────────────────────────────────────────────
export const MOCK_KPIS: OperationalKPI[] = [
  { label: 'Milestones Next 2 Weeks', value: '10', description: 'Open milestones due within 14 days' },
  { label: 'Overdue Milestones', value: '8', description: 'Incomplete milestones past due' },
  { label: 'Avg. Time to Comp. Milestone', value: '35.78 d', description: 'Avg duration open → completed' },
  { label: 'Completed Projects', value: '3', description: 'Projects with completed status' },
];

// ── Chart 1: This Week's Milestones (pie) ──────────────────────
export const MOCK_MILESTONE_OWNERSHIP: MilestoneOwnership[] = [
  { assignee: 'John Moffitt', count: 4 },
  { assignee: 'James Turner', count: 2 },
];

// ── Chart 2: Overdue Milestones (bar) ──────────────────────────
export const MOCK_OVERDUE_BUCKETS: OverdueBucket[] = [
  { project: 'Debt Advisory', count: 2 },
  { project: 'FinServ Ops', count: 1 },
];

// ── Chart 3: Projects Overview (grouped bar) ───────────────────
export const MOCK_PROJECT_OVERVIEW: ProjectOverviewBucket[] = [
  { bucket: 'Client Engagements', onTrack: 0, atRisk: 1, offTrack: 0 },
  { bucket: 'Internal Ops', onTrack: 1, atRisk: 0, offTrack: 0 },
  { bucket: 'Strategic', onTrack: 1, atRisk: 0, offTrack: 0 },
];

// ── Chart 4: Projects by Status (pie) ──────────────────────────
export const MOCK_PROJECT_STATUS: ProjectStatusSlice[] = [
  { status: 'On track', count: 7, color: 'hsl(var(--success))' },
  { status: 'At risk', count: 1, color: 'hsl(45, 93%, 47%)' },
  { status: 'On hold', count: 2, color: 'hsl(var(--muted-foreground))' },
];

// ── Chart 5: Projects Due within Next 2 Weeks (bar) ────────────
export const MOCK_PROJECTS_DUE: ProjectsDueBucket[] = [
  { bucket: 'Active Portfolio', count: 1 },
];
