/**
 * Account-wide Deal Space widget layout (order + preset sizes).
 * Pure helpers so the rules are unit-testable.
 */
export type DealGridWidgetId =
  | 'actions'
  | 'tasks'
  | 'milestonesCalendar'
  | 'fundingMix'
  | 'activityChart'
  | 'dealInfo'
  | 'hoursFees'
  | 'finserv';

export type DealGridWidth = 'sm' | 'md' | 'lg' | 'full';
export type DealGridHeight = 'auto' | 'compact' | 'standard' | 'tall';

export interface DealGridItem {
  id: DealGridWidgetId;
  w: DealGridWidth;
  h: DealGridHeight;
}

export const DEAL_GRID_LABELS: Record<DealGridWidgetId, string> = {
  actions: 'Deal Actions',
  tasks: 'Tasks & Open Items',
  milestonesCalendar: 'Milestones & Calendar',
  fundingMix: 'Funding Source Mix',
  activityChart: 'Activity',
  dealInfo: 'Deal Info',
  hoursFees: 'Hours & Fees',
  finserv: 'Projects',
};

/** Columns spanned in a 6-column grid. */
export const WIDTH_SPAN: Record<DealGridWidth, number> = { sm: 2, md: 3, lg: 4, full: 6 };
export const WIDTH_LABELS: Record<DealGridWidth, string> = { sm: 'Small (⅓)', md: 'Half (½)', lg: 'Large (⅔)', full: 'Full width' };
/** Pixel heights; null = natural height. */
export const HEIGHT_PX: Record<DealGridHeight, number | null> = { auto: null, compact: 320, standard: 480, tall: 720 };
export const HEIGHT_LABELS: Record<DealGridHeight, string> = { auto: 'Auto', compact: 'Compact', standard: 'Standard', tall: 'Tall' };

export const DEFAULT_DEAL_GRID: DealGridItem[] = [
  { id: 'tasks', w: 'md', h: 'auto' },
  { id: 'actions', w: 'md', h: 'auto' },
  { id: 'activityChart', w: 'md', h: 'auto' },
  { id: 'milestonesCalendar', w: 'md', h: 'auto' },
  { id: 'fundingMix', w: 'md', h: 'auto' },
  { id: 'dealInfo', w: 'md', h: 'auto' },
  { id: 'hoursFees', w: 'md', h: 'auto' },
  { id: 'finserv', w: 'md', h: 'auto' },
];

const IDS = DEFAULT_DEAL_GRID.map((d) => d.id);
const WIDTHS = Object.keys(WIDTH_SPAN) as DealGridWidth[];
const HEIGHTS = Object.keys(HEIGHT_PX) as DealGridHeight[];

/** Keep valid saved items in order, fix bad sizes, append any missing widgets. */
export function normalizeDealGrid(raw: unknown): DealGridItem[] {
  const out: DealGridItem[] = [];
  if (Array.isArray(raw)) {
    for (const r of raw as Array<Partial<DealGridItem>>) {
      if (!r || !IDS.includes(r.id as DealGridWidgetId)) continue;
      if (out.some((o) => o.id === r.id)) continue;
      const def = DEFAULT_DEAL_GRID.find((d) => d.id === r.id)!;
      out.push({
        id: r.id as DealGridWidgetId,
        w: WIDTHS.includes(r.w as DealGridWidth) ? (r.w as DealGridWidth) : def.w,
        h: HEIGHTS.includes(r.h as DealGridHeight) ? (r.h as DealGridHeight) : def.h,
      });
    }
  }
  for (const d of DEFAULT_DEAL_GRID) if (!out.some((o) => o.id === d.id)) out.push({ ...d });
  return out;
}

export function moveDealGridItem(items: DealGridItem[], fromId: string, toId: string): DealGridItem[] {
  const from = items.findIndex((i) => i.id === fromId);
  const to = items.findIndex((i) => i.id === toId);
  if (from < 0 || to < 0 || from === to) return items;
  const next = [...items];
  const [m] = next.splice(from, 1);
  next.splice(to, 0, m);
  return next;
}

export function resizeDealGridItem(items: DealGridItem[], id: DealGridWidgetId, patch: Partial<Pick<DealGridItem, 'w' | 'h'>>): DealGridItem[] {
  return items.map((i) => (i.id === id ? { ...i, ...patch } : i));
}
