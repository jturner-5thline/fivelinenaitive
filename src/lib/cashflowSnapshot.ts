/**
 * Live snapshot of the weekly Cash Flow grid on /finance, handed to the
 * Copilot chat so Claude reads the exact figures on screen (the grid is
 * computed client-side and has no server-side equivalent).
 */
export interface CashflowSnapshot {
  weeks: string[]; // week-ending dates, in visible order
  currentWeek: string | null;
  rows: Array<{ label: string; values: number[] }>;
  thresholds?: { minimumLiquidity: number; caution: number };
}

let current: CashflowSnapshot | null = null;

export function setCashflowSnapshot(s: CashflowSnapshot | null) {
  current = s;
}

export function getCashflowSnapshot(): CashflowSnapshot | null {
  return current;
}

type WeeklyLike = Record<string, Record<string, unknown> | undefined>;

/** Slice the visible week window (weeksPast..weeksFuture around today) into a compact matrix. */
export function buildCashflowSnapshot(
  weekly: WeeklyLike,
  rowKeys: string[],
  weeksPast: number,
  weeksFuture: number,
  todayISO: string = new Date().toISOString().split('T')[0],
): CashflowSnapshot | null {
  const sorted = Object.entries(weekly || {}).sort(([a], [b]) => a.localeCompare(b));
  if (sorted.length === 0) return null;
  const weekOf = ([k, e]: [string, any]) => (typeof e?.week_ending === 'string' ? e.week_ending : k);
  let cur = sorted.findIndex((p) => weekOf(p as any) >= todayISO);
  if (cur < 0) cur = sorted.length - 1;
  const win = sorted.slice(Math.max(0, cur - Math.max(0, weeksPast)), Math.min(sorted.length, cur + 1 + Math.max(0, weeksFuture)));
  const rows = rowKeys
    .map((label) => ({
      label,
      values: win.map(([, e]) => {
        const v = Number((e as any)?.[label]);
        return Number.isFinite(v) ? Math.round(v) : 0;
      }),
    }))
    .filter((r) => r.values.some((v) => v !== 0));
  return { weeks: win.map((p) => weekOf(p as any)), currentWeek: weekOf(sorted[cur] as any), rows };
}

/** Render as a compact pipe table for the model prompt. */
export function formatCashflowSnapshot(s: CashflowSnapshot): string {
  const head = `Row | ${s.weeks.join(' | ')}`;
  const body = s.rows.map((r) => `${r.label} | ${r.values.join(' | ')}`).join('\n');
  return `${head}\n${body}`;
}
