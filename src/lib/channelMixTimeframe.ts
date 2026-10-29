/** Timeframe windows for the Channels donut, keyed on NDA / Needs List Sent entry date. */
export type ChannelMixTimeframe = 'current' | 'ytd' | '6m' | 'ttm';

export const CHANNEL_MIX_TIMEFRAMES: { value: ChannelMixTimeframe; label: string }[] = [
  { value: 'current', label: 'Current' },
  { value: 'ytd', label: 'YTD' },
  { value: '6m', label: '6M' },
  { value: 'ttm', label: 'TTM' },
];

export function channelMixWindow(
  tf: ChannelMixTimeframe,
  today: Date,
  current: { start: Date; end: Date } | null,
): { start: Date; end: Date } | null {
  const end = new Date(today);
  end.setHours(23, 59, 59, 999);
  if (tf === 'current') return current;
  if (tf === 'ytd') return { start: new Date(today.getFullYear(), 0, 1), end };
  const start = new Date(today.getFullYear(), today.getMonth() - (tf === '6m' ? 6 : 12), today.getDate());
  return { start, end };
}

export function ndaEnteredWithin(ndaEnteredAt: string | null | undefined, win: { start: Date; end: Date } | null): boolean {
  if (!win) return true;
  if (!ndaEnteredAt) return false;
  const t = new Date(ndaEnteredAt).getTime();
  return t >= win.start.getTime() && t <= win.end.getTime();
}
