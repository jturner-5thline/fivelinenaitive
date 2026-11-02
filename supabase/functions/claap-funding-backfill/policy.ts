export function fourYearStart(now = new Date()): string {
  const start = new Date(now);
  start.setUTCFullYear(start.getUTCFullYear() - 4);
  return start.toISOString();
}

export function retryAt(attempt: number, now = new Date()): string {
  return new Date(now.getTime() + Math.min(24, 2 ** Math.min(attempt, 5)) * 3_600_000).toISOString();
}

export function parsePage(payload: Record<string, any>) {
  const node = payload.result ?? payload;
  const rows = node.recordings ?? payload.recordings ?? payload.data;
  if (!Array.isArray(rows)) throw new Error('Unexpected Claap recording list response');
  const paging = node.pagination ?? payload.pagination ?? {};
  const cursor = paging.nextCursor ?? paging.next_cursor ?? node.nextCursor ?? node.next_cursor ?? payload.nextCursor ?? payload.next_cursor;
  return { rows, cursor: typeof cursor === 'string' && cursor ? cursor : null };
}

export function inWindow(date: unknown, start: string, end: string): boolean {
  const value = typeof date === 'string' ? Date.parse(date) : NaN;
  return Number.isFinite(value) && value >= Date.parse(start) && value <= Date.parse(end);
}